// pasha.js
// PashaHelper is expected to be loaded via a script tag

let timerInterval;
let seconds = 0;
let meetingStartTime;
let summaryEndTime;
let recaptchaVerifier;
let isRecaptchaInitialized = false;
const HARDCODED_USER_ID = 'KHKznERODbew7U3ZKUKeMu2g9mX2';
let userId = HARDCODED_USER_ID;
let pashaHelper;
let pashaSecondary;
let sphereVisualizations = [];
let loginProcessed = false;

// Initialize Firestore
const db = firebase.firestore();

// DOM elements
const elements = {
    startCard: document.getElementById('startCard'),
    timerCard: document.getElementById('timerCard'),
    summaryCard: document.getElementById('summaryCard'),
    meetingTitle: document.getElementById('meetingTitle'),
    meetingHost: document.getElementById('meetingHost'),
    meetingAttendees: document.getElementById('meetingAttendees'),
    loginForm: document.getElementById('loginForm'),
    phoneNumber: document.getElementById('phoneNumber'),
    verificationCodeDiv: document.getElementById('verificationCodeDiv'),
    verificationCode: document.getElementById('verificationCode'),
    loginButton: document.getElementById('loginButton'),
    verifyCodeButton: document.getElementById('verifyCode'),
    startCard: document.getElementById('startCard'),
    timerCard: document.getElementById('timerCard'),
    summaryCard: document.getElementById('summaryCard'),
    currentDate: document.getElementById('currentDate'),
    currentDateTimer: document.getElementById('currentDateTimer'),
    meetingTitle: document.getElementById('meetingTitle'),
    displayedMeetingTitle: document.getElementById('displayedMeetingTitle'),
    summaryMeetingTitle: document.getElementById('summaryMeetingTitle'),
    summaryDate: document.getElementById('summaryDate'),
    summaryStartTime: document.getElementById('summaryStartTime'),
    summaryEndTimeElement: document.getElementById('summaryEndTime'),
    summaryDuration: document.getElementById('summaryDuration'),
    hours: document.getElementById('hours'),
    minutes: document.getElementById('minutes'),
    secondsElement: document.getElementById('seconds'),
    startMeetingButton: document.getElementById('startMeetingButton'),
    endMeetingButton: document.getElementById('endMeetingButton'),
    showStartCardButton: document.getElementById('showStartCardButton'),
    recaptchaContainer: document.getElementById('recaptcha-container'),
    meetingSummary: document.getElementById('meetingSummary'),
    actionItems: document.getElementById('actionItems'),
    logoutButton: document.getElementById('logoutButton')
};

