// assets/js/capacitor/core.js
export const Capacitor = {
    getPlatform() {
        return 'android'; // Since we're running on Android
    },
    isNativePlatform() {
        return true; // Since we're running in a native app
    }
};

export const WebPlugin = class {};