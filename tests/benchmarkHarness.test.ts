import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {
 aggregate,buildCaseSpectra,loadCases,normalizeFormula,runBenchmark,sameStructure,stereoFreeCanonical,
 type BenchmarkRun,type CaseRecord,type ConditionResult,type RunBudget,
} from '../scripts/benchmark/benchmarkLib.mts';

// Smoke tests for the benchmark harness. Every case below is SYNTHETIC: hand-written peak tables
// that only exercise file reading, condition switching, SMILES comparison and report writing.
// They live in an OS temp directory, never in benchmark/cases, and never count toward accuracy.
const SMALL:RunBudget={mode:'deterministic',timeMs:20000,maxStates:2000};
let root:string,benchmarkDir:string,notesDir:string,summaryDir:string;
const write=(file:string,content:string|Buffer)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,content);};
const json=(file:string,value:unknown)=>write(file,JSON.stringify(value));
function syntheticIrCsv():string {
 const rows=['wavenumber,transmittance'];
 for(let x=4000;x>=650;x-=4){
  const dip=(c:number,w:number,h:number)=>h*Math.exp(-.5*((x-c)/w)**2);
  rows.push(`${x},${(96-dip(3350,120,40)-dip(1510,15,35)-dip(1235,18,45)).toFixed(2)}`);
 }
 return rows.join('\n');
}
beforeAll(()=>{
 root=fs.mkdtempSync(path.join(os.tmpdir(),'specreader-bench-'));
 benchmarkDir=path.join(root,'benchmark');notesDir=path.join(root,'notes');summaryDir=path.join(root,'repo-summary');
 const cases=path.join(benchmarkDir,'cases');
 // numeric IR through the UI parser path + peak-table NMR with conditions, including fields that cannot be mapped
 json(path.join(cases,'synthetic_0001_cresol','case.json'),{id:'synthetic_0001_cresol',name:'Synthetic p-cresol',answerSmiles:'Cc1ccc(O)cc1',formula:'C7H8O',tags:['synthetic'],source:{name:'synthetic',url:'',notes:'hand-written test peaks'},spectra:{
  IR:{file:'ir.csv'},
  '1H_NMR':{file:'h1.json',solvent:'CDCl3',frequencyMHz:400,temperatureK:298},
  '13C_NMR':{file:'c13.json',solvent:'CDCl3',dept:'DEPT-135'},
 }});
 write(path.join(cases,'synthetic_0001_cresol','ir.csv'),syntheticIrCsv());
 json(path.join(cases,'synthetic_0001_cresol','h1.json'),[{x:7.0471,y:80,integration:2,multiplicity:'d',j:[8.4]},{x:6.7132,y:90,integration:2,multiplicity:'d',j:[8.4]},{x:2.2487,y:100,integration:3,multiplicity:'s'}]);
 json(path.join(cases,'synthetic_0001_cresol','c13.json'),[{x:153.0317},{x:130.2284,y:60},{x:129.9163},{x:115.1409},{x:20.4421}]);
 // MS conditions mapped like the UI, no 13C, no IR
 json(path.join(cases,'synthetic_0002_ethyl_benzoate','case.json'),{id:'synthetic_0002_ethyl_benzoate',name:'Synthetic ethyl benzoate',answerSmiles:'CCOC(=O)c1ccccc1',formula:'C9H10O2',tags:['synthetic'],spectra:{
  '1H_NMR':{file:'h1.json',solvent:'CDCl3',frequencyMHz:400},
  MS:{file:'ms.json',ionization:'EI',adduct:'[M]+•',ionAssignmentConfirmed:true,highResolution:false},
 }});
 json(path.join(cases,'synthetic_0002_ethyl_benzoate','h1.json'),[{x:8.0517,y:60,integration:2,multiplicity:'m'},{x:7.5532,y:70,integration:1,multiplicity:'m'},{x:4.3714,y:90,integration:2,multiplicity:'q',j:[7.1]},{x:1.3862,y:100,integration:3,multiplicity:'t',j:[7.1]}]);
 json(path.join(cases,'synthetic_0002_ethyl_benzoate','ms.json'),[{x:150.0,y:30},{x:122.0,y:35},{x:105.0,y:100},{x:77.0,y:60}]);
 // an image modality is skipped, the rest still runs; no formula means withFormula is skipped
 json(path.join(cases,'synthetic_0003_image_ir_plus_h1','case.json'),{id:'synthetic_0003_image_ir_plus_h1',name:'Synthetic image + peak table',answerSmiles:'CCO',tags:['synthetic'],spectra:{IR:{file:'ir.png'},'1H_NMR':{file:'h1.json'}}});
 write(path.join(cases,'synthetic_0003_image_ir_plus_h1','ir.png'),Buffer.from([0x89,0x50,0x4e,0x47]));
 json(path.join(cases,'synthetic_0003_image_ir_plus_h1','h1.json'),[{x:3.6874,y:80,integration:2,multiplicity:'q',j:[7.0]},{x:1.2263,y:100,integration:3,multiplicity:'t',j:[7.0]}]);
 // image only: nothing evaluable, must be listed and skipped without aborting
 json(path.join(cases,'synthetic_0004_image_only','case.json'),{id:'synthetic_0004_image_only',name:'Synthetic image only',answerSmiles:'CCO',tags:['synthetic'],spectra:{IR:{file:'ir.jpg'}}});
 write(path.join(cases,'synthetic_0004_image_only','ir.jpg'),Buffer.from([0xff,0xd8]));
 // broken case.json is recorded, not fatal
 write(path.join(cases,'synthetic_0005_broken','case.json'),'{not json');
});
afterAll(()=>{fs.rmSync(root,{recursive:true,force:true});});

