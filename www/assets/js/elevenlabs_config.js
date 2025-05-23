// ElevenLabs Configuration
// This file contains the configuration for the ElevenLabs Conversational AI integration

export const ELEVENLABS_CONFIG = {
    // OPTION 1: For public agents, use the agent ID directly
    // agentId: 'YOUR_ELEVENLABS_AGENT_ID', // Replace with your actual agent ID
    
    // OPTION 2: For private agents, use the Firebase Cloud Function endpoint
    signedUrlEndpoint: 'https://us-central1-pa-sha.cloudfunctions.net/elevenLabsSignedUrl',
    
    // OPTION 3: Pass agent ID to the endpoint (it will use this if no default is set in Firebase)
    agentId: 'agent_01jvmw236se6fvyxmhm19x62kh', // Your ElevenLabs agent ID
    
    // OPTIONAL: Additional configuration options
    options: {
        // Enable debug logging
        debug: true,
        
        // Auto-reconnect on disconnection
        autoReconnect: true,
        
        // Maximum reconnection attempts
        maxReconnectAttempts: 3,
        
        // Reconnection delay in milliseconds
        reconnectDelay: 2000
    }
};

// Instructions for setup:
// 1. Go to https://elevenlabs.io/app/conversational-ai
// 2. Create a new agent or use an existing one
// 3. Copy the agent ID from the agent settings
// 4. Replace 'YOUR_ELEVENLABS_AGENT_ID' above with your actual agent ID
// 5. If your agent is private, you'll need to set up a backend endpoint that generates signed URLs
//    and configure the signedUrlEndpoint above
