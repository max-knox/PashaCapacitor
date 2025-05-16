// meetingController.js

export class MeetingController {
    constructor(firestore) {
        this.firestore = firestore;
        this.userId = 'KHKznERODbew7U3ZKUKeMu2g9mX2'; // Hardcoded for now
        this.meetingId = null;
        this.pashaHelper = null;
        this.pashaSecondary = null;
        this.timerInterval = null;
        this.seconds = 0;
        this.meetingStartTime = null;
        this.summaryEndTime = null;

        // Create meeting mode container
        this.meetingModeDiv = document.createElement('div');
        this.meetingModeDiv.classList.add('meeting-mode');
        this.meetingModeDiv.innerHTML = this.createMeetingModeHTML();

        // Add custom styles for meeting mode
        const style = document.createElement('style');
        style.textContent = `
            .meeting-mode .container {
                max-width: 600px;
                margin: auto;
                padding: 20px;
                overflow-y: auto;
                height: 100vh;
                box-sizing: border-box;
            }
            .meeting-mode #timerCard,
            .meeting-mode #startCard,
            .meeting-mode #summaryCard {
                background: white;
                padding: 30px;
                border-radius: 15px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                margin-bottom: 20px;
            }
            .meeting-mode .btn-welcome {
                min-width: 200px;
                width: 100%;
                padding: 15px;
                font-size: 1em;
                margin-bottom: 10px;
            }
            .meeting-mode .timer {
                font-size: 2.5em;
                font-weight: bold;
            }
            .meeting-mode .form-control {
                width: 100%;
                box-sizing: border-box;
            }
            .meeting-mode .text-center {
                text-align: center;
            }
            .meeting-mode .voice_status {
                margin-bottom: 10px;
            }
            .meeting-mode .voiceSpan {
                font-weight: bold;
            }
            .meeting-mode .listening-pulse {
                color: red;
                animation: pulse 2s infinite;
            }
            @keyframes pulse {
                0% { opacity: 1; }
                50% { opacity: 0.5; }
                100% { opacity: 1; }
            }
        `;
        document.head.appendChild(style);

        // Append the meeting mode div to the desired container
        this.meetingModeDiv.style.display = 'none'; // Initially hidden
        const agentScreen = document.querySelector('.agent_screen');
        if (agentScreen && !agentScreen.contains(this.meetingModeDiv)) {
            agentScreen.appendChild(this.meetingModeDiv);
        }

        // Initialize elements and event listeners
        this.elements = this.initializeElements();
        this.init();
    }

    createMeetingModeHTML() {
        return `
            <div class="container">
                <div id="startCard" class="text-center">
                    <div class="startWrap text-center" data-bs-toggle="modal" data-bs-target="#historyModal">
                        <div class="voice_status text-center">
                            <span class="voiceSpan">Ready</span>
                        </div>
                        <small class="maindate" id="currentDate"></small>
                    </div>
                    <input type="text" id="meetingTitle" class="form-control mb-2 mt-4" placeholder="Enter meeting title">
                    <input type="text" id="meetingHost" class="form-control mb-2" placeholder="Meeting Host">
                    <input type="text" id="meetingAttendees" class="form-control mb-4" placeholder="Attendees">
                    <button id="startMeetingButton" class="btn btn-welcome signIn">Start Meeting</button>
                </div>

                <div id="timerCard" class="text-center d-none">
                    <div class="voice_status text-center">
                        <span class="voiceSpan listening-pulse">Recording</span>
                    </div>
                    <hr/>
                    <p class="maindate" id="currentDateTimer"></p>
                    <h1 class="meeting-title mb-3" id="displayedMeetingTitle"></h1>
                    <div class="timer mb-4">
                        <span id="hours">00</span>:<span id="minutes">00</span>:<span id="seconds">00</span>
                    </div>
                    <button id="endMeetingButton" class="btn btn-welcome signIn">End Meeting</button>
                </div>

                <div id="summaryCard" class="text-center d-none">
                    <div class="voice_status text-center">
                        <span class="voiceSpan">Complete</span>
                    </div>
                    <hr/>
                    <h2 class="meeting-title mb-5 mt-4" id="summaryMeetingTitle"></h2>
                    <p class="date mb-2" id="summaryDate"></p>
                    <p class="mb-2" id="summaryStartTime"></p>
                    <p class="mb-2" id="summaryEndTime"></p>
                    <p class="mb-4" id="summaryDuration"></p>
                    <button id="showStartCardButton" class="btn btn-welcome signIn">Close</button>
                </div>
            </div>
        `;
    }

