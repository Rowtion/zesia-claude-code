import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const packageScript = join(root, 'scripts/package.mjs');
const dependency = 'node_modules/@zesia/runtime';

test('release metadata matches the bundled Runtime and a stale bundle cannot replace it', async t => {
  const scratch = join(root, 'dist');
  await mkdir(scratch, { recursive: true });
  const fixture = await mkdtemp(join(scratch, 'release-test-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  await mkdir(join(fixture, dependency), { recursive: true });
  await mkdir(join(fixture, 'dist/plugin'), { recursive: true });
  for (const relative of ['package.json', 'package-lock.json', dependency + '/package.json']) {
    await copyFile(join(root, relative), join(fixture, relative));
  }

  const lock = JSON.parse(await readFile(join(fixture, 'package-lock.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(join(fixture, 'package.json'), 'utf8'));
  const runtimeVersion = lock.packages[dependency].version;
  const stagedManifest = join(fixture, 'dist/plugin/package.json');
  await writeFile(stagedManifest, JSON.stringify({ name: manifest.name, version: manifest.version, runtimeVersion }));

  const pack = () => execFileSync(process.execPath, [packageScript], { cwd: fixture, stdio: 'pipe' });
  pack();
  const releaseFile = join(fixture, 'dist/release.json');
  const originalManifest = await readFile(releaseFile, 'utf8');
  const release = JSON.parse(originalManifest);
  assert.equal(release.runtimeVersion, runtimeVersion);
  assert.equal(release.version, manifest.version);
  const archive = join(fixture, 'dist', release.file);
  const originalArchive = await readFile(archive);
  const bundle = execFileSync('unzip', ['-p', archive, 'package.json'], { encoding: 'utf8' });
  assert.equal(JSON.parse(bundle).runtimeVersion, release.runtimeVersion);

  for (const stale of [{ runtimeVersion: '0.0.0' }, { version: '0.0.0' }]) {
    await writeFile(stagedManifest, JSON.stringify({ name: manifest.name, version: manifest.version, runtimeVersion, ...stale }));
    assert.throws(pack, /Rebuild the Claude Code bundle/);
    assert.equal(await readFile(releaseFile, 'utf8'), originalManifest);
    assert.deepEqual(await readFile(archive), originalArchive);
  }

  await writeFile(join(fixture, dependency, 'package.json'), JSON.stringify({ name: '@zesia/runtime', version: '0.0.0' }));
  assert.throws(pack, /Install the pinned Zesia Runtime/);
  assert.deepEqual(await readFile(archive), originalArchive);
});
