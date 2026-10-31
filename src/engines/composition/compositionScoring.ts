import {isotopeEnvelope} from '../scientificEngines/isotopeEnvelope';
import {COMPOSITION_CONFIG as CFG} from './compositionConfig';
import type {Feature} from './functionalGroupBounds';
import {commonRangeViolations,dbeOf} from './goldenRules';
import type {ElementEvidence,IonIsotopes,IsotopeObservation} from './msComposition';
import type {NmrEvidence} from './nmrComposition';
import {V12_CONFIG} from '../constraints/v12Config';
import type {CompositionReason,ElementCounts,IonHypothesis,OxygenEvidenceFloor} from './types';

export interface ScoringContext {
 nmr:NmrEvidence;
 features:Feature[];
 elementEvidence:ElementEvidence[];
 isotopes:Record<string,IonIsotopes>;
 /** Whether the hard feature bounds were relaxed to soft because they removed every hypothesis (審核決定 4). */
 hardBoundsRelaxed:boolean;
 /** N gating mode (v1.1.6). */
 nitrogenMode:'EVIDENCE'|'EVEN_ION_ONLY'|'NONE';
 /** v1.2.1 (A2): the O evidence floor; set only when useV121Planning is on, the route has no mass, and IR observations exist. */
 oxygenFloor?:OxygenEvidenceFloor|null;
 /** v1.2.1: a feature that only one modality (IR range matching) produced is reported but not scored down (3030/2965 cm-1 read as acid O–H, 1612 as amide I, … inflate the bounds). */
 ignoreRangeMatchedSoftBounds?:boolean;
}
export interface ScoredComposition {score:number;support:CompositionReason[];contradiction:CompositionReason[];unknown:CompositionReason[]}

const w=CFG.weights;
const gauss=(d:number,sigma:number)=>-0.5*(d/Math.max(sigma,1e-9))**2;
const n=(c:ElementCounts,e:keyof ElementCounts)=>c[e]??0;

/** Per-element nominal isotope distributions from the shared NIST table, cached; the molecule is their convolution. */
const elementDistributions=new Map<string,number[]>();
function elementDistribution(element:string,count:number):number[] {
 const key=element+count;
 let dist=elementDistributions.get(key);
 if(!dist){
  const env=isotopeEnvelope({[element]:count},CFG.isotopeMaxOffset);
  dist=Array.from({length:CFG.isotopeMaxOffset+1},(_,k)=>env.find(p=>p.nominalOffset===k)?.probability??0);
  elementDistributions.set(key,dist);
 }
 return dist;
}
export function isotopeRatios(counts:ElementCounts):number[] {
 try{
  let dist=[1,...Array(CFG.isotopeMaxOffset).fill(0)];
  for(const [e,c] of Object.entries(counts)){
   if(!c)continue;
   const d=elementDistribution(e,c),next=Array(dist.length).fill(0);
   for(let i=0;i<dist.length;i++)if(dist[i])for(let j=0;i+j<dist.length;j++)next[i+j]+=dist[i]*d[j];
   dist=next;
  }
  return [1,2,3,4].map(k=>100*(dist[k]??0)/dist[0]);
 }catch{return [0,0,0,0];}
}

