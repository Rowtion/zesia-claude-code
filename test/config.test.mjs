import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { destinationOf, normalizeServiceUrl, readConfig, saveConfig } from '../src/config.mjs';

test('destinationOf keeps HTTPS and loopback HTTP origins', () => {
  assert.equal(destinationOf('https://api.zesia.dev/a?b=1'), 'https://api.zesia.dev');
  assert.equal(destinationOf('http://127.0.0.1:8787'), 'http://127.0.0.1:8787');
  assert.equal(destinationOf('http://localhost:8787'), 'http://localhost:8787');
});

test('destinationOf rejects remote plaintext and URL credentials', () => {
  assert.throws(() => destinationOf('http://example.com'), /HTTPS or loopback/u);
  assert.throws(() => destinationOf('https://user:pass@api.zesia.dev'), /credentials/u);
});

test('legacy workers.dev default migrates to the product endpoint', () => {
  assert.equal(normalizeServiceUrl('https://zesia-consult.cprindex.workers.dev'), 'https://api.zesia.dev');
  assert.equal(normalizeServiceUrl('https://zesia-consult.cprindex.workers.dev/foo'), 'https://api.zesia.dev');
  assert.equal(normalizeServiceUrl('https://zesia-consult.cprindex.workers.dev:443/x'), 'https://api.zesia.dev');
  assert.equal(normalizeServiceUrl('https://custom.example'), 'https://custom.example');
  assert.equal(normalizeServiceUrl(undefined), 'https://api.zesia.dev');
  assert.equal(normalizeServiceUrl(123), 'https://api.zesia.dev');
});

test('readConfig prefers env over the private file and requires a token by default', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'zesia-config-'));
  const path = join(dir, 'claude-code.json');
  await writeFile(path, JSON.stringify({ url: 'https://stored.example', token: 'stored-token', project: 'stored', confirmBeforeSend: false }));

  const config = await readConfig({ ZESIA_CONFIG: path });
  assert.equal(config.url, 'https://stored.example');
  assert.equal(config.token, 'stored-token');
  assert.equal(config.project, 'stored');
  // This plugin always confirms; an older stored automatic-mode flag is ignored.
  assert.equal(config.confirmBeforeSend, true);

  const overridden = await readConfig({ ZESIA_CONFIG: path, ZESIA_URL: 'https://env.example', ZESIA_TOKEN: 'env-token', ZESIA_PROJECT: 'env' });
  assert.equal(overridden.url, 'https://env.example');
  assert.equal(overridden.token, 'env-token');
  assert.equal(overridden.project, 'env');

  await assert.rejects(readConfig({ ZESIA_CONFIG: join(dir, 'missing.json') }), /trial token/u);
});

test('readConfig rejects tokens with whitespace or control characters', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'zesia-config-'));
  const path = join(dir, 'claude-code.json');
  await writeFile(path, JSON.stringify({ token: 'bad token\n' }));
  await assert.rejects(readConfig({ ZESIA_CONFIG: path }), /whitespace/u);
});

test('saveConfig merges values atomically with mode 0600', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'zesia-config-'));
  const env = { ZESIA_CONFIG: join(dir, 'claude-code.json') };
  await saveConfig({ token: 'secret-token', project: 'demo' }, env);
  await saveConfig({ confirmBeforeSend: false }, env);
  const stored = JSON.parse(await readFile(env.ZESIA_CONFIG, 'utf8'));
  assert.deepEqual(stored, { token: 'secret-token', project: 'demo', confirmBeforeSend: false });
  const mode = (await stat(env.ZESIA_CONFIG)).mode & 0o777;
  assert.equal(mode, 0o600);
});
