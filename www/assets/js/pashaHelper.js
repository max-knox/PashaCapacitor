// pashaHelper
function PashaHelper(firestore, userId, meetingId) {
  this.firestore = firestore;
  this.userId = userId;
  this.meetingId = meetingId;
  this.mediaRecorder = null;
  this.audioChunks = [];
  this.isRecording = false;
  this.PASHA_LISTENER_URL = 'https://us-central1-pa-sha.cloudfunctions.net/pashameetinglistener';
}

PashaHelper.prototype.startRecording = async function() {
  if (this.isRecording) {
    console.warn('Recording is already in progress.');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.audioChunks.push(event.data);
        this.sendAudioChunk(event.data);
      }
    };

    this.mediaRecorder.onstart = () => {
      console.log('MediaRecorder started');
    };

    this.mediaRecorder.onstop = () => {
      console.log('MediaRecorder stopped');
      // Send the final chunk to signal the end of the stream
      this.sendAudioChunk(null, true);
    };

    // Start recording and collect data every second
    this.mediaRecorder.start(1000);
    this.isRecording = true;
    console.log('Recording started successfully');
  } catch (error) {
    console.error('Error starting recording:', error);
    throw error;
  }
};

PashaHelper.prototype.stopRecording = function() {
  if (this.mediaRecorder && this.isRecording) {
    this.isRecording = false;
    this.mediaRecorder.stop();
    console.log('Recording stopped');
    // The onstop event will handle sending the final chunk
  }
};

PashaHelper.prototype.clear = function() {
  this.stopRecording();
  this.audioChunks = [];
  this.isRecording = false;
  console.log('PashaHelper cleared');
};

PashaHelper.prototype.sendAudioChunk = async function(chunk, isLastChunk = false) {
  try {
    let base64Audio = '';
    if (chunk) {
      const arrayBuffer = await chunk.arrayBuffer();
      base64Audio = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    }

    const response = await fetch(this.PASHA_LISTENER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        data: { 
          audioContent: base64Audio,
          meetingId: this.meetingId,
          isLastChunk: isLastChunk
        } 
      }),
      credentials: 'include',
      mode: 'cors'
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    console.log('Server response:', result);
  } catch (error) {
    console.error('Error sending audio chunk:', error);
    // Log the error but do not throw, to ensure continued processing
  }
};