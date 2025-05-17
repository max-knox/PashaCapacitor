// agent_controller.js
import { SYSTEM_PROMPT, FIRST_MESSAGE } from './system_prompt.js';

export class AgentController {
  constructor() {
    // Initialize custom console
    this.customConsole = new CustomConsole();

    this.recognition = null;
    this.dataArray = null;
    this.sessionId = null;
    this.state = {
      isListening: false,
      isPaused: false,
      isAgentSpeaking: false,
      isModeSwitching: false 
    };

    this.elements = {};
    this.audio = {
      context: null,
      analyser: null,
      source: null,
      mediaRecorder: null,
      chunks: []
    };

    this.conversation = {
      history: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "assistant", content: FIRST_MESSAGE }
      ],
      lastRequestTime: 0,
      lastConversationTime: 0,
      speechSegments: [],
      wordCount: 0
    };

    this.timers = {
      listening: null,
      listeningSeconds: 0
    };

    this.config = {
      minTimeBetweenRequests: 5000,
      silenceTimeout: 1500,
      responseDelay: 50,
      interruptionThreshold: 5,
      maxDuration: 100000,
      minAudioLength: 1000,
      conversationCooldown: 10000
    };

    // New properties for 3D visualization
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.sphere = null;
    this.audioWaves = null;
    this.analyser = null;
    this.isPlaying = false;
    this.spinSpeed = 0.02;
    this.animationFrameCount = 0;
    this.currentTextureIndex = 3;
    this.textures = [
      'https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg',
      'https://threejs.org/examples/textures/planets/jupiter_1k.jpg',
      'https://threejs.org/examples/textures/planets/mars_1k_color.jpg',
      'https://pa-sha.web.app/assets/img/pasha_sphere.jpg'
    ];

    this.isInitialized = false;
    this.chatCompletionEndpoint = 'https://us-central1-pa-sha.cloudfunctions.net/agent_completions'; // Default endpoint
  }

  async init() {
    if (this.isInitialized) return;
  
    try {
      console.log('Initializing AgentController...');
  
      // Wait for Firebase to connect
      await new Promise((resolve, reject) => {
        if (typeof firebase !== 'undefined' && firebase.apps.length) {
          console.log('Firebase detected and initialized');
          resolve();
        } else {
          const checkFirebase = () => {
            if (typeof firebase !== 'undefined' && firebase.apps.length) {
              console.log('Firebase detected and initialized');
              resolve();
            } else if (Date.now() - startTime > 10000) { // 10 second timeout
              reject(new Error('Firebase initialization timeout'));
            } else {
              setTimeout(checkFirebase, 100);
            }
          };
          const startTime = Date.now();
          checkFirebase();
        }
      });
  
      console.log('Firebase initialization confirmed, initializing elements...');
      this.initializeElements();
  
      console.log('Elements initialized, setting up event listeners...');
      this.setupEventListeners();
  
      console.log('Setting up mode buttons...');
      this.setupModeButtons();
  
      console.log('Event listeners set up, initializing audio context...');
      this.initAudioContext();
  
      console.log('Initializing visualization...');
      this.initVisualization();
  
      console.log('Attempting to append first message...');
      if (this.elements.chatMessages) {
        this.appendMessage('bot', FIRST_MESSAGE);
        console.log('First message appended, playing audio response...');
        await this.playAudioResponse(FIRST_MESSAGE);
      } else {
        console.error('Chat messages container not found. Unable to display first message.');
      }
  
      console.log('Starting listening...');
      this.startListening();
  
      this.isInitialized = true;
    } catch (error) {
      console.error('Initialization error:', error);
      // Handle the error appropriately, maybe display a message to the user
      this.appendMessage('bot', 'Sorry, there was an error initializing the application. Please refresh the page and try again.');
    }
  }

  initializeElements() {
    this.elements = {
      audioPlayer: document.getElementById("audioPlayer"),
      chatMessages: document.getElementById("chat-messages"),
      loader: document.getElementById("loader"),
      voiceAction: document.getElementById("voice-action"),
      pauseButton: document.querySelector('.pause-btn'),
      continueButton: document.getElementById("continueVoice"),
      sphereCanvas: document.getElementById('sphereCanvas'),
      timerElement: document.getElementById('timerCount')
    };

    console.log('Initialized elements:', this.elements);

    // Check if all elements exist
    for (const [key, element] of Object.entries(this.elements)) {
      if (!element) {
        console.error(`Element ${key} not found in the DOM`);
      }
    }
  }

  setupEventListeners() {
    if (this.elements.pauseButton) {
      this.elements.pauseButton.addEventListener('click', () => this.togglePause());
    }
    if (this.elements.continueButton) {
      this.elements.continueButton.addEventListener('click', () => this.resumeConversation());
    }
    if (this.elements.audioPlayer) {
      this.elements.audioPlayer.addEventListener('play', () => this.handleAudioPlay());
      this.elements.audioPlayer.addEventListener('pause', () => this.handleAudioPause());
      this.elements.audioPlayer.addEventListener('ended', () => this.handleAudioEnded());
    }
  }

  initAudioContext() {
    // Initialize audio context on first user interaction
    const initAudio = () => {
      if (!this.audio.context) {
        this.audio.context = new (window.AudioContext || window.webkitAudioContext)();
        this.setupAudioVisualization();
      }
      document.removeEventListener('click', initAudio);
    };
    document.addEventListener('click', initAudio);
  }

  initVisualization() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.elements.sphereCanvas, alpha: true });
    this.renderer.setSize(240, 240);

    const geometry = new THREE.SphereGeometry(1, 64, 64);
    const texture = new THREE.TextureLoader().load(this.textures[this.currentTextureIndex]);
    const material = new THREE.MeshPhongMaterial({ map: texture });
    this.sphere = new THREE.Mesh(geometry, material);
    this.scene.add(this.sphere);

    const light = new THREE.PointLight(0xFFFFFF, 1, 100);
    light.position.set(10, 10, 10);
    this.scene.add(light);

    this.camera.position.z = 3;

    this.audioWaves = new THREE.Group();
    for (let i = 0; i < 50; i++) {
      const curve = new THREE.EllipseCurve(
        0, 0,
        1.1 + i * 0.02, 1.1 + i * 0.02,
        0, 2 * Math.PI,
        false,
        0
      );
      const points = curve.getPoints(50);
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
      const ellipse = new THREE.Line(geometry, material);
      this.audioWaves.add(ellipse);
    }
    this.scene.add(this.audioWaves);

    this.animate();
  }

  startSpeechRecognition() {
    if ('webkitSpeechRecognition' in window) {
      if (this.recognition) {
        this.recognition.stop();
      }
      this.recognition = new webkitSpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
  
      this.recognition.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            const transcript = event.results[i][0].transcript.trim().toLowerCase();
            if (transcript === 'stop' || transcript === 'pasha stop') {
              this.interruptPlayback();
            }
          }
        }
      };
  
      this.recognition.onerror = (event) => {
        console.error('Speech recognition error', event.error);
        // Attempt to restart recognition if it errors out
        this.startSpeechRecognition();
      };
  
      this.recognition.start();
      console.log('Speech recognition started');
    } else {
      console.log('Web Speech API is not supported in this browser.');
    }
  }

  interruptPlayback() {
    if (this.state.isAgentSpeaking) {
      this.state.isAgentSpeaking = false;
      if (this.elements.audioPlayer) {
        this.elements.audioPlayer.pause();
      }
      this.stopVisualization();
      this.appendMessage('bot', "Ok, I'm listening.");
      this.playShortAudioResponse("Ok, I'm listening.");
      this.switchToListeningMode();
    }
  }

  async playShortAudioResponse(text) {
    try {
      const response = await fetch('https://us-central1-pa-sha.cloudfunctions.net/textToSpeech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://localhost'
        },
        body: JSON.stringify({ data: { text } }),
      });
  
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
  
      const audioBlob = await response.blob();
      const audio = new Audio(URL.createObjectURL(audioBlob));
      await audio.play();
    } catch (error) {
      console.error('Error playing short audio response:', error);
    }
  }

  animate() {
    requestAnimationFrame(() => this.animate());
  
    if (!this.sphere || !this.audioWaves) {
      return;
    }
  
    // Rotate the sphere
    this.sphere.rotation.y += this.spinSpeed;
    this.sphere.rotation.x += this.spinSpeed * 0.4;
  
    if (this.isPlaying && this.analyser && this.dataArray) {
      this.analyser.getByteTimeDomainData(this.dataArray);
      
      this.audioWaves.children.forEach((wave, index) => {
        const value = this.dataArray[index % this.dataArray.length] / 128.0;
        const scale = 1 + Math.abs(value - 1) * 0.3;
        wave.scale.set(scale, scale, 1);
        wave.material.opacity = Math.min(Math.abs(value - 1) + 0.2, 1);
      });
    } else {
      // Reset visualization when not playing
      this.audioWaves.children.forEach(wave => {
        wave.scale.set(1, 1, 1);
        wave.material.opacity = 0.1;
      });
    }
  
    // Rotate the audio waves
    this.audioWaves.rotation.z += this.spinSpeed * 0.5;
  
    // Render the scene
    this.renderer.render(this.scene, this.camera);
  }

  setupAudioVisualization() {
    if (!this.audio.context) {
      this.audio.context = new (window.AudioContext || window.webkitAudioContext)();
    }
    this.analyser = this.audio.context.createAnalyser();
    this.analyser.fftSize = 256;
    const bufferLength = this.analyser.frequencyBinCount;
    this.dataArray = new Uint8Array(bufferLength);
  }

  attachVisualization(audioElement) {
    console.log('Attaching visualization to audio element');
    if (!this.audio.context) {
      console.log('Creating new AudioContext');
      this.audio.context = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (!this.analyser) {
      console.log('Setting up audio analyser');
      this.setupAudioVisualization();
    }
    if (this.audio.source) {
      console.log('Disconnecting previous audio source');
      this.audio.source.disconnect();
    }
    console.log('Creating and connecting new media element source');
    this.audio.source = this.audio.context.createMediaElementSource(audioElement);
    this.audio.source.connect(this.analyser);
    this.analyser.connect(this.audio.context.destination);
  
    console.log('Audio visualization setup complete');
  }

  startVisualization() {
    console.log('Starting visualization');
    this.isPlaying = true;
    if (this.audio.context && this.audio.context.state === 'suspended') {
      console.log('Resuming audio context for visualization');
      this.audio.context.resume();
    }
  }
  
  stopVisualization() {
    console.log('Stopping visualization');
    this.isPlaying = false;
  }

  startListeningTimer() {
    this.timers.listeningSeconds = 0;
    this.updateListeningStatus("Listening");
    this.timers.listening = setInterval(() => {
      if (this.state.isListening && !this.state.isPaused && !this.state.isAgentSpeaking) {
        this.timers.listeningSeconds++;
        this.updateTimerDisplay();
      }
    }, 1000);
  }

  stopListeningTimer() {
    if (this.timers.listening) {
      clearInterval(this.timers.listening);
      this.timers.listening = null;
    }
  }

  updateListeningStatus(status) {
    if (this.elements.voiceAction) {
      this.elements.voiceAction.textContent = status;
    }
  }

  updateTimerDisplay() {
    if (this.elements.timerElement) {
      this.elements.timerElement.textContent = this.timers.listeningSeconds;
    }
  }

  async recordAudioDynamically() {
    if (this.audio.mediaRecorder && this.audio.mediaRecorder.state === "recording") {
      console.log('Recording already in progress');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audio.mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm; codecs=opus' });

      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      let silenceStart = null;
      let isSpeaking = false;
      const silenceThreshold = 15;
      const pauseDuration = 1000;

      const detectSpeech = () => {
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((sum, value) => sum + value, 0) / bufferLength;

        if (average > silenceThreshold) {
          if (!isSpeaking) {
            isSpeaking = true;
            this.updateListeningStatus("Listening (Active)");
          }
          silenceStart = null;
        } else {
          if (isSpeaking) {
            if (!silenceStart) {
              silenceStart = Date.now();
            } else if (Date.now() - silenceStart > pauseDuration) {
              this.stopListening();
              return;
            }
          }
        }

        if (this.state.isListening) {
          requestAnimationFrame(detectSpeech);
        }
      };

      detectSpeech();

      this.audio.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audio.chunks.push(event.data);
        }
      };

      this.audio.mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(this.audio.chunks, { type: 'audio/webm; codecs=opus' });
        if (audioBlob.size > 0) {
          const audioBase64 = await this.blobToBase64(audioBlob);
          if (audioBase64) {
            await this.processSpeechToText(audioBase64);
          }
        } else {
          this.startListening();
        }
      };

      this.audio.mediaRecorder.start(1000);

      setTimeout(() => {
        if (this.audio.mediaRecorder && this.audio.mediaRecorder.state === "recording") {
          this.stopListening();
        }
      }, this.config.maxDuration);
    } catch (error) {
      console.error('Error starting audio recording:', error);
    }
  }

  blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async pollForTranscriptionResult(operationId) {
    const maxAttempts = 30;
    const pollingInterval = 2000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await fetch(`https://us-central1-pa-sha.cloudfunctions.net/getTranscriptionResult?operationId=${operationId}`);

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();

        if (result.status === 'completed') {
          console.log('Transcription completed:', result.transcription);
          this.handleTranscriptionResult(result.transcription);
          return;
        } else if (result.status === 'failed') {
          throw new Error('Transcription failed');
        }

        await new Promise(resolve => setTimeout(resolve, pollingInterval));
      } catch (error) {
        console.error('Error polling for transcription result:', error);
      }
    }

    console.error('Max polling attempts reached without completion');
    this.appendMessage('bot', 'Sorry, transcription is taking longer than expected. Please try again.');
    this.startListening();
  }

  handleTranscriptionResult(transcription) {
    if (transcription && transcription.trim() !== '') {
      console.log('Transcription received:', transcription);
      this.conversation.speechSegments.push(transcription);
      this.conversation.wordCount += transcription.split(/\s+/).length;
  
      if (this.conversation.wordCount >= this.config.interruptionThreshold) {
        this.processFullUserInput();
      } else {
        this.startListening();
      }
    } else {
      console.log('No speech detected');
      
      // Only show the message if we're not in a mode transition
      if (!this.state.isModeSwitching) {
        this.appendMessage('bot', "System paused. Click the 'Continue' button.");
      }
      
      this.updateListeningStatus("Waiting");
      this.state.isPaused = true;
      this.updateButtonStates();
    }
  }

  async processSpeechToText(audioContent, retries = 3) {
    try {
      this.updateListeningStatus("Processing speech...");
      console.log('Sending audio for asynchronous transcription...');
      console.log('Audio content length:', audioContent.length);

      const response = await fetch('https://us-central1-pa-sha.cloudfunctions.net/agent_async_stt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: { audioContent } }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Async Speech-to-text error response:', errorText);
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }

      const data = await response.json();
      console.log('Async Speech-to-text response:', data);

      const { operationId } = data;
      if (!operationId) {
        throw new Error('No operation ID received for async speech-to-text task');
      }

      this.updateListeningStatus("Transcribing...");
      await this.pollForTranscriptionResult(operationId);
    } catch (error) {
      console.error('Detailed error in async speech-to-text conversion:', error);
      if (retries > 0) {
        console.log(`Retrying speech-to-text conversion. Attempts left: ${retries - 1}`);
        await this.processSpeechToText(audioContent, retries - 1);
      } else {
        this.appendMessage('bot', 'I\'m having trouble understanding. Could you please try again?');
        this.startListening();
      }
    }
  }

  async processFullUserInput() {
    const now = Date.now();
    if (now - this.conversation.lastConversationTime < this.config.conversationCooldown) {
      console.log('Conversation cooldown, waiting before processing');
      await new Promise(resolve => setTimeout(resolve, this.config.conversationCooldown - (now - this.conversation.lastConversationTime)));
    }

    const fullInput = this.conversation.speechSegments.join(' ');
    if (fullInput.trim() === '') {
      console.log('No speech detected');
      this.appendMessage('bot', 'I didn\'t catch that. Could you please repeat?');
      this.startListening();
      return;
    }

    this.appendMessage('user', fullInput);
    this.conversation.speechSegments = [];
    this.conversation.wordCount = 0;

    await this.processUserInput(fullInput);
    this.conversation.lastConversationTime = Date.now();
  }

  async processUserInput(input) {
    this.updateListeningStatus("Thinking...");
    if (this.elements.loader) {
      this.elements.loader.style.display = "block";
    }
  
    try {
      if (!input || input.trim() === '') {
        throw new Error('No input provided');
      }
  
      const response = await this.getChatCompletion(input);
      console.log('Bot response:', response);
  
      if (response.meetings && response.meetings.length > 0) {
        // If meetings data is available, create and append the card
        const cardContent = this.createActionItemsCard(response.meetings);
        this.appendMessage('bot', cardContent);
      }
  
      // Always append the text response
      this.appendMessage('bot', response.text);
  
      await new Promise(resolve => setTimeout(resolve, this.config.responseDelay));
  
      const cleanedResponse = this.cleanTextForSpeech(response.text);
      await this.playAudioResponse(cleanedResponse);
    } catch (error) {
      console.error('Error processing user input:', error);
      this.appendMessage('bot', 'Sorry, I encountered an error. Please try again.');
    } finally {
      if (this.elements.loader) {
        this.elements.loader.style.display = "none";
      }
    }
  }

  setChatCompletionEndpoint(endpoint) {
    this.chatCompletionEndpoint = endpoint;
  }

  async getChatCompletion(prompt, retries = 3) {
    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
      throw new Error('Invalid prompt provided');
    }
  
    if (!this.sessionId) {
      this.sessionId = 'session_' + Math.random().toString(36).substr(2, 9);
    }
  
    try {
      const now = Date.now();
      const timeSinceLastRequest = now - this.conversation.lastRequestTime;
      
      if (timeSinceLastRequest < this.config.minTimeBetweenRequests) {
        const delay = this.config.minTimeBetweenRequests - timeSinceLastRequest;
        console.log(`Rate limiting: Waiting ${delay}ms before next request`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
  
      console.log('Sending chat completion request with prompt:', prompt);
  
      const response = await fetch(this.chatCompletionEndpoint, { // Use dynamic endpoint
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          prompt: prompt,
          sessionId: this.sessionId
        }),
      });
  
      this.conversation.lastRequestTime = Date.now();
  
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response:', errorText);
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }
  
      const data = await response.json();
      console.log('Parsed chat completion response:', data);
  
      if (!data.response || (!data.response.text && !data.response.parts)) {
        throw new Error('Invalid response structure from server');
      }
  
      // Update conversation history
      this.conversation.history.push(
        { role: "user", content: prompt },
        { role: "assistant", content: data.response.text || data.response.parts[0].text }
      );
  
      return data.response;
    } catch (error) {
      console.error('Error getting chat completion:', error);
      if (retries > 0) {
        console.log(`Retrying chat completion. Attempts left: ${retries - 1}`);
        await new Promise(resolve => setTimeout(resolve, this.config.minTimeBetweenRequests));
        return this.getChatCompletion(prompt, retries - 1);
      }
      throw error;
    }
  }

  cleanTextForSpeech(text) {
    text = text.replace(/\*\*(.*?)\*\*/g, '$1')
               .replace(/\*(.*?)\*/g, '$1')
               .replace(/^#+\s*/gm, '')
               .replace(/`(.*?)`/g, '$1')
               .replace(/^\s*[-*+]\s/gm, '')
               .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
               .replace(/\s+/g, ' ').trim();
    return text;
  }

  async playAudioResponse(text) {
    this.state.isAgentSpeaking = true;
    this.stopListening();
    this.updateListeningStatus("Agent Speaking");
    this.updateButtonStates();
  
    // Start speech recognition for interruption
    this.startSpeechRecognition();
  
    try {
      console.log('Processing text for speech:', text);
  
      // Split text into chunks of maximum 1800 characters (leaving some buffer)
      const chunks = this.splitTextIntoChunks(text, 1800);
  
      for (let chunk of chunks) {
        if (!this.state.isAgentSpeaking) {
          console.log('Speech interrupted, stopping playback');
          break;
        }
  
        console.log('Sending chunk to text-to-speech:', chunk);
  
        const response = await fetch('https://us-central1-pa-sha.cloudfunctions.net/textToSpeech', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ data: { text: chunk } }),
        });
  
        if (!response.ok) {
          const errorText = await response.text();
          console.error('Text-to-speech error response:', errorText);
          throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }
  
        console.log('Text-to-speech response received');
  
        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
  
        const audio = new Audio(audioUrl);
        this.elements.audioPlayer = audio;
  
        console.log('Attaching visualization...');
        this.attachVisualization(audio);
  
        audio.addEventListener('play', () => {
          console.log('Audio playback started');
          this.handleAudioPlay();
          this.startVisualization();
        });
  
        audio.addEventListener('pause', () => {
          console.log('Audio playback paused');
          this.handleAudioPause();
          this.stopVisualization();
        });
  
        audio.addEventListener('ended', () => {
          console.log('Audio playback ended');
          URL.revokeObjectURL(audioUrl);
        });
  
        if (this.audio.context && this.audio.context.state === 'suspended') {
          console.log('Resuming audio context...');
          await this.audio.context.resume();
        }
  
        console.log('Attempting to play audio chunk');
        await audio.play();
        console.log('Audio chunk playback completed');
  
        // Wait for the audio to finish playing before processing the next chunk
        await new Promise(resolve => {
          const endedListener = () => {
            resolve();
            audio.removeEventListener('ended', endedListener);
          };
          audio.addEventListener('ended', endedListener);
          // Also resolve if speech is interrupted
          const checkInterruption = setInterval(() => {
            if (!this.state.isAgentSpeaking) {
              clearInterval(checkInterruption);
              resolve();
            }
          }, 100);
        });
      }
  
    } catch (error) {
      console.error('Error in playAudioResponse:', error);
      this.appendMessage('bot', 'Sorry, I encountered an error while trying to speak. Please try again.');
    } finally {
      this.handleAudioEnded();
      if (this.recognition) {
        this.recognition.stop();
      }
    }
  }

  // Add this method to your class
  splitTextIntoChunks(text, maxLength) {
    const chunks = [];
    let currentChunk = "";
  
    // Split the text into sentences
    const sentences = text.match(/[^.!?]+[.!?]+|\s+/g) || [];
  
    for (let sentence of sentences) {
      if (currentChunk.length + sentence.length <= maxLength) {
        currentChunk += sentence;
      } else {
        if (currentChunk) chunks.push(currentChunk.trim());
        currentChunk = sentence;
      }
    }
  
    if (currentChunk) chunks.push(currentChunk.trim());
  
    return chunks;
  }

  appendMessage(role, content) {
    if (!this.elements.chatMessages) {
      console.error('Chat messages container not found. Message not appended:', { role, content });
      return;
    }
  
    const msgDiv = document.createElement("div");
    msgDiv.classList.add("msg", role === "user" ? "right-msg" : "left-msg");
  
    const msgImg = document.createElement("div");
    msgImg.classList.add("msg-img");
    msgImg.style.backgroundImage = `url('assets/img/ux_icons/${role}_icon.png')`;
  
    const msgBubble = document.createElement("div");
    msgBubble.classList.add("msg-bubble");
  
    const msgInfo = document.createElement("div");
    msgInfo.classList.add("msg-info");
  
    const msgInfoName = document.createElement("div");
    msgInfoName.classList.add("msg-info-name");
    msgInfoName.textContent = role === "user" ? "You" : "Pasha";
  
    const msgText = document.createElement("div");
    msgText.classList.add("msg-text");
  
    if (content instanceof HTMLElement) {
      // If content is an HTML element (like our card), append it directly
      msgText.appendChild(content);
    } else if (typeof content === 'object' && content.text) {
      // If content is an object with a text property (from backend response)
      msgText.innerHTML = this.formatText(content.text);
      
      // If there are meetings, create and append the card
      if (content.meetings && content.meetings.length > 0) {
        const cardContent = this.createActionItemsCard(content.meetings);
        msgText.appendChild(cardContent);
      }
    } else if (typeof content === 'string') {
      // For simple string messages
      msgText.innerHTML = this.formatText(content);
    } else {
      console.error('Unexpected content type:', content);
      msgText.textContent = "Error: Unexpected content type";
    }
  
    msgInfo.appendChild(msgInfoName);
    msgBubble.appendChild(msgInfo);
    msgBubble.appendChild(msgText);
    msgDiv.appendChild(msgImg);
    msgDiv.appendChild(msgBubble);
  
    this.elements.chatMessages.appendChild(msgDiv);
    this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
  }

  createActionItemsCard(meetings) {
    const cardDiv = document.createElement("div");
    cardDiv.classList.add("card", "mb-3");
  
    meetings.forEach((meeting, meetingIndex) => {
      console.log('Received meeting data:', meeting);
      console.log('Date value:', meeting.date);
      console.log('Meeting date object structure:', JSON.stringify(meeting.date, null, 2));
  
      const cardBody = document.createElement("div");
      cardBody.classList.add("card-body");
  
      const title = document.createElement("h5");
      title.classList.add("card-title");
      title.textContent = meeting.title;
  
      const host = document.createElement("p");
      host.classList.add("card-text", "mb-1");
      host.innerHTML = `<strong>Host:</strong> ${meeting.meetingHost || 'Unknown'}`;
  
      const attendees = document.createElement("p");
      attendees.classList.add("card-text", "mb-1");
      attendees.innerHTML = `<strong>Attendees:</strong> ${meeting.meetingAttendees ? meeting.meetingAttendees.join(', ') : 'None listed'}`;
  
      const date = document.createElement("p");
      date.classList.add("card-text", "mb-1");
  
      let dateString = 'Date not available';
      if (meeting.date) {
        if (typeof meeting.date === 'string') {
          dateString = meeting.date;
        } else if (meeting.date._seconds) {
          // Firestore Timestamp object
          const meetingDate = new Date(meeting.date._seconds * 1000);
          dateString = meetingDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
        } else if (!isNaN(Date.parse(meeting.date))) {
          const meetingDate = new Date(meeting.date);
          dateString = meetingDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
        } else {
          console.error('Unrecognized date format:', meeting.date);
          dateString = 'Unrecognized Date Format';
        }
      }
      date.innerHTML = `<strong>Date:</strong> ${dateString}`;
  
      const timeInfo = document.createElement("p");
      timeInfo.classList.add("card-text", "mb-1");
      timeInfo.innerHTML = `<strong>Start:</strong> ${meeting.startTime}<br><strong>End:</strong> ${meeting.endTime}`;
  
      const duration = document.createElement("p");
      duration.classList.add("card-text", "mb-2", "text-muted");
      duration.textContent = `Duration: ${meeting.duration}`;
  
      cardBody.appendChild(title);
      cardBody.appendChild(host);
      cardBody.appendChild(attendees);
      cardBody.appendChild(date);
      cardBody.appendChild(timeInfo);
      cardBody.appendChild(duration);
  
      const accordion = document.createElement("div");
      accordion.classList.add("accordion", "mt-3");
      accordion.id = `accordionMeeting-${meetingIndex}`;
  
      const actionItemsAccordion = this.createAccordionItem(
        `heading-actionItems-${meetingIndex}`,
        `collapse-actionItems-${meetingIndex}`,
        "Action Items",
        this.createActionItemsList(meeting.actionItems),
        `accordionMeeting-${meetingIndex}`
      );
  
      const summaryAccordion = this.createAccordionItem(
        `heading-summary-${meetingIndex}`,
        `collapse-summary-${meetingIndex}`,
        "Summary",
        meeting.summary,
        `accordionMeeting-${meetingIndex}`
      );
  
      accordion.appendChild(actionItemsAccordion);
      accordion.appendChild(summaryAccordion);
  
      cardBody.appendChild(accordion);
      cardDiv.appendChild(cardBody);
  
      if (meetingIndex < meetings.length - 1) {
        const hr = document.createElement("hr");
        hr.classList.add("my-4");
        cardDiv.appendChild(hr);
      }
    });
  
    return cardDiv;
  }
  
  createAccordionItem(headingId, collapseId, title, content, parentId) {
    const accordionItem = document.createElement("div");
    accordionItem.classList.add("accordion-item");
  
    const header = document.createElement("h2");
    header.classList.add("accordion-header");
    header.id = headingId;
  
    const button = document.createElement("button");
    button.classList.add("accordion-button", "collapsed");
    button.type = "button";
    button.setAttribute("data-bs-toggle", "collapse");
    button.setAttribute("data-bs-target", `#${collapseId}`);
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-controls", collapseId);
    button.textContent = title;
  
    const collapseDiv = document.createElement("div");
    collapseDiv.id = collapseId;
    collapseDiv.classList.add("accordion-collapse", "collapse");
    collapseDiv.setAttribute("aria-labelledby", headingId);
    collapseDiv.setAttribute("data-bs-parent", `#${parentId}`);
  
    const accordionBody = document.createElement("div");
    accordionBody.classList.add("accordion-body");
  
    if (typeof content === 'string') {
      accordionBody.innerHTML = this.formatText(content);
    } else {
      accordionBody.appendChild(content);
    }
  
    collapseDiv.appendChild(accordionBody);
    header.appendChild(button);
    accordionItem.appendChild(header);
    accordionItem.appendChild(collapseDiv);
  
    return accordionItem;
  }
  
  createActionItemsList(actionItems) {
    const listGroup = document.createElement("div");
    listGroup.classList.add("list-group");
  
    actionItems.forEach((item, index) => {
      const listItem = document.createElement("div");
      listItem.classList.add("list-group-item");
  
      const header = document.createElement("div");
      header.classList.add("d-flex", "w-100", "justify-content-between", "align-items-center", "mb-2");
  
      const title = document.createElement("h5");
      title.classList.add("mb-1");
      title.textContent = `Action Item ${index + 1}`;
  
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.classList.add("form-check-input");
      checkbox.id = `actionItem-${index}`;
  
      header.appendChild(title);
      header.appendChild(checkbox);
  
      const content = document.createElement("div");
      content.innerHTML = `
        <p><strong>Who:</strong> ${this.formatText(item.who)}</p>
        <p><strong>What:</strong> ${this.formatText(item.what)}</p>
        <p><strong>When:</strong> ${this.formatText(item.when)}</p>
        <p><strong>Status:</strong> ${this.formatText(item.status)}</p>
      `;
  
      listItem.appendChild(header);
      listItem.appendChild(content);
      listGroup.appendChild(listItem);
    });
  
    return listGroup;
  }
  
  formatText(text) {
    if (!text) return 'N/A';
    
    // Remove double asterisks
    text = text.replace(/\*\*/g, '');
    
    // Convert single asterisks to <em> for italics
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Convert underscores to <strong> for bold
    text = text.replace(/_(.*?)_/g, '<strong>$1</strong>');
    
    // Convert newlines to <br> tags
    text = text.replace(/\n/g, '<br>');
    
    return text;
  }

  updateButtonStates() {
    const { isAgentSpeaking, isListening, isPaused } = this.state;
    const { pauseButton, continueButton, audioPlayer } = this.elements;

    if (pauseButton) {
      pauseButton.disabled = !isAgentSpeaking && !isListening;
      pauseButton.textContent = this.getPauseButtonText(isAgentSpeaking, isPaused, audioPlayer.paused);
    }

    if (continueButton) {
      continueButton.disabled = isListening;
      continueButton.textContent = this.getContinueButtonText(isAgentSpeaking, isListening);
    }

    this.updateListeningStatus();
  }

  getPauseButtonText(isAgentSpeaking, isPaused, isAudioPaused) {
    if (isAgentSpeaking) {
      return isAudioPaused ? "Resume" : "Pause";
    }
    return isPaused ? "Resume" : "Pause";
  }

  getContinueButtonText(isAgentSpeaking, isListening) {
    if (isAgentSpeaking) {
      return "Ask New";
    }
    return isListening ? "Listening..." : "Continue";
  }

  updateListeningStatus() {
    if (!this.elements.voiceAction) return;

    if (this.state.isAgentSpeaking) {
      this.elements.voiceAction.textContent = "Agent Speaking";
    } else if (this.state.isListening) {
      this.elements.voiceAction.textContent = "Listening (Active)";
    } else if (this.state.isPaused) {
      this.elements.voiceAction.textContent = "Paused";
    } else {
      this.elements.voiceAction.textContent = "Waiting";
    }
  }

  togglePause() {
    if (this.state.isAgentSpeaking) {
      if (this.elements.audioPlayer.paused) {
        this.elements.audioPlayer.play();
      } else {
        this.elements.audioPlayer.pause();
      }
    } else {
      this.state.isPaused = !this.state.isPaused;
      if (this.state.isPaused) {
        this.stopListening();
      } else {
        this.startListening();
      }
    }
    this.updateButtonStates();
  }

  async resumeConversation() {
    if (this.state.isAgentSpeaking) {
      await this.switchToListeningMode();
    } else if (!this.state.isListening) {
      this.state.isPaused = false;
      await this.startListening();
    }
    this.updateButtonStates();
  }

  async switchToListeningMode() {
    this.state.isAgentSpeaking = false;
    this.state.isPaused = false;
    if (this.elements.audioPlayer) {
      this.elements.audioPlayer.pause();
    }
    if (this.recognition) {
      this.recognition.stop();
    }
    await this.startListening();
  }

  handleAudioPlay() {
    this.state.isAgentSpeaking = true;
    this.stopListeningTimer();
    this.startVisualization();
    this.updateButtonStates();
  }

  handleAudioPause() {
    this.stopVisualization();
    this.updateButtonStates();
  }

  handleAudioEnded() {
    this.state.isAgentSpeaking = false;
    this.stopVisualization();
    this.switchToListeningMode();
    this.updateButtonStates();
  }

  async startListening() {
    if (!this.state.isListening && !this.state.isPaused && !this.state.isAgentSpeaking) {
      this.state.isListening = true;
      this.audio.chunks = [];
      this.startListeningTimer();
      this.updateButtonStates();
      await this.recordAudioDynamically();
    }
  }

  stopListening() {
    if (this.state.isListening) {
      this.state.isListening = false;
      this.stopListeningTimer();
      if (this.audio.mediaRecorder && this.audio.mediaRecorder.state === "recording") {
        this.audio.mediaRecorder.stop();
      }
      this.updateButtonStates();
    }
  }

  // New Feature buttons
  async handleModeButtonClick(mode) {
    let message = '';
    
    // Set the mode switching flag
    this.state.isModeSwitching = true;
  
    switch(mode) {
      case 'ask':
        message = "Ok, feel free to ask me anything. I'm listening!";
        break;
      case 'meeting':
        message = "Ok, activating Meeting Mode.";
        break;
      case 'news':
        message = "Ok, fetching your news feed. One moment";
        break;
      case 'messenger':
        message = "Ok, let's send some messages. Would you like to email or text someone?";
        break;
      case 'scheduler':
        message = "Ok, let's schedule a meeting. Go ahead and give me the meeting details";
        break;
    }
  
    // Stop current listening if active
    if (this.state.isListening) {
      this.stopListening();
    }
  
    // Append and speak the message
    this.appendMessage('bot', message);
    await this.playAudioResponse(message);
  
    // Handle specific mode actions
    if (mode === 'ask') {
      await this.startListening();
    } else {
      this.state.isPaused = true;
      this.updateButtonStates();
      
      // Handle meeting mode redirect
      if (mode === 'meeting') {
        setTimeout(() => {
          window.location.href = 'meeting.html';
        }, 2000); // 2 second delay before redirect
      }
    }
  
    // Clear the mode switching flag after a short delay
    setTimeout(() => {
      this.state.isModeSwitching = false;
    }, 2000);
  }

