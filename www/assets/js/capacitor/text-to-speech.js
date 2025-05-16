// text-to-speech.js
import { Capacitor } from '@capacitor/core';
import { TextToSpeech as PluginTextToSpeech } from '@capacitor-community/text-to-speech';

class CustomTextToSpeech {
    constructor() {
        this.speaking = false;
    }

    async speak(options) {
        try {
            if (this.speaking) {
                await this.stop();
            }

            this.speaking = true;

            // Use native TTS on Android if available
            if (Capacitor.getPlatform() === 'android') {
                // Use the imported PluginTextToSpeech module
                try {
                    await PluginTextToSpeech.speak({
                        text: options.text,
                        lang: options.lang || 'en-US',
                        rate: options.rate || 1.0,
                        pitch: options.pitch || 1.0,
                        volume: options.volume || 1.0
                    });
                    this.speaking = false;
                    return;
                } catch (error) {
                    console.error('TextToSpeech speak error:', error);
                    this.speaking = false;
                    throw error;
                }
            } 
            // For other platforms, handle accordingly or throw an error
            else {
                console.error(`Unsupported platform for native TTS: ${Capacitor.getPlatform()}`);
                this.speaking = false;
                throw new Error(`Unsupported platform for native TTS: ${Capacitor.getPlatform()}`);
            }
        } catch (error) {
            this.speaking = false;
            console.error('TextToSpeech speak error:', error);
            throw error;
        }
    }

    async stop() {
        try {
            if (Capacitor.getPlatform() === 'android') {
                return new Promise((resolve, reject) => {
                    // Use the imported PluginTextToSpeech module's stop method
                    PluginTextToSpeech.stop().then(resolve).catch(reject);
                });
            } else {
                PluginTextToSpeech.cancel();
            }
            this.speaking = false;
        } catch (error) {
            console.error('TextToSpeech stop error:', error);
            throw error;
        }
    }

    async getSupportedVoices() {
        try {
            if (Capacitor.getPlatform() === 'android') {
                return { voices: [] }; // Return empty array for now on Android
            } else {
                const voices = await PluginTextToSpeech.getSupportedVoices();
                return { voices };
            }
        } catch (error) {
            console.error('Error getting voices:', error);
            return { voices: [] };
        }
    }

    async getSupportedLanguages() {
        try {
            const voices = await this.getSupportedVoices();
            const languages = [...new Set(voices.voices.map(voice => voice.lang))];
            return { languages };
        } catch (error) {
            console.error('Error getting languages:', error);
            return { languages: ['en-US'] };
        }
    }
}

export const CustomTextToSpeech = new CustomTextToSpeech();