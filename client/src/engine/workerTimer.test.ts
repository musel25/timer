import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type Msg = { cmd: 'set' | 'clear' | 'setInterval' | 'clearInterval'; id: number; ms?: number };

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((e: { data: number }) => void) | null = null;
  posted: Msg[] = [];
  constructor(_url: string) {
    FakeWorker.instances.push(this);
  }
  postMessage(msg: Msg) {
    this.posted.push(msg);
  }
  /** Simulate the worker-side timeout firing for the given id. */
  fire(id: number) {
    this.onmessage?.({ data: id });
  }
}

async function loadFresh() {
  vi.resetModules();
  return import('./workerTimer');
}

beforeEach(() => {
  FakeWorker.instances = [];
  vi.stubGlobal('Worker', FakeWorker);
  vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:fake' });
  vi.stubGlobal('Blob', class { constructor(_parts: unknown[], _opts?: unknown) {} });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('setWorkerTimeout', () => {
  it('schedules via the worker and runs the callback when the worker replies', async () => {
    const { setWorkerTimeout } = await loadFresh();
    const cb = vi.fn();
    const id = setWorkerTimeout(cb, 1500);
    const w = FakeWorker.instances[0];
    expect(w.posted).toEqual([{ cmd: 'set', id, ms: 1500 }]);
    expect(cb).not.toHaveBeenCalled();
    w.fire(id);
    expect(cb).toHaveBeenCalledTimes(1);
    w.fire(id); // duplicate replies must not double-fire
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('clearWorkerTimeout cancels: callback never runs even if the worker replies', async () => {
    const { setWorkerTimeout, clearWorkerTimeout } = await loadFresh();
    const cb = vi.fn();
    const id = setWorkerTimeout(cb, 1000);
    clearWorkerTimeout(id);
    const w = FakeWorker.instances[0];
    expect(w.posted).toContainEqual({ cmd: 'clear', id });
    w.fire(id);
    expect(cb).not.toHaveBeenCalled();
  });

  it('falls back to a plain setTimeout when Worker is unavailable', async () => {
    vi.stubGlobal(
      'Worker',
      class {
        constructor() {
          throw new Error('no workers here');
        }
      },
    );
    vi.useFakeTimers();
    const { setWorkerTimeout, clearWorkerTimeout } = await loadFresh();
    const cb = vi.fn();
    setWorkerTimeout(cb, 2000);
    vi.advanceTimersByTime(2000);
    expect(cb).toHaveBeenCalledTimes(1);

    const cb2 = vi.fn();
    const id2 = setWorkerTimeout(cb2, 2000);
    clearWorkerTimeout(id2);
    vi.advanceTimersByTime(5000);
    expect(cb2).not.toHaveBeenCalled();
  });
});

describe('setWorkerInterval', () => {
  it('schedules via the worker and runs the callback on every worker reply', async () => {
    const { setWorkerInterval } = await loadFresh();
    const cb = vi.fn();
    const id = setWorkerInterval(cb, 250);
    const w = FakeWorker.instances[0];
    expect(w.posted).toEqual([{ cmd: 'setInterval', id, ms: 250 }]);
    w.fire(id);
    w.fire(id);
    w.fire(id);
    expect(cb).toHaveBeenCalledTimes(3);
  });

  it('clearWorkerInterval stops the callback even if the worker still replies', async () => {
    const { setWorkerInterval, clearWorkerInterval } = await loadFresh();
    const cb = vi.fn();
    const id = setWorkerInterval(cb, 250);
    const w = FakeWorker.instances[0];
    w.fire(id);
    clearWorkerInterval(id);
    expect(w.posted).toContainEqual({ cmd: 'clearInterval', id });
    w.fire(id);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('falls back to a plain setInterval when Worker is unavailable', async () => {
    vi.stubGlobal(
      'Worker',
      class {
        constructor() {
          throw new Error('no workers here');
        }
      },
    );
    vi.useFakeTimers();
    const { setWorkerInterval, clearWorkerInterval } = await loadFresh();
    const cb = vi.fn();
    const id = setWorkerInterval(cb, 250);
    vi.advanceTimersByTime(1000);
    expect(cb).toHaveBeenCalledTimes(4);
    clearWorkerInterval(id);
    vi.advanceTimersByTime(1000);
    expect(cb).toHaveBeenCalledTimes(4);
  });

  it('keeps timeout and interval ids independent', async () => {
    const { setWorkerTimeout, setWorkerInterval } = await loadFresh();
    const tcb = vi.fn();
    const icb = vi.fn();
    const tid = setWorkerTimeout(tcb, 1000);
    const iid = setWorkerInterval(icb, 250);
    expect(tid).not.toBe(iid);
    const w = FakeWorker.instances[0];
    w.fire(iid);
    expect(icb).toHaveBeenCalledTimes(1);
    expect(tcb).not.toHaveBeenCalled();
    w.fire(tid);
    expect(tcb).toHaveBeenCalledTimes(1);
    w.fire(iid); // interval keeps firing after a timeout consumed its id
    expect(icb).toHaveBeenCalledTimes(2);
  });
});
