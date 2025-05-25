// Previous Google Speech to text
const textToSpeech = require('@google-cloud/text-to-speech');
const cors = require('cors')({ origin: true });

const client = new textToSpeech.TextToSpeechClient({
  projectId: process.env.AGENT_PROJECT,
  keyFilename: './service-account-key.json'
});

exports.textToSpeech = async (req, res) => {
  cors(req, res, async () => {
    const { text } = req.body.data;

    if (!text) {
      return res.status(400).json({ error: 'The function must be called with a "text" argument.' });
    }

    const request = {
      input: { text },
      voice: { languageCode: 'en-US', ssmlGender: 'NEUTRAL' },
      audioConfig: { audioEncoding: 'MP3' },
    };

    try {
      const [response] = await client.synthesizeSpeech(request);
      return res.status(200).json({ audioContent: response.audioContent.toString('base64') });
    } catch (error) {
      console.error('Error in text-to-speech:', error);
      return res.status(500).json({ error: 'An error occurred during text-to-speech conversion.' });
    }
  });
};