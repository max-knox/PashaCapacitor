// www/assets/js/deviceLLM.js

// import { Filesystem } from './capacitor/filesystem.js';  no longer using file system for server connections

export const DeviceLLM = {
    // Company directory
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

 // Updated server configuration
 serverConfig: {
    baseUrl: 'http://192.168.42.2:1337', // Jetson's USB interface IP
    endpoints: {
        chat: '/v1/chat/completions'
    }
},

isInitialized: false,
useFallback: false,

async detectConnection() {
    // Check if USB connection is available first
    try {
        const response = await fetch('http://192.168.42.2:1337/v1/chat/completions', {
            method: 'OPTIONS'
        });
        if (response.ok) {
            this.serverConfig.baseUrl = 'http://192.168.42.2:1337';
            return;
        }
    } catch (e) {
        console.log('USB connection not available, falling back to WiFi');
        this.serverConfig.baseUrl = 'http://172.17.1.156:1337';
    }
},

async initializeLLM() {
    try {
        console.log('Starting LLM initialization...');
        const baseUrl = this.serverConfig.baseUrl;
        const chatEndpoint = `${baseUrl}${this.serverConfig.endpoints.chat}`;
        
        const startTime = Date.now();
        console.log('Request start time:', new Date(startTime).toISOString());
        
        const requestBody = {
            messages: [
                {
                    role: "system",
                    content: "You are a helpful assistant.",
                    name: "system"
                },
                {
                    role: "user",
                    content: "Hello",
                    name: "user"
                }
            ],
            model: "deepseek-r1:14b",
            stream: false,
            temperature: 0.8,
            top_p: 0.95
        };

        const controller = new AbortController();
        const TIMEOUT_MS = 90000; // Increased to match server timeout
        const timeoutId = setTimeout(() => {
            console.log(`Request timed out after ${TIMEOUT_MS}ms`);
            controller.abort();
        }, TIMEOUT_MS);

        console.log('Request body:', JSON.stringify(requestBody));
        console.log('Network status:', navigator.onLine);
        console.log('Request URL:', chatEndpoint);

        // Mobile-optimized fetch configuration
        const response = await fetch(chatEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Connection': 'keep-alive',
                'Keep-Alive': 'timeout=90',
                'X-Client-Type': 'capacitor-mobile'
            },
            credentials: 'omit',
            body: JSON.stringify(requestBody),
            signal: controller.signal,
            mode: 'cors',
            cache: 'no-cache',
            keepalive: true
        });

        clearTimeout(timeoutId);
        
        const endTime = Date.now();
        console.log('Response received after:', endTime - startTime, 'ms');

        if (!response.ok) {
            throw new Error(`Server returned ${response.status}`);
        }

        const text = await response.text();
        console.log('Response text:', text);

        const data = JSON.parse(text);
        this.isInitialized = true;
        this.useFallback = false;
        return true;

    } catch (error) {
        console.error('LLM initialization failed:', error);
        
        // Enhanced error logging for mobile
        console.log('Network diagnostics:', {
            online: navigator.onLine,
            effectiveType: navigator.connection?.effectiveType,
            downlink: navigator.connection?.downlink,
            rtt: navigator.connection?.rtt,
            timeStamp: new Date().toISOString(),
            errorType: error.name,
            errorMessage: error.message
        });
        
        this.useFallback = true;
        this.isInitialized = false;
        return false;
    }
},

async generateResponse(prompt, sessionId) {
    try {
        if (!this.isInitialized || this.useFallback) {
            return this.generateFallbackResponse(prompt);
        }

        const session = await this.getOrCreateSession(sessionId);
        
        const payload = {
            messages: [
                ...session.context,
                { role: 'user', content: prompt }
            ],
            model: "deepseek-r1:14b",
            stream: false,
            temperature: 0.8,
            top_p: 0.95
        };

        const response = await fetch(`${this.serverConfig.baseUrl}${this.serverConfig.endpoints.chat}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            credentials: 'omit',
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Server returned ${response.status}`);
        }

        const result = await response.json();
        
        if (!result.choices?.[0]?.message) {
            throw new Error('Invalid response format from server');
        }

        const cleanResponse = result.choices[0].message.content;

        await this.updateSession(
            sessionId,
            [
                { role: 'user', content: prompt },
                { role: 'assistant', content: cleanResponse }
            ],
            prompt,
            cleanResponse
        );

        return {
            text: cleanResponse,
            cardData: this.extractCardData(prompt, cleanResponse),
            usage: result.usage || {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0
            }
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
        
        // Default fallback response
        return {
            text: "I'm currently operating in fallback mode. I can help with basic queries like time and date. For more complex queries, please try again later when the full model is available.",
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