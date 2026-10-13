import {ChemistryEngine,StructureParserAdapter} from '../chemistryEngine';
import {componentAfterCut} from './graphChemicalFeatures';
import {ionMz,ELECTRON_MASS,type IonAdduct} from './ionMass';
export interface PossibleGraphFragment {formula:string;neutralMass:number;mz:number;cutAtoms:[number,number];plausibility:number;method:string}
/** Bounded single-bond hypotheses; no trained fragmentation or ion-yield model. */
export function graphFragments(smiles:string,adduct:IonAdduct='[M]+•',charge=1,surface=false):PossibleGraphFragment[] {
  const graph=StructureParserAdapter.parseSmilesGraph(smiles).graph;
  if(!graph||graph.atoms.length>128||!Number.isInteger(charge)||charge===0)return [];
  const fragments:PossibleGraphFragment[]=[],seen=new Set<string>();
  for(const atom of graph.atoms)for(const bond of atom.neighbors) {
    if(atom.index>=bond.toAtom||bond.order!==1)continue;
    const connected=componentAfterCut(graph,atom.index,atom.index,bond.toAtom);
    if(connected.has(bond.toAtom))continue; // Ring opening needs additional cuts.
    for(const component of [connected,new Set(graph.atoms.map(a=>a.index).filter(i=>!connected.has(i)))]) {
      const counts:Record<string,number>={};
      for(const i of component){const a=graph.atoms[i];counts[a.element]=(counts[a.element]??0)+1;counts.H=(counts.H??0)+a.totalHydrogens;}
      if(!counts.C&&!surface)continue;
      const neutralMass=ChemistryEngine.calculateMasses(counts).exactMass;
      const formula=Object.keys(counts).sort((a,b)=>a==='C'?-1:b==='C'?1:a==='H'?-1:b==='H'?1:a.localeCompare(b)).map(e=>counts[e]?e+(counts[e]===1?'':counts[e]):'').join('');
      const hasHetero=[...component].some(i=>['O','N','S'].includes(graph.atoms[i].element));
      if(!surface&&adduct==='[M-H]-'&&!hasHetero)continue;
      const mz=surface?(neutralMass+(charge<0?ELECTRON_MASS:-ELECTRON_MASS))/Math.abs(charge):ionMz(neutralMass,adduct,charge);
      if(mz<10||seen.has(formula))continue;seen.add(formula);
      const cutHetero=['O','N','S'].includes(atom.element)||['O','N','S'].includes(graph.atoms[bond.toAtom].element);
      fragments.push({formula,neutralMass,mz,cutAtoms:[atom.index,bond.toAtom],plausibility:cutHetero?.65:.35,method:surface?'表面碰撞斷鍵可能式；無基質／離子產率模型':'分子圖單鍵裂解可能式；未模擬重排或碰撞能量依賴'});
    }
  }
  return fragments;
}
