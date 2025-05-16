export const Filesystem = {
    async getUri({ path, directory }) {
        console.log('getUri input:', { path, directory });
        
        if (!path) {
            throw new Error('Path parameter is required');
        }

        // Always use forward slashes and remove any leading/trailing slashes
        const cleanPath = path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
        
        // Build path depending on the context
        const normalizedPath = directory === 'ASSETS' ? 
            `/assets/${cleanPath}` : cleanPath;
        
        console.log('getUri normalized path:', normalizedPath);
        return { uri: normalizedPath };
    },

    async readFile({ path, directory }) {
        try {
            console.log('readFile input:', { path, directory });
            
            if (!path) {
                throw new Error('Path parameter is required');
            }

            // Get normalized URI first
            const { uri } = await this.getUri({ path, directory });
            console.log('readFile attempting fetch from:', uri);

            // Try to fetch the file
            try {
                const response = await fetch(uri, {
                    method: 'GET',
                    headers: {
                        'Accept': path.endsWith('.wasm') ? 
                            'application/wasm' : 'application/octet-stream',
                        'Cache-Control': 'no-cache'
                    }
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const arrayBuffer = await response.arrayBuffer();
                console.log('readFile success, size:', arrayBuffer.byteLength);
                return arrayBuffer;
            } catch (fetchError) {
                console.error('Fetch error:', fetchError);
                // Try alternative path if first attempt fails
                const altPath = uri.startsWith('/') ? uri.substring(1) : `/${uri}`;
                console.log('Trying alternative path:', altPath);
                
                const altResponse = await fetch(altPath, {
                    method: 'GET',
                    headers: {
                        'Accept': path.endsWith('.wasm') ? 
                            'application/wasm' : 'application/octet-stream',
                        'Cache-Control': 'no-cache'
                    }
                });

                if (!altResponse.ok) {
                    throw new Error(`File not found at ${uri} or ${altPath}`);
                }

                const altArrayBuffer = await altResponse.arrayBuffer();
                console.log('readFile success with alt path, size:', altArrayBuffer.byteLength);
                return altArrayBuffer;
            }
        } catch (error) {
            console.error('readFile error:', error);
            throw error;
        }
    },

    async checkFileStatus(path) {
        if (!path) {
            throw new Error('Path parameter is required');
        }

        // Try multiple path variations
        const pathVariations = [
            path,
            `/assets/${path}`,
            path.startsWith('/') ? path.substring(1) : `/${path}`
        ];

        for (const testPath of pathVariations) {
            try {
                const response = await fetch(testPath, { 
                    method: 'HEAD',
                    cache: 'no-cache'
                });
                
                if (response.ok) {
                    return {
                        path: testPath,
                        exists: true,
                        status: response.status,
                        statusText: response.statusText
                    };
                }
            } catch (error) {
                console.warn(`Path check failed for ${testPath}:`, error);
            }
        }

        return {
            path,
            exists: false,
            error: 'File not found in any location'
        };
    },

    async fileExists(path) {
        try {
            const response = await fetch(path, { method: 'HEAD' });
            return response.ok;
        } catch (error) {
            console.error('Error checking file existence:', error);
            return false;
        }
    },

    async isFileAccessible(path) {
        try {
            const response = await fetch(path, { 
                method: 'HEAD',
                headers: { 'Accept': 'application/octet-stream' }
            });
            return {
                accessible: response.ok,
                status: response.status,
                statusText: response.statusText,
                headers: Object.fromEntries(response.headers)
            };
        } catch (error) {
            console.error('Error checking file accessibility:', error);
            return {
                accessible: false,
                error: error.message
            };
        }
    }
};