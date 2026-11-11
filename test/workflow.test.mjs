import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { createWorkflow } from '../src/workflow.mjs';

function harness({ confirmBeforeSend = true, followUp = [], assessment = '评估内容' } = {}) {
  const config = {
    url: 'https://api.zesia.dev',
    token: 'token',
    project: 'demo',
    confirmBeforeSend,
    path: '/tmp/zesia-test.json',
  };
  const calls = { preflight: 0, consult: 0, consultInputs: [] };
  const result = contextId => ({
    format: 'zesia.consult.v0',
    advice: '建议正文',
    consultId: 'consult-1',
    decision: {
      status: 'advice',
      assessment,
      recommendation: '建议内容',
      nextSteps: [{ action: '动作', successCriteria: '标准' }],
    },
    followUp: { requests: followUp, round: 1, maxRounds: 3 },
    a2a: { contextId: contextId || 'ctx-1', messageId: 'msg-1', historyRetained: false },
  });
  const workflow = createWorkflow({
    readConfiguration: async () => ({ ...config }),
    preflightRequest: async () => {
      calls.preflight += 1;
      return { format: 'zesia.consult.preflight.v1', ok: true, modelCalls: 0 };
    },
    requestConsult: async ({ input, contextId }) => {
      calls.consult += 1;
      calls.consultInputs.push({ input, contextId });
      return result(contextId);
    },
    now: () => 1_000_000,
    root: tmpdir(),
  });
  return { workflow, calls, config };
}

async function prepared(workflow) {
  return workflow.prepareConsult({
    brief: '检查回滚路径',
    context: {
      goal: '确认方案能保证什么',
      statements: [{
        id: 's1', kind: 'constraint', origin: 'user_statement',
        text: '不能丢任务', sourceRef: 'conversation:user', sourceQuote: '不能靠丢任务来避免重复。',
      }],
    },
  });
}

test('prepareConsult creates a local draft with zero network calls', async () => {
  const { workflow, calls } = harness();
  const value = await prepared(workflow);
  assert.equal(value.ok, true);
  assert.equal(value.status, 'awaiting_confirmation');
  assert.equal(value.draft.packet.requester, 'Claude Code');
  assert.equal(value.draft.packet.project, 'demo');
  assert.equal(value.draft.destination, 'https://api.zesia.dev');
  assert.equal(calls.preflight, 0);
  assert.equal(calls.consult, 0);
});

test('sendDraft rejects a changed or unapproved packet, then sends exactly once', async () => {
  const { workflow, calls } = harness();
  const value = await prepared(workflow);

  const tampered = await workflow.sendDraft({ draftId: value.draft.id, approvedHash: 'not-the-hash' });
  assert.equal(tampered.ok, false);
  assert.equal(tampered.errorCode, 'preview_changed');
  assert.equal(calls.consult, 0);

  const noConfirmation = await workflow.sendDraft({ draftId: value.draft.id, approvedHash: value.draft.hash });
  assert.equal(noConfirmation.ok, false);
  assert.equal(noConfirmation.errorCode, 'confirmation_required');
  assert.equal(calls.consult, 0);

  const unconfirmed = await workflow.sendDraft({ draftId: value.draft.id, approvedHash: value.draft.hash, packet: value.draft.packet });
  assert.equal(unconfirmed.ok, false);
  assert.equal(unconfirmed.errorCode, 'confirmation_required');
  assert.equal(calls.consult, 0);

  const sent = await workflow.sendDraft({ draftId: value.draft.id, approvedHash: value.draft.hash, packet: value.draft.packet, confirmation: '确认发送' });
  assert.equal(sent.ok, true);
  assert.equal(sent.advice, '建议正文');
  assert.equal(sent.consultation.consultId, 'consult-1');
  assert.equal(sent.delivery.payloadSha256, value.draft.hash);
  assert.equal(sent.delivery.approvedBy, '确认发送');
  assert.equal(calls.preflight, 1);
  assert.equal(calls.consult, 1);
  assert.equal(calls.consultInputs[0].input.requester, 'Claude Code');

  const cached = await workflow.sendDraft({ draftId: value.draft.id, approvedHash: value.draft.hash, packet: value.draft.packet });
  assert.equal(cached.cached, true);
  assert.equal(calls.consult, 1);
});

