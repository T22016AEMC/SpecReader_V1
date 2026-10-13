import fs from 'node:fs';
const base=(process.argv[2]??'https://specreader-v1.onrender.com').replace(/\/$/,'');
const expected=process.env.EXPECTED_REVISION;
const results=[];let revision=null;
for(const route of ['/api/health','/api/system-status','/','/rdkit/RDKit_minimal.js','/rdkit/RDKit_minimal.wasm','/api/not-a-route','/desktop-refresh-route']){
  const response=await fetch(base+route,{signal:AbortSignal.timeout(60000)});
  const item={route,status:response.status,contentType:response.headers.get('content-type'),passed:response.status===(route==='/api/not-a-route'?404:200)};
  if(route==='/api/health'){const body=await response.json();revision=body.revision;item.passed&&=body.status==='ok'&&body.localScientificEngines===true&&(!expected||revision===expected);}
  if(route.endsWith('.wasm'))item.passed&&=item.contentType?.includes('application/wasm')??false;
  results.push(item);
}
const report={checkedAt:new Date().toISOString(),base,revision,expectedRevision:expected??null,results,allPassed:results.every(r=>r.passed)};
fs.mkdirSync('validation',{recursive:true});fs.writeFileSync('validation/public-smoke.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
if(!report.allPassed)process.exitCode=1;
