// meetingHistory.js

let meetings = [];
const functions = firebase.functions();

function initializeAuth() {
    firebase.auth().onAuthStateChanged(function(user) {
        if (user) {
            loadMeetingHistory();
        } else {
            displayNotLoggedInMessage();
        }
    });
}

function displayNotLoggedInMessage() {
    const historyList = document.getElementById('historyList');
    if (historyList) {
        historyList.innerHTML = '<p class="text-center">Please log in to view your meeting history.</p>';
    }
}

function showLoadingIndicator() {
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) {
        loadingIndicator.style.display = 'block';
    }
}

function hideLoadingIndicator() {
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) {
        loadingIndicator.style.display = 'none';
    }
}

async function loadMeetingHistory() {
    try {
        const user = firebase.auth().currentUser;
        if (!user) {
            console.log("No user logged in");
            displayNotLoggedInMessage();
            return;
        }

        let querySnapshot;
        try {
            querySnapshot = await firebase.firestore().collection('meetings')
                .where('userId', '==', user.uid)
                .orderBy('createdAt', 'desc')
                .get();
        } catch (indexError) {
            console.warn("Index not ready, fetching without ordering:", indexError);
            querySnapshot = await firebase.firestore().collection('meetings')
                .where('userId', '==', user.uid)
                .get();
        }

        meetings = querySnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));

        meetings.sort((a, b) => {
            const aTime = a.createdAt ? a.createdAt.toMillis() : 0;
            const bTime = b.createdAt ? b.createdAt.toMillis() : 0;
            return bTime - aTime;
        });

        displayMeetingHistory();
    } catch (error) {
        console.error("Error loading meeting history:", error);
        displayMeetingHistory(); // Display even if there's an error
    }
}

function displayMeetingHistory() {
    const historyList = document.getElementById('historyList');
    if (!historyList) {
        console.error("History list element not found");
        return;
    }
    historyList.innerHTML = '';

    if (!meetings || meetings.length === 0) {
        historyList.innerHTML = '<p class="text-center">No meetings found.</p>';
        return;
    }

    meetings.forEach((meeting) => {
        const dateObj = meeting.date instanceof firebase.firestore.Timestamp ? meeting.date.toDate() : new Date(meeting.date);
        const formattedDate = `${dateObj.toLocaleString('default', { month: 'long' })} ${dateObj.getDate()}`;

        const listItem = document.createElement('div');
        listItem.className = 'list-group-item d-flex justify-content-between align-items-center';
        listItem.innerHTML = `
            <div class="meeting-info" onclick="showMeetingDetails('${meeting.id}')">
                <h6>${formattedDate || 'No date'} - ${meeting.startTime || 'No start time'}</h6>
                <p>${meeting.title || 'Untitled Meeting'}</p>
            </div>
            <div class="meeting-actions">
                <button class="btn btn-sm btn-outline-primary bookmark-btn" onclick="toggleBookmark('${meeting.id}')">
                    <i class="bi ${meeting.bookmarked ? 'bi-bookmark-fill' : 'bi-bookmark'}"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger delete-btn" onclick="deleteMeeting('${meeting.id}')">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
        `;
        historyList.appendChild(listItem);
    });

    enableSwipe();
}

function showMeetingDetails(meetingId) {
    const meeting = meetings.find(m => m.id === meetingId);
    if (!meeting) {
        console.error("Meeting not found");
        return;
    }

    const dateObj = meeting.date instanceof firebase.firestore.Timestamp ? meeting.date.toDate() : new Date(meeting.date);
    const formattedDateTime = `${dateObj.toLocaleString('default', { month: 'long' })} ${dateObj.getDate()}, ${meeting.startTime}`;

    const elements = {
        title: document.getElementById('meetingDetailsModalLabel'),
        detailsTitle: document.getElementById('meetingDetailsTitle'),
        host: document.getElementById('meetingDetailsHost'),
        attendees: document.getElementById('meetingDetailsAttendees'),
        startTime: document.getElementById('meetingDetailsStartTime'),
        endTime: document.getElementById('meetingDetailsEndTime'),
        duration: document.getElementById('meetingDetailsDuration'),
        actionItems: document.getElementById('actionItems'),
        summary: document.getElementById('meetingSummary'),
        transcript: document.getElementById('meetingTranscript')
    };

    // Check if all elements exist
    for (const [key, element] of Object.entries(elements)) {
        if (!element) {
            console.warn(`Element not found: ${key}`);
            continue;
        }

        switch(key) {
            case 'title':
            case 'detailsTitle':
                element.textContent = meeting.title || 'Untitled Meeting';
                break;
            case 'host':
                element.textContent = `${meeting.host || 'N/A'}`;
                break;
            case 'attendees':
                element.textContent = `${meeting.attendees ? meeting.attendees.join(', ') : 'N/A'}`;
                break;
            case 'startTime':
                element.textContent = `Started at: ${meeting.startTime || 'N/A'}`;
                break;
            case 'endTime':
                element.textContent = `Ended at: ${meeting.endTime || 'N/A'}`;
                break;
            case 'duration':
                element.textContent = `Duration: ${meeting.duration || 'N/A'}`;
                break;
            case 'actionItems':
                displayActionItems(element, meeting.actionItems);
                break;
            case 'summary':
                element.textContent = meeting.summary || 'No summary available.';
                break;
            case 'transcript':
                displayTranscript(element, meeting.transcript, meeting.secondaryTranscript);
                break;
        }
    }

    // Set up secondary transcript processing button
    const secondaryTransBtn = document.getElementById('secondaryTrans');
    if (secondaryTransBtn) {
        secondaryTransBtn.onclick = async () => {
            try {
                showLoadingIndicator();
                const processSecondaryTranscript = functions.httpsCallable('transcribeAudio');
                const result = await processSecondaryTranscript({ meetingId });
                console.log('Secondary transcript processing result:', result.data);
                alert('Secondary transcript processed successfully!');
                showMeetingDetails(meetingId);
            } catch (error) {
                console.error('Error processing secondary transcript:', error);
                alert(`Error processing secondary transcript: ${error.message}`);
            } finally {
                hideLoadingIndicator();
            }
        };
    }

    const meetingDetailsModal = new bootstrap.Modal(document.getElementById('meetingDetailsModal'));
    meetingDetailsModal.show();
}

