/**
 * 효과음 — WebAudio 로 직접 합성 (외부 사운드 파일 없음 → 라이선스 문제 없음).
 * 작고 부드러운 소리 위주, 설정에서 음량/음소거 조절 가능.
 */
type Sfx = 'click' | 'buy' | 'plant' | 'harvest' | 'coin' | 'expand' | 'open' | 'close' | 'chat' | 'error' | 'quest' | 'pop';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let volume = 0.6;
let muted = false;

function ac() {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
    applyVolume();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function applyVolume() {
  if (master) master.gain.value = muted ? 0 : volume * 0.35;
}

export function setAudio(v: number, m: boolean) {
  volume = v;
  muted = m;
  applyVolume();
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.5, slideTo?: number) {
  const c = ac();
  if (!c || !master) return;
  const t0 = c.currentTime + start;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(start: number, dur: number, gain = 0.15, lowpass = 900) {
  const c = ac();
  if (!c || !master) return;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = lowpass;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(f); f.connect(g); g.connect(master);
  src.start(c.currentTime + start);
}

export function play(s: Sfx) {
  if (muted) return;
  try {
    switch (s) {
      case 'click': tone(880, 0, 0.06, 'triangle', 0.25); break;
      case 'pop': tone(520, 0, 0.08, 'sine', 0.3, 900); break;
      case 'open': tone(660, 0, 0.09, 'triangle', 0.25); tone(990, 0.07, 0.12, 'triangle', 0.22); break;
      case 'close': tone(740, 0, 0.07, 'triangle', 0.2); tone(520, 0.05, 0.09, 'triangle', 0.18); break;
      case 'buy': tone(988, 0, 0.08, 'square', 0.12); tone(1319, 0.07, 0.16, 'square', 0.12); break;
      case 'coin': tone(1047, 0, 0.07, 'square', 0.1); tone(1568, 0.06, 0.2, 'square', 0.1); break;
      case 'plant': noise(0, 0.12, 0.25, 600); tone(300, 0, 0.1, 'sine', 0.3, 180); break;
      case 'harvest': [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.06, 0.14, 'triangle', 0.25)); break;
      case 'expand': [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.22, 'triangle', 0.25)); noise(0, 0.3, 0.08, 400); break;
      case 'quest': [784, 988, 1175, 1568].forEach((f, i) => tone(f, i * 0.08, 0.18, 'square', 0.08)); break;
      case 'chat': tone(1200, 0, 0.05, 'sine', 0.15, 1500); break;
      case 'error': tone(330, 0, 0.12, 'triangle', 0.25, 220); break;
    }
  } catch {
    /* 오디오 미지원 환경 무시 */
  }
}
