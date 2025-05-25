const axios = require('axios');
const functions = require('firebase-functions');

/**
 * Firebase Cloud Function to generate signed URLs for ElevenLabs Conversational AI
 * This is needed for private agents that require authentication
 */
exports.elevenLabsSignedUrl = async (req, res) => {
    // Log request details for debugging
    console.log('Request method:', req.method);
    console.log('Request headers:', req.headers);
    console.log('Request origin:', req.headers.origin);
    console.log('Request body:', req.body);
    
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'POST');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        res.set('Access-Control-Max-Age', '3600');
        res.status(204).send('');
        return;
    }
    
    // Only allow POST requests
    if (req.method !== 'POST') {
        console.error('Method not allowed:', req.method);
        return res.status(405).json({ error: 'Method not allowed', detail: 'Method Not Allowed' });
    }

    try {
        // Get the ElevenLabs API key from environment variables or Firebase config
        const apiKey = process.env.ELEVENLABS_API_KEY || functions.config().elevenlabs?.api_key;
        
        console.log('API Key status:', apiKey ? 'Found' : 'Not found');
        console.log('API Key source:', process.env.ELEVENLABS_API_KEY ? 'env' : functions.config().elevenlabs?.api_key ? 'firebase config' : 'none');
        
        if (!apiKey) {
            console.error('ElevenLabs API key not configured');
            return res.status(500).json({ 
                error: 'ElevenLabs API key not configured in environment variables' 
            });
        }

        // Get agent ID from request body, environment variables, or Firebase config
        const { agentId } = req.body;
        const finalAgentId = agentId || process.env.ELEVENLABS_AGENT_ID || functions.config().elevenlabs?.agent_id;
        
        if (!finalAgentId) {
            return res.status(400).json({ 
                error: 'Agent ID is required. Please provide agentId in request body.' 
            });
        }

        console.log('Requesting signed URL for agent:', finalAgentId);

        // Request signed URL from ElevenLabs API
        // Note: The ElevenLabs API uses GET with query parameters, not POST
        const response = await axios.get(
            `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${encodeURIComponent(finalAgentId)}`,
            {
                headers: {
                    'xi-api-key': apiKey,
                    'Accept': 'application/json'
                }
            }
        );

        if (response.status !== 200) {
            console.error('ElevenLabs API error:', response.data);
            return res.status(response.status).json({ 
                error: 'Failed to get signed URL from ElevenLabs',
                details: response.data
            });
        }

        const { signed_url, expires_at } = response.data;
        
        console.log('Successfully generated signed URL');

        // Return the signed URL to the client
        return res.status(200).json({ 
            signedUrl: signed_url,
            expiresAt: expires_at,
            agentId: finalAgentId
        });

    } catch (error) {
        console.error('Error in elevenLabsSignedUrl function:', error);
        
        if (error.response) {
            // ElevenLabs API returned an error
            return res.status(error.response.status || 500).json({ 
                error: 'ElevenLabs API error',
                details: error.response.data || error.message
            });
        } else if (error.request) {
            // Request was made but no response received
            return res.status(503).json({ 
                error: 'Unable to reach ElevenLabs API',
                details: 'Service temporarily unavailable'
            });
        } else {
            // Something else went wrong
            return res.status(500).json({ 
                error: 'Internal server error',
                details: error.message
            });
        }
    }
};

/**
 * Optional: Function to validate an agent ID exists
 */
exports.validateElevenLabsAgent = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const apiKey = process.env.ELEVENLABS_API_KEY;
        
        if (!apiKey) {
            return res.status(500).json({ 
                error: 'ElevenLabs API key not configured' 
            });
        }

        const { agentId } = req.body;
        
        if (!agentId) {
            return res.status(400).json({ 
                error: 'Agent ID is required' 
            });
        }

        // Note: ElevenLabs doesn't have a direct validation endpoint,
        // so we'll try to get a signed URL as a validation method
        const response = await axios.get(
            `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${encodeURIComponent(agentId)}`,
            {
                headers: {
                    'xi-api-key': apiKey,
                    'Accept': 'application/json'
                }
            }
        );

        if (response.status === 200) {
            return res.status(200).json({ 
                valid: true,
                agentId: agentId,
                message: 'Agent ID is valid'
            });
        }

    } catch (error) {
        if (error.response && error.response.status === 404) {
            return res.status(404).json({ 
                valid: false,
                agentId: req.body.agentId,
                message: 'Agent ID not found'
            });
        }
        
        return res.status(500).json({ 
            error: 'Failed to validate agent ID',
            details: error.message
        });
    }
};
