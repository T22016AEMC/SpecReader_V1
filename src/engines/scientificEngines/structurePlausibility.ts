import {StructureParserAdapter} from '../chemistryEngine';
import type {ObservedEvidence} from '../reasoning/types';
import {PLAUSIBILITY_CONFIG as CFG} from './plausibilityConfig';
import {V12_CONFIG} from '../constraints/v12Config';

/**
 * Chemical-plausibility gate (v1.1.7-hotfix.1). Candidates with unstable linkages are rejected unless specific
 * evidence allows them; rejections are reported, never silent.
 *
 * Rules and exceptions (planner decisions):
 * - PEROXIDE  O–O bond                                   → allowed only with a user formula (the user's responsibility).
 * - N_O_N     O bonded to two N                          ┐
 * - N_DI_OH   N carrying ≥ 2 OH (incl. N–N(OH)2)         ├→ allowed only with N-specific evidence and a marked IR N–O
 * - N_O_LINK  any other N–O bond (hydroxylamine, oxime,  ┘   (900–1000) or N-oxide (1200–1300) band.
 *             N-oxide)
 * - CUMULATED_N  azide / diazo (N with two double bonds) → allowed only with a strong IR band at 2100–2160.
 * - GEM_DIOL  sp³ C with two free OH (acetals/ketals are not affected)                         → rejected.
 * - ENOL      non-aromatic C=C–OH (phenols are not affected)                                   → rejected.
 * - KETENE    C=C=O (allenes are not affected)          → allowed only with a strong IR band near 2150.
 * - HEMIACETAL_ACYCLIC / ORTHOESTER_ACYCLIC (v1.2 only, useV12Constraints): acyclic sp³ C with a free OH and another O (hemiacetal /
 *             hemiketal), or with ≥ 3 O (orthoester). Cyclic hemiacetals and acetals/ketals (two OR, no OH) are not affected.
 * - AMINAL    acyclic sp³ C with two N, or one N and one free OH (cyclic, carbonyl, aromatic and imine carbons are
 *             not affected)                                                                    → rejected.
 */
export type PlausibilityRule='PEROXIDE'|'N_O_N'|'N_DI_OH'|'N_O_LINK'|'CUMULATED_N'|'GEM_DIOL'|'ENOL'|'KETENE'|'AMINAL'|'HEMIACETAL_ACYCLIC'|'ORTHOESTER_ACYCLIC';
export interface PlausibilityEvidence {userFormula:boolean;nitrogenEvidence:boolean;irNO:boolean;irNOxide:boolean;irCumulatedN:boolean;irKetene:boolean}
export interface PlausibilityViolation {rule:PlausibilityRule;text:string}
export const NO_PLAUSIBILITY_EVIDENCE:PlausibilityEvidence={userFormula:false,nitrogenEvidence:false,irNO:false,irNOxide:false,irCumulatedN:false,irKetene:false};

export function buildPlausibilityEvidence(args:{observations:ObservedEvidence[];userFormula:string|null;nitrogenEvidence:boolean}):PlausibilityEvidence {
 const ir=args.observations.filter(o=>o.modality==='IR');
 const maxI=Math.max(0,...ir.map(o=>o.relativeIntensity??0));
 const present=([lo,hi]:readonly [number,number])=>ir.some(o=>o.value>=lo&&o.value<=hi);
 const strong=([lo,hi]:readonly [number,number])=>ir.some(o=>o.value>=lo&&o.value<=hi&&o.relativeIntensity!==null&&maxI>0&&o.relativeIntensity/maxI>=CFG.strongRelativeIntensity);
 return {userFormula:Boolean(args.userFormula),nitrogenEvidence:args.nitrogenEvidence,irNO:present(CFG.irNOStretchRange),irNOxide:present(CFG.irNOxideRange),irCumulatedN:strong(CFG.irCumulatedNRange),irKetene:strong(CFG.irKeteneRange)};
}

type Atom={element:string;isAromatic:boolean;totalHydrogens:number;formalCharge:number;neighbors:{toAtom:number;order:number;isAromatic:boolean}[]};
/** Atom i is in a ring when two of its neighbours are connected by a path that avoids i. */
function inRing(atoms:Atom[],i:number):boolean {
 const nbrs=atoms[i].neighbors.map(n=>n.toAtom);
 for(let k=0;k<nbrs.length;k++){
  const targets=new Set(nbrs.filter((_,j)=>j!==k)),seen=new Set([i,nbrs[k]]),queue=[nbrs[k]];
  while(queue.length){
   const v=queue.shift()!;
   for(const {toAtom:w} of atoms[v].neighbors){
    if(w===i)continue;
    if(targets.has(w))return true;
    if(!seen.has(w)){seen.add(w);queue.push(w);}
   }
  }
 }
 return false;
}

