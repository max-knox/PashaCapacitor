export const SpeechRecognitionService = {
    // Check if speech recognition is available
    available: async () => {
        console.log('Platform:', window.Capacitor?.getPlatform());
        console.log('Capacitor plugins:', window.Capacitor?.Plugins);
        
        try {
            // Try Capacitor plugin first
            if (window.Capacitor?.Plugins?.SpeechRecognition) {
                const result = await window.Capacitor.Plugins.SpeechRecognition.available();
                console.log('Capacitor speech recognition availability:', result);
                return { available: result.available };
            } 
            // Fallback to Web Speech API
            else if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
                console.log('Web Speech API available');
                return { available: true };
            }
            
            return { available: false };
        } catch (e) {
            console.error('Speech recognition availability error:', e);
            return { available: false };
        }
    },

    // Request permissions for speech recognition
    requestPermissions: async () => {
        try {
            if (window.Capacitor?.Plugins?.SpeechRecognition) {
                const platform = window.Capacitor.getPlatform();
                console.log('Requesting permissions for platform:', platform);

                // Initial permission check
                const initialStatus = await window.Capacitor.Plugins.SpeechRecognition.checkPermissions();
                console.log('Initial permission status:', JSON.stringify(initialStatus));

                // Always request permission on Android
                if (platform === 'android') {
                    try {
                        // Request permissions
                        const request = await window.Capacitor.Plugins.SpeechRecognition.requestPermissions();
                        console.log('Permission request result:', JSON.stringify(request));

                        // Verify final permission state
                        const finalStatus = await window.Capacitor.Plugins.SpeechRecognition.checkPermissions();
                        console.log('Final permission status:', JSON.stringify(finalStatus));

                        // Handle Android-specific permission response
                        if (finalStatus.speechRecognition) {
                            switch (finalStatus.speechRecognition) {
                                case 'granted':
                                    console.log('Permission granted successfully');
                                    return { granted: true };
                                case 'denied':
                                    console.error('Permission denied by user');
                                    return { granted: false };
                                case 'prompt':
                                    console.log('Permission needs prompt, allowing native dialog');
                                    return { granted: true };
                                default:
                                    console.log('Permission state:', finalStatus.speechRecognition);
                                    // If the permission shows as granted in any form, accept it
                                    return { granted: finalStatus.speechRecognition === 'granted' };
                            }
                        }

                        // Fallback check for legacy format
                        if (finalStatus.state) {
                            return { granted: finalStatus.state === 'granted' };
                        }

                        console.error('Unexpected permission format:', finalStatus);
                        return { granted: false };
                    } catch (permError) {
                        console.error('Error requesting permissions:', permError);
                        return { granted: false };
                    }
                }

                // For non-Android platforms
                return { granted: initialStatus.state === 'granted' || initialStatus.speechRecognition === 'granted' };
            }
            // Web Speech API permissions
            else if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
                try {
                    const mediaPermission = await navigator.mediaDevices.getUserMedia({ audio: true });
                    if (mediaPermission) {
                        return { granted: true };
                    }
                } catch (error) {
                    console.error('Media permission error:', error);
                    return { granted: false };
                }
            }
            
            return { granted: false };
        } catch (e) {
            console.error('Speech recognition permission error:', e);
            return { granted: false };
        }
    },

    // Start speech recognition
    start: async (options = {}) => {
        try {
            console.log('Starting speech recognition...');
            
            // Check permissions first
            const permissionStatus = await SpeechRecognitionService.requestPermissions();
            console.log('Permission check result:', JSON.stringify(permissionStatus));

            if (!permissionStatus.granted) {
                console.error('Permission not granted for speech recognition');
                throw new Error('Speech recognition permission not granted');
            }

            // Try Capacitor plugin first
            if (window.Capacitor?.Plugins?.SpeechRecognition) {
                console.log('Starting Capacitor speech recognition with options:', options);
                const result = await window.Capacitor.Plugins.SpeechRecognition.start({
                    language: options.language || 'en-US',
                    maxResults: options.maxResults || 1,
                    prompt: options.prompt || '',
                    partialResults: options.partialResults || false,
                    popup: options.popup || false
                });
                console.log('Capacitor speech recognition started:', result);
                return result;
            }
            // Fallback to Web Speech API
            else if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
                const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                const recognition = new SpeechRecognition();
                
                recognition.continuous = false;
                recognition.interimResults = options.partialResults || false;
                recognition.lang = options.language || 'en-US';

                return new Promise((resolve, reject) => {
                    recognition.onresult = (event) => {
                        const transcript = event.results[0][0].transcript;
                        resolve({ matches: [transcript] });
                    };

                    recognition.onerror = (error) => {
                        console.error('Web Speech API error:', error);
                        reject(error);
                    };

                    recognition.start();
                    console.log('Web Speech API recognition started');
                });
            }

            throw new Error('No speech recognition method available');
        } catch (e) {
            console.error('Speech recognition start error:', e);
            throw e;
        }
    },

    // Stop speech recognition
    stop: async () => {
        try {
            // Stop Capacitor plugin
            if (window.Capacitor?.Plugins?.SpeechRecognition) {
                await window.Capacitor.Plugins.SpeechRecognition.stop();
                console.log('Capacitor speech recognition stopped');
            }
            // Stop Web Speech API
            else if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
                const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                if (SpeechRecognition.current) {
                    SpeechRecognition.current.stop();
                    console.log('Web Speech API recognition stopped');
                }
            }
        } catch (e) {
            console.error('Speech recognition stop error:', e);
            throw e;
        }
    },

    // Add event listener
    addListener: (eventName, callback) => {
        if (window.Capacitor?.Plugins?.SpeechRecognition) {
            const handler = (result) => {
                console.log(`Capacitor speech recognition ${eventName} event:`, result);
                if (eventName === 'partialResults' && result.matches && result.matches.length > 0) {
                    callback({ matches: [result.matches[0]] });
                } else if (eventName === 'speechResults' && result.matches && result.matches.length > 0) {
                    callback({ matches: [result.matches[0]] });
                } else if (eventName === 'speechError' && result.error) {
                    callback({ error: result.error });
                }
            };
    
            const listener = window.Capacitor.Plugins.SpeechRecognition.addListener(eventName, handler);
            return listener;
        }
        // Web Speech API event handling
        else if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (SpeechRecognition.current) {
                const handler = (event) => {
                    if (eventName === 'partialResults') {
                        callback({ matches: [event.results[0][0].transcript] });
                    } else if (eventName === 'speechResults') {
                        callback({ matches: [event.results[0][0].transcript] });
                    } else if (eventName === 'speechError') {
                        callback({ error: event.error });
                    }
                };

                SpeechRecognition.current.addEventListener(eventName, handler);
                return {
                    remove: () => {
                        SpeechRecognition.current.removeEventListener(eventName, handler);
                    }
                };
            }
        }

        console.error('No speech recognition method available for event listening');
        return { remove: () => {} };
    },

    // Remove all event listeners
    removeAllListeners: async () => {
        try {
            // Remove Capacitor listeners
            if (window.Capacitor?.Plugins?.SpeechRecognition) {
                await window.Capacitor.Plugins.SpeechRecognition.removeAllListeners();
                console.log('Removed all Capacitor speech recognition listeners');
            }
            // Remove Web Speech API listeners
            else if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
                const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                if (SpeechRecognition.current) {
                    SpeechRecognition.current = null;
                    console.log('Removed all Web Speech API listeners');
                }
            }
        } catch (e) {
            console.error('Error removing listeners:', e);
            throw e;
        }
    },

    // Add this new method
    isListening: async () => {
        try {
            if (window.Capacitor?.Plugins?.SpeechRecognition) {
                return { listening: false }; // Default state since Capacitor doesn't provide this
            }
            // Web Speech API fallback
            else if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
                const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                if (SpeechRecognition.current) {
                    return { listening: true };
                }
            }
            return { listening: false };
        } catch (e) {
            console.error('Error checking listening state:', e);
            return { listening: false };
        }
    }
};