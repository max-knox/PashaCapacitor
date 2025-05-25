// filepath: c:\Users\nuvoc\Documents\GitHub\PashaCapacitor\www\assets\js\meetingMode.js
// Pasha Capacitor Meeting Mode Controller

class MeetingModeController {
    constructor(firestore) {
        this.firestore = firestore;
        this.recognition = null;
        this.isMeetingActive = false;
        this.meetingId = null;
        this.meetingStartTime = null;
        this.transcriptChunks = [];
        this.transcriptUpdateInterval = null;
        this.meetingTimerInterval = null;
        this.elevenLabsToolCallName = 'PashaMeetingManager'; // Define a name for your tool

        this.ui = {
            meetingModeButton: document.getElementById('meetingBtn'),
            toolCallOutput: document.getElementById('tool-call-output'),
            meetingCard: null, // Will be created dynamically
            meetingCardTitle: null,
            meetingCardTimer: null,
            meetingCardTranscriptPreview: null,
            openMeetingModalBtn: null,
            meetingTranscriptModal: document.getElementById('meetingTranscriptModal'),
            meetingModalTitle: document.getElementById('meetingModalTitle'),
            meetingModalTranscriptBody: document.getElementById('meetingModalTranscriptBody'),
            closeMeetingTranscriptModalBtn: document.getElementById('closeMeetingTranscriptModalBtn'),
            copyMeetingTranscriptBtn: document.getElementById('copyMeetingTranscriptBtn'),
            voiceActionStatus: document.getElementById('voice-action')
        };

        this.initEventListeners();
        console.log("MeetingModeController initialized");
    }

    initEventListeners() {
        if (this.ui.meetingModeButton) {
            this.ui.meetingModeButton.addEventListener('click', () => this.toggleMeetingMode());
        }
        if (this.ui.closeMeetingTranscriptModalBtn) {
            this.ui.closeMeetingTranscriptModalBtn.addEventListener('click', () => this.closeTranscriptModal());
        }
        if (this.ui.copyMeetingTranscriptBtn) {
            this.ui.copyMeetingTranscriptBtn.addEventListener('click', () => this.copyTranscriptToClipboard());
        }
        // Listen for ElevenLabs client tool calls
        window.addEventListener('elevenlabs-tool-call', (event) => this.handleElevenLabsToolCall(event));
    }

    toggleMeetingMode() {
        if (this.isMeetingActive) {
            this.stopMeeting();
        } else {
            this.startMeeting();
        }
    }

    async startMeeting() {
        if (this.isMeetingActive) return;

        this.isMeetingActive = true;
        this.meetingStartTime = new Date();
        this.meetingId = `meeting_${this.meetingStartTime.toISOString().replace(/[:.]/g, '-')}`;
        this.transcriptChunks = [];

        try {
            // Initialize new fields in Firestore for the meeting
            const initialMeetingData = {
                title: `Meeting - ${this.meetingStartTime.toLocaleString()}`,
                startTime: firebase.firestore.Timestamp.fromDate(this.meetingStartTime),
                active: true,
                transcripts: [],
                description: '',
                purpose: '',
                members: [],
                actionItems: [], // Will store objects like { id: '...', text: '...', status: 'pending', assignedTo: '...', dueDate: '...' }
                deliverables: [], // Similar structure to actionItems
                summary: '',
                isFollowUp: false,
                // You can add more fields here as needed
            };
            await this.firestore.collection('meetingCapture').doc(this.meetingId).set(initialMeetingData);
            console.log("Meeting document created in Firestore with ID:", this.meetingId, initialMeetingData);

            this.createMeetingCard();
            this.startSpeechRecognition();
            this.startMeetingTimer();
            this.startTranscriptUpdates();

            this.ui.meetingModeButton.textContent = 'END MEETING';
            this.ui.meetingModeButton.classList.remove('bg-pasha-blue', 'hover:bg-pasha-purple');
            this.ui.meetingModeButton.classList.add('bg-red-500', 'hover:bg-red-700');
            if(this.ui.voiceActionStatus) this.ui.voiceActionStatus.textContent = "Meeting in Progress...";

        } catch (error) {
            console.error("Error starting meeting:", error);
            this.isMeetingActive = false;
            alert("Failed to start meeting. Check console for details.");
        }
    }

