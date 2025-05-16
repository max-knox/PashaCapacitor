import { TextToSpeech } from './tts-plugin.js';
import { Capacitor } from '@capacitor/core';

class CustomTextToSpeech {
    constructor() {
        this.speaking = false;
        this.initialized = false;
        this.currentVoice = null;
        this.defaultOptions = {
            lang: 'en-US',
            rate: 1.0,
            pitch: 1.0,
            volume: 1.0
        };
        this.initializationPromise = null;
    }

    async initialize() {
        if (this.initialized) return;

        if (this.initializationPromise) {
            return this.initializationPromise;
        }

        this.initializationPromise = (async () => {
            try {
                const platform = Capacitor.getPlatform();
                console.log(`Initializing TTS for platform: ${platform}`);

                if (platform === 'android' || platform === 'ios') {
                    const languages = await TextToSpeech.getSupportedLanguages();
                    console.log('Supported languages:', languages);
                    
                    const voices = await this.getSupportedVoices();
                    if (voices.voices && voices.voices.length > 0) {
                        this.currentVoice = voices.voices.find(voice => 
                            voice.lang === this.defaultOptions.lang
                        ) || voices.voices[0];
                    }
                }

                this.initialized = true;
                console.log('TTS initialization complete');
                return true;
            } catch (error) {
                console.error('Error initializing TTS:', error);
                this.initialized = false;
                throw error;
            } finally {
                this.initializationPromise = null;
            }
        })();

        return this.initializationPromise;
    }

    async speak(options) {
        try {
            if (!this.initialized) {
                await this.initialize();
            }

            if (!options.text) {
                console.warn('No text provided for TTS');
                return;
            }

            if (this.speaking) {
                await this.stop();
            }

            this.speaking = true;
            const platform = Capacitor.getPlatform();

            const speakOptions = {
                text: options.text,
                lang: options.lang || this.defaultOptions.lang,
                rate: options.rate || this.defaultOptions.rate,
                pitch: options.pitch || this.defaultOptions.pitch,
                volume: options.volume || this.defaultOptions.volume
            };

            if (this.currentVoice) {
                speakOptions.voice = this.currentVoice.identifier;
            }

            console.log('TTS Speaking with options:', speakOptions);
            await TextToSpeech.speak(speakOptions);
            this.speaking = false;
            return true;
        } catch (error) {
            this.speaking = false;
            console.error('TTS speak error:', error);
            throw error;
        }
    }

    async stop() {
        try {
            if (!this.initialized) return;
            await TextToSpeech.stop();
            this.speaking = false;
            return true;
        } catch (error) {
            console.error('TTS stop error:', error);
            throw error;
        }
    }

    async getSupportedVoices() {
        try {
            const platform = Capacitor.getPlatform();
            if (platform === 'android' || platform === 'ios') {
                return { voices: [] };
            } else if (window.speechSynthesis) {
                const voices = window.speechSynthesis.getVoices();
                return {
                    voices: voices.map(voice => ({
                        identifier: voice.voiceURI,
                        name: voice.name,
                        lang: voice.lang,
                        default: voice.default
                    }))
                };
            }
            return { voices: [] };
        } catch (error) {
            console.error('Error getting voices:', error);
            return { voices: [] };
        }
    }

    async getSupportedLanguages() {
        try {
            if (!this.initialized) {
                await this.initialize();
            }
            return await TextToSpeech.getSupportedLanguages();
        } catch (error) {
            console.error('Error getting languages:', error);
            return ['en-US'];
        }
    }

    isInitialized() {
        return this.initialized;
    }

    isSpeaking() {
        return this.speaking;
    }

    getCurrentVoice() {
        return this.currentVoice;
    }

    getDefaultOptions() {
        return { ...this.defaultOptions };
    }
}

export const TTSService = new CustomTextToSpeech();