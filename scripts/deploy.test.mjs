import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const revision = 'a'.repeat(40);
const previous = 'b'.repeat(64);
const deploy = resolve('deploy.sh');
function run(options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'timer-deploy-'));
  mkdirSync(join(dir, 'bin'));
  mkdirSync(join(dir, 'timer'));
  const log = join(dir, 'commands.log');
  const stub = join(dir, 'stub.mjs');
  writeFileSync(stub, `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
import { basename } from 'node:path';
import { spawnSync } from 'node:child_process';
const name = basename(process.argv[1]);
const args = process.argv.slice(2);
const cmd = args.join(' ');
const o = JSON.parse(process.env.DEPLOY_TEST_OPTIONS);
appendFileSync(process.env.DEPLOY_TEST_LOG, name + ' ' + cmd + '\\n');
if (name === 'git') {
  if (args[0] === 'rev-parse') console.log('${revision}');
  if (args[0] === 'status' && o.dirty) console.log(' M server/src/api.ts');
  if (args[0] === 'branch' && !o.unpushed) console.log('  origin/fix/review-hardening');
}
if (name === 'curl') {
  if (o.edgeFailure) process.exit(22);
  // Support the original script while proving its broken health check.
  console.log(args.includes('-w') ? '200' : JSON.stringify({ ok: true, revision: o.wrongRevision ? 'old' : '${revision}' }));
}
if (name === 'docker') {
  if (args[0] === 'exec') process.exit(spawnSync(process.execPath, args.slice(3), { stdio: 'inherit' }).status ?? 1);
  if (args[0] === 'inspect') console.log(cmd.includes('.Image') ? 'sha256:${previous}' : (o.status || 'healthy'));
  if (cmd === 'compose ps --format {{.Status}}') console.log('Up 2 minutes (' + (o.status || 'healthy') + ')');
  if (cmd.startsWith('compose build') && o.buildFailure) process.exit(1);
  if (cmd === 'compose up -d' && o.upFailure) process.exit(1);
}
`, { mode: 0o755 });
  for (const name of ['git', 'npm', 'docker', 'curl', 'sleep', 'flock']) symlinkSync(stub, join(dir, 'bin', name));
  writeFileSync(join(dir, 'bin', 'ssh'), '#!/usr/bin/env bash\nwhile [[ "$1" == -o ]]; do shift 2; done\nshift\nexec "$@"\n', { mode: 0o755 });
  const result = spawnSync('bash', [deploy], {
    cwd: dir,
    env: { ...process.env, HOME: dir, PATH: `${join(dir, 'bin')}:${process.env.PATH}`, DEPLOY_TEST_LOG: log, DEPLOY_TEST_OPTIONS: JSON.stringify(options) },
    timeout: 20_000,
    encoding: 'utf8',
  });
  const commands = readFileSync(log, 'utf8');
  rmSync(dir, { recursive: true, force: true });
  return { ...result, commands };
}
test('unhealthy containers fail deployment and restore the running image', () => {
  const result = run({ status: 'unhealthy' });
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(result.commands, /docker compose up -d --no-build/);
});
test('healthy exact revisions deploy after local verification', () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.commands, /npm run verify/);
  assert.match(result.commands, new RegExp(`git checkout --detach ${revision}`));
  assert.match(result.commands, new RegExp(`docker tag sha256:${previous} timer:prev`));
  assert.doesNotMatch(result.commands, /docker compose up -d --no-build/);
});
test('edge failure rolls back', () => {
  const result = run({ edgeFailure: true });
  assert.notEqual(result.status, 0);
  assert.match(result.commands, /docker compose up -d --no-build/);
});
test('a different revision at the edge rolls back', () => {
  const result = run({ wrongRevision: true });
  assert.notEqual(result.status, 0);
  assert.match(result.commands, /docker compose up -d --no-build/);
});
test('startup failure rolls back', () => {
  const result = run({ upFailure: true });
  assert.notEqual(result.status, 0);
  assert.match(result.commands, /docker compose up -d --no-build/);
});
test('build failure leaves the running container in place', () => {
  const result = run({ buildFailure: true });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.commands, /docker compose up/);
});
for (const condition of ['dirty', 'unpushed']) test(`${condition} changes cannot deploy`, () => {
  const result = run({ [condition]: true });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.commands, /docker /);
});
