import type {ExperimentalSpectrumData} from '../../types/spectrum';
import type {ObservedEvidence} from '../reasoning/types';
import {COMPOSITION_CONFIG as CFG} from './compositionConfig';
import {extractMsEvidence} from './msComposition';
import type {CompositionReason} from './types';

/**
 * N-specific evidence (v1.1.6). N may enter element clues, formulas, fragments and candidates only when
 * mode is 'EVIDENCE'. 'EVEN_ION_ONLY' (MS present, even nominal neutral mass, no other N evidence) keeps N
 * possible but penalized, since N can only come in pairs there. 'NONE' removes N entirely; ambiguous
 * O/N signals then default to O and only carry a note.
 */
export interface NitrogenEvidence {
 mode:'EVIDENCE'|'EVEN_ION_ONLY'|'NONE';
 allowed:boolean;
 reasons:CompositionReason[];
 note:string;
}
export const NITROGEN_AMBIGUITY_NOTE='也可能是 N，但無 N 專屬證據';

const within=(v:number,[lo,hi]:readonly [number,number]|[number,number])=>v>=lo&&v<=hi;

export function assessNitrogenEvidence(args:{observations:ObservedEvidence[];spectra:Partial<Record<string,ExperimentalSpectrumData>>;userFormula:string|null}):NitrogenEvidence {
 const reasons:CompositionReason[]=[];
 const add=(text:string,ids:string[],source:CompositionReason['source'])=>reasons.push({text,observationIds:ids,source,strength:'HARD'});
 if(args.userFormula&&/N(?![a-z])/.test(args.userFormula))add(`使用者分子式 ${args.userFormula} 含 N`,[],'USER');
 const ir=args.observations.filter(o=>o.modality==='IR');
 const inRange=(r:readonly [number,number]|[number,number])=>ir.filter(o=>within(o.value,r));
 // Primary amine N–H doublet.
 const nh=inRange(CFG.irAmineDoubletRange).sort((a,b)=>a.value-b.value);
 for(let i=0;i<nh.length;i++)for(let j=i+1;j<nh.length;j++){
  const d=nh[j].value-nh[i].value;
  if(within(d,CFG.irAmineDoubletSeparation)){add(`IR ${nh[j].value}／${nh[i].value} cm⁻¹ 雙峰（相距 ${d.toFixed(0)}），與一級胺 N–H 伸縮相容`,[nh[j].id,nh[i].id],'IR');i=nh.length;break;}
 }
 const nitrile=inRange(CFG.irNitrileRange);
 if(nitrile.length){
  const c13=args.observations.filter(o=>o.modality==='13C_NMR'&&!o.optional&&within(o.value,CFG.c13NitrileEvidenceRange));
  add(`IR ${nitrile.map(o=>o.value).join('、')} cm⁻¹ 落在 C≡N 區（${CFG.irNitrileRange.join('–')}）${c13.length?`，¹³C ${c13.map(o=>o.value).join('、')} ppm 與腈碳相容`:''}`,[...nitrile,...c13].map(o=>o.id),'IR');
 }
 const nitroA=inRange(CFG.irNitroAsymRange),nitroS=inRange(CFG.irNitroSymRange);
 if(nitroA.length&&nitroS.length)add(`IR ${nitroA[0].value}／${nitroS[0].value} cm⁻¹ 與硝基不對稱／對稱伸縮相容`,[nitroA[0].id,nitroS[0].id],'IR');
 const amideI=inRange(CFG.irAmideIRange),amideII=inRange(CFG.irAmideIIRange);
 if(amideI.length&&amideII.length)add(`IR ${amideI[0].value}／${amideII[0].value} cm⁻¹ 與醯胺 I／II 帶相容`,[amideI[0].id,amideII[0].id],'IR');
 // MS: the user-confirmed molecular ion, otherwise the best-ranked unrejected molecular-ion hypothesis.
 let evenIon=false;
 const ms=extractMsEvidence(args.observations,args.spectra.MS);
 const ions=(ms?.ions??[]).filter(i=>!i.rejected);
 const ion=ions.find(i=>i.confirmedByUser)??[...ions].sort((a,b)=>b.prior-a.prior)[0];
 if(ion){
  const nominal=Math.round(ion.neutralMass);
  if(nominal%2===1)add(`MS ${ion.confirmedByUser?'使用者確認的':'排名第一的'}分子離子假設 ${ion.adduct} m/z ${ion.observedMz} → 中性名義質量 ${nominal} 為奇數（氮規則：N 為奇數）`,[ion.observationId],'MS');
  else evenIon=true;
 }
 if(reasons.length)return {mode:'EVIDENCE',allowed:true,reasons,note:'有 N 專屬證據'};
 if(evenIon)return {mode:'EVEN_ION_ONLY',allowed:true,reasons:[],note:'MS 分子離子為偶數名義質量且無其他 N 證據：N 只能成對出現，含 N 假設降低信心'};
 return {mode:'NONE',allowed:false,reasons:[],note:`無 N 專屬證據：模糊的 O／N 訊號預設歸 O（${NITROGEN_AMBIGUITY_NOTE}），不產生 N 片段、不加入 N 元素`};
}
