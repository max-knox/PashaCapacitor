import { App } from '@capacitor/app';
import { DeviceSpeech } from './deviceSpeech.js';
import { DeviceLLM } from './deviceLLM.js';

const SYSTEM_PROMPT = "You are Pasha a highly intelligent and versatile assistant with a genius-level intellect. You excel in technology, programming, reasoning, logic, mathematics, geography, history, ethics, law, and philanthropy. Your vast knowledge also encompasses art, movies, music, comedy, entertainment, and international affairs, allowing you to engage in insightful and meaningful conversations on virtually any topi. Your goal is to assist users with clarity and depth while maintaining a friendly and professional demeanor. You provide accurate, comprehensive, and thoughtful answers to all questions.";
const FIRST_MESSAGE = "Hi!";

export class DeviceController {
    constructor() {
        this.speech = DeviceSpeech;
        this.llm = DeviceLLM;
        this.sessionId = `session_${Date.now()}`;

        this.state = {
            isListening: false,
            isAgentSpeaking: false,
            isProcessing: false,
            currentEndpoint: 'local', // Using local device LLM
            fallbackEndpoint: 'local',
            isModelLoading: false
        };

        this.elements = {
            audioPlayer: null,
            chatMessages: null,
            loader: null,
            voiceAction: null,
            pushToTalkBtn: null,
            voiceStatus: null,
            pushToTalkText: null,
            pauseButton: null
        };

        this.audio = {
            context: null,
            mediaRecorder: null,
            chunks: []
        };

        this.conversation = {
            history: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "assistant", content: FIRST_MESSAGE }
            ],
            lastRequestTime: 0
        };

        this.config = {
            minTimeBetweenRequests: 1000,
            responseDelay: 50
        };

        this.uiStates = {
            isAudioPaused: false,
            originalPushToTalkText: 'PUSH TO TALK'
        };

        this.isInitialized = false;
        this.setupSpeechResultListener();

        this.state = {
            isListening: false,
            isAgentSpeaking: false,
            isProcessing: false,
            currentEndpoint: 'local',
            fallbackEndpoint: 'local'
        };

        window.addEventListener('ttsFinished', () => {
            // Re-enable push to talk or reset states
            this.updateButtonStates('ready');
            this.state.isAgentSpeaking = false;
        });
    }

    async init() {
        if (this.isInitialized) return;
    
        try {
            console.log('Initializing Device Controller');
    
            // Wait for Firebase
            await new Promise((resolve, reject) => {
                if (typeof firebase !== 'undefined' && firebase.apps.length) {
                    console.log('Firebase detected and initialized');
                    resolve();
                } else {
                    const checkFirebase = () => {
                        if (typeof firebase !== 'undefined' && firebase.apps.length) {
                            console.log('Firebase detected and initialized');
                            resolve();
                        } else if (Date.now() - startTime > 10000) {
                            reject(new Error('Firebase initialization timeout'));
                        } else {
                            setTimeout(checkFirebase, 100);
                        }
                    };
                    const startTime = Date.now();
                    checkFirebase();
                }
            });
    
            // Initialize elements and wait for them to be ready
            await new Promise(resolve => {
                this.initializeElements();
                setTimeout(resolve, 150);
            });
    
            // Initialize speech capabilities first
            try {
                await this.speech.initializeSpeech();
                console.log('Speech services initialized successfully');
            } catch (speechError) {
                console.error('Error initializing speech capabilities:', speechError);
                throw speechError;
            }
            
            // Initialize LLM API endpoint
            try {
                this.updateVoiceStatus('Connecting to cloud API...');
                await this.llm.initializeLLM();
                console.log('LLM API endpoint initialized successfully');
                this.updateVoiceStatus('Ready');
            } catch (llmError) {
                console.error('Error initializing LLM API:', llmError);
                this.updateVoiceStatus('Error connecting to API');
                // Continue even if API fails - we have fallback
            }
    
            // Setup event listeners and UI
            this.setupEventListeners();
            this.setupModeButtons();
    
            // Initialize audio context
            this.initAudioContext();
    
            // Check network status and update UI
            if (!navigator.onLine) {
                this.updateVoiceStatus('Offline - Limited functionality');
                // Still enable button - allow local fallback
                if (this.elements.pushToTalkBtn) {
                    this.elements.pushToTalkBtn.disabled = false;
                }
            } else {
                if (this.elements.chatMessages) {
                    this.appendMessage('bot', FIRST_MESSAGE);
                    try {
                        await this.delay(500);
                        await this.speech.speak(FIRST_MESSAGE, { lang: 'en-US' });
                    } catch (error) {
                        console.error('Error playing initial audio:', error.message || error);
                    }
                }
            }
    
            // Set up app state listeners
            App.addListener('appStateChange', async ({ isActive }) => {
                if (!isActive) {
                    await this.cleanup();
                }
            });
    
            // Setup window event listeners
            window.addEventListener('online', () => {
                this.updateVoiceStatus('Ready - Connected to cloud');
                if (this.elements.pushToTalkBtn) {
                    this.elements.pushToTalkBtn.disabled = false;
                }
            });
    
            window.addEventListener('offline', () => {
                this.updateVoiceStatus('Offline - Limited functionality');
                // Still enable button - allow local fallback
                if (this.elements.pushToTalkBtn) {
                    this.elements.pushToTalkBtn.disabled = false;
                }
            });
    
            // Display welcome card
            const pashaCanvas = document.querySelector('.pasha_canvas');
            if (pashaCanvas) {
                const welcomeCard = this.createWelcomeCard();
                pashaCanvas.insertBefore(welcomeCard, pashaCanvas.firstChild);
            }
    
            this.isInitialized = true;
            this.updateVoiceStatus('Ready');
            this.updateButtonStates('ready');
    
            console.log('Device Controller initialization complete');
    
        } catch (error) {
            console.error('Initialization error:', error.message || error);
            if (this.elements.chatMessages) {
                this.appendMessage('bot', 'Sorry, there was an error initializing the application. Please refresh the page and try again.');
            }
            this.updateVoiceStatus('Error');
            if (this.elements.pushToTalkBtn) {
                this.elements.pushToTalkBtn.disabled = true;
            }
            await this.cleanup();
            throw error;
        }
    }  

    async forceCleanup() {
        try {
            // Stop speech recognition
            if (this.recognition) {
                await this.recognition.stop().catch(() => {});
                await this.removeAllListeners();
            }
            
            // Stop any ongoing speech
            if (this.tts) {
                await this.tts.stop().catch(() => {});
            }
    
            // Reset all flags
            this.isInitialized = false;
            this.isListening = false;
            this.lastStartTime = null;
            this.currentRecognitionInstance = null;
            this.lastPartialResult = null;
            this.finalResultReceived = false;
            this.isStopping = false;
            this.isAgentSpeaking = false;
    
            // Re-initialize if needed
            if (!this.isInitialized) {
                await this.initializeSpeech().catch(() => {});
            }
        } catch (error) {
            console.error('Error in forceCleanup:', error);
        }
    }

    async resetState() {
        try {
            // Disable button during reset to prevent multiple clicks
            if (this.elements.pushToTalkBtn) {
                this.elements.pushToTalkBtn.disabled = true;
            }
        
            // Force complete cleanup of speech services
            if (this.speech?.forceCleanup) {
                await this.speech.forceCleanup();
            } else {
                // Fallback cleanup
                await this.speech?.stopSpeaking?.().catch(() => {});
                await this.speech?.stopListening?.().catch(() => {});
                await this.cleanupAudio();
            }
            await this.cleanupAudio();
        
            // Reset speech initialization flag
            if (this.speech) {
                this.speech.isInitialized = false;  // Add this line
            }
    
            // Reset all state flags with a fresh state object
            this.state = {
                isListening: false,
                isAgentSpeaking: false,
                isProcessing: false,
                currentEndpoint: this.state?.currentEndpoint || 'local',
                fallbackEndpoint: this.state?.fallbackEndpoint || 'local'
            };
        
            // Reset UI elements
            this.updatePushToTalkStyle(false);
            this.updateVoiceStatus('Ready');
            this.updateButtonStates('ready');
        
            // Clear any stored data
            this.lastPartialResult = null;
            this.listenStartTime = null;
    
            // Re-setup event listeners
            this.setupEventListeners();
        
            // Force re-initialization of speech services
            await this.speech?.initializeSpeech().catch(console.error);  // Add this line
        
            // Small delay before re-enabling button
            await new Promise(resolve => setTimeout(resolve, 100));
        
            // Re-enable button
            if (this.elements.pushToTalkBtn) {
                this.elements.pushToTalkBtn.disabled = false;
            }
            console.log('Reset completed successfully', this.state);
        } catch (error) {
            console.error('Error in resetState:', error);
            // Reset state even in case of error
            this.state = {
                isListening: false,
                isAgentSpeaking: false,
                isProcessing: false,
                currentEndpoint: this.state?.currentEndpoint || 'local',
                fallbackEndpoint: this.state?.fallbackEndpoint || 'local'
            };
            if (this.elements.pushToTalkBtn) {
                this.elements.pushToTalkBtn.disabled = false;
            }
        }
    }

    setupSpeechResultListener() {
        window.addEventListener('speechRecognitionResult', async (event) => {
            const userText = event.detail.text;
            console.log('Received final speech result:', userText);
            
            if (!userText) return;

            try {
                // Update UI to show processing state
                this.updateVoiceStatus('Processing...');
                if (this.elements.loader) {
                    this.elements.loader.style.display = "flex";
                }

                // Add user's text to chat
                this.appendMessage('user', userText);

                // Get response from LLM
                console.log('Sending to LLM:', userText);
                const response = await this.llm.generateResponse(userText, this.sessionId);
                console.log('LLM response:', response);

                // Handle special cards if present
                if (response.cardData && response.cardData.type === 'dateTime') {
                    this.displayDateTimeCard(response.cardData);
                }

                // Add bot's response to chat
                this.appendMessage('bot', response.text);
                
                // Speak the response
                const cleanedResponse = this.cleanTextForSpeech(response.text);
                console.log('Speaking response:', cleanedResponse);
                await this.speech.speak(cleanedResponse);

                this.updateVoiceStatus('Ready');
            } catch (error) {
                console.error('Error processing speech:', error);
                this.appendMessage('bot', 'Sorry, I had trouble processing that. Could you try again?');
                this.updateVoiceStatus('Error');
            } finally {
                if (this.elements.loader) {
                    this.elements.loader.style.display = "none";
                }
                this.state.isProcessing = false;
            }
        });
    }

    initializeElements() {
        setTimeout(() => {
            this.elements = {
                audioPlayer: document.getElementById("audioPlayer"),
                chatMessages: document.getElementById("chat-messages"),
                loader: document.getElementById("loader"),
                voiceAction: document.getElementById("voice-action"),
                pushToTalkBtn: document.querySelector('button.push-talk-btn'),
                voiceStatus: document.querySelector('.voice_status'),
                pushToTalkText: document.querySelector('button.push-talk-btn'),
                pauseButton: document.querySelector('button.pause-btn')
            };

            if (this.elements.pushToTalkBtn) {
                this.elements.pushToTalkBtn.disabled = false;
                if (!this.elements.pushToTalkBtn.classList.contains('terminal-medium')) {
                    this.elements.pushToTalkBtn.classList.add('terminal-medium');
                }
            }

            if (this.elements.pauseButton) {
                this.elements.pauseButton.style.display = 'none';
                if (!this.elements.pauseButton.classList.contains('terminal-medium')) {
                    this.elements.pauseButton.classList.add('terminal-medium');
                }
            }

            console.log('Initialized elements:', this.elements);
        }, 100);
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    initAudioContext() {
        const initAudio = () => {
            if (!this.audio.context) {
                this.audio.context = new (window.AudioContext || window.webkitAudioContext)();
            }
            document.removeEventListener('click', initAudio);
        };
        document.addEventListener('click', initAudio);
    }

    updatePushToTalkStyle(isPressed) {
        if (this.elements.pushToTalkBtn) {
            if (isPressed) {
                this.elements.pushToTalkBtn.style.backgroundColor = '#3e6cc1';
                this.elements.pushToTalkBtn.style.color = 'white';
                this.elements.pushToTalkBtn.style.transition = 'all 0.3s ease';
            } else {
                this.elements.pushToTalkBtn.style.backgroundColor = '';
                this.elements.pushToTalkBtn.style.color = '';
            }
        }
    
        if (this.elements.pauseButton) {
            this.elements.pauseButton.addEventListener('mouseover', () => {
                this.elements.pauseButton.style.backgroundColor = '#3e6cc1';
                this.elements.pauseButton.style.color = 'white';
                this.elements.pauseButton.style.transition = 'all 0.3s ease';
            });
            
            this.elements.pauseButton.addEventListener('mouseout', () => {
                this.elements.pauseButton.style.backgroundColor = '';
                this.elements.pauseButton.style.color = '';
            });
        }
    }
    
    setupEventListeners() {
        console.log('Setting up event listeners');
        
        // Push to Talk Button Event Handlers
        if (this.elements.pushToTalkBtn) {
            const handleStart = async (e) => {
                console.log('Push-to-talk button pressed'); // Add this line
                if (!this.elements.pushToTalkBtn.disabled) {
                    e.preventDefault();
                    try {
                        this.updatePushToTalkStyle(true);
                        await this.startListening();
                    } catch (error) {
                        console.error('Error starting listening:', error);
                        this.updateVoiceStatus('Error starting listening');
                        this.updatePushToTalkStyle(false);
                    }
                }
            };

            const handleStop = async (e) => {
                if (!this.elements.pushToTalkBtn.disabled) {
                    e.preventDefault();
                    try {
                        this.updatePushToTalkStyle(false);
                        await this.stopListening();
                    } catch (error) {
                        console.error('Error stopping listening:', error);
                        this.updateVoiceStatus('Error stopping listening');
                    }
                }
            };

            // Mouse events
            this.elements.pushToTalkBtn.addEventListener('mousedown', handleStart);
            this.elements.pushToTalkBtn.addEventListener('mouseup', handleStop);
            this.elements.pushToTalkBtn.addEventListener('mouseleave', handleStop);

            // Touch events
            this.elements.pushToTalkBtn.addEventListener('touchstart', handleStart);
            this.elements.pushToTalkBtn.addEventListener('touchend', handleStop);
        }

        // Listen for speech recognition results
        window.addEventListener('speechRecognitionResult', (event) => {
            if (event.detail.text) {
                this.processUserInput(event.detail.text);
            }
        });

        // Pause Button Event Handler
        if (this.elements.pauseButton) {
            this.elements.pauseButton.addEventListener('click', async () => {
                try {
                    await this.handlePauseResume();
                } catch (error) {
                    console.error('Error handling pause/resume:', error);
                    this.updateVoiceStatus('Error with playback');
                }
            });
        }
    
        // Audio Player Event Handlers
        if (this.elements.audioPlayer) {
            this.elements.audioPlayer.addEventListener('play', () => {
                try {
                    this.handleAudioPlay();
                } catch (error) {
                    console.error('Error handling audio play:', error);
                }
            });
    
            this.elements.audioPlayer.addEventListener('pause', () => {
                try {
                    this.handleAudioPause();
                } catch (error) {
                    console.error('Error handling audio pause:', error);
                }
            });
    
            this.elements.audioPlayer.addEventListener('ended', () => {
                try {
                    this.handleAudioEnded();
                } catch (error) {
                    console.error('Error handling audio end:', error);
                }
            });
    
            this.elements.audioPlayer.addEventListener('error', (e) => {
                console.error('Audio playback error:', e);
                this.handleAudioEnded();
                this.updateVoiceStatus('Ready');
                this.updateButtonStates('ready');
            });
        }
    
        // Document Visibility Change Handler
        document.addEventListener('visibilitychange', async () => {
            if (document.hidden && this.state.isListening) {
                try {
                    await this.stopListening();
                    this.updatePushToTalkStyle(false);
                } catch (error) {
                    console.error('Error handling visibility change:', error);
                }
            }
        });
    
        // Window Blur Handler
        window.addEventListener('blur', async () => {
            if (this.state.isListening) {
                try {
                    await this.stopListening();
                    this.updatePushToTalkStyle(false);
                } catch (error) {
                    console.error('Error handling window blur:', error);
                }
            }
        });
    
        // Network Status Handlers
        window.addEventListener('online', () => {
            this.updateVoiceStatus('Ready');
            if (this.elements.pushToTalkBtn) {
                this.elements.pushToTalkBtn.disabled = false;
            }
        });
    
        window.addEventListener('offline', () => {
            this.updateVoiceStatus('Offline');
            if (this.elements.pushToTalkBtn) {
                this.elements.pushToTalkBtn.disabled = true;
            }
        });
    }
    
    async startListening() {
        console.log('Start listening called, current state:', this.state);
        
        if (this.state.isProcessing || this.state.isAgentSpeaking || this.state.isListening) {
            console.log('Cannot start listening - already in progress');
            // Force cleanup if we detect we're in a bad state
            await this.resetState();
            return;
        }
    
        try {
            // Ensure speech is initialized before starting again
            await this.speech.initializeSpeech();
            // Force cleanup before starting new session
            if (this.speech?.forceCleanup) {
                await this.speech.forceCleanup();
            } else {
                // Fallback cleanup
                await this.speech?.stopSpeaking?.().catch(() => {});
                await this.speech?.stopListening?.().catch(() => {});
                await this.cleanupAudio();
            }
            
            // Reset state before starting
            this.state.isListening = true;
            this.listenStartTime = Date.now();
            this.updateVoiceStatus('Listening...');
            this.lastPartialResult = null;
    
            await this.speech.startListening(async (partialResult) => {
                console.log('Received partial result:', partialResult);
                this.lastPartialResult = partialResult;
                
                // Update UI with partial result
                if (this.elements.chatMessages) {
                    const existingMsg = this.elements.chatMessages.querySelector('.partial-msg');
                    if (existingMsg) {
                        existingMsg.remove();
                    }
                    
                    const msgDiv = document.createElement('div');
                    msgDiv.classList.add('msg', 'right-msg', 'partial-msg');
                    msgDiv.innerHTML = `
                        <div class="msg-bubble">
                            <div class="msg-info">
                                <div class="msg-info-name">You</div>
                            </div>
                            <div class="msg-text">${this.formatText(partialResult)}</div>
                        </div>
                    `;
                    this.elements.chatMessages.appendChild(msgDiv);
                    this.scrollToBottom();
                }
    
                // Process with LLM if partial result is longer than 3 words
                const wordCount = partialResult.trim().split(/\s+/).length;
                if (wordCount >= 3) {
                    try {
                        // Disable button during processing
                        if (this.elements.pushToTalkBtn) {
                            this.elements.pushToTalkBtn.disabled = true;
                        }
    
                        const response = await this.llm.generateResponse(partialResult, this.sessionId);
                        console.log('Partial LLM response:', response);
                        
                        // Remove previous partial bot response if exists
                        if (this.elements.chatMessages) {
                            const existingBotMsg = this.elements.chatMessages.querySelector('.partial-bot-msg');
                            if (existingBotMsg) {
                                existingBotMsg.remove();
                            }
                            
                            // Add new partial bot response
                            const botMsgDiv = document.createElement('div');
                            botMsgDiv.classList.add('msg', 'left-msg', 'partial-bot-msg');
                            botMsgDiv.innerHTML = `
                                <div class="msg-img" style="background-image: url('assets/img/ux_icons/bot_icon.png')"></div>
                                <div class="msg-bubble">
                                    <div class="msg-info">
                                        <div class="msg-info-name">Pasha</div>
                                    </div>
                                    <div class="msg-text">${this.formatText(response.text)}</div>
                                </div>
                            `;
                            this.elements.chatMessages.appendChild(botMsgDiv);
                            this.scrollToBottom();
                            console.log('Added response to chat:', response.text);
                            
                            // Speak the response
                            await this.speech.speak(response.text);
                            
                            // Clean up state after speaking
                            await this.resetState();
                        }
                    } catch (error) {
                        console.error('Error processing partial result with LLM:', error);
                        await this.resetState();
                    } finally {
                        // Re-enable button
                        if (this.elements.pushToTalkBtn) {
                            this.elements.pushToTalkBtn.disabled = false;
                        }
                    }
                }
            });
    
        } catch (error) {
            console.error('Error in startListening:', error);
            this.updateVoiceStatus('Error starting listening');
            await this.resetState();
        }
    }
    
    async stopListening() {
        try {
            // Delegate to DeviceSpeech only
            await this.speech.stopListening();
            this.state.isListening = false;
        } catch (error) {
            console.error('Error stopping listening:', error);
        } finally {
            this.updatePushToTalkStyle(false);
            this.updateVoiceStatus('Ready');
        }
    }
    
    updateButtonStates(state) {
        if (!this.elements.pushToTalkBtn || !this.elements.pauseButton) return;
    
        switch (state) {
            case 'audio_playing':
                this.elements.pauseButton.style.display = 'flex';
                this.elements.pauseButton.classList.add('visible');
                this.elements.pauseButton.textContent = 'PAUSE';
                this.elements.pushToTalkBtn.disabled = true;
                this.elements.pushToTalkBtn.textContent = 'PUSH TO TALK';
                break;
                
            case 'audio_paused':
                this.elements.pauseButton.textContent = 'RESUME';
                this.elements.pushToTalkBtn.disabled = false;
                this.elements.pushToTalkBtn.textContent = 'ASK NEW QUESTION';
                break;
                
            case 'ready':
                this.elements.pauseButton.style.display = 'none';
                this.elements.pauseButton.classList.remove('visible');
                this.elements.pushToTalkBtn.disabled = false;
                this.elements.pushToTalkBtn.textContent = 'PUSH TO TALK';
                break;
        }
    
        console.log('Button states updated:', {
            state,
            pauseButton: {
                display: this.elements.pauseButton.style.display,
                text: this.elements.pauseButton.textContent,
                visible: this.elements.pauseButton.classList.contains('visible')
            },
            pushToTalkBtn: {
                disabled: this.elements.pushToTalkBtn.disabled,
                text: this.elements.pushToTalkBtn.textContent
            }
        });
    }
    
    updateVoiceStatus(status) {
        if (this.elements.voiceAction) {
            this.elements.voiceAction.textContent = status;
        }
    
        if (this.elements.voiceStatus) {
            this.elements.voiceStatus.classList.remove('listening-pulse', 'speaking-pulse');
    
            if (status === 'Listening') {
                this.elements.voiceStatus.classList.add('listening-pulse');
            } else if (status === 'Speaking') {
                this.elements.voiceStatus.classList.add('speaking-pulse');
            }
        }
    }

    // deviceController.js - Part 3 (continuing from previous)

    async handlePauseResume() {
        if (!this.elements.audioPlayer) return;
        
        console.log('Handle pause/resume:', {
            paused: this.elements.audioPlayer.paused,
            currentTime: this.elements.audioPlayer.currentTime,
            duration: this.elements.audioPlayer.duration
        });

        try {
            if (this.state.isAgentSpeaking) {
                await this.speech.stopSpeaking();
                this.updateButtonStates('audio_paused');
                this.state.isAgentSpeaking = false;
            } else {
                await this.speech.speak(this.lastSpokenText);
                this.updateButtonStates('audio_playing');
                this.state.isAgentSpeaking = true;
            }
        } catch (error) {
            console.error('Error in handlePauseResume:', error);
            this.cleanupAudio();
        }
    }

    async processUserInput(userText) {
        if (!userText || this.state.isProcessing) return;

        try {
            this.state.isProcessing = true;
            this.updateVoiceStatus('Processing...');

            if (this.elements.loader) {
                this.elements.loader.style.display = "flex";
            }

            // Add user message to chat
            this.appendMessage('user', userText);

            // Generate response using device LLM
            const response = await this.llm.generateResponse(userText, this.sessionId);

            // Handle datetime card if present
            if (response.cardData && response.cardData.type === 'dateTime') {
                this.displayDateTimeCard(response.cardData);
            }

            // Handle meetings if present
            if (response.meetings && response.meetings.length > 0) {
                const cardContent = this.createActionItemsCard(response.meetings);
                this.appendMessage('bot', cardContent);
            }

            // Add bot message and speak response
            this.appendMessage('bot', response.text);
            this.lastSpokenText = this.cleanTextForSpeech(response.text);
            await this.speech.speak(this.lastSpokenText);

            this.updateVoiceStatus('Ready');
        } catch (error) {
            console.error('Error processing input:', error);
            this.appendMessage('bot', 'Sorry, I encountered an error. Please try again.');
            this.updateVoiceStatus('Error processing');
        } finally {
            this.state.isProcessing = false;
            if (this.elements.loader) {
                this.elements.loader.style.display = "none";
            }
        }
    }

    displayDateTimeCard(cardData) {
        const canvas = document.querySelector('.pasha_canvas');
        if (canvas) {
            const existingCard = canvas.querySelector('.datetime-card');
            if (existingCard) {
                existingCard.remove();
            }

            const card = document.createElement('div');
            card.classList.add('datetime-card');
            card.innerHTML = `
                <div class="datetime-header">
                    <h3>Current Time & Date</h3>
                    <button class="close-btn" onclick="this.closest('.datetime-card').remove()">&times;</button>
                </div>
                <div class="datetime-content">
                    <div class="time">${cardData.content.time}</div>
                    <div class="date">${cardData.content.date}</div>
                </div>
            `;
            
            canvas.insertBefore(card, canvas.firstChild);
        }
    }

    appendMessage(role, content) {
        if (!this.elements.chatMessages) {
            console.error('Chat messages container not found');
            return;
        }

        const msgDiv = document.createElement("div");
        msgDiv.classList.add("msg", role === "user" ? "right-msg" : "left-msg");

        let innerHTML = '';
        if (role === 'bot') {
            innerHTML += `<div class="msg-img" style="background-image: url('assets/img/ux_icons/bot_icon.png')"></div>`;
        }

        innerHTML += `
            <div class="msg-bubble">
                <div class="msg-info">
                    <div class="msg-info-name">${role === "user" ? "You" : "Pasha"}</div>
                </div>
                <div class="msg-text">
                    ${typeof content === 'string' ? this.formatText(content) : ''}
                </div>
            </div>
        `;

        msgDiv.innerHTML = innerHTML;

        // If content is an HTML element, append it to msg-text
        if (content instanceof HTMLElement) {
            msgDiv.querySelector('.msg-text').appendChild(content);
        }

        this.elements.chatMessages.appendChild(msgDiv);
        this.scrollToBottom();
    }

    scrollToBottom() {
        requestAnimationFrame(() => {
            const chatMessages = this.elements.chatMessages;
            const horizonHero = chatMessages?.closest('.horizon_hero');
            const horizonBot = chatMessages?.closest('.horizon_bot');
            
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

    cleanTextForSpeech(text) {
        return text.replace(/\*\*(.*?)\*\*/g, '$1')
                   .replace(/\*(.*?)\*/g, '$1')
                   .replace(/^#+\s*/gm, '')
                   .replace(/`(.*?)`/g, '$1')
                   .replace(/^\s*[-*+]\s/gm, '')
                   .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
                   .replace(/\s+/g, ' ').trim();
    }

    handleAudioPlay() {
        this.state.isAgentSpeaking = true;
        this.updateVoiceStatus('Speaking');
        this.updateButtonStates('audio_playing');
    }
    
    handleAudioPause() {
        if (this.state.isAgentSpeaking) {
            this.updateVoiceStatus('Paused');
            this.updateButtonStates('audio_paused');
        }
    }
    
    handleAudioEnded() {
        this.state.isAgentSpeaking = false;
        this.updateVoiceStatus('Ready');
        this.updateButtonStates('ready');
    }

// deviceController.js - Part 4 (final part)

async handleModeButtonClick(mode) {
    let message = '';
    let action = null;
    
    switch(mode) {
        case 'ask':
            message = "Ask Mode activated. You can ask me anything!";
            action = () => {
                document.querySelector('.agent_s3')?.classList.add('highlight');
            };
            break;
            
        case 'meeting':
            message = "Meeting Mode activated. I can help you manage meetings and action items.";
            action = () => {
                const meetingController = new MeetingController(firebase.firestore());
                meetingController.init();
            };
            break;
            
        case 'chronicle':
            message = "Chronicle Mode activated. I'll record our conversation history.";
            action = () => {
                this.startChronicleMode();
            };
            break;
            
        case 'scheduler':
            message = "Scheduler activated. I can help you manage your calendar.";
            action = () => {
                this.appendMessage('bot', 'You can say things like:\n- Schedule a meeting\n- Set a reminder\n- Add to calendar');
            };
            break;
            
        case 'messenger':
            message = "Messenger activated. I can help you with communications.";
            action = () => {
                this.appendMessage('bot', 'You can:\n- Send an email\n- Send a text message\n- Leave a voice message');
            };
            break;
            
        case 'news':
            message = "News Mode activated. I'll keep you updated on current events.";
            action = async () => {
                await this.fetchAndDisplayNews();
            };
            break;
            
        case 'settings':
            message = "Settings panel opened.";
            action = () => {
                this.openSettings();
            };
            break;
            
        case 'history':
            message = "Displaying conversation history.";
            action = () => {
                this.displayHistory();
            };
            break;
    }

    this.appendMessage('bot', message);
    await this.speech.speak(message);
    
    if (action) {
        action();
    }
}

setupModeButtons() {
    const buttonIds = {
        'ask': 'askAnythingBtn',
        'meeting': 'meetingModeBtn',
        'chronicle': 'chronicleModeBtn',
        'scheduler': 'schedulerBtn',
        'messenger': 'messengerBtn',
        'news': 'newsBtn',
        'settings': 'settingsModeBtn',
        'history': 'historyModeBtn'
    };

    for (const [mode, id] of Object.entries(buttonIds)) {
        const button = document.getElementById(id);
        if (button) {
            button.addEventListener('click', () => this.handleModeButtonClick(mode));
        }
    }
}

createWelcomeCard() {
    const card = document.createElement('div');
    card.classList.add('welcome-card', 'shadow1');
    
    card.innerHTML = `
        <button class="close-btn" onclick="this.closest('.welcome-card').remove()">&times;</button>
        <h3>Pasha Device Assistant v1.0</h3>
        <p>Try asking:</p>
        <ul class="command-list">
            <li>What time is it?</li>
            <li>What's today's date?</li>
            <li>Show my calendar</li>
            <li>Check my meetings</li>
            <li>Take a note</li>
            <li>Send a message</li>
        </ul>
    `;
    
    return card;
}

openSettings() {
    const settingsContent = document.createElement('div');
    settingsContent.classList.add('settings-panel');
    settingsContent.innerHTML = `
        <h3>Settings</h3>
        <div class="setting-item">
            <label>Voice Speed:</label>
            <select id="voiceSpeed">
                <option value="0.8">Slow</option>
                <option value="1.0" selected>Normal</option>
                <option value="1.2">Fast</option>
            </select>
        </div>
        <div class="setting-item">
            <label>Language:</label>
            <select id="language">
                <option value="en-US" selected>English (US)</option>
                <option value="es-ES">Spanish</option>
            </select>
        </div>
    `;
    
    this.appendMessage('bot', settingsContent);
}

displayHistory() {
    const history = this.conversation.history
        .filter(msg => msg.role !== 'system')
        .map(msg => ({
            role: msg.role,
            content: this.cleanTextForSpeech(msg.content)
        }));
        
    const historyContent = document.createElement('div');
    historyContent.classList.add('history-panel');
    
    history.forEach(msg => {
        const msgElement = document.createElement('div');
        msgElement.classList.add('history-item', msg.role);
        msgElement.textContent = `${msg.role === 'user' ? 'You' : 'Pasha'}: ${msg.content}`;
        historyContent.appendChild(msgElement);
    });
    
    this.appendMessage('bot', historyContent);
}

async cleanupAudio() {
    try {
        await this.speech.stopSpeaking();
        this.state.isAgentSpeaking = false;
        this.state.isProcessing = false;
        this.updateButtonStates('ready');
    } catch (error) {
        console.error('Error in cleanupAudio:', error);
    }
}

async cleanup() {
    try {
        // First cleanup speech-related states and listeners
        await this.speech.cleanup();
        
        // Then cleanup UI and other states
        if (this.elements.pushToTalkBtn) {
            this.elements.pushToTalkBtn.replaceWith(this.elements.pushToTalkBtn.cloneNode(true));
        }
        if (this.elements.pauseButton) {
            this.elements.pauseButton.replaceWith(this.elements.pauseButton.cloneNode(true));
        }

        this.state.isListening = false;
        this.state.isAgentSpeaking = false;
        this.state.isProcessing = false;

        if (this.audio.context && this.audio.context.state !== 'closed') {
            await this.audio.context.close();
        }

        this.updateVoiceStatus('Ready');
    } catch (error) {
        console.error('Error during cleanup:', error);
    }
}
}