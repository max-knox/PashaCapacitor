/**
 * Settings Modal Controller with Context Management
 * Handles all settings modal functionality including context display and management
 */
export class SettingsController {
    constructor(contextManager) {
        this.contextManager = contextManager;
        this.modal = null;
        this.currentTab = 'general';
        this.isInitialized = false;
        
        this.init();
    }

    /**
     * Initialize the settings controller
     */
    init() {
        if (this.isInitialized) return;
        
        try {
            this.setupModal();
            this.setupEventListeners();
            this.createTabs();
            this.isInitialized = true;
            
            console.log('⚙️ Settings Controller initialized');
        } catch (error) {
            console.error('❌ Error initializing Settings Controller:', error);
        }
    }

    /**
     * Setup modal elements and structure
     */
    setupModal() {
        this.modal = document.getElementById('settingsModal');
        if (!this.modal) {
            console.error('Settings modal not found');
            return;
        }

        // Update modal structure with tabs
        this.updateModalStructure();
    }

    /**
     * Update the modal structure to include tabs and context management
     */
    updateModalStructure() {
        const modalBody = this.modal.querySelector('.settings-modal-body');
        if (!modalBody) return;

        // Create tab navigation
        const tabNavigation = this.createTabNavigation();
        modalBody.parentNode.insertBefore(tabNavigation, modalBody);

        // Update modal body with tab content
        modalBody.innerHTML = this.createTabContent();
    }

    /**
     * Create tab navigation
     */
    createTabNavigation() {
        const nav = document.createElement('div');
        nav.className = 'settings-tabs';
        nav.innerHTML = `
            <button class="settings-tab active" data-tab="general">
                <i class="fas fa-cog"></i> General
            </button>
            <button class="settings-tab" data-tab="voice">
                <i class="fas fa-microphone"></i> Voice
            </button>
            <button class="settings-tab" data-tab="context">
                <i class="fas fa-brain"></i> Context
            </button>
            <button class="settings-tab" data-tab="privacy">
                <i class="fas fa-shield-alt"></i> Privacy
            </button>
        `;
        return nav;
    }

