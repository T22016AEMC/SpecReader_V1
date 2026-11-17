import type {ExperimentalSpectrumData,SpectralPeak} from '../../types/spectrum';
import type {ScoreLedgerEntry} from './evidenceLedger';
import {matchesSMARTS,matchingSMARTS} from './rdkitAdapter';
import {V12_CONFIG} from '../constraints/v12Config';
import {v142NegRuleActive} from '../composition/planningGate';
import {carbonylMissingStatus} from './carbonylClasses';

/**
 * v1.4.2 (IR round 2, ir2.negativeEvidence, DEFAULT OFF): the second kind of "missing band" deduction after the carbonyl one (v1.3.0). A candidate that HAS a nitrile, a C-nitro group or a terminal alkyne C-H but whose peak table has no band
 * in the textbook window of that group is deducted a share of its other IR weight (the same way as the missing-carbonyl item): scored down, never rejected, no change to any "Strong" reading.
 *
 * Tiers (planner decision 2): A = nitrile C≡N 2200–2270 (share 0.15) and the C-nitro ASYMMETRIC band 1500–1570 (share 0.15; the symmetric band 1300–1380 is not looked at: a CH3 bend ~1375 would fake it); B = terminal alkyne C≡C–H 3260–3340
 * (share 0.075, stricter: ANY mark in 3200–3400 counts as present, an O–H / N–H may cover it; since stop 29 a candidate with an O–H or N–H group is never deducted for the alkyne rule, the blocking window is NOT widened). O–H, N–H, S–H, vinyl, C=C and sulfone absence are NOT deducted (planner decision 4: hydrogen bonding, symmetric / weak bands, no data).
 * Excluded groups: nitriles with a hetero atom on the alpha carbon (cyanohydrin, alpha-amino and alpha-halo nitriles: the band can be weak [textbook, general statement]), isonitriles, cyanamides, thiocyanates; nitrate esters, N-nitro, nitroso.
 *
 * DATA GATE (planner decision 3, ALL must hold, otherwise no item): G1 the v1.3.0 missing-carbonyl status (peak table: bands on BOTH sides of the carbonyl region and known intensities; image: trusted calibration and a trace over the window),
 * G2 the user confirmed the table complete (observationCoverage CONFIRMED_COMPLETE: "not marked" is not "absent" otherwise), G3 no unconfirmed automatic peak among the analysis peaks (the same definition as the diagnostic summary's
 * "自動偵測未確認": not manualPeak / manualEdited / detectionSource MANUAL and no userOverride), G4 at least minMarkedPeaks (6) marked peaks (a table of two false peaks says nothing about a missing band). "Present" is lenient: a mark inside the window
 * widened by edgeToleranceCm1 (10) on both sides with at least presentPct % of the strongest band (nitrile 3 since stop 29 [was 10], nitro 30, alkyne: any mark in the blocking window); a mark with unknown intensity counts as present.
 * The summed share of the new items of one candidate is capped (negCap 0.20, sequential in the order nitrile, nitro, alkyne). Share and cap are in the units of the missing-carbonyl item (a share of the sum of the candidate's other IR weights).
 *
 * Stop 30: each rule can be switched on alone (v142IR.negNitrile / negNitro / negAlkyne, default false); negativeEvidence still means all three. With one rule on, the candidates of the other two groups are scored exactly as with all off.
 *
 * THE WINDOWS ARE TEXTBOOK-STYLE RANGES (NOT CALIBRATED, 未經校準, page numbers not checked); the shares, the cap, the thresholds, the edge and the 6-peak minimum are ENGINEERING JUDGEMENT (工程判斷，未查證). No nitrile / nitro / alkyne
 * real spectrum was used and the corpus has no target with these groups, so the false-deduction rate of this rule is UNMEASURED (the 0 / 0 of the design report is not evidence of safety): that is why the sub-flag defaults to off.
 */
