# ElevenLabs Integration Setup with Firebase Functions

## Prerequisites

1. ElevenLabs account with API access
2. Firebase project with Cloud Functions enabled
3. Node.js and npm installed

## Setup Instructions

### 1. Set up ElevenLabs API Key in Firebase

Add your ElevenLabs API key to your Firebase Functions environment configuration:

```bash
# Navigate to your Firebase functions directory
cd /Users/maximilianolaguna/Documents/GitHub/pasha/functions

# Set the ElevenLabs API key
firebase functions:config:set elevenlabs.api_key="YOUR_ELEVENLABS_API_KEY"

# Optional: Set a default agent ID
firebase functions:config:set elevenlabs.agent_id="YOUR_AGENT_ID"

# Deploy the configuration
firebase deploy --only functions
```

### 2. Update Environment Variables

In your `pasha/functions` directory, update the `.env` file (create it if it doesn't exist):

```env
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
ELEVENLABS_AGENT_ID=your_default_agent_id_here
```

### 3. Install Dependencies in Pasha Capacitor

Navigate to your Pasha Capacitor project and install dependencies:

```bash
cd /Users/maximilianolaguna/Documents/GitHub/PashaCapacitor
npm install
```

### 4. Configure Your Agent

#### Option A: Using a Public Agent

If your ElevenLabs agent is public, update `www/assets/js/elevenlabs_config.js`:

```javascript
export const ELEVENLABS_CONFIG = {
    agentId: 'your-public-agent-id-here',
    // Comment out or remove the signedUrlEndpoint line
    // signedUrlEndpoint: 'https://us-central1-pa-sha.cloudfunctions.net/elevenLabsSignedUrl',
};
```

#### Option B: Using a Private Agent (Recommended)

For private agents, the configuration is already set to use your Firebase endpoint:

```javascript
export const ELEVENLABS_CONFIG = {
    // The Firebase endpoint is already configured
    signedUrlEndpoint: 'https://us-central1-pa-sha.cloudfunctions.net/elevenLabsSignedUrl',
    
    // Optional: If you want to specify which agent to use
    // agentId: 'your-private-agent-id-here',
};
```

### 5. Deploy Firebase Functions

Deploy the new ElevenLabs functions:

```bash
cd /Users/maximilianolaguna/Documents/GitHub/pasha/functions
firebase deploy --only functions:elevenLabsSignedUrl,functions:validateElevenLabsAgent
```

### 6. Test the Integration

1. Open your Pasha Capacitor app
2. Click the "TALK" button
3. The button should change to "CONNECTING..." then "END"
4. Start speaking - the agent should respond naturally

## Troubleshooting

### "ElevenLabs API key not configured"

Make sure you've set the environment variable in Firebase:
```bash
firebase functions:config:get
```

### "Agent ID not found"

Verify your agent ID in the ElevenLabs dashboard:
1. Go to https://elevenlabs.io/app/conversational-ai
2. Click on your agent
3. Copy the agent ID from the settings

### CORS Issues

The Firebase functions are already configured with CORS for your domains. If you're testing from a new domain, add it to the CORS origin list in `pasha/functions/index.js`.

### Connection Failures

1. Check the browser console for errors
2. Verify the Firebase function logs:
   ```bash
   firebase functions:log --only elevenLabsSignedUrl
   ```
3. Test the endpoint directly:
   ```bash
   curl -X POST https://us-central1-pa-sha.cloudfunctions.net/elevenLabsSignedUrl \
     -H "Content-Type: application/json" \
     -d '{"agentId":"your-agent-id"}'
   ```

## Security Considerations

1. **API Key Security**: Never expose your ElevenLabs API key in client-side code
2. **Agent Privacy**: Use private agents for sensitive conversations
3. **Rate Limiting**: Consider implementing rate limiting in your Firebase functions
4. **Authentication**: Add Firebase Auth checks if needed:

```javascript
// Example: Add to elevenLabsSignedUrl function
const user = await admin.auth().verifyIdToken(req.headers.authorization);
if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
}
```

## Advanced Configuration

### Custom Agent Selection

To allow users to select different agents dynamically:

```javascript
// In your app code
window.elevenLabsController.setConfig({
    agentId: 'new-agent-id'
});
```

### Monitoring Conversations

The controller provides methods to track conversations:

```javascript
// Get conversation history
const history = window.elevenLabsController.getConversationHistory();

// Listen for messages
window.elevenLabsController.onMessage = (message) => {
    console.log('Message:', message);
    // Save to Firebase, analytics, etc.
};
```

## Next Steps

1. Create multiple agents for different use cases
2. Implement conversation history storage in Firebase
3. Add voice customization options
4. Set up analytics to track usage

For more information, visit:
- [ElevenLabs Documentation](https://elevenlabs.io/docs)
- [Firebase Functions Documentation](https://firebase.google.com/docs/functions)
