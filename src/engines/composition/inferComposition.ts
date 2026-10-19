import type {IntegratedAnalysisBundle} from '../chemicalFeatureEngine';
import type {ObservedEvidence} from '../reasoning/types';
import {sourceSpectra} from '../scientificEngines/evidenceLedger';
import {COMPOSITION_CONFIG as CFG} from './compositionConfig';
import {scoreComposition,type ScoringContext} from './compositionScoring';
import {enumerateFormulas,type EnumerationSpec} from './formulaEnumerator';
import {combineBounds,functionalGroupFeatures} from './functionalGroupBounds';
import {dbeOf,formatHill,monoisotopicMass,parseCounts} from './goldenRules';
import {extractMsEvidence,type MsEvidence} from './msComposition';
import {extractNmrEvidence} from './nmrComposition';
import {GENERATOR_ELEMENTS,type ElementClue,type CompositionElement,type CompositionHypothesis,type CompositionInferenceResult,type ElementCounts,type IonHypothesis,type MassBasis} from './types';

export interface CompositionInput {
 bundle:IntegratedAnalysisBundle;
 /** Actual observations from collectObservedEvidence; their ids are reused in every reason. */
 observations:ObservedEvidence[];
 /** Validated user formula (bundle.userSuppliedFormula); always a hard constraint. */
 userFormula:string|null;
}

const RARE=['F','I','P','Si'] as const;
const now=()=>performance.now();

function hypothesis(counts:ElementCounts,mass:number,ion:IonHypothesis|null,basis:MassBasis,scored:ReturnType<typeof scoreComposition>):CompositionHypothesis {
 const formula=formatHill(counts);
 const unsupported=(Object.keys(counts) as CompositionElement[]).filter(e=>(counts[e]??0)>0&&!GENERATOR_ELEMENTS.includes(e)).sort();
 const err=ion?mass-ion.neutralMass:null;
 return {id:`comp-${formula}`,formula,counts,dbe:dbeOf(counts),monoisotopicMass:mass,massBasis:basis,ionHypothesisId:ion?.id??null,massErrorDa:err,massErrorPpm:err===null?null:1e6*err/ion!.neutralMass,
  relativeConfidence:0,calibrated:false,score:scored.score,support:scored.support,contradiction:scored.contradiction,unknown:scored.unknown,
  generatorSupported:!unsupported.length,unsupportedElements:unsupported,searched:false,sizeConfirmed:basis!=='NONE'};
}
interface Candidate {formula:string;counts:ElementCounts;mass:number;ion:IonHypothesis|null;basis:MassBasis;score:number;massErrorDa:number|null}
const order=(a:{score:number;massErrorDa:number|null;formula:string},b:{score:number;massErrorDa:number|null;formula:string})=>b.score-a.score||Math.abs(a.massErrorDa??0)-Math.abs(b.massErrorDa??0)||a.formula.localeCompare(b.formula);
function softmax(list:CompositionHypothesis[]){
 if(!list.length)return;
 const max=Math.max(...list.map(h=>h.score)),exp=list.map(h=>Math.exp(h.score-max)),sum=exp.reduce((a,b)=>a+b,0);
 list.forEach((h,i)=>{h.relativeConfidence=exp[i]/sum;});
}

/**
 * Competing molecular-formula hypotheses from whatever spectra are present (P1a).
 * Formulas are hypotheses only: several are always returned with uncalibrated relative confidence,
 * and a user formula overrides inference entirely.
 */
