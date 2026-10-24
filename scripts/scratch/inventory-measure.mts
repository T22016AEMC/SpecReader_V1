// One-off measurement for docs/P1C_DESIGN.md: how big is the search when EVERY atom has a pinned H count (what the v1.2 atom inventory would give),
// using only the existing enumerator (open single-atom fragments with fixedH). No equivalence / aromatic / substructure constraints yet (upper bound).
import {initializeRDKit,matchesSMARTS} from '../../src/engines/scientificEngines/rdkitAdapter';
import {enumerateStructures} from '../../src/engines/enumeration';
await initializeRDKit();
const atom=(id:string,element:string,h:number,count:number)=>({id,count,atoms:[{element,fixedH:h,open:true}],bonds:[]});
const cases:[string,string,any[],string][]=[
 ['4-tert-butylphenol-type inventory','C10H14O',[atom('CH3','C',3,3),atom('ArCH','C',1,4),atom('OH','O',1,1),atom('C0','C',0,3)],'c1ccc(cc1)'],
 ['2,2-diphenylpropane-type inventory','C15H16',[atom('ArCH','C',1,10),atom('CH3','C',3,2),atom('C0','C',0,3)],'c1ccccc1'],
 ['p-dimethoxybenzene-type inventory','C8H10O2',[atom('OCH3','C',3,2),atom('ArCH','C',1,4),atom('O','O',0,2),atom('C0','C',0,2)],'c1ccccc1'],
 ['ethyl benzoate-type inventory','C9H10O2',[atom('CH3','C',3,1),atom('CH2','C',2,1),atom('ArCH','C',1,5),atom('O','O',0,2),atom('C0','C',0,2)],'c1ccccc1'],
];
for(const [name,formula,frags,pat] of cases){
  const t=performance.now();
  const r=await enumerateStructures({formula,alternatives:[{id:'inv',fragments:frags}],budget:{maxStates:2e8,timeMs:60000}});
  const ms=Math.round(performance.now()-t);
  const aromatic=r.candidates.filter(c=>matchesSMARTS(c.smiles,'c1ccccc1')===true).length;
  console.log(JSON.stringify({name,formula,status:r.status,errors:r.errors.map(e=>e.code),candidates:r.candidates.length,withBenzeneRing:aromatic,steps:r.stats.visited,leaves:r.stats.leaves,ms}));
}

// Second measurement: same inventories, but the aromatic CH atoms come inside a pinned-H ring template (ring atoms: CH closed, substituted C open with H = 0).
const ringAtoms=(subst:number[])=>Array.from({length:6},(_,i)=>subst.includes(i)?{element:'C',open:true}:{element:'C',fixedH:1});
const kek=[[0,1,2],[1,2,1],[2,3,2],[3,4,1],[4,5,2],[5,0,1]].map(([a,b,order])=>({a,b,order:order as 1|2,aromatic:true}));
const ring=(id:string,subst:number[],count=1)=>({id,count,atoms:ringAtoms(subst),bonds:kek});
const cases2:[string,string,any[]][]=[
 ['4-tert-butylphenol-type, para ring template','C10H14O',[ring('para',[0,3]),atom('CH3','C',3,3),atom('OH','O',1,1),atom('C0','C',0,1)]],
 ['2,2-diphenylpropane-type, 2 phenyl templates','C15H16',[ring('phenyl',[0],2),atom('CH3','C',3,2),atom('C0','C',0,1)]],
 ['p-dimethoxybenzene-type, para ring template','C8H10O2',[ring('para',[0,3]),atom('CH3','C',3,2),atom('O','O',0,2)]],
 ['ethyl benzoate-type, phenyl template','C9H10O2',[ring('phenyl',[0]),atom('CH3','C',3,1),atom('CH2','C',2,1),atom('O','O',0,2),atom('C0','C',0,1)]],
];
for(const [name,formula,frags] of cases2){
  const t=performance.now();
  const r=await enumerateStructures({formula,alternatives:[{id:'inv',fragments:frags}],budget:{maxStates:2e8,timeMs:60000}});
  console.log(JSON.stringify({name,formula,status:r.status,errors:r.errors.map(e=>e.code),candidates:r.candidates.length,steps:r.stats.visited,leaves:r.stats.leaves,ms:Math.round(performance.now()-t)}));
}
