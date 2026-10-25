// One-off measurement for docs/P1C_DESIGN.md (not part of the product or the tests): RDKit.js substructure matching speed and semantics.
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {enumerateStructures} from '../../src/engines/enumeration';
import RDKitModuleFactory from '@rdkit/rdkit';
await initializeRDKit();
const rd:any=await (RDKitModuleFactory as any)();
const smiles:string[]=[];
for(const f of ['C8H10O2','C9H12O','C7H8O2','C8H8O2']){
  const r=await enumerateStructures({formula:f,budget:{maxStates:3e7,timeMs:20000,maxCandidates:600}});
  smiles.push(...r.candidates.map(c=>c.smiles));
}
const ringFrag={id:'ring',atoms:Array.from({length:6},()=>({element:'C',flex:true})),bonds:[[0,1,2],[1,2,1],[2,3,2],[3,4,1],[4,5,2],[5,0,1]].map(([a,b,order])=>({a,b,order:order as 1|2,aromatic:true}))};
for(const f of ['C8H10O2','C9H12O2','C10H14O']){
  const r=await enumerateStructures({formula:f,alternatives:[{id:'r',fragments:[ringFrag]}],budget:{maxStates:3e7,timeMs:20000,maxCandidates:600}});
  smiles.unshift(...r.candidates.map(c=>c.smiles));
}
const list=Array.from({length:1000},(_,i)=>smiles[i%smiles.length]);
console.log('candidates',smiles.length,'list',list.length);
const patterns=['c[OX2]','[CX3]=[OX1]','[CH3][CX4]([CH3])[CH3]'];
// A: adapter style (parse mol and query every time)
let t=performance.now();let hitsA=0;
for(const s of list){const m=rd.get_mol(s);for(const p of patterns){const q=rd.get_qmol(p);if(m.get_substruct_match(q)!=='{}')hitsA++;q.delete();}m.delete();}
const msA=performance.now()-t;
// B: queries parsed once
const qs=patterns.map(p=>rd.get_qmol(p));
t=performance.now();let hitsB=0;
for(const s of list){const m=rd.get_mol(s);for(const q of qs)if(m.get_substruct_match(q)!=='{}')hitsB++;m.delete();}
const msB=performance.now()-t;
// C: molecules parsed once, matches (all, overlapping allowed)
const mols=list.map(s=>rd.get_mol(s));
t=performance.now();let hitsC=0;
for(const m of mols)for(const q of qs)if(JSON.parse(m.get_substruct_matches(q,JSON.stringify({uniquify:false,maxMatches:1000}))).length>0)hitsC++;
const msC=performance.now()-t;
mols.forEach(m=>m.delete());
console.log(JSON.stringify({A_parseEveryTime_ms:Math.round(msA),B_queriesCached_ms:Math.round(msB),C_molsCached_matches_ms:Math.round(msC),hitsA,hitsB,hitsC,perCallUs_C:Number((msC*1000/3000).toFixed(1))}));
// semantics: overlap and multiple matches
const mol=rd.get_mol('COc1ccc(OC)cc1');const q=rd.get_qmol('c[OX2]');
console.log('p-dimethoxybenzene c[OX2] match (first):',mol.get_substruct_match(q));
console.log('matches uniquify default:',mol.get_substruct_matches(q));
console.log('matches uniquify false:',mol.get_substruct_matches(q,JSON.stringify({uniquify:false})));
const q2=rd.get_qmol('[CH3][CX4]([CH3])[CH3]');const tb=rd.get_mol('CC(C)(C)c1ccc(O)cc1');
console.log('t-Bu match:',tb.get_substruct_matches(q2),'| t-Bu uniquify false count:',JSON.parse(tb.get_substruct_matches(q2,JSON.stringify({uniquify:false}))).length);
const ring=rd.get_mol('c1ccccc1');console.log('ring match count default/false:',JSON.parse(ring.get_substruct_matches(rd.get_qmol('c1ccccc1'))).length,JSON.parse(ring.get_substruct_matches(rd.get_qmol('c1ccccc1'),JSON.stringify({uniquify:false}))).length);
