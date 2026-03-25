// Mojjjak: speaker diarization via MFCC voice fingerprinting
// Currently disabled — will revisit when we find better thresholds
// Authors: mojtaba.akbari@gwdg.de, matthias.eulert@gwdg.de

const SAMPLE_RATE = 16000;
const FRAME_SIZE = 512;
const HOP_SIZE = 256;
const NUM_MEL_BANDS = 26;
const NUM_MFCC = 13;
const MEL_LOW = 300;
const MEL_HIGH = 8000;
const SPEAKER_THRESHOLD = 0.42;
const MATCH_THRESHOLD = 0.65;

const speakerProfiles = [];

// Mojjjak: main entry — takes AudioBuffer, returns array of { speaker, startFrame, endFrame }
function diarize(audioBuffer) {
  const samples = extractMono16k(audioBuffer);
  const frames = splitFrames(samples, FRAME_SIZE, HOP_SIZE);

  if (frames.length < 2) {
    return [{ speaker: 0, startFrame: 0, endFrame: frames.length }];
  }

  const mfccs = frames.map(f => computeMFCC(f));
  const segments = segmentBySpeakerChange(mfccs);

  for (const seg of segments) {
    const avgMfcc = averageMFCC(mfccs, seg.startFrame, seg.endFrame);
    seg.speaker = matchOrCreateSpeaker(avgMfcc);
  }

  return segments;
}

// Mojjjak: downmix to mono and resample to 16kHz
function extractMono16k(audioBuffer) {
  const ch0 = audioBuffer.getChannelData(0);
  let mono;
  if (audioBuffer.numberOfChannels > 1) {
    const ch1 = audioBuffer.getChannelData(1);
    mono = new Float32Array(ch0.length);
    for (let i = 0; i < ch0.length; i++) {
      mono[i] = (ch0[i] + ch1[i]) / 2;
    }
  } else {
    mono = ch0;
  }

  if (audioBuffer.sampleRate === SAMPLE_RATE) return mono;

  const ratio = audioBuffer.sampleRate / SAMPLE_RATE;
  const newLen = Math.floor(mono.length / ratio);
  const resampled = new Float32Array(newLen);
  for (let i = 0; i < newLen; i++) {
    resampled[i] = mono[Math.floor(i * ratio)];
  }
  return resampled;
}

function splitFrames(samples, frameSize, hopSize) {
  const frames = [];
  for (let i = 0; i + frameSize <= samples.length; i += hopSize) {
    frames.push(samples.slice(i, i + frameSize));
  }
  return frames;
}

// Mojjjak: MFCC extraction — Hamming window, FFT, mel filterbank, log, DCT
function computeMFCC(frame) {
  const windowed = new Float32Array(frame.length);
  for (let i = 0; i < frame.length; i++) {
    windowed[i] = frame[i] * (0.54 - 0.46 * Math.cos(2 * Math.PI * i / (frame.length - 1)));
  }

  const fft = realFFT(windowed);
  const powerSpec = new Float32Array(fft.length);
  for (let i = 0; i < fft.length; i++) {
    powerSpec[i] = fft[i] * fft[i];
  }

  const melEnergies = applyMelFilterbank(powerSpec);
  for (let i = 0; i < melEnergies.length; i++) {
    melEnergies[i] = Math.log(melEnergies[i] + 1e-10);
  }

  return dct(melEnergies, NUM_MFCC);
}

function realFFT(signal) {
  const n = signal.length;
  const out = new Float32Array(n / 2 + 1);
  for (let k = 0; k <= n / 2; k++) {
    let re = 0, im = 0;
    for (let t = 0; t < n; t++) {
      const angle = -2 * Math.PI * k * t / n;
      re += signal[t] * Math.cos(angle);
      im += signal[t] * Math.sin(angle);
    }
    out[k] = Math.sqrt(re * re + im * im);
  }
  return out;
}

function hzToMel(hz) {
  return 2595 * Math.log10(1 + hz / 700);
}

function melToHz(mel) {
  return 700 * (Math.pow(10, mel / 2595) - 1);
}

