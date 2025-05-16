//agent_next.js file
const wavePath = document.getElementById('wavePath');
const waveStates = [
  { amplitude: 10, frequency: 0.036, isChaotic: true },
  { amplitude: 20, frequency: 0.048, isChaotic: true },
  { amplitude: 40, frequency: 0.06, isChaotic: true },
  { amplitude: 5, frequency: 0.04, isChaotic: false },
  { amplitude: 10, frequency: 0.06, isChaotic: false },
  { amplitude: 15, frequency: 0.08, isChaotic: false }
];
let currentWaveState = waveStates[0];
let targetWaveState = currentWaveState;
let phase = 0;
let transitionStartTime = 0;
const transitionDuration = 180; // Transition duration in milliseconds

function generateWave(amplitude, frequency, isChaotic) {
  const pathData = [];
  const step = 1;
  for (let x = 0; x <= 200; x += step) {
    let y;
    if (isChaotic) {
      y = 30 + (Math.random() - 0.5) * amplitude;
    } else {
      y = 30 + amplitude * Math.sin(frequency * x + phase);
    }
    pathData.push({ x, y });
  }
  return pathData;
}

function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function updateWavePath(timestamp) {
  if (!transitionStartTime) {
    transitionStartTime = timestamp;
  }

  const elapsed = timestamp - transitionStartTime;
  const progress = Math.min(elapsed / transitionDuration, 1);
  const easing = easeInOutQuad(progress);

  const amplitude = currentWaveState.amplitude + (targetWaveState.amplitude - currentWaveState.amplitude) * easing;
  const frequency = currentWaveState.frequency + (targetWaveState.frequency - currentWaveState.frequency) * easing;
  const isChaotic = progress < 1 ? currentWaveState.isChaotic : targetWaveState.isChaotic;

  const wavePoints = generateWave(amplitude, frequency, isChaotic);
  let pathData = 'M' + wavePoints[0].x + ',' + wavePoints[0].y;
  for (let i = 1; i < wavePoints.length; i++) {
    const point = wavePoints[i];
    const prevPoint = wavePoints[i - 1];
    const midX = (point.x + prevPoint.x) / 2;
    const midY = (point.y + prevPoint.y) / 2;
    pathData += ` Q ${prevPoint.x},${prevPoint.y} ${midX},${midY}`;
  }
  wavePath.setAttribute('d', pathData);

  phase += 0.1;

  if (progress === 1) {
    currentWaveState = targetWaveState;
    transitionStartTime = timestamp;

    let nextStateOptions = waveStates.filter(state => state !== currentWaveState);
    targetWaveState = nextStateOptions[Math.floor(Math.random() * nextStateOptions.length)];
  }

  requestAnimationFrame(updateWavePath);
}

requestAnimationFrame(updateWavePath);