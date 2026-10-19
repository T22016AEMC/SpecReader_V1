import type {ExperimentalSpectrumData} from '../../types/spectrum';
import type {ObservedEvidence} from '../reasoning/types';
import {neutralMassFromIon,type IonAdduct} from '../scientificEngines/ionMass';
import {COMPOSITION_CONFIG as CFG} from './compositionConfig';
import type {CompositionElement,CompositionReason,IonHypothesis} from './types';

export type IsotopeStatus='OBSERVED'|'ABSENT_COVERED'|'NOT_MARKED'|'INTENSITY_UNKNOWN';
export interface IsotopeObservation {status:IsotopeStatus;ratio:number|null;observationId:string|null}
export interface IonIsotopes {m1:IsotopeObservation;m2:IsotopeObservation;m4:IsotopeObservation}
export interface ElementEvidence {element:CompositionElement;reason:CompositionReason}
export interface MsEvidence {
 ions:IonHypothesis[];
 isotopes:Record<string,IonIsotopes>;
 elementEvidence:ElementEvidence[];
 limitations:string[];
 /** Whether the MS peak list is confirmed complete; only then can a missing peak mean "below detection". */
 coverageComplete:boolean;
}

const M1=1.00335483507,M2=1.997,M4=3.994;
const near=(obs:ObservedEvidence[],mz:number,window:number)=>{
 let best:ObservedEvidence|null=null;
 for(const o of obs)if(Math.abs(o.value-mz)<=window&&(!best||Math.abs(o.value-mz)<Math.abs(best.value-mz)))best=o;
 return best;
};
function adductPlan(s:ExperimentalSpectrumData|undefined):{adduct:IonAdduct;penalty:number}[]|null {
 const p=s?.msParams,w=CFG.weights;
 if(p?.msType==='ToF-SIMS'||p?.ionization==='ToF-SIMS+'||p?.ionization==='ToF-SIMS-'||p?.ionization==='SIMS / ToF-SIMS')return null;
 if(p?.ionAssignmentConfirmed&&p.adductType&&p.adductType!=='Auto')return [{adduct:p.adductType,penalty:0}];
 if(p?.adductType&&p.adductType!=='Auto')return [{adduct:p.adductType,penalty:0}];
 switch(p?.ionization){
  case 'EI':return [{adduct:'[M]+•',penalty:0}];
  case 'ESI+':case 'APCI':return [{adduct:'[M+H]+',penalty:0},{adduct:'[M+Na]+',penalty:w.secondaryAdduct},{adduct:'[M+NH4]+',penalty:w.secondaryAdduct}];
  case 'ESI-':return [{adduct:'[M-H]-',penalty:0}];
 }
 const positive=[{adduct:'[M]+•' as IonAdduct,penalty:0},{adduct:'[M+H]+' as IonAdduct,penalty:0},{adduct:'[M+Na]+' as IonAdduct,penalty:w.secondaryAdduct}];
 if(p?.polarity==='Positive')return positive;
 if(p?.polarity==='Negative')return [{adduct:'[M-H]-',penalty:0}];
 // 審核決定 5: unknown ionization and polarity lists both polarities.
 return [...positive,{adduct:'[M-H]-',penalty:w.unknownPolarity}];
}
const adductCode=(a:IonAdduct)=>a.replace(/[\[\]•]/g,'');