    async stopMeeting() {
        if (!this.isMeetingActive) return;

        this.isMeetingActive = false;
        if (this.recognition) {
            this.recognition.stop();
            this.recognition = null;
        }
        clearInterval(this.transcriptUpdateInterval);
        clearInterval(this.meetingTimerInterval);

        try {
            await this.firestore.collection('meetingCapture').doc(this.meetingId).update({
                active: false,
                endTime: firebase.firestore.Timestamp.fromDate(new Date())
            });
            console.log("Meeting document updated in Firestore. Meeting ended.");
        } catch (error) {
            console.error("Error updating meeting document on stop:", error);
        }

        if (this.ui.meetingCard) {
            this.ui.meetingCard.remove();
            this.ui.meetingCard = null;
        }
        this.ui.meetingModeButton.textContent = 'MEETING MODE';
        this.ui.meetingModeButton.classList.remove('bg-red-500', 'hover:bg-red-700');
        this.ui.meetingModeButton.classList.add('bg-pasha-blue', 'hover:bg-pasha-purple');
        if(this.ui.voiceActionStatus) this.ui.voiceActionStatus.textContent = "Ready";
        this.closeTranscriptModal(); // Close modal if open
    }

    createMeetingCard() {
        if (this.ui.meetingCard) this.ui.meetingCard.remove();

        const cardHTML = `
            <div id="meetingModeCard" class="bg-white/10 p-4 rounded-lg w-full max-w-md text-left">
                <div class="flex justify-between items-center mb-2">
                    <h3 id="meetingCardTitle" class="text-white text-lg font-semibold">${this.meetingId.replace('meeting_', 'Meeting ')}</h3>
                    <button id="openMeetingModalBtn" class="text-pasha-blue hover:text-pasha-purple text-xs" title="View Full Transcript"><i class="fas fa-external-link-alt"></i></button>
                </div>
                <div id="meetingCardTimer" class="text-pasha-blue text-3xl font-bold text-center my-3">00:00:00</div>
                <div id="meetingCardTranscriptPreview" class="text-gray-300 text-xs h-24 overflow-y-auto border border-pasha-gray p-2 rounded" style="font-size: 6pt;">
                    Initializing live transcript...
                </div>
            </div>
        `;
        this.ui.toolCallOutput.innerHTML = cardHTML; // Replace placeholder
        
        this.ui.meetingCard = document.getElementById('meetingModeCard');
        this.ui.meetingCardTitle = document.getElementById('meetingCardTitle');
        this.ui.meetingCardTimer = document.getElementById('meetingCardTimer');
        this.ui.meetingCardTranscriptPreview = document.getElementById('meetingCardTranscriptPreview');
        this.ui.openMeetingModalBtn = document.getElementById('openMeetingModalBtn');

        if (this.ui.openMeetingModalBtn) {
            this.ui.openMeetingModalBtn.addEventListener('click', () => this.openTranscriptModal());
        }
    }

    startSpeechRecognition() {
        if (!('webkitSpeechRecognition' in window)) {
            alert('Speech recognition not supported in this browser.');
            return;
        }

        this.recognition = new webkitSpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US'; // Or make this configurable

        this.recognition.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }

