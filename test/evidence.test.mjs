import assert from 'node:assert/strict';
import { link, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { assertNoSecrets, captureEvidence, mergeEvidence } from '../src/evidence.mjs';

async function project() {
  return mkdtemp(join(tmpdir(), 'zesia-evidence-'));
}

test('captureEvidence copies a bounded excerpt with provenance and hash', async () => {
  const root = await project();
  await writeFile(join(root, 'sample.txt'), 'one\ntwo\nthree\nfour\nfive\n');
  const [material] = await captureEvidence([{ path: 'sample.txt', startLine: 2, endLine: 3 }], { root });
  assert.match(material.content, /^Source: sample\.txt:2-3\nExcerpt SHA-256: [a-f0-9]{64}\n/u);
  assert.match(material.content, /two\nthree/u);
  assert.doesNotMatch(material.content, /four/u);
});

test('captureEvidence accepts the Read tool trailing empty line without changing file bytes', async () => {
  const root = await project();
  const source = 'one\ntwo\n';
  await writeFile(join(root, 'readme.md'), source);
  const [material] = await captureEvidence([{ path: 'readme.md', startLine: 1, endLine: 3 }], { root });
  assert.ok(material.content.endsWith(source));
  assert.match(material.content, /^Source: readme\.md:1-3\n/);
  await assert.rejects(captureEvidence([{ path: 'readme.md', startLine: 1, endLine: 4 }], { root }), /existing range/);
  await assert.rejects(captureEvidence([{ path: 'readme.md', startLine: 3, endLine: 3 }], { root }), /existing range/);
});

test('captureEvidence refuses credential paths and path escape', async () => {
  const root = await project();
  await writeFile(join(root, '.env'), 'SECRET=1\n');
  await assert.rejects(captureEvidence([{ path: '.env' }], { root }), /credential/u);

  const outside = await mkdtemp(join(tmpdir(), 'zesia-outside-'));
  await writeFile(join(outside, 'outside.txt'), 'secret copy\n');
  await assert.rejects(captureEvidence([{ path: join(outside, 'outside.txt') }], { root }), /outside/u);
});

test('captureEvidence enforces the 200-line and three-file limits', async () => {
  const root = await project();
  await writeFile(join(root, 'long.txt'), Array.from({ length: 250 }, (_, index) => `line ${index + 1}`).join('\n'));
  await assert.rejects(captureEvidence([{ path: 'long.txt', startLine: 1, endLine: 250 }], { root }), /200 lines/u);
  await assert.rejects(
    captureEvidence([{ path: 'long.txt' }, { path: 'long.txt' }, { path: 'long.txt' }, { path: 'long.txt' }], { root }),
    /three/u,
  );
});

test('captureEvidence rejects common credential files and high-confidence secrets', async () => {
  const root = await project();
  await writeFile(join(root, '.npmrc'), '_authToken=secret\n');
  await assert.rejects(captureEvidence([{ path: '.npmrc' }], { root }), /credential/u);

  await writeFile(join(root, 'notes.txt'), '-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n');
  await assert.rejects(captureEvidence([{ path: 'notes.txt' }], { root }), /private key/u);

  assert.throws(() => assertNoSecrets('_authToken=abc123', 'material'), /npm auth token/u);
  assert.throws(() => assertNoSecrets('Authorization: Bearer abcdefghijklmnopqrstuvwxyz', 'material'), /bearer token/u);
  assert.doesNotThrow(() => assertNoSecrets('The password policy requires twelve characters.', 'material'));
});

test('captureEvidence rejects a hardlink that could reach outside the project', async () => {
  const root = await project();
  await writeFile(join(root, 'original.txt'), 'project content\n');
  await link(join(root, 'original.txt'), join(root, 'alias.txt'));
  await assert.rejects(captureEvidence([{ path: 'alias.txt' }], { root }), /hard links/u);
});

test('mergeEvidence rejects conflicting IDs instead of silently replacing content', () => {
  assert.deepEqual(
    mergeEvidence([{ id: 'a', content: 'one' }], [{ id: 'a', content: 'one' }, { id: 'b', content: 'two' }]).map(item => item.id),
    ['a', 'b'],
  );
  assert.throws(() => mergeEvidence([{ id: 'a', content: 'one' }], [{ id: 'a', content: 'changed' }]), /Conflicting/u);
});