setupModeButtons() {
  const buttonIds = {
    'ask': 'askAnythingBtn',
    'meeting': 'meetingModeBtn',
    'news': 'newsBtn',
    'messenger': 'messengerBtn',
    'scheduler': 'schedulerBtn'
  };

  for (const [mode, id] of Object.entries(buttonIds)) {
    const button = document.getElementById(id);
    if (button) {
      button.addEventListener('click', () => this.handleModeButtonClick(mode));
    } else {
      console.warn(`Button with id ${id} not found`);
    }
  }
}
}

class CustomConsole {
  constructor() {
      this.consoleElement = document.getElementById('customConsole');
      this.maxLogs = 100; // Maximum number of logs to keep
      this.logs = [];
      
      // Override console.log and other methods
      this.setupConsoleOverride();
  }

  setupConsoleOverride() {
      const originalConsole = {
          log: console.log,
          error: console.error,
          warn: console.warn,
          info: console.info
      };

      // Override console methods
      console.log = (...args) => {
          originalConsole.log.apply(console, args);
          this.addLog('log', args);
      };

      console.error = (...args) => {
          originalConsole.error.apply(console, args);
          this.addLog('error', args);
      };

      console.warn = (...args) => {
          originalConsole.warn.apply(console, args);
          this.addLog('warn', args);
      };

      console.info = (...args) => {
          originalConsole.info.apply(console, args);
          this.addLog('info', args);
      };
  }

  formatTime() {
      const now = new Date();
      return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
  }

  formatValue(value) {
      if (typeof value === 'object') {
          try {
              return JSON.stringify(value);
          } catch (e) {
              return value.toString();
          }
      }
      return value;
  }

  addLog(type, args) {
      const formattedArgs = args.map(arg => this.formatValue(arg)).join(' ');
      const logEntry = {
          time: this.formatTime(),
          type: type,
          content: formattedArgs
      };

      this.logs.push(logEntry);
      if (this.logs.length > this.maxLogs) {
          this.logs.shift();
      }

      this.render();
  }

  render() {
      if (!this.consoleElement) return;

      const html = this.logs.map(log => `
          <div class="console-log">
              <span class="console-time">[${log.time}]</span>
              <span class="console-content">${log.content}</span>
          </div>
      `).join('');

      this.consoleElement.innerHTML = html;
      this.consoleElement.scrollTop = this.consoleElement.scrollHeight;
  }

  clear() {
      this.logs = [];
      this.render();
  }
}