describe('SMILES comparison',()=>{
 it('ignores stereochemistry and atom order',async()=>{
  expect(await sameStructure('C[C@H](N)C(=O)O','C[C@@H](N)C(=O)O')).toBe(true);
  expect(await sameStructure('C/C=C/C','C/C=C\\C')).toBe(true);
  expect(await sameStructure('c1ccccc1C(=O)OCC','CCOC(=O)c1ccccc1')).toBe(true);
  expect(await sameStructure('CCO','COC')).toBe(false);
  expect(await stereoFreeCanonical('not a smiles')).toBeNull();
  expect(await sameStructure('not a smiles','not a smiles')).toBe(false);
 });
 it('compares formulas independent of written order',()=>{
  expect(normalizeFormula('H10C9O2')).toBe(normalizeFormula('C9H10O2'));
  expect(normalizeFormula('C9H10O2')).not.toBe(normalizeFormula('C9H12O2'));
 });
});
describe('case format reading',()=>{
 it('loads valid cases and records an unreadable case.json',()=>{
  const loaded=loadCases(benchmarkDir);
  expect(loaded.status).toBe('OK');
  expect(loaded.cases.map(c=>c.folder)).toEqual(['synthetic_0001_cresol','synthetic_0002_ethyl_benzoate','synthetic_0003_image_ir_plus_h1','synthetic_0004_image_only','synthetic_0005_broken']);
  expect(loaded.cases[4].case).toBeNull();expect(loaded.cases[4].loadError).toContain('case.json');
 });
 it('maps numeric files through SpectrumParser and conditions onto the fields the UI uses',async()=>{
  const loaded=loadCases(benchmarkDir).cases;
  const a=await buildCaseSpectra(loaded[0].dir,loaded[0].case!);
  expect(a.spectra.IR!.points.length).toBeGreaterThan(100);
  expect(a.spectra.IR!.fileName).toBe('ir.csv');
  expect(a.spectra['1H_NMR']).toMatchObject({nmrSolvent:'CDCl3',spectrometerFrequencyMHz:400});
  expect(a.spectra['1H_NMR']!.peaks.every(p=>p.manualPeak===true)).toBe(true);
  expect(a.spectra['1H_NMR']!.peaks[0]).toMatchObject({x:7.0471,integration:2,multiplicity:'d',jValues:[8.4]});
  expect(a.spectra['13C_NMR']).toMatchObject({nmrSolvent:'CDCl3',c13ExperimentMode:'DEPT_135'});
  expect(a.spectra['13C_NMR']!.peaks[0].intensityKnown).toBe(false);
  expect(a.unmapped.join('\n')).toContain('temperatureK');
  const b=await buildCaseSpectra(loaded[1].dir,loaded[1].case!);
  expect(b.spectra.MS!.msParams).toMatchObject({ionization:'EI',adductType:'[M]+•',ionAssignmentConfirmed:true,isHighResolution:false,chargeState:1});
  expect(b.notes.join('\n')).toContain('chargeState=1');
  const c=await buildCaseSpectra(loaded[2].dir,loaded[2].case!);
  expect(Object.keys(c.spectra)).toEqual(['1H_NMR']);
  expect(c.skipped).toEqual([{modality:'IR',reason:expect.stringContaining('需人工轉成峰表')}]);
 });
});
describe('benchmark run',()=>{
 let run:BenchmarkRun,paths:{json:string;markdown:string;summary:string};
 beforeAll(async()=>{
  const outcome=await runBenchmark({benchmarkDir,notesDir,summaryDir,budget:SMALL,appVersion:'0.0.0-test'});
  expect(outcome.status).toBe('DONE');run=outcome.run!;paths=outcome.paths! as typeof paths;
 },120000);
 const record=(id:string)=>run.records.find(r=>r.id===id)!;
 it('switches between noFormula and withFormula and keeps going after skipped or broken cases',()=>{
  expect(run.records).toHaveLength(5);
  const a=record('synthetic_0001_cresol'),b=record('synthetic_0002_ethyl_benzoate'),c=record('synthetic_0003_image_ir_plus_h1');
  for(const r of [a,b,c])expect(r.status).toBe('EVALUATED');
  expect(a.modalityKey).toBe('IR+1H_NMR+13C_NMR');expect(b.modalityKey).toBe('1H_NMR+MS');expect(c.modalityKey).toBe('1H_NMR');
  for(const r of [a,b]){
   const no=r.results.noFormula as ConditionResult,withF=r.results.withFormula as ConditionResult;
   expect(no.status).toBe('OK');expect(withF.status).toBe('OK');
   expect(no.engineUserFormula).toBeNull();                       // no formula reached the engine
   expect(withF.engineUserFormula).toBe(r.caseFormula);           // formula arrived through extraInput.molecularFormula
   for(const x of [no,withF]){expect(x.termination).not.toBeNull();expect(x.visitedStates).not.toBeNull();expect(x.elapsedMs).toBeGreaterThan(0);expect(x.candidateCount).not.toBeNull();}
  }
  expect(c.results.noFormula!.status).toBe('OK');expect(c.results.withFormula!.status).toBe('SKIPPED');
  expect(c.skippedSpectra[0].reason).toContain('需人工轉成峰表');
  const d=record('synthetic_0004_image_only');expect(d.status).toBe('SKIPPED');expect(d.error).toContain('需人工轉成峰表');
  expect(record('synthetic_0005_broken').status).toBe('ERROR');
 });
 it('never counts synthetic cases toward accuracy',()=>{
  expect(run.records.every(r=>r.synthetic)).toBe(true);
  expect(run.aggregate.counts).toMatchObject({total:5,evaluated:3,skipped:1,error:1,synthetic:5});
  for(const condition of ['noFormula','withFormula'] as const){expect(run.aggregate.aggregates[condition].overall.n).toBe(0);expect(run.aggregate.aggregates[condition].byModalities).toEqual({});}
 });
 it('writes the full report outside the repository and a spectrum-free summary inside it',()=>{
  expect(paths.json).toContain(path.join(notesDir,'v0.0.0-test'));
  for(const file of [paths.json,paths.markdown,paths.summary])expect(fs.existsSync(file)).toBe(true);
  expect(path.basename(paths.summary)).toBe('summary-v0.0.0-test.md');
  const summary=fs.readFileSync(paths.summary,'utf8'),full=fs.readFileSync(paths.markdown,'utf8'),raw=fs.readFileSync(paths.json,'utf8');
  expect(summary).toContain('synthetic_0001_cresol');expect(summary).toContain('Cc1ccc(O)cc1');
  expect(full).toContain('無法對應');expect(full).toContain('temperatureK');
  for(const value of ['7.0471','6.7132','4.3714','153.0317','3350'])for(const text of [summary,full,raw])expect(text).not.toContain(value);
  expect(summary).not.toContain('ir.csv');
 });
 it('writes the UI-budget comparison to its own summary file',async()=>{
  const outcome=await runBenchmark({benchmarkDir,notesDir,summaryDir,budget:{mode:'ui',timeMs:5000,maxStates:1000},appVersion:'0.0.0-test'});
  expect(outcome.status).toBe('DONE');expect(path.basename(outcome.paths!.summary!)).toBe('summary-v0.0.0-test-ui-budget.md');
  expect(fs.existsSync(paths.summary)).toBe(true);
 },60000);
 it('does not replace the repository summary when only some cases are selected',async()=>{
  const before=fs.readFileSync(paths.summary,'utf8');
  const outcome=await runBenchmark({benchmarkDir,notesDir,summaryDir,budget:SMALL,appVersion:'0.0.0-test',caseFilter:['synthetic_0003_image_ir_plus_h1']});
  expect(outcome.status).toBe('DONE');expect(outcome.run!.records).toHaveLength(1);
  expect(outcome.paths!.summary).toBeNull();expect(fs.existsSync(outcome.paths!.markdown)).toBe(true);
  expect(fs.readFileSync(outcome.paths!.markdown,'utf8')).toContain('局部結果');
  expect(fs.readFileSync(paths.summary,'utf8')).toBe(before);
 },60000);
 it('reads case files written with a UTF-8 BOM (Windows PowerShell 5.1, Notepad)',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'specreader-bench-bom-'));
  try {
   const caseDir=path.join(dir,'cases','synthetic_bom');
   write(path.join(caseDir,'case.json'),'﻿'+JSON.stringify({id:'synthetic_bom',answerSmiles:'CCO',spectra:{'1H_NMR':{file:'h1.json'}}}));
   write(path.join(caseDir,'h1.json'),'﻿'+JSON.stringify([{x:3.6,y:80}]));
   const loaded=loadCases(dir);
   expect(loaded.cases[0].loadError).toBeNull();expect(loaded.cases[0].case!.id).toBe('synthetic_bom');
   const built=await buildCaseSpectra(caseDir,loaded.cases[0].case!);
   expect(built.spectra['1H_NMR']!.peaks).toHaveLength(1);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
 });
});
describe('aggregation',()=>{
 const result=(rank:number|null,formulaRank:number|null,status:ConditionResult['status']='OK'):ConditionResult=>({condition:'noFormula',status,rank,candidateCount:10,formulaRank,termination:'GRAMMAR_EXHAUSTED',visitedStates:1,elapsedMs:1,searchElapsedMs:1,generationCode:null,engineUserFormula:null,error:null,skipReason:null});
 const rec=(id:string,key:string,noFormula:ConditionResult,synthetic=false,status:CaseRecord['status']='EVALUATED'):CaseRecord=>({id,name:id,answerSmiles:'CCO',answerCanonical:'CCO',answerFormula:'C2H6O',caseFormula:'C2H6O',tags:[],synthetic,declaredModalities:[],modalities:[],modalityKey:key,skippedSpectra:[],unmappedFields:[],notes:[],warnings:[],status,error:null,results:{noFormula}});
 it('computes top-k, found and formula-found rates per modality combination',()=>{
  const a=aggregate([
   rec('a','IR+1H_NMR',result(1,1)),rec('b','IR+1H_NMR',result(4,2)),rec('c','IR+1H_NMR',result(null,null)),rec('d','1H_NMR',result(12,3)),
   rec('e','1H_NMR',{...result(null,null,'ERROR'),error:'boom'}),rec('s','1H_NMR',result(1,1),true),rec('x','1H_NMR',result(1,1),false,'SKIPPED'),
  ]).aggregates.noFormula;
  expect(a.overall).toEqual({n:5,top1:1,top5:2,top10:2,found:3,formulaFound:3,errors:1});
  expect(a.byModalities['IR+1H_NMR']).toEqual({n:3,top1:1,top5:2,top10:2,found:2,formulaFound:2,errors:0});
  expect(a.byModalities['1H_NMR']).toEqual({n:2,top1:0,top5:0,top10:0,found:1,formulaFound:1,errors:1});
 });
});
describe('empty benchmark',()=>{
 it('ends normally with the 尚無案例 notice and writes nothing',async()=>{
  const empty=fs.mkdtempSync(path.join(os.tmpdir(),'specreader-bench-empty-'));
  try {
   fs.mkdirSync(path.join(empty,'benchmark','cases'),{recursive:true});
   const out=path.join(empty,'out');
   const outcome=await runBenchmark({benchmarkDir:path.join(empty,'benchmark'),notesDir:out,summaryDir:out});
   expect(outcome.status).toBe('NO_CASES');expect(outcome.message).toContain('尚無案例');expect(fs.existsSync(out)).toBe(false);
   const missing=await runBenchmark({benchmarkDir:path.join(empty,'nowhere'),notesDir:out,summaryDir:out});
   expect(missing.status).toBe('NO_CASES');expect(missing.message).toContain('尚無案例');
  }finally{fs.rmSync(empty,{recursive:true,force:true});}
 });
});
