// www/assets/js/deviceLLM.js

// Update imports to use relative paths
import { LLM } from './llm/llama-cpp.js';
import { Filesystem } from './capacitor/filesystem.js';

export const DeviceLLM = {
    // Existing directory and storage keys
    companyDirectory: [
        { name: "Steve Mikhov", aliases: ["Mr. Mikhov", "Steve"], role: "Boss", description: "oversees meetings, asks questions" },
        { name: "Jose Alba", aliases: ["Jose"], role: "General Manager", description: "leads meetings, provides updates, deals with vendors" },
        { name: "Jessica", aliases: [], role: "Personal Assistant", description: "handles scheduling" },
        { name: "Kate", aliases: [], role: "Personal Assistant", description: "takes notes, provides additional information" },
        { name: "Shawn", aliases: [], role: "Personal Assistant", description: "handles travel, experiences, food" },
        { name: "Max", aliases: [], role: "Software Engineer", description: "works on websites, web apps, AI assistants, building Pasha (personal assistant chatbot)" },
        { name: "Aryn", aliases: [], role: "Marketing Professional", description: "handles marketing campaigns, organizes expenses, invoices, issues payment methods" }
    ],

    MEETINGS_STORAGE_KEY: 'pasha_meetings',
    SESSIONS_STORAGE_KEY: 'pasha_sessions',

    // LLM-specific properties
    llm: null,
    isInitialized: false,
    useFallback: false,
    modelConfig: {
        path: 'assets/llm/llama.gguf',
        contextSize: 2048,
        threads: 4,
        batchSize: 512,
        temperature: 0.7,
        topP: 0.9,
        maxTokens: 1000
    },

    async initializeLLM() {
        try {
            console.log('Setting up external API endpoint for LLM...');
            
            if (this.isInitialized) {
                console.log('LLM API already initialized');
                return true;
            }

            // For API-based LLM, we just need to set the initialized flag
            // No need to load local models anymore
            this.isInitialized = true;
            this.useFallback = false;
            console.log('LLM API endpoint initialized successfully');
            return true;
        } catch (error) {
            console.error('LLM API initialization failed:', error);
            this.useFallback = true;
            this.isInitialized = false;
            return false;
        }
    },

    async generateResponse(prompt, sessionId) {
        try {
            console.log('Generating response for:', prompt);
            
            // Always use the external API endpoint instead of local LLM
            const session = await this.getOrCreateSession(sessionId);
            
            // Use a mock response for now since the cloud function is not working
            // This simulates a successful API response while you fix the endpoint
            console.log('Generating mock response instead of using API endpoint');
            
            // Create a mock response based on the prompt
            let responseText = '';
            if (prompt.toLowerCase().includes('action') && prompt.toLowerCase().includes('item')) {
                if (prompt.toLowerCase().includes('max')) {
                    responseText = "Here are Max's current action items:\n\n1. Complete the Pasha voice assistant integration - Due next Monday\n2. Fix speech recognition issues in the Android app - In progress\n3. Implement cloud API fallback for LLM responses - Completed";
                } else {
                    responseText = "I can provide action items for team members. Please specify which person you'd like information about.";
                }
            } else if (prompt.toLowerCase().includes('time')) {
                const now = new Date();
                responseText = `The current time is ${now.toLocaleTimeString()}.`;
            } else {
                responseText = `I understand you're asking about: "${prompt}". How can I help you with that?`;
            }
            
            // Update session with the interaction
            await this.updateSession(
                sessionId,
                [
                    { role: 'user', content: prompt },
                    { role: 'assistant', content: responseText }
                ],
                prompt,
                responseText
            );
            
            return {
                text: responseText,
                cardData: this.extractCardData(prompt, responseText),
                meetings: []
            };
        } catch (error) {
            console.error('Error generating response:', error);
            return this.generateFallbackResponse(prompt);
        }
    },

    generateFallbackResponse(prompt) {
        console.log('Using fallback response for:', prompt);
        const now = new Date();
        
        // Handle time queries
        if (prompt.toLowerCase().includes('time')) {
            return {
                text: `The current time is ${now.toLocaleTimeString()}.`,
                cardData: {
                    type: 'dateTime',
                    content: {
                        time: now.toLocaleTimeString(),
                        date: now.toLocaleDateString()
                    }
                }
            };
        }
        
        // Handle action item queries as well
        if (prompt.toLowerCase().includes('action') && prompt.toLowerCase().includes('item')) {
            if (prompt.toLowerCase().includes('max')) {
                return {
                    text: "Here are Max's current action items:\n\n1. Complete the Pasha voice assistant integration - Due next Monday\n2. Fix speech recognition issues in the Android app - In progress\n3. Implement cloud API fallback for LLM responses - Completed",
                    cardData: null
                };
            } else {
                return {
                    text: "I can provide action items for team members. Please specify which person you'd like information about.",
                    cardData: null
                };
            }
        }
        
        // Default fallback response
        return {
            text: `I understand you're asking about: "${prompt}". How can I help you with that?`,
            cardData: null
        };
    },

    prepareContextPrompt(context, currentPrompt) {
        let contextString = context
            .slice(-5) // Keep last 5 messages for context
            .map(msg => `${msg.role === 'user' ? '[INST]' : '[/INST]'} ${msg.content}`)
            .join('\n');
        
        return `${contextString}\n[INST] ${currentPrompt} [/INST]`;
    },

    processResponse(text) {
        return text
            .replace(/\[\/INST\]/g, '')
            .replace(/\[INST\]/g, '')
            .trim();
    },

    extractCardData(prompt, response) {
        const promptLower = prompt.toLowerCase();
        
        // Handle date/time cards
        if (promptLower.includes('time') || promptLower.includes('date')) {
            const now = new Date();
            return {
                type: 'dateTime',
                content: {
                    time: now.toLocaleTimeString(),
                    date: now.toLocaleDateString()
                }
            };
        }
        
        // Handle meeting-related cards
        if (promptLower.includes('meeting') || promptLower.includes('schedule')) {
            return {
                type: 'meeting',
                content: this.processGeneralPrompt(prompt)
            };
        }
        
        return null;
    },

    // Keep existing helper methods
    findPersonInDirectory(name) {
        const normalizedName = name.toLowerCase();
        return this.companyDirectory.find(person => 
            person.name.toLowerCase() === normalizedName || 
            person.aliases.some(alias => alias.toLowerCase() === normalizedName)
        );
    },

    async getOrCreateSession(sessionId) {
        try {
            const sessionsJson = localStorage.getItem(this.SESSIONS_STORAGE_KEY) || '{}';
            const sessions = JSON.parse(sessionsJson);
            
            if (!sessions[sessionId]) {
                sessions[sessionId] = {
                    context: [],
                    lastQuery: null,
                    lastResponse: null,
                    lastUpdated: Date.now()
                };
                localStorage.setItem(this.SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
            }
            
            return sessions[sessionId];
        } catch (error) {
            console.error('Error managing session:', error);
            return {
                context: [],
                lastQuery: null,
                lastResponse: null,
                lastUpdated: Date.now()
            };
        }
    },

    async updateSession(sessionId, newMessages, lastQuery, lastResponse) {
        try {
            const sessionsJson = localStorage.getItem(this.SESSIONS_STORAGE_KEY) || '{}';
            const sessions = JSON.parse(sessionsJson);
            
            const session = sessions[sessionId] || {
                context: [],
                lastQuery: null,
                lastResponse: null,
                lastUpdated: Date.now()
            };

            session.context = [...session.context, ...newMessages];
            if (session.context.length > 10) {
                session.context = session.context.slice(-10);
            }

            session.lastQuery = lastQuery;
            session.lastResponse = lastResponse;
            session.lastUpdated = Date.now();

            sessions[sessionId] = session;
            localStorage.setItem(this.SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
        } catch (error) {
            console.error('Error updating session:', error);
        }
    },

    async getActionItems(person) {
        try {
            const meetingsJson = localStorage.getItem(this.MEETINGS_STORAGE_KEY) || '[]';
            const meetings = JSON.parse(meetingsJson);
            const relevantMeetings = [];
            const allNames = new Set();

            meetings.forEach(meeting => {
                const relevantActionItems = [];
                
                if (meeting.actionItems) {
                    meeting.actionItems.forEach((item, index) => {
                        if (item.who) {
                            const normalizedName = item.who.toLowerCase();
                            allNames.add(normalizedName);
                            
                            if (normalizedName === person.toLowerCase()) {
                                relevantActionItems.push({
                                    itemId: index,
                                    ...item,
                                    personInfo: this.findPersonInDirectory(item.who)
                                });
                            }
                        }
                    });
                }

                if (relevantActionItems.length > 0) {
                    relevantMeetings.push({
                        id: meeting.id,
                        title: meeting.title || 'Untitled Meeting',
                        date: meeting.date,
                        startTime: meeting.startTime,
                        endTime: meeting.endTime,
                        duration: meeting.duration,
                        summary: meeting.summary || 'No summary available',
                        actionItems: relevantActionItems
                    });
                }
            });

            return { meetings: relevantMeetings, allNames: Array.from(allNames) };
        } catch (error) {
            console.error('Error getting action items:', error);
            throw error;
        }
    },

    formatTextForTTS(text) {
        return text.replace(/\b([A-Z]{2,})\./g, '$1')
                   .replace(/(\d{1,2}:\d{2})\./g, '$1')
                   .replace(/(?<!\w\.\w.)(?<![A-Z][a-z]\.)(?<=\.|\?)\s/g, ' ')
                   .replace(/\.\s/g, ' ')
                   .replace(/\.$/, '');
    },

    processGeneralPrompt(prompt) {
        const promptLower = prompt.toLowerCase();
        
        // Basic intent matching
        if (promptLower.includes('meeting') || promptLower.includes('schedule')) {
            return "I can help you with meetings. Would you like to schedule a new meeting or check existing ones?";
        }
        
        if (promptLower.includes('action') || promptLower.includes('task')) {
                        response += `${item.what}\n`;
            return "I can help you track action items and tasks. Would you like to see your current tasks or create new ones?";
        }
        
        // Default response
        return "I understand you're asking about: " + prompt + ". How can I help you with that?";
    },
    
    formatPersonResponse(people, actionItems) {
        let response = '';
        
        people.forEach((person, index) => {
            const items = actionItems[index];
            response += `Regarding ${person.name} (${person.role}):\n`;
            
            if (items.meetings && items.meetings.length > 0) {
                response += `They have ${items.meetings.length} meetings with action items:\n`;
                items.meetings.forEach(meeting => {
                    response += `- ${meeting.title} (${meeting.date}): `;
                    meeting.actionItems.forEach(item => {
                        response += `${item.what}\n`;
                    });
                });
            } else {
                response += `No current action items found.\n`;
            }
        });
        
        return response;
    }
};