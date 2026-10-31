import type {IRFunctionalGroupFinding} from '../../types/spectrum';
import type {ObservedEvidence} from '../reasoning/types';
import {COMPOSITION_CONFIG as CFG} from './compositionConfig';
import type {NmrEvidence} from './nmrComposition';
import {strongIrBands} from '../constraints/requiredSubstructures';
import type {ElementCounts,OxygenEvidenceFloor} from './types';

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

/** Without N-specific evidence (v1.1.6) N-implying features default to their O / N-free reading or are dropped. */
const NITROGEN_FREE:Partial<Record<FeatureKey,FeatureKey|null>>={AMINE:'OXYGEN_SINGLE',AMIDE:'CARBONYL',NITRILE:null,NITRO:null};
export function functionalGroupFeatures(observations:ObservedEvidence[],irFindings:IRFunctionalGroupFinding[],nmr:NmrEvidence,nitrogenAllowed=true):Feature[] {
 const map=new Map<FeatureKey,{modalities:Set<string>;ids:Set<string>}>();
 const add=(raw:FeatureKey,modality:string,ids:string[])=>{
  const key=nitrogenAllowed||!(raw in NITROGEN_FREE)?raw:NITROGEN_FREE[raw];
  if(!key)return;const f=map.get(key)??{modalities:new Set(),ids:new Set()};f.modalities.add(modality);ids.forEach(i=>f.ids.add(i));map.set(key,f);};
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
 if(!nitrogenAllowed){
  // Broad X–H stretch and broad exchangeable 1H default to O–H when nothing is N-specific (v1.1.6).
  const broadIR=ir.filter(o=>o.shape==='BROAD'&&o.value>=CFG.irBroadXHRange[0]&&o.value<=CFG.irBroadXHRange[1]);
  const exchange=observations.filter(o=>o.modality==='1H_NMR'&&!o.optional&&(o.shape==='BROAD'||o.multiplicity==='br'||o.multiplicity==='br s'));
  if(broadIR.length)add('OXYGEN_SINGLE','IR',broadIR.map(o=>o.id));
  if(exchange.length)add('OXYGEN_SINGLE','1H_NMR',exchange.map(o=>o.id));
 }
 return [...map].sort(([a],[b])=>a.localeCompare(b)).map(([key,f])=>({key,...FEATURE_BOUNDS[key],modalities:[...f.modalities].sort(),observationIds:[...f.ids].sort(),hard:f.modalities.size>=2}));
}
/** Element minima and DBE minimum from a feature subset (max over features, never a sum, since features overlap). */
export function combineBounds(features:Feature[]):{mins:ElementCounts;dbeMin:number} {
 const mins:ElementCounts={};let dbeMin=0;
 for(const f of features){for(const [e,v] of Object.entries(f.mins))mins[e as keyof ElementCounts]=Math.max(mins[e as keyof ElementCounts]??0,v!);dbeMin=Math.max(dbeMin,f.dbeMin);}
 return {mins,dbeMin};
}

/**
 * v1.2.1 (A2): the lowest O count that the IR (and, without N-specific evidence, a broad exchangeable 1H) supports. Range-matched IR findings
 * (irFindings) are NOT used: a 1612 cm-1 aromatic C=C read as amide I, or 3030/2965 cm-1 C–H read as an acid O–H, would only inflate the floor.
 * Only observed bands count: a broad O–H band → 1; a strong C=O or a strong C–O → 1; both → 2; an anhydride-type pair of strong C=O bands with a strong C–O → 3.
 * "Strong" is the existing rule (relative intensity ≥ irStrongRelativeIntensity of the strongest IR band). Returns null without IR observations (no basis).
 */
export function oxygenEvidenceFloor(observations:ObservedEvidence[],nitrogenAllowed:boolean):OxygenEvidenceFloor|null {
 const F=CFG.oxygenFloor,strong=CFG.irStrongRelativeIntensity;
 const ir=observations.filter(o=>o.modality==='IR'&&!o.optional);
 if(!ir.length)return null;
 const label=(o:ObservedEvidence)=>`IR ${Math.round(o.value)} cm⁻¹`;
 const levels:{level:number;text:string;observationIds:string[]}[]=[];
 const broad=ir.filter(o=>o.shape==='BROAD'&&o.value>=CFG.irBroadXHRange[0]&&o.value<=CFG.irBroadXHRange[1]);
 const broadH1=!nitrogenAllowed?observations.filter(o=>o.modality==='1H_NMR'&&!o.optional&&(o.shape==='BROAD'||o.multiplicity==='br'||o.multiplicity==='br s')):[];
 if(broad.length)levels.push({level:1,text:`${broad.map(label).join('、')} 寬帶 → O–H`,observationIds:broad.map(o=>o.id)});
 else if(broadH1.length)levels.push({level:1,text:`寬的可交換 ¹H 訊號 → O–H（沒有 N 專屬證據，預設為 O）`,observationIds:broadH1.map(o=>o.id)});
 const co=strongIrBands(observations,F.carbonylRange,strong),c_o=strongIrBands(observations,F.coRange,strong);
 const high=strongIrBands(observations,F.anhydrideHighRange,strong),low=strongIrBands(observations,F.anhydrideLowRange,strong);
 if(co.length)levels.push({level:1,text:`${co.map(label).join('、')} 強 C=O 帶`,observationIds:co.map(o=>o.id)});
 if(c_o.length)levels.push({level:1,text:`${c_o.map(label).join('、')} 強 C–O 帶`,observationIds:c_o.map(o=>o.id)});
 if(co.length&&c_o.length)levels.push({level:2,text:`${[...co,...c_o].map(label).join('、')}：強 C=O 與強 C–O 並有（酯／羧酸型）`,observationIds:[...co,...c_o].map(o=>o.id)});
 if(high.length&&low.length&&c_o.length)levels.push({level:3,text:`${[...high,...low,...c_o].map(label).join('、')}：成對的強 C=O 帶與強 C–O（酸酐型）`,observationIds:[...high,...low,...c_o].map(o=>o.id)});
 const floor=Math.max(0,...levels.map(l=>l.level));
 return {floor,sources:levels.filter(l=>l.level===floor).map(({text,observationIds})=>({text,observationIds}))};
}
