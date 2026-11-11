import assert from 'node:assert/strict';
import test from 'node:test';
import { consultOverA2A, CONSULT_MEDIA_TYPE, preflightConsult } from '../src/a2a.mjs';

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'content-type': 'application/json' },
});

function consultationResponse({ contextId = 'ctx-1' } = {}) {
  return json({
    jsonrpc: '2.0',
    id: 'rpc-1',
    result: {
      message: {
        messageId: 'msg-1',
        contextId,
        role: 'ROLE_AGENT',
        parts: [
          { text: 'advice text' },
          {
            mediaType: CONSULT_MEDIA_TYPE,
            data: {
              format: 'zesia.consult.v0',
              advice: 'advice text',
              consultId: 'consult-1',
              decision: { status: 'advice' },
              followUp: { requests: [] },
            },
          },
        ],
      },
    },
  });
}

test('preflight posts the exact request and validates the contract', async () => {
  const calls = [];
  const result = await preflightConsult({
    url: 'https://api.zesia.dev',
    token: 'token',
    input: { brief: 'x' },
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      return json({ format: 'zesia.consult.preflight.v1', ok: true, modelCalls: 0, inputBytes: 12 });
    },
  });
  assert.equal(result.ok, true);
  assert.equal(calls[0].url, 'https://api.zesia.dev/v1/consult/preflight');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.authorization, 'Bearer token');
  assert.deepEqual(JSON.parse(calls[0].init.body), { brief: 'x' });
});

test('preflight surfaces authentication failures', async () => {
  await assert.rejects(
    preflightConsult({
      url: 'https://api.zesia.dev',
      token: 'bad',
      input: {},
      fetch: async () => json({ error: 'unauthorized' }, 401),
    }),
    error => error.code === 'authentication_failed',
  );
});

test('consult sends A2A 1.0 SendMessage with one structured data part', async () => {
  const calls = [];
  const result = await consultOverA2A({
    url: 'https://api.zesia.dev',
    token: 'token',
    input: { requester: 'Claude Code', project: 'demo', brief: 'check', context: {} },
    clientRequestId: 'client-request-1',
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      return consultationResponse();
    },
  });

  assert.equal(result.advice, 'advice text');
  assert.equal(result.consultId, 'consult-1');
  assert.equal(result.a2a.contextId, 'ctx-1');
  assert.equal(calls[0].url, 'https://api.zesia.dev/a2a');
  assert.equal(calls[0].init.headers['a2a-version'], '1.0');
  assert.equal(calls[0].init.headers.authorization, 'Bearer token');
  assert.equal(calls[0].init.redirect, 'error');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.method, 'SendMessage');
  assert.equal(body.params.message.role, 'ROLE_USER');
  assert.equal(body.params.message.messageId, 'client-request-1');
  assert.equal(body.params.message.parts.length, 1);
  assert.equal(body.params.message.parts[0].mediaType, CONSULT_MEDIA_TYPE);
  assert.deepEqual(Object.keys(body.params.message.parts[0].data).sort(), ['brief', 'context', 'project', 'requester']);
  assert.deepEqual(Object.keys(body.params.message).sort(), ['messageId', 'parts', 'role']);
});

test('consult generates an A2A messageId and rejects an invalid caller ID', async () => {
  let body;
  const result = await consultOverA2A({
    url: 'https://api.zesia.dev',
    token: 'token',
    input: { requester: 'Claude Code', project: 'demo', brief: 'check', context: {} },
    fetch: async (_url, init) => {
      body = JSON.parse(init.body);
      return consultationResponse();
    },
  });
  assert.match(body.params.message.messageId, /^[0-9a-f-]{36}$/u);
  assert.equal(result.a2a.messageId, 'msg-1');
  await assert.rejects(
    consultOverA2A({ url: 'https://api.zesia.dev', token: 'token', input: {}, clientRequestId: '', fetch: async () => consultationResponse() }),
    /client request ID/u,
  );
});

test('consult reuses a provided contextId and rejects continuity loss', async () => {
  const reused = await consultOverA2A({
    url: 'https://api.zesia.dev',
    token: 'token',
    input: {},
    contextId: 'ctx-1',
    fetch: async (_url, init) => {
      assert.equal(JSON.parse(init.body).params.message.contextId, 'ctx-1');
      return consultationResponse({ contextId: 'ctx-1' });
    },
  });
  assert.equal(reused.a2a.contextId, 'ctx-1');

  await assert.rejects(
    consultOverA2A({
      url: 'https://api.zesia.dev',
      token: 'token',
      input: {},
      contextId: 'ctx-2',
      fetch: async () => consultationResponse({ contextId: 'ctx-1' }),
    }),
    /continuity/u,
  );
});

test('consult surfaces structured A2A ErrorInfo metadata', async () => {
  await assert.rejects(
    consultOverA2A({
      url: 'https://api.zesia.dev',
      token: 'token',
      input: {},
      fetch: async () => json({
        jsonrpc: '2.0',
        id: 'rpc-1',
        error: {
          code: -32602,
          message: 'Request rejected.',
          data: [{
            '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
            domain: 'a2a-protocol.org',
            metadata: { consultCode: 'consult_input_too_large', failure: '{"code":"consult_input_too_large","message":"too large"}' },
          }],
        },
      }),
    }),
    error => error.code === 'consult_input_too_large' && error.metadata.consultCode === 'consult_input_too_large',
  );
});
