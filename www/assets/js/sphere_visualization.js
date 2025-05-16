class SphereVisualization {
  constructor(canvasElement) {
    this.canvasElement = canvasElement;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.sphere = null;
    this.halo = null;
    this.audioWaves = null;
    this.spinSpeed = 0.02;
    this.textures = [
      'https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg',
      'https://threejs.org/examples/textures/planets/jupiter_1k.jpg',
      'https://threejs.org/examples/textures/planets/mars_1k_color.jpg',
      'https://pa-sha.web.app/assets/img/pasha_sphere.jpg'
    ];
    this.currentTextureIndex = 3;
    this.isPlaying = false;
    this.analyser = null;
    this.dataArray = null;
    this.audioContext = null;
    this.audioSource = null;
  }

  init() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvasElement, alpha: true });

    const width = this.canvasElement.clientWidth || 240;
    const height = this.canvasElement.clientHeight || 240;
    this.renderer.setSize(width, height);
    this.canvasElement.style.width = `${width}px`;
    this.canvasElement.style.height = `${height}px`;

    this.createSphere();
    this.createHalo();
    this.createAudioWaves();
    this.createLight();

    this.camera.position.z = 5;

    this.updateAspectRatio();
    this.animate();
  }

  createSphere() {
    const geometry = new THREE.SphereGeometry(0.8, 64, 64);
    const texture = new THREE.TextureLoader().load(this.textures[this.currentTextureIndex]);
    const material = new THREE.MeshPhongMaterial({ map: texture });
    this.sphere = new THREE.Mesh(geometry, material);
    this.scene.add(this.sphere);
  }

  createHalo() {
    const haloGeometry = new THREE.RingGeometry(0.9, 1, 64);
    const haloMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff94, // Updated color with alpha
      side: THREE.DoubleSide,
      transparent: true, 
      // opacity: 0.3  // No longer needed since alpha is in the color
    });
    this.halo = new THREE.Mesh(haloGeometry, haloMaterial);
    this.scene.add(this.halo);
  }
  
  createAudioWaves() {
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
      const material = new THREE.LineBasicMaterial({ 
        color: 0xffffff94, // Updated color with alpha
        transparent: true, 
        // opacity: 0.5  // No longer needed since alpha is in the color
      });
      const ellipse = new THREE.Line(geometry, material);
      this.audioWaves.add(ellipse);
    }
    this.scene.add(this.audioWaves);
  }

  createLight() {
    const light = new THREE.PointLight(0xFFFFFF, 1, 100);
    light.position.set(10, 10, 10);
    this.scene.add(light);
  }

  updateAspectRatio() {
    const width = this.canvasElement.clientWidth;
    const height = this.canvasElement.clientHeight;
    const aspect = width / height;

    if (width > height) {
      this.camera.left = -aspect;
      this.camera.right = aspect;
      this.camera.top = 1;
      this.camera.bottom = -1;
    } else {
      this.camera.left = -1;
      this.camera.right = 1;
      this.camera.top = 1 / aspect;
      this.camera.bottom = -1 / aspect;
    }

    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.render();
  }

  render() {
    if (!this.renderer || !this.scene || !this.camera) return;

    this.sphere.rotation.y += this.spinSpeed;
    this.sphere.rotation.x += this.spinSpeed * 0.4;

    this.halo.lookAt(this.camera.position);

    if (this.isPlaying && this.analyser && this.dataArray) {
      this.analyser.getByteTimeDomainData(this.dataArray);
      this.updateAudioWaves();
    } else {
      this.resetAudioWaves();
    }

    this.audioWaves.rotation.z += this.spinSpeed * 0.5;

    this.renderer.render(this.scene, this.camera);
  }

  updateAudioWaves() {
    this.audioWaves.children.forEach((wave, index) => {
      const value = this.dataArray[index % this.dataArray.length] / 128.0;
      const scale = 1 + Math.abs(value - 1) * 0.3;
      wave.scale.set(scale, scale, 1);
      wave.material.opacity = Math.min(Math.abs(value - 1) + 0.2, 1);
    });
  }

  resetAudioWaves() {
    this.audioWaves.children.forEach(wave => {
      wave.scale.set(1, 1, 1);
      wave.material.opacity = 0.1;
    });
  }

  changeTexture(index) {
    if (index >= 0 && index < this.textures.length) {
      const newTexture = new THREE.TextureLoader().load(this.textures[index]);
      this.sphere.material.map = newTexture;
      this.sphere.material.needsUpdate = true;
      this.currentTextureIndex = index;
    }
  }

  setSpinSpeed(speed) {
    this.spinSpeed = speed;
  }

  resize() {
    this.updateAspectRatio();
  }

  initAudioContext() {
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    const bufferLength = this.analyser.frequencyBinCount;
    this.dataArray = new Uint8Array(bufferLength);
  }

  attachAudio(audioElement) {
    if (!this.audioContext) {
      this.initAudioContext();
    }

    if (this.audioSource) {
      this.audioSource.disconnect();
    }

    this.audioSource = this.audioContext.createMediaElementSource(audioElement);
    this.audioSource.connect(this.analyser);
    this.analyser.connect(this.audioContext.destination);

    audioElement.addEventListener('play', () => this.startVisualization());
    audioElement.addEventListener('pause', () => this.stopVisualization());
    audioElement.addEventListener('ended', () => this.stopVisualization());
  }

  startVisualization() {
    this.isPlaying = true;
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  stopVisualization() {
    this.isPlaying = false;
  }

  dispose() {
    if (this.renderer) {
      this.renderer.dispose();
    }
    // Dispose of any other Three.js objects if necessary
    if (this.audioContext) {
      this.audioContext.close().catch(console.error);
    }
  }
}