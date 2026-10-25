// One-off check for docs/P1C_DESIGN.md: with disjoint fragments, can phenol (C6H6O) be produced from "aromatic ring" + "C–O" readings?
import {initializeRDKit,matchesSMARTS} from '../../src/engines/scientificEngines/rdkitAdapter';
import {enumerateStructures} from '../../src/engines/enumeration';
await initializeRDKit();
const flex=(...e:string[])=>e.map(element=>({element,flex:true}));
const ring={id:'ring',atoms:flex('C','C','C','C','C','C'),bonds:[[0,1,2],[1,2,1],[2,3,2],[3,4,1],[4,5,2],[5,0,1]].map(([a,b,order])=>({a,b,order:order as 1|2,aromatic:true}))};
const co={id:'C-O',atoms:flex('C','O'),bonds:[{a:0,b:1,order:1 as const}]};
for(const [formula,frags] of [['C6H6O',[ring,co]],['C6H6O',[ring]],['C7H8O',[ring,co]],['C8H10O2',[ring,co]]] as const){
  const r=await enumerateStructures({formula,alternatives:[{id:'S',fragments:[...frags]}],budget:{maxStates:5e7,timeMs:20000}});
  const phenolic=r.candidates.filter(c=>matchesSMARTS(c.smiles,'c[OX2H]')===true).length;
  console.log(JSON.stringify({formula,fragments:frags.map(f=>f.id),status:r.status,errors:r.errors.map(e=>e.code),candidates:r.candidates.length,withArylOH:phenolic}));
}