/** Violations of the gate for one candidate; an empty list means it passes. Unparsable SMILES are left to the existing validators. */
export function plausibilityViolations(smiles:string,ev:PlausibilityEvidence):PlausibilityViolation[] {
 const graph=StructureParserAdapter.parseSmilesGraph(smiles).graph as {atoms:Atom[]}|null;
 if(!graph)return [];
 const atoms=graph.atoms,out:PlausibilityViolation[]=[];
 const add=(rule:PlausibilityRule,text:string)=>{if(!out.some(v=>v.rule===rule))out.push({rule,text});};
 const el=(i:number)=>atoms[i].element;
 const freeOH=(i:number)=>el(i)==='O'&&atoms[i].totalHydrogens>=1&&atoms[i].neighbors.length===1&&atoms[i].formalCharge===0;
 const sp3C=(i:number)=>el(i)==='C'&&!atoms[i].isAromatic&&atoms[i].neighbors.every(n=>n.order===1);
 const nOxygenAllowed=ev.nitrogenEvidence&&(ev.irNO||ev.irNOxide);
 atoms.forEach((a,i)=>{
  const ns=a.neighbors;
  if(a.element==='O'){
   if(ns.some(n=>el(n.toAtom)==='O')&&!ev.userFormula)add('PEROXIDE','過氧 O–O 鍵：沒有使用者分子式時不接受');
   if(ns.filter(n=>el(n.toAtom)==='N').length>=2&&!nOxygenAllowed)add('N_O_N','N–O–N 連接：需要 N 專屬證據與 IR N–O（900–1000）或 N-氧化物（1200–1300）帶');
  }
  if(a.element==='N'){
   const oh=ns.filter(n=>freeOH(n.toAtom)).length;
   if(oh>=2&&!nOxygenAllowed)add('N_DI_OH',`N 上連 ${oh} 個 OH（含 N–N(OH)₂）：需要 N 專屬證據與 IR N–O 帶`);
   else if(ns.some(n=>el(n.toAtom)==='O')&&!nOxygenAllowed)add('N_O_LINK','N–O 鍵（羥胺／肟／N-氧化物）：需要 N 專屬證據與 IR N–O（900–1000）或 N-氧化物（1200–1300）帶');
   if(ns.filter(n=>n.order===2).length>=2&&!ev.irCumulatedN)add('CUMULATED_N','疊氮／重氮的累積 N 雙鍵：需要 IR 2100–2160 強帶');
  }
  if(a.element==='C'){
   if(sp3C(i)&&ns.filter(n=>freeOH(n.toAtom)).length>=2)add('GEM_DIOL','偶二醇：sp³ 碳上有兩個游離 OH');
   if(!a.isAromatic&&ns.some(n=>n.order===2&&el(n.toAtom)==='C'&&!atoms[n.toAtom].isAromatic)&&ns.some(n=>n.order===1&&freeOH(n.toAtom)))add('ENOL','非芳香烯醇 C=C–OH');
   if(ns.some(n=>n.order===2&&el(n.toAtom)==='O')&&ns.some(n=>n.order===2&&el(n.toAtom)==='C')&&!ev.irKetene)add('KETENE','烯酮 C=C=O：需要 IR 約 2150 強帶');
   if(V12_CONFIG.useV12Constraints&&sp3C(i)&&!inRing(atoms,i)){
    const oNeighbours=ns.filter(n=>el(n.toAtom)==='O'),free=oNeighbours.filter(n=>freeOH(n.toAtom)).length;
    if(free>=1&&oNeighbours.length>free)add('HEMIACETAL_ACYCLIC','非環狀半縮醛／半縮酮：sp³ 碳上同時有游離 OH 與其他 O');
    if(oNeighbours.length>=3)add('ORTHOESTER_ACYCLIC','非環狀原酸酯型：sp³ 碳上有 3 個以上的 O');
   }
   if(sp3C(i)){
    const nCount=ns.filter(n=>el(n.toAtom)==='N').length,ohCount=ns.filter(n=>freeOH(n.toAtom)).length;
    if((nCount>=2||(nCount>=1&&ohCount>=1))&&!inRing(atoms,i))add('AMINAL',nCount>=2?'非環狀胺縮醛：sp³ 碳上同時有兩個 N':'非環狀半縮醛胺：sp³ 碳上同時有 N 與游離 OH');
   }
  }
 });
 return out;
}