/** Molecular-ion hypotheses, implausible losses, isotope ratios and MS element evidence. */
export function extractMsEvidence(observations:ObservedEvidence[],spectrum:ExperimentalSpectrumData|undefined):MsEvidence|null {
 const obs=observations.filter(o=>o.modality==='MS').sort((a,b)=>b.value-a.value||a.id.localeCompare(b.id));
 if(!obs.length||!spectrum)return null;
 const out:MsEvidence={ions:[],isotopes:{},elementEvidence:[],limitations:[],coverageComplete:spectrum.observationCoverage==='CONFIRMED_COMPLETE'};
 const plan=adductPlan(spectrum);
 if(!plan){out.limitations.push('ToF-SIMS 為表面二次離子，不作為分子離子組成依據。');return out;}
 const p=spectrum.msParams;
 const confirmed=Boolean(p?.ionAssignmentConfirmed&&p.adductType&&p.adductType!=='Auto');
 const z=Math.abs(p?.chargeState??1)||1;
 const known=(o:ObservedEvidence)=>o.relativeIntensity!==null&&Number.isFinite(o.relativeIntensity);
 const base=Math.max(0,...obs.filter(known).map(o=>o.relativeIntensity!));
 const flagged=new Set(spectrum.peaks.filter(pk=>pk.isMolecularIonCandidate||pk.isPrecursorIon).map(pk=>pk.id));
 const window=CFG.isotopeSearchWindow/z;
 // Candidate peaks: from the high-m/z end, skipping weak peaks and peaks that are isotopes of a lower peak.
 const isIsotopeOfLower=(o:ObservedEvidence)=>known(o)&&obs.some(q=>known(q)&&q!==o&&(
  (Math.abs(o.value-q.value-M1/z)<=window&&q.relativeIntensity!>o.relativeIntensity!*CFG.isotopeParentRatioM1)||
  (Math.abs(o.value-q.value-M2/z)<=window&&q.relativeIntensity!>=o.relativeIntensity!*CFG.isotopeParentRatioM2)));
 let pool=obs.filter(o=>flagged.has(o.signalId));
 if(!pool.length)pool=obs.filter(o=>!(known(o)&&base>0&&100*o.relativeIntensity!/base<CFG.ionMinRelativeIntensity)&&!isIsotopeOfLower(o));
 const candidates=pool.slice(0,CFG.maxIonCandidatesPerSpectrum);
 candidates.forEach((x,rank)=>{
  for(const {adduct,penalty} of plan){
   if(z>1&&(adduct==='[M+Na]+'||adduct==='[M+NH4]+'))continue;
   let neutral:number;
   try{neutral=neutralMassFromIon(x.value,adduct,z);}catch{continue;}
   if(neutral<12||neutral>CFG.maxNeutralMass){out.limitations.push(`m/z ${x.value} 作為 ${adduct} 的中性質量 ${neutral.toFixed(3)} 超出 12–${CFG.maxNeutralMass} Da，未枚舉。`);continue;}
   const hr=Boolean(p?.isHighResolution);
   const tolerance=(hr?x.value*(p?.massTolerancePpm??CFG.hrmsTolerancePpm)/1e6:(p?.massToleranceDa??CFG.lowResToleranceDa))*z;
   const ion:IonHypothesis={id:`ion-${rank}-${adductCode(adduct)}`,observationId:x.id,observedMz:x.value,adduct,charge:z,neutralMass:neutral,toleranceDa:tolerance,highResolution:hr,confirmedByUser:confirmed,
    prior:-(rank*CFG.weights.ionRank+penalty+(confirmed?0:CFG.weights.unconfirmedIon))||0,rejected:false,rejectionReason:null};
   if(adduct==='[M]+•'&&known(x)){
    const hit=obs.find(q=>known(q)&&q.relativeIntensity!>=CFG.implausibleLossRatio*x.relativeIntensity!&&CFG.implausibleLossWindows.some(([lo,hi])=>{const d=(x.value-q.value)*z;return d>=lo-CFG.implausibleLossEdgeSlack&&d<=hi+CFG.implausibleLossEdgeSlack;}));
    if(hit){
     const reason=`m/z ${hit.value}（觀測 ${hit.id}）相當於丟失 ${((x.value-hit.value)*z).toFixed(1)} Da，屬 EI 不合理丟失範圍，m/z ${x.value} 不應是分子離子`;
     if(confirmed)out.limitations.push(`使用者確認的分子離子有不合理丟失疑慮：${reason}`);
     else {ion.rejected=true;ion.rejectionReason=reason;}
    }
   }
   out.ions.push(ion);
   const iso=(offset:number):IsotopeObservation=>{
    if(!known(x))return {status:'INTENSITY_UNKNOWN',ratio:null,observationId:null};
    const q=near(obs,x.value+offset/z,window);
    if(q&&known(q))return {status:'OBSERVED',ratio:100*q.relativeIntensity!/x.relativeIntensity!,observationId:q.id};
    if(q)return {status:'INTENSITY_UNKNOWN',ratio:null,observationId:q.id};
    return out.coverageComplete?{status:'ABSENT_COVERED',ratio:0,observationId:null}:{status:'NOT_MARKED',ratio:null,observationId:null};
   };
   out.isotopes[ion.id]={m1:iso(M1),m2:iso(M2),m4:iso(M4)};
  }
 });
 // Element evidence (審核決定 7).
 const ev=(element:CompositionElement,text:string,ids:string[],source:CompositionReason['source']='MS')=>out.elementEvidence.push({element,reason:{text,observationIds:ids,source,strength:'SOFT'}});
 const iodineIon=near(obs,CFG.iodineIonMz,CFG.diagnosticWindow);
 if(iodineIon)ev('I',`m/z ${iodineIon.value} 相當於 I⁺（127）`,[iodineIon.id]);
 const fragmentIon=near(obs,CFG.siliconIonMz,CFG.diagnosticWindow);
 if(fragmentIon)ev('Si',`m/z ${fragmentIon.value} 相當於 (CH₃)₃Si⁺（73）；也可能是其他 m/z 73 碎片`,[fragmentIon.id]);
 for(const ion of out.ions){
  if(ion.rejected)continue;
  if(ion.adduct==='[M]+•'){
   const i=near(obs,ion.observedMz-CFG.iodineLossDa,CFG.diagnosticWindow);if(i)ev('I',`m/z ${i.value} 相當於 M−127（丟失 I）`,[ion.observationId,i.id]);
   for(const loss of CFG.fluorineLossesDa){const f=near(obs,ion.observedMz-loss,CFG.diagnosticWindow);if(f)ev('F',`m/z ${f.value} 相當於 M−${Math.round(loss)}（丟失 ${Math.round(loss)===19?'F':'HF'}）`,[ion.observationId,f.id]);}
  }
  if(ion.highResolution){
   const defect=ion.neutralMass-Math.round(ion.neutralMass);
   if(defect<=CFG.iodineMassDefectMax)ev('I',`高解析中性質量虧損 ${defect.toFixed(4)} Da 明顯為負，與含 I（或 Br/Cl）相容`,[ion.observationId]);
  }
  const m2=out.isotopes[ion.id]?.m2;
  if(m2?.status==='OBSERVED'&&m2.ratio!==null&&m2.ratio>=CFG.m2SulfurSiliconRange[0]&&m2.ratio<CFG.m2SulfurSiliconRange[1]){
   ev('S',`M+2/M=${m2.ratio.toFixed(1)}%（${ion.id}）與 S 相容`,[ion.observationId,m2.observationId!],'MS_ISOTOPE');
   ev('Si',`M+2/M=${m2.ratio.toFixed(1)}%（${ion.id}）也與 Si 相容`,[ion.observationId,m2.observationId!],'MS_ISOTOPE');
  }
 }
 if(!confirmed)out.limitations.push('MS 離子型式未經使用者確認；各型式均為假設並已降低信心。');
 return out;
}
