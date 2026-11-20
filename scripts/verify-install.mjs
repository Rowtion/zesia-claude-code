import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createInterface } from 'node:readline';

const repo = resolve(import.meta.dirname, '..');
const { version } = JSON.parse(await readFile(join(repo, 'package.json'), 'utf8'));
const archive = process.argv[2] ? resolve(process.argv[2]) : join(repo, 'dist', `zesia-consult-claude-code-${version}.zip`);
const root = await mkdtemp(join(tmpdir(), 'zesia-install-acceptance-'));
const extracted = join(root, 'package');
const configDir = join(root, 'claude-user');
const work = join(root, 'empty-project');
await mkdir(configDir); await mkdir(work);
const privateConfig = join(root, 'zesia-user/claude-code.json');
const env = {
  PATH: process.env.PATH, TMPDIR: tmpdir(), LANG: 'en_US.UTF-8',
  CLAUDE_CONFIG_DIR: configDir, ZESIA_CONFIG: privateConfig,
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
};
await writeFile(join(configDir, 'settings.json'), JSON.stringify({ theme: 'dark', language: 'English' }));
const checks = [];
const report = { version, archive, root, sha256: createHash('sha256').update(await readFile(archive)).digest('hex'), checks };

function command(label, binary, args, options = {}) {
  const result = spawnSync(binary, args, { cwd: work, env, encoding: 'utf8', timeout: 25000, ...options });
  assert.equal(result.status, 0, `${label}: ${result.error?.message || result.stderr || result.stdout}`);
  checks.push({ check: label, passed: true });
  console.log(`PASS ${label}`);
  return result.stdout;
}
const node = (label, args) => command(label, process.execPath, args);
const claude = (label, args) => command(label, 'claude', args);


async function verifyReview(serverPath, token) {
  const mediaType = 'application/vnd.zesia.consult+json';
  const requests = [];
  const service = createServer(async (request, response) => {
    try {
      assert.equal(request.headers.authorization, 'Bearer ' + token);
      requests.push(request.url);
      if (request.url.endsWith('/ack')) return response.end('{}');
      assert.equal(request.url, '/a2a');
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const call = JSON.parse(Buffer.concat(chunks).toString());
      const requestId = request.headers['x-zesia-request-id'];
      assert.match(requestId, /^zrq-\d{13}-[a-f0-9-]{36}$/);
      assert.equal(call.method, 'SendMessage');
      assert.equal(call.params.message.parts[0].data.brief, 'Review the approved synthetic plan.');
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ jsonrpc: '2.0', id: call.id, result: { message: {
        messageId: 'synthetic-reply', contextId: 'synthetic-context', role: 'ROLE_AGENT',
        parts: [{ mediaType, data: {
          format: 'zesia.consult.v0', requestId, consultId: 'synthetic-consult',
          advice: 'The approved synthetic plan reached the original session.',
        } }],
      } } }));
    } catch {
      response.writeHead(400).end('{}');
    }
  });
  await new Promise((resolve, reject) => service.once('error', reject).listen(0, '127.0.0.1', resolve));

  // Observe the package's actual bridge without launching an external browser.
  const shims = join(root, 'browser-shims');
  await mkdir(shims);
  for (const name of ['open', 'xdg-open']) {
    await writeFile(join(shims, name), '#!/bin/sh\nexit 0\n', { mode: 0o700 });
  }
  const child = spawn(process.execPath, [serverPath], {
    cwd: work, stdio: ['pipe', 'pipe', 'inherit'],
    env: {
      ...env,
      PATH: shims + ':' + env.PATH,
      ZESIA_URL: 'http://127.0.0.1:' + service.address().port,
      ZESIA_A2A_CLI: join(repo, 'bin', process.platform === 'win32' ? 'a2a.exe' : 'a2a'),
    },
  });
  const output = createInterface({ input: child.stdout });
  const lines = output[Symbol.asyncIterator]();
  const timeout = setTimeout(() => child.kill(), 15000);
  let id = 0;
  async function rpc(method, params) {
    const requestId = ++id;
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params }) + '\n');
    const line = await lines.next();
    assert.equal(line.done, false, 'The shipped tool server closed before replying.');
    const response = JSON.parse(line.value);
    assert.equal(response.id, requestId);
    assert.ok(!response.error, response.error?.message);
    return response.result;
  }
  const tool = async (name, args) => (await rpc('tools/call', { name, arguments: args })).structuredContent;
  async function review(brief) {
    const prepared = await tool('zesia_consult', { project: 'acceptance', brief, context: { goal: 'Verify exact materials.' } });
    assert.equal(prepared.status, 'awaiting_online_review');
    const url = new URL(prepared.url);
    assert.equal(url.origin, 'https://zesia.dev');
    const capability = new URLSearchParams(url.hash.slice(1));
    const base = 'http://127.0.0.1:' + capability.get('port') + '/bridge/v1/';
    const headers = {
      Origin: url.origin, Authorization: 'Bearer ' + capability.get('key'), 'Content-Type': 'application/json',
    };
    const view = await (await fetch(base + 'view', { headers })).json();
    assert.equal(view.status, 'prepared');
    assert.equal(view.packet.brief, brief);
    assert.equal(view.requestId, prepared.requestId);
    assert.equal(JSON.stringify(view).includes(token), false);
    const { draftId, requestId, approvedHash, destination } = view;
    const body = JSON.stringify({ draftId, requestId, approvedHash, destination, protocolVersion: 1 });
    return { prepared, respond: action => fetch(base + action, { method: 'POST', headers, body }) };
  }
  try {
    const initialized = await rpc('initialize', { protocolVersion: '2025-06-18' });
    assert.equal(initialized.serverInfo.version, version);
    assert.match(initialized.instructions, /https:\/\/zesia\.dev\/consult/);
    const available = (await rpc('tools/list')).tools.map(tool => tool.name);
    for (const name of ['zesia_consult', 'zesia_wait', 'zesia_result']) assert.ok(available.includes(name));
    const first = await review('Review the cancelled synthetic plan.');
    const cancelled = await first.respond('cancel');
    assert.equal(cancelled.status, 200);
    assert.equal((await cancelled.json()).status, 'cancelled');
    assert.equal(requests.length, 0);

    const second = await review('Review the approved synthetic plan.');
    assert.equal(requests.length, 0);
    assert.equal((await second.respond('approve')).status, 202);
    const draftId = second.prepared.draftId;
    const returned = await tool('zesia_wait', { draftId, seconds: 8 });
    const saved = await tool('zesia_result', { draftId });
    for (const result of [returned, saved]) {
      assert.equal(result.consultId, 'synthetic-consult');
      assert.equal(result.a2a.messageId, 'synthetic-reply');
      assert.equal(result.requestId, second.prepared.requestId);
    }
    assert.equal(requests.filter(path => path === '/a2a').length, 1);
    checks.push({ check: 'shipped tool server validates, cancels and returns the approved reply', passed: true });
    console.log('PASS shipped tool server validates, cancels and returns the approved reply');
  } finally {
    clearTimeout(timeout);
    output.close();
    child.kill();
    service.closeAllConnections();
    await new Promise(resolve => service.close(resolve));
  }
}

