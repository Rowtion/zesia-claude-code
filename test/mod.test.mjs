import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { setImmediate } from 'node:timers/promises';
import vm from 'node:vm';
import test from 'node:test';
import { createTools } from '../src/tools.mjs';
import { createServer } from '../src/protocol.mjs';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = await readFile(new URL('../hooks/register.tsx', import.meta.url), 'utf8');
const built = ts.transpileModule(source, { compilerOptions: {
  jsx: ts.JsxEmit.React, jsxFactory: 'h', module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText;

function nodes(value) {
  if (Array.isArray(value)) return value.flatMap(nodes);
  return !value || typeof value !== 'object' ? [] : [value, ...nodes(value.children || [])];
}
function contents(value) {
  if (Array.isArray(value)) return value.map(contents).join(' ');
  return value && typeof value === 'object' ? contents(value.children || []) : String(value ?? '');
}
async function harness({ submitError = false, response, call } = {}) {
  const module = { exports: {} };
  vm.runInNewContext(built, { module, exports: module.exports, h: (type, props, ...children) => ({ type, props, children }) });
  const hooks = new Map();
  module.exports.register((name, filter, handler) => {
    hooks.set(name + (typeof filter === 'object' ? ':' + filter.component : ''), handler || filter);
  });
  const calls = { network: 0, send: 0, prompts: [], panes: [], sendArgs: null };
  const { tools } = createTools({
    readConfiguration: async () => ({ url: 'https://api.zesia.dev', token: 'synthetic', project: 'demo' }),
    preflightRequest: async () => ({ ok: true, modelCalls: 0 }),
    requestConsult: async () => {
      calls.network++;
      return response || { format: 'zesia.consult.v0', advice: 'UNIQUE_REAL_TOOL_ADVICE', consultId: 'c1',
        decision: { status: 'advice', recommendation: 'Check the commit boundary.', nextSteps: [] },
        followUp: { requests: [{ id: 'q1', kind: 'evidence', question: 'Show the write order.', whyNeeded: 'Check consistency.', blocking: true }] },
        a2a: { contextId: 'ctx1' } };
    },
  });
  const server = createServer({ tools });
  const scope = {
    ui: { resolve: () => ({ Box: 'Box', Button: 'Button', Text: 'Text' }), invalidate() {}, toast() {},
      open: async args => calls.panes.push(args), close: async () => {} },
    prompt: { submit: async value => { if (submitError) { submitError = false; throw new Error('Chat is unavailable.'); } calls.prompts.push(value); } },
    mcp: { call: async (_server, name, args) => {
      calls.send++;
      calls.sendArgs = args;
      if (call) return call();
      return (await server.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })).result;
    } },
  };
  const run = async (name, args) => {
    const result = (await server.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })).result;
    await hooks.get('tool.call')(scope, { tool: `mcp__zesia__${name}` }, async () => ({ result }));
    return result;
  };
  const pane = () => hooks.get('ui.render:Pane')(scope, { props: { bodyColumns: 40 } });
  const press = async label => {
    const button = nodes(await pane()).find(n => n.type === 'Button' && n.props.label === label);
    assert.ok(button, `Missing button: ${label}`);
    await button.props.onPress();
    for (let i = 0; i < 5; i++) await setImmediate();
  };
  await run('zesia_consult', { brief: 'Review the write order.', context: { goal: 'Avoid inconsistent artifacts.',
    materials: [{ id: 'diff-1', content: 'ORIGINAL_CODE_EVIDENCE' }] } });
  return { calls, run, pane, press };
}

test('native confirmation forwards the actual result from the real tools and protocol', async () => {
  const h = await harness();
  assert.equal(h.calls.network, 0);
  await h.press('Confirm and send');
  assert.equal(h.calls.network, 1);
  assert.equal(h.calls.prompts.length, 1);
  assert.equal('packet' in h.calls.sendArgs, false);
  assert.match(h.calls.prompts[0].text, /zesia_result/);
  assert.ok(h.calls.prompts[0].text.includes(h.calls.sendArgs.draftId));
  assert.doesNotMatch(h.calls.prompts[0].text, /UNIQUE_REAL_TOOL_ADVICE|ORIGINAL_CODE_EVIDENCE/);
  const result = await h.run('zesia_result', { draftId: h.calls.sendArgs.draftId });
  assert.equal(result.structuredContent.advice, 'UNIQUE_REAL_TOOL_ADVICE');
  assert.doesNotMatch(JSON.stringify(result), /ORIGINAL_CODE_EVIDENCE/);
  assert.equal(h.calls.network, 1);
  assert.notEqual(h.calls.prompts[0].asUser, true);
});

