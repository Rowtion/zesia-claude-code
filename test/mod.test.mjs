import assert from 'node:assert/strict';
import { createServer as createHttpServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import { createTools } from '../src/tools.mjs';
import { createServer } from '../src/protocol.mjs';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = await readFile(new URL('../hooks/register.tsx', import.meta.url), 'utf8');
const built = ts.transpileModule(source, {
  compilerOptions: {
    jsx: ts.JsxEmit.React,
    jsxFactory: 'h',
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

async function harness({ submitError = false, response, consultError } = {}) {
  const module = { exports: {} };
  vm.runInNewContext(built, { module, exports: module.exports, h: (type, props, ...children) => ({ type, props, children }) });
  const hooks = new Map();
  module.exports.register((name, handler) => hooks.set(name, handler));

  const calls = { network: 0, prompts: [], toasts: [] };
  const remote = createHttpServer(async (req, res) => {
    for await (const _ of req) {}
    res.setHeader('content-type', 'application/json');
    if (req.url === '/v1/consult/preflight') {
      return res.end(JSON.stringify({ format: 'zesia.consult.preflight.v1', ok: true, modelCalls: 0 }));
    }
    if (req.url.startsWith('/v1/consult/requests/')) {
      return res.end(JSON.stringify({ requestId: req.url.split('/').at(-1), state: 'running' }));
    }
    res.statusCode = 404;
    res.end('{}');
  });
  await new Promise(resolve => remote.listen(0, '127.0.0.1', resolve));
  const remoteUrl = 'http://127.0.0.1:' + remote.address().port;

  const { tools, close: closeTools } = createTools({
    readConfiguration: async () => ({ url: remoteUrl, token: 'synthetic-claude-test-token', project: 'demo' }),
    openBrowser: false,
    requestConsult: async ({ contextId }) => {
      calls.network++;
      if (consultError) throw consultError;
      return response || {
        format: 'zesia.consult.v0',
        advice: 'UNIQUE_REAL_TOOL_ADVICE',
        consultId: 'c1',
        decision: {
          status: 'advice',
          recommendation: 'Check the commit boundary.',
          nextSteps: [{ action: 'Verify', successCriteria: 'Tests pass' }],
        },
        followUp: {
          requests: [{ id: 'q1', kind: 'evidence', question: 'Show the write order.', whyNeeded: 'Check consistency.', blocking: true }],
        },
        a2a: { contextId: contextId || 'ctx1', messageId: 'msg1' },
      };
    },
  });
  const server = createServer({ tools });
  const scope = {
    ui: { toast: (message, options) => calls.toasts.push({ message, options }) },
    prompt: {
      submit: async value => {
        if (submitError) {
          submitError = false;
          throw new Error('Chat is unavailable.');
        }
        calls.prompts.push(value);
      },
    },
  };
  const run = async (name, args) => {
    const result = (await server.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })).result;
    await hooks.get('tool.call')(scope, { tool: `mcp__zesia__${name}` }, async () => ({ result }));
    return result;
  };
  const close = async () => {
    await closeTools();
    remote.closeAllConnections();
    await new Promise(resolve => remote.close(resolve));
  };
  return { hooks, scope, calls, run, close, remoteUrl };
}

async function approveBridge(url) {
  const parsed = new URL(url);
  assert.equal(parsed.origin, 'https://zesia.dev');
  const params = new URLSearchParams(parsed.hash.slice(1));
  const origin = 'http://127.0.0.1:' + params.get('port');
  const headers = { Origin: 'https://zesia.dev', Authorization: 'Bearer ' + params.get('key'), 'Content-Type': 'application/json' };
  const view = await (await fetch(origin + '/bridge/v1/view', { headers })).json();
  assert.equal(JSON.stringify(view).includes('synthetic-claude-test-token'), false);
  const sent = await fetch(origin + '/bridge/v1/approve', {
    method: 'POST',
    headers,
    body: JSON.stringify({ protocolVersion: 1, draftId: view.draftId, requestId: view.requestId, approvedHash: view.approvedHash, destination: view.destination }),
  });
  assert.equal(sent.status, 202);
  return view;
}

test('reply action submits online-window review prompt and surfaces prompt failures', async () => {
  const { hooks, scope, calls, close } = await harness({ submitError: true });
  try {
    const actions = await hooks.get('assistant.message.actions')(scope, { role: 'assistant' });
    assert.equal(actions.length, 1);
    await actions[0].onClick();
    assert.equal(calls.toasts[0].options.tone, 'error');
    await actions[0].onClick();
    assert.equal(calls.prompts.length, 1);
    assert.match(calls.prompts[0], /https:\/\/zesia\.dev\/consult/);
  } finally {
    await close();
  }
});

test('zesia_consult opens shared online bridge with zero network calls and zesia_wait retrieves result', async () => {
  const { calls, run, close } = await harness();
  try {
    const prepared = await run('zesia_consult', { project: 'demo', brief: 'Check the write order.', context: { goal: 'Prevent lost updates.' } });
    const value = prepared.structuredContent;
    assert.equal(value.status, 'awaiting_online_review');
    assert.equal(calls.network, 0);
    assert.equal(calls.toasts.at(-1).message, 'Review and approve in the shared zesia.dev/consult window.');

    await approveBridge(value.url);

    const waited = await run('zesia_wait', { draftId: value.draftId, seconds: 5 });
    assert.equal(waited.structuredContent.ok, true);
    assert.equal(waited.structuredContent.consultId, 'c1');
    assert.equal(waited.structuredContent.advice, 'UNIQUE_REAL_TOOL_ADVICE');
    assert.equal(calls.network, 1);

    const repeated = await run('zesia_result', { draftId: value.draftId });
    assert.equal(repeated.structuredContent.consultId, 'c1');
    assert.equal(calls.network, 1);

    const ctx = await run('zesia_context', { consultId: 'c1' });
    assert.equal(ctx.structuredContent.round, 1);
    assert.equal(ctx.structuredContent.remainingRounds, 2);

    const fb = await run('zesia_feedback', {
      consultId: 'c1',
      accepted: [
        { target: 'recommendation', reason: 'Confirmed', change: 'Check boundary' },
        { target: 'step:0', reason: 'Needed', change: 'Run tests' },
      ],
      nextStep: 'Run verification tests',
    });
    assert.equal(fb.structuredContent.ok, true);
  } finally {
    await close();
  }
});

test('zesia_followup opens a fresh online bridge on the same A2A contextId', async () => {
  const { calls, run, close } = await harness();
  try {
    const first = (await run('zesia_consult', { project: 'demo', brief: 'Check the write order.', context: { goal: 'Prevent lost updates.' } })).structuredContent;
    await approveBridge(first.url);
    await run('zesia_wait', { draftId: first.draftId, seconds: 5 });

    const followup = (await run('zesia_followup', {
      consultId: 'c1',
      answers: [{ requestId: 'q1', text: 'Writes commit before response.', sourceRef: 'src/index.mjs:10' }],
    })).structuredContent;
    assert.equal(followup.status, 'awaiting_online_review');
    assert.equal(calls.network, 1);

    await approveBridge(followup.url);
    const second = (await run('zesia_wait', { draftId: followup.draftId, seconds: 5 })).structuredContent;
    assert.equal(second.a2a.contextId, 'ctx1');
    assert.equal(calls.network, 2);
  } finally {
    await close();
  }
});

test('zesia_settings reports online-loopback without exposing credentials', async () => {
  const { run, close, remoteUrl } = await harness();
  try {
    const settings = (await run('zesia_settings', {})).structuredContent;
    assert.equal(settings.ok, true);
    assert.equal(settings.destination, remoteUrl);
    assert.equal(settings.configured, true);
    assert.equal(settings.reviewSurface, 'online-loopback');
    assert.equal(JSON.stringify(settings).includes('synthetic-claude-test-token'), false);
  } finally {
    await close();
  }
});
