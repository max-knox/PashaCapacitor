const functions = require('firebase-functions');
const admin = require('firebase-admin');
const cors = require('cors')({
  origin: [
    'https://pa-sha.web.app',
    'capacitor://com.pasha.com',
    'capacitor://com.pasha.app',
    'capacitor://localhost',
    'http://localhost:4200',
    'http://localhost:8100',
    'https://localhost',
    'http://localhost',
    'http://localhost:3000',
    'http://localhost:5000',
    'http://localhost:8080',
    'file://'
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin'
  ],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
});

require('dotenv').config();

const serviceAccount = require('./service-account-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'pa-sha.appspot.com'
});

// Import the functions
const { agent_completions } = require('./agent_completions');
const { speechToText } = require('./agent_stt');
const { textToSpeech } = require('./agent_tts');
const { agent_async_stt, getTranscriptionResult } = require('./agent_async_stt');
const { pashameetinglistener } = require('./pashaMeetingListener');
const { transcribeAudio } = require('./transcribeAudio');
const { endMeetingEmail } = require('./endMeetingEmail');
const { pasha_completions } = require('./pasha_completions');
const { completions_v2 } = require('./completions_v2');
const { nda_completions } = require('./nda_completions');
const { chatCompletions } = require('./agent_completions_xai');
const { chatCompletionsOpenAI } = require('./agent_completions_openai');
const { chatCompletionsGemini } = require('./agent_completions_gemini');
const { chatCompletionsClaude } = require('./agent_completions_claude');
const { remoteUpdates } = require('./remote_updates');
const { elevenLabsSignedUrl, validateElevenLabsAgent } = require('./elevenlabs_signed_url');
const { elevenLabsMeetingTool } = require('./elevenLabsMeetingTool');

// Helper function to wrap each function with CORS
const wrapWithCors = (fn) => functions.https.onRequest((req, res) => {
  cors(req, res, () => {
    fn(req, res);
  });
});

// Export HTTP functions with CORS wrapper
exports.agent_completions = wrapWithCors(agent_completions);
exports.speechToText = wrapWithCors(speechToText);
exports.textToSpeech = wrapWithCors(textToSpeech);
exports.agent_async_stt = wrapWithCors(agent_async_stt);
exports.getTranscriptionResult = wrapWithCors(getTranscriptionResult);
exports.pashameetinglistener = wrapWithCors(pashameetinglistener);
exports.endMeetingEmail = functions.https.onRequest(endMeetingEmail);
exports.pasha_completions = pasha_completions;
exports.completions_v2 = completions_v2;
exports.nda_completions = nda_completions;
exports.chatCompletions = wrapWithCors(chatCompletions);
exports.chatCompletionsOpenAI = wrapWithCors(chatCompletionsOpenAI);
exports.chatCompletionsGemini = wrapWithCors(chatCompletionsGemini);
exports.chatCompletionsClaude = wrapWithCors(chatCompletionsClaude);
exports.remoteUpdates = wrapWithCors(remoteUpdates);
exports.elevenLabsSignedUrl = wrapWithCors(elevenLabsSignedUrl);
exports.validateElevenLabsAgent = wrapWithCors(validateElevenLabsAgent);
exports.elevenLabsMeetingTool = wrapWithCors(elevenLabsMeetingTool);

// Export the transcribeAudio function directly as a callable function
exports.transcribeAudio = transcribeAudio;