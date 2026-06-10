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
  // Race-start cue: three short "ready" beeps, then a longer higher "go" tone — like a track/F1 start.
  prep: () => {
    tone(700, 0.12, 'square', 0.2);
    setTimeout(() => tone(700, 0.12, 'square', 0.2), 500);
    setTimeout(() => tone(700, 0.12, 'square', 0.2), 1000);
    setTimeout(() => tone(1100, 0.4, 'square', 0.24), 1500);
  },
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
  /** System notification + vibration — fires even when the tab/page isn't visible. */
  notify: (title: string, body: string) => {
    try {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      const opts = { body, tag: 'timer-finish', icon: '/pwa-192.png', vibrate: [200, 100, 200] } as NotificationOptions;
      // A PWA notification via the service worker is the only kind that reliably shows on mobile in the background.
      if ('serviceWorker' in navigator) {
        void navigator.serviceWorker.ready.then((reg) => reg.showNotification(title, opts)).catch(() => {
          try { new Notification(title, opts); } catch { /* ignore */ }
        });
        return;
      }
      new Notification(title, opts);
    } catch {
      /* ignore */
    }
  },
};

/** Ask for notification permission. Must be called from a user gesture (Start button). */
export function requestNotificationPermission(): void {
  try {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') void Notification.requestPermission();
  } catch {
    /* ignore */
  }
}