type Range=[number,number];
export interface NegativeEvidenceRule {id:'nitrile'|'nitro'|'alkyneCH';tier:'A'|'B';label:string;display:string;smarts:string;windowCm1:Range;blockWindowCm1?:Range;anyMarkIfAromatic?:boolean;/** stop 29: a candidate that matches this SMARTS is never deducted for this rule (an O–H / N–H band can cover the band) */exemptSmarts?:string;source:string}
const TEXTBOOK='教科書常見範圍（未經校準，未核對頁碼）：';
export const NEGATIVE_EVIDENCE_RULES:NegativeEvidenceRule[]=[
 {id:'nitrile',tier:'A',label:'腈 C≡N',display:'腈基',smarts:'[NX1]#[CX2][#6;!$([CX4][OX2,NX3,F,Cl,Br,I])]',windowCm1:[2200,2270],source:`${TEXTBOOK}飽和腈約 2260–2240、共軛腈約 2240–2220`},
 {id:'nitro',tier:'A',label:'硝基 NO₂ 不對稱伸縮',display:'C-硝基',smarts:'[#6][$([N+](=[OX1])[O-]),$([NX3](=[OX1])=[OX1])]',windowCm1:[1500,1570],anyMarkIfAromatic:true,source:`${TEXTBOOK}不對稱帶約 1570–1500（對稱帶 1380–1300 不看）`},
 {id:'alkyneCH',tier:'B',label:'末端炔 ≡C–H',display:'末端炔 ≡C–H',smarts:'[CX2;H1]#[CX2]',windowCm1:[3260,3340],blockWindowCm1:[3200,3400],exemptSmarts:'[#7,#8;!H0]',source:`${TEXTBOOK}約 3340–3260（3200–3400 內任何標記都視為可能蓋住；候選含 O–H／N–H 時整條不扣）`},
];
const AUTO_ROLES=['NOISE','SOLVENT','IMPURITY','REFERENCE_TMS','WATER'];
/** An analysis peak the user did not confirm: automatic detection, not marked / edited by the user (the definition of the diagnostic summary's "自動偵測未確認": origin EXTRACTED and no userOverride). */
export const isUnconfirmedAutoPeak=(p:SpectralPeak):boolean=>!(p.manualPeak||p.manualEdited||p.detectionSource==='MANUAL')&&!p.userOverride;
/** The data gate G1–G4 (the part that does not depend on the rule): returns the reason it is closed, or null when open. */
export function negativeEvidenceGateClosedReason(ir:ExperimentalSpectrumData,processed:ExperimentalSpectrumData,windows:Range[]):string|null{
 if(ir.observationCoverage!=='CONFIRMED_COMPLETE')return 'NOT_CONFIRMED_COMPLETE';
 if(carbonylMissingStatus(ir,processed,windows).state!=='ENABLED')return 'MISSING_STATUS';
 if(processed.peaks.some(isUnconfirmedAutoPeak))return 'UNCONFIRMED_AUTO_PEAK';
 const marked=processed.peaks.filter(p=>![p.userClassification,p.role,p.signalRole].some(role=>role&&AUTO_ROLES.includes(role)));
 if(marked.length<V12_CONFIG.v142IR.neg.minMarkedPeaks)return 'TOO_FEW_PEAKS';
 return null;
}
/**
 * The negative-evidence items of one candidate (at most one per rule, compatibility 0). `irWeightSum` = the sum of the weights of the candidate's other IR items, taken before any deduction item is added (as for the missing-carbonyl item).
 * Returns [] when the candidate has none of the groups, the gate is closed, or every band is present.
 */
export function negativeEvidenceEntries(smiles:string,ir:ExperimentalSpectrumData,processed:ExperimentalSpectrumData,irWeightSum:number):ScoreLedgerEntry[]{
 if(!(irWeightSum>0))return [];
 const C=V12_CONFIG.v142IR.neg,rules=NEGATIVE_EVIDENCE_RULES;
 if(!rules.some(r=>v142NegRuleActive(r.id)))return [];
 const hit=new Set(matchingSMARTS(smiles,rules.map(r=>r.smarts))??[]);
 if(!hit.size)return [];
 // stop 30: only the rules that are on (negativeEvidence = all three, or a group's own sub-flag); with the total sub-flag this is every rule, as before
 const mine=rules.filter((r,i)=>hit.has(i)&&v142NegRuleActive(r.id));
 if(!mine.length)return [];
 if(negativeEvidenceGateClosedReason(ir,processed,mine.map(r=>r.windowCm1)))return [];
 const peaks=processed.peaks,known=peaks.filter(p=>p.intensityKnown!==false&&Number.isFinite(p.y)&&p.y>0);
 const strongest=Math.max(...known.map(p=>p.y));
 const aromatic=matchingSMARTS(smiles,['[a]'])?.length===1;
 const out:ScoreLedgerEntry[]=[];let used=0;
 for(const r of mine){
  if(r.exemptSmarts&&matchesSMARTS(smiles,r.exemptSmarts)===true)continue; // stop 29: O–H / N–H of the candidate can cover ≡C–H (propargyl alcohol: the O–H band is marked at 3183, outside the 3200–3400 blocking window)
  const [lo,hi]=r.windowCm1,pct=r.id==='nitrile'?C.presentNitrilePct:r.id==='nitro'?C.presentNitroPct:C.presentAlkynePct;
  const inWindow=(p:SpectralPeak)=>p.x>=lo-C.edgeToleranceCm1&&p.x<=hi+C.edgeToleranceCm1;
  const present=peaks.some(p=>inWindow(p)&&(p.intensityKnown===false||(Number.isFinite(p.y)&&p.y>=(pct/100)*strongest)||(r.anyMarkIfAromatic&&aromatic)))
   ||(r.blockWindowCm1!==undefined&&peaks.some(p=>p.x>=r.blockWindowCm1![0]&&p.x<=r.blockWindowCm1![1]));
  if(present)continue;
  const take=Math.min(r.tier==='A'?C.shareA:C.shareB,Math.max(0,C.cap-used));
  if(!(take>0))continue;
  used+=take;
  const id=`IR:neg:${r.id}`,display=`IR（峰表）：候選含${r.display}，但在 ${lo}–${hi} cm⁻¹（邊界各放寬 ${C.edgeToleranceCm1}）沒有至少 ${pct}% 最強帶的吸收帶；峰表已確認完整、無未確認自動峰、至少 ${C.minMarkedPeaks} 個標記峰；已扣分，未剔除（未經校準）`;
  out.push({evidenceId:id,observationIds:[id],sourceModality:'IR',compatibility:0,weight:take*irWeightSum,contribution:0,method:display,display,
   limitations:[`缺帶負向證據（v1.4.2，預設關閉）：${r.tier} 級，份額 ${take}（A ${C.shareA}／B ${C.shareB}，單一候選上限 ${C.cap}；工程判斷，未查證）× 其餘 IR 項權重總和 ${irWeightSum.toFixed(2)}；窗口 ${r.source}`,'誤殺率未量測（語料沒有含腈／硝基／炔的目標）；非硬限制；峰表漏標會被扣分，閘門只能降低機率']});
 }
 return out;
}
