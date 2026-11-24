/** Web Audio API 효과음 엔진 — 외부 오디오 파일 없이 합성음만 사용합니다. */

type ToneOptions = {
  freq: number;
  duration?: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
  sweepTo?: number;
};

const SOUND_KEY = 'liarpick:sound';

class SoundEngine {
  private ctx: AudioContext | null = null;
  enabled = true;

  constructor() {
    try {
      this.enabled = localStorage.getItem(SOUND_KEY) !== 'off';
    } catch {
      this.enabled = true;
    }
  }

  setEnabled(next: boolean) {
    this.enabled = next;
    try {
      localStorage.setItem(SOUND_KEY, next ? 'on' : 'off');
    } catch {
      /* 저장 실패는 무시 */
    }
    if (next) this.tap();
  }

  private ensure(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** 사용자 제스처에서 오디오 컨텍스트를 미리 깨워 둡니다(iOS 대응). */
  unlock() {
    this.ensure();
  }

  private tone({ freq, duration = 0.12, type = 'sine', gain = 0.16, delay = 0, sweepTo }: ToneOptions) {
    const ctx = this.ensure();
    if (!ctx) return;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (sweepTo) osc.frequency.exponentialRampToValueAtTime(sweepTo, start + duration);
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(gain, start + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(amp).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.03);
  }

  tap() {
    this.tone({ freq: 520, duration: 0.06, type: 'triangle', gain: 0.1 });
  }

  flip() {
    this.tone({ freq: 380, duration: 0.1, type: 'sine', gain: 0.12, sweepTo: 720 });
  }

  reveal() {
    this.tone({ freq: 660, duration: 0.12, type: 'triangle', gain: 0.14 });
    this.tone({ freq: 990, duration: 0.16, type: 'sine', gain: 0.1, delay: 0.08 });
  }

  pass() {
    this.tone({ freq: 440, duration: 0.09, type: 'sine', gain: 0.1, sweepTo: 300 });
  }

  tick() {
    this.tone({ freq: 880, duration: 0.05, type: 'square', gain: 0.05 });
  }

  warn() {
    this.tone({ freq: 720, duration: 0.16, type: 'sawtooth', gain: 0.09 });
    this.tone({ freq: 720, duration: 0.16, type: 'sawtooth', gain: 0.09, delay: 0.22 });
  }

  win() {
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) =>
      this.tone({ freq, duration: 0.24, type: 'triangle', gain: 0.13, delay: i * 0.13 }),
    );
  }

  lose() {
    [392, 349.23, 293.66].forEach((freq, i) =>
      this.tone({ freq, duration: 0.28, type: 'sine', gain: 0.12, delay: i * 0.16 }),
    );
  }

  night() {
    [220, 196, 174.61].forEach((freq, i) =>
      this.tone({ freq, duration: 0.5, type: 'sine', gain: 0.09, delay: i * 0.2 }),
    );
  }

  morning() {
    [587.33, 880].forEach((freq, i) =>
      this.tone({ freq, duration: 0.3, type: 'triangle', gain: 0.11, delay: i * 0.16 }),
    );
  }

  execute() {
    this.tone({ freq: 160, duration: 0.35, type: 'sawtooth', gain: 0.12, sweepTo: 60 });
  }
}

export const sfx = new SoundEngine();
