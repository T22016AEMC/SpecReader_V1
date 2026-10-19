import type {IRFunctionalGroupFinding} from '../../types/spectrum';
import type {ObservedEvidence} from '../reasoning/types';
import {COMPOSITION_CONFIG as CFG} from './compositionConfig';
import type {NmrEvidence} from './nmrComposition';
import type {ElementCounts} from './types';

export type FeatureKey='CARBONYL'|'ESTER_ACID'|'ANHYDRIDE'|'AMIDE'|'NITRILE'|'ALKYNE'|'AROMATIC'|'NITRO'|'OXYGEN_SINGLE'|'AMINE';
/** Element and DBE lower bounds implied by each feature. Bounds only: never an exclusion (審核決定 4). */
export const FEATURE_BOUNDS:Record<FeatureKey,{label:string;mins:ElementCounts;dbeMin:number}>={
 CARBONYL:{label:'C=O 羰基',mins:{O:1},dbeMin:1},
 ESTER_ACID:{label:'酯或羧酸',mins:{O:2},dbeMin:1},
 ANHYDRIDE:{label:'酸酐',mins:{O:3},dbeMin:2},
 AMIDE:{label:'醯胺',mins:{O:1,N:1},dbeMin:1},
 NITRILE:{label:'腈',mins:{N:1},dbeMin:2},
 ALKYNE:{label:'炔',mins:{},dbeMin:2},
 AROMATIC:{label:'芳環',mins:{C:6},dbeMin:4},
 NITRO:{label:'硝基',mins:{N:1,O:2},dbeMin:1},
 OXYGEN_SINGLE:{label:'O–H／C–O（醇、酚、醚）',mins:{O:1},dbeMin:0},
 AMINE:{label:'N–H／C–N（胺）',mins:{N:1},dbeMin:0},
};
export interface Feature {key:FeatureKey;label:string;mins:ElementCounts;dbeMin:number;modalities:string[];observationIds:string[];hard:boolean}

/** IR family → features. Order matters only for readability; every match is added. */
const IR_RULES:[RegExp,FeatureKey[]][]=[
 [/anhydride|酸酐/i,['CARBONYL','ANHYDRIDE']],
 [/ester|carboxylic acid|酯|羧酸/i,['CARBONYL','ESTER_ACID']],
 [/amide|醯胺/i,['CARBONYL','AMIDE']],
 [/ketone|aldehyde|carbonyl|acyl|酮|醛|羰/i,['CARBONYL']],
 [/nitrile|腈/i,['NITRILE']],
 [/alkyne|炔/i,['ALKYNE']],
 [/aromatic|芳香/i,['AROMATIC']],
 [/nitro|硝基/i,['NITRO']],
 [/alcohol|phenol|ether|醇|酚|醚/i,['OXYGEN_SINGLE']],
 [/amine|胺/i,['AMINE']],
];

export function functionalGroupFeatures(observations:ObservedEvidence[],irFindings:IRFunctionalGroupFinding[],nmr:NmrEvidence):Feature[] {
 const map=new Map<FeatureKey,{modalities:Set<string>;ids:Set<string>}>();
 const add=(key:FeatureKey,modality:string,ids:string[])=>{const f=map.get(key)??{modalities:new Set(),ids:new Set()};f.modalities.add(modality);ids.forEach(i=>f.ids.add(i));map.set(key,f);};
 const ir=observations.filter(o=>o.modality==='IR');
 for(const finding of irFindings){
  if(finding.matchLevel==='Absent / Excluded'||finding.status==='ABSENT'||finding.status==='INSUFFICIENT_DATA')continue;
  const text=[finding.family,finding.groupFamily,finding.functionalGroup,finding.groupName].filter(Boolean).join(' ');
  const ids=ir.filter(o=>Math.abs(o.value-finding.observedPeak)<2).map(o=>o.id);
  for(const [re,keys] of IR_RULES)if(re.test(text))for(const k of keys)add(k,'IR',ids);
 }
 const c=nmr.c13,h=nmr.h1;
 if(c?.carbonylIds.length)add('CARBONYL','13C_NMR',c.carbonylIds);
 if(c&&c.aromaticIds.length>=CFG.c13AromaticMinSignals)add('AROMATIC','13C_NMR',c.aromaticIds);
 // A 115–125 ppm carbon alone is usually aromatic; it only corroborates a nitrile already seen in IR.
 if(c?.nitrileIds.length&&map.has('NITRILE'))add('NITRILE','13C_NMR',c.nitrileIds);
 if(h&&h.aromaticIds.length>=CFG.h1AromaticMinSignals)add('AROMATIC','1H_NMR',h.aromaticIds);
 if(h?.aldehydeIds.length)add('CARBONYL','1H_NMR',h.aldehydeIds);
 return [...map].sort(([a],[b])=>a.localeCompare(b)).map(([key,f])=>({key,...FEATURE_BOUNDS[key],modalities:[...f.modalities].sort(),observationIds:[...f.ids].sort(),hard:f.modalities.size>=2}));
}
/** Element minima and DBE minimum from a feature subset (max over features, never a sum, since features overlap). */
export function combineBounds(features:Feature[]):{mins:ElementCounts;dbeMin:number} {
 const mins:ElementCounts={};let dbeMin=0;
 for(const f of features){for(const [e,v] of Object.entries(f.mins))mins[e as keyof ElementCounts]=Math.max(mins[e as keyof ElementCounts]??0,v!);dbeMin=Math.max(dbeMin,f.dbeMin);}
 return {mins,dbeMin};
}
