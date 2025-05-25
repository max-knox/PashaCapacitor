import { ELEVENLABS_CONFIG } from './elevenlabs_config.js';

const SYSTEM_PROMPT = "You are Pasha, an AI assistant.";
const FIRST_MESSAGE = "Pasha is ready. Click the Talk button to start a conversation!";

export class ElevenLabsController {
    constructor(contextManager = null) {
        this.conversation = null;
        this.isConversationActive = false;
        this.agentId = null;
        this.contextManager = contextManager; // Store context manager reference
        this.currentConversationId = null; // Track current conversation
        
        this.state = {
            isConnected: false,
            isAgentSpeaking: false,
            isUserSpeaking: false,
            currentMode: 'idle',
            networkStatus: 'online'
        };

        this.elements = {
            chatMessages: null,
            loader: null,
            voiceAction: null,
            talkButton: null,
            voiceStatus: null,
            pauseButton: null
        };

        this.config = {
            agentId: ELEVENLABS_CONFIG.agentId || null,
            signedUrlEndpoint: ELEVENLABS_CONFIG.signedUrlEndpoint || null,
            options: ELEVENLABS_CONFIG.options || {}
        };

        this.conversationHistory = [];
        this.isInitialized = false;
    }

    async init() {
        if (this.isInitialized) return;

        try {
            console.log('Initializing ElevenLabsController...');
            await this.initializeElements();
            this.setupEventListeners();
            this.setupNetworkMonitoring();
            this.setupModeButtons();
            await this.loadElevenLabsSDK();

            if (this.elements.chatMessages) {
                this.appendMessage('bot', FIRST_MESSAGE);
            }

            this.updateVoiceStatus('Ready');
            this.updateButtonStates('ready');
            this.isInitialized = true;
            console.log('ElevenLabsController initialization complete');

        } catch (error) {
            console.error('Initialization error:', error);
            
            if (this.elements.chatMessages) {
                this.appendMessage('bot', 'Sorry, there was an error initializing the application. Please refresh the page and try again.');
            }

            this.updateVoiceStatus('Error');
            if (this.elements.talkButton) {
                this.elements.talkButton.disabled = true;
            }
            throw error;
        }
    }

