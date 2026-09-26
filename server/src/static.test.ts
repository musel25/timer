import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createStaticApp } from './static';

let directory: string;
const javascript = 'console.log("planner");\n'.repeat(1000);
beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'timer-static-'));
  mkdirSync(path.join(directory, 'assets'));
  writeFileSync(path.join(directory, 'assets/app-123abc.js'), javascript);
  writeFileSync(path.join(directory, 'index.html'), '<html>Planner</html>');
  writeFileSync(path.join(directory, 'sw.js'), '// service worker');
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));
describe('production asset delivery', () => {
  it('compresses versioned JavaScript and caches it across visits', async () => {
    const res = await createStaticApp(directory).request('/assets/app-123abc.js', { headers: { 'Accept-Encoding': 'gzip' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Encoding')).toBe('gzip');
    expect(res.headers.get('Vary')).toContain('Accept-Encoding');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.length).toBeLessThan(javascript.length / 4);
    expect(gunzipSync(bytes).toString()).toBe(javascript);
  });
  it('keeps byte-range responses uncompressed and consistent', async () => {
    const res = await createStaticApp(directory).request('/assets/app-123abc.js', { headers: { Range: 'bytes=0-2047', 'Accept-Encoding': 'gzip' } });
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Encoding')).toBeNull();
    expect(res.headers.get('Content-Range')).toBe('bytes 0-2047/' + javascript.length);
    expect(await res.text()).toBe(javascript.slice(0, 2048));
  });
  it('serves plain JavaScript when compression is not accepted', async () => {
    const res = await createStaticApp(directory).request('/assets/app-123abc.js');
    expect(res.headers.get('Content-Encoding')).toBeNull();
    expect(res.headers.get('Vary')).toContain('Accept-Encoding');
    expect(await res.text()).toBe(javascript);
  });
  it.each(['/', '/week', '/index.html', '/sw.js'])('revalidates %s so deployments remain discoverable', async (url) => {
    const res = await createStaticApp(directory).request(url);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-cache');
  });
  it('returns a real 404 for missing assets instead of permanently caching HTML', async () => {
    const res = await createStaticApp(directory).request('/assets/missing.js');
    expect(res.status).toBe(404);
    expect(res.headers.get('Cache-Control')).not.toContain('immutable');
  });
});
