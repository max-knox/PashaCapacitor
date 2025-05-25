
const functions = require('firebase-functions');
const axios = require('axios');

exports.chatCompletionsClaude = functions.https.onRequest(async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    const { messages, model, stream, temperature } = req.body;

    try {
        const response = await axios.post('https://api.claude.ai/v1/chat/completions', {
            messages,
            model,
            stream,
            temperature
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer claude-API-KEY'
            }
        });

        res.status(200).send(response.data);
    } catch (error) {
        console.error('Error making request to Claude API:', error);
        res.status(500).send('Internal Server Error');
    }
});