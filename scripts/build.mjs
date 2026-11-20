import { installA2A } from '@zesia/runtime/install-a2a';
import { rm, mkdir, readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { copy, lockedRuntimeVersion } from './archive.mjs';

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const runtimeVersion = await lockedRuntimeVersion(pkg);
await installA2A({ root: process.cwd() });
await rm('dist/plugin',{recursive:true,force:true});await copy('.', 'dist/plugin',['.claude-plugin','.mcp.json','package.json','README.md','THIRD_PARTY_NOTICES.md','LICENSE','skills','commands','hooks','tests']);await mkdir('dist/plugin/src',{recursive:true});await mkdir('dist/plugin/scripts',{recursive:true});
for(const entry of ['src/server.mjs','scripts/configure.mjs','scripts/read-secret.mjs'])await build({entryPoints:[entry],outfile:'dist/plugin/'+entry,bundle:true,platform:'node',format:'esm',target:'node20',legalComments:'eof'});

delete pkg.dependencies;
delete pkg.devDependencies;
pkg.runtimeVersion = runtimeVersion;
pkg.scripts = { configure: 'node scripts/configure.mjs' };
await writeFile('dist/plugin/package.json', JSON.stringify(pkg, null, 2) + '\n');

await build({entryPoints:['node_modules/@zesia/runtime/scripts/install-a2a.mjs'],outfile:'dist/plugin/scripts/install-a2a.mjs',bundle:true,platform:'node',format:'esm',target:'node20'});