test('confirmed sends use the stored reviewed draft without asking the agent to reconstruct nested context', async () => {
  const { workflow, calls } = harness();
  const draft = await prepared(workflow);
  const result = await workflow.sendDraft({ draftId: draft.draft.id, approvedHash: draft.draft.hash, confirmation: 'Send the exact packet I reviewed.' });
  assert.equal(result.ok, true, result.errorMessage);
  assert.deepEqual(calls.consultInputs[0].input, draft.draft.packet);
  assert.equal(result.delivery.payloadSha256, draft.draft.hash);
  assert.equal(calls.consult, 1);
});

test('sendDraft accepts the same packet re-emitted with a different key order', async () => {
  const { workflow, calls } = harness();
  const value = await prepared(workflow);
  const reversed = Object.fromEntries(Object.entries(value.draft.packet).reverse());
  reversed.context = Object.fromEntries(Object.entries(value.draft.packet.context).reverse());
  const sent = await workflow.sendDraft({
    draftId: value.draft.id,
    approvedHash: value.draft.hash,
    packet: reversed,
    confirmation: '确认发送',
  });
  assert.equal(sent.ok, true);
  assert.equal(calls.consult, 1);
});

test('preparation never transmits, regardless of a stored confirmBeforeSend=false', async () => {
  const { workflow, calls } = harness({ confirmBeforeSend: false });
  const value = await prepared(workflow);
  assert.equal(value.ok, true);
  assert.equal(value.status, 'awaiting_confirmation');
  assert.equal(calls.preflight, 0);
  assert.equal(calls.consult, 0);
});

test('follow-up builds round two on the same A2A context and is single-use', async () => {
  const followUp = [{ id: 'q1', kind: 'evidence', question: '需要写入顺序', whyNeeded: '判断竞态', blocking: true }];
  const { workflow, calls } = harness({ followUp });
  const first = await prepared(workflow);
  await workflow.sendDraft({ draftId: first.draft.id, approvedHash: first.draft.hash, packet: first.draft.packet, confirmation: '确认发送' });

  const inspected = workflow.inspect('consult-1');
  assert.equal(inspected.round, 1);
  assert.equal(inspected.maxRounds, 3);
  assert.equal(inspected.followUp[0].id, 'q1');

  const next = await workflow.prepareFollowup({
    consultId: 'consult-1',
    answers: [{ requestId: 'q1', text: '先写文件再记录', sourceRef: 'reports.py:88-91' }],
  });
  assert.equal(next.ok, true);
  assert.equal(next.status, 'awaiting_confirmation');
  assert.equal(next.draft.packet.context.continuation.round, 2);
  assert.ok(next.draft.packet.context.previousAdvice.includes('建议内容'));

  const moved = structuredClone(next.draft.packet);
  moved.continuation = moved.context.continuation;
  delete moved.context.continuation;
  const changed = await workflow.sendDraft({ draftId: next.draft.id, approvedHash: next.draft.hash, packet: moved, confirmation: 'Send this test follow-up.' });
  assert.equal(changed.errorCode, 'preview_changed');
  assert.equal(calls.consult, 1);

  // One parent response may produce only one follow-up draft, confirmed or not.
  const duplicate = await workflow.prepareFollowup({ consultId: 'consult-1', answers: [{ requestId: 'q1', text: 'again', sourceRef: 'x' }] });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.errorCode, 'followup_consumed');

  const sent = await workflow.sendDraft({ draftId: next.draft.id, approvedHash: next.draft.hash, confirmation: '确认发送' });
  assert.equal(sent.ok, true);
  assert.equal(calls.consultInputs[1].contextId, 'ctx-1');
  assert.equal(calls.consultInputs[1].input.context.continuation.round, 2);
  assert.equal(calls.consultInputs[1].input.continuation, undefined);
});

test('observable clarification can be answered with evidence and no user quote', async () => {
  const followUp = [{ id: 'q3', kind: 'clarification', question: '部署的是哪个 Node 主版本？', whyNeeded: '兼容性', blocking: false }];
  const { workflow } = harness({ followUp });
  const first = await prepared(workflow);
  await workflow.sendDraft({ draftId: first.draft.id, approvedHash: first.draft.hash, packet: first.draft.packet, confirmation: '确认发送' });
  const next = await workflow.prepareFollowup({
    consultId: 'consult-1',
    answers: [{ requestId: 'q3', text: 'engines.node >=24', sourceRef: 'package.json:engines' }],
  });
  assert.equal(next.ok, true);
  assert.equal(next.status, 'awaiting_confirmation');
});

