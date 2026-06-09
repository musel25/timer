let sentinel: WakeLockSentinel | null = null;

export async function requestWakeLock(): Promise<void> {
  try {
    if ('wakeLock' in navigator) {
      sentinel = await (navigator as any).wakeLock.request('screen');
    }
  } catch {
    /* user denied or unsupported */
  }
}

export async function releaseWakeLock(): Promise<void> {
  try {
    await sentinel?.release();
  } catch {
    /* ignore */
  }
  sentinel = null;
}

/** Re-acquire the lock when the tab becomes visible again (the OS drops it on hide). */
export async function reacquireWakeLock(): Promise<void> {
  if (sentinel === null && document.visibilityState === 'visible') {
    await requestWakeLock();
  }
}
