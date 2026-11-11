import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createServer } from '../src/protocol.mjs';

function serverWith(tools) {
  return createServer({ name: 'zesia-consult', version: '0.1.0', tools });
}

test('initialize negotiates the protocol and advertises tools', async () => {
  const response = await serverWith([]).handle({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } },
  });
  assert.equal(response.result.protocolVersion, '2025-06-18');
  assert.equal(response.result.serverInfo.name, 'zesia-consult');
  assert.deepEqual(response.result.capabilities.tools, { listChanged: false });
});

test('tools/list exposes names, descriptions and input schemas only', async () => {
  const server = serverWith([{ name: 'zesia_consult', description: 'prepare', inputSchema: { type: 'object' }, handler: async () => ({}) }]);
  const response = await server.handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.deepEqual(response.result.tools, [{ name: 'zesia_consult', description: 'prepare', inputSchema: { type: 'object' } }]);
});

test('tools/call returns content and marks thrown failures', async () => {
  const server = serverWith([
    { name: 'ok', inputSchema: {}, handler: async args => ({ content: [{ type: 'text', text: JSON.stringify(args) }] }) },
    { name: 'bad', inputSchema: {}, handler: async () => { throw new Error('boom'); } },
  ]);
  const ok = await server.handle({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'ok', arguments: { a: 1 } } });
  assert.equal(ok.result.content[0].text, '{"a":1}');

  const bad = await server.handle({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'bad', arguments: {} } });
  assert.equal(bad.result.isError, true);
  assert.match(bad.result.content[0].text, /boom/u);
});

test('unknown tools and methods return JSON-RPC errors; notifications stay silent', async () => {
  const server = serverWith([]);
  const missingTool = await server.handle({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'nope', arguments: {} } });
  assert.equal(missingTool.error.code, -32602);

  const missingMethod = await server.handle({ jsonrpc: '2.0', id: 6, method: 'resources/list' });
  assert.equal(missingMethod.error.code, -32601);

  assert.equal(await server.handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
});

test('stdio server completes a real MCP handshake', async t => {
  const child = spawn(process.execPath, [fileURLToPath(new URL('../src/server.mjs', import.meta.url))], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  t.after(() => child.kill());

  const lines = [];
  const reader = createInterface({ input: child.stdout });
  const received = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('MCP handshake timed out')), 5000);
    reader.on('line', line => {
      lines.push(JSON.parse(line));
      if (lines.length === 2) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on('error', reject);
  });

  child.stdin.write(`${JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } },
  })}\n`);
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })}\n`);
  await received;

  assert.equal(lines[0].id, 1);
  assert.equal(lines[0].result.serverInfo.name, 'zesia-consult');
  assert.equal(lines[1].id, 2);
  assert.deepEqual(
    lines[1].result.tools.map(tool => tool.name).sort(),
    ['zesia_consult', 'zesia_context', 'zesia_feedback', 'zesia_followup', 'zesia_result', 'zesia_send', 'zesia_settings'],
  );
});
