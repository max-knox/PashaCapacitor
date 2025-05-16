importScripts('llama.min.js'); // Load the LLAMA inference engine

let model = null;

self.onmessage = async function(e) {
    try {
        switch (e.data.type) {
            case 'load':
                await loadModel(e.data.modelData, e.data.config);
                break;
            case 'generate':
                const result = await generate(e.data);
                self.postMessage({ type: 'completion', text: result });
                break;
        }
    } catch (error) {
        self.postMessage({ type: 'error', error: error.message });
    }
};

async function loadModel(modelData, config) {
    try {
        // Initialize LLAMA model with configuration
        model = await llama.load({
            modelData: new Uint8Array(modelData),
            contextSize: config.contextSize,
            threads: config.threads,
            batchSize: config.batchSize
        });
        
        self.postMessage({ type: 'loaded' });
    } catch (error) {
        self.postMessage({ type: 'error', error: error.message });
    }
}

async function generate({ prompt, maxTokens, temperature, topP }) {
    if (!model) {
        throw new Error('Model not loaded');
    }

    const result = await model.generate(prompt, {
        maxTokens,
        temperature,
        topP,
        stopSequences: ['[/INST]', '\n\n']
    });

    return result.text;
}
