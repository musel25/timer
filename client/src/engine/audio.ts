let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    ctx = new Ctor();
  }
  return ctx;
}

/** Must be called from a user gesture (Start button) to unlock audio on mobile. */
export function unlockAudio(): void {
  try {
    const c = getCtx();
    if (c.state === 'suspended') void c.resume();
  } catch {
    /* no audio available */
  }
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.22): void {
  try {
    const c = getCtx();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.connect(g);
    g.connect(c.destination);
    const t = c.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t);
    o.stop(t + dur);
  } catch {
    /* ignore */
  }
}

export const audio = {
  beep: () => tone(880, 0.12, 'sine', 0.25),
  prep: () => tone(520, 0.14, 'triangle', 0.2),
  work: () => {
    tone(660, 0.16, 'square', 0.18);
  },
  rest: () => tone(440, 0.2, 'sine', 0.2),
  cooldown: () => tone(400, 0.22, 'sine', 0.18),
  finish: () => {
    tone(784, 0.16);
    setTimeout(() => tone(1047, 0.32), 170);
  },
  speak: (text: string) => {
    try {
      if (!('speechSynthesis' in window)) return;
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.05;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {
      /* ignore */
    }
  },
};
