// ============================================================
// Áudio procedural (WebAudio) — torcida, apito, chute, defesas
// ============================================================
let ac = null;
let master = null;
let crowdGain = null;
let crowdStarted = false;
let muted = false;

function ensure() {
  if (ac) return true;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(ac.destination);
    startCrowd();
  } catch (e) { return false; }
  return true;
}

function noiseBuffer(sec = 2) {
  const n = Math.floor(ac.sampleRate * sec);
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;   // ruido "marrom" = som mais natural
    d[i] = last * 3.2;
  }
  return buf;
}

function startCrowd() {
  if (crowdStarted || !ac) return;
  crowdStarted = true;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(4);
  src.loop = true;
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 620; bp.Q.value = 0.6;
  const hp = ac.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 180;
  crowdGain = ac.createGain();
  crowdGain.gain.value = 0.055;
  // "pulso" da arquibancada
  const lfo = ac.createOscillator();
  lfo.frequency.value = 0.13;
  const lfoG = ac.createGain(); lfoG.gain.value = 0.02;
  lfo.connect(lfoG); lfoG.connect(crowdGain.gain);
  src.connect(bp); bp.connect(hp); hp.connect(crowdGain); crowdGain.connect(master);
  src.start(); lfo.start();
}

function burst(dur, filterType, freq, gain, q = 1) {
  if (!ensure()) return;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(dur + 0.1);
  const f = ac.createBiquadFilter();
  f.type = filterType; f.frequency.value = freq; f.Q.value = q;
  const g = ac.createGain();
  const t = ac.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t); src.stop(t + dur + 0.15);
}

function tone(freq, dur, type, gain, slideTo) {
  if (!ensure()) return;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type; o.frequency.value = freq;
  const t = ac.currentTime;
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}

export const SFX = {
  unlock() { if (ensure() && ac.state === 'suspended') ac.resume(); },
  kick(power = 0.6) {
    burst(0.09, 'lowpass', 700 + power * 900, 0.35 + power * 0.4);
    tone(120 + power * 60, 0.09, 'sine', 0.35, 60);
  },
  pass() { burst(0.07, 'lowpass', 850, 0.3); tone(160, 0.07, 'sine', 0.22, 90); },
  bounce() { burst(0.06, 'lowpass', 600, 0.18); },
  save() { burst(0.16, 'bandpass', 1500, 0.4, 1.2); },
  catchBall() { burst(0.13, 'lowpass', 900, 0.4); tone(200, 0.1, 'sine', 0.2, 120); },
  tackle() { burst(0.22, 'lowpass', 420, 0.45); },
  net() { burst(0.3, 'bandpass', 2400, 0.25, 0.8); },
  post() {
    tone(430, 0.5, 'triangle', 0.4, 380);
    tone(1180, 0.35, 'sine', 0.18, 900);
    burst(0.1, 'highpass', 2500, 0.2);
  },
  whistle(long = false) {
    if (!ensure()) return;
    const dur = long ? 1.0 : 0.42;
    const t = ac.currentTime;
    const o = ac.createOscillator(), o2 = ac.createOscillator();
    o.type = 'square'; o2.type = 'square';
    o.frequency.value = 2350; o2.frequency.value = 2465;
    const vib = ac.createOscillator(); vib.frequency.value = 34;
    const vibG = ac.createGain(); vibG.gain.value = 90;
    vib.connect(vibG); vibG.connect(o.frequency); vibG.connect(o2.frequency);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.03);
    g.gain.setValueAtTime(0.16, t + dur - 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 3;
    o.connect(f); o2.connect(f); f.connect(g); g.connect(master);
    o.start(t); o2.start(t); vib.start(t);
    o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05); vib.stop(t + dur + 0.05);
  },
  goal() {
    burst(1.6, 'bandpass', 900, 0.5, 0.5);
    tone(523, 0.5, 'square', 0.1);
    setTimeout(() => tone(659, 0.5, 'square', 0.1), 130);
    setTimeout(() => tone(784, 0.8, 'square', 0.1), 260);
    this.crowdRoar(3.2);
  },
  crowdRoar(sec = 2.5) {
    if (!ensure() || !crowdGain) return;
    const t = ac.currentTime;
    crowdGain.gain.cancelScheduledValues(t);
    crowdGain.gain.setValueAtTime(crowdGain.gain.value, t);
    crowdGain.gain.linearRampToValueAtTime(0.34, t + 0.25);
    crowdGain.gain.setValueAtTime(0.34, t + sec * 0.45);
    crowdGain.gain.linearRampToValueAtTime(0.055, t + sec);
  },
  ui() { tone(660, 0.07, 'triangle', 0.14, 880); },
  card() { tone(880, 0.14, 'sawtooth', 0.12, 660); },
  banner() { burst(0.25, 'highpass', 1200, 0.14); },
};

export function setMuted(v) {
  muted = v;
  if (master) master.gain.value = v ? 0 : 0.9;
}
export function isMuted() { return muted; }
