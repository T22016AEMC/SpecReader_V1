import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const phase=process.argv[2]||'current';
const dest=process.env.VALIDATION_OUTPUT_DIR||'validation';
fs.mkdirSync(dest,{recursive:true});
const checks=[['assets',['scripts/prepare-assets.mjs']],['typecheck',['node_modules/typescript/lib/tsc.js','--noEmit']],['test',['node_modules/vitest/vitest.mjs','run','--maxWorkers=1']],['build',['node_modules/vite/bin/vite.js','build']],['server-build',['node_modules/esbuild/bin/esbuild','server.ts','--bundle','--platform=node','--format=esm','--packages=external','--outfile=dist/server.mjs']]];
const results=[];
for(const [name,args] of checks){const start=Date.now();const r=spawnSync(process.execPath,args,{encoding:'utf8',maxBuffer:20*1024*1024});fs.writeFileSync(path.join(dest,`${phase}-${name}.log`),(r.stdout||'')+(r.stderr||'')+(r.error?.message||''));results.push({phase,name,exitCode:r.status,durationMs:Date.now()-start});console.log(name,r.status);}
fs.writeFileSync(path.join(dest,`${phase}-results.json`),JSON.stringify(results,null,2));
process.exitCode=results.some(r=>r.exitCode!==0)?1:0;
