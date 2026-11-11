import {rm,mkdir,readFile,writeFile}from'node:fs/promises';import{build}from'esbuild';import{copy}from'./archive.mjs';
await rm('dist/plugin',{recursive:true,force:true});await copy('.', 'dist/plugin',['.claude-plugin','.mcp.json','package.json','README.md','THIRD_PARTY_NOTICES.md','LICENSE','skills','commands','hooks','tests']);await mkdir('dist/plugin/src',{recursive:true});await mkdir('dist/plugin/scripts',{recursive:true});
for(const entry of ['src/server.mjs','scripts/configure.mjs','scripts/read-secret.mjs'])await build({entryPoints:[entry],outfile:'dist/plugin/'+entry,bundle:true,platform:'node',format:'esm',target:'node20',legalComments:'eof'});

const pkg=JSON.parse(await readFile('dist/plugin/package.json','utf8'));delete pkg.dependencies;delete pkg.devDependencies;pkg.scripts={configure:'node scripts/configure.mjs'};await writeFile('dist/plugin/package.json',JSON.stringify(pkg,null,2)+'\n');
