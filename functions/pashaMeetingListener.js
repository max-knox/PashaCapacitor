// pashaMeetingListener.js
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const speech = require('@google-cloud/speech').v1p1beta1;
const { Writable } = require('stream');
const { VertexAI } = require('@google-cloud/vertexai');
const fs = require('fs').promises;

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const bucket = admin.storage().bucket('pa-sha.appspot.com');
const speechClient = new speech.SpeechClient();
const vertexAI = new VertexAI({ project: 'pa-sha', location: 'us-central1' });

const meetingStreams = new Map();

// Create a lightweight ping endpoint for connectivity checks
exports.ping = functions.https.onRequest((req, res) => {
  res.status(200).send({ 
    status: 'ok', 
    timestamp: Date.now(),
    server: 'pasha-meeting-processor' 
  });
});

exports.pashameetinglistener = functions.runWith({
  timeoutSeconds: 540,
  memory: '2GB'
}).https.onRequest(async (req, res) => {
  try {
    // Check if it's a ping request (for connectivity checks)
    if (req.method === 'GET' && req.path === '/ping') {
      res.status(200).send('pong');
      return;
    }
    
    // Validate request body
    if (!req.body || !req.body.data) {
      res.status(400).json({ error: 'Invalid request format' });
      return;
    }
    
    const { meetingId, audioContent, isLastChunk, secondaryAudioUrl, isSecondaryProcessing, retryCount, clientTimestamp } = req.body.data;

    // Log client metadata if provided (helps with debugging)
    if (clientTimestamp) {
      const serverTime = Date.now();
      const timeDiff = serverTime - clientTimestamp;
      console.log(`Client-server time difference: ${timeDiff}ms, Client timestamp: ${new Date(clientTimestamp).toISOString()}`);
    }
    
    // Handle secondary audio processing separately
    if (isSecondaryProcessing) {
      try {
        if (!secondaryAudioUrl) {
          throw new Error('Secondary audio URL is required for processing');
        }
        
        if (retryCount) {
          console.log(`Processing retry attempt ${retryCount} for meeting: ${meetingId}`);
        }
        
        await processSecondaryAudio(meetingId, secondaryAudioUrl);
        res.json({ message: 'Secondary audio processing completed' });
      } catch (error) {
        console.error(`Secondary processing error (retry ${retryCount || 0}):`, error);
        res.status(500).json({ error: `Secondary processing failed: ${error.message}` });
      }
      return;
    }
    
    // Regular streaming audio processing
    console.log(`Received audio for meeting: ${meetingId}`);
    console.log(`Audio content length: ${audioContent ? audioContent.length : 'N/A'}`);
    console.log(`Is last chunk: ${isLastChunk}`);

    // Validate audio content
    if (!audioContent && !isLastChunk) {
      throw new Error('No audio content provided and not last chunk');
    }

    // Get or create stream for this meeting
    let streamInfo = meetingStreams.get(meetingId);
    
    // Create new stream or restart if there was an error
    if (!streamInfo || streamInfo.hasError) {
      if (streamInfo && streamInfo.hasError) {
        console.log(`Recreating stream for meeting ${meetingId} after error`);
        try {
          // Try to clean up old stream
          if (streamInfo.audioInputStreamTransform) {
            streamInfo.audioInputStreamTransform.end();
          }
          if (streamInfo.recognizeStream) {
            streamInfo.recognizeStream.end();
          }
          if (streamInfo.keepAliveInterval) {
            clearInterval(streamInfo.keepAliveInterval);
          }
        } catch (cleanupError) {
          console.warn(`Error cleaning up old stream: ${cleanupError.message}`);
        }
      }
      
      streamInfo = createNewStream(meetingId);
      meetingStreams.set(meetingId, streamInfo);
      
      // Set up keep-alive ping to prevent timeout
      streamInfo.keepAliveInterval = setInterval(() => {
        if (streamInfo.audioInputStreamTransform && !streamInfo.hasError) {
          try {
            // Send an empty buffer to keep the stream active
            const emptyBuffer = Buffer.alloc(2);
            streamInfo.audioInputStreamTransform.write(emptyBuffer);
            console.log(`Sent keep-alive for meeting: ${meetingId}`);
          } catch (error) {
            console.warn(`Error sending keep-alive: ${error.message}`);
          }
        }
      }, 5000); // Send keep-alive every 5 seconds
    }

    // Reset the audio inactivity timer
    if (streamInfo.audioInactivityTimeout) {
      clearTimeout(streamInfo.audioInactivityTimeout);
    }
    
    // Set a new inactivity timeout (30 seconds)
    streamInfo.audioInactivityTimeout = setTimeout(() => {
      console.log(`Audio inactivity timeout for meeting: ${meetingId}`);
      // No audio for 30 seconds - mark stream as having an error
      streamInfo.hasError = true;
      
      // Clean up resources
      if (streamInfo.keepAliveInterval) {
        clearInterval(streamInfo.keepAliveInterval);
      }
    }, 30000);

    // Process the audio chunk
    if (audioContent) {
      try {
        await new Promise((resolve, reject) => {
          if (!streamInfo.audioInputStreamTransform || streamInfo.hasError) {
            reject(new Error('Stream is not active'));
            return;
          }
          
          streamInfo.audioInputStreamTransform.write(Buffer.from(audioContent, 'base64'), (error) => {
            if (error) reject(error);
            else resolve();
          });
        });
      } catch (writeError) {
        console.error(`Error writing to stream: ${writeError.message}`);
        streamInfo.hasError = true;
        // Try to recreate the stream on next request
        res.status(500).json({ error: 'Error processing audio chunk', retryable: true });
        return;
      }
    }

    // Handle last chunk and finalize processing
    if (isLastChunk) {
      console.log(`Ending stream for meeting: ${meetingId}`);
      
      if (streamInfo.audioInactivityTimeout) {
        clearTimeout(streamInfo.audioInactivityTimeout);
      }
      
      if (streamInfo.keepAliveInterval) {
        clearInterval(streamInfo.keepAliveInterval);
      }
      
      try {
        await new Promise(resolve => streamInfo.audioInputStreamTransform.end(resolve));
        
        await new Promise(resolve => {
          streamInfo.recognizeStream.on('end', resolve);
          streamInfo.recognizeStream.end();
        });
      } catch (endError) {
        console.warn(`Error ending stream: ${endError.message}`);
      }
      
      meetingStreams.delete(meetingId);

      const endTime = new Date().toISOString();
      await db.collection('meetings').doc(meetingId).update({ endTime });

      // Process the transcript
      await processTranscriptWithVertexAI(meetingId, endTime);
      
      res.json({ message: 'Audio processing completed' });
    } else {
      res.json({ message: 'Audio chunk received' });
    }
  } catch (error) {
    console.error('Error in audio reception:', error);
    res.status(500).json({ 
      error: `An error occurred: ${error.message}`,
      retryable: error.message.includes('timeout') || error.message.includes('stream')
    });
  }
});

