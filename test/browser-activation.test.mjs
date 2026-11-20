import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createTools } from '../src/tools.mjs';

const origin = 'https://zesia.dev';
const token = 'synthetic-activation-credential-0000';

test('browser activation writes the configuration Claude Code reads and keeps the draft unsent', async t => {
  const profile = await mkdtemp(join(os.tmpdir(), 'zesia-claude-activation-'));
  const homedir = t.mock.method(os, 'homedir', () => profile);
  syncBuiltinESMExports();
  const envKeys = ['ZESIA_CONFIG', 'ZESIA_TOKEN', 'ZESIA_URL', 'ZESIA_PROJECT'];
  const savedEnv = envKeys.map(key => [key, process.env[key]]);
  for (const key of envKeys) delete process.env[key];
  t.after(async () => {
    homedir.mock.restore();
    syncBuiltinESMExports();
    for (const [key, value] of savedEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(profile, { recursive: true, force: true });
  });

  const configRoot = join(profile, '.config', 'zesia');
  await mkdir(configRoot, { recursive: true });
  const shared = join(configRoot, 'agent.json');
  const unrelated = '{"project":"another adapter"}\n';
  const own = join(configRoot, 'claude-code.json');
  const explicit = join(configRoot, 'explicit-claude.json');
  for (const [label, path] of [['default', own], ['explicit override', explicit]]) {
    await t.test(label, async () => {
      await writeFile(shared, unrelated, { mode: 0o600 });
      if (path === explicit) process.env.ZESIA_CONFIG = explicit;
      await writeFile(path, '{"project":"keep the configured project"}\n', { mode: 0o600 });
      let sent = 0;
      const { tools, close } = createTools({
        openBrowser: false, onlineOrigin: origin,
        requestConsult: async () => {
          sent++;
          throw new Error('Unexpected send during activation');
        },
      });
      const run = async (name, args) => (await tools.find(tool => tool.name === name).handler(args)).structuredContent;
      try {
        const prepared = await run('zesia_consult', { project: 'fixture', brief: 'Review the synthetic plan.', context: {} });
        assert.equal(prepared.status, 'awaiting_online_review');
        const link = new URL(prepared.url);
        const capability = new URLSearchParams(link.hash.slice(1));
        const bridge = 'http://127.0.0.1:' + capability.get('port') + '/bridge/v1/';
        const headers = { Origin: origin, Authorization: 'Bearer ' + capability.get('key'), 'Content-Type': 'application/json' };
        const before = await (await fetch(bridge + 'view', { headers })).json();
        assert.equal(before.configured, false);

        const reply = await fetch(bridge + 'configure', {
          method: 'POST', headers,
          body: JSON.stringify({ protocolVersion: 1, destination: before.destination, token }),
        });
        assert.equal(reply.status, 200);
        const after = await reply.json();
        assert.equal(after.configured, true);
        assert.equal(after.status, 'prepared');
        for (const field of ['draftId', 'requestId', 'approvedHash', 'destination']) assert.equal(after[field], before[field]);
        assert.deepEqual(after.packet, before.packet);
        assert.equal(JSON.stringify(after).includes(token), false);
        assert.equal((await run('zesia_settings', {})).configured, true);
        assert.equal(await readFile(shared, 'utf8'), unrelated);
        assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), {
          project: 'keep the configured project', url: before.destination, token,
        });
        assert.equal((await stat(path)).mode & 0o777, 0o600);
        assert.equal(sent, 0);
      } finally {
        await close();
      }
    });
  }
});
