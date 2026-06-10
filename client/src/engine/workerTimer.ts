/**
 * setTimeout/clearTimeout that run inside a Web Worker. Browsers throttle
 * main-thread timers in hidden tabs (Chrome: at most one fire per minute after
 * ~5 min in the background), which made the finish alarm land minutes late when
 * the user was on another tab. Worker timers are exempt from that throttling,
 * and the worker's postMessage is delivered to the page immediately.
 */

const WORKER_SRC =
  'const t={};onmessage=(e)=>{const{cmd,id,ms}=e.data;' +
  'if(cmd==="set"){t[id]=setTimeout(()=>{delete t[id];postMessage(id)},ms)}' +
  'else{clearTimeout(t[id]);delete t[id]}}';

const callbacks = new Map<number, () => void>();
const fallbacks = new Map<number, ReturnType<typeof setTimeout>>();
let worker: Worker | null | undefined; // undefined = not yet created, null = unavailable
let nextId = 1;

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    const w = new Worker(URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' })));
    w.onmessage = (e: MessageEvent) => {
      const cb = callbacks.get(e.data as number);
      callbacks.delete(e.data as number);
      cb?.();
    };
    worker = w;
  } catch {
    worker = null; // no Worker support — plain timeouts still work in the foreground
  }
  return worker;
}

export function setWorkerTimeout(cb: () => void, ms: number): number {
  const id = nextId++;
  const w = getWorker();
  if (w) {
    callbacks.set(id, cb);
    w.postMessage({ cmd: 'set', id, ms });
  } else {
    fallbacks.set(
      id,
      setTimeout(() => {
        fallbacks.delete(id);
        cb();
      }, ms),
    );
  }
  return id;
}

export function clearWorkerTimeout(id: number | undefined): void {
  if (id === undefined) return;
  callbacks.delete(id);
  getWorker()?.postMessage({ cmd: 'clear', id });
  const f = fallbacks.get(id);
  if (f !== undefined) {
    clearTimeout(f);
    fallbacks.delete(id);
  }
}