try {
  report.claudeVersion = claude('installed Claude version', ['--version']).trim();
  const hostVersion = report.claudeVersion.match(/^(\d+)\.(\d+)\.(\d+)/);
  assert.ok(hostVersion, 'Could not parse Claude version');
  const current = hostVersion.slice(1).map(Number);
  assert.ok(current[0] > 2 || current[0] === 2 && (current[1] > 1 || current[1] === 1 && current[2] >= 299), 'Claude Code >= 2.1.299 is required');
  assert.ok(Number(process.versions.node.split('.')[0]) >= 20, 'Node.js >= 20 is required');
  report.nodeVersion = process.versions.node;
  report.administrator = process.getuid?.() === 0;
  assert.equal(report.administrator, false, 'Run installation acceptance without root privileges');
  command('extract distribution', 'unzip', ['-q', archive, '-d', extracted]);
  for (const path of ['package.json', '.claude-plugin/plugin.json']) {
    assert.equal(JSON.parse(await readFile(join(extracted, path), 'utf8')).version, version);
  }
  const validation = JSON.parse(claude('native package validation', ['plugin', 'validate', extracted, '--json']));
  assert.equal(validation.success, true);
  report.directoryWarnings = validation.directory?.findings?.map(({ code, severity }) => ({ code, severity })) || [];
  const configure = join(extracted, 'scripts/configure.mjs');
  const initial = JSON.parse(node('clean configuration has no token', [configure, '--show']));
  assert.equal(initial.tokenConfigured, false);
  assert.equal(initial.confirmBeforeSend, true);
  claude('register marketplace in isolated user profile', ['plugin', 'marketplace', 'add', extracted, '--scope', 'user', '--json']);
  claude('install distribution at user scope', ['plugin', 'install', 'zesia-consult@zesia', '--scope', 'user', '--json']);
  const list = JSON.parse(claude('discover installed version', ['plugin', 'list', '--json']));
  const plugin = list.find(value => value.id === 'zesia-consult@zesia');
  assert.equal(plugin?.version, version);
  assert.equal(plugin.enabled, true);
  assert.ok(plugin.installPath.startsWith(configDir + '/'));
  const settings = JSON.parse(await readFile(join(configDir, 'settings.json'), 'utf8'));
  assert.equal(settings.theme, 'dark'); assert.equal(settings.language, 'English');
  const inventory = claude('discover bundled commands, skills and tool bridge', ['plugin', 'details', 'zesia-consult@zesia']);
  for (const name of ['zesia-consult-prepare', 'zesia-consult-evidence', 'zesia-consult-decision', 'zesia-consult-adopt', 'zesia-settings']) {
    assert.ok(inventory.includes(name), `Missing component ${name}`);
  }
  const synthetic = 'synthetic-install-acceptance-not-a-real-credential';
  const tokenFile = join(root, 'synthetic-token.txt');
  await writeFile(tokenFile, synthetic, { mode: 0o600 });
  const configured = node('configure synthetic token locally', [configure, '--token-file', tokenFile, '--project', 'acceptance']);
  assert.ok(!configured.includes(synthetic));
  assert.equal((await stat(privateConfig)).mode & 0o777, 0o600);
  const shown = node('show settings without exposing token', [configure, '--show']);
  assert.ok(!shown.includes(synthetic));
  assert.equal(JSON.parse(shown).tokenConfigured, true);
  const update = JSON.parse(claude('native update command', ['plugin', 'update', 'zesia-consult@zesia', '--json']));
  assert.equal(update.outcome, 'ok'); assert.equal(update.newVersion, version);
  assert.equal(JSON.parse(await readFile(privateConfig, 'utf8')).token, synthetic);
  claude('native UI event tests from extracted package', ['plugin', 'test', extracted]);
  await verifyReview(join(extracted, 'src/server.mjs'), synthetic);
  report.status = 'passed';
  report.scope = 'Clean local installation, native event tests and a synthetic loopback review with the pinned A2A CLI.';
} catch (error) {
  report.status = 'failed';
  report.error = String(error.message || error);
  process.exitCode = 1;
} finally {
  await writeFile(join(root, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
