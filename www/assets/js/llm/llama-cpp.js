import { Filesystem } from '@capacitor/filesystem';

// Load LLAMA wasm module
const loadLlamaModule = async () => {
    try {
        // First try loading as a module
        const llamaModule = await import('./llama.min.js').catch(async () => {
            // If module loading fails, try loading as a script
            const script = document.createElement('script');
            script.src = '/assets/js/llm/llama.min.js';
            document.head.appendChild(script);
            
            return new Promise((resolve, reject) => {
                script.onload = () => resolve(window.llama);
                script.onerror = () => reject(new Error('Failed to load LLAMA script'));
            });
        });
        
        return llamaModule.default || llamaModule;
    } catch (error) {
        console.error('Error loading LLAMA module:', error);
        throw error;
    }
};

export class LLM {
    constructor(config) {
        this.config = config;
        this.model = null;
        this.isLoaded = false;
        console.log('LLM instance created with config:', config);
    }

    async load() {
        try {
            console.log('Loading LLM model...');
            
            // Load the LLAMA module
            const llamaModule = await loadLlamaModule();
            console.log('LLAMA module loaded:', llamaModule);
            
            // Load model data
            const modelData = await this.loadModelData();
            
            // Initialize the model
            this.model = await llamaModule.create({
                modelPath: new Uint8Array(modelData),
                numberOfThreads: this.config.threads,
                contextSize: this.config.contextSize,
                batchSize: this.config.batchSize,
                seed: Math.floor(Math.random() * 1000000)
            });

            console.log('Model loaded successfully');
            this.isLoaded = true;
            return true;
        } catch (error) {
            console.error('Error loading model:', error);
            throw error;
        }
    }

    async loadModelData() {
        try {
            const response = await Filesystem.readFile({
                path: this.config.path,
                directory: 'ASSETS'
            });
            console.log('Model data loaded, size:', response.byteLength);
            return response;
        } catch (error) {
            console.error('Error loading model data:', error);
            throw error;
        }
    }

    async complete({ prompt, maxTokens, temperature, topP }) {
        try {
            if (!this.isLoaded || !this.model) {
                throw new Error('Model not loaded');
            }

            console.log('Generating completion for:', prompt);
            
            const result = await this.model.generate({
                prompt,
                maxTokens,
                temperature,
                topP,
                stopSequences: ['[/INST]', '\n\n'],
                repetitionPenalty: 1.1,
                topK: 40,
                streamResponse: false
            });

            console.log('Generated response:', result);
            return {
                text: result.text,
                usage: {
                    promptTokens: result.promptTokens,
                    completionTokens: result.completionTokens,
                    totalTokens: result.totalTokens
                }
            };
        } catch (error) {
            console.error('Error in completion:', error);
            throw error;
        }
    }

    async cleanup() {
        try {
            if (this.model) {
                await this.model.dispose();
                this.model = null;
            }
            this.isLoaded = false;
            console.log('LLM cleanup completed');
        } catch (error) {
            console.error('Error in cleanup:', error);
        }
    }
}