            if (finalTranscript.trim()) {
                const chunk = {
                    timestamp: new Date(),
                    text: finalTranscript.trim()
                };
                this.transcriptChunks.push(chunk);
                this.updateTranscriptDisplay(finalTranscript.trim(), false);
            }
            if (interimTranscript.trim()) {
                this.updateTranscriptDisplay(interimTranscript.trim(), true);
            }
        };

        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            if (event.error === 'no-speech' || event.error === 'audio-capture' || event.error === 'network') {
                // Potentially restart, or notify user
                if (this.isMeetingActive) { // Only restart if meeting is supposed to be active
                    this.recognition.stop(); // Stop current instance before restarting
                    setTimeout(() => { if(this.isMeetingActive) this.recognition.start(); }, 1000); // Restart after a short delay
                }
            } else if (event.error === 'not-allowed') {
                alert("Microphone access was denied. Please enable microphone access to use meeting mode.");
                this.stopMeeting();
            }
        };

        this.recognition.onend = () => {
            if (this.isMeetingActive) {
                console.log("Speech recognition ended, restarting if meeting active.");
                // Check if it was an error or a natural end, and if meeting is still active
                // Some browsers stop recognition after a period of silence.
                setTimeout(() => { if(this.isMeetingActive && this.recognition) this.recognition.start(); }, 500);
            } else {
                console.log("Speech recognition ended, meeting not active.");
            }
        };
        
        this.recognition.start();
        console.log("Speech recognition started for meeting.");
    }

    updateTranscriptDisplay(text, isInterim) {
        if (this.ui.meetingCardTranscriptPreview) {
            if (isInterim) {
                // For interim, we might show it differently or append to a temporary last line
                // For simplicity, let's just update the preview with the latest interim or final
                const currentPreview = this.ui.meetingCardTranscriptPreview.innerHTML;
                // Avoid rapidly replacing if it's just interim results of the same utterance
                // This is a basic way; more sophisticated handling might be needed
                if (!currentPreview.endsWith('...') || !isInterim) {
                     this.ui.meetingCardTranscriptPreview.innerHTML += (isInterim ? text + '...' : text + '<br>');
                } else {
                    // Replace the last interim part
                    const lines = currentPreview.split('<br>');
                    if (lines.length > 0 && lines[lines.length-1].endsWith('...')) {
                        lines[lines.length-1] = text + '...';
                        this.ui.meetingCardTranscriptPreview.innerHTML = lines.join('<br>');
                    } else {
                         this.ui.meetingCardTranscriptPreview.innerHTML += text + '...<br>';
                    }
                }
            } else {
                 // When final, ensure previous interim is cleared if it was the same utterance.
                 // This logic might need refinement based on how speech events flow.
                 let currentHTML = this.ui.meetingCardTranscriptPreview.innerHTML;
                 // A simple way to check if the last part was an interim version of this final text
                 const interimVersion = text + '...';
                 if (currentHTML.endsWith(interimVersion + '<br>')) { 
                    currentHTML = currentHTML.substring(0, currentHTML.lastIndexOf(interimVersion + '<br>'));
                 } else if (currentHTML.endsWith(interimVersion)) { // If it didn't have a <br> yet
                    currentHTML = currentHTML.substring(0, currentHTML.lastIndexOf(interimVersion));
                 }
                 this.ui.meetingCardTranscriptPreview.innerHTML = currentHTML + text + '<br>';
            }
            this.ui.meetingCardTranscriptPreview.scrollTop = this.ui.meetingCardTranscriptPreview.scrollHeight;
        }
        if (this.ui.meetingTranscriptModal.style.display !== 'none' && this.ui.meetingModalTranscriptBody) {
            let modalHTML = this.ui.meetingModalTranscriptBody.innerHTML;
            const interimSpanStart = '<span class="text-gray-500">';
            const interimSpanEnd = '...</span><br>';
            const interimTextForModal = interimSpanStart + text + interimSpanEnd;

            if (isInterim) {
                modalHTML += interimTextForModal;
            } else {
                if (modalHTML.endsWith(interimTextForModal)) {
                    modalHTML = modalHTML.substring(0, modalHTML.lastIndexOf(interimTextForModal));
                }
                modalHTML += text + '<br>';
            }
             this.ui.meetingModalTranscriptBody.innerHTML = modalHTML;
             this.ui.meetingModalTranscriptBody.scrollTop = this.ui.meetingModalTranscriptBody.scrollHeight;
        }
    }
    
    startTranscriptUpdates() {
        this.transcriptUpdateInterval = setInterval(async () => {
            if (this.transcriptChunks.length > 0 && this.isMeetingActive) {
                const chunksToSave = [...this.transcriptChunks]; // Copy chunks to save
                this.transcriptChunks = []; // Clear for next batch

                try {
                    await this.firestore.collection('meetingCapture').doc(this.meetingId).update({
                        transcripts: firebase.firestore.FieldValue.arrayUnion(...chunksToSave)
                    });
                    console.log(`"${chunksToSave.length} transcript chunks saved to Firestore."`);
                } catch (error) {
                    console.error("Error saving transcript chunks to Firestore:", error);
                    // Add chunks back if save failed to retry next time
                    this.transcriptChunks.unshift(...chunksToSave); 
                }
            }
        }, 5000); // Save to Firebase every 5 seconds
    }

    startMeetingTimer() {
        this.meetingTimerInterval = setInterval(() => {
            if (!this.isMeetingActive || !this.meetingStartTime) return;

            const now = new Date();
            const elapsed = Math.floor((now - this.meetingStartTime) / 1000);
            const hours = Math.floor(elapsed / 3600);
            const minutes = Math.floor((elapsed % 3600) / 60);
            const seconds = elapsed % 60;

            const formattedTime = 
                `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            
            if (this.ui.meetingCardTimer) {
                this.ui.meetingCardTimer.textContent = formattedTime;
            }
        }, 1000);
    }

    openTranscriptModal() {
        if (!this.isMeetingActive) return;

        if (this.ui.meetingModalTitle) {
            this.ui.meetingModalTitle.textContent = `Live Transcript: ${this.meetingId.replace('meeting_', '')}`;
        }
        if (this.ui.meetingModalTranscriptBody) {
            // Populate with existing full transcript from preview or Firestore if needed
            // For now, it will just show new incoming transcripts
            this.ui.meetingModalTranscriptBody.innerHTML = this.ui.meetingCardTranscriptPreview.innerHTML; // Initial content
            this.ui.meetingModalTranscriptBody.scrollTop = this.ui.meetingModalTranscriptBody.scrollHeight;
        }
        if (this.ui.meetingTranscriptModal) {
            this.ui.meetingTranscriptModal.classList.remove('hidden');
        }
    }

    closeTranscriptModal() {
        if (this.ui.meetingTranscriptModal) {
            this.ui.meetingTranscriptModal.classList.add('hidden');
        }
    }

    async copyTranscriptToClipboard() {
        if (!this.meetingId) return;
        try {
            const docRef = this.firestore.collection('meetingCapture').doc(this.meetingId);
            const docSnap = await docRef.get();
            if (docSnap.exists()) {
                const data = docSnap.data();
                const fullTranscript = data.transcripts.map(t => t.text).join('\\n');
                await navigator.clipboard.writeText(fullTranscript);
                alert('Full transcript copied to clipboard!');
            } else {
                alert('Could not find meeting data to copy.');
            }
        } catch (error) {
            console.error("Error copying transcript:", error);
            alert('Failed to copy transcript.');
        }
    }

    // --- ElevenLabs Client Tool Call Handling ---
    async handleElevenLabsToolCall(event) {
        if (!event.detail || event.detail.toolName !== this.elevenLabsToolCallName) {
            // Not for us or malformed event
            return;
        }

        const { parameters } = event.detail;
        let output = { success: false, message: 'Unknown action or meeting not active.' };

        if (!this.isMeetingActive || !this.meetingId) {
            output.message = 'No active meeting to manage.';
            this.dispatchToolResponse(this.elevenLabsToolCallName, output);
            return;
        }

        console.log('ElevenLabs Tool Call Received:', parameters);

        try {
            const action = parameters.action;
            let value = parameters.value; // Common value parameter - now always a string
            const itemId = parameters.itemId; // For updating specific items
            const itemStatus = parameters.itemStatus; // For updating status

            // Parse the value parameter based on the action type
            let parsedValue = value;
            
            switch (action) {
                case 'updateTitle':
                case 'setDescription':
                case 'setPurpose':
                case 'addMember':
                case 'setSummary':
                    // These actions expect a string value, so no parsing needed
                    parsedValue = value;
                    break;
                    
                case 'addActionItem':
                case 'addDeliverable':
                    // These actions expect an object, so try to parse the JSON string
                    try {
                        parsedValue = JSON.parse(value);
                    } catch (e) {
                        // If parsing fails, treat it as a simple text value
                        parsedValue = { text: value };
                    }
                    break;
                    
                case 'setFollowUp':
                    // This action expects a boolean
                    parsedValue = value === 'true' || value === true;
                    break;
            }

            switch (action) {
                case 'updateTitle':
                    await this.updateMeetingField('title', parsedValue);
                    if (this.ui.meetingCardTitle) this.ui.meetingCardTitle.textContent = parsedValue;
                    output = { success: true, message: `Meeting title updated to: ${parsedValue}.` };
                    break;
                    
                case 'setDescription':
                    await this.updateMeetingField('description', parsedValue);
                    output = { success: true, message: 'Meeting description updated.' };
                    break;
                    
                case 'setPurpose':
                    await this.updateMeetingField('purpose', parsedValue);
                    output = { success: true, message: 'Meeting purpose updated.' };
                    break;
                    
                case 'addMember':
                    await this.addMeetingArrayItem('members', parsedValue);
                    output = { success: true, message: `Member '${parsedValue}' added.` };
                    break;
                    
                case 'addActionItem': 
                    if (typeof parsedValue === 'object' && parsedValue.text) {
                        const newItem = { 
                            id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                            text: parsedValue.text,
                            status: parsedValue.status || 'pending',
                            assignedTo: parsedValue.assignedTo || '',
                            dueDate: parsedValue.dueDate || null
                        };
                        await this.addMeetingArrayItem('actionItems', newItem);
                        output = { success: true, message: `Action item '${newItem.text}' added.` };
                    } else {
                        output.message = 'Invalid value for addActionItem. Expects a JSON object with at least a text property.';
                    }
                    break;
                    
                case 'addDeliverable': 
                    if (typeof parsedValue === 'object' && parsedValue.text) {
                        const newDeliverable = { 
                            id: `deliv_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                            text: parsedValue.text,
                            status: parsedValue.status || 'pending',
                            notes: parsedValue.notes || ''
                        };
                        await this.addMeetingArrayItem('deliverables', newDeliverable);
                        output = { success: true, message: `Deliverable '${newDeliverable.text}' added.` };
                    } else {
                        output.message = 'Invalid value for addDeliverable. Expects a JSON object with at least a text property.';
                    }
                    break;
                    
                case 'updateActionItemStatus':
                case 'updateDeliverableStatus':
                    if (typeof itemId === 'string' && typeof itemStatus === 'string') {
                        const arrayName = action === 'updateActionItemStatus' ? 'actionItems' : 'deliverables';
                        await this.updateItemStatusInArray(arrayName, itemId, itemStatus);
                        output = { success: true, message: `${arrayName.slice(0, -1)} '${itemId}' status updated to '${itemStatus}'.` };
                    } else {
                        output.message = 'Invalid parameters for updating item status. Requires itemId and itemStatus.';
                    }
                    break;
                    
                case 'setSummary':
                    await this.updateMeetingField('summary', parsedValue);
                    output = { success: true, message: 'Meeting summary updated.' };
                    break;
                    
                case 'setFollowUp': 
                    await this.updateMeetingField('isFollowUp', parsedValue);
                    output = { success: true, message: `Meeting follow-up status set to: ${parsedValue}.` };
                    break;
                    
                default:
                    output.message = `Unknown action: ${action}.`;
                    break;
            }
        } catch (error) {
            console.error('Error handling ElevenLabs tool call:', error);
            output.message = `Error processing action: ${error.message}.`;
        }

        this.dispatchToolResponse(this.elevenLabsToolCallName, output);
    }

    async updateMeetingField(fieldName, value) {
        if (!this.isMeetingActive || !this.meetingId) throw new Error('Meeting not active.');
        const update = {};
        update[fieldName] = value;
        await this.firestore.collection('meetingCapture').doc(this.meetingId).update(update);
        console.log(`Meeting field '${fieldName}' updated in Firestore.`);
    }

    async addMeetingArrayItem(arrayName, item) {
        if (!this.isMeetingActive || !this.meetingId) throw new Error('Meeting not active.');
        const update = {};
        update[arrayName] = firebase.firestore.FieldValue.arrayUnion(item);
        await this.firestore.collection('meetingCapture').doc(this.meetingId).update(update);
        console.log(`Item added to '${arrayName}' in Firestore.`);
    }

    async updateItemStatusInArray(arrayName, itemId, newStatus) {
        if (!this.isMeetingActive || !this.meetingId) throw new Error('Meeting not active.');
        const meetingRef = this.firestore.collection('meetingCapture').doc(this.meetingId);

        await this.firestore.runTransaction(async (transaction) => {
            const meetingDoc = await transaction.get(meetingRef);
            if (!meetingDoc.exists) {
                throw "Document does not exist!";
            }

            const items = meetingDoc.data()[arrayName] || [];
            const itemIndex = items.findIndex(item => item.id === itemId);

            if (itemIndex === -1) {
                throw `Item with ID '${itemId}' not found in ${arrayName}.`;
            }

            items[itemIndex].status = newStatus;
            transaction.update(meetingRef, { [arrayName]: items });
        });
        console.log(`Status of item '${itemId}' in '${arrayName}' updated to '${newStatus}'.`);
    }

    // Method to dispatch the response back to ElevenLabs agent
    dispatchToolResponse(toolName, output) {
        const responseEvent = new CustomEvent('elevenlabs-tool-response', {
            detail: {
                toolName: toolName,
                output: output
            }
        });
        window.dispatchEvent(responseEvent);
        console.log('Dispatched elevenlabs-tool-response:', output);
    }
}

// Firebase should be initialized before this script runs.
// Assuming firebase is globally available or passed appropriately.
// For example, if firebase is initialized in index.html or another script:
if (typeof firebase !== 'undefined' && firebase.apps.length) {
    const firestore = firebase.firestore();
    window.meetingModeController = new MeetingModeController(firestore);
} else {
    console.error("Firebase is not initialized. MeetingModeController cannot start.");
    // Optionally, wait for Firebase to initialize if it's loaded asynchronously
    document.addEventListener('firebase-initialized', () => {
        const firestore = firebase.firestore();
        window.meetingModeController = new MeetingModeController(firestore);
    });
}

