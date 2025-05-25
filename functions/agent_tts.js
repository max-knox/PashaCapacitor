// agent_tts.js Text To Speech https://us-central1-pa-sha.cloudfunctions.net/textToSpeech
const functions = require('firebase-functions');
const { createClient } = require("@deepgram/sdk");
const cors = require('cors')({origin: true});

const deepgram = createClient(functions.config().deepgram.api_key);

// Helper function to chunk text
function chunkText(text, maxLength = 1900) {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const chunks = [];
  let currentChunk = '';

  for (const sentence of sentences) {
    if ((currentChunk + sentence).length <= maxLength) {
      currentChunk += sentence;
    } else {
      if (currentChunk) chunks.push(currentChunk.trim());
      currentChunk = sentence;
    }
  }
  if (currentChunk) chunks.push(currentChunk.trim());
  return chunks;
}

exports.textToSpeech = functions.https.onRequest((req, res) => {
  return cors(req, res, async () => {
    console.log('Received request for text-to-speech');
    const { text } = req.body.data;

    if (!text) {
      console.error('No text provided');
      return res.status(400).json({ error: 'The function must be called with a "text" argument.' });
    }

    try {
      // Split text into chunks if necessary
      const chunks = chunkText(text);
      const audioChunks = [];

      // Process each chunk
      for (const chunk of chunks) {
        console.log(`Processing chunk of length ${chunk.length}`);
        const response = await deepgram.speak.request(
          { text: chunk },
          {
            model: "aura-2-thalia-en", // Changed from "aura-asteria-en" to an Aura-2 model
            encoding: "mp3",
          }
        );

        const stream = await response.getStream();
        if (!stream) {
          throw new Error('No audio stream received from Deepgram.');
        }

        // Collect audio data
        const reader = stream.getReader();
        const chunkData = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunkData.push(value);
        }
        audioChunks.push(Buffer.concat(chunkData));
      }

      // Combine all audio chunks
      const finalAudio = Buffer.concat(audioChunks);

      // Set headers and send response
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Length', finalAudio.length);
      res.send(finalAudio);

    } catch (error) {
      console.error('Error in text-to-speech:', error);
      const status = error.__dgError ? error.status : 500;
      res.status(status).json({ 
        error: 'Text-to-speech conversion failed',
        details: error.message 
      });
    }
  });
});