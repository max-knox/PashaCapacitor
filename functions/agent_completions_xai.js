const functions = require('firebase-functions');
const axios = require('axios');

exports.chatCompletions = functions.https.onRequest(async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    const { messages, model, stream, temperature } = req.body;

    try {
        const response = await axios.post('https://api.x.ai/v1/chat/completions', {
            messages,
            model,
            stream,
            temperature
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer xai-6t4n0LHLVB5itsKziSSjTBnXYHUahsKX6mJQJqSyESWkXvtuV4IFXwB8IZA58reTYxGvxW65y7zn7TuL'
            }
        });

        res.status(200).send(response.data);
    } catch (error) {
        console.error('Error making request to X.ai API:', error);
        res.status(500).send('Internal Server Error');
    }
});