function displayTranscript(element, transcript, secondaryTranscript) {
    if (!element) {
        console.warn('Transcript element not found');
        return;
    }

    let transcriptHtml = '<h5>Primary Transcript:</h5>';

    if (Array.isArray(transcript)) {
        transcriptHtml += transcript.join('<br>');
    } else if (typeof transcript === 'string') {
        transcriptHtml += transcript;
    } else {
        transcriptHtml += 'No primary transcript available.';
    }

    transcriptHtml += '<h5 class="mt-4">Secondary Transcript:</h5>';

    if (Array.isArray(secondaryTranscript)) {
        transcriptHtml += secondaryTranscript.join('<br>');
    } else if (typeof secondaryTranscript === 'string') {
        transcriptHtml += secondaryTranscript;
    } else {
        transcriptHtml += 'No secondary transcript available.';
    }

    element.innerHTML = transcriptHtml;
}

function displayActionItems(element, actionItems) {
    if (!element) {
        console.warn('Action items element not found');
        return;
    }
    element.innerHTML = '';
    if (!actionItems || actionItems.length === 0) {
        element.innerHTML = '<div>No action items found.</div>';
    } else {
        actionItems.forEach((item, index) => {
            const div = document.createElement('div');
            div.innerHTML = `
            <a href="#" class="list-group-item list-group-item-action" aria-current="true">
                <small class="mb-2 d-inline-block">
                    <input class="form-check-input me-2" type="checkbox" value="" aria-label="...">
                    <strong>Action Item ${index + 1}</strong>
                </small><br>
                <h5><strong>Who:</strong> ${item.who || 'N/A'}</h5>
                <p class="mb-1"><strong>What:</strong> ${item.what || 'N/A'}</p>
                <p class="mb-1"><strong>When:</strong> ${item.when || 'N/A'}</p>
                <small><strong>Status:</strong> ${item.status || 'N/A'}</small>
            </a>
            `;
            element.appendChild(div);
        });
    }
}

async function toggleBookmark(meetingId) {
    try {
        const meetingRef = firebase.firestore().collection('meetings').doc(meetingId);
        const meeting = meetings.find(m => m.id === meetingId);

        if (!meeting) {
            console.error("Meeting not found for bookmarking");
            return;
        }

        await meetingRef.update({
            bookmarked: !meeting.bookmarked
        });

        meeting.bookmarked = !meeting.bookmarked;
        displayMeetingHistory();
    } catch (error) {
        console.error("Error toggling bookmark:", error);
    }
}

async function deleteMeeting(meetingId) {
    if (confirm("Are you sure you want to delete this meeting?")) {
        try {
            await firebase.firestore().collection('meetings').doc(meetingId).delete();
            meetings = meetings.filter(m => m.id !== meetingId);
            displayMeetingHistory();
        } catch (error) {
            console.error("Error deleting meeting:", error);
        }
    }
}

function enableSwipe() {
    const listItems = document.querySelectorAll('#historyList .list-group-item');
    listItems.forEach(item => {
        const hammer = new Hammer(item);
        hammer.on('swipeleft swiperight', function(ev) {
            const actions = item.querySelector('.meeting-actions');
            if (actions) {
                if (ev.type === 'swipeleft') {
                    actions.style.transform = 'translateX(-100%)';
                } else {
                    actions.style.transform = 'translateX(0)';
                }
            }
        });
    });
}

// Load meeting history when the history modal is shown
const historyModal = document.getElementById('historyModal');
if (historyModal) {
    historyModal.addEventListener('show.bs.modal', () => {
        if (firebase.auth().currentUser) {
            loadMeetingHistory();
        } else {
            displayNotLoggedInMessage();
        }
    });
} else {
    console.error("History modal element not found");
}

// Initialize authentication listener
document.addEventListener('DOMContentLoaded', initializeAuth);