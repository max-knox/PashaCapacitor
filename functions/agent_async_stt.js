// agent_async_stt.js
const functions = require('firebase-functions');
const {SpeechClient} = require('@google-cloud/speech');
const cors = require('cors')({origin: true});

const speechClient = new SpeechClient();

exports.agent_async_stt = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const {audioContent} = req.body.data;

      if (!audioContent) {
        throw new Error('No audio content provided');
      }

      console.log('Initiating async speech-to-text conversion');
      console.log('Audio content length:', audioContent.length);

      const [operation] = await speechClient.longRunningRecognize({
        audio: {content: audioContent},
        config: {
          encoding: 'WEBM_OPUS',
          languageCode: 'en-US',
          model: 'latest_long', // Use a model suitable for longer audio
        },
      });

      console.log('Async operation started with ID:', operation.name);

      res.json({operationId: operation.name});
    } catch (error) {
      console.error('Error in asyncSpeechToText:', error);
      res.status(500).json({error: `An error occurred during speech-to-text conversion: ${error.message}`, stack: error.stack});
    }
  });
});

exports.getTranscriptionResult = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const operationId = req.query.operationId;
      console.log('Checking transcription result for operation:', operationId);

      const operation = await speechClient.checkLongRunningRecognizeProgress(operationId);

      if (operation.done) {
        console.log('Transcription completed');
        const [response] = await operation.promise();
        const transcription = response.results
          .map(result => result.alternatives[0].transcript)
          .join('\n');
        res.json({status: 'completed', transcription});
      } else {
        console.log('Transcription still in progress');
        res.json({status: 'in_progress'});
      }
    } catch (error) {
      console.error('Error in getTranscriptionResult:', error);
      res.status(500).json({status: 'failed', error: 'An error occurred while fetching the transcription result.', details: error.message, stack: error.stack});
    }
  });
});