# ElevenLabs Conversational AI Integration

This document explains how to set up and use the ElevenLabs Conversational AI integration in the Pasha Capacitor app.

## Setup Instructions

### 1. Install Dependencies

First, install the required dependencies by running:

```bash
npm install
```

This will install the `@11labs/client` package along with other dependencies.

### 2. Get Your ElevenLabs Agent ID

1. Sign up or log in to [ElevenLabs](https://elevenlabs.io)
2. Navigate to the [Conversational AI section](https://elevenlabs.io/app/conversational-ai)
3. Create a new agent or select an existing one
4. Copy the agent ID from the agent settings
- Agent ID: agent_01jvmw236se6fvyxmhm19x62kh

### 3. Configure the Application

Open the file `www/assets/js/elevenlabs_config.js` and replace `YOUR_ELEVENLABS_AGENT_ID` with your actual agent ID:

```javascript
export const ELEVENLABS_CONFIG = {
    agentId: 'YOUR_ACTUAL_AGENT_ID_HERE', // Replace this
    // ... other configuration
};
```

### 4. For Private Agents (Optional)

If your agent is set to private, you'll need to implement a backend endpoint that generates signed URLs. Here's an example using Node.js:

```javascript
// Example backend endpoint (Node.js/Express)
app.post('/api/elevenlabs/signed-url', async (req, res) => {
    try {
        const response = await fetch('https://api.elevenlabs.io/v1/convai/conversation/get_signed_url', {
            method: 'POST',
            headers: {
                'xi-api-key': process.env.ELEVENLABS_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                agent_id: 'your-agent-id'
            })
        });
        
        const data = await response.json();
        res.json({ signedUrl: data.signed_url });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get signed URL' });
    }
});
```

Then update your configuration:

```javascript
export const ELEVENLABS_CONFIG = {
    // agentId: 'YOUR_AGENT_ID', // Comment out for private agents
    signedUrlEndpoint: '/api/elevenlabs/signed-url',
    // ... other configuration
};
```

## Usage

### Starting a Conversation

1. Click the **TALK** button to start a conversation
2. The button will change to **CONNECTING...** while establishing the connection
3. Once connected, the button will change to **END**
4. Start speaking - the agent will listen and respond naturally
5. Click **END** to stop the conversation

### Voice Status Indicators

- **Ready**: The system is ready to start a conversation
- **Connecting...**: Establishing connection with ElevenLabs
- **Connected**: Successfully connected to the agent
- **Listening**: The agent is listening to your speech
- **Speaking**: The agent is responding
- **Thinking...**: The agent is processing your request

### Features

- **Real-time conversation**: Natural, flowing conversation without push-to-talk
- **Automatic transcription**: Your speech and the agent's responses are transcribed in the chat
- **Context awareness**: The agent maintains conversation context throughout the session
- **Interruption handling**: You can interrupt the agent while it's speaking
- **Auto-reconnection**: Automatic reconnection on network issues

## Troubleshooting

### "Failed to load ElevenLabs SDK"
- Check your internet connection
- Ensure the ElevenLabs CDN is accessible
- Check browser console for specific errors

### "No agent ID configured"
- Make sure you've updated the `elevenlabs_config.js` file with your agent ID
- Verify the agent ID is correct

### "Connection failed"
- Verify your agent is active in the ElevenLabs dashboard
- Check if your agent is public or requires authentication
- Ensure microphone permissions are granted

### Audio Issues
- Check browser microphone permissions
- Ensure no other application is using the microphone
- Try refreshing the page

## Differences from Push-to-Talk

The ElevenLabs integration replaces the push-to-talk functionality with a more natural conversation flow:

| Push-to-Talk | ElevenLabs Conversation |
|--------------|------------------------|
| Hold button to speak | Click to start/end conversation |
| Manual control of speaking | Automatic turn-taking |
| Separate STT/TTS/LLM calls | Integrated conversational AI |
| Higher latency | Low-latency responses |
| No interruption support | Natural interruptions |

## API Reference

### ElevenLabsController Methods

- `init()`: Initialize the controller
- `startConversation()`: Start a new conversation session
- `endConversation()`: End the current conversation
- `setConfig(config)`: Update configuration
- `getConversationHistory()`: Get transcript of the conversation
- `clearConversationHistory()`: Clear the conversation transcript

## Support

For issues related to:
- ElevenLabs service: Visit [ElevenLabs Support](https://help.elevenlabs.io)
- This integration: Create an issue in the project repository
