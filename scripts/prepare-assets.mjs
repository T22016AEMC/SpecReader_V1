import {createRequire} from 'node:module';
import {mkdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(import.meta.url);
const rdkitDir=path.dirname(require.resolve('@rdkit/rdkit'));
await mkdir('public/rdkit',{recursive:true});
for(const name of ['RDKit_minimal.js','RDKit_minimal.wasm']) await copyFile(path.join(rdkitDir,name),path.join('public/rdkit',name));
