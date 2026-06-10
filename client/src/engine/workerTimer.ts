/**
 * setTimeout/setInterval that run inside a Web Worker. Browsers throttle (and
 * eventually freeze) main-thread timers in hidden tabs (Chrome: at most one
 * fire per minute after ~5 min in the background), which made timer sounds
 * land minutes late when the user was on another tab. Worker timers are exempt
 * from that throttling, and the worker's postMessage is delivered to the page
 * immediately.
 */

const WORKER_SRC =
  'const t={},i={};onmessage=(e)=>{const{cmd,id,ms}=e.data;' +
  'if(cmd==="set"){t[id]=setTimeout(()=>{delete t[id];postMessage(id)},ms)}' +
  'else if(cmd==="clear"){clearTimeout(t[id]);delete t[id]}' +
  'else if(cmd==="setInterval"){i[id]=setInterval(()=>postMessage(id),ms)}' +
  'else{clearInterval(i[id]);delete i[id]}}';

const callbacks = new Map<number, () => void>(); // one-shot: removed on fire
const intervalCallbacks = new Map<number, () => void>(); // repeating: removed on clear
const fallbacks = new Map<number, ReturnType<typeof setTimeout>>();
const intervalFallbacks = new Map<number, ReturnType<typeof setInterval>>();
let worker: Worker | null | undefined; // undefined = not yet created, null = unavailable
let nextId = 1;

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    const w = new Worker(URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' })));
    w.onmessage = (e: MessageEvent) => {
      const id = e.data as number;
      const repeat = intervalCallbacks.get(id);
      if (repeat) {
        repeat();
        return;
      }
      const cb = callbacks.get(id);
      callbacks.delete(id);
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

export function setWorkerInterval(cb: () => void, ms: number): number {
  const id = nextId++;
  const w = getWorker();
  if (w) {
    intervalCallbacks.set(id, cb);
    w.postMessage({ cmd: 'setInterval', id, ms });
  } else {
    intervalFallbacks.set(id, setInterval(cb, ms));
  }
  return id;
}

export function clearWorkerInterval(id: number | undefined): void {
  if (id === undefined) return;
  intervalCallbacks.delete(id);
  getWorker()?.postMessage({ cmd: 'clearInterval', id });
  const f = intervalFallbacks.get(id);
  if (f !== undefined) {
    clearInterval(f);
    intervalFallbacks.delete(id);
  }
}
