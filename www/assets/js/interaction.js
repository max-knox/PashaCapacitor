// New Interactions

class LLMInteraction {
    constructor() {
        this.llmCards = document.querySelectorAll('.llm-card');
        this.readoutTitle = document.querySelector('.llm_readout_title');
        this.init();
    }

    init() {
        this.llmCards.forEach(card => {
            card.addEventListener('click', () => this.handleCardSelection(card));
        });
    }

    handleCardSelection(selectedCard) {
        // Remove active class from all cards
        this.llmCards.forEach(card => card.classList.remove('llm-card-active'));
        
        // Add active class to selected card
        selectedCard.classList.add('llm-card-active');

        // Get the model name from the card's classes
        const modelClass = Array.from(selectedCard.classList)
            .find(className => ['gemini', 'llama', 'grok', 'claude', 'openAI'].includes(className));

        // Update readout title with capitalized model name
        if (modelClass) {
            const modelName = modelClass.charAt(0).toUpperCase() + modelClass.slice(1);
            this.readoutTitle.textContent = `Language Model: ${modelName}`;
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new LLMInteraction();
});