    /**
     * Load ElevenLabs SDK and store Conversation class globally
     */
    async loadElevenLabsSDK() {
        return new Promise((resolve, reject) => {
            if (window.ElevenLabsConversation) {
                console.log('ElevenLabs SDK already loaded');
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.type = 'module';
            
            script.textContent = `
                try {
                    console.log('🔄 Loading ElevenLabs SDK...');
                    
                    // Import the SDK
                    const ElevenLabsSDK = await import('https://cdn.jsdelivr.net/npm/@11labs/client@latest/+esm');
                    
                    console.log('✅ SDK imported successfully');
                    console.log('📦 Available exports:', Object.keys(ElevenLabsSDK));
                    
                    // Store the Conversation class globally
                    if (ElevenLabsSDK.Conversation) {
                        window.ElevenLabsConversation = ElevenLabsSDK.Conversation;
                        console.log('🎯 Conversation class stored globally');
                        
                        // Log available methods
                        console.log('📊 Conversation static methods:', Object.getOwnPropertyNames(ElevenLabsSDK.Conversation));
                    } else {
                        throw new Error('Conversation class not found in SDK');
                    }
                    
                    window.dispatchEvent(new Event('elevenlabs-loaded'));
                    
                } catch (error) {
                    console.error('❌ Failed to load ElevenLabs SDK:', error);
                    window.dispatchEvent(new CustomEvent('elevenlabs-error', { detail: error }));
                }
            `;
            
            window.addEventListener('elevenlabs-loaded', () => {
                console.log('✅ ElevenLabs SDK loaded successfully');
                resolve();
            }, { once: true });
            
            window.addEventListener('elevenlabs-error', (event) => {
                console.error('❌ SDK loading failed:', event.detail);
                reject(new Error(`Failed to load ElevenLabs SDK: ${event.detail.message}`));
            }, { once: true });
            
            const timeout = setTimeout(() => {
                reject(new Error('Failed to load ElevenLabs SDK - timeout after 10 seconds'));
            }, 10000);
            
            window.addEventListener('elevenlabs-loaded', () => clearTimeout(timeout), { once: true });
            
            document.head.appendChild(script);
        });
    }

    /**
     * Start conversation using correct ElevenLabs SDK pattern
     */
    async startConversation() {
        try {
            console.log('=== Starting ElevenLabs Conversation ===');
            this.updateVoiceStatus('Connecting...');
            this.elements.talkButton.textContent = 'CONNECTING...';
            this.elements.talkButton.disabled = true;

            // Verify SDK is loaded
            if (!window.ElevenLabsConversation) {
                throw new Error('ElevenLabs SDK not loaded');
            }

            // Get session configuration
            const sessionConfig = await this.getSessionConfig();
            console.log('📋 Session config received:', {
                hasSignedUrl: !!sessionConfig.signedUrl,
                agentId: sessionConfig.agentId,
                signedUrlPreview: sessionConfig.signedUrl?.substring(0, 50) + '...'
            });

            // Request microphone permission first
            await this.requestMicrophonePermission();

            console.log('🚀 Initializing conversation with Conversation.startSession()...');
            
            // Use the CORRECT ElevenLabs SDK pattern: Conversation.startSession()
            this.conversation = await window.ElevenLabsConversation.startSession({
                signedUrl: sessionConfig.signedUrl,
                
                // Event callbacks as documented
                onConnect: () => {
                    console.log('🟢 ElevenLabs: Connected');
                    this.handleConnectionEstablished();
                },
                
                onDisconnect: () => {
                    console.log('🔴 ElevenLabs: Disconnected');
                    this.handleDisconnection();
                },
                
                onMessage: (message) => {
                    console.log('📨 ElevenLabs: Message received', message);
                    this.handleMessage(message);
                },
                
                onToolCall: (toolCall) => {
                    console.log('🔧 ElevenLabs: Tool call received', toolCall);
                    window.dispatchEvent(new CustomEvent('elevenlabs-tool-call', {
                        detail: toolCall
                    }));
                },
                
                onError: (error) => {
                    console.error('❌ ElevenLabs: Error', error);
                    this.handleError(error);
                },
                
                onStatusChange: (status) => {
                    console.log('📊 ElevenLabs: Status change', status);
                    this.handleStatusChange(status);
                },
                
                onModeChange: (mode) => {
                    console.log('🔄 ElevenLabs: Mode change', mode);
                    this.handleModeChange(mode);
                }
            });
            
            console.log('✅ Conversation started successfully!');
            console.log('📊 Conversation instance:', {
                id: this.conversation.getId ? this.conversation.getId() : 'N/A',
                methods: Object.getOwnPropertyNames(Object.getPrototypeOf(this.conversation))
            });
            
            this.isConversationActive = true;

        } catch (error) {
            console.error('❌ Error starting conversation:', error);
            this.updateVoiceStatus('Error');
            this.elements.talkButton.textContent = 'TALK';
            this.elements.talkButton.disabled = false;
            
            // Fixed: Provide user-friendly error messages with proper string escaping
            let errorMessage = "Sorry, I could not start the conversation. ";
            if (error.message.includes('microphone')) {
                errorMessage += 'Please allow microphone access and try again.';
            } else if (error.message.includes('websocket') || error.message.includes('network')) {
                errorMessage += 'Please check your internet connection and try again.';
            } else {
                errorMessage += 'Please try again in a moment.';
            }
            
            this.appendMessage('bot', errorMessage);
        }
    }

    /**
     * Request microphone permission before starting conversation
     */
    async requestMicrophonePermission() {
        try {
            console.log('🎤 Requesting microphone permission...');
            await navigator.mediaDevices.getUserMedia({ audio: true });
            console.log('✅ Microphone permission granted');
        } catch (error) {
            console.error('❌ Microphone permission denied:', error);
            throw new Error('Microphone access is required for voice conversations');
        }
    }

    /**
     * Get session configuration from Firebase or use agent ID directly
     */
    async getSessionConfig() {
        console.log('Getting session config...');
        
        if (this.config.signedUrlEndpoint) {
            console.log('Using signed URL endpoint:', this.config.signedUrlEndpoint);
            try {
                const requestBody = {};
                
                if (this.config.agentId && this.config.agentId !== 'YOUR_ELEVENLABS_AGENT_ID') {
                    requestBody.agentId = this.config.agentId;
                }
                
                console.log('Making request to Firebase with body:', requestBody);
                
                const response = await fetch(this.config.signedUrlEndpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(requestBody)
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('Signed URL endpoint error:', errorText);
                    throw new Error(`HTTP ${response.status}: ${errorText}`);
                }

                const data = await response.json();
                console.log('✅ Received signed URL from Firebase');
                
                if (!data.signedUrl) {
                    console.error('No signedUrl in response data:', data);
                    throw new Error('No signed URL in response');
                }
                
                return {
                    signedUrl: data.signedUrl,
                    agentId: data.agentId || this.config.agentId,
                    expiresAt: data.expiresAt
                };
            } catch (error) {
                console.error('Error getting signed URL:', error);
                throw error;
            }
        }
        
        // Fallback to direct agent ID (for public agents)
        if (this.config.agentId && this.config.agentId !== 'YOUR_ELEVENLABS_AGENT_ID') {
            console.log('Using direct agent ID for public agent');
            return {
                agentId: this.config.agentId
            };
        }

        throw new Error('No agent ID or signed URL endpoint configured. Please update elevenlabs_config.js');
    }

    /**
     * End the conversation using the correct method
     */
    async endConversation() {
        try {
            if (this.conversation) {
                console.log('🛑 Ending conversation...');
                
                // Save final context if context manager is available
                if (this.contextManager && this.currentConversationId) {
                    await this.contextManager.saveContext();
                }
                
                // Use the correct ElevenLabs SDK method
                if (typeof this.conversation.endSession === 'function') {
                    await this.conversation.endSession();
                } else {
                    console.warn('endSession method not found on conversation instance');
                }
                
                this.conversation = null;
            }

            this.isConversationActive = false;
            this.currentConversationId = null;
            this.updateVoiceStatus('Ready');
            this.elements.talkButton.textContent = 'TALK';
            this.elements.talkButton.disabled = false;
            this.updateButtonStates('ready');

            console.log('✅ Conversation ended successfully');

        } catch (error) {
            console.error('Error ending conversation:', error);
        }
    }

    // Event Handlers
    handleConnectionEstablished() {
        console.log('🟢 Connection established');
        this.state.isConnected = true;
        this.updateVoiceStatus('Connected');
        this.elements.talkButton.textContent = 'END';
        this.elements.talkButton.disabled = false;
        this.elements.talkButton.classList.add('end-button');
        this.appendMessage('bot', 'Connected! You can start speaking now.');
        
        // Dispatch event for other components
        window.dispatchEvent(new Event('elevenlabs-conversation-started'));
    }

    handleDisconnection() {
        console.log('🔴 Disconnected');
        this.state.isConnected = false;
        this.isConversationActive = false;
        this.updateVoiceStatus('Disconnected');
        this.elements.talkButton.textContent = 'TALK';
        this.elements.talkButton.disabled = false;
        this.elements.talkButton.classList.remove('end-button');
        this.appendMessage('bot', 'Conversation ended.');
        
        // Dispatch event for other components
        window.dispatchEvent(new Event('elevenlabs-conversation-ended'));
    }

    handleMessage(message) {
        console.log('📨 Message received:', message);
        
        // Check if this is a tool call
        if (message.type === 'tool_call' || message.tool_call || message.tools) {
            console.log('🔧 TOOL CALL DETECTED IN MESSAGE:', message);
            // Dispatch tool call event
            window.dispatchEvent(new CustomEvent('elevenlabs-tool-call', {
                detail: message.tool_call || message
            }));
        }
        
        // Handle different message types based on ElevenLabs documentation
        if (message.type === 'user_transcript' || message.type === 'user_transcription') {
            if (message.text && message.text.trim() !== '') {
                this.appendMessage('user', message.text);
            }
        } else if (message.type === 'agent_response' || message.type === 'agent_message') {
            if (message.text && message.text.trim() !== '') {
                this.appendMessage('bot', message.text);
            }
        } else if (message.type === 'transcript' && message.message) {
            // Handle generic transcript format
            if (message.source === 'user' && message.message.trim() !== '') {
                this.appendMessage('user', message.message);
            } else if (message.source === 'agent' && message.message.trim() !== '') {
                this.appendMessage('bot', message.message);
            }
        }

        this.conversationHistory.push(message);
    }

    handleError(error) {
        console.error('❌ Conversation error:', error);
        this.appendMessage('bot', 'Sorry, an error occurred during the conversation. Please try again.');
        this.endConversation();
    }

    handleStatusChange(status) {
        console.log('📊 Status change:', status);
        switch (status) {
            case 'connected':
                this.updateVoiceStatus('Connected');
                break;
            case 'connecting':
                this.updateVoiceStatus('Connecting...');
                break;
            case 'disconnected':
                this.updateVoiceStatus('Disconnected');
                break;
        }
    }

    handleModeChange(mode) {
        console.log('🔄 Mode change:', mode);
        
        // Handle mode object or string
        const modeValue = typeof mode === 'object' ? mode.mode : mode;
        
        switch (modeValue) {
            case 'listening':
                this.updateVoiceStatus('Listening');
                this.state.isUserSpeaking = true;
                this.state.isAgentSpeaking = false;
                break;
            case 'speaking':
                this.updateVoiceStatus('Speaking');
                this.state.isUserSpeaking = false;
                this.state.isAgentSpeaking = true;
                break;
            case 'thinking':
                this.updateVoiceStatus('Thinking...');
                this.state.isUserSpeaking = false;
                this.state.isAgentSpeaking = false;
                break;
        }
    }

    // UI Management Methods
    async initializeElements() {
        return new Promise((resolve) => {
            setTimeout(() => {
                this.elements = {
                    chatMessages: document.getElementById("chat-messages"),
                    loader: document.getElementById("loader"),
                    voiceAction: document.getElementById("voice-action"),
                    talkButton: document.querySelector('button.push-talk-btn'),
                    voiceStatus: document.querySelector('.voice_status'),
                    pauseButton: document.querySelector('button.pause-btn')
                };

                if (this.elements.talkButton) {
                    this.elements.talkButton.textContent = 'TALK';
                    this.elements.talkButton.disabled = false;
                    this.elements.talkButton.classList.add('talk-button');
                }

                if (this.elements.pauseButton) {
                    this.elements.pauseButton.style.display = 'none';
                }

                resolve();
            }, 100);
        });
    }

    setupEventListeners() {
        if (this.elements.talkButton) {
            this.elements.talkButton.addEventListener('click', () => {
                this.handleTalkButtonClick();
            });
        }

        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.isConversationActive) {
                this.endConversation();
            }
        });
    }

    async handleTalkButtonClick() {
        if (!this.isConversationActive) {
            await this.startConversation();
        } else {
            await this.endConversation();
        }
    }

    updateVoiceStatus(status) {
        if (this.elements.voiceAction) {
            this.elements.voiceAction.textContent = status;
        }

        if (this.elements.voiceStatus) {
            this.elements.voiceStatus.classList.remove('listening-pulse', 'speaking-pulse', 'thinking-pulse');

            if (status === 'Listening') {
                this.elements.voiceStatus.classList.add('listening-pulse');
            } else if (status === 'Speaking') {
                this.elements.voiceStatus.classList.add('speaking-pulse');
            } else if (status === 'Thinking...') {
                this.elements.voiceStatus.classList.add('thinking-pulse');
            }
        }
    }

    updateButtonStates(state) {
        if (!this.elements.talkButton) return;

        switch (state) {
            case 'ready':
                this.elements.talkButton.disabled = false;
                this.elements.talkButton.textContent = 'TALK';
                this.elements.talkButton.classList.remove('end-button');
                break;
            case 'active':
                this.elements.talkButton.disabled = false;
                this.elements.talkButton.textContent = 'END';
                this.elements.talkButton.classList.add('end-button');
                break;
            case 'connecting':
                this.elements.talkButton.disabled = true;
                this.elements.talkButton.textContent = 'CONNECTING...';
                break;
        }
    }

    appendMessage(role, content) {
        if (!this.elements.chatMessages) {
            console.error('Chat messages container not found');
            return;
        }

        const msgDiv = document.createElement("div");
        msgDiv.classList.add("msg", role === "user" ? "right-msg" : "left-msg");

        const msgImg = document.createElement("div");
        msgImg.classList.add("msg-img");
        msgImg.style.backgroundImage = `url('assets/img/ux_icons/${role}_icon.png')`;

        const msgBubble = document.createElement("div");
        msgBubble.classList.add("msg-bubble");

        const msgInfo = document.createElement("div");
        msgInfo.classList.add("msg-info");

        const msgInfoName = document.createElement("div");
        msgInfoName.classList.add("msg-info-name");
        msgInfoName.textContent = role === "user" ? "You" : "Pasha";

        const msgText = document.createElement("div");
        msgText.classList.add("msg-text");

        if (content instanceof HTMLElement) {
            msgText.appendChild(content);
        } else if (typeof content === 'string') {
            msgText.innerHTML = this.formatText(content);
        } else {
            console.error('Unexpected content type:', content);
            msgText.textContent = "Error: Unexpected content type";
        }

        msgInfo.appendChild(msgInfoName);
        msgBubble.appendChild(msgInfo);
        msgBubble.appendChild(msgText);
        msgDiv.appendChild(msgImg);
        msgDiv.appendChild(msgBubble);

        this.elements.chatMessages.appendChild(msgDiv);
        
        requestAnimationFrame(() => {
            const chatMessages = this.elements.chatMessages;
            const horizonHero = chatMessages.closest('.horizon_hero');
            const horizonBot = chatMessages.closest('.horizon_bot');
            
            [chatMessages, horizonHero, horizonBot].forEach(container => {
                if (container) {
                    container.scrollTo({
                        top: container.scrollHeight,
                        behavior: 'smooth'
                    });
                }
            });
        });
    }

    formatText(text) {
        if (!text) return 'N/A';
        return text.replace(/\*\*/g, '')
                   .replace(/\*(.*?)\*/g, '<em>$1</em>')
                   .replace(/_(.*?)_/g, '<strong>$1</strong>')
                   .replace(/\n/g, '<br>');
    }

    setupNetworkMonitoring() {
        this.state.networkStatus = navigator.onLine ? 'online' : 'offline';
        
        window.addEventListener('online', () => {
            console.log('Network connection restored');
            this.state.networkStatus = 'online';
            
            if (!this.isConversationActive && this.elements.talkButton) {
                this.elements.talkButton.disabled = false;
            }
        });
        
        window.addEventListener('offline', () => {
            console.log('Network connection lost');
            this.state.networkStatus = 'offline';
            
            if (this.elements.voiceAction) {
                this.updateVoiceStatus('Offline');
            }
            
            if (this.isConversationActive) {
                this.endConversation();
            }
            
            if (this.elements.talkButton) {
                this.elements.talkButton.disabled = true;
            }
        });
    }

    setupModeButtons() {
        const buttonIds = {
            'chronicle': 'chronicleModeBtn',
            'scheduler': 'schedulerBtn',
            'messenger': 'messengerBtn',
            'settings': 'settingsModeBtn'
        };

        for (const [mode, id] of Object.entries(buttonIds)) {
            const button = document.getElementById(id);
            if (button) {
                button.addEventListener('click', () => this.handleModeButtonClick(mode));
            } else {
                console.warn(`Button with ID "${id}" not found`);
            }
        }
    }

    async handleModeButtonClick(mode) {
        if (this.isConversationActive) {
            await this.endConversation();
        }

        let message = '';
        let action = null;
        
        switch(mode) {
            case 'chronicle':
                message = "Chronicle Mode activated.";
                action = () => console.log('Chronicle mode started');
                break;
                
            case 'scheduler':
                message = "Scheduler activated.";
                action = () => {
                    if (window.schedulerController && typeof window.schedulerController.openScheduler === 'function') {
                        window.schedulerController.openScheduler();
                    } else {
                        const schedulerModal = document.getElementById('schedulerModal');
                        if (schedulerModal) {
                            schedulerModal.classList.add('active');
                            if (window.schedulerController && typeof window.schedulerController.init === 'function') {
                                window.schedulerController.init();
                            }
                        }
                    }
                };
                break;
                
            case 'messenger':
                message = "Messenger activated.";
                action = () => {
                    this.appendMessage('bot', 'You can:\n- Send an email\n- Send a text message\n- Leave a voice message');
                };
                break;
                
            case 'settings':
                message = "Opening settings panel...";
                action = () => this.openSettings();
                break;
        }

        this.appendMessage('bot', message);
        
        if (action) {
            action();
        }
    }

    openSettings() {
        const settingsModal = document.getElementById('settingsModal');
        if (settingsModal) {
            settingsModal.classList.add('active');
            
            const closeButton = document.getElementById('closeSettingsBtn');
            if (closeButton) {
                setTimeout(() => closeButton.focus(), 100);
            }
        }
    }

    // Utility methods
    setConfig(config) {
        this.config = { ...this.config, ...config };
        console.log('ElevenLabs configuration updated:', this.config);
    }

    getConversationHistory() {
        return this.conversationHistory;
    }

    clearConversationHistory() {
        this.conversationHistory = [];
        console.log('Conversation history cleared');
    }

    cleanup() {
        if (this.isConversationActive) {
            this.endConversation();
        }
        
        // Save context before cleanup
        if (this.contextManager) {
            this.contextManager.cleanup();
        }
        
        this.state = {
            isConnected: false,
            isAgentSpeaking: false,
            isUserSpeaking: false,
            currentMode: 'idle',
            networkStatus: 'online'
        };
    }

    /**
     * Utility method to generate conversation ID
     */
    generateConversationId() {
        return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Set context manager (for dependency injection)
     */
    setContextManager(contextManager) {
        this.contextManager = contextManager;
    }

    /**
     * Get current conversation context summary
     */
    getContextSummary() {
        if (this.contextManager) {
            return this.contextManager.getContextSummary();
        }
        return '';
    }
}