export function inferComposition(input:CompositionInput):CompositionInferenceResult {
 const started=now();
 const {bundle,observations}=input;
 const spectra=sourceSpectra(bundle);
 const ms=extractMsEvidence(observations,spectra.MS);
 const nmr=extractNmrEvidence(observations,spectra as Record<string,never>);
 const features=functionalGroupFeatures(observations,bundle.irFindings??[],nmr);
 const elementEvidence=[...(ms?.elementEvidence??[]),...nmr.elementEvidence];
 const hasEvidence=(e:CompositionElement)=>elementEvidence.some(x=>x.element===e);
 const limitations=[...(ms?.limitations??[]),...nmr.limitations];
 const hard=combineBounds(features.filter(f=>f.hard));
 const elementClues:ElementClue[]=[
  ...features.flatMap(f=>Object.entries(f.mins).map(([element,minimum])=>({element:element as CompositionElement,minimum:minimum!,strength:(f.hard?'HARD':'SOFT') as ElementClue['strength'],text:`${f.label}（${f.modalities.join('＋')}）`,observationIds:f.observationIds,source:(f.modalities.length===1&&f.modalities[0]==='IR'?'IR':'HYPOTHESIS') as ElementClue['source']}))),
  ...elementEvidence.map(x=>({element:x.element,minimum:1,strength:'SOFT' as const,text:x.reason.text,observationIds:x.reason.observationIds,source:x.reason.source})),
 ].sort((a,b)=>a.element.localeCompare(b.element)||b.minimum-a.minimum||a.text.localeCompare(b.text));
 const result:CompositionInferenceResult={status:'INFERRED',hypotheses:[],ionHypotheses:ms?.ions??[],elementsConsidered:[],elementsExcluded:[],elementClues,
  bounds:{carbon:null,hydrogenMultiples:nmr.h1?.sum?Array.from({length:CFG.h1MaxMultiple},(_,i)=>(i+1)*nmr.h1!.sum!):null,heteroMinimums:hard.mins,dbeMin:hard.dbeMin,hardBoundsRelaxed:false},
  enumeration:{enumeratedNodes:0,passedHardFilters:0,returned:0,truncatedByNodes:false,droppedByKeepLimit:0},limitations,elapsedMs:0};
 const ctx:ScoringContext={nmr,features,elementEvidence,isotopes:ms?.isotopes??{},hardBoundsRelaxed:false};
 const finish=()=>{result.elapsedMs=now()-started;return result;};

 // User formula: the only hypothesis; evidence only marks support or contradiction.
 const validation=bundle.constraints?.userSuppliedFormulaValidation;
 if(validation&&(!validation.isValid||!validation.isSupported)){
  result.status='INVALID_USER_FORMULA';limitations.push('使用者分子式無效或不支援；依既有規則停止推論，不以推斷分子式替代。');return finish();
 }
 if(input.userFormula){
  result.status='USER_FORMULA';
  const counts=parseCounts(input.userFormula);
  if(!counts){limitations.push(`使用者分子式 ${input.userFormula} 含本層不支援的元素；保留為硬限制，未計算組成證據。`);return finish();}
  const mass=monoisotopicMass(counts);
  const ions=(ms?.ions??[]).filter(i=>!i.rejected).sort((a,b)=>Math.abs(mass-a.neutralMass)-Math.abs(mass-b.neutralMass));
  const ion=ions[0]&&Math.abs(mass-ions[0].neutralMass)<=ions[0].toleranceDa?ions[0]:null;
  const scored=scoreComposition(counts,mass,ion,ctx);
  if(ms?.ions.length&&!ion)scored.contradiction.push({text:`使用者分子式質量 ${mass.toFixed(4)} 與任何 MS 分子離子假設都不在容差內`,observationIds:ms.ions.map(i=>i.observationId),source:'MS',strength:'SOFT'});
  for(const f of features)if(f.hard&&!(Object.entries(f.mins).every(([e,v])=>(counts[e as CompositionElement]??0)>=v!)&&dbeOf(counts)>=f.dbeMin))
   scored.contradiction.push({text:`${f.label} 由 ${f.modalities.join('＋')} 共同支持，但使用者分子式不滿足其下限；使用者分子式仍優先`,observationIds:f.observationIds,source:'HYPOTHESIS',strength:'HARD'});
  const h=hypothesis(counts,mass,ion,'USER_FORMULA',scored);h.relativeConfidence=1;h.sizeConfirmed=true;
  result.hypotheses=[h];result.elementsConsidered=(Object.keys(counts) as CompositionElement[]).sort();result.enumeration.returned=1;
  return finish();
 }

 const c13Count=nmr.c13?.count??0;
 const usableIons=(ms?.ions??[]).filter(i=>!i.rejected);
 if(!usableIons.length&&!c13Count){
  result.status='INSUFFICIENT_DATA';
  limitations.push(ms?.ions.length?'所有 MS 分子離子假設都被排除，且沒有 ¹³C 訊號；無法界定分子大小，不枚舉分子式。':'沒有可用的分子離子質量，也沒有 ¹³C 訊號；無法界定分子大小，不枚舉分子式。');
  return finish();
 }
 const excluded=new Map<CompositionElement,string>();
 for(const e of RARE)if(!hasEvidence(e)&&e!=='P')excluded.set(e,'預設禁止；沒有該元素的特定證據（審核決定 7）');
 if(!excluded.has('P'))excluded.set('P','預設禁止；只有高解析質量無法以其他元素解釋時才開放');

 const run=(relaxed:boolean)=>{
  const bounds=relaxed?{mins:{} as ElementCounts,dbeMin:0}:hard;
  const best=new Map<string,Candidate>();
  const considered=new Set<CompositionElement>(['C','H']);
  const push=(spec:EnumerationSpec,ion:IonHypothesis|null,basis:MassBasis)=>{
   const out=enumerateFormulas(spec);
   result.enumeration.enumeratedNodes+=out.nodes;result.enumeration.passedHardFilters+=out.passedHardFilters;result.enumeration.truncatedByNodes||=out.truncated;
   for(const f of out.formulas){
    const cand:Candidate={formula:formatHill(f.counts),counts:f.counts,mass:f.mass,ion,basis,score:scoreComposition(f.counts,f.mass,ion,ctx,false).score,massErrorDa:ion?f.mass-ion.neutralMass:null};
    const old=best.get(cand.formula);
    if(!old||order(cand,old)<0)best.set(cand.formula,cand);
   }
   for(const [e,v] of Object.entries(spec.caps))if(v)considered.add(e as CompositionElement);
   return out.formulas.length;
  };
  const carbonMin=Math.max(1,c13Count,bounds.mins.C??0);
  const hMin=nmr.c13?.deptHydrogenMin??0;
  const rareCaps=Object.fromEntries(RARE.filter(e=>e!=='P'&&hasEvidence(e)).map(e=>[e,CFG.evidenceCaps[e]]));
  if(usableIons.length){
   const halogenExcludedBy:string[]=[];
   for(const ion of usableIons){
    const iso=ms!.isotopes[ion.id];
    const m2=iso?.m2;
    const m2Known=m2&&(m2.status==='OBSERVED'||m2.status==='ABSENT_COVERED');
    const halogenCap=m2Known&&(m2.ratio??0)<CFG.m2HardExclusionPercent?0:m2?.status==='OBSERVED'&&(m2.ratio??0)>=CFG.m2HalogenEvidencePercent?CFG.evidenceCaps.Cl:CFG.defaultCaps.Cl;
    if(halogenCap===0)halogenExcludedBy.push(`${ion.id}（M+2/M=${(m2!.ratio??0).toFixed(1)}% < ${CFG.m2HardExclusionPercent}%）`);
    const bracket=CFG.goldenRule1.find(b=>ion.neutralMass<b.maxMass)??CFG.goldenRule1[CFG.goldenRule1.length-1];
    const caps:ElementCounts={C:bracket.caps.C,N:Math.max(bracket.caps.N,bounds.mins.N??0),O:Math.max(bracket.caps.O,bounds.mins.O??0),S:hasEvidence('S')?CFG.evidenceCaps.S:CFG.defaultCaps.S,Cl:halogenCap,Br:halogenCap,...rareCaps};
    const spec:EnumerationSpec={neutralMass:ion.neutralMass,toleranceDa:ion.toleranceDa,caps,mins:bounds.mins,carbonRange:[carbonMin,bracket.caps.C],hydrogenMin:hMin,dbeMin:bounds.dbeMin};
    const basis:MassBasis=ion.highResolution?'HRMS':'LOW_RES_MS';
    if(!push(spec,ion,basis)&&ion.highResolution){
     // P only when the HRMS mass cannot be explained without it (審核決定 7).
     const found=push({...spec,caps:{...caps,P:CFG.evidenceCaps.P}},ion,basis);
     if(found){excluded.delete('P');limitations.push(`${ion.id} 的高解析質量無法以不含 P 的組成解釋，已開放 P（限 ${CFG.evidenceCaps.P} 個並降信心）。`);}
    }
   }
   // Cl/Br are listed as excluded only when every usable ion rules them out; otherwise the per-ion exclusion is a limitation.
   if(halogenExcludedBy.length===usableIons.length)for(const e of ['Cl','Br'] as const)excluded.set(e,`M+2 已標記且小於門檻：${halogenExcludedBy.join('、')}`);
   else if(halogenExcludedBy.length&&!relaxed)limitations.push(`Cl／Br 只在下列離子假設中被 M+2 排除：${halogenExcludedBy.join('、')}；其他離子假設的 M+2 未標記，仍允許。`);
   result.bounds.carbon=[carbonMin,null];
  }else{
   const cMax=c13Count*CFG.noMassCarbonFactor+CFG.noMassCarbonOffset;
   const caps:ElementCounts={C:cMax,N:(bounds.mins.N??0)+CFG.noMassExtra.N,O:(bounds.mins.O??0)+CFG.noMassExtra.O,S:(bounds.mins.S??0)+CFG.noMassExtra.S,...Object.fromEntries(Object.entries(rareCaps).filter(([e])=>e==='F'||e==='Si'))};
   excluded.set('Cl','沒有質量／同位素資料，無法判斷 Cl');excluded.set('Br','沒有質量／同位素資料，無法判斷 Br');
   if(!excluded.has('I')&&!caps.I)excluded.set('I','沒有質量資料時不枚舉 I');
   const sum=nmr.h1?.sum,hs=sum?[...new Set(Array.from({length:CFG.h1MaxMultiple},(_,k)=>Array.from({length:CFG.maxExchangeableMissing+1},(_,e)=>(k+1)*sum+e)).flat())].sort((a,b)=>a-b):null;
   push({caps,mins:bounds.mins,carbonRange:[carbonMin,cMax],hydrogenSet:hs,hydrogenMin:hMin,dbeMin:bounds.dbeMin},null,'NONE');
   result.bounds.carbon=[carbonMin,cMax];
   limitations.push('無質量依據，分子大小未確認：分子式只由 ¹³C 訊號數、¹H 積分倍數與官能基下限組合而成。');
  }
  result.elementsConsidered=[...considered].sort();
  return [...best.values()];
 };

 let list=run(false);
 const hasHard=features.some(f=>f.hard);
 if(!list.length&&hasHard){
  result.bounds.hardBoundsRelaxed=ctx.hardBoundsRelaxed=true;
  limitations.push('跨模態硬限制（元素／DBE 下限）使所有分子式被排除，已退回軟證據重算（審核決定 4）。');
  list=run(true);
 }
 list.sort(order);
 result.enumeration.droppedByKeepLimit=Math.max(0,list.length-CFG.maxHypotheses);
 const kept=list.slice(0,CFG.maxHypotheses).map(c=>hypothesis(c.counts,c.mass,c.ion,c.basis,scoreComposition(c.counts,c.mass,c.ion,ctx)));
 softmax(kept);
 result.hypotheses=kept;result.enumeration.returned=kept.length;
 result.elementsExcluded=[...excluded].map(([element,reason])=>({element,reason})).sort((a,b)=>a.element.localeCompare(b.element));
 if(result.enumeration.truncatedByNodes)limitations.push(`枚舉達節點上限 ${CFG.maxNodes}，候選集合不完整。`);
 if(result.enumeration.droppedByKeepLimit)limitations.push(`通過篩選的分子式有 ${list.length} 個，只保留信心最高的 ${CFG.maxHypotheses} 個，捨棄 ${result.enumeration.droppedByKeepLimit} 個。`);
 if(!kept.length){result.status='INSUFFICIENT_DATA';limitations.push('在目前的元素與範圍限制下沒有分子式通過篩選。');}
 limitations.push('相對信心是未校準的模型相容度，不是分子式正確的機率。');
 return finish();
}
export type {MsEvidence};