    /**
     * Create tab content
     */
    createTabContent() {
        return `
            <!-- General Settings Tab -->
            <div class="tab-content active" data-tab="general">
                <div class="settings-grid">
                    <div class="settings-column">
                        <div class="settings-section">
                            <h3>Interface Settings</h3>
                            <div class="settings-item">
                                <label for="theme">Theme:</label>
                                <select id="theme">
                                    <option value="light" selected>Light</option>
                                    <option value="dark">Dark</option>
                                    <option value="auto">Auto (System)</option>
                                </select>
                            </div>
                            <div class="settings-item">
                                <label for="language">Language:</label>
                                <select id="language">
                                    <option value="en-US" selected>English (US)</option>
                                    <option value="es-ES">Spanish</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    
                    <div class="settings-column">
                        <div class="settings-section">
                            <h3>Notification Settings</h3>
                            <div class="settings-item">
                                <label for="notificationSound">Notification Sound:</label>
                                <select id="notificationSound">
                                    <option value="default" selected>Default</option>
                                    <option value="silent">Silent</option>
                                    <option value="subtle">Subtle</option>
                                </select>
                            </div>
                            <div class="settings-item">
                                <label for="autoSave">Auto-save Conversations:</label>
                                <select id="autoSave">
                                    <option value="enabled" selected>Enabled</option>
                                    <option value="disabled">Disabled</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Voice Settings Tab -->
            <div class="tab-content" data-tab="voice">
                <div class="settings-grid">
                    <div class="settings-column">
                        <div class="settings-section">
                            <h3>Voice Settings</h3>
                            <div class="settings-item">
                                <label for="voiceSelect">Voice:</label>
                                <select id="voiceSelect">
                                    <option value="default">Default</option>
                                    <option value="voice1">Voice 1</option>
                                    <option value="voice2">Voice 2</option>
                                </select>
                            </div>
                            <div class="settings-item">
                                <label for="voiceSpeed">Voice Speed:</label>
                                <select id="voiceSpeed">
                                    <option value="0.8">Slow</option>
                                    <option value="1.0" selected>Normal</option>
                                    <option value="1.2">Fast</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    
                    <div class="settings-column">
                        <div class="settings-section">
                            <h3>Audio Settings</h3>
                            <div class="settings-item">
                                <label for="inputVolume">Input Sensitivity:</label>
                                <input type="range" id="inputVolume" min="0" max="100" value="75">
                                <span class="range-value">75%</span>
                            </div>
                            <div class="settings-item">
                                <label for="outputVolume">Output Volume:</label>
                                <input type="range" id="outputVolume" min="0" max="100" value="80">
                                <span class="range-value">80%</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Context Management Tab -->
            <div class="tab-content" data-tab="context">
                <div class="context-management">
                    <div class="context-header">
                        <h3>Conversation Context</h3>
                        <div class="context-stats" id="contextStats">
                            <span class="stat-item">
                                <i class="fas fa-comments"></i>
                                <span id="totalContexts">0</span> Contexts
                            </span>
                            <span class="stat-item">
                                <i class="fas fa-clock"></i>
                                <span id="lastUpdated">Never</span>
                            </span>
                        </div>
                    </div>
                    
                    <div class="context-controls">
                        <button id="refreshContexts" class="btn-secondary">
                            <i class="fas fa-sync-alt"></i> Refresh
                        </button>
                        <button id="exportContexts" class="btn-secondary">
                            <i class="fas fa-download"></i> Export
                        </button>
                        <button id="clearAllContexts" class="btn-danger">
                            <i class="fas fa-trash"></i> Clear All
                        </button>
                    </div>
                    
                    <div class="context-list" id="contextList">
                        <div class="context-loading">
                            <i class="fas fa-spinner fa-spin"></i> Loading contexts...
                        </div>
                    </div>
                </div>
            </div>

            <!-- Privacy Settings Tab -->
            <div class="tab-content" data-tab="privacy">
                <div class="settings-grid">
                    <div class="settings-column">
                        <div class="settings-section">
                            <h3>Data Privacy</h3>
                            <div class="settings-item">
                                <label for="dataRetention">Data Retention:</label>
                                <select id="dataRetention">
                                    <option value="30">30 Days</option>
                                    <option value="90" selected>90 Days</option>
                                    <option value="365">1 Year</option>
                                    <option value="forever">Keep Forever</option>
                                </select>
                            </div>
                            <div class="settings-item">
                                <label for="analyticsOptOut">Analytics:</label>
                                <select id="analyticsOptOut">
                                    <option value="enabled" selected>Enabled</option>
                                    <option value="disabled">Disabled</option>
                                </select>
                            </div>
                        </div>
                        
                        <div class="settings-section">
                            <h3>Data Management</h3>
                            <button class="btn-secondary full-width" id="downloadData">
                                <i class="fas fa-download"></i> Download My Data
                            </button>
                            <button class="btn-danger full-width" id="deleteAllData">
                                <i class="fas fa-exclamation-triangle"></i> Delete All Data
                            </button>
                        </div>
                    </div>
                    
                    <div class="settings-column">
                        <div class="settings-section">
                            <h3>Privacy Information</h3>
                            <p class="privacy-text">
                                Your conversations and context data are stored locally and synchronized 
                                with our secure cloud storage. You have full control over your data 
                                and can delete it at any time.
                            </p>
                            <p class="privacy-text">
                                We use industry-standard encryption to protect your information both 
                                in transit and at rest.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Create tab structure
     */
    createTabs() {
        // Tab switching is handled by event listeners
        this.showTab(this.currentTab);
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Modal close functionality
        const closeBtn = this.modal.querySelector('.settings-modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeModal());
        }

        // Click outside to close
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.closeModal();
            }
        });

        // ESC key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.classList.contains('active')) {
                this.closeModal();
            }
        });

        // Tab switching
        this.modal.addEventListener('click', (e) => {
            if (e.target.classList.contains('settings-tab')) {
                const tab = e.target.dataset.tab;
                this.showTab(tab);
            }
        });

        // Save settings
        const saveBtn = this.modal.querySelector('#saveSettingsBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveSettings());
        }

        // Context management event listeners
        this.setupContextEventListeners();
        
        // Range input updates
        this.setupRangeInputs();
    }

    /**
     * Setup context management event listeners
     */
    setupContextEventListeners() {
        // Refresh contexts
        this.modal.addEventListener('click', async (e) => {
            if (e.target.id === 'refreshContexts' || e.target.closest('#refreshContexts')) {
                await this.refreshContexts();
            }
        });

        // Export contexts
        this.modal.addEventListener('click', async (e) => {
            if (e.target.id === 'exportContexts' || e.target.closest('#exportContexts')) {
                await this.exportContexts();
            }
        });

        // Clear all contexts
        this.modal.addEventListener('click', async (e) => {
            if (e.target.id === 'clearAllContexts' || e.target.closest('#clearAllContexts')) {
                await this.clearAllContexts();
            }
        });

        // Delete individual context
        this.modal.addEventListener('click', async (e) => {
            if (e.target.classList.contains('delete-context') || e.target.closest('.delete-context')) {
                const contextId = e.target.dataset.contextId || e.target.closest('.delete-context').dataset.contextId;
                await this.deleteContext(contextId);
            }
        });
    }

    /**
     * Setup range input event listeners
     */
    setupRangeInputs() {
        this.modal.addEventListener('input', (e) => {
            if (e.target.type === 'range') {
                const valueSpan = e.target.nextElementSibling;
                if (valueSpan && valueSpan.classList.contains('range-value')) {
                    valueSpan.textContent = e.target.value + '%';
                }
            }
        });
    }

    /**
     * Show modal
     */
    openModal() {
        if (!this.modal) return;
        
        this.modal.classList.add('active');
        this.modal.classList.remove('fadeOut');
        
        // Load current settings
        this.loadSettings();
        
        // If context tab, load contexts
        if (this.currentTab === 'context') {
            this.loadContexts();
        }
        
        // Focus close button for accessibility
        const closeBtn = this.modal.querySelector('.settings-modal-close');
        if (closeBtn) {
            setTimeout(() => closeBtn.focus(), 100);
        }
    }

    /**
     * Close modal
     */
    closeModal() {
        if (!this.modal) return;
        
        this.modal.classList.add('fadeOut');
        
        setTimeout(() => {
            this.modal.classList.remove('active', 'fadeOut');
        }, 300);
    }

    /**
     * Show specific tab
     */
    showTab(tabName) {
        // Update tab buttons
        const tabs = this.modal.querySelectorAll('.settings-tab');
        tabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        // Update tab content
        const contents = this.modal.querySelectorAll('.tab-content');
        contents.forEach(content => {
            content.classList.toggle('active', content.dataset.tab === tabName);
        });

        this.currentTab = tabName;

        // Load tab-specific data
        if (tabName === 'context') {
            this.loadContexts();
        }
    }

    /**
     * Load contexts for display
     */
    async loadContexts() {
        if (!this.contextManager) return;

        const contextList = this.modal.querySelector('#contextList');
        if (!contextList) return;

        // Show loading
        contextList.innerHTML = `
            <div class="context-loading">
                <i class="fas fa-spinner fa-spin"></i> Loading contexts...
            </div>
        `;

        try {
            const contexts = await this.contextManager.getAllContexts();
            this.displayContexts(contexts);
            this.updateContextStats();
        } catch (error) {
            console.error('Error loading contexts:', error);
            contextList.innerHTML = `
                <div class="context-error">
                    <i class="fas fa-exclamation-triangle"></i>
                    Error loading contexts. Please try again.
                </div>
            `;
        }
    }

    /**
     * Display contexts in the UI
     */
    displayContexts(contexts) {
        const contextList = this.modal.querySelector('#contextList');
        if (!contextList) return;

        if (contexts.length === 0) {
            contextList.innerHTML = `
                <div class="context-empty">
                    <i class="fas fa-comment-slash"></i>
                    <p>No conversation contexts found.</p>
                    <p>Start a conversation to see context data here.</p>
                </div>
            `;
            return;
        }

        const contextsHTML = contexts.map(context => this.createContextCard(context)).join('');
        contextList.innerHTML = `<div class="context-grid">${contextsHTML}</div>`;
    }

    /**
     * Create a context card for display
     */
    createContextCard(context) {
        const itemCount = context.items ? context.items.length : 0;
        const lastUpdate = new Date(context.updated).toLocaleString();
        const preview = this.getContextPreview(context);
        
        return `
            <div class="context-card" data-context-id="${context.id}">
                <div class="context-card-header">
                    <div class="context-info">
                        <h4 class="context-title">
                            Conversation ${context.id.split('_')[1] || 'Unknown'}
                        </h4>
                        <span class="context-meta">
                            ${itemCount} messages • ${lastUpdate}
                        </span>
                    </div>
                    <div class="context-actions">
                        <button class="btn-icon" title="Export Context" onclick="settingsController.exportSingleContext('${context.id}')">
                            <i class="fas fa-download"></i>
                        </button>
                        <button class="btn-icon delete-context" title="Delete Context" data-context-id="${context.id}">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                
                <div class="context-preview">
                    ${preview}
                </div>
                
                <div class="context-stats">
                    <span class="stat"><i class="fas fa-user"></i> User: ${this.countBySource(context, 'user')}</span>
                    <span class="stat"><i class="fas fa-robot"></i> Agent: ${this.countBySource(context, 'agent')}</span>
                </div>
            </div>
        `;
    }

    /**
     * Get context preview text
     */
    getContextPreview(context) {
        if (!context.items || context.items.length === 0) {
            return '<p class="preview-empty">No messages in this context.</p>';
        }

        const lastFew = context.items.slice(-3);
        return lastFew.map(item => 
            `<p class="preview-item">
                <span class="preview-source">${item.source}:</span> 
                ${item.content.substring(0, 100)}${item.content.length > 100 ? '...' : ''}
            </p>`
        ).join('');
    }

    /**
     * Count messages by source
     */
    countBySource(context, source) {
        if (!context.items) return 0;
        return context.items.filter(item => item.source === source).length;
    }

    /**
     * Update context statistics display
     */
    updateContextStats() {
        if (!this.contextManager) return;

        const stats = this.contextManager.getStats();
        
        const totalElement = this.modal.querySelector('#totalContexts');
        const lastUpdatedElement = this.modal.querySelector('#lastUpdated');
        
        if (totalElement) {
            totalElement.textContent = stats.totalContexts;
        }
        
        if (lastUpdatedElement) {
            if (stats.lastUpdated) {
                const date = new Date(stats.lastUpdated);
                lastUpdatedElement.textContent = date.toLocaleString();
            } else {
                lastUpdatedElement.textContent = 'Never';
            }
        }
    }

    /**
     * Refresh contexts
     */
    async refreshContexts() {
        await this.loadContexts();
    }

    /**
     * Export all contexts
     */
    async exportContexts() {
        if (!this.contextManager) return;

        try {
            const contexts = await this.contextManager.getAllContexts();
            const exportData = {
                exportDate: new Date().toISOString(),
                totalContexts: contexts.length,
                contexts: contexts
            };

            const blob = new Blob([JSON.stringify(exportData, null, 2)], {
                type: 'application/json'
            });

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `pasha-contexts-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            console.log('📁 Contexts exported successfully');
        } catch (error) {
            console.error('❌ Error exporting contexts:', error);
            alert('Error exporting contexts. Please try again.');
        }
    }

    /**
     * Export single context
     */
    async exportSingleContext(contextId) {
        if (!this.contextManager) return;

        try {
            const contexts = await this.contextManager.getAllContexts();
            const context = contexts.find(c => c.id === contextId);
            
            if (!context) {
                alert('Context not found.');
                return;
            }

            const blob = new Blob([JSON.stringify(context, null, 2)], {
                type: 'application/json'
            });

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `pasha-context-${contextId}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            console.log('📁 Context exported successfully');
        } catch (error) {
            console.error('❌ Error exporting context:', error);
            alert('Error exporting context. Please try again.');
        }
    }

    /**
     * Clear all contexts
     */
    async clearAllContexts() {
        if (!this.contextManager) return;

        const confirmed = confirm(
            'Are you sure you want to delete ALL conversation contexts? This action cannot be undone.'
        );

        if (!confirmed) return;

        try {
            await this.contextManager.clearAllContexts();
            await this.loadContexts();
            console.log('🧹 All contexts cleared');
        } catch (error) {
            console.error('❌ Error clearing contexts:', error);
            alert('Error clearing contexts. Please try again.');
        }
    }

    /**
     * Delete individual context
     */
    async deleteContext(contextId) {
        if (!this.contextManager || !contextId) return;

        const confirmed = confirm('Are you sure you want to delete this context?');
        if (!confirmed) return;

        try {
            await this.contextManager.deleteContext(contextId);
            await this.loadContexts();
            console.log('🗑️ Context deleted');
        } catch (error) {
            console.error('❌ Error deleting context:', error);
            alert('Error deleting context. Please try again.');
        }
    }

    /**
     * Load current settings
     */
    loadSettings() {
        // Load settings from localStorage or defaults
        const settings = this.getStoredSettings();
        
        Object.entries(settings).forEach(([key, value]) => {
            const element = this.modal.querySelector(`#${key}`);
            if (element) {
                if (element.type === 'range') {
                    element.value = value;
                    const valueSpan = element.nextElementSibling;
                    if (valueSpan && valueSpan.classList.contains('range-value')) {
                        valueSpan.textContent = value + '%';
                    }
                } else {
                    element.value = value;
                }
            }
        });
    }

    /**
     * Save settings
     */
    saveSettings() {
        const settings = {};
        
        // Collect all form values
        const inputs = this.modal.querySelectorAll('select, input[type="range"]');
        inputs.forEach(input => {
            if (input.id) {
                settings[input.id] = input.value;
            }
        });

        // Store settings
        localStorage.setItem('pasha_settings', JSON.stringify(settings));
        
        // Apply settings immediately
        this.applySettings(settings);
        
        console.log('💾 Settings saved');
        
        // Show feedback
        const saveBtn = this.modal.querySelector('#saveSettingsBtn');
        if (saveBtn) {
            const originalText = saveBtn.textContent;
            saveBtn.textContent = '✓ Saved!';
            saveBtn.style.backgroundColor = '#28a745';
            
            setTimeout(() => {
                saveBtn.textContent = originalText;
                saveBtn.style.backgroundColor = '';
            }, 2000);
        }
    }

    /**
     * Get stored settings
     */
    getStoredSettings() {
        try {
            const stored = localStorage.getItem('pasha_settings');
            return stored ? JSON.parse(stored) : this.getDefaultSettings();
        } catch (error) {
            console.warn('Could not load settings:', error);
            return this.getDefaultSettings();
        }
    }

    /**
     * Get default settings
     */
    getDefaultSettings() {
        return {
            theme: 'light',
            language: 'en-US',
            voiceSelect: 'default',
            voiceSpeed: '1.0',
            notificationSound: 'default',
            autoSave: 'enabled',
            inputVolume: '75',
            outputVolume: '80',
            dataRetention: '90',
            analyticsOptOut: 'enabled'
        };
    }

    /**
     * Apply settings immediately
     */
    applySettings(settings) {
        // Apply theme
        if (settings.theme) {
            document.documentElement.setAttribute('data-theme', settings.theme);
        }

        // Apply language
        if (settings.language) {
            document.documentElement.setAttribute('lang', settings.language);
        }

        // Dispatch settings change event for other components
        window.dispatchEvent(new CustomEvent('settingsChanged', {
            detail: settings
        }));
    }

    /**
     * Get current tab
     */
    getCurrentTab() {
        return this.currentTab;
    }

    /**
     * Set context manager
     */
    setContextManager(contextManager) {
        this.contextManager = contextManager;
    }
}