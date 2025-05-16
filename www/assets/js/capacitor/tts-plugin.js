export const TextToSpeech = {
    speak: async (options) => {
        console.log('Platform:', window.Capacitor?.getPlatform());
        console.log('Capacitor plugins:', window.Capacitor?.Plugins);
        console.log('Web Speech available:', 'speechSynthesis' in window);
        
        // Try native Android TTS first
        if (window.Capacitor?.Plugins?.TextToSpeech) {
            try {
                console.log('Using Capacitor TTS');
                return await window.Capacitor.Plugins.TextToSpeech.speak({
                    text: options.text,
                    lang: options.lang || 'en-US',
                    rate: options.rate || 1.0,
                    pitch: options.pitch || 1.0,
                    volume: options.volume || 1.0
                });
            } catch (e) {
                console.log('Capacitor TTS failed:', e);
            }
        }
        
        // Fallback to web speech synthesis
        if ('speechSynthesis' in window) {
            console.log('Using Web Speech');
            return new Promise((resolve, reject) => {
                const utterance = new SpeechSynthesisUtterance(options.text);
                utterance.lang = options.lang || 'en-US';
                utterance.rate = options.rate || 1.0;
                utterance.pitch = options.pitch || 1.0;
                utterance.volume = options.volume || 1.0;
                
                utterance.onend = () => resolve();
                utterance.onerror = (error) => reject(error);
                
                window.speechSynthesis.speak(utterance);
            });
        }
        
        throw new Error('No speech synthesis method available');
    },
    
    stop: async () => {
        if (window.Capacitor?.Plugins?.TextToSpeech) {
            try {
                return await window.Capacitor.Plugins.TextToSpeech.stop();
            } catch (e) {
                console.log('Capacitor TTS stop failed:', e);
            }
        }

        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            return Promise.resolve();
        }
        throw new Error('No speech synthesis method available');
    },
    
    getSupportedLanguages: async () => {
        if (window.Capacitor?.Plugins?.TextToSpeech) {
            try {
                return await window.Capacitor.Plugins.TextToSpeech.getSupportedLanguages();
            } catch (e) {
                console.log('Failed to get supported languages:', e);
            }
        }
        return Promise.resolve(['en-US']); // Default fallback
    }
};