function applyMelFilterbank(powerSpec) {
  const nfft = (powerSpec.length - 1) * 2;
  const melLow = hzToMel(MEL_LOW);
  const melHigh = hzToMel(MEL_HIGH);
  const melPoints = new Float32Array(NUM_MEL_BANDS + 2);

  for (let i = 0; i < NUM_MEL_BANDS + 2; i++) {
    melPoints[i] = melLow + (melHigh - melLow) * i / (NUM_MEL_BANDS + 1);
  }

  const binPoints = new Float32Array(NUM_MEL_BANDS + 2);
  for (let i = 0; i < NUM_MEL_BANDS + 2; i++) {
    binPoints[i] = Math.floor((nfft + 1) * melToHz(melPoints[i]) / SAMPLE_RATE);
  }

  const energies = new Float32Array(NUM_MEL_BANDS);
  for (let m = 0; m < NUM_MEL_BANDS; m++) {
    const start = binPoints[m];
    const center = binPoints[m + 1];
    const end = binPoints[m + 2];

    for (let k = start; k < center && k < powerSpec.length; k++) {
      const weight = (k - start) / (center - start + 1e-10);
      energies[m] += powerSpec[k] * weight;
    }
    for (let k = center; k < end && k < powerSpec.length; k++) {
      const weight = (end - k) / (end - center + 1e-10);
      energies[m] += powerSpec[k] * weight;
    }
  }
  return energies;
}

function dct(input, numCoeffs) {
  const n = input.length;
  const out = new Float32Array(numCoeffs);
  for (let k = 0; k < numCoeffs; k++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += input[i] * Math.cos(Math.PI * k * (2 * i + 1) / (2 * n));
    }
    out[k] = sum;
  }
  return out;
}

// Mojjjak: detect speaker changes by comparing MFCC averages of neighboring windows
function cosineSimilarity(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

function cosineDistance(a, b) {
  return 1 - cosineSimilarity(a, b);
}

function averageMFCC(mfccs, startFrame, endFrame) {
  const avg = new Float32Array(NUM_MFCC);
  const count = endFrame - startFrame;
  if (count === 0) return avg;
  for (let i = startFrame; i < endFrame; i++) {
    for (let j = 0; j < NUM_MFCC; j++) avg[j] += mfccs[i][j];
  }
  for (let j = 0; j < NUM_MFCC; j++) avg[j] /= count;
  return avg;
}

function segmentBySpeakerChange(mfccs) {
  const segments = [];
  let segStart = 0;
  const windowSize = 12;
  const minSegFrames = 12;

  for (let i = windowSize; i < mfccs.length - windowSize; i++) {
    const left = averageMFCC(mfccs, Math.max(0, i - windowSize), i);
    const right = averageMFCC(mfccs, i, Math.min(mfccs.length, i + windowSize));
    const dist = cosineDistance(left, right);

    if (dist > SPEAKER_THRESHOLD && (i - segStart) > minSegFrames) {
      segments.push({ startFrame: segStart, endFrame: i });
      segStart = i;
    }
  }

  segments.push({ startFrame: segStart, endFrame: mfccs.length });
  return segments;
}

// Mojjjak: match voice fingerprint to known speakers or create new one
function matchOrCreateSpeaker(mfccProfile) {
  let bestIdx = -1;
  let bestSim = -1;

  for (let i = 0; i < speakerProfiles.length; i++) {
    const sim = cosineSimilarity(mfccProfile, speakerProfiles[i]);
    if (sim > bestSim) {
      bestSim = sim;
      bestIdx = i;
    }
  }

  if (bestIdx >= 0 && bestSim > MATCH_THRESHOLD) {
    const profile = speakerProfiles[bestIdx];
    for (let j = 0; j < NUM_MFCC; j++) {
      profile[j] = profile[j] * 0.8 + mfccProfile[j] * 0.2;
    }
    return bestIdx + 1;
  }

  speakerProfiles.push(new Float32Array(mfccProfile));
  return speakerProfiles.length;
}
