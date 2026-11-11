import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PassThrough, Writable } from 'node:stream';
import test from 'node:test';
import { readSecret } from '../scripts/read-secret.mjs';

const configure = fileURLToPath(new URL('../scripts/configure.mjs', import.meta.url));
async function harness(t) {
  const root = await mkdtemp(join(tmpdir(), 'zesia-configure-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const config = join(root, 'zesia', 'claude-code.json');
  const run = args => spawnSync(process.execPath, [configure, ...args], {
    env: { PATH: process.env.PATH, ZESIA_CONFIG: config }, input: '', encoding: 'utf8', timeout: 5000,
  });
  return { root, config, run };
}

test('configuration rejects non-terminal prompting and unknown options without writing', async t => {
  const h = await harness(t);
  const missing = h.run([]);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /requires a terminal/);
  assert.match(missing.stderr, /--token-file/);
  await assert.rejects(stat(h.config), { code: 'ENOENT' });
  const typo = h.run(['--tokne', 'fake']);
  assert.equal(typo.status, 1);
  assert.match(typo.stderr, /Unknown option/);
});

test('token-file configuration and settings updates preserve credentials without displaying them', async t => {
  const h = await harness(t);
  const tokenPath = join(h.root, 'fake-token.txt');
  const synthetic = 'synthetic-install-test-not-a-real-credential';
  await writeFile(tokenPath, synthetic, { mode: 0o600 });
  const saved = h.run(['--token-file', tokenPath, '--project', 'sample']);
  assert.equal(saved.status, 0, saved.stderr);
  assert.ok(!(saved.stdout + saved.stderr).includes(synthetic));
  assert.equal(h.run(['--url', 'https://api.zesia.dev']).status, 0);
  const value = JSON.parse(await readFile(h.config, 'utf8'));
  assert.equal(value.token, synthetic);
  assert.equal(value.project, 'sample');
  assert.equal((await stat(h.config)).mode & 0o777, 0o600);
  const shown = h.run(['--show']);
  assert.equal(JSON.parse(shown.stdout).tokenConfigured, true);
  assert.ok(!shown.stdout.includes(synthetic));
});

test('interactive token input suppresses echo and restores raw mode', async () => {
  const input = new PassThrough();
  input.isTTY = true;
  const modes = [];
  input.setRawMode = value => modes.push(value);
  let displayed = '';
  const output = new Writable({ write(chunk, _encoding, next) { displayed += chunk.toString(); next(); } });
  output.isTTY = true;
  const secret = readSecret(input, output);
  input.write('synthetic-hidden-test\r');
  assert.equal(await secret, 'synthetic-hidden-test');
  assert.ok(!displayed.includes('synthetic-hidden-test'));
  assert.match(displayed, /hidden/);
  assert.deepEqual(modes, [true, false]);
  input.end();
});

test('cancelling token entry restores terminal without saving', async () => {
  const input = new PassThrough();
  input.isTTY = true;
  const modes = [];
  input.setRawMode = value => modes.push(value);
  const output = new Writable({ write(_chunk, _encoding, next) { next(); } });
  output.isTTY = true;
  const secret = readSecret(input, output);
  input.write('\x03');
  await assert.rejects(secret, /cancelled/);
  assert.deepEqual(modes, [true, false]);
  input.end();
});
