import type {ExperimentalSpectrumData} from '../../types/spectrum';
import type {ObservedEvidence} from '../reasoning/types';
import {COMPOSITION_CONFIG as CFG} from './compositionConfig';
import type {ElementEvidence} from './msComposition';

export interface C13Evidence {
 /** Signals that raise the carbon lower bound (auto solvent candidates are not counted, 審核決定 6). */
 count:number;
 observationIds:string[];
 optionalCount:number;
 complete:boolean;
 /** Hard lower bound on C-bound H from per-peak DEPT/APT types; null when none given. */
 deptHydrogenMin:number|null;
 deptIds:string[];
 carbonylIds:string[];
 heteroSp3Ids:string[];
 aromaticIds:string[];
 nitrileIds:string[];
}
export interface H1Evidence {
 /** Simplest integer ratio of the integrated (non-optional) signals and its sum S; null without integrals. */
 ratio:number[]|null;
 sum:number|null;
 integralIds:string[];
 /** True when every non-optional signal has an integral and the list is confirmed complete. */
 complete:boolean;
 optionalExcluded:number;
 missingIntegrals:number;
 aromaticIds:string[];
 aldehydeIds:string[];
}
export interface NmrEvidence {c13:C13Evidence|null;h1:H1Evidence|null;elementEvidence:ElementEvidence[];limitations:string[]}

const inRange=(v:number,[lo,hi]:readonly [number,number]|[number,number])=>v>=lo&&v<=hi;
const DEPT_H:Record<string,number>={CH:1,CH2:2,CH3:3,C:0,C_quat:0};

/** Simplest integer ratio within ±tolerance: the largest unit u such that every integral/u is near an integer ≥ 1. */
export function simplestIntegerRatio(values:number[],tolerance:number=CFG.h1IntegralTolerance,maxMultiplier:number=CFG.h1MaxRatioMultiplier):number[]|null {
 if(!values.length||values.some(v=>!(v>0)))return null;
 const units=new Set<number>();
 for(const v of values)for(let m=1;m<=maxMultiplier;m++)units.add(v/m);
 for(const u of [...units].sort((a,b)=>b-a)){
  const ratio=values.map(v=>v/u);
  if(ratio.every(r=>Math.round(r)>=1&&Math.abs(r-Math.round(r))<=tolerance))return ratio.map(Math.round);
 }
 return null;
}

export function extractNmrEvidence(observations:ObservedEvidence[],spectra:Partial<Record<string,ExperimentalSpectrumData>>):NmrEvidence {
 const out:NmrEvidence={c13:null,h1:null,elementEvidence:[],limitations:[]};
 const c=observations.filter(o=>o.modality==='13C_NMR'),h=observations.filter(o=>o.modality==='1H_NMR');
 if(c.length){
  const counted=c.filter(o=>!o.optional),peaks=spectra['13C_NMR']?.peaks??[];
  const dept=counted.map(o=>({o,type:peaks.find(p=>p.id===o.signalId)?.deptType})).filter(d=>d.type&&d.type in DEPT_H);
  out.c13={count:counted.length,observationIds:counted.map(o=>o.id),optionalCount:c.length-counted.length,complete:counted.every(o=>o.coverage==='CONFIRMED_COMPLETE'),
   deptHydrogenMin:dept.length?dept.reduce((s,d)=>s+DEPT_H[d.type!],0):null,deptIds:dept.map(d=>d.o.id),
   carbonylIds:counted.filter(o=>o.value>=CFG.c13CarbonylMin).map(o=>o.id),
   heteroSp3Ids:counted.filter(o=>inRange(o.value,CFG.c13HeteroSp3Range)).map(o=>o.id),
   aromaticIds:counted.filter(o=>inRange(o.value,CFG.c13AromaticRange)).map(o=>o.id),
   nitrileIds:counted.filter(o=>inRange(o.value,CFG.c13NitrileRange)).map(o=>o.id)};
  if(out.c13.optionalCount)out.limitations.push(`¹³C 有 ${out.c13.optionalCount} 個自動判定的溶劑候選峰，不計入碳數下限。`);
  for(const o of c)if(o.multiplicity==='d'&&o.jHz.some(j=>inRange(j,CFG.c13FluorineJRange)))out.elementEvidence.push({element:'F',reason:{text:`¹³C δ ${o.value} 為 J=${o.jHz.join(',')} Hz 的雙重峰，與 ¹J(C–F) 相容`,observationIds:[o.id],source:'13C_NMR',strength:'SOFT'}});
 }
 if(h.length){
  const counted=h.filter(o=>!o.optional),integrated=counted.filter(o=>o.relativeIntegral!==null&&o.relativeIntegral>0);
  const ratio=simplestIntegerRatio(integrated.map(o=>o.relativeIntegral!));
  out.h1={ratio,sum:ratio?ratio.reduce((a,b)=>a+b,0):null,integralIds:integrated.map(o=>o.id),
   complete:integrated.length===counted.length&&counted.every(o=>o.coverage==='CONFIRMED_COMPLETE'),
   optionalExcluded:h.length-counted.length,missingIntegrals:counted.length-integrated.length,
   aromaticIds:counted.filter(o=>inRange(o.value,CFG.h1AromaticRange)).map(o=>o.id),
   aldehydeIds:counted.filter(o=>inRange(o.value,CFG.h1AldehydeRange)).map(o=>o.id)};
  if(out.h1.optionalExcluded)out.limitations.push(`¹H 有 ${out.h1.optionalExcluded} 個自動判定的溶劑候選峰，不計入積分總和與最簡比。`);
  if(integrated.length&&!ratio)out.limitations.push(`¹H 積分無法在 ±${CFG.h1IntegralTolerance} 內化為整數比，未產生氫數證據。`);
  for(const o of h)if(o.jHz.some(j=>inRange(j,CFG.h1FluorineJRange)))out.elementEvidence.push({element:'F',reason:{text:`¹H δ ${o.value} 有 J=${o.jHz.join(',')} Hz，與 ²J(H–F) 相容`,observationIds:[o.id],source:'1H_NMR',strength:'SOFT'}});
  integrated.forEach((o,i)=>{
   if(!o.optional&&ratio&&o.multiplicity==='s'&&Math.abs(o.value)>CFG.h1TmsReferenceLimit&&inRange(o.value,CFG.h1SiliconRange)&&ratio[i]>=CFG.h1SiliconMinRatioUnits)
    out.elementEvidence.push({element:'Si',reason:{text:`¹H δ ${o.value} 為 ${ratio[i]}H（相對）單峰，與 Si–CH₃ 相容（不是 δ 0.00 的 TMS 參考峰）`,observationIds:[o.id],source:'1H_NMR',strength:'SOFT'}});
  });
 }
 return out;
}