async function processSecondaryAudio(meetingId, audioUrl) {
  try {
    console.log(`Starting secondary audio processing for meeting: ${meetingId}`);
    console.log(`Audio URL: ${audioUrl}`);
    
    // Update meeting status in Firestore
    await db.collection('meetings').doc(meetingId).update({
      processingStatus: 'processing',
      secondaryProcessingStartTime: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Download the audio file with retries
    const tempFilePath = `/tmp/${meetingId}_secondary.webm`;
    const maxRetries = 3;
    let downloadSuccess = false;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Downloading audio file, attempt ${attempt}/${maxRetries}`);
        await bucket.file(audioUrl).download({ destination: tempFilePath });
        downloadSuccess = true;
        break;
      } catch (downloadError) {
        console.error(`Download attempt ${attempt} failed:`, downloadError);
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, attempt * 2000)); // Exponential backoff
        } else {
          throw new Error(`Failed to download audio after ${maxRetries} attempts: ${downloadError.message}`);
        }
      }
    }
    
    if (!downloadSuccess) {
      throw new Error('Failed to download audio file');
    }
    
    // Check file size to avoid memory issues
    const fileStats = await fs.stat(tempFilePath);
    const fileSizeMB = fileStats.size / (1024 * 1024);
    console.log(`Downloaded audio file size: ${fileSizeMB.toFixed(2)} MB`);
    
    let transcript = '';
    
    if (fileSizeMB > 10) {
      // For larger files, use streaming recognition
      console.log('Using streaming recognition for large file');
      transcript = await processLargeAudioFile(tempFilePath);
    } else {
      // For smaller files, use standard recognition
      console.log('Using standard recognition');
      const [transcriptionResult] = await speechClient.recognize({
        audio: { content: await fs.readFile(tempFilePath) },
        config: {
          encoding: 'WEBM_OPUS',
          sampleRateHertz: 48000,
          languageCode: 'en-US',
          enableAutomaticPunctuation: true,
          model: 'latest_long',
          useEnhanced: true,
        },
      });

      transcript = transcriptionResult.results
        .map(result => result.alternatives[0].transcript)
        .join('\n');
    }
    
    console.log(`Transcription complete, length: ${transcript.length} characters`);
    
    // Store raw transcript for backup
    await db.collection('meetings').doc(meetingId).update({
      rawSecondaryTranscript: transcript,
      processingStatus: 'summarizing'
    });
    
    // Process transcript with Vertex AI
    await processTranscriptWithVertexAI(meetingId, new Date().toISOString(), transcript, true);
    
    // Clean up temp file
    await fs.unlink(tempFilePath);
    console.log(`Completed secondary audio processing for meeting: ${meetingId}`);
    
  } catch (error) {
    console.error(`Error in processSecondaryAudio for meeting ${meetingId}:`, error);
    
    // Update meeting with error information
    try {
      await db.collection('meetings').doc(meetingId).update({
        processingStatus: 'error', 
        processingError: `Secondary processing error: ${error.message}`,
        needsManualProcessing: true,
        processingErrorTimestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (updateError) {
      console.error('Failed to update meeting with error status:', updateError);
    }
    
    // Re-throw the error to be handled by the caller
    throw error;
  }
}

// Helper function for processing large audio files
async function processLargeAudioFile(filePath) {
  return new Promise((resolve, reject) => {
    const audioFile = fs.createReadStream(filePath);
    const recognizeStream = speechClient.streamingRecognize({
      config: {
        encoding: 'WEBM_OPUS',
        sampleRateHertz: 48000,
        languageCode: 'en-US',
        enableAutomaticPunctuation: true,
        model: 'latest_long',
        useEnhanced: true
      }
    });
    
    let transcriptParts = [];
    
    recognizeStream.on('error', error => {
      console.error('Error in large file transcription:', error);
      reject(error);
    });
    
    recognizeStream.on('data', data => {
      if (data.results[0] && data.results[0].alternatives[0]) {
        transcriptParts.push(data.results[0].alternatives[0].transcript);
      }
    });
    
    recognizeStream.on('end', () => {
      resolve(transcriptParts.join('\n'));
    });
    
    audioFile.pipe(recognizeStream);
    
    audioFile.on('error', error => {
      console.error('Error reading audio file:', error);
      reject(error);
    });
  });
}

function createNewStream(meetingId) {
  // Create the speech recognition stream with enhanced configuration
  const recognizeStream = speechClient.streamingRecognize({
    config: {
      encoding: 'WEBM_OPUS',
      sampleRateHertz: 48000,
      languageCode: 'en-US',
      enableAutomaticPunctuation: true,
      model: 'latest_long',
      useEnhanced: true,
      // Add these options to improve streaming reliability
      enableSpeakerDiarization: false,  // Unless speaker detection is needed
      maxAlternatives: 1, // Only need one alternative
      profanityFilter: false, // Unless profanity filter is needed
      // Important: Set timeouts to be more lenient
      speechContexts: [{
        phrases: ['meeting', 'schedule', 'discussion', 'follow up', 'action item']
      }]
    },
    interimResults: false,
  });

  // Stream object with error tracking
  const streamInfo = {
    recognizeStream,
    hasError: false,
    keepAliveInterval: null,
    audioInactivityTimeout: null,
    lastActivity: Date.now()
  };

  // Error handler for the recognize stream
  recognizeStream.on('error', (error) => {
    console.error(`Streaming transcription error for meeting ${meetingId}:`, error);
    
    // Mark this stream as having an error, but don't delete it yet
    // This allows the next request to create a fresh stream
    const existingStream = meetingStreams.get(meetingId);
    if (existingStream) {
      existingStream.hasError = true;
      
      // Clear any intervals
      if (existingStream.keepAliveInterval) {
        clearInterval(existingStream.keepAliveInterval);
      }
      if (existingStream.audioInactivityTimeout) {
        clearTimeout(existingStream.audioInactivityTimeout);
      }
    }
    
    // Log the detailed error to help with debugging
    console.log(`Stream error details - meetingId: ${meetingId}, errorCode: ${error.code}, errorName: ${error.name}`);
    
    // For specific error codes, we can take specific actions
    if (error.code === 11) { // Audio timeout error
      console.log('Audio timeout detected - will restart stream on next chunk');
    }
  });

  // Data handler for the recognize stream
  recognizeStream.on('data', async (data) => {
    try {
      streamInfo.lastActivity = Date.now();
      
      if (data.results[0] && data.results[0].alternatives[0]) {
        const transcription = data.results[0].alternatives[0].transcript;
        await appendTranscription(meetingId, transcription);
      }
    } catch (error) {
      console.error(`Error processing transcription data for meeting ${meetingId}:`, error);
    }
  });

  // Create the audio input stream transform with better error handling
  const audioInputStreamTransform = new Writable({
    write(chunk, encoding, next) {
      try {
        if (recognizeStream.writable && !streamInfo.hasError) {
          recognizeStream.write(chunk);
          streamInfo.lastActivity = Date.now();
        } else if (streamInfo.hasError) {
          // Don't write to a stream that has errors
          console.log(`Skipping write to errored stream for meeting ${meetingId}`);
        }
        next();
      } catch (error) {
        console.error(`Error writing to recognize stream for meeting ${meetingId}:`, error);
        streamInfo.hasError = true;
        next(error);
      }
    },
    final(callback) {
      try {
        if (recognizeStream.writable && !streamInfo.hasError) {
          recognizeStream.end();
        }
        callback();
      } catch (error) {
        console.error(`Error ending recognize stream for meeting ${meetingId}:`, error);
        callback(error);
      }
    },
  });

  streamInfo.audioInputStreamTransform = audioInputStreamTransform;
  return streamInfo;
}

async function appendTranscription(meetingId, transcription) {
  const meetingRef = db.collection('meetings').doc(meetingId);
  await db.runTransaction(async (transaction) => {
    const doc = await transaction.get(meetingRef);
    if (!doc.exists) {
      transaction.set(meetingRef, { transcript: [transcription.trim()] });
    } else {
      const existingTranscript = doc.data().transcript || [];
      if (existingTranscript[existingTranscript.length - 1] !== transcription.trim()) {
        transaction.update(meetingRef, {
          transcript: admin.firestore.FieldValue.arrayUnion(transcription.trim())
        });
      }
    }
  });
  console.log(`Transcription appended for meeting: ${meetingId}`);
}

async function processTranscriptWithVertexAI(meetingId, endTime, transcript, isSecondary = false) {
  const meetingRef = db.collection('meetings').doc(meetingId);
  
  try {
    const doc = await meetingRef.get();
    
    if (!doc.exists) {
      console.error(`Meeting ${meetingId} not found`);
      return;
    }

    const meeting = doc.data();
    
    if ((isSecondary && meeting.secondaryProcessingComplete) || (!isSecondary && meeting.processingComplete)) {
      console.log(`Meeting ${meetingId} ${isSecondary ? 'secondary' : 'primary'} processing has already been completed`);
      return;
    }

    const startTime = new Date(meeting.date.toDate());
    const duration = new Date(endTime) - startTime;

    const generativeModel = vertexAI.getGenerativeModel({
      model: 'gemini-1.5-pro-001',
      generationConfig: {
        maxOutputTokens: 8192,
        temperature: 0.2,
        topP: 0.8,
      },
    });

    const prompt = `
    You are an AI assistant specialized in analyzing meeting transcripts for a company. You have access to the following company directory:
    
    Company Directory:
    1. Steve Mikhov (Mr. Mikhov) - Boss, oversees meetings, asks questions
    2. Jose Alba - General Manager, leads meetings, provides updates, deals with vendors
    3. Jessica - Personal Assistant, handles scheduling
    4. Kate - Personal Assistant, takes notes, provides additional information
    5. Shawn - Personal Assistant, handles travel, experiences, food
    6. Max - Software Engineer, works on websites, web apps, AI assistants, building Pasha (personal assistant chatbot)
    7. Aryn - Marketing Professional, handles marketing campaigns, organizes expenses, invoices, issues payment methods
    
    Please analyze the following ${isSecondary ? 'secondary' : ''} meeting transcript and provide:
    
    1. A concise summary of the ${isSecondary ? 'additional points discussed in this secondary transcript' : 'meeting'} (max 3 sentences)
    2. A list of ${isSecondary ? 'new or updated' : ''} action items in the following format:
       - What: [action to be taken]
       - Who: [person responsible]
       - When: [deadline or timeframe]
       - Status: [current status]
    
    When assigning responsibility for action items:
    - Use the company directory to identify internal team members.
    - If an action is clearly for an outside vendor but the specific person is unknown, use "Supervised by: [Internal Team Member]" instead of "Who:".
    - If you're unsure about who's responsible, make your best guess based on the roles in the company directory.
    
    ${isSecondary ? "This is a secondary transcript. Please focus on identifying any new or updated action items that weren't captured in the primary transcript." : ""}
    
    Transcript:
    ${transcript}
    
    Please format your response as follows:
    
    Summary: [Your summary here]
    
    Action Items:
    1. What: [action 1]
       Who/Supervised by: [person 1 or internal supervisor]
       When: [deadline 1]
       Status: [status 1]
    [and so on for all action items]
    
    Additional Notes:
    - Include any important points or decisions that don't fit into action items.
    - If there are any unclear responsibilities or potential conflicts, note them at the end.
    `;

    const result = await generativeModel.generateContent(prompt);
    const content = result.response.candidates[0].content.parts[0].text;

    console.log(`Vertex AI raw response for ${isSecondary ? 'secondary' : 'primary'} processing:`, content);

    const summary = extractSummary(content);
    const actionItems = extractActionItems(content);

    console.log(`Extracted ${isSecondary ? 'secondary' : 'primary'} summary:`, summary);
    console.log(`Extracted ${isSecondary ? 'secondary' : 'primary'} action items:`, actionItems);

    let updateData = {};

    if (isSecondary) {
      updateData = {
        secondarySummary: summary || 'No secondary summary available.',
        actionItems: admin.firestore.FieldValue.arrayUnion(...actionItems),
        secondaryProcessingComplete: true
      };
    } else {
      updateData = {
        summary: summary || 'No summary available.',
        actionItems: actionItems,
        duration: `${Math.floor(duration / 60000)} minutes`,
        processingComplete: true
      };
    }

    await meetingRef.update(updateData);
    
    console.log(`Updated meeting ${meetingId} with ${isSecondary ? 'secondary' : 'primary'} processing results`);

    // Send email with the results
    await sendProcessingEmail(meetingId, summary, actionItems, isSecondary);

  } catch (error) {
    console.error(`Error processing ${isSecondary ? 'secondary' : 'primary'} transcript for meeting ${meetingId}:`, error);
    await meetingRef.update({
      [isSecondary ? 'secondaryProcessingError' : 'processingError']: error.message,
      [isSecondary ? 'secondaryProcessingComplete' : 'processingComplete']: true
    });
  }
}

async function sendProcessingEmail(meetingId, summary, actionItems, isSecondary) {
  const meetingDoc = await db.collection('meetings').doc(meetingId).get();
  const meetingData = meetingDoc.data();

  const emailData = {
    meetingTitle: `${meetingData.title}${isSecondary ? ' - Secondary Processing' : ''}`,
    meetingDateTime: new Date(meetingData.date.toDate()).toLocaleString(),
    actionItems: actionItems,
    summary: summary,
    isSecondary: isSecondary
  };

  // Call the endMeetingEmail function
  const endMeetingEmail = functions.httpsCallable('endMeetingEmail');
  await endMeetingEmail(emailData);
}

function extractSummary(content) {
  const summaryMatch = content.match(/Summary:\s*([\s\S]*?)(?=\s*Action Items:)/);
  return summaryMatch ? summaryMatch[1].trim() : null;
}

function extractActionItems(content) {
  const actionItemsMatch = content.match(/Action Items:([\s\S]*)/);
  if (!actionItemsMatch) return [];

  const actionItemsText = actionItemsMatch[1];
  const actionItems = actionItemsText.split(/\d+\./).filter(item => item.trim() !== '');

  return actionItems.map(item => {
    const what = item.match(/What:(.*)/)?.[1].trim() || 'N/A';
    const who = item.match(/Who:(.*)/)?.[1].trim() || 'N/A';
    const when = item.match(/When:(.*)/)?.[1].trim() || 'N/A';
    const status = item.match(/Status:(.*)/)?.[1].trim() || 'N/A';

    return { what, who, when, status };
  });
}