test('confirm acknowledges a click before a slow consultation returns, without sending twice', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const h = await harness({ call: () => pending });
  const click = h.press('Confirm and send');
  const acknowledged = await Promise.race([
    click.then(() => true),
    new Promise(resolve => setTimeout(() => resolve(false), 50)),
  ]);
  assert.equal(h.calls.send, 1);
  assert.equal(h.calls.prompts.length, 0);
  assert.ok(!nodes(await h.pane()).some(n => n.type === 'Button' && n.props.label === 'Confirm and send'));
  release({ structuredContent: { ok: true, advice: 'SLOW_RESULT' } });
  await click;
  for (let i = 0; i < 5; i++) await setImmediate();
  assert.equal(acknowledged, true, 'The UI callback must not wait for the cloud request.');
  assert.equal(h.calls.send, 1);
  assert.equal(h.calls.prompts.length, 1);
  assert.doesNotMatch(h.calls.prompts[0].text, /SLOW_RESULT/);
});

test('follow-up tools reopen the confirmation pane without sending', async () => {
  const h = await harness();
  await h.press('Confirm and send');
  await h.run('zesia_followup', { consultId: 'c1', answers: [{ requestId: 'q1', text: 'File is published before SET NX.', sourceRef: 'tool:read' }] });
  assert.equal(h.calls.panes.length, 2);
  await h.press('Review materials (2)');
  assert.match(contents(await h.pane()), /File is published before SET NX/);
  assert.equal(h.calls.network, 1);
});

test('guidance stays explicitly unreviewed when returned to chat', async () => {
  const h = await harness({ response: { format: 'zesia.consult.v0', advice: 'Try checking the supplied evidence.',
    consultId: 'guidance-1', deliveryKind: 'guidance', qualityStatus: 'not_reviewed',
    decision: { status: 'advice', recommendation: 'Check evidence.', nextSteps: [] } } });
  await h.press('Confirm and send');
  const result = await h.run('zesia_result', { draftId: h.calls.sendArgs.draftId });
  assert.match(result.content[0].text, /no expert review was completed/);
  assert.equal(result.structuredContent.consultation.deliveryKind, 'guidance');
});

test('returning a received result can be retried without sending again', async () => {
  const h = await harness({ submitError: true });
  await h.press('Confirm and send');
  assert.match(contents(await h.pane()), /Chat is unavailable/);
  await h.press('Return result to chat');
  assert.equal(h.calls.network, 1);
  assert.equal(h.calls.send, 1);
  assert.equal(h.calls.prompts.length, 1);
});

test('unreadable send response never submits null or enables another send', async () => {
  const h = await harness({ call: () => ({ content: [{ type: 'text', text: 'Unrecognized result' }] }) });
  await h.press('Confirm and send');
  assert.equal(h.calls.prompts.length, 0);
  assert.match(contents(await h.pane()), /unrecognized result/i);
  assert.ok(!nodes(await h.pane()).some(n => n.type === 'Button' && n.props.label === 'Confirm and send'));
});

test('review shows readable evidence and keeps exact JSON behind a secondary control', async () => {
  const h = await harness();
  assert.match(contents(await h.pane()), /Review the write order/);
  await h.press('Review materials (1)');
  assert.match(contents(await h.pane()), /ORIGINAL_CODE_EVIDENCE/);
  assert.ok(!contents(await h.pane()).includes('"requester":'));
  await h.press('View raw JSON');
  assert.match(contents(await h.pane()), /"requester":/);
});

test('unknown delivery remains visible and never triggers a second send', async () => {
  const h = await harness({ call: () => { throw new Error('Connection lost.'); } });
  const beforeSend = await h.run('zesia_result', { draftId: 'missing' });
  assert.equal(beforeSend.structuredContent.errorCode, 'result_unavailable');
  assert.equal(h.calls.network, 0);
  await h.press('Confirm and send');
  assert.equal(h.calls.send, 1);
  assert.equal(h.calls.prompts.length, 0);
  assert.match(contents(await h.pane()), /Delivery could not be confirmed.*Connection lost/);
  assert.ok(!nodes(await h.pane()).some(n => n.type === 'Button' && n.props.label === 'Confirm and send'));
});
