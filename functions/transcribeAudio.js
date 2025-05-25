const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { Groq } = require('groq-sdk');

if (!admin.apps.length) {
  admin.initializeApp();
}

const groq = new Groq({ apiKey: functions.config().groq.apikey });

exports.transcribeAudio = functions.runWith({
  timeoutSeconds: 540,
  memory: '1GB'
}).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated to use this function.');
  }

  const { meetingId } = data;
  if (!meetingId) {
    throw new functions.https.HttpsError('invalid-argument', 'The function must be called with a meetingId.');
  }

  try {
    const meetingDoc = await admin.firestore().collection('meetings').doc(meetingId).get();
    if (!meetingDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Meeting document not found.');
    }

    const meetingData = meetingDoc.data();
    const fullAudioUrl = meetingData.secondaryAudioUrl;
    const audioChunks = meetingData.secondaryAudioChunks || [];

    let transcription = '';

    if (fullAudioUrl) {
      console.log('Transcribing full audio from URL:', fullAudioUrl);
      transcription = await transcribeAudioUrl(fullAudioUrl);
    } else if (audioChunks.length > 0) {
      console.log('Transcribing audio chunks');
      for (const chunk of audioChunks) {
        const chunkTranscription = await transcribeAudioUrl(chunk.url);
        transcription += chunkTranscription + ' ';
      }
    } else {
      throw new functions.https.HttpsError('not-found', 'No audio found for this meeting.');
    }

    console.log('Transcription completed');

    // Update Firestore with the transcription
    await admin.firestore().collection('meetings').doc(meetingId).update({
      secondaryTranscript: transcription.trim()
    });

    return { success: true, message: 'Audio transcribed successfully.' };
  } catch (error) {
    console.error('Error transcribing audio:', error);
    throw new functions.https.HttpsError('internal', 'Error transcribing audio: ' + error.message);
  }
});

async function transcribeAudioUrl(url) {
  const transcription = await groq.audio.transcriptions.create({
    url: url,
    model: "distil-whisper-large-v3-en",
    response_format: "json",
    language: "en",
    temperature: 0.0,
  });
  return transcription.text;
}