const SYSTEM_PROMPT = "You are Pasha, an AI assistant.";
const FIRST_MESSAGE = "Pasha is ready. Push and hold the button to talk!";

export class PushController {
    constructor() {
        this.sessionId = null;
        this.state = {
          isListening: false,
          isAgentSpeaking: false,
          isProcessing: false,
          currentEndpoint: 'https://us-central1-pa-sha.cloudfunctions.net/agent_completions_enhanced_v1', // Primary endpoint
          fallbackEndpoint: 'https://us-central1-pa-sha.cloudfunctions.net/agent_completions_enhanced_v1', // Backup endpoint
          localFallbackEnabled: true, // Enable local fallback when both endpoints fail
          networkStatus: 'online', // Track network status
          lastSuccessfulEndpoint: null, // Track which endpoint worked last
          offlineMode: false // Whether we're operating in offline mode
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
    }

    async init() {
        if (this.isInitialized) return;
    
        try {
            console.log('Initializing PushController...');
    
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
                setTimeout(resolve, 150); // Give time for elements to initialize
            });
    
            // Verify critical elements are present
            if (!this.elements.pushToTalkBtn || !this.elements.pauseButton) {
                throw new Error('Critical UI elements not found');
            }
    
            // Initial UI setup
            this.elements.pauseButton.style.display = 'none';
            this.elements.pushToTalkBtn.disabled = false;
            this.elements.pushToTalkBtn.textContent = this.uiStates.originalPushToTalkText;
    
            // Setup all event listeners
            this.setupEventListeners();
    
            // Initialize audio context
            this.initAudioContext();
            
            // Setup network status monitoring
            this.setupNetworkMonitoring();
    
            // Setup mode buttons
            this.setupModeButtons();
    
            // Check for necessary permissions
            try {
                const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
                if (permissionStatus.state === 'denied') {
                    throw new Error('Microphone permission denied');
                }
            } catch (error) {
                console.warn('Could not query microphone permission:', error);
            }
    
            // Check network status and update UI accordingly
            if (!navigator.onLine) {
                this.updateVoiceStatus('Offline');
                this.elements.pushToTalkBtn.disabled = true;
            } else {
                // Display initial message if online
                if (this.elements.chatMessages) {
                    this.appendMessage('bot', FIRST_MESSAGE);
                    
                    try {
                        // Add slight delay before playing initial audio
                        await this.delay(500);
                        await this.playAudioResponse(FIRST_MESSAGE);
                    } catch (error) {
                        console.error('Error playing initial audio:', error);
                        // Continue initialization even if audio fails
                    }
                }
            }
    
            // Set initial voice status
            this.updateVoiceStatus('Ready');
    
            // Initialize button states
            this.updateButtonStates('ready');
    
            // Setup additional event listeners for online/offline status
            window.addEventListener('online', () => {
                this.updateVoiceStatus('Ready');
                this.elements.pushToTalkBtn.disabled = false;
            });
    
            window.addEventListener('offline', () => {
                this.updateVoiceStatus('Offline');
                this.elements.pushToTalkBtn.disabled = true;
            });
    
            this.isInitialized = true;
            console.log('PushController initialization complete');
    
        } catch (error) {
            console.error('Initialization error:', error);
            
            // Attempt to show error to user
            if (this.elements.chatMessages) {
                this.appendMessage('bot', 'Sorry, there was an error initializing the application. Please refresh the page and try again.');
            }
    
            // Update UI to reflect error state
            this.updateVoiceStatus('Error');
            if (this.elements.pushToTalkBtn) {
                this.elements.pushToTalkBtn.disabled = true;
            }
    
            // Clean up any partial initialization
            try {
                await this.cleanup();
            } catch (cleanupError) {
                console.error('Cleanup error:', cleanupError);
            }
    
            // Rethrow error for upstream handling
            throw error;
        }
    }
    
    // Helper method to delay execution
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    // Helper method to check if audio is supported
    checkAudioSupport() {
        try {
            return 'AudioContext' in window || 'webkitAudioContext' in window;
        } catch (e) {
            return false;
        }
    }

  updatePushToTalkStyle(isPressed) {
    // Handle push to talk button
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

    // Handle pause button hover
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

  initializeElements() {
    // Wait a small amount of time to ensure DOM is ready
    setTimeout(() => {
        this.elements = {
            audioPlayer: document.getElementById("audioPlayer"),
            chatMessages: document.getElementById("chat-messages"),
            loader: document.getElementById("loader"),
            voiceAction: document.getElementById("voice-action"),
            pushToTalkBtn: document.querySelector('button.push-talk-btn'),  // Updated
            voiceStatus: document.querySelector('.voice_status'),
            pushToTalkText: document.querySelector('button.push-talk-btn'),  // Updated
            pauseButton: document.querySelector('button.pause-btn')  // Updated
        };

        console.log('Initialized elements:', this.elements);

        // Add necessary classes and initial states
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

        for (const [key, element] of Object.entries(this.elements)) {
            if (!element) {
                console.error(`Element ${key} not found in the DOM`);
            }
        }
    }, 100);
}

updateButtonStates(state) {
    if (!this.elements.pushToTalkBtn || !this.elements.pauseButton) return;

    switch (state) {
        case 'audio_playing':
            this.elements.pauseButton.style.display = 'flex'; // Changed from 'block'
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

    // Log the current state for debugging
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

async handlePauseResume() {
    if (!this.elements.audioPlayer) return;
    
    console.log('Handle pause/resume:', {
        paused: this.elements.audioPlayer.paused,
        currentTime: this.elements.audioPlayer.currentTime,
        duration: this.elements.audioPlayer.duration
    });

    try {
        if (this.elements.audioPlayer.paused) {
            // Update UI before attempting to play
            this.updateButtonStates('audio_playing');
            this.elements.audioPlayer.play().then(() => {
                this.state.isAgentSpeaking = true;
            }).catch(error => {
                console.error('Error resuming audio:', error);
                this.cleanupAudio();
            });
        } else {
            this.elements.audioPlayer.pause();
            this.state.isAgentSpeaking = true; // Keep state as speaking while paused
            this.updateButtonStates('audio_paused');
        }
    } catch (error) {
        console.error('Error in handlePauseResume:', error);
        this.cleanupAudio();
    }
}

setupEventListeners() {
    // Push to Talk Button Events
    if (this.elements.pushToTalkBtn) {
        // Mouse events
        this.elements.pushToTalkBtn.addEventListener('mousedown', (e) => {
            if (!this.elements.pushToTalkBtn.disabled) {
                this.updatePushToTalkStyle(true);
                this.startListening();
            }
        });

        this.elements.pushToTalkBtn.addEventListener('mouseup', (e) => {
            if (!this.elements.pushToTalkBtn.disabled) {
                this.updatePushToTalkStyle(false);
                this.stopListening();
            }
        });

        this.elements.pushToTalkBtn.addEventListener('mouseleave', (e) => {
            if (!this.elements.pushToTalkBtn.disabled) {
                this.updatePushToTalkStyle(false);
                this.stopListening();
            }
        });

        // Touch events for mobile
        this.elements.pushToTalkBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (!this.elements.pushToTalkBtn.disabled) {
                this.updatePushToTalkStyle(true);
                this.startListening();
            }
        });

        this.elements.pushToTalkBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            if (!this.elements.pushToTalkBtn.disabled) {
                this.updatePushToTalkStyle(false);
                this.stopListening();
            }
        });

        // Handle touch cancellation
        this.elements.pushToTalkBtn.addEventListener('touchcancel', (e) => {
            e.preventDefault();
            if (!this.elements.pushToTalkBtn.disabled) {
                this.updatePushToTalkStyle(false);
                this.stopListening();
            }
        });
    }

    // Pause Button Events
    if (this.elements.pauseButton) {
        this.elements.pauseButton.addEventListener('click', () => {
            this.handlePauseResume();
        });
    }

    // Audio Player Events
    if (this.elements.audioPlayer) {
        this.elements.audioPlayer.addEventListener('play', () => {
            this.handleAudioPlay();
        });

        this.elements.audioPlayer.addEventListener('pause', () => {
            this.handleAudioPause();
        });

        this.elements.audioPlayer.addEventListener('ended', () => {
            this.handleAudioEnded();
        });

        // Handle audio errors
        this.elements.audioPlayer.addEventListener('error', (e) => {
            console.error('Audio playback error:', e);
            this.handleAudioEnded(); // Reset states on error
            this.updateVoiceStatus('Ready');
            this.updateButtonStates('ready');
        });
    }

    // Handle page visibility changes
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && this.state.isListening) {
            this.stopListening();
            this.updatePushToTalkStyle(false);
        }
    });

    // Handle window blur (user switches tabs/apps)
    window.addEventListener('blur', () => {
        if (this.state.isListening) {
            this.stopListening();
            this.updatePushToTalkStyle(false);
        }
    });

    // Optional: Handle window resize for mobile orientation changes
    window.addEventListener('resize', () => {
        if (this.state.isListening) {
            // Adjust UI if needed during orientation change
            this.updatePushToTalkStyle(true);
        }
    });

    // Optional: Handle offline/online status
    window.addEventListener('online', () => {
        if (this.elements.voiceAction) {
            this.updateVoiceStatus('Ready');
        }
    });

    window.addEventListener('offline', () => {
        if (this.elements.voiceAction) {
            this.updateVoiceStatus('Offline');
        }
        if (this.state.isListening) {
            this.stopListening();
            this.updatePushToTalkStyle(false);
        }
    });
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
  
    updateVoiceStatus(status) {
      if (this.elements.voiceAction) {
        this.elements.voiceAction.textContent = status;
      }
  
      // Remove any existing animation classes
      this.elements.voiceStatus.classList.remove('listening-pulse', 'speaking-pulse');
  
      // Add appropriate animation class based on status
      if (status === 'Listening') {
        this.elements.voiceStatus.classList.add('listening-pulse');
      } else if (status === 'Speaking') {
        this.elements.voiceStatus.classList.add('speaking-pulse');
      }
    }
  
    async startListening() {
        try {
            // First, handle cleanup of any existing audio
            if (this.elements.audioPlayer?.paused || this.state.isAgentSpeaking) {
                await this.cleanupAudio();
                this.state.isListening = false;
                this.state.isProcessing = false;
                this.state.isAgentSpeaking = false;
            }

            // Now check if we can start listening
            if (this.state.isListening || this.state.isProcessing) {
                console.log('Already in listening or processing state');
                return;
            }

            // Add timestamp for duration tracking
            this.listenStartTime = Date.now();

            // Get audio stream
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // Initialize recording
            this.audio.chunks = [];
            this.audio.mediaRecorder = new MediaRecorder(stream);
            
            // Set up recording handlers
            this.audio.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audio.chunks.push(event.data);
                }
            };

            // Update state and UI
            this.state.isListening = true;
            this.updateVoiceStatus('Listening');
            
            // Start recording
            this.audio.mediaRecorder.start();

        } catch (error) {
            console.error('Error in startListening:', error);
            this.updateVoiceStatus('Ready');
            this.state.isListening = false;
            this.state.isProcessing = false;
            this.cleanup();
        }
    }

    async stopListening() {
        if (!this.state.isListening) return;

        const listenDuration = Date.now() - this.listenStartTime;
        const MIN_LISTEN_DURATION = 500; // Half a second minimum

        this.state.isListening = false;

        // Handle quick tap differently
        if (listenDuration < MIN_LISTEN_DURATION) {
            this.updateVoiceStatus('Ready');
            this.state.isProcessing = false;
            this.appendMessage('bot', 'Please Press and Hold the button, only release when you\'re done asking your question');
            
            // Cleanup immediately for quick taps
            if (this.audio.mediaRecorder && this.audio.mediaRecorder.state === "recording") {
                this.audio.mediaRecorder.stop();
                this.audio.chunks = [];
            }
            return;
        }

        this.updateVoiceStatus('Processing');
        this.state.isProcessing = true;

        if (this.audio.mediaRecorder && this.audio.mediaRecorder.state === "recording") {
            this.audio.mediaRecorder.stop();
            
            this.audio.mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(this.audio.chunks, { type: 'audio/webm; codecs=opus' });
                if (audioBlob.size > 0) {
                    const audioBase64 = await this.blobToBase64(audioBlob);
                    if (audioBase64) {
                        await this.processSpeechToText(audioBase64);
                    }
                } else {
                    // Handle empty audio
                    this.updateVoiceStatus('Ready');
                    this.state.isProcessing = false;
                }
                this.audio.chunks = [];
            };
        }
    }

      blobToBase64(blob) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result.split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }
    
      async processSpeechToText(audioContent, retries = 3) {
        try {
          console.log('Sending audio for asynchronous transcription...');
    
          const response = await fetch('https://us-central1-pa-sha.cloudfunctions.net/agent_async_stt', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ data: { audioContent } }),
          });
    
          if (!response.ok) {
            const errorText = await response.text();
            console.error('Async Speech-to-text error response:', errorText);
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
          }
    
          const data = await response.json();
          console.log('Async Speech-to-text response:', data);
    
          const { operationId } = data;
          if (!operationId) {
            throw new Error('No operation ID received for async speech-to-text task');
          }
    
          await this.pollForTranscriptionResult(operationId);
        } catch (error) {
          console.error('Detailed error in async speech-to-text conversion:', error);
          if (retries > 0) {
            console.log(`Retrying speech-to-text conversion. Attempts left: ${retries - 1}`);
            await this.processSpeechToText(audioContent, retries - 1);
          } else {
            this.appendMessage('bot', 'I\'m having trouble understanding. Could you please try again?');
            this.updateVoiceStatus('Ready');
          }
        }
      }
    
      async pollForTranscriptionResult(operationId) {
        const maxAttempts = 30;
        const pollingInterval = 2000;
    
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          try {
            const response = await fetch(`https://us-central1-pa-sha.cloudfunctions.net/getTranscriptionResult?operationId=${operationId}`);
    
            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }
    
            const result = await response.json();
    
            if (result.status === 'completed') {
              console.log('Transcription completed:', result.transcription);
              await this.handleTranscriptionResult(result.transcription);
              return;
            } else if (result.status === 'failed') {
              throw new Error('Transcription failed');
            }
    
            await new Promise(resolve => setTimeout(resolve, pollingInterval));
          } catch (error) {
            console.error('Error polling for transcription result:', error);
          }
        }
    
        console.error('Max polling attempts reached without completion');
        this.appendMessage('bot', 'Sorry, transcription is taking longer than expected. Please try again.');
        this.updateVoiceStatus('Ready');
      }
    
      async handleTranscriptionResult(transcription) {
        if (transcription && transcription.trim() !== '') {
          console.log('Processing transcription:', transcription);
          this.appendMessage('user', transcription);
          await this.processUserInput(transcription);
        } else {
          console.log('No speech detected');
          this.updateVoiceStatus('Ready');
        }
      }
    
      async processUserInput(input) {
        if (this.elements.loader) {
            this.elements.loader.style.display = "flex";
        }
    
        try {
            if (!input || input.trim() === '') {
                throw new Error('No input provided');
            }
    
            const response = await this.getChatCompletion(input);
            console.log('Bot response:', response);
            
            // Check if this is an offline/fallback response
            if (response.offline) {
                this.appendMessage('bot', response.text);
                this.appendMessage('system', 
                    'Note: I\'m currently operating in offline mode due to connectivity issues. ' +
                    'Some features may be limited until connection is restored.');
                // Do not send offline/fallback messages to TTS
                return;
            }
    
            // If the response is an error or contains "error" or "Unknown function", do not send to TTS
            if (
                !response.text ||
                response.text.toLowerCase().includes('error') ||
                response.text.toLowerCase().includes('unknown function')
            ) {
                this.appendMessage('bot', response.text);
                return;
            }
    
            // Handle normal response with potential special content
            if (response.meetings && response.meetings.length > 0) {
                const cardContent = this.createActionItemsCard(response.meetings);
                this.appendMessage('bot', cardContent);
            }
    
            this.appendMessage('bot', response.text);
    
            await new Promise(resolve => setTimeout(resolve, this.config.responseDelay));
    
            const cleanedResponse = this.cleanTextForSpeech(response.text);
            await this.playAudioResponse(cleanedResponse);
    
        } catch (error) {
            console.error('Error processing user input:', error);
            
            // Provide more helpful error messages based on error type
            if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
                this.appendMessage('bot', 
                    'Sorry, I\'m having trouble connecting to my language processing service. ' +
                    'This might be due to network issues or the service being temporarily unavailable. ' +
                    'I\'ll continue to operate with limited capabilities.');
            } else if (error.name === 'AbortError') {
                this.appendMessage('bot', 
                    'Sorry, the request timed out. This might be due to network issues or high server load. ' +
                    'Please try again in a moment.');
            } else {
                this.appendMessage('bot', 'Sorry, I encountered an error processing your request. Please try again.');
            }
            
            this.updateVoiceStatus('Ready');
        } finally {
            if (this.elements.loader) {
                this.elements.loader.style.display = "none";
            }
        }
      }
    
      async getChatCompletion(prompt, retries = 3) {
        if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
            throw new Error('Invalid prompt provided');
        }
    
        if (!this.sessionId) {
            this.sessionId = 'session_' + Math.random().toString(36).substr(2, 9);
        }
    
        try {
            const now = Date.now();
            const timeSinceLastRequest = now - this.conversation.lastRequestTime;
            
            if (timeSinceLastRequest < this.config.minTimeBetweenRequests) {
                const delay = this.config.minTimeBetweenRequests - timeSinceLastRequest;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
            
            // Check if we already exhausted all retries and endpoints
            if (retries === 0 && this.state.currentEndpoint === this.state.fallbackEndpoint && this.state.localFallbackEnabled) {
                console.log('All endpoints failed, using local fallback...');
                return this.getLocalFallbackResponse(prompt);
            }
    
            console.log(`Trying endpoint: ${this.state.currentEndpoint}`);
            // Always send { prompt, sessionId } as the root object
            const response = await fetch(this.state.currentEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    prompt: prompt,
                    sessionId: this.sessionId
                }),
                signal: AbortSignal.timeout(10000)
            });
    
            this.conversation.lastRequestTime = Date.now();
    
            if (!response.ok) {
                // If current endpoint fails, try fallback
                if (this.state.currentEndpoint !== this.state.fallbackEndpoint) {
                    console.log('Primary endpoint failed, trying fallback...');
                    this.handleEndpointError(
                        this.state.currentEndpoint.split('completions_')[1] || 'Unknown'
                    );
                    return this.getChatCompletion(prompt, retries);
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            
            if (!data.response || (!data.response.text && !data.response.parts)) {
                throw new Error('Invalid response structure from server');
            }

            this.conversation.history.push(
                { role: "user", content: prompt },
                { role: "assistant", content: data.response.text || data.response.parts[0].text }
            );

            return data.response;
        } catch (error) {
            console.error('Error getting chat completion:', error);
            
            // Check if it's a network-related error
            const isNetworkError = error.name === 'TypeError' && error.message === 'Failed to fetch';
            
            if (retries > 0) {
                // If we're not already on fallback, switch to it
                if (this.state.currentEndpoint !== this.state.fallbackEndpoint) {
                    console.log('Switching to fallback endpoint...');
                    this.handleEndpointError(
                        this.state.currentEndpoint.split('completions_')[1] || 'Unknown'
                    );
                    return this.getChatCompletion(prompt, retries - 1);
                }
                
                // If we are on fallback, wait and retry
                console.log(`Retrying... ${retries} attempts left`);
                const backoffDelay = Math.min(2000 * (3 - retries), 5000); // Exponential backoff
                await new Promise(resolve => setTimeout(resolve, backoffDelay));
                return this.getChatCompletion(prompt, retries - 1);
            }
            
            // If all retries are exhausted, use local fallback as last resort
            if (this.state.localFallbackEnabled && isNetworkError) {
                console.log('All endpoints failed. Using local fallback response');
                return this.getLocalFallbackResponse(prompt);
            }
            
            throw error;
        }
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
    
      async playAudioResponse(text) {
        this.state.isAgentSpeaking = true;
        this.updateVoiceStatus('Speaking');
        this.updateButtonStates('audio_playing');

        try {
            console.log('Processing text for speech:', text);
            const chunks = this.splitTextIntoChunks(text, 1800);

            for (let chunk of chunks) {
                if (!this.state.isAgentSpeaking) {
                    console.log('Speech interrupted');
                    break;
                }

                let response;
                try {
                    response = await fetch('https://us-central1-pa-sha.cloudfunctions.net/textToSpeech', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ data: { text: chunk } }),
                    });
                } catch (networkError) {
                    // Network error (offline, DNS, etc)
                    console.error('Network error in playAudioResponse:', networkError);
                    this.appendMessage('system', 'Network error: Unable to reach the text-to-speech service. Please check your connection.');
                    break;
                }

                if (!response || !response.ok) {
                    // HTTP error or no response
                    const status = response ? response.status : 'No response';
                    console.error(`TTS endpoint error! status: ${status}`);
                    this.appendMessage('system', `Sorry, I couldn't generate speech audio (TTS service error: ${status}).`);
                    break;
                }

                const audioBlob = await response.blob();
                const audioUrl = URL.createObjectURL(audioBlob);
                const audio = new Audio(audioUrl);
                this.elements.audioPlayer = audio;

                audio.addEventListener('play', () => this.handleAudioPlay());
                audio.addEventListener('pause', () => this.handleAudioPause());
                audio.addEventListener('ended', () => {
                    URL.revokeObjectURL(audioUrl);
                    this.handleAudioEnded();
                });

                await new Promise((resolve) => {
                    audio.addEventListener('ended', resolve);
                    audio.play().catch(error => {
                        console.error('Audio playback error:', error);
                        resolve();
                    });
                });
            }
        } catch (error) {
            console.error('Error in playAudioResponse:', error);
            this.appendMessage('bot', 'Sorry, I encountered an error while trying to speak. Please try again.');
        } finally {
            this.handleAudioEnded();
        }
    }
    
      splitTextIntoChunks(text, maxLength) {
        const chunks = [];
        let currentChunk = "";
        const sentences = text.match(/[^.!?]+[.!?]+|\s+/g) || [];
    
        for (let sentence of sentences) {
          if (currentChunk.length + sentence.length <= maxLength) {
            currentChunk += sentence;
          } else {
            if (currentChunk) chunks.push(currentChunk.trim());
            currentChunk = sentence;
          }
        }
    
        if (currentChunk) chunks.push(currentChunk.trim());
        return chunks;
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
        } else if (typeof content === 'object' && content.text) {
          msgText.innerHTML = this.formatText(content.text);
          if (content.meetings && content.meetings.length > 0) {
            const cardContent = this.createActionItemsCard(content.meetings);
            msgText.appendChild(cardContent);
          }
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
        
        // Ensure scroll happens after content is fully rendered
        requestAnimationFrame(() => {
          // Get all scrollable parent containers
          const chatMessages = this.elements.chatMessages;
          const horizonHero = chatMessages.closest('.horizon_hero');
          const horizonBot = chatMessages.closest('.horizon_bot');
          
          // Scroll each container to the bottom
          [chatMessages, horizonHero, horizonBot].forEach(container => {
            if (container) {
              container.scrollTo({
                top: container.scrollHeight,
                behavior: 'smooth'
              });
            }
          });
          
          // Backup scroll with setTimeout
          setTimeout(() => {
            [chatMessages, horizonHero, horizonBot].forEach(container => {
              if (container) {
                container.scrollTo({
                  top: container.scrollHeight,
                  behavior: 'auto' // Instant scroll as fallback
                });
              }
            });
          }, 100);
        });
      }
    
      formatText(text) {
        if (!text) return 'N/A';
        return text.replace(/\*\*/g, '')
                   .replace(/\*(.*?)\*/g, '<em>$1</em>')
                   .replace(/_(.*?)_/g, '<strong>$1</strong>')
                   .replace(/\n/g, '<br>');
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
    
      async handleModeButtonClick(mode) {
        let message = '';
        let action = null;
        
        switch(mode) {
          case 'ask':
            message = "Ask Mode activated. Choose a language model from the list to continue.";
            action = () => {
              // Highlight language model selection area
              document.querySelector('.agent_s3').classList.add('highlight');
            };
            break;
            
          case 'meeting':
            message = "Meeting Mode.";
            action = () => {
              setTimeout(() => {
                // New actions here
              }, 2000);
            };
            break;
            
          case 'chronicle':
            message = "Chronicle Mode.";
            action = () => {
              // Start recording session activities
              this.startChronicleMode();
            };
            break;
            
          case 'scheduler':
            message = "Scheduler activated.";
            action = () => {
              // Open the scheduler modal using the controller if available
              if (window.schedulerController && typeof window.schedulerController.openScheduler === 'function') {
                window.schedulerController.openScheduler();
              } else {
                const schedulerModal = document.getElementById('schedulerModal');
                if (schedulerModal) {
                  schedulerModal.classList.add('active');
                  // Initialize the scheduler controller if available
                  if (window.schedulerController && typeof window.schedulerController.init === 'function') {
                    window.schedulerController.init();
                  }
                } else {
                  this.appendMessage('bot', 'You can say things like:\n- Schedule a meeting\n- Set a reminder\n- Add to calendar');
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
            
          case 'news':
            message = "News Mode.";
            action = async () => {
              await this.fetchAndDisplayNews();
            };
            break;
            
          case 'settings':
            message = "Opening settings panel...";
            action = () => {
              this.openSettings();
            };
            break;
            
          case 'history':
            message = "Showing conversation history...";
            action = () => {
              this.displayHistory();
            };
            break;
        }
      
        this.appendMessage('bot', message);
        await this.playAudioResponse(message);
        
        if (action) {
          action();
        }
      }
      
      // Add these new helper methods for the various modes
      startChronicleMode() {
        // Initialize chronicle recording
        this.isChronicling = true;
        console.log('Chronicle mode started');
      }
      
      async fetchAndDisplayNews() {
        try {
          this.appendMessage('bot', 'Fetching news...');
          // Implement news fetching logic here
        } catch (error) {
          console.error('Error fetching news:', error);
          this.appendMessage('bot', 'Sorry, there was an error fetching the news.');
        }
      }
      
      openSettings() {
        // Show the settings modal
        const settingsModal = document.getElementById('settingsModal');
        if (settingsModal) {
          settingsModal.classList.add('active');
          
          // Focus the close button for accessibility
          const closeButton = document.getElementById('closeSettingsBtn');
          if (closeButton) {
            setTimeout(() => closeButton.focus(), 100);
          }
          
          // Set up close and save button event listeners if not already set
          if (!this.settingsEventsInitialized) {
            const closeSettingsBtn = document.getElementById('closeSettingsBtn');
            const saveSettingsBtn = document.getElementById('saveSettingsBtn');
            
            if (closeSettingsBtn) {
              closeSettingsBtn.addEventListener('click', () => {
                settingsModal.classList.add('fadeOut');
                setTimeout(() => {
                  settingsModal.classList.remove('active');
                  settingsModal.classList.remove('fadeOut');
                }, 300);
              });
            }
            
            if (saveSettingsBtn) {
              saveSettingsBtn.addEventListener('click', () => {
                // Save settings functionality 
                const voiceSelect = document.getElementById('voiceSelect');
                const voiceSpeed = document.getElementById('voiceSpeed');
                const language = document.getElementById('language');
                const theme = document.getElementById('theme');
                const notificationSound = document.getElementById('notificationSound');
                
                // Save to localStorage or your preferred storage
                if (voiceSelect) localStorage.setItem('voiceType', voiceSelect.value);
                if (voiceSpeed) localStorage.setItem('voiceSpeed', voiceSpeed.value);
                if (language) localStorage.setItem('language', language.value);
                if (theme) localStorage.setItem('theme', theme.value);
                if (notificationSound) localStorage.setItem('notificationSound', notificationSound.value);
                
                // Apply settings immediately if needed
                this.applySettings();
                
                // Close the modal with animation
                settingsModal.classList.add('fadeOut');
                setTimeout(() => {
                  settingsModal.classList.remove('active');
                  settingsModal.classList.remove('fadeOut');
                  
                  // Show success message after modal is closed
                  setTimeout(() => {
                    this.appendMessage('bot', 'Settings saved successfully.');
                  }, 100);
                }, 300);
              });
            }
            
            // Add click handler to close modal when clicking outside
            settingsModal.addEventListener('click', (e) => {
              if (e.target === settingsModal) {
                settingsModal.classList.add('fadeOut');
                setTimeout(() => {
                  settingsModal.classList.remove('active');
                  settingsModal.classList.remove('fadeOut');
                }, 300);
              }
            });
            
            // Add keyboard support to close modal with Escape key
            document.addEventListener('keydown', (e) => {
              if (e.key === 'Escape' && settingsModal.classList.contains('active')) {
                settingsModal.classList.add('fadeOut');
                setTimeout(() => {
                  settingsModal.classList.remove('active');
                  settingsModal.classList.remove('fadeOut');
                }, 300);
              }
            });
            
            // Load existing settings
            this.loadSavedSettings();
            
            this.settingsEventsInitialized = true;
          }
        } else {
          // Fallback if modal not found
          this.appendMessage('bot', 'Settings panel could not be loaded.');
        }
      }
      
      loadSavedSettings() {
        // Load saved settings from storage
        const voiceSelect = document.getElementById('voiceSelect');
        const voiceSpeed = document.getElementById('voiceSpeed');
        const language = document.getElementById('language');
        const theme = document.getElementById('theme');
        const notificationSound = document.getElementById('notificationSound');
        
        if (voiceSelect) voiceSelect.value = localStorage.getItem('voiceType') || 'default';
        if (voiceSpeed) voiceSpeed.value = localStorage.getItem('voiceSpeed') || '1.0';
        if (language) language.value = localStorage.getItem('language') || 'en-US';
        if (theme) theme.value = localStorage.getItem('theme') || 'light';
        if (notificationSound) notificationSound.value = localStorage.getItem('notificationSound') || 'default';
        
        // Apply settings on load
        this.applySettings();
      }
      
      applySettings() {
        // Apply the current settings
        const theme = localStorage.getItem('theme') || 'light';
        
        // Apply theme
        if (theme === 'dark') {
          document.body.classList.add('dark-theme');
        } else if (theme === 'light') {
          document.body.classList.remove('dark-theme');
        } else if (theme === 'auto') {
          // Check system preference
          if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.body.classList.add('dark-theme');
          } else {
            document.body.classList.remove('dark-theme');
          }
          
          // Listen for changes in system preference
          window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
            if (e.matches) {
              document.body.classList.add('dark-theme');
            } else {
              document.body.classList.remove('dark-theme');
            }
          });
        }
        
        // Apply other settings as needed
        const voiceSpeed = localStorage.getItem('voiceSpeed') || '1.0';
        if (this.speech && this.speech.rate) {
          this.speech.rate = parseFloat(voiceSpeed);
        }
        
        const language = localStorage.getItem('language') || 'en-US';
        if (this.speech && this.speech.lang) {
          this.speech.lang = language;
        }
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
          msgElement.textContent = `${msg.role}: ${msg.content}`;
          historyContent.appendChild(msgElement);
        });
        
        this.appendMessage('bot', historyContent);
      }

      createActionItemsCard(meetings) {
        const cardDiv = document.createElement("div");
        cardDiv.classList.add("card", "mb-3");
      
        meetings.forEach((meeting, meetingIndex) => {
          console.log('Received meeting data:', meeting);
          console.log('Date value:', meeting.date);
          console.log('Meeting date object structure:', JSON.stringify(meeting.date, null, 2));
      
          const cardBody = document.createElement("div");
          cardBody.classList.add("card-body");
      
          const title = document.createElement("h5");
          title.classList.add("card-title");
          title.textContent = meeting.title;
      
          const host = document.createElement("p");
          host.classList.add("card-text", "mb-1");
          host.innerHTML = `<strong>Host:</strong> ${meeting.meetingHost || 'Unknown'}`;
      
          const attendees = document.createElement("p");
          attendees.classList.add("card-text", "mb-1");
          attendees.innerHTML = `<strong>Attendees:</strong> ${meeting.meetingAttendees ? meeting.meetingAttendees.join(', ') : 'None listed'}`;
      
          const date = document.createElement("p");
          date.classList.add("card-text", "mb-1");
      
          let dateString = 'Date not available';
          if (meeting.date) {
            if (typeof meeting.date === 'string') {
              dateString = meeting.date;
            } else if (meeting.date._seconds) {
              // Firestore Timestamp object
              const meetingDate = new Date(meeting.date._seconds * 1000);
              dateString = meetingDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
            } else if (!isNaN(Date.parse(meeting.date))) {
              const meetingDate = new Date(meeting.date);
              dateString = meetingDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
            } else {
              console.error('Unrecognized date format:', meeting.date);
              dateString = 'Unrecognized Date Format';
            }
          }
          date.innerHTML = `<strong>Date:</strong> ${dateString}`;
      
          const timeInfo = document.createElement("p");
          timeInfo.classList.add("card-text", "mb-1");
          timeInfo.innerHTML = `<strong>Start:</strong> ${meeting.startTime}<br><strong>End:</strong> ${meeting.endTime}`;
      
          const duration = document.createElement("p");
          duration.classList.add("card-text", "mb-2", "text-muted");
          duration.textContent = `Duration: ${meeting.duration}`;
      
          cardBody.appendChild(title);
          cardBody.appendChild(host);
          cardBody.appendChild(attendees);
          cardBody.appendChild(date);
          cardBody.appendChild(timeInfo);
          cardBody.appendChild(duration);
      
          const accordion = document.createElement("div");
          accordion.classList.add("accordion", "mt-3");
          accordion.id = `accordionMeeting-${meetingIndex}`;
      
          const actionItemsAccordion = this.createAccordionItem(
            `heading-actionItems-${meetingIndex}`,
            `collapse-actionItems-${meetingIndex}`,
            "Action Items",
            this.createActionItemsList(meeting.actionItems),
            `accordionMeeting-${meetingIndex}`
          );
      
          const summaryAccordion = this.createAccordionItem(
            `heading-summary-${meetingIndex}`,
            `collapse-summary-${meetingIndex}`,
            "Summary",
            meeting.summary,
            `accordionMeeting-${meetingIndex}`
          );
      
          accordion.appendChild(actionItemsAccordion);
          accordion.appendChild(summaryAccordion);
      
          cardBody.appendChild(accordion);
          cardDiv.appendChild(cardBody);
      
          if (meetingIndex < meetings.length - 1) {
            const hr = document.createElement("hr");
            hr.classList.add("my-4");
            cardDiv.appendChild(hr);
          }
        });
      
        return cardDiv;
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
          } else {
            console.warn(`Button with ID "${id}" not found`);
          }
        }
      }

      createAccordionItem(headingId, collapseId, title, content, parentId) {
        const accordionItem = document.createElement("div");
        accordionItem.classList.add("accordion-item");
    
        const header = document.createElement("h2");
        header.classList.add("accordion-header");
        header.id = headingId;
    
        const button = document.createElement("button");
        button.classList.add("accordion-button", "collapsed");
        button.type = "button";
        button.setAttribute("data-bs-toggle", "collapse");
        button.setAttribute("data-bs-target", `#${collapseId}`);
        button.setAttribute("aria-expanded", "false");
        button.setAttribute("aria-controls", collapseId);
        button.textContent = title;
    
        const collapseDiv = document.createElement("div");
        collapseDiv.id = collapseId;
        collapseDiv.classList.add("accordion-collapse", "collapse");
        collapseDiv.setAttribute("aria-labelledby", headingId);
        collapseDiv.setAttribute("data-bs-parent", `#${parentId}`);
    
        const body = document.createElement("div");
        body.classList.add("accordion-body");
        
        if (typeof content === 'string') {
            body.innerHTML = content;
        } else if (content instanceof HTMLElement) {
            body.appendChild(content);
        }
    
        header.appendChild(button);
        collapseDiv.appendChild(body);
        accordionItem.appendChild(header);
        accordionItem.appendChild(collapseDiv);
    
        return accordionItem;
    }

    createActionItemsList(actionItems) {
        if (!actionItems || !Array.isArray(actionItems) || actionItems.length === 0) {
            return 'No action items';
        }
    
        const ul = document.createElement('ul');
        ul.classList.add('list-group', 'list-group-flush');
    
        actionItems.forEach(item => {
            const li = document.createElement('li');
            li.classList.add('list-group-item');
            li.textContent = item;
            ul.appendChild(li);
        });
    
        return ul;
    }

    cleanup() {
        // Remove event listeners
        if (this.elements.pushToTalkBtn) {
            this.elements.pushToTalkBtn.replaceWith(this.elements.pushToTalkBtn.cloneNode(true));
        }
        if (this.elements.pauseButton) {
            this.elements.pauseButton.replaceWith(this.elements.pauseButton.cloneNode(true));
        }
        if (this.elements.audioPlayer) {
            this.elements.audioPlayer.replaceWith(this.elements.audioPlayer.cloneNode(true));
        }
    
        // Stop any ongoing recordings
        if (this.audio.mediaRecorder && this.audio.mediaRecorder.state === "recording") {
            this.audio.mediaRecorder.stop();
        }
    
        // Close audio context
        if (this.audio.context && this.audio.context.state !== 'closed') {
            this.audio.context.close();
        }
    
        // Clear arrays and objects
        this.audio.chunks = [];
        this.state.isListening = false;
        this.state.isAgentSpeaking = false;
        this.state.isProcessing = false;
    }

    async cleanupAudio() {
        if (this.elements.audioPlayer) {
            this.elements.audioPlayer.pause();
            URL.revokeObjectURL(this.elements.audioPlayer.src);
            this.elements.audioPlayer = null;
        }
        this.state.isAgentSpeaking = false;
        this.state.isProcessing = false; // Add this line
        this.updateButtonStates('ready');
    }

    handleAudioContextError(error) {
        console.error('Audio Context Error:', error);
        this.updateVoiceStatus('Audio Error');
        this.appendMessage('bot', 'Sorry, there was an error with the audio system. Please refresh the page and try again.');
    }

    setChatCompletionEndpoint(endpoint) {
        const previousEndpoint = this.state.currentEndpoint;
        this.state.currentEndpoint = endpoint;

        // Update UI
        document.querySelectorAll('.llm-card').forEach(card => {
            card.classList.remove('llm-card-active');
        });

        // Extract model name and update readout
        const modelName = endpoint.split('completions_')[1] || 'Llama';
        const readoutElement = document.querySelector('.llm_readout_title');
        
        // Test endpoint before committing to it
        fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                prompt: "test",
                sessionId: this.sessionId || 'test'
            })
        }).then(response => {
            if (!response.ok) throw new Error('Endpoint test failed');
            // Update UI on success
            if (readoutElement) {
                readoutElement.textContent = `Language Model: ${modelName.charAt(0).toUpperCase() + modelName.slice(1)}`;
            }
        }).catch(error => {
            console.error('Error testing endpoint:', error);
            // Revert to previous endpoint
            this.state.currentEndpoint = previousEndpoint;
            this.handleEndpointError(modelName);
        });
    }

    handleEndpointError(modelName) {
        // Revert to fallback endpoint
        this.state.currentEndpoint = this.state.fallbackEndpoint;
        
        // Update UI to show fallback status
        const readoutElement = document.querySelector('.llm_readout_title');
        if (readoutElement) {
            readoutElement.textContent = `Language Model: Llama (Fallback)`;
        }

        // Highlight the Llama card
        document.querySelectorAll('.llm-card').forEach(card => {
            card.classList.remove('llm-card-active');
        });
        const llamaCard = document.querySelector('.llm-card.llama');
        if (llamaCard) llamaCard.classList.add('llm-card-active');

        // Notify user
        this.appendMessage('bot', 
            `Sorry, the ${modelName} endpoint is not responding. I've switched back to the default model to keep our conversation going.`
        );
    }
    
    /**
     * Provides a local fallback response when all API endpoints fail
     * This ensures the app remains functional even when cloud services are unavailable
     */
    async getLocalFallbackResponse(prompt) {
        console.log('Using local fallback response mechanism');
        
        // Basic responses for common queries
        const responses = {
            greeting: "Hello! I'm operating in offline mode due to connectivity issues. I can help with basic information, but my capabilities are limited until the connection is restored.",
            help: "I can provide basic assistance while offline. For more advanced features, please check your internet connection.",
            weather: "I'm unable to check the weather while offline. Please try again when internet connectivity is restored.",
            time: `The current time is ${new Date().toLocaleTimeString()}.`,
            date: `Today's date is ${new Date().toLocaleDateString()}.`,
            schedule: "I can't access your schedule while offline. Basic calendar functionality should still work locally.",
            default: "I'm currently operating in offline mode due to connectivity issues with my language processing service. I can still help with basic tasks, but my capabilities are limited. Please check your internet connection."
        };
        
        // Simple pattern matching for common queries
        let responseText = responses.default;
        const lowerPrompt = prompt.toLowerCase();
        
        if (/^(hi|hello|hey|greetings)/i.test(lowerPrompt)) {
            responseText = responses.greeting;
        } else if (/help|assist|support/i.test(lowerPrompt)) {
            responseText = responses.help;
        } else if (/weather|forecast|temperature|rain|snow/i.test(lowerPrompt)) {
            responseText = responses.weather;
        } else if (/what time|current time|tell me the time/i.test(lowerPrompt)) {
            responseText = responses.time;
        } else if (/what (is |)date|today('s|s|) date|current date/i.test(lowerPrompt)) {
            responseText = responses.date;
        } else if (/schedule|calendar|event|meeting|appointment/i.test(lowerPrompt)) {
            responseText = responses.schedule;
        }
        
        // Record in conversation history
        this.conversation.history.push(
            { role: "user", content: prompt },
            { role: "assistant", content: responseText }
        );
        
        // Return in the expected format
        return {
            text: responseText,
            offline: true
        };
    }

    handleEndpointError(modelName) {
        // Revert to fallback endpoint
        this.state.currentEndpoint = this.state.fallbackEndpoint;
        
        // Update UI to show fallback status
        const readoutElement = document.querySelector('.llm_readout_title');
        if (readoutElement) {
            readoutElement.textContent = `Language Model: Llama (Fallback)`;
        }

        // Highlight the Llama card
        document.querySelectorAll('.llm-card').forEach(card => {
            card.classList.remove('llm-card-active');
        });
        const llamaCard = document.querySelector('.llm-card.llama');
        if (llamaCard) llamaCard.classList.add('llm-card-active');

        // Notify user
        this.appendMessage('bot', 
            `Sorry, the ${modelName} endpoint is not responding. I've switched back to the default model to keep our conversation going.`
        );
    }
    
    /**
     * Setup network status monitoring
     * This helps detect when the device goes offline/online
     */
    setupNetworkMonitoring() {
        // Set initial network status
        this.state.networkStatus = navigator.onLine ? 'online' : 'offline';
        
        // Update state when network status changes
        window.addEventListener('online', () => {
            console.log('Network connection restored');
            this.state.networkStatus = 'online';
            this.state.offlineMode = false;
            
            // If we have a last successful endpoint, try using it again
            if (this.state.lastSuccessfulEndpoint) {
                this.state.currentEndpoint = this.state.lastSuccessfulEndpoint;
            }
            
            // Notify user that we're back online
            this.appendMessage('system', 'Network connection restored. All features are now available.');
        });
        
        window.addEventListener('offline', () => {
            console.log('Network connection lost');
            this.state.networkStatus = 'offline';
            this.state.offlineMode = true;
            
            // Notify user of limited functionality
            this.appendMessage('system', 'Network connection lost. Operating with limited functionality.');
        });
        
        // Periodically check endpoint availability
        setInterval(() => this.checkEndpointAvailability(), 60000); // Check every minute
    }
    
    /**
     * Check if our endpoints are available
     */
    async checkEndpointAvailability() {
        if (!navigator.onLine) return; // Skip if offline
        
        try {
            // Just send a HEAD request to check if the endpoint is responding
            const response = await fetch(this.state.currentEndpoint, { 
                method: 'HEAD',
                signal: AbortSignal.timeout(5000)
            });
            
            if (response.ok) {
                this.state.lastSuccessfulEndpoint = this.state.currentEndpoint;
                this.state.offlineMode = false;
            }
        } catch (error) {
            console.log('Endpoint availability check failed:', error);
            // Don't switch endpoints here - wait for an actual request to fail
        }
    }
    
    /**
     * Append a system message to the chat
     * @param {string} message - The system message to display
     */
    appendSystemMessage(message) {
        const messageElem = document.createElement('div');
        messageElem.className = 'chat-message system-message';
        messageElem.innerHTML = `<div class="message-content system-content">${message}</div>`;
        
        if (this.elements.chatMessages) {
            this.elements.chatMessages.appendChild(messageElem);
            this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
        }
    }
}