    initializeElements() {
        const elements = {
            startCard: this.meetingModeDiv.querySelector('#startCard'),
            timerCard: this.meetingModeDiv.querySelector('#timerCard'),
            summaryCard: this.meetingModeDiv.querySelector('#summaryCard'),
            meetingTitle: this.meetingModeDiv.querySelector('#meetingTitle'),
            meetingHost: this.meetingModeDiv.querySelector('#meetingHost'),
            meetingAttendees: this.meetingModeDiv.querySelector('#meetingAttendees'),
            currentDate: this.meetingModeDiv.querySelector('#currentDate'),
            currentDateTimer: this.meetingModeDiv.querySelector('#currentDateTimer'),
            displayedMeetingTitle: this.meetingModeDiv.querySelector('#displayedMeetingTitle'),
            summaryMeetingTitle: this.meetingModeDiv.querySelector('#summaryMeetingTitle'),
            summaryDate: this.meetingModeDiv.querySelector('#summaryDate'),
            summaryStartTime: this.meetingModeDiv.querySelector('#summaryStartTime'),
            summaryEndTime: this.meetingModeDiv.querySelector('#summaryEndTime'),
            summaryDuration: this.meetingModeDiv.querySelector('#summaryDuration'),
            hours: this.meetingModeDiv.querySelector('#hours'),
            minutes: this.meetingModeDiv.querySelector('#minutes'),
            seconds: this.meetingModeDiv.querySelector('#seconds'),
            startMeetingButton: this.meetingModeDiv.querySelector('#startMeetingButton'),
            endMeetingButton: this.meetingModeDiv.querySelector('#endMeetingButton'),
            showStartCardButton: this.meetingModeDiv.querySelector('#showStartCardButton')
        };

        // List of input fields to handle
        const inputFields = [
            elements.meetingTitle,
            elements.meetingHost,
            elements.meetingAttendees
        ];

        // Add focus event listeners to input fields
        inputFields.forEach(input => {
            if (input) { // Ensure the element exists
                input.addEventListener('focus', () => {
                    // Use a slight delay to ensure the keyboard has opened
                    setTimeout(() => {
                        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 300);
                });
            }
        });

        return elements;
    }

    init() {
        // Add event listeners if elements exist
        if (this.elements.startMeetingButton) {
            this.elements.startMeetingButton.addEventListener('click', () => this.startMeeting());
        }

        if (this.elements.endMeetingButton) {
            this.elements.endMeetingButton.addEventListener('click', () => this.endMeeting());
        }

        if (this.elements.showStartCardButton) {
            this.elements.showStartCardButton.addEventListener('click', () => this.showStartCard());
        }

        // Initialize meeting mode button if it exists
        const meetingModeBtn = document.getElementById('meetingModeBtn');
        if (meetingModeBtn) {
            meetingModeBtn.addEventListener('click', () => this.activateMeetingMode());
        }

        this.updateDate();
    }

    // Meeting mode activation/deactivation
    activateMeetingMode() {
        // Hide other components if they exist
        const llmReadout = document.querySelector('.llm_Readout');
        const agentS3 = document.querySelector('.agent_s3');

        if (llmReadout) llmReadout.style.display = 'none';
        if (agentS3) agentS3.style.display = 'none';

        // Show meeting mode
        this.meetingModeDiv.style.display = 'flex';
        this.meetingModeDiv.style.justifyContent = 'center';
        this.meetingModeDiv.style.alignItems = 'center';

        // Ensure the meetingModeDiv is appended to agent_screen
        const agentScreen = document.querySelector('.agent_screen');
        if (agentScreen && !agentScreen.contains(this.meetingModeDiv)) {
            agentScreen.appendChild(this.meetingModeDiv);
        }

        this.updateDate();
    }

    deactivateMeetingMode() {
        this.meetingModeDiv.style.display = 'none';
        const llmReadout = document.querySelector('.llm_Readout');
        const agentS3 = document.querySelector('.agent_s3');

        if (llmReadout) llmReadout.style.display = 'flex';
        if (agentS3) agentS3.style.display = 'flex';
    }

    async startMeeting() {
        if (!this.validateMeetingFields()) {
            return;
        }

        try {
            // Verify authentication
            const currentUser = firebase.auth().currentUser;
            if (!currentUser) {
                throw new Error('User must be authenticated to start a meeting');
            }
            this.userId = currentUser.uid;

            // Start UI updates
            this.elements.startCard.classList.add('d-none');
            this.elements.timerCard.classList.remove('d-none');
            this.elements.displayedMeetingTitle.textContent = this.validateInput(this.elements.meetingTitle.value) || 'Untitled Meeting';
            this.updateDate();

            // Start timer and set meeting start time
            this.startTimer();
            this.meetingStartTime = new Date();

            // Create new meeting document
            this.meetingId = await this.createNewMeetingDocument(this.meetingStartTime);

            // Initialize recording helpers with verified user ID
            this.pashaHelper = new PashaHelper(this.firestore, this.userId, this.meetingId);
            await this.pashaHelper.startRecording();

            this.pashaSecondary = new PashaSecondary(this.firestore, this.userId, this.meetingId);
            await this.pashaSecondary.startSecondaryRecording();

            // Set recording state to true
            this.isRecording = true;

        } catch (error) {
            console.error("Error starting meeting:", error);
            this.handleMeetingError(error);
        }
    }

    async endMeeting() {
        console.log("End meeting called", {
            hasHelper: !!this.pashaHelper,
            isRecording: this.isRecording
        });

        try {
            this.summaryEndTime = new Date();
            const duration = this.summaryEndTime - this.meetingStartTime;

            // Stop recordings first
            if (this.pashaHelper) {
                await this.pashaHelper.stopRecording();
            }
            if (this.pashaSecondary) {
                await this.pashaSecondary.stopSecondaryRecording();
            }

            // Set recording state to false
            this.isRecording = false;

            // Update meeting document immediately
            const meetingData = await this.updateMeetingDocument(duration);

            // Show loading message in summary card
            this.elements.timerCard.classList.add('d-none');
            this.elements.summaryCard.classList.remove('d-none');
            this.elements.summaryMeetingTitle.textContent = 'Processing Meeting...';

            try {
                // Wait for processing with timeout
                await Promise.race([
                    this.waitForProcessingComplete(),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Processing timeout')), 30000)
                    )
                ]);

                // Get updated meeting data after processing
                const updatedDoc = await this.firestore.collection('meetings')
                    .doc(this.meetingId)
                    .get();
                const updatedMeetingData = updatedDoc.data();

                // Update UI with processed data
                this.updateUIAfterMeetingEnd({
                    ...updatedMeetingData,
                    duration: meetingData.duration
                });

                alert('Meeting ended and processed successfully!');
            } catch (processingError) {
                console.warn('Processing error:', processingError);
                // Still show summary but with a processing message
                this.updateUIAfterMeetingEnd({
                    ...meetingData,
                    summary: 'Meeting data is still being processed...',
                    actionItems: []
                });
                this.elements.summaryMeetingTitle.textContent += ' (Processing...)';
            }

            // Clean up
            this.stopTimer();
            this.pashaHelper = null;
            this.pashaSecondary = null;

            console.log('Meeting ended successfully');

        } catch (error) {
            console.error("Error ending meeting:", error);
            this.handleMeetingError(error);
        }
    }