test('follow-up retains a complete long expert assessment without applying the input-note cap', async () => {
  const assessment = 'The losing execution must never overwrite the artifact referenced by the completed record. '.repeat(80).trim();
  const { workflow, calls } = harness({ assessment, followUp: [{ id: 'storage', kind: 'evidence', question: 'Which storage guarantees apply?', whyNeeded: 'Select a safe commit protocol.', blocking: false }] });
  const first = await prepared(workflow);
  await workflow.sendDraft({ draftId: first.draft.id, approvedHash: first.draft.hash, packet: first.draft.packet, confirmation: 'Send this test packet.' });
  const next = await workflow.prepareFollowup({ consultId: 'consult-1', answers: [{ requestId: 'storage', text: 'Synthetic immutable objects and an atomic winner record.', sourceRef: 'fixture:storage' }] });
  assert.equal(next.ok, true, next.errorMessage);
  assert.ok(next.draft.packet.context.previousAdvice.includes(assessment));
  assert.equal(calls.consult, 1, 'Preparing the follow-up must not send it.');
});

test('follow-up stops at three rounds', async () => {
  const followUp = [{ id: 'q1', kind: 'evidence', question: 'q', whyNeeded: 'w', blocking: false }];
  const { workflow } = harness({ followUp });
  const first = await prepared(workflow);
  await workflow.sendDraft({ draftId: first.draft.id, approvedHash: first.draft.hash, packet: first.draft.packet, confirmation: '确认发送' });

  for (const round of [2, 3]) {
    const next = await workflow.prepareFollowup({
      consultId: 'consult-1',
      answers: [{ requestId: 'q1', text: `round ${round}`, sourceRef: 'x' }],
    });
    assert.equal(next.ok, true, `round ${round} should prepare`);
    await workflow.sendDraft({ draftId: next.draft.id, approvedHash: next.draft.hash, packet: next.draft.packet, confirmation: '确认发送' });
  }
  const blocked = await workflow.prepareFollowup({
    consultId: 'consult-1',
    answers: [{ requestId: 'q1', text: 'round 4', sourceRef: 'x' }],
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.errorCode, 'round_limit');
});

test('user decisions require an exact quote, not just a source reference', async () => {
  const followUp = [{ id: 'q2', kind: 'user_decision', question: '接受这个风险吗？', whyNeeded: '影响方案', blocking: true }];
  const { workflow } = harness({ followUp });
  const first = await prepared(workflow);
  await workflow.sendDraft({ draftId: first.draft.id, approvedHash: first.draft.hash, packet: first.draft.packet, confirmation: '确认发送' });

  const missing = await workflow.prepareFollowup({
    consultId: 'consult-1',
    answers: [{ requestId: 'q2', text: '接受', sourceRef: 'conversation:user' }],
  });
  assert.equal(missing.ok, false);
  assert.match(missing.errorMessage, /quote/u);

  const quoted = await workflow.prepareFollowup({
    consultId: 'consult-1',
    answers: [{ requestId: 'q2', text: '接受', sourceRef: 'conversation:user', sourceQuote: '我接受这个风险。' }],
  });
  assert.equal(quoted.ok, true);
});

test('feedback must cover every recommendation and step exactly once', async () => {
  const { workflow } = harness();
  const first = await prepared(workflow);
  await workflow.sendDraft({ draftId: first.draft.id, approvedHash: first.draft.hash, packet: first.draft.packet, confirmation: '确认发送' });

  const incomplete = workflow.recordFeedback({ consultId: 'consult-1', nextStep: '继续' });
  assert.equal(incomplete.ok, false);
  assert.deepEqual(incomplete.expectedTargets, ['recommendation', 'step:0']);

  const complete = workflow.recordFeedback({
    consultId: 'consult-1',
    accepted: [{ target: 'recommendation', reason: '符合约束', change: '保留方案' }],
    declined: [{ target: 'step:0', reason: '已有实现', change: '改为验证现有实现' }],
    nextStep: '运行现有测试',
  });
  assert.equal(complete.ok, true);
  assert.equal(complete.feedback.workExecuted, false);
});

test('prepare rejects materials or statements containing high-confidence credentials', async () => {
  const { workflow } = harness();
  const value = await workflow.prepareConsult({
    brief: 'review this',
    context: { materials: [{ id: 'm1', content: '-----BEGIN RSA PRIVATE KEY-----\nMIIE...' }] },
  });
  assert.equal(value.ok, false);
  assert.match(value.errorMessage, /private key/u);
});

test('settings reports the local confirmation mode as read-only', async () => {
  const { workflow } = harness();
  const current = await workflow.settings({});
  assert.equal(current.confirmBeforeSend, true);
  assert.equal(current.destination, 'https://api.zesia.dev');
  assert.equal(current.changeVia.includes('none'), true);
  assert.match(current.note, /Automatic sending is not supported/u);
});
