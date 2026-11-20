import {cp,mkdir,readFile,readdir,rm,utimes,writeFile} from 'node:fs/promises';
import{join}from'node:path';import{execFileSync}from'node:child_process';import{createHash}from'node:crypto';
export async function copy(source,target,names){await mkdir(target,{recursive:true});for(const name of names)await cp(join(source,name),join(target,name),{recursive:true});}
async function files(root,prefix=''){const result=[];for(const row of await readdir(join(root,prefix),{withFileTypes:true})){if(row.isSymbolicLink())throw Error('Symlinks are not distributable.');const name=prefix+row.name;if(row.isDirectory())result.push(...await files(root,name+'/'));else result.push(name);}return result.sort();}
const runtimeName = '@zesia/runtime';

export async function lockedRuntimeVersion(pkg) {
  const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
  const runtimeDir = join('node_modules', runtimeName);
  const pinned = lock.packages?.['node_modules/' + runtimeName];
  const installed = JSON.parse(await readFile(join(runtimeDir, 'package.json'), 'utf8'));
  const version = pinned?.version;
  const url = 'https://github.com/Rowtion/zesia-skill/releases/download/v' + version + '/zesia-runtime-' + version + '.tgz';
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/u.test(version) ||
      pkg.dependencies?.[runtimeName] !== url || pinned.resolved !== url || !pinned.integrity ||
      installed.name !== runtimeName || installed.version !== version) {
    throw new Error('Install the pinned Zesia Runtime from the package lock with npm ci.');
  }
  return version;
}

export async function pack(component, directory) {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  const runtimeVersion = await lockedRuntimeVersion(pkg);
  const bundled = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  if (bundled.name !== pkg.name || bundled.version !== pkg.version || bundled.runtimeVersion !== runtimeVersion) {
    throw new Error('Rebuild the Claude Code bundle before packaging this version.');
  }

  const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const file = 'zesia-consult-' + component + '-' + pkg.version + '.zip';
  await mkdir('dist', { recursive: true });
  const archive = join(process.cwd(), 'dist', file);
  await rm(archive, { force: true });
  const names = await files(directory);
  const archiveTime = new Date('2026-01-01T00:00:00Z');
  for (const name of names) await utimes(join(directory, name), archiveTime, archiveTime);
  execFileSync('zip', ['-Xq', archive, '-@'], {
    cwd: directory, input: names.join('\n') + '\n', env: { ...process.env, TZ: 'UTC' },
  });
  const bytes = await readFile(archive);
  const repository = pkg.repository.url.replace(/\.git$/, '');
  const release = {
    format: 'zesia.plugin.release.v1', component, version: pkg.version, sourceSha,
    repository, runtimeVersion, file, url: repository + '/releases/download/v' + pkg.version + '/' + file,
    sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, administratorRequired: false,
  };
  await writeFile('dist/release.json', JSON.stringify(release, null, 2) + '\n');
  await writeFile(archive + '.sha256', release.sha256 + '  ' + file + '\n');
}
