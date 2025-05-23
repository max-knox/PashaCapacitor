import { ELEVENLABS_CONFIG } from './elevenlabs_config.js';

const SYSTEM_PROMPT = "You are Pasha, an AI assistant.";
const FIRST_MESSAGE = "Pasha is ready. Click the Talk button to start a conversation!";

export class ElevenLabsController {
    constructor() {
        this.conversation = null;
        this.isConversationActive = false;
        this.agentId = null; // Will be set from config
        
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

        // Use imported configuration with fallback to empty config
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

            // Initialize elements
            await this.initializeElements();

            // Setup event listeners
            this.setupEventListeners();

            // Setup network monitoring
            this.setupNetworkMonitoring();

            // Setup mode buttons
            this.setupModeButtons();

            // Load the ElevenLabs SDK
            await this.loadElevenLabsSDK();

            // Display initial message
            if (this.elements.chatMessages) {
                this.appendMessage('bot', FIRST_MESSAGE);
            }

            // Set initial voice status
            this.updateVoiceStatus('Ready');

            // Initialize button states
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

    async loadElevenLabsSDK() {
        return new Promise((resolve, reject) => {
            // Check if the SDK is already loaded
            if (window.ElevenLabsConversation) {
                console.log('ElevenLabs SDK already loaded');
                resolve();
                return;
            }

            // Create script element
            const script = document.createElement('script');
            script.type = 'module';
            
            // Try importing everything from the module
            script.textContent = `
                import * as ElevenLabsSDK from 'https://cdn.jsdelivr.net/npm/@11labs/client@latest/+esm';
                
                console.log('ElevenLabs SDK imported:', ElevenLabsSDK);
                console.log('SDK type:', typeof ElevenLabsSDK);
                console.log('SDK keys:', Object.keys(ElevenLabsSDK));
                
                // Store the entire SDK
                window.ElevenLabsSDK = ElevenLabsSDK;
                
                // Try to find the Conversation class
                if (ElevenLabsSDK.Conversation) {
                    window.ElevenLabsConversation = ElevenLabsSDK.Conversation;
                    console.log('Found Conversation in SDK');
                } else if (ElevenLabsSDK.default && ElevenLabsSDK.default.Conversation) {
                    window.ElevenLabsConversation = ElevenLabsSDK.default.Conversation;
                    console.log('Found Conversation in default export');
                } else {
                    // List all available exports to debug
                    console.log('Available exports:', ElevenLabsSDK);
                    for (const key in ElevenLabsSDK) {
                        console.log('Export:', key, '=', ElevenLabsSDK[key]);
                    }
                }
                
                window.dispatchEvent(new Event('elevenlabs-loaded'));
            `;
            
            // Listen for the custom event
            window.addEventListener('elevenlabs-loaded', () => {
                console.log('ElevenLabs SDK loaded successfully');
                resolve();
            }, { once: true });
            
            // Set a timeout in case loading fails
            const timeout = setTimeout(() => {
                reject(new Error('Failed to load ElevenLabs SDK - timeout'));
            }, 10000);
            
            // Clear timeout on success
            window.addEventListener('elevenlabs-loaded', () => {
                clearTimeout(timeout);
            }, { once: true });
            
            document.head.appendChild(script);
        });
    }

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

                console.log('Initialized elements:', this.elements);

                // Update button text and styling
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
        // Talk/End Button Events
        if (this.elements.talkButton) {
            this.elements.talkButton.addEventListener('click', () => {
                this.handleTalkButtonClick();
            });
        }

        // Handle page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.isConversationActive) {
                this.endConversation();
            }
        });

        // Handle window blur
        window.addEventListener('blur', () => {
            // Optional: You might want to keep the conversation active
            // when switching tabs/apps in this implementation
        });
    }

    async handleTalkButtonClick() {
        if (!this.isConversationActive) {
            await this.startConversation();
        } else {
            await this.endConversation();
        }
    }

    async startConversation() {
        try {
            console.log('=== Starting Conversation ===');
            this.updateVoiceStatus('Connecting...');
            this.elements.talkButton.textContent = 'CONNECTING...';
            this.elements.talkButton.disabled = true;

            // First, get the session configuration (this triggers the endpoint)
            console.log('Getting session config from Firebase...');
            const sessionConfig = await this.getSessionConfig();
            console.log('Session config received:', sessionConfig);

            // Check if SDK is loaded
            if (!window.ElevenLabsSDK && !window.ElevenLabsConversation) {
                throw new Error('ElevenLabs SDK not loaded');
            }

            // The SDK might be expecting the conversation to be initialized with the signed URL
            // Let's try creating it with the session config directly
            const ConversationClass = window.ElevenLabsConversation || 
                                     (window.ElevenLabsSDK && window.ElevenLabsSDK.Conversation);
            
            if (!ConversationClass) {
                console.error('Available SDK exports:', window.ElevenLabsSDK);
                throw new Error('Conversation class not found in SDK');
            }

            console.log('Creating Conversation with signed URL...');
            
            try {
                // Based on the error, it seems the SDK expects the signed URL to contain
                // conversation details including conversationId
                if (sessionConfig.signedUrl) {
                    // Pass the signed URL as the first parameter
                    this.conversation = new ConversationClass(sessionConfig.signedUrl, {
                        onConnect: () => {
                            console.log('Connected to ElevenLabs');
                            this.handleConnectionEstablished();
                        },
                        onDisconnect: () => {
                            console.log('Disconnected from ElevenLabs');
                            this.handleDisconnection();
                        },
                        onMessage: (message) => {
                            console.log('Message received:', message);
                            this.handleMessage(message);
                        },
                        onError: (error) => {
                            console.error('Conversation error:', error);
                            this.handleError(error);
                        },
                        onStatusChange: (status) => {
                            console.log('Status changed:', status);
                            this.handleStatusChange(status);
                        },
                        onModeChange: (mode) => {
                            console.log('Mode changed:', mode);
                            this.handleModeChange(mode);
                        }
                    });
                } else {
                    throw new Error('No signed URL received from Firebase');
                }
                
                console.log('Conversation created successfully!');
                this.isConversationActive = true;

            } catch (error) {
                console.error('Error creating conversation:', error);
                console.error('Error stack:', error.stack);
                throw error;
            }

        } catch (error) {
            console.error('Error starting conversation:', error);
            this.updateVoiceStatus('Error');
            this.elements.talkButton.textContent = 'TALK';
            this.elements.talkButton.disabled = false;
            this.appendMessage('bot', 'Sorry, I couldn\'t start the conversation. Please check your configuration and try again.');
        }
    }

    setupConversationHandlers() {
        if (!this.conversation) return;
        
        // Try different event binding methods
        if (typeof this.conversation.on === 'function') {
            // Event emitter style
            this.conversation.on('connect', () => this.handleConnectionEstablished());
            this.conversation.on('disconnect', () => this.handleDisconnection());
            this.conversation.on('message', (message) => this.handleMessage(message));
            this.conversation.on('error', (error) => this.handleError(error));
            this.conversation.on('status-change', (status) => this.handleStatusChange(status));
            this.conversation.on('mode-change', (mode) => this.handleModeChange(mode));
        } else if (typeof this.conversation.addEventListener === 'function') {
            // DOM style event listeners
            this.conversation.addEventListener('connect', () => this.handleConnectionEstablished());
            this.conversation.addEventListener('disconnect', () => this.handleDisconnection());
            this.conversation.addEventListener('message', (e) => this.handleMessage(e.data || e));
            this.conversation.addEventListener('error', (e) => this.handleError(e.error || e));
            this.conversation.addEventListener('statusChange', (e) => this.handleStatusChange(e.data || e));
            this.conversation.addEventListener('modeChange', (e) => this.handleModeChange(e.data || e));
        } else {
            console.warn('No event binding method found on conversation object');
        }
    }

    async getSessionConfig() {
        // If using agent ID directly (for public agents)
        if (this.config.agentId && this.config.agentId !== 'YOUR_ELEVENLABS_AGENT_ID') {
            return {
                agentId: this.config.agentId
            };
        }

        // If using signed URL endpoint for authorized agents
        if (this.config.signedUrlEndpoint) {
            try {
                const requestBody = {};
                
                // If agentId is provided in config, include it in the request
                if (this.config.agentId && this.config.agentId !== 'YOUR_ELEVENLABS_AGENT_ID') {
                    requestBody.agentId = this.config.agentId;
                }
                
                const response = await fetch(this.config.signedUrlEndpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(requestBody)
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    console.error('Signed URL endpoint error:', errorData);
                    throw new Error(errorData.error || 'Failed to get signed URL');
                }

                const data = await response.json();
                console.log('Received signed URL response:', data);
                
                // Check if we have all required data
                if (!data.signedUrl) {
                    throw new Error('No signed URL in response');
                }
                
                return {
                    signedUrl: data.signedUrl
                };
            } catch (error) {
                console.error('Error getting signed URL:', error);
                throw error;
            }
        }

        throw new Error('No agent ID or signed URL endpoint configured. Please update elevenlabs_config.js');
    }

    async endConversation() {
        try {
            if (this.conversation) {
                await this.conversation.endSession();
                this.conversation = null;
            }

            this.isConversationActive = false;
            this.updateVoiceStatus('Ready');
            this.elements.talkButton.textContent = 'TALK';
            this.elements.talkButton.disabled = false;
            this.updateButtonStates('ready');

        } catch (error) {
            console.error('Error ending conversation:', error);
        }
    }

    handleConnectionEstablished() {
        this.state.isConnected = true;
        this.updateVoiceStatus('Connected');
        this.elements.talkButton.textContent = 'END';
        this.elements.talkButton.disabled = false;
        this.elements.talkButton.classList.add('end-button');
        this.appendMessage('bot', 'Connection established. You can start speaking now!');
    }

    handleDisconnection() {
        this.state.isConnected = false;
        this.isConversationActive = false;
        this.updateVoiceStatus('Disconnected');
        this.elements.talkButton.textContent = 'TALK';
        this.elements.talkButton.disabled = false;
        this.elements.talkButton.classList.remove('end-button');
        this.appendMessage('bot', 'Conversation ended.');
    }

    handleMessage(message) {
        // Handle different message types
        if (message.type === 'user_transcript') {
            // User's speech transcription
            if (message.text && message.text.trim() !== '') {
                this.appendMessage('user', message.text);
            }
        } else if (message.type === 'agent_response') {
            // Agent's response
            if (message.text && message.text.trim() !== '') {
                this.appendMessage('bot', message.text);
            }
        } else if (message.type === 'user_transcript_final') {
            // Final transcription of user's speech
            // You might want to update the previous message instead of adding a new one
            console.log('Final transcript:', message.text);
        }

        // Store in conversation history
        this.conversationHistory.push(message);
    }

    handleError(error) {
        console.error('Conversation error:', error);
        this.appendMessage('bot', 'Sorry, an error occurred during the conversation. Please try again.');
        this.endConversation();
    }

    handleStatusChange(status) {
        // Update UI based on connection status
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
        // Update UI based on conversation mode
        switch (mode) {
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

    updateVoiceStatus(status) {
        if (this.elements.voiceAction) {
            this.elements.voiceAction.textContent = status;
        }

        // Remove any existing animation classes
        if (this.elements.voiceStatus) {
            this.elements.voiceStatus.classList.remove('listening-pulse', 'speaking-pulse', 'thinking-pulse');

            // Add appropriate animation class based on status
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
        
        // Scroll to bottom
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
        // End conversation if active
        if (this.isConversationActive) {
            await this.endConversation();
        }

        let message = '';
        let action = null;
        
        switch(mode) {
            case 'chronicle':
                message = "Chronicle Mode activated.";
                action = () => {
                    console.log('Chronicle mode started');
                };
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
                action = () => {
                    this.openSettings();
                };
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

    // Method to set configuration
    setConfig(config) {
        this.config = { ...this.config, ...config };
        console.log('ElevenLabs configuration updated:', this.config);
    }

    // Method to get conversation history
    getConversationHistory() {
        return this.conversationHistory;
    }

    // Method to clear conversation history
    clearConversationHistory() {
        this.conversationHistory = [];
        console.log('Conversation history cleared');
    }

    // Cleanup method
    cleanup() {
        if (this.isConversationActive) {
            this.endConversation();
        }
        
        // Remove event listeners if needed
        this.state = {
            isConnected: false,
            isAgentSpeaking: false,
            isUserSpeaking: false,
            currentMode: 'idle',
            networkStatus: 'online'
        };
    }
}
