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

/**
 * Plays a tone `at` seconds from now, scheduled on the AudioContext clock —
 * unlike setTimeout, audio-clock scheduling is not throttled in hidden tabs.
 */
function tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.22, at = 0, hold = 0): void {
  try {
    const c = getCtx();
    // Background tabs (Safari especially) suspend the context; the Start click
    // gave the page sticky activation, so resuming here is allowed.
    if (c.state === 'suspended') void c.resume();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.connect(g);
    g.connect(c.destination);
    const t = c.currentTime + at;
    g.gain.setValueAtTime(gain, t);
    if (hold > 0) g.gain.setValueAtTime(gain, t + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t);
    o.stop(t + dur);
  } catch {
    /* ignore */
  }
}

// Hard-attack blast: square fundamental layered with an octave overtone —
// far more piercing through phone speakers than a lone oscillator.
function blast(freq: number, dur: number, gain: number, at = 0, hold = 0): void {
  tone(freq, dur, 'square', gain, at, hold);
  tone(freq * 2, dur, 'sine', gain * 0.5, at, hold);
}

export const audio = {
  beep: () => tone(880, 0.12, 'sine', 0.25),
  // Race-start cue, loud enough to snap attention from across the room:
  // three hard same-pitch "ready" blasts, then a long sustained octave-up
  // "GO" blast — the cadence of a track/swimming start signal.
  prep: () => {
    blast(740, 0.22, 0.5, 0);
    blast(740, 0.22, 0.5, 0.55);
    blast(740, 0.22, 0.5, 1.1);
    blast(1480, 0.9, 0.6, 1.65, 0.35);
  },
  work: () => {
    tone(660, 0.16, 'square', 0.18);
  },
  rest: () => tone(440, 0.2, 'sine', 0.2),
  cooldown: () => tone(400, 0.22, 'sine', 0.18),
  // A real alarm: the two-note chime repeated four times (~3 s), loud enough to
  // register from another tab — the old single half-second chime was easy to miss.
  finish: () => {
    for (const at of [0, 0.8, 1.6, 2.4]) {
      tone(784, 0.16, 'sine', 0.3, at);
      tone(1047, 0.32, 'sine', 0.3, at + 0.17);
    }
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
