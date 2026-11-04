export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let generation = 0;
let sequence = 0;
let accountId: string | null = null;
const requestPrefix = crypto.randomUUID();
const pending = new Set<AbortController>();

/** Invalidate both fetches and responses already being decoded. */
export function cancelAccountRequests(): void {
  generation++;
  for (const controller of pending) controller.abort();
}

export function requestAccountGeneration(): number {
  return generation;
}

export function setRequestAccount(owner: string | null): void {
  if (accountId === owner) return;
  cancelAccountRequests();
  accountId = owner;
}

export function apiGetUrl(path: string): string {
  const url = new URL(`/api${path}`, location.origin);
  url.searchParams.set('_timer_request', `${requestPrefix}-${++sequence}`);
  return `${url.pathname}${url.search}`;
}

async function request<T>(method: string, path: string, body?: unknown, options: RequestInit = {}): Promise<T> {
  const started = generation;
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  pending.add(controller);
  // Old installed workers used one API cache for every account. A unique URL
  // cannot match an old cached response while the replacement worker installs.
  const url = method === 'GET' ? apiGetUrl(path) : `/api${path}`;
  try {
    const res = await fetch(url, {
      ...options,
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(accountId !== null && !['/auth/me', '/auth/login', '/auth/logout'].includes(path)
          ? { 'X-Timer-Account-Id': accountId } : {}),
        ...options.headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!res.ok) {
      let msg = res.statusText;
      try { msg = (await res.json()).error ?? msg; } catch { /* use HTTP status */ }
      throw new ApiError(res.status, msg);
    }
    const result = res.status === 204 ? undefined : await res.json();
    if (started !== generation || controller.signal.aborted) throw new DOMException('Account changed', 'AbortError');
    return result as T;
  } finally {
    pending.delete(controller);
    options.signal?.removeEventListener('abort', abort);
  }
}

export const api = {
  get: <T>(p: string) => request<T>('GET', p),
  post: <T>(p: string, b?: unknown, options?: RequestInit) => request<T>('POST', p, b, options),
  put: <T>(p: string, b?: unknown) => request<T>('PUT', p, b),
  patch: <T>(p: string, b?: unknown) => request<T>('PATCH', p, b),
  del: <T>(p: string, b?: unknown) => request<T>('DELETE', p, b),
};
