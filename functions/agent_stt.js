// agent_stt.js Speech To Text https://us-central1-pa-sha.cloudfunctions.net/speechToText
// agent_stt.js
const functions = require('firebase-functions');
const cors = require('cors')({ origin: true });
const Groq = require('groq-sdk');

const groq = new Groq({
  apiKey: functions.config().groq.api_key
});

exports.speechToText = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const { audioContent } = req.body.data;

      if (!audioContent) {
        throw new Error('No audio content provided');
      }

      const audioBuffer = Buffer.from(audioContent, 'base64');

      const transcription = await groq.audio.transcriptions.create({
        file: audioBuffer,
        model: "distil-whisper-large-v3-en", // You can change this to "whisper-large-v3" if needed
        response_format: "json",
        language: "en"
      });

      res.json({ transcription: transcription.text });
    } catch (error) {
      console.error('Error in speechToText:', error);
      res.status(500).json({ error: `An error occurred during speech-to-text conversion: ${error.message}` });
    }
  });
});


// Previous google speech to text
/* const functions = require('firebase-functions');
const cors = require('cors')({ origin: true });
const { SpeechClient } = require('@google-cloud/speech');

const speechClient = new SpeechClient();

exports.speechToText = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const { audioContent } = req.body.data;

      if (!audioContent) {
        throw new Error('No audio content provided');
      }

      const audioConfig = selectAudioConfig();

      const request = {
        audio: {
          content: audioContent,
        },
        config: audioConfig,
      };

      const [response] = await speechClient.recognize(request);
      const transcription = response.results
        .map(result => result.alternatives[0].transcript)
        .join('\n');

      res.json({ transcription });
    } catch (error) {
      console.error('Error in speechToText:', error);
      res.status(500).json({ error: `An error occurred during speech-to-text conversion: ${error.message}` });
    }
  });
});

function selectAudioConfig() {
  return {
    encoding: 'WEBM_OPUS',
    languageCode: 'en-US',
  };
} */