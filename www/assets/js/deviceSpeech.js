import { TTSService } from '@capacitor-community/text-to-speech';
import { SpeechRecognitionService } from './capacitor/speech-recognition.js';

export const DeviceSpeech = {
    isInitialized: false,
    isListening: false,
    lastStartTime: null,
    minimumListenTime: 500,
    tts: null,
    recognition: null,
    recognitionListeners: [],
    currentRecognitionInstance: null,
    lastPartialResult: null,
    finalResultReceived: false,
    isStopping: false, // Add this flag
    isAgentSpeaking: false, // Add this flag

    async initializeSpeech() {
        try {
            if (this.isInitialized) return true;

            // Initialize TTS
            if (!this.tts) {
                await TTSService.initialize();
                this.tts = TTSService;
                console.log('TTS initialized successfully');
            }

            // Initialize Speech Recognition
            const { available } = await SpeechRecognitionService.available();
            console.log('Speech recognition available:', available);
            
            if (!available) {
                throw new Error('Speech recognition not available on this device');
            }

            const permissionResult = await SpeechRecognitionService.requestPermissions();
            console.log('Permission result:', JSON.stringify(permissionResult));

            if (!permissionResult.granted) {
                const platform = window.Capacitor?.getPlatform();
                if (platform === 'android') {
                    throw new Error('Please grant microphone permission in your device settings to use speech recognition.');
                } else {
                    throw new Error('Speech recognition permission not granted');
                }
            }

            this.recognition = SpeechRecognitionService;
            this.isInitialized = true;
            console.log('Speech recognition initialized successfully');
            return true;
        } catch (error) {
            console.error('Speech initialization error:', error);
            throw error;
        }
    },

    async startListening(onPartialResult = null) {
        console.log('Starting listening in deviceSpeech with state:', {
            isInitialized: this.isInitialized,
            isListening: this.isListening,
            recognition: !!this.recognition,
            recognitionListeners: this.recognitionListeners.length
        });
    
        try {
            // Check if recognition object exists
            if (!this.recognition) {
                console.log('Recognition object missing, reinitializing speech...');
                this.isInitialized = false;
            }
    
            // Initialize if needed
            if (!this.isInitialized) {
                console.log('Speech not initialized, calling initializeSpeech...');
                await this.initializeSpeech();
                console.log('Speech initialization complete, checking status:', {
                    isInitialized: this.isInitialized,
                    recognition: !!this.recognition
                });
            }
    
            // Double check initialization success
            if (!this.recognition) {
                throw new Error('Recognition still null after initialization');
            }
    
            // Check if already listening
            if (this.isListening) {
                console.log('Already listening, attempting cleanup...');
                await this.stopListening().catch(e => console.error('Error stopping existing listening:', e));
            }
    
            console.log('Setting up new listening session...');
            this.isListening = true;
            this.lastStartTime = Date.now();
            this.lastPartialResult = null;
            
            // Force cleanup of existing listeners
            console.log('Removing all existing listeners...');
            await this.removeAllListeners();
    
            // Setup new listener with error handling
            console.log('Setting up new partial results listener...');
            try {
                const listener = await this.recognition.addListener('partialResults', (result) => {
                    console.log('Received partial result event:', result);
                    if (result?.matches?.[0]) {
                        this.lastPartialResult = result.matches[0];
                        console.log('Processing partial result:', this.lastPartialResult);
                        if (onPartialResult) {
                            onPartialResult(this.lastPartialResult);
                        }
                    } else {
                        console.log('Received empty or invalid partial result');
                    }
                });
                
                if (listener) {
                    this.recognitionListeners.push(listener);
                    console.log('Successfully added partial results listener');
                } else {
                    console.warn('Listener setup returned null/undefined');
                }
            } catch (listenerError) {
                console.error('Error setting up listener:', listenerError);
                throw listenerError;
            }
    
            // Start recognition with verification
            console.log('Starting recognition with options...');
            const startOptions = {
                language: 'en-US',
                maxResults: 1,
                prompt: 'Listening...',
                partialResults: true,
                popup: false
            };
            console.log('Recognition start options:', startOptions);
            
            const startResult = await this.recognition.start(startOptions);
            console.log('Recognition start result:', startResult);
    
            // Verify recognition started
            const isAvailable = await this.recognition.available();
            console.log('Post-start availability check:', isAvailable);
    
            if (!isAvailable.available) {
                throw new Error('Recognition unavailable after start');
            }
    
            console.log('Speech recognition successfully started');
            return startResult;
    
        } catch (error) {
            console.error('Error in startListening:', error);
            this.isListening = false;
            // Attempt recovery
            try {
                console.log('Attempting recovery...');
                await this.removeAllListeners();
                this.isInitialized = false;
                await this.initializeSpeech();
            } catch (recoveryError) {
                console.error('Recovery failed:', recoveryError);
            }
            throw error;
        }
    },

    async stopListening() {
        try {
            if (!this.isListening || this.isStopping) return;

            this.isStopping = true; // Set the flag to prevent multiple stop requests
            console.log('Stopping recognition...');
            await this.recognition.stop();
            await this.removeAllListeners();
            
            this.isListening = false;
            this.lastStartTime = null;
            this.isStopping = false; // Reset the flag

        } catch (error) {
            console.error('Error stopping speech recognition:', error);
            this.isListening = false;
            this.isStopping = false; // Reset the flag
            throw error;
        }
    },

    processRecognitionResult(result) {
        console.log('Processing final recognition result:', result);
        this.finalResultReceived = true;
        
        if (result && typeof result === 'string') {
            const finalText = result.trim();
            console.log('Dispatching final result:', finalText);
            
            const event = new CustomEvent('speechRecognitionResult', {
                detail: { text: finalText }
            });
            window.dispatchEvent(event);
        }
    },

    handleRecognitionError(error) {
        console.error('Recognition error:', error);
        this.isListening = false;
        // Implement error handling logic here
    },

    async speak(text, options = {}) {
        try {
            if (!text) return;

            if (!this.tts) {
                console.warn('TTS not initialized, attempting to initialize');
                await this.initializeSpeech();
            }

            const speakOptions = {
                text,
                lang: options.lang || 'en-US',
                rate: options.rate || 1.0,
                pitch: options.pitch || 1.0,
                volume: options.volume || 1.0
            };

            console.log('Attempting to speak:', speakOptions);

            try {
                await this.tts.stop();
            } catch (stopError) {
                console.warn('Warning stopping current speech:', stopError);
            }

            await this.tts.speak(speakOptions);
            this.isAgentSpeaking = true; // Set the flag to indicate speaking state

            // Dispatch an event so deviceController can re-enable PTT
            window.dispatchEvent(new CustomEvent('ttsFinished'));
        } catch (error) {
            console.error('Error during speech synthesis:', error);
            throw error;
        }
    },

    async stopSpeaking() {
        try {
            if (this.tts) {
                await this.tts.stop();
                this.isAgentSpeaking = false; // Reset the flag
                // Dispatch an event so deviceController can re-enable PTT
                window.dispatchEvent(new CustomEvent('ttsFinished'));
            }
        } catch (error) {
            console.error('Error stopping speech synthesis:', error);
            throw error;
        }
    },

    async removeAllListeners() {
        try {
            for (const listener of this.recognitionListeners) {
                if (listener?.remove) {
                    await listener.remove();
                }
            }
            this.recognitionListeners = [];
            if (this.recognition) {
                await this.recognition.removeAllListeners();
            }
        } catch (error) {
            console.error('Error removing listeners:', error);
        }
    },

    async cleanup() {
        try {
            await this.stopListening();
            await this.stopSpeaking();
            await this.removeAllListeners();
            this.isInitialized = false;
            this.isListening = false;
            this.lastStartTime = null;
            this.currentRecognitionInstance = null;
        } catch (error) {
            console.error('Error during speech cleanup:', error);
            throw error;
        }
    }
};