$(document).ready(function() {
    console.log("Loaded Pasha");
    $('body').addClass('pasha_bg');
    initializeSpheres();
    
    // Simplified initialization
    setupInitialState();

    async function setupInitialState() {
        try {
            console.log("Using hardcoded user ID:", userId);
            localStorage.setItem("loggedIn", "true");
            elements.startCard.classList.remove('d-none');
            updateDate();
      
            initializeSpheres();
            setTimeout(renderAllSpheres, 200);
            transitionBackgroundColor('#efefef');
        } catch (error) {
            console.error("Error in initial setup:", error);
        }
    }

    // Remove these functions as they're no longer needed
    // - initializeFirebaseAuth
    // - afterSuccessfulLogin
    // - resetRecaptcha
    // - signInWithPhoneNumber
    // - normalizeUSPhoneNumber
    // - all login-related event listeners

    function initializeRecaptcha() {
        if (isRecaptchaInitialized) {
            console.log("reCAPTCHA already initialized");
            return;
        }
    
        if (elements.recaptchaContainer) {
            try {
                recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
                    'size': 'invisible',
                    'callback': (response) => {
                        console.log("Recaptcha verified");
                        elements.loginButton.disabled = false;
                        // Proceed with phone number sign-in here
                        signInWithPhoneNumber();
                    }
                });
                recaptchaVerifier.render().then(function() {
                    isRecaptchaInitialized = true;
                    console.log("reCAPTCHA initialized successfully");
                });
            } catch (error) {
                console.error("Error initializing reCAPTCHA:", error);
            }
        } else {
            console.error("Recaptcha container not found");
        }
    }

    function addPassiveEventListener(element, eventName, handler) {
        element.addEventListener(eventName, handler, { passive: true });
    }

    async function startMeeting() {
        if (!isUserAuthenticated()) {
            console.log("User not authenticated. Aborting meeting start.");
            return;
        }
    
        if (pashaHelper && pashaHelper.isRecording) {
            console.log("A meeting is already in progress.");
            alert("A meeting is already in progress.");
            return;
        }
    
        if (!validateMeetingFields()) {
            return;
        }
    
        let loadingIndicator;
        try {
            loadingIndicator = showLoadingIndicator('Starting meeting...');
    
            // Update UI
            elements.startCard.classList.add('d-none');
            elements.timerCard.classList.remove('d-none');
            elements.displayedMeetingTitle.textContent = validateInput(elements.meetingTitle.value) || 'Untitled Meeting';
            updateDate();
            
            // Start timer and set meeting start time
            startTimer();
            meetingStartTime = new Date();
    
            // Change background color
            transitionBackgroundColor('#3eb175');
    
            // Create new meeting document
            const meetingId = await createNewMeetingDocument(meetingStartTime);
            console.log(`New meeting created with ID: ${meetingId}`);
    
            // Initialize PashaHelper and start recording
            pashaHelper = new PashaHelper(db, userId, meetingId);
            console.log("PashaHelper initialized with Firestore instance:", pashaHelper.firestore === db);
            await pashaHelper.startRecording();
            console.log("Primary recording started");
    
            // Initialize PashaSecondary and start secondary recording
            pashaSecondary = new PashaSecondary(db, userId, meetingId);
            await pashaSecondary.startSecondaryRecording();
            console.log("Secondary recording started");
    
            console.log("Meeting started successfully");
            elements.startMeetingButton.textContent = "Meeting Started";
            setTimeout(() => {
                elements.startMeetingButton.disabled = false;
                elements.startMeetingButton.textContent = "Start Meeting";
            }, 3000); // Re-enable button after 3 seconds
        } catch (error) {
            console.error("Error starting meeting:", error);
            alert(`An error occurred while starting the meeting: ${error.message}`);
            
            // Revert UI changes
            elements.timerCard.classList.add('d-none');
            elements.startCard.classList.remove('d-none');
            stopTimer();
            transitionBackgroundColor('#efefef');
            elements.startMeetingButton.disabled = false;
            elements.startMeetingButton.textContent = "Start Meeting";
    
            // Clean up if partial initialization occurred
            if (pashaHelper) {
                await pashaHelper.stopRecording().catch(console.error);
                pashaHelper = null;
            }
            if (pashaSecondary) {
                pashaSecondary.stopSecondaryRecording();
                pashaSecondary = null;
            }
        } finally {
            if (loadingIndicator) {
                hideLoadingIndicator(loadingIndicator);
            }
        }
    }
    
    function validateMeetingFields() {
        const title = elements.meetingTitle.value.trim();
        const host = elements.meetingHost.value.trim();
        const attendees = elements.meetingAttendees.value.trim();
    
        if (!title || !host || !attendees) {
            alert("Please fill in all meeting details.");
            return false;
        }
        return true;
    }
    
    async function endMeeting() {
        if (!isUserAuthenticated()) {
            console.log("User not authenticated. Aborting meeting end.");
            return;
        }
    
        if (!pashaHelper || !pashaHelper.isRecording) {
            console.log("No active meeting to end.");
            alert("There is no active meeting to end.");
            return;
        }
    
        let loadingIndicator;
        try {
            loadingIndicator = showLoadingIndicator('Ending meeting and processing data...');
            summaryEndTime = new Date();
            const duration = summaryEndTime - meetingStartTime;
    
            console.log("Stopping primary recording...");
            await pashaHelper.stopRecording();
    
            console.log("Stopping secondary recording...");
            if (pashaSecondary && typeof pashaSecondary.stopSecondaryRecording === 'function') {
                await pashaSecondary.stopSecondaryRecording();
            }
    
            console.log("Waiting for processing to complete...");
            await waitForProcessingComplete(pashaHelper.meetingId);
    
            console.log("Updating meeting document...");
            await db.collection('meetings').doc(pashaHelper.meetingId).update({
                endTime: formatTime(summaryEndTime),
                duration: `${Math.floor(duration / 60000)} minutes`
            });
    
            console.log("Fetching updated meeting data...");
            const updatedMeetingDoc = await db.collection('meetings').doc(pashaHelper.meetingId).get();
            const updatedMeetingData = updatedMeetingDoc.data();
            updateUIAfterMeetingEnd(updatedMeetingData);
    
            console.log("Sending end meeting email...");
            await sendEndMeetingEmail(updatedMeetingData);
    
            console.log("Meeting ended and data processed successfully");
            alert("Meeting ended, data processed, and email sent successfully!");
    
            transitionBackgroundColor('#efefef');
        } catch (error) {
            console.error("Error ending meeting:", error);
            let errorMessage = "An error occurred while ending the meeting. ";
            errorMessage += error.code === "permission-denied"
                ? "You don't have permission to save meeting data. Please make sure you're logged in and try again."
                : "Please try again or contact support if the problem persists.";
            alert(errorMessage);
        } finally {
            if (loadingIndicator) {
                hideLoadingIndicator(loadingIndicator);
            }
            stopTimer();
            pashaHelper = null;
            pashaSecondary = null;
        }
    }

    async function createNewMeetingDocument(startTime) {
        try {
            const docId = formatDateTimeForId(startTime);
    
            const meetingTitle = elements.meetingTitle.value.trim();
            const meetingHost = elements.meetingHost.value.trim();
            const meetingAttendees = parseAttendees(elements.meetingAttendees.value);
    
            const meetingData = {
                userId: userId,
                title: meetingTitle || 'Untitled Meeting',
                host: meetingHost || 'Unknown Host',
                attendees: meetingAttendees,
                date: firebase.firestore.Timestamp.fromDate(startTime),
                startTime: formatTime(startTime),
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
    
            await db.collection('meetings').doc(docId).set(meetingData);
            console.log("New meeting document created with ID: ", docId);
            return docId;
        } catch (error) {
            console.error("Error creating new meeting document:", error);
            throw error;
        }
    }
      
    function parseAttendees(attendeesString) {
    if (!attendeesString) return [];
    return attendeesString.split(',')
        .map(attendee => attendee.trim())
        .filter(attendee => attendee.length > 0);
    }
    
    function formatDateTimeForId(date) {
        return date.toISOString().replace(/[:.]/g, '-');
    }

    async function waitForProcessingComplete(meetingId) {
        const maxAttempts = 60;
        let attempts = 0;
    
        while (attempts < maxAttempts) {
            const doc = await db.collection('meetings').doc(meetingId).get();
            if (doc.data().processingComplete) {
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 5000));
            attempts++;
        }
    
        throw new Error('Processing timed out. Please check the meeting status later.');
    }
    
    function updateUIAfterMeetingEnd(meetingData) {
        elements.timerCard.classList.add('d-none');
        elements.summaryCard.classList.remove('d-none');
        const dateObj = getDateFromFirestore(meetingData.date);
        const formattedDate = formatDate(dateObj);
        elements.summaryMeetingTitle.textContent = meetingData.title;
        elements.summaryDate.textContent = formattedDate;
        elements.summaryStartTime.textContent = `Started at: ${meetingData.startTime}`;
        elements.summaryEndTimeElement.textContent = `Ended at: ${meetingData.endTime}`;
        elements.summaryDuration.textContent = `Duration: ${meetingData.duration}`;
        
        if (meetingData.summary) {
            elements.meetingSummary.textContent = meetingData.summary;
        }
        
        if (meetingData.actionItems && meetingData.actionItems.length > 0) {
            elements.actionItems.innerHTML = '';
            meetingData.actionItems.forEach((item, index) => {
                const li = document.createElement('li');
                li.innerHTML = `
                    <strong>Action Item ${index + 1}:</strong><br>
                    <strong>What:</strong> ${validateInput(item.what) || 'N/A'}<br>
                    <strong>Who:</strong> ${validateInput(item.who) || 'N/A'}<br>
                    <strong>When:</strong> ${validateInput(item.when) || 'N/A'}<br>
                    <strong>Status:</strong> ${validateInput(item.status) || 'N/A'}
                `;
                elements.actionItems.appendChild(li);
            });
        }
    }

    function handleBeforeUnload(event) {
        if (pashaHelper && pashaHelper.isRecording) {
            event.preventDefault();
            event.returnValue = 'You have an active meeting. Are you sure you want to leave?';
        }
    }

    function showStartCard() {
        try {
            elements.summaryCard.classList.add('d-none');
            elements.startCard.classList.remove('d-none');
            elements.meetingTitle.value = '';
            initializeSpheres();
            renderAllSpheres();  // Force re-render
        } catch (error) {
            console.error("Error showing start card:", error);
            alert("An error occurred. Please refresh the page and try again.");
        }
    }

    function updateDate() {
        try {
            const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
            const date = new Date().toLocaleDateString('en-US', options);
            elements.currentDate.textContent = date;
            elements.currentDateTimer.textContent = date;
        } catch (error) {
            console.error("Error updating date:", error);
        }
    }

    function startTimer() {
        timerInterval = setInterval(updateTimer, 1000);
    }

    function stopTimer() {
        clearInterval(timerInterval);
        seconds = 0;
        updateTimerDisplay();
    }

    function updateTimer() {
        seconds++;
        updateTimerDisplay();
    }

    function updateTimerDisplay() {
        try {
            const hrs = Math.floor(seconds / 3600);
            const mins = Math.floor((seconds % 3600) / 60);
            const secs = seconds % 60;
            elements.hours.textContent = padZero(hrs);
            elements.minutes.textContent = padZero(mins);
            elements.secondsElement.textContent = padZero(secs);
        } catch (error) {
            console.error("Error updating timer display:", error);
        }
    }

    function padZero(num) {
        return num.toString().padStart(2, '0');
    }

    function formatDate(date) {
        return `${date.toLocaleString('default', { month: 'long' })} ${date.getDate()}`;
    }

    function formatTime(date) {
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }

    function showLoadingIndicator(message) {
        const loadingIndicator = document.createElement('div');
        loadingIndicator.textContent = message;
        loadingIndicator.style.position = 'fixed';
        loadingIndicator.style.top = '50%';
        loadingIndicator.style.left = '50%';
        loadingIndicator.style.transform = 'translate(-50%, -50%)';
        loadingIndicator.style.padding = '20px';
        loadingIndicator.style.background = 'rgba(0,0,0,0.5)';
        loadingIndicator.style.color = 'white';
        loadingIndicator.style.borderRadius = '10px';
        loadingIndicator.style.zIndex = '9999';
        document.body.appendChild(loadingIndicator);
        return loadingIndicator;
    }

    function hideLoadingIndicator(loadingIndicator) {
        if (loadingIndicator && loadingIndicator.parentNode) {
            loadingIndicator.parentNode.removeChild(loadingIndicator);
        }
    }

    function getDateFromFirestore(firestoreDate) {
        return firestoreDate instanceof firebase.firestore.Timestamp ? firestoreDate.toDate() : new Date(firestoreDate);
    }

    function validateInput(input) {
        return input ? input.replace(/[<>&'"]/g, function (c) {
            return {'<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&#39;', '"': '&quot;'}[c];
        }) : '';
    }

    async function sendEndMeetingEmail(meetingData) {
        try {
            const response = await fetch('https://us-central1-pa-sha.cloudfunctions.net/endMeetingEmail', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    meetingTitle: meetingData.title,
                    meetingDateTime: `${formatDate(getDateFromFirestore(meetingData.date))} ${meetingData.startTime}`,
                    actionItems: meetingData.actionItems,
                    summary: meetingData.summary,
                }),
            });
    
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to send end meeting email: ${errorText}`);
            }
    
            console.log('End meeting email sent successfully');
        } catch (error) {
            console.error('Error sending end meeting email:', error);
            alert('Failed to send end meeting email. Please check your network connection and try again.');
        }
    }

    async function logout() {
        try {
            await firebase.auth().signOut();
            userId = null;
            elements.loginForm.classList.remove('d-none');
            elements.startCard.classList.add('d-none');
            elements.timerCard.classList.add('d-none');
            elements.summaryCard.classList.add('d-none');
            localStorage.removeItem("loggedIn");
            console.log("User logged out successfully");
            
            $('body').removeClass('bg-color').addClass('pasha_bg');
            $('body').css('background-color', '');
        } catch (error) {
            console.error("Error logging out:", error);
            alert("An error occurred while logging out. Please try again.");
        }
    }

    function transitionBackgroundColor(color, duration = 1000) {
        $('body').removeClass('pasha_bg').addClass('bg-color');
        $('body').animate({
            backgroundColor: color
        }, duration);
    }

    elements.startMeetingButton.addEventListener('click', startMeeting);
    elements.endMeetingButton.addEventListener('click', endMeeting);
    elements.showStartCardButton.addEventListener('click', showStartCard);
    if (elements.logoutButton) {
        elements.logoutButton.addEventListener('click', logout);
    }
    window.addEventListener('beforeunload', function() {
        resetRecaptcha();
    });
    window.addEventListener('beforeunload', handleBeforeUnload);
    addPassiveEventListener(window, 'resize', function() {
        sphereVisualizations.forEach(viz => viz.resize());
        renderAllSpheres();
    });
    updateDate();
    if (localStorage.getItem("loggedIn") === "true") {
        elements.loginForm.classList.add('d-none');
        elements.startCard.classList.remove('d-none');
    }
});