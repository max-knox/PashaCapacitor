import { TextToSpeech } from '@capacitor-community/text-to-speech';

// Re-export the plugin
export { TextToSpeech };

// Add any additional platform-specific initialization here
if (window.Capacitor?.getPlatform() === 'android') {
    // Android-specific initialization
    console.log('Initializing TTS for Android');
} else if (window.Capacitor?.getPlatform() === 'ios') {
    // iOS-specific initialization
    console.log('Initializing TTS for iOS');
} else {
    console.log('Initializing TTS for web');
}
