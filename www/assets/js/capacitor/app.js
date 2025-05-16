export const App = {
    addListener: (eventName, callback) => {
        if (eventName === 'appStateChange') {
            // Add web-specific state change listeners
            const handleVisibilityChange = () => {
                const isActive = !document.hidden;
                callback({ isActive });
            };

            // Listen for visibility changes
            document.addEventListener('visibilitychange', handleVisibilityChange);

            // Listen for focus/blur
            window.addEventListener('focus', () => callback({ isActive: true }));
            window.addEventListener('blur', () => callback({ isActive: false }));

            // Return cleanup function
            return {
                remove: () => {
                    document.removeEventListener('visibilitychange', handleVisibilityChange);
                    window.removeEventListener('focus', () => callback({ isActive: true }));
                    window.removeEventListener('blur', () => callback({ isActive: false }));
                }
            };
        }

        // Handle other app events if needed
        return {
            remove: () => {
                // Default cleanup
            }
        };
    },

    getState: async () => {
        return {
            isActive: !document.hidden
        };
    },

    minimizeApp: async () => {
        console.warn('minimizeApp is not supported in web browser');
    },

    exitApp: () => {
        console.warn('exitApp is not supported in web browser');
    }
};