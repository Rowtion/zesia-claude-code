import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

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
  // Exercises the actual shipped stdio server, not a source-tree import. Never
  // call zesia_send: no consultation data, preflight or model request is sent.
  const messages = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'acceptance', version: '1' } } },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'zesia_consult', arguments: { brief: 'Review synthetic write order.', context: { goal: 'Check consistency.' } } } },
  ];
  const output = command('shipped tool server initializes and prepares a local draft', process.execPath, [join(extracted, 'src/server.mjs')], {
    input: messages.map(value => JSON.stringify(value)).join('\n') + '\n',
  });
  const replies = output.trim().split('\n').map(line => JSON.parse(line));
  assert.equal(replies.find(value => value.id === 1).result.serverInfo.version, version);
  assert.equal(replies.find(value => value.id === 2).result.tools.length, 6);
  assert.equal(replies.find(value => value.id === 3).result.structuredContent.status, 'awaiting_confirmation');
  report.status = 'passed';
  report.scope = 'Clean local installation and native event tests; no real model call or painted UI verification.';
} catch (error) {
  report.status = 'failed';
  report.error = String(error.message || error);
  process.exitCode = 1;
} finally {
  await writeFile(join(root, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
