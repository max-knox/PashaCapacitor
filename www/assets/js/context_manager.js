/**
 * Context Management Controller
 * Handles conversation context storage, retrieval, and management with Firestore
 */
export class ContextManager {
    constructor(firestore) {
        this.db = firestore;
        this.currentContext = null;
        this.contextCache = new Map();
        this.maxContextItems = 50; // Limit to prevent memory bloat
        this.autoSaveInterval = 30000; // Auto-save every 30 seconds
        this.autoSaveTimer = null;
        
        // Initialize collections
        this.collections = {
            contexts: 'user_contexts',
            conversations: 'conversation_history',
            settings: 'user_settings'
        };
        
        this.init();
    }

    /**
     * Initialize the context manager
     */
    async init() {
        try {
            console.log('🧠 Initializing Context Manager...');
            
            // Load existing context from localStorage (immediate access)
            this.loadFromLocalStorage();
            
            // Sync with Firestore (background operation)
            await this.syncWithFirestore();
            
            // Start auto-save timer
            this.startAutoSave();
            
            console.log('✅ Context Manager initialized successfully');
        } catch (error) {
            console.error('❌ Error initializing Context Manager:', error);
        }
    }

    /**
     * Add context from a conversation message
     * @param {Object} message - Message object from ElevenLabs
     * @param {string} conversationId - Unique conversation identifier
     */
    async addContext(message, conversationId = null) {
        try {
            const contextItem = this.createContextItem(message, conversationId);
            
            if (!contextItem) return; // Skip if no valid content
            
            // Add to current context
            if (!this.currentContext) {
                this.currentContext = {
                    id: this.generateContextId(),
                    created: new Date().toISOString(),
                    updated: new Date().toISOString(),
                    items: []
                };
            }
            
            this.currentContext.items.push(contextItem);
            this.currentContext.updated = new Date().toISOString();
            
            // Maintain size limit
            if (this.currentContext.items.length > this.maxContextItems) {
                this.currentContext.items = this.currentContext.items.slice(-this.maxContextItems);
            }
            
            // Update cache
            this.contextCache.set(this.currentContext.id, this.currentContext);
            
            // Save to localStorage immediately
            this.saveToLocalStorage();
            
            console.log('📝 Context added:', contextItem);
            
            return contextItem;
        } catch (error) {
            console.error('❌ Error adding context:', error);
        }
    }

    /**
     * Create a standardized context item from message
     */
    createContextItem(message, conversationId) {
        if (!message || (!message.text && !message.message)) return null;
        
        const text = message.text || message.message || '';
        if (text.trim().length === 0) return null;
        
        return {
            id: this.generateItemId(),
            timestamp: new Date().toISOString(),
            conversationId: conversationId || this.generateConversationId(),
            type: message.type || 'unknown',
            source: message.source || (message.type?.includes('user') ? 'user' : 'agent'),
            content: text.trim(),
            metadata: {
                messageType: message.type,
                originalMessage: message
            }
        };
    }

    /**
     * Get all contexts for display
     */
    async getAllContexts() {
        try {
            // First get from cache
            const cached = Array.from(this.contextCache.values())
                .sort((a, b) => new Date(b.updated) - new Date(a.updated));
            
            // If we have cached data, return it immediately
            if (cached.length > 0) {
                return cached;
            }
            
            // Otherwise fetch from Firestore
            const snapshot = await this.db.collection(this.collections.contexts)
                .orderBy('updated', 'desc')
                .limit(20)
                .get();
            
            const contexts = [];
            snapshot.forEach(doc => {
                const data = { id: doc.id, ...doc.data() };
                contexts.push(data);
                this.contextCache.set(doc.id, data);
            });
            
            return contexts;
        } catch (error) {
            console.error('❌ Error getting contexts:', error);
            return Array.from(this.contextCache.values());
        }
    }