/** Sum of uncalibrated log-compatibility terms plus the support / contradiction / unknown reasons behind them. */
export function scoreComposition(counts:ElementCounts,mass:number,ion:IonHypothesis|null,ctx:ScoringContext,withReasons=true):ScoredComposition {
 const out:ScoredComposition={score:0,support:[],contradiction:[],unknown:[]};
 // The numeric pass (withReasons=false) ranks every enumerated formula; reasons are built only for the kept ones.
 const reason=(list:CompositionReason[],text:string,ids:string[],source:CompositionReason['source'],strength:CompositionReason['strength']='SOFT')=>{if(withReasons)list.push({text,observationIds:ids,source,strength});};
 // Mass and ion assignment.
 if(ion){
  out.score+=ion.prior;
  const err=mass-ion.neutralMass;
  out.score+=w.mass*gauss(err,ion.toleranceDa/2);
  reason(out.support,`${ion.adduct} m/z ${ion.observedMz} → 中性質量 ${ion.neutralMass.toFixed(4)}；本分子式 ${mass.toFixed(4)}，誤差 ${err.toFixed(4)} Da（${(1e6*err/ion.neutralMass).toFixed(1)} ppm，容差 ${ion.toleranceDa.toFixed(4)} Da）`,[ion.observationId],'MS','HARD');
  if(!ion.confirmedByUser)reason(out.unknown,`離子型式 ${ion.adduct} 未經使用者確認`,[ion.observationId],'MS');
  const nominalOdd=Math.round(mass)%2===1,nOdd=(n(counts,'N')+n(counts,'P'))%2===1;
  if(nominalOdd===nOdd)reason(out.support,`符合氮規則：名義中性質量 ${Math.round(mass)} 與 N 數 ${n(counts,'N')} 奇偶一致`,[ion.observationId],'RULE');
  else reason(out.contradiction,`不符合氮規則：名義中性質量 ${Math.round(mass)} 與 N 數 ${n(counts,'N')} 奇偶不一致`,[ion.observationId],'RULE');
  // Isotopes.
  const iso=ctx.isotopes[ion.id],pred=isotopeRatios(counts);
  const check=(label:string,o:IsotopeObservation|undefined,predicted:number)=>{
   if(!o)return;
   if(o.status==='NOT_MARKED'){reason(out.unknown,`${label} 未標記；不當作不存在`,[ion.observationId],'MS_ISOTOPE');return;}
   if(o.status==='INTENSITY_UNKNOWN'){reason(out.unknown,`${label} 強度未知`,[ion.observationId],'MS_ISOTOPE');return;}
   const observed=o.ratio!,sigma=o.status==='ABSENT_COVERED'?Math.max(CFG.isotopeErrorAbsolute,CFG.ionMinRelativeIntensity):Math.max(CFG.isotopeErrorAbsolute,CFG.isotopeErrorRelative*observed);
   out.score+=w.isotope*gauss(observed-predicted,sigma);
   const ids=[ion.observationId,...(o.observationId?[o.observationId]:[])];
   const text=`${label} 觀測 ${o.status==='ABSENT_COVERED'?'未檢出（完整峰表）':observed.toFixed(1)+'%'}，理論 ${predicted.toFixed(1)}%`;
   if(Math.abs(observed-predicted)<=2*sigma)reason(out.support,text,ids,'MS_ISOTOPE');else reason(out.contradiction,text,ids,'MS_ISOTOPE');
  };
  check('M+1/M',iso?.m1,pred[0]);check('M+2/M',iso?.m2,pred[1]);check('M+4/M',iso?.m4,pred[3]);
 }else reason(out.unknown,'無質量依據，分子大小未確認',[],'RULE');
 // 13C carbon count.
 const c13=ctx.nmr.c13,C=n(counts,'C');
 if(c13&&c13.count){
  const extra=C-c13.count,soft=c13.count*(CFG.noMassCarbonFactor-1)+CFG.noMassCarbonOffset;
  if(extra===0)reason(out.support,`C=${C} 等於 ¹³C 獨立訊號數 ${c13.count}`,c13.observationIds,'13C_NMR');
  else if(extra<=soft){out.score-=w.carbonSymmetryStep*extra;reason(out.unknown,`C=${C} 比 ¹³C 訊號數 ${c13.count} 多 ${extra}，需要對稱等價或重疊才能解釋`,c13.observationIds,'13C_NMR');}
  else {out.score-=w.carbonSymmetryStep*soft+w.carbonBeyond*(extra-soft);reason(out.contradiction,`C=${C} 遠多於 ¹³C 訊號數 ${c13.count}`,c13.observationIds,'13C_NMR');}
  if(c13.deptHydrogenMin!==null)reason(out.support,`H=${n(counts,'H')} ≥ DEPT 推得的碳上氫數下限 ${c13.deptHydrogenMin}`,c13.deptIds,'13C_NMR','HARD');
 }else reason(out.unknown,'沒有 ¹³C 訊號，碳數無直接依據',[],'13C_NMR');
 // 1H multiples.
 const h1=ctx.nmr.h1,H=n(counts,'H');
 if(h1?.sum){
  let best={cost:Infinity,k:1,e:0};
  for(let k=1;k<=CFG.h1MaxMultiple;k++)for(let e=0;e<=CFG.maxExchangeableMissing;e++){
   const cost=w.hydrogenDeviation*Math.abs(H-(k*h1.sum+e))+w.exchangeableMissing*e+w.hydrogenMultipleStep*(k-1);
   if(cost<best.cost)best={cost,k,e};
  }
  const factor=h1.complete?1:w.partialCoverageHydrogenFactor;
  out.score-=factor*best.cost;
  const target=best.k*h1.sum+best.e,ratio=h1.ratio!.join(':');
  if(H===target)reason(out.support,`H=${H} = ${best.k}×${h1.sum}（最簡比 ${ratio}）${best.e?`＋${best.e} 個可能缺失的可交換氫`:''}`,h1.integralIds,'1H_NMR');
  else reason(out.contradiction,`H=${H} 不是最簡比 ${ratio}（S=${h1.sum}）的整數倍（最接近 ${target}）`,h1.integralIds,'1H_NMR');
  if(!h1.complete)reason(out.unknown,`¹H 峰表未確認完整${h1.missingIntegrals?`（${h1.missingIntegrals} 個峰沒有積分）`:''}，總氫數可能更多`,h1.integralIds,'1H_NMR');
 }else reason(out.unknown,'沒有可用的 ¹H 積分，氫數無直接依據',[],'1H_NMR');
 // Functional-group bounds.
 const dbe=dbeOf(counts);
 for(const f of ctx.features){
   const ok=Object.entries(f.mins).every(([e,v])=>n(counts,e as keyof ElementCounts)>=v!)&&dbe>=f.dbeMin;
  const need=[...Object.entries(f.mins).map(([e,v])=>`${e}≥${v}`),...(f.dbeMin?[`DBE≥${f.dbeMin}`]:[])].join('、');
  const strength=f.hard&&!ctx.hardBoundsRelaxed?'HARD':'SOFT';
  const src=f.modalities.length===1&&f.modalities[0]==='IR'?'IR':'HYPOTHESIS';
  if(ok)reason(out.support,`${f.label}（${f.modalities.join('＋')}）要求 ${need}，符合`,f.observationIds,src,strength);
  else if(ctx.ignoreRangeMatchedSoftBounds&&!f.hard)reason(out.unknown,`${f.label}（僅 ${f.modalities.join('＋')} 範圍比對）要求 ${need}，不符合；範圍比對的假官能基不計分（v1.2.1）`,f.observationIds,src,'SOFT');
  else {out.score-=w.softBoundViolation;reason(out.contradiction,`${f.label}（${f.modalities.join('＋')}）要求 ${need}，不符合`,f.observationIds,src,'SOFT');}
 }
 // v1.2.1 (A2): O above (evidence floor + allowed) is scored down one step per extra O. Never an exclusion.
 if(ctx.oxygenFloor){
  const limit=ctx.oxygenFloor.floor+V12_CONFIG.planning.oxygenAllowedAboveFloor,O=n(counts,'O');
  if(O>limit){out.score-=w.oxygenExcess*(O-limit);reason(out.contradiction,`O=${O} 比 IR 證據的 O 下限 ${ctx.oxygenFloor.floor} 多 ${O-ctx.oxygenFloor.floor} 個（超過 +${V12_CONFIG.planning.oxygenAllowedAboveFloor} 起逐級扣分）`,ctx.oxygenFloor.sources.flatMap(x=>x.observationIds),'IR');}
 }
 const nFeature=ctx.features.some(f=>(f.mins.N??0)>0);
 if(n(counts,'N')&&ctx.nitrogenMode==='EVEN_ION_ONLY'){out.score-=w.nitrogenEvenIonOnly*n(counts,'N');reason(out.unknown,`含 ${n(counts,'N')} 個 N：MS 分子離子為偶數名義質量，沒有其他 N 專屬證據，信心降低`,[],'RULE');}
 else if(n(counts,'N')&&!nFeature&&ctx.nitrogenMode!=='EVIDENCE'){out.score-=w.nitrogenNoEvidence*n(counts,'N');reason(out.unknown,`含 ${n(counts,'N')} 個 N，但沒有官能基證據指向 N`,[],'RULE');}
 // Golden Rules common ranges.
 for(const v of commonRangeViolations(counts)){out.score-=w.goldenCommon;reason(out.contradiction,`Golden Rules 常見範圍：${v}`,[],'RULE');}
 // Element priors.
 const evidence=(e:string)=>ctx.elementEvidence.filter(x=>x.element===e);
 const m2Evidence=ion?ctx.isotopes[ion.id]?.m2:undefined;
 const halogenSupported=m2Evidence?.status==='OBSERVED'&&(m2Evidence.ratio??0)>=CFG.m2HalogenEvidencePercent;
 if(n(counts,'S')){
  const ev=evidence('S');
  if(ev.length){if(withReasons)ev.forEach(x=>out.support.push(x.reason));}
  else {out.score-=w.sulfurNoEvidence*n(counts,'S');reason(out.unknown,`含 ${n(counts,'S')} 個 S，沒有同位素證據`,[],'RULE');}
 }
 for(const e of ['Cl','Br'] as const)if(n(counts,e)&&!halogenSupported){out.score-=w.halogenNoEvidence*n(counts,e);reason(out.unknown,`含 ${n(counts,e)} 個 ${e}，沒有 M+2 同位素證據`,[],'RULE');}
 for(const e of ['F','I','P','Si'] as const)if(n(counts,e)){
  out.score-=w.rareElement*n(counts,e);
  if(withReasons)evidence(e).forEach(x=>out.support.push(x.reason));
 }
 return out;
}
