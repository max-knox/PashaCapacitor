import { SpeechRecognition } from '@capacitor-community/speech-recognition';

class SpeechRecognitionManager {
    constructor() {
        this.isListening = false;
        this.lastStartTime = null;
        this.minimumListenTime = 500;
        this.recognitionListeners = [];
        this.lastPartialResult = null;
    }

    async startListening(onPartialResult = null) {
        try {
            if (this.isListening) {
                console.log('Already listening, ignoring start request');
                return;
            }

            // Check availability first
            const available = await SpeechRecognition.available();
            console.log('Speech Recognition availability:', available);
            
            if (!available.available) {
                throw new Error('Speech Recognition not available');
            }

            // Request permissions
            const permission = await SpeechRecognition.requestPermissions();
            console.log('Speech Recognition permission:', permission);
            
            if (!permission.granted) {
                throw new Error('Speech Recognition permission not granted');
            }

            this.isListening = true;
            this.lastStartTime = Date.now();
            this.lastPartialResult = null;

            // Remove any existing listeners
            await this.cleanup();

            console.log('Setting up speech recognition listeners...');

            // Only set up partial results listener
            this.recognitionListeners.push(
                await SpeechRecognition.addListener('partialResults', (result) => {
                    if (result?.matches?.length > 0) {
                        this.lastPartialResult = result.matches[0];
                        console.log('Partial transcript:', this.lastPartialResult);
                        if (onPartialResult) {
                            onPartialResult(this.lastPartialResult);
                        }
                    }
                })
            );

            // Start recognition
            await SpeechRecognition.start({
                language: 'en-US',
                maxResults: 1,
                prompt: 'Listening...',
                partialResults: true,
                popup: false
            });

            console.log('Speech recognition started successfully');

        } catch (error) {
            console.error('Error in startListening:', error);
            this.isListening = false;
            await this.cleanup();
            throw error;
        }
    }

    async stopListening() {
        try {
            if (!this.isListening) {
                console.log('Not currently listening');
                return null;
            }

            console.log('Stopping speech recognition...');
            const elapsedTime = Date.now() - this.lastStartTime;
            console.log('Listen duration:', elapsedTime, 'ms');

            // Store the final result before stopping
            const finalResult = this.lastPartialResult;
            console.log('Final result before stopping:', finalResult);

            // Stop recognition
            await SpeechRecognition.stop();
            
            this.isListening = false;
            this.lastStartTime = null;
            
            // Clean up listeners
            await this.cleanup();

            // Return the final result
            return finalResult;

        } catch (error) {
            console.error('Error in stopListening:', error);
            this.isListening = false;
            this.lastStartTime = null;
            await this.cleanup();
            throw error;
        }
    }

    async isListening() {
        return this.isListening;
    }

    async cleanup() {
        try {
            // Remove individual listeners
            for (const listener of this.recognitionListeners) {
                if (listener?.remove) {
                    await listener.remove();
                }
            }
            this.recognitionListeners = [];

            // Remove all listeners as a fallback
            await SpeechRecognition.removeAllListeners();

            // Clear callbacks
            window._speechCallback = null;
            window._partialCallback = null;
            window._errorCallback = null;
            window._endCallback = null;

        } catch (error) {
            console.error('Error in cleanup:', error);
        }
    }
}

// Export an instance
export const speechRecognition = new SpeechRecognitionManager();