    validateMeetingFields() {
        const title = this.elements.meetingTitle.value.trim();
        const host = this.elements.meetingHost.value.trim();
        const attendees = this.elements.meetingAttendees.value.trim();

        if (!title || !host || !attendees) {
            alert("Please fill in all meeting details.");
            return false;
        }
        return true;
    }

    async createNewMeetingDocument(startTime) {
        const docId = this.formatDateTimeForId(startTime);
        const meetingData = {
            userId: this.userId,
            title: this.validateInput(this.elements.meetingTitle.value) || 'Untitled Meeting',
            host: this.validateInput(this.elements.meetingHost.value) || 'Unknown Host',
            attendees: this.parseAttendees(this.elements.meetingAttendees.value),
            date: firebase.firestore.Timestamp.fromDate(startTime),
            startTime: this.formatTime(startTime),
            endTime: null,
            duration: null,
            transcript: [],
            actionItems: [],
            summary: '',
            textSent: false,
            emailSent: false,
            spreadSheetSync: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            processingComplete: false,
            processingError: null
        };

        await this.firestore.collection('meetings').doc(docId).set(meetingData);
        return docId;
    }

    async updateMeetingDocument(duration) {
        try {
            const meetingRef = this.firestore.collection('meetings').doc(this.meetingId);
            const updateData = {
                endTime: this.formatTime(this.summaryEndTime),
                duration: `${Math.floor(duration / 60000)} minutes`,
                status: 'completed',
                processingStatus: 'pending'  // Add processing status
            };

            await meetingRef.update(updateData);

            // Return meeting data for UI update
            return {
                ...updateData,
                title: this.elements.meetingTitle.value,
                date: firebase.firestore.Timestamp.fromDate(this.meetingStartTime),
                startTime: this.formatTime(this.meetingStartTime)
            };
        } catch (error) {
            console.error('Error updating meeting document:', error);
            throw error;
        }
    }

    updateUIAfterMeetingEnd(meetingData) {
        this.elements.timerCard.classList.add('d-none');
        this.elements.summaryCard.classList.remove('d-none');

        const dateObj = this.getDateFromFirestore(meetingData.date);
        const formattedDate = this.formatDate(dateObj);

        this.elements.summaryMeetingTitle.textContent = meetingData.title || 'Meeting Complete';
        this.elements.summaryDate.textContent = formattedDate;
        this.elements.summaryStartTime.textContent = `Started at: ${meetingData.startTime}`;
        this.elements.summaryEndTime.textContent = `Ended at: ${meetingData.endTime}`;
        this.elements.summaryDuration.textContent = `Duration: ${meetingData.duration}`;

        // Add processing status indicator if not already present
        if (!this.elements.summaryDuration.nextElementSibling) {
            const statusElement = document.createElement('p');
            statusElement.className = 'text-muted mt-3';
            statusElement.textContent = meetingData.processingComplete ? 
                'Processing complete' : 
                'Processing in progress...';
            this.elements.summaryDuration.after(statusElement);
        } else {
            // Update existing status text
            this.elements.summaryDuration.nextElementSibling.textContent = meetingData.processingComplete ? 
                'Processing complete' : 
                'Processing in progress...';
        }
    }

    handleMeetingError(error) {
        console.error('Meeting error:', error);
        const errorMessage = error.message || 'An unknown error occurred';
        alert(`Meeting ended with error: ${errorMessage}\nThe recording has been saved and will be processed in the background.`);

        // Always try to clean up and show summary
        if (this.elements.timerCard) {
            this.elements.timerCard.classList.add('d-none');
        }
        if (this.elements.summaryCard) {
            this.elements.summaryCard.classList.remove('d-none');
            this.elements.summaryMeetingTitle.textContent = 'Meeting encountered an error.';
            this.elements.summaryDuration.textContent = 'Duration: N/A';
        }

        this.stopTimer();
        this.isRecording = false;
        this.pashaHelper = null;
        this.pashaSecondary = null;
    }

    // Helper methods
    parseAttendees(attendeesString) {
        return attendeesString.split(',')
            .map(attendee => attendee.trim())
            .filter(attendee => attendee.length > 0);
    }

    formatDateTimeForId(date) {
        return date.toISOString().replace(/[:.]/g, '-');
    }

    formatDate(date) {
        return `${date.toLocaleString('default', { month: 'long' })} ${date.getDate()}, ${date.getFullYear()}`;
    }

    formatTime(date) {
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }

    getDateFromFirestore(firestoreDate) {
        return firestoreDate instanceof firebase.firestore.Timestamp ? 
            firestoreDate.toDate() : new Date(firestoreDate);
    }

    validateInput(input) {
        return input ? input.replace(/[<>&'"]/g, c => ({
            '<': '&lt;', '>': '&gt;', '&': '&amp;',
            "'": '&#39;', '"': '&quot;'
        })[c]) : '';
    }

    async waitForProcessingComplete() {
        const maxAttempts = 60;
        let attempts = 0;

        while (attempts < maxAttempts) {
            const doc = await this.firestore.collection('meetings')
                .doc(this.meetingId).get();
            if (doc.data().processingComplete) {
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 5000));
            attempts++;
        }
        throw new Error('Processing timed out. Please check the meeting status later.');
    }

    // Timer functions
    startTimer() {
        this.timerInterval = setInterval(() => this.updateTimer(), 1000);
    }

    stopTimer() {
        clearInterval(this.timerInterval);
        this.seconds = 0;
        this.updateTimerDisplay();
    }

    updateTimer() {
        this.seconds++;
        this.updateTimerDisplay();
    }

    updateTimerDisplay() {
        const hrs = Math.floor(this.seconds / 3600);
        const mins = Math.floor((this.seconds % 3600) / 60);
        const secs = this.seconds % 60;
        this.elements.hours.textContent = this.padZero(hrs);
        this.elements.minutes.textContent = this.padZero(mins);
        this.elements.seconds.textContent = this.padZero(secs);
    }

    padZero(num) {
        return num.toString().padStart(2, '0');
    }

    showStartCard() {
        if (this.elements.summaryCard) {
            this.elements.summaryCard.classList.add('d-none');
        }
        if (this.elements.startCard) {
            this.elements.startCard.classList.remove('d-none');
        }
        if (this.elements.meetingTitle) this.elements.meetingTitle.value = '';
        if (this.elements.meetingHost) this.elements.meetingHost.value = '';
        if (this.elements.meetingAttendees) this.elements.meetingAttendees.value = '';
        this.deactivateMeetingMode();
    }

    // Add the updateDate method
    updateDate() {
        try {
            const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
            const date = new Date().toLocaleDateString('en-US', options);
            if (this.elements.currentDate) {
                this.elements.currentDate.textContent = date;
            }
            if (this.elements.currentDateTimer) {
                this.elements.currentDateTimer.textContent = date;
            }
        } catch (error) {
            console.error("Error updating date:", error);
        }
    }
}
