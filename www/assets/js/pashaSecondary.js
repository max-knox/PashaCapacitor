// pashaSecondary.js
(function(window) {
    class PashaSecondary {
        constructor(firestore, userId, meetingId) {
            this.firestore = firestore;
            this.userId = userId;
            this.meetingId = meetingId;
            this.isRecording = false;
            this.secondaryRecorder = null;
            this.secondaryChunks = [];
            this.uploadedChunks = 0;
            this.uploadInterval = null;
        }

        async startSecondaryRecording() {
            if (this.isRecording) {
                console.warn('Secondary recording is already in progress.');
                return;
            }

            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                this.secondaryRecorder = new MediaRecorder(stream, { 
                    mimeType: 'audio/webm',
                    audioBitsPerSecond: 128000
                });

                this.secondaryRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0) {
                        console.log(`Chunk ${this.secondaryChunks.length + 1} recorded: ${event.data.size} bytes`);
                        this.secondaryChunks.push(event.data);
                    } else {
                        console.warn('Empty chunk recorded');
                    }
                };

                this.secondaryRecorder.onstop = () => {
                    console.log('Secondary MediaRecorder stopped');
                    this.uploadFullAudio();
                };

                this.secondaryRecorder.start(60000); // 1 minute chunks
                this.isRecording = true;
                console.log('Secondary recording started');

                // Set up interval to upload chunks every 5 minutes
                this.uploadInterval = setInterval(() => this.uploadChunks(), 300000);

            } catch (error) {
                console.error('Error starting secondary recording:', error);
                throw error;
            }
        }

        async stopSecondaryRecording() {
            if (this.secondaryRecorder && this.isRecording) {
                this.isRecording = false;
                clearInterval(this.uploadInterval);
                
                // Create a promise that resolves when the recording stops
                await new Promise((resolve) => {
                    this.secondaryRecorder.addEventListener('stop', async () => {
                        try {
                            // Create blob from chunks before uploading
                            const audioBlob = new Blob(this.secondaryChunks, { type: 'audio/webm' });
                            await this.uploadFullAudio(audioBlob);
                            resolve();
                        } catch (error) {
                            console.error('Error in stop recording handler:', error);
                            resolve(); // Resolve anyway to prevent hanging
                        }
                    }, { once: true });
                    
                    this.secondaryRecorder.stop();
                });
                
                console.log('Secondary recording stopped');
            }
        }

        async uploadChunks() {
            const chunksToUpload = this.secondaryChunks.slice(this.uploadedChunks);
            if (chunksToUpload.length === 0) return;

            const blob = new Blob(chunksToUpload, { type: 'audio/webm' });
            const file = new File([blob], `meeting_${this.meetingId}_part${this.uploadedChunks}.webm`, { type: 'audio/webm' });

            const storageRef = firebase.storage().ref();
            const fileRef = storageRef.child(`meetings/${this.meetingId}/chunks/${file.name}`);

            try {
                const snapshot = await fileRef.put(file);
                console.log('Uploaded audio chunk:', file.name, 'Size:', file.size, 'bytes');

                const downloadURL = await snapshot.ref.getDownloadURL();
                console.log('Chunk Download URL:', downloadURL);

                this.uploadedChunks = this.secondaryChunks.length;

                // Update Firestore with the new chunk URL
                await this.firestore.collection('meetings').doc(this.meetingId).update({
                    secondaryAudioChunks: firebase.firestore.FieldValue.arrayUnion({
                        url: downloadURL,
                        timestamp: Date.now()
                    })
                });

            } catch (error) {
                console.error('Error uploading audio chunk:', error);
            }
        }

        async uploadFullAudio(audioBlob) {
            try {
                // Verify user and meeting IDs
                if (!this.userId || !this.meetingId) {
                    throw new Error('Missing userId or meetingId');
                }

                // Verify blob
                if (!(audioBlob instanceof Blob)) {
                    throw new Error('Invalid audio data provided');
                }

                // Create a more specific file path
                const timestamp = new Date().toISOString();
                const filePath = `meetings/${this.userId}/${this.meetingId}/full_audio_${timestamp}.webm`;
                
                // Get storage reference
                const storageRef = firebase.storage().ref();
                const fileRef = storageRef.child(filePath);

                // Set metadata
                const metadata = {
                    contentType: 'audio/webm',
                    customMetadata: {
                        userId: this.userId,
                        meetingId: this.meetingId,
                        timestamp: timestamp
                    }
                };

                // Create upload task
                const uploadTask = fileRef.put(audioBlob, metadata);
                
                // Monitor upload progress
                uploadTask.on('state_changed',
                    (snapshot) => {
                        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                        console.log('Upload progress:', progress);
                    },
                    (error) => {
                        console.error('Upload error:', error);
                        throw error;
                    }
                );

                // Wait for upload to complete
                const snapshot = await uploadTask;
                
                // Get download URL
                const downloadURL = await snapshot.ref.getDownloadURL();

                // Update meeting document with audio URL
                await this.firestore.collection('meetings')
                    .doc(this.meetingId)
                    .update({
                        fullAudioUrl: downloadURL,
                        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                    });

                console.log('Full audio upload complete:', downloadURL);
                return downloadURL;

            } catch (error) {
                console.error('Error in uploadFullAudio:', error);
                
                // Send error to analytics
                if (typeof gtag !== 'undefined') {
                    gtag('event', 'upload_error', {
                        'event_category': 'meeting',
                        'event_label': error.message
                    });
                }

                // Update meeting document with error status
                try {
                    await this.firestore.collection('meetings')
                        .doc(this.meetingId)
                        .update({
                            uploadError: error.message,
                            lastError: firebase.firestore.FieldValue.serverTimestamp()
                        });
                } catch (dbError) {
                    console.error('Error updating meeting document:', dbError);
                }

                throw error;
            }
        }

        async processSecondaryAudioWithRetries(audioUrl, maxRetries = 3) {
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    console.log(`Processing attempt ${attempt} of ${maxRetries}`);
                    
                    const response = await fetch('https://us-central1-pa-sha.cloudfunctions.net/pashameetinglistener', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            data: {
                                meetingId: this.meetingId,
                                secondaryAudioUrl: audioUrl,
                                isSecondaryProcessing: true,
                                retryCount: attempt - 1
                            }
                        })
                    });

                    if (response.ok) {
                        const result = await response.json();
                        await this.updateMeetingStatus('complete', null);
                        return result;
                    }

                    // If we get here, the response wasn't ok
                    console.log(`Attempt ${attempt} failed with status: ${response.status}`);
                    
                    if (attempt < maxRetries) {
                        // Wait longer between each retry
                        const delay = attempt * 5000; // 5s, 10s, 15s
                        console.log(`Waiting ${delay/1000} seconds before retry...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }

                } catch (error) {
                    console.error(`Processing attempt ${attempt} error:`, error);
                    if (attempt === maxRetries) {
                        throw error;
                    }
                }
            }

            // If we get here, all retries failed
            throw new Error(`Processing failed after ${maxRetries} attempts`);
        }

        async updateMeetingStatus(status, error = null, audioUrl = null) {
            const updateData = {
                processingStatus: status,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            };

            if (error) {
                updateData.processingError = error;
            }
            if (audioUrl) {
                updateData.secondaryAudioUrl = audioUrl;
            }
            if (status === 'complete') {
                updateData.processingComplete = true;
            }

            try {
                await this.firestore.collection('meetings').doc(this.meetingId).update(updateData);
                console.log(`Meeting status updated to: ${status}`);
            } catch (error) {
                console.error('Error updating meeting status:', error);
            }
        }
    }

    window.PashaSecondary = PashaSecondary;

})(window);