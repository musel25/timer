import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type Msg = { cmd: 'set' | 'clear'; id: number; ms?: number };

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