    /**
     * Delete a specific context
     */
    async deleteContext(contextId) {
        try {
            // Remove from Firestore
            await this.db.collection(this.collections.contexts).doc(contextId).delete();
            
            // Remove from cache
            this.contextCache.delete(contextId);
            
            // If this was the current context, clear it
            if (this.currentContext && this.currentContext.id === contextId) {
                this.currentContext = null;
            }
            
            // Update localStorage
            this.saveToLocalStorage();
            
            console.log('🗑️ Context deleted:', contextId);
            return true;
        } catch (error) {
            console.error('❌ Error deleting context:', error);
            return false;
        }
    }

    /**
     * Clear all contexts
     */
    async clearAllContexts() {
        try {
            // Get all context documents
            const snapshot = await this.db.collection(this.collections.contexts).get();
            
            // Delete in batches
            const batch = this.db.batch();
            snapshot.docs.forEach(doc => {
                batch.delete(doc.ref);
            });
            
            await batch.commit();
            
            // Clear local data
            this.contextCache.clear();
            this.currentContext = null;
            this.saveToLocalStorage();
            
            console.log('🧹 All contexts cleared');
            return true;
        } catch (error) {
            console.error('❌ Error clearing contexts:', error);
            return false;
        }
    }

    /**
     * Get context summary for AI processing
     */
    getContextSummary(limit = 10) {
        if (!this.currentContext || !this.currentContext.items) return '';
        
        const recentItems = this.currentContext.items
            .slice(-limit)
            .map(item => `${item.source}: ${item.content}`)
            .join('\n');
        
        return recentItems;
    }

    /**
     * Save current context to Firestore
     */
    async saveContext() {
        if (!this.currentContext) return;
        
        try {
            await this.db.collection(this.collections.contexts)
                .doc(this.currentContext.id)
                .set({
                    ...this.currentContext,
                    updated: new Date().toISOString()
                }, { merge: true });
            
            console.log('💾 Context saved to Firestore');
            return true;
        } catch (error) {
            console.error('❌ Error saving context:', error);
            return false;
        }
    }

    /**
     * Auto-save functionality
     */
    startAutoSave() {
        this.stopAutoSave(); // Clear any existing timer
        
        this.autoSaveTimer = setInterval(async () => {
            if (this.currentContext && this.currentContext.items.length > 0) {
                await this.saveContext();
            }
        }, this.autoSaveInterval);
    }

    stopAutoSave() {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
            this.autoSaveTimer = null;
        }
    }

    /**
     * Local storage operations for immediate access
     */
    saveToLocalStorage() {
        try {
            const data = {
                currentContext: this.currentContext,
                cache: Array.from(this.contextCache.entries()).slice(-10) // Only store recent items
            };
            localStorage.setItem('pasha_context', JSON.stringify(data));
        } catch (error) {
            console.warn('⚠️ Could not save to localStorage:', error);
        }
    }

    loadFromLocalStorage() {
        try {
            const stored = localStorage.getItem('pasha_context');
            if (stored) {
                const data = JSON.parse(stored);
                this.currentContext = data.currentContext;
                
                if (data.cache) {
                    this.contextCache = new Map(data.cache);
                }
                
                console.log('📱 Context loaded from localStorage');
            }
        } catch (error) {
            console.warn('⚠️ Could not load from localStorage:', error);
        }
    }

    /**
     * Sync with Firestore (background operation)
     */
    async syncWithFirestore() {
        try {
            // If we have a current context, save it
            if (this.currentContext) {
                await this.saveContext();
            }
            
            // Load recent contexts from Firestore
            const recent = await this.getAllContexts();
            console.log(`🔄 Synced ${recent.length} contexts from Firestore`);
        } catch (error) {
            console.warn('⚠️ Could not sync with Firestore:', error);
        }
    }

    /**
     * Utility functions
     */
    generateContextId() {
        return `ctx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    generateItemId() {
        return `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    generateConversationId() {
        return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get context statistics
     */
    getStats() {
        return {
            totalContexts: this.contextCache.size,
            currentItems: this.currentContext ? this.currentContext.items.length : 0,
            lastUpdated: this.currentContext ? this.currentContext.updated : null
        };
    }

    /**
     * Cleanup method
     */
    cleanup() {
        this.stopAutoSave();
        this.saveToLocalStorage();
        
        if (this.currentContext) {
            this.saveContext();
        }
    }
}