import type {ExperimentalSpectrumData} from '../../types/spectrum';
import type {ObservedEvidence} from '../reasoning/types';
import {COMPOSITION_CONFIG as CFG} from './compositionConfig';
import {extractMsEvidence} from './msComposition';
import {v123NitrogenEvidenceActive,v132WindowsActive} from './planningGate';
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
 /** v1.2.3 (A5): N atoms the evidence supports (one per kind of evidence); present only while the v1.2.3 nitrogen rules are on, absent when a user formula opened N. */
 requiredN?:number;
}
export const NITROGEN_AMBIGUITY_NOTE='也可能是 N，但無 N 專屬證據';

const within=(v:number,[lo,hi]:readonly [number,number]|[number,number])=>v>=lo&&v<=hi;

export function assessNitrogenEvidence(args:{observations:ObservedEvidence[];spectra:Partial<Record<string,ExperimentalSpectrumData>>;userFormula:string|null}):NitrogenEvidence {
 const reasons:CompositionReason[]=[];
 const add=(text:string,ids:string[],source:CompositionReason['source'])=>reasons.push({text,observationIds:ids,source,strength:'HARD'});
 if(args.userFormula&&/N(?![a-z])/.test(args.userFormula))add(`使用者分子式 ${args.userFormula} 含 N`,[],'USER');
 const ir=args.observations.filter(o=>o.modality==='IR');
 const inRange=(r:readonly [number,number]|[number,number])=>ir.filter(o=>within(o.value,r));
 // Relative intensity against the strongest marked IR band; null when any needed intensity is unknown.
 const maxI=Math.max(0,...ir.map(o=>o.relativeIntensity??0));
 const rel=(o:ObservedEvidence)=>o.relativeIntensity===null||maxI<=0?null:o.relativeIntensity/maxI;
 const v123=v123NitrogenEvidenceActive(),LA=CFG.nitrogenLookAlike;
 // v1.2.3 (A2): a narrow N–H needs a band of its own: a band within sameBandCm1 of a broad X–H band is read as part of that O–H / N–H envelope (3338 broad + 3340 "sharp" is one band used twice).
 const broadXH=v123?ir.filter(o=>o.shape==='BROAD'&&within(o.value,CFG.irBroadXHRange)):[];
 const ownBand=(o:ObservedEvidence)=>!v123||!broadXH.some(b=>b.id!==o.id&&Math.abs(b.value-o.value)<=LA.sameBandCm1);
 const sharp=(o:ObservedEvidence)=>o.shape!=='BROAD'&&ownBand(o);
 // v1.2.3 (A3, A4): aromatic evidence from the NMR tables (a 1H aromatic pair, or four 13C aromatic signals).
 const aromatic=v123&&(args.observations.filter(o=>o.modality==='1H_NMR'&&!o.optional&&within(o.value,LA.aromaticH1Range)).length>=LA.aromaticH1MinSignals||args.observations.filter(o=>o.modality==='13C_NMR'&&!o.optional&&within(o.value,LA.aromaticC13Range)).length>=LA.aromaticC13MinSignals);
 // Primary amine N–H doublet: two sharp, not-negligible bands.
 const nh=inRange(CFG.irAmineDoubletRange).filter(o=>sharp(o)&&(rel(o)===null||rel(o)!>=CFG.irAmineMinRelativeIntensity)).sort((a,b)=>a.value-b.value);
 for(let i=0;i<nh.length;i++)for(let j=i+1;j<nh.length;j++){
  const d=nh[j].value-nh[i].value;
  if(within(d,CFG.irAmineDoubletSeparation)){add(`IR ${nh[j].value}／${nh[i].value} cm⁻¹ 兩條窄峰（相距 ${d.toFixed(0)}），與一級胺 N–H 伸縮雙峰相容`,[nh[j].id,nh[i].id],'IR');i=nh.length;break;}
 }
 const nitrile=inRange(CFG.irNitrileRange);
 if(nitrile.length){
  const c13=args.observations.filter(o=>o.modality==='13C_NMR'&&!o.optional&&within(o.value,CFG.c13NitrileEvidenceRange));
  add(`IR ${nitrile.map(o=>o.value).join('、')} cm⁻¹ 落在 C≡N 區（${CFG.irNitrileRange.join('–')}）${c13.length?`，¹³C ${c13.map(o=>o.value).join('、')} ppm 與腈碳相容`:''}`,[...nitrile,...c13].map(o=>o.id),'IR');
 }
 // Nitro: both bands strong and of similar intensity; the alkyl-aromatic look-alike (ring ~1510 + CH3 bend 1360–1385)
 // and missing intensities resolve to "insufficient".
 const alkylAromatic=inRange(CFG.irAlkylAromaticRingRange).length>0&&inRange(CFG.irAlkylBendRange).length>0;
 const strong=(o:ObservedEvidence)=>rel(o)!==null&&rel(o)!>=CFG.irStrongRelativeIntensity;
 if(!alkylAromatic){
  pairs:for(const a of inRange(v132WindowsActive()?CFG.windowsV132.nitroAsymRange:CFG.irNitroAsymRange).filter(strong))for(const s of inRange(v132WindowsActive()?CFG.windowsV132.nitroSymRange:CFG.irNitroSymRange).filter(strong)){
   // v1.3.2 (stop 6): a symmetric band above 1360 is the ALIPHATIC regime (Coates: 1380–1350) and pairs only with an asymmetric band >= 1535; a ring band (~1516) with a methyl bend (~1375) is not a nitro pair
   if(v132WindowsActive()&&s.value>CFG.windowsV132.nitroAromaticSymMaxCm1&&a.value<CFG.windowsV132.nitroAliphaticAsymMinCm1)continue;
   const ratio=a.relativeIntensity!/s.relativeIntensity!;
   // v1.2.3 (A4): an asymmetric candidate near 1510 that a ring band explains (another band at 1575–1625, or aromatic evidence) is nitro only with 1H support (an aromatic H at or above 7.9 ppm).
   if(v123&&within(a.value,LA.nitroRingAsymRange)&&(aromatic||ir.some(q=>q.id!==a.id&&within(q.value,LA.ringPartnerRange)))&&!args.observations.some(o=>o.modality==='1H_NMR'&&!o.optional&&o.value>=LA.nitroAromaticH1MinPpm))continue;
   if(within(ratio,CFG.irNitroIntensityRatioRange)){add(`IR ${a.value}／${s.value} cm⁻¹ 兩條強帶（強度比 ${ratio.toFixed(2)}），與硝基不對稱／對稱伸縮相容`,[a.id,s.id],'IR');break pairs;}
  }
 }
 // Amide: amide I, amide II and a sharp N–H stretch together.
 // v1.2.3 (A3): amide I must be a strong band (like the nitro pair) and, with aromatic evidence, lie above amideIRingMaxCm1 (a 1600–1640 band next to 1500–1570 is the ring pair).
 const amideI=inRange(CFG.irAmideIRange).filter(o=>!v123||(strong(o)&&!(aromatic&&o.value<=LA.amideIRingMaxCm1))),amideII=inRange(CFG.irAmideIIRange),amideNH=inRange(CFG.irAmideNHRange).filter(sharp);
 if(amideI.length&&amideII.length&&amideNH.length)add(`IR ${amideI[0].value}／${amideII[0].value} cm⁻¹（醯胺 I／II）與 ${amideNH[0].value} cm⁻¹ 窄 N–H 伸縮同時存在，與醯胺相容`,[amideI[0].id,amideII[0].id,amideNH[0].id],'IR');
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
 if(reasons.length)return {mode:'EVIDENCE',allowed:true,reasons,note:'有 N 專屬證據',...(v123&&!reasons.some(r=>r.source==='USER')?{requiredN:reasons.length}:{})};
 if(evenIon)return {mode:'EVEN_ION_ONLY',allowed:true,reasons:[],note:'MS 分子離子為偶數名義質量且無其他 N 證據：N 只能成對出現，含 N 假設降低信心'};
 return {mode:'NONE',allowed:false,reasons:[],note:`無 N 專屬證據：模糊的 O／N 訊號預設歸 O（${NITROGEN_AMBIGUITY_NOTE}），不產生 N 片段、不加入 N 元素`};
}
