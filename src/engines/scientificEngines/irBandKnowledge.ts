import type {ExperimentalSpectrumData,IRFunctionalGroupFinding,SpectralPeak} from '../../types/spectrum';
import {graphChemicalFeatures} from './graphChemicalFeatures';
import {matchesSMARTS,matchingSMARTS} from './rdkitAdapter';
import {V12_CONFIG} from '../constraints/v12Config';
import {irRangeCovered} from './irSignalProcessing';
import {COMPOSITION_CONFIG} from '../composition/compositionConfig';
import {v123AmideRingReadingActive,v130OvertoneActive,v132MultiBandActive,v132WindowsActive,v141IRActive,v141RingCarbonylActive,v141Sp2CHActive,v141AlkylBendActive,v141EsterCOActive,v142IRActive,v142AlkeneOOPActive} from '../composition/planningGate';
import {hasAnhydridePair,isIrOvertone} from './irOvertone';
const SOURCE='https://www2.chemistry.msu.edu/faculty/reusch/VirtTxtJml/Spectrpy/InfraRed/infrared.htm';
type Range=[number,number];
export interface IRBandKnowledge {
 id:string;family:string;label:string;environment:string;range:Range;uncertainty:number;
 specificity:'LOW'|'MEDIUM';
 intensity:'weak'|'variable'|'medium'|'strong';shape:'broad'|'sharp'|'variable';widthRange:Range;
 shoulderPossible:boolean;companions:Range[];fingerprint:Range[];confusable:string[];
 missingBandCondition:string;measurementLimits:string;source:string;
 feature?:string;smarts?:string;context?:'CONJUGATED'|'SATURATED';
 /** v1.4.1 (ir.sp2CH): optional one-sided uncertainty for a peak ABOVE range[1]. Absent = `uncertainty` on both sides (the v1.4.0 formula, bit for bit). Only the candidate-score copy of a band carries it. */
 uncertaintyAbove?:number;
 /** v1.4.2 stop 27 (0.2a): when true the band scores ONLY inside range (a peak outside gets 0, no Gaussian tail). Carried by the five v1.4.2 ir2.alkeneOOP bands (textbook ranges, not calibrated: a tail beyond the cited range is not evidence). Absent = the older formula, bit for bit. */
 strictRange?:boolean;
}
const band=(id:string,family:string,label:string,environment:string,range:Range,feature:string,options:Partial<IRBandKnowledge>={}):IRBandKnowledge=>({id,family,label,environment,range,feature,specificity:range[1]<1500?'LOW':'MEDIUM',uncertainty:20,intensity:'variable',shape:'variable',widthRange:[5,90],shoulderPossible:true,companions:[],fingerprint:[],confusable:['其他相近振動／重疊／雜質'],missingBandCondition:'只在實際完整掃描、已知方向及足夠檢出能力下作弱反證；不是硬限制',measurementLimits:'凝聚相／溶液常用經驗區間；氣相、ATR、溶劑、氫鍵及耦合可改變位置／峰形，不能單峰確認',source:SOURCE,...options});
/** Local-environment ranges, not whole-molecule reference answers. Values are
 * broad teaching ranges, not calibrated likelihoods or individual peak truths. */
export const IR_BAND_KNOWLEDGE:IRBandKnowledge[]=[
 band('oh-free','Alcohol','游離 O–H','稀溶液／弱氫鍵',[3580,3650],'alcohol',{shape:'sharp',widthRange:[5,45],companions:[[970,1250]],confusable:['酚 OH','水氣']}),
 band('oh-hbond','Alcohol','氫鍵 O–H','脂肪醇／分子間氫鍵',[3200,3550],'alcohol',{shape:'broad',widthRange:[55,500],companions:[[970,1150]],fingerprint:[[970,1250]],confusable:['酚 OH','水','N–H']}),
 band('phenol-oh','Phenol','酚 O–H','芳香取代／氫鍵',[3200,3600],'phenol',{shape:'broad',widthRange:[45,450],companions:[[1180,1270],[1450,1620]],confusable:['醇 OH','水','胺 NH']}),
 band('acid-oh','Carboxylic acid','羧酸寬 O–H','締合二聚體／與 C–H 重疊',[2500,3300],'acid',{shape:'broad',widthRange:[250,1100],intensity:'strong',companions:[[1680,1735],[1210,1320]],confusable:['氫鍵 OH','重疊 C–H／水']}),
 band('primary-nh','Amine','一級胺 N–H','兩個伸縮模式，氫鍵可重疊',[3300,3500],'primaryAmine',{shape:'sharp',companions:[[3300,3500],[1550,1650]],fingerprint:[[1000,1250]],confusable:['OH','醯胺 NH']}),
 band('secondary-nh','Amine','二級胺 N–H','單一 NH 伸縮',[3300,3400],'secondaryAmine',{shape:'sharp',companions:[[1000,1250]],confusable:['OH','醯胺 NH']}),
 band('tertiary-cn','Amine','三級胺 C–N','無 N–H；低特異性指紋證據',[1000,1250],'tertiaryAmine',{intensity:'medium',confusable:['C–O','其他指紋振動']}),
 band('amide-nh','Amide','醯胺 N–H','一／二級醯胺，氫鍵可展寬',[3100,3500],'amideNH',{shape:'sharp',companions:[[1630,1695],[1500,1650]],confusable:['OH','胺 NH']}),
 band('amide-co','Amide','醯胺 I C=O','共振／氫鍵降低頻率',[1630,1695],'amide',{intensity:'strong',companions:[[1500,1650]],confusable:['共軛羰基','C=C／水彎曲']}),
 band('aldehyde-co','Aldehyde','醛 C=O','飽和醛',[1720,1740],'aldehyde',{intensity:'strong',companions:[[2690,2840]],context:'SATURATED',confusable:['酮','酯','酸']}),
 band('aldehyde-conj','Aldehyde','共軛醛 C=O','芳香／αβ 共軛',[1675,1720],'aldehyde',{intensity:'strong',companions:[[2690,2840],[1500,1630]],context:'CONJUGATED'}),
 band('ketone-sat','Ketone','酮 C=O','非共軛脂肪族',[1705,1730],'ketone',{intensity:'strong',context:'SATURATED',confusable:['醛','羧酸','酯']}),
 band('ketone-conj','Ketone','共軛酮 C=O','芳香／αβ 不飽和',[1660,1705],'ketone',{intensity:'strong',context:'CONJUGATED',companions:[[1500,1650]],confusable:['醯胺','共軛醛']}),
 band('ketone-strain','Ketone','小環張力酮 C=O','三至五員環提升鍵伸縮頻率',[1735,1810],'ketone',{intensity:'strong',smarts:'[C;r3,r4,r5](=O)',confusable:['酯','酸酐','醯鹵']}),
 band('ester-sat','Ester','酯 C=O','非共軛／電子效應',[1735,1760],'ester',{intensity:'strong',context:'SATURATED',companions:[[1000,1300]]}),
 band('ester-conj','Ester','共軛酯 C=O','芳香／不飽和取代',[1705,1740],'ester',{intensity:'strong',context:'CONJUGATED',companions:[[1000,1300],[1450,1620]]}),
 band('acid-co','Carboxylic acid','羧酸 C=O','氫鍵／共軛',[1680,1730],'acid',{intensity:'strong',companions:[[2500,3300],[1210,1320]]}),
 band('anhydride','Anhydride','酸酐羰基對','兩個耦合 C=O 模式',[1800,1850],'anhydride',{intensity:'strong',companions:[[1735,1790],[1000,1300]],confusable:['醯鹵','張力羰基']}),
 band('acyl-halide','Acyl halide','醯鹵 C=O','以常見醯氯為主；醯氟可超出區間',[1785,1815],'acylHalide',{intensity:'strong',confusable:['酸酐','小環酮']}),
 band('ether-co','Ether','醚 C–O–C','脂肪醚／芳醚與誘導效應',[1000,1270],'ether',{intensity:'strong',fingerprint:[[1000,1270]],confusable:['醇 C–O','C–N','S=O']}),
 band('alkene','Alkene','烯烴 C=C','共軛與對稱性改變強度',[1630,1680],'alkene',{companions:[[3020,3100],[880,995]],confusable:['醯胺','芳環','水']}),
 band('alkyne','Alkyne','炔 C≡C','內炔可因對稱性很弱',[2100,2250],'alkyne',{shape:'sharp',intensity:'variable',companions:[[3250,3350]],confusable:['腈','異氰酸酯等']}),
 band('aromatic','Aromatic','芳環骨架 C=C','取代形式／共軛峰群',[1450,1620],'aromatic',{intensity:'medium',companions:[[1450,1620],[3000,3100]],fingerprint:[[690,900]],confusable:['烯烴','NO₂','醯胺 II']}),
 band('nitrile','Nitrile','腈 C≡N','芳香／共軛可偏低',[2210,2265],'nitrile',{shape:'sharp',widthRange:[5,35],intensity:'medium',confusable:['炔','其他累積雙鍵／三鍵模式']}),
 band('nitro','Nitro','硝基 NO₂ 伸縮對','脂肪／芳香及共振',[1500,1570],'nitro',{intensity:'strong',companions:[[1300,1380]],confusable:['芳環','醯胺 II','SO₂']}),
 band('sulfone','Sulfonyl','碸 SO₂ 伸縮對','兩個強吸收帶',[1300,1350],'sulfonyl',{intensity:'strong',companions:[[1110,1170]],confusable:['硝基','C–O']}),
 band('sulfoxide','Sulfoxide','亞碸 S=O','取代基及氫鍵',[1010,1070],'sulfoxide',{intensity:'strong',confusable:['醇／醚 C–O']}),
 band('thiol','Thiol','硫醇 S–H','弱而尖；缺失不排除',[2550,2600],'thiol',{shape:'sharp',intensity:'weak',confusable:['酸 OH 尾端','微量雜訊']}),
 band('organic-cl','Organic halide','C–Cl 指紋','脂肪／芳香鹵代；低特異性',[600,800],'chloride',{intensity:'variable',confusable:['芳香面外彎曲','其他指紋帶']}),
 band('organic-br','Organic halide','C–Br 指紋','重原子低頻；掃描範圍可能不足',[500,650],'bromide',{confusable:['其他骨架振動']}),
 band('organic-f','Organic halide','C–F 指紋','取代效應及多氟峰群',[1000,1400],'fluoride',{intensity:'strong',confusable:['C–O','C–N','其他指紋帶']}),
 band('alcohol-co','Alcohol','醇 C–O','一／二／三級取代與誘導效應重疊',[970,1150],'alcohol',{intensity:'strong',companions:[[3200,3650]],confusable:['醚 C–O','C–N','S=O']}),
 band('phenol-co','Phenol','酚 C–O','芳香取代與共振',[1180,1270],'phenol',{intensity:'strong',companions:[[1450,1620],[3200,3650]]}),
 band('acid-co-bend','Carboxylic acid','羧酸 C–O','與羰基／寬 OH 協同',[1210,1320],'acid',{intensity:'medium',companions:[[1680,1730],[2500,3300]]}),
 band('amine-cn','Amine','胺 C–N','脂肪／芳香 C–N，低專一性',[1000,1250],'amine',{intensity:'medium',confusable:['C–O','其他指紋帶']}),
 band('nitro-symmetric','Nitro','NO₂ 對稱伸縮','與另一 NO₂ 模式構成峰對',[1300,1380],'nitro',{intensity:'strong',companions:[[1500,1570]]}),
 band('sulfone-symmetric','Sulfonyl','SO₂ 對稱伸縮','峰對支持，非單峰確認',[1110,1170],'sulfonyl',{intensity:'strong',companions:[[1300,1350]]}),
 band('anhydride-lower','Anhydride','酸酐低頻羰基','與高頻羰基耦合峰對',[1735,1790],'anhydride',{intensity:'strong',companions:[[1800,1850]]}),
 band('aromatic-oop','Aromatic','芳香 C–H 面外彎曲','取代形式／重疊指紋，不能唯一指定位置',[690,900],'aromatic',{intensity:'medium',companions:[[1450,1620]],confusable:['C–Cl','烯基彎曲']}),
 band('aliphatic-ch','C-H','脂肪族 C–H','sp³ CH／CH₂／CH₃ 伸縮峰群',[2850,3000],'aliphaticCH',{intensity:'strong',companions:[[1350,1470]],confusable:['羧酸 OH 重疊']}),
 band('aldehyde-fermi','Aldehyde','醛 C–H Fermi 峰對','弱峰／伴隨羰基，不是單峰確證',[2690,2840],'aldehyde',{intensity:'medium',companions:[[1675,1740]]}),
 band('terminal-alkyne-ch','Alkyne','末端炔 sp C–H','尖峰；與寬 OH 區分',[3250,3350],'terminalAlkyne',{shape:'sharp',widthRange:[5,40],companions:[[2100,2250]],confusable:['游離 OH','NH']}),
 band('siloxane','Siloxane','矽氧烷 Si–O–Si','峰群／聚合物環境與基質效應',[1000,1130],'siloxane',{intensity:'strong',companions:[[780,850],[1240,1280]],source:'Socrates, Infrared and Raman Characteristic Group Frequencies, 3rd ed.; V1 經驗知識來源，非實測校準'}),
 band('chelated-oh','Alcohol','可能分子內氫鍵 OH','鄰近羰基的 OH；需構象／濃度資訊確認',[2500,3350],'chelatableOH',{shape:'broad',widthRange:[70,800],companions:[[1610,1735]],confusable:['羧酸 OH','分子間氫鍵／水']}),
];
/**
 * v1.3.2 (stop 4) multi-band readings. ALL WINDOWS AND WEIGHTS ARE ENGINEERING JUDGEMENT (工程判斷，未查證) unless a source is named; a missing band LOWERS the weight through the existing companion mechanism
 * (score × (0.65 + 0.35 × share of companion windows that hold a band)), it never excludes.
 *  - Aldehyde: the C–H Fermi doublet is ~2720 and ~2820 (textbook; Coates). Both windows are companions of the aldehyde C=O and each Fermi band has the other as its companion, so the OCH3 C–H at ~2830
 *    (inside the high window) is only half of a pair. A reading is "Strong" only when ALL its companions are present (PAIR_BANDS).
 *  - Terminal vinyl CH2=CH–R: the out-of-plane pair ~990 and ~910 (textbook). Two new bands, each the other's companion. They apply only to a candidate that HAS CH2=CH–C(sp3/aryl/vinyl) (irCandidateBands),
 *    so a symmetric or internal alkene (trans 965, cis ~720, cyclohexene, 1,1-disubstituted 890), a vinyl ether / enamine, an acrylate or vinyl ketone (no 910) is never asked for 910/990.
 *  - Nitro: the companion window stops at 1360 so the CH3 bend at ~1375–1380 is not the second nitro band (aromatic nitro sym 1355–1315 stays inside; an aliphatic nitro whose sym band sits at 1375 loses it: engineering trade-off).
 */
const V132_BAND_OVERRIDES:Record<string,Partial<IRBandKnowledge>>={
 'aldehyde-co':{companions:[[2695,2760],[2800,2860]]},
 'aldehyde-conj':{companions:[[2695,2760],[2800,2860],[1500,1630]]},
 'aldehyde-fermi':{range:[2695,2860]},
 'nitro':{companions:[[1300,1360]]},
 'nitro-symmetric':{range:[1300,1360]},
};
const V132_EXTRA_BANDS:IRBandKnowledge[]=[
 band('vinyl-oop-990','Alkene','末端乙烯基 =C–H 面外彎曲（990）','CH₂=CH–R 的 990／910 成對之一',[985,995],'terminalVinyl',{uncertainty:3,specificity:'MEDIUM',intensity:'strong',shape:'sharp',widthRange:[5,45],shoulderPossible:false,companions:[[905,915]],confusable:['反式烯 965','其他指紋帶']}),
 band('vinyl-oop-910','Alkene','末端乙烯基 =CH₂ 面外彎曲（910）','CH₂=CH–R 的 990／910 成對之一',[905,915],'terminalVinyl',{uncertainty:3,specificity:'MEDIUM',intensity:'strong',shape:'sharp',widthRange:[5,45],shoulderPossible:false,companions:[[985,995]],confusable:['芳香面外彎曲','其他指紋帶']}),
];
/**
 * v1.3.2 stop 6 (v132.windows), on top of the overrides above. Sources and numbers: compositionConfig.windowsV132 (Coates Table 11; 工程判斷 for 1535 / 1360).
 * The nitro asymmetric band's companion window is regime dependent (effectiveCompanions): an asymmetric peak at or above 1535 (aliphatic, Coates 1560–1540) takes 1300–1380, a lower one (aromatic 1555–1485, or a
 * ring band ~1516) takes 1300–1360, so a methyl bend ~1375 is a companion only of an aliphatic-range band. The symmetric band's own window goes up to 1380 but a peak above 1360 is a nitro symmetric band only when an
 * asymmetric peak at or above 1535 is present (irBandMatch); without one it is not a nitro reading at all.
 */
const V132_WINDOWS_OVERRIDES:Record<string,Partial<IRBandKnowledge>>={
 'nitro-symmetric':{range:[1300,1380]},
};
/** Bands whose "Strong" reading needs EVERY companion window to hold a band (a pair), not just one. */
const PAIR_BANDS=new Set(['aldehyde-co','aldehyde-conj','aldehyde-fermi','vinyl-oop-990','vinyl-oop-910','nitro','nitro-symmetric']);
/** The band table in force: the v1.3.1 table, or (switch on) with the multi-band windows and the two vinyl bands. */
export const activeIrBands=():IRBandKnowledge[]=>v132MultiBandActive()?[...IR_BAND_KNOWLEDGE.map(k=>{const o={...V132_BAND_OVERRIDES[k.id],...(v132WindowsActive()?V132_WINDOWS_OVERRIDES[k.id]:{})};return Object.keys(o).length?{...k,...o}:k;}),...V132_EXTRA_BANDS]:IR_BAND_KNOWLEDGE;
const inRange=(x:number,[a,b]:Range)=>x>=a&&x<=b;
/** Companion windows of band k for peak p. With the switch on, each aldehyde Fermi band also needs the OTHER Fermi window (2720 needs 2820 and the other way round). */
export function effectiveCompanions(k:IRBandKnowledge,p:SpectralPeak):Range[]{
 if(v132MultiBandActive()&&k.id==='aldehyde-fermi')return [...k.companions,p.x<2780?[2800,2860] as Range:[2695,2760] as Range];
 if(v132MultiBandActive()&&v132WindowsActive()&&k.id==='nitro')return [[1300,p.x>=COMPOSITION_CONFIG.windowsV132.nitroAliphaticAsymMinCm1?COMPOSITION_CONFIG.windowsV132.nitroSymRange[1]:COMPOSITION_CONFIG.windowsV132.nitroAromaticSymMaxCm1]];
 return k.companions;
}
/** "Strong" needs one companion band (v1.3.1), or with the switch on every companion window for the pair bands. */
export function companionsOk(k:IRBandKnowledge,p:SpectralPeak,peaks:SpectralPeak[]):boolean{
 const has=(range:Range)=>peaks.some(q=>q.id!==p.id&&inRange(q.x,range)),comps=effectiveCompanions(k,p);
 return v132MultiBandActive()&&PAIR_BANDS.has(k.id)?comps.every(has):comps.some(has);
}
export function irBandMatch(k:IRBandKnowledge,p:SpectralPeak,peaks:SpectralPeak[],coverage?:(a:number,b:number)=>boolean):number {
 const distance=Math.max(k.range[0]-p.x,0,p.x-k.range[1]);
 if(k.strictRange&&distance>0)return 0;
 const uncertainty=k.uncertaintyAbove!==undefined&&p.x>k.range[1]?k.uncertaintyAbove:k.uncertainty;
 let score=(k.specificity==='LOW'?.75:1)*Math.exp(-.5*(distance/uncertainty)**2);
 const width=p.observedRange?Math.abs(p.observedRange[1]-p.observedRange[0]):p.fwhm??p.width;
 const broad=p.shape==='broad'||p.shape==='BROAD'||(p.shape!=='sharp'&&p.shape!=='SHARP'&&(p.isBroad||(width??0)>55));
 const shapeKnown=width!==undefined||p.isBroad===true||['broad','sharp','BROAD','SHARP','shoulder','SHOULDER','OVERLAPPED'].includes(p.shape??'');
 if(shapeKnown&&k.shape==='broad'&&!broad)score*=.4;
 if(shapeKnown&&k.shape==='sharp'&&broad)score*=.45;
 if(width&&k.shape==='broad'&&width<k.widthRange[0])score*=.6;
 if(p.observedRange){const overlap=Math.max(0,Math.min(p.observedRange[1],k.range[1])-Math.max(p.observedRange[0],k.range[0]));if(!overlap&&distance>0)score*=.6;}
 if(p.intensityKnown!==false)score*=k.intensity==='weak'?.75+.25*(1-Math.min(1,p.y/100)):.7+.3*Math.min(1,Math.max(0,p.y)/100);
 const comps=effectiveCompanions(k,p);
 if(comps.length){
  // v1.3.2 (stop 6, v132.windows): the companion windows of the SCORE are trapezoids (full inside, linear to 0 over companionRampCm1 outside); the Strong reading (companionsOk) and every exclusion rule keep the hard windows.
  const ramp=v132WindowsActive()?COMPOSITION_CONFIG.windowsV132.companionRampCm1:0;
  const member=(x:number,[lo,hi]:Range)=>x>=lo&&x<=hi?1:ramp>0?Math.max(0,1-Math.max(lo-x,x-hi)/ramp):0;
  let matched=0,coveredMissing=0;for(const range of comps){const m=Math.max(0,...peaks.filter(q=>q.id!==p.id).map(q=>member(q.x,range)));if(m>0)matched+=m;else if(coverage?.(...range))coveredMissing++;}score*=.65+.35*matched/comps.length;score*=1-.1*coveredMissing/comps.length;}
 // v1.2.3 (A3, display layer): an "amide I" reading at or below 1640 cm-1 with another band in the ring windows (1575–1625 or 1490–1525) is an aromatic C=C pair, not amide I (1618 / 1601 of a p-cresol).
 // Only peaks near the window are touched (within 2 × uncertainty of its lower edge), so the compatibility of a far-away band does not change at all.
 if(k.id==='amide-co'&&p.x<=COMPOSITION_CONFIG.nitrogenLookAlike.amideIRingMaxCm1&&p.x>=k.range[0]-2*k.uncertainty&&v123AmideRingReadingActive()){
  const LA=COMPOSITION_CONFIG.nitrogenLookAlike;
  if(peaks.some(q=>q.id!==p.id&&(inRange(q.x,LA.ringPartnerRange)||inRange(q.x,LA.ringSecondaryRange))))score*=.3;
 }
 // v1.3.2 (stop 6): a symmetric nitro band above 1360 (aliphatic regime) is not a nitro reading without an asymmetric band at or above 1535 (a lone methyl bend ~1375 is nothing).
 if(k.id==='nitro-symmetric'&&v132MultiBandActive()&&v132WindowsActive()&&p.x>COMPOSITION_CONFIG.windowsV132.nitroAromaticSymMaxCm1&&!peaks.some(q=>q.id!==p.id&&inRange(q.x,[COMPOSITION_CONFIG.windowsV132.nitroAliphaticAsymMinCm1,1570])))score=0;
 // v1.3.0 (E): an anhydride reading needs the coupled pair of strong C=O bands (about 1820 and 1750); a single band does not give it full credit.
 if((k.id==='anhydride'||k.id==='anhydride-lower')&&v130OvertoneActive()&&!hasAnhydridePair(peaks))score*=.3;
 return Math.max(0,Math.min(1,score));
}
/**
 * v1.4.1 (IR round 1): bands for the CANDIDATE SCORE only. They are not in the IR reading list (inferIRBands), not in Mode B and not in the composition inference (the reading list feeds the element / DBE bounds
 * through the family name). Each band has a SMARTS gate (a candidate gets the band only when it has the group), is an "explaining" band (more ways to explain an observed peak, no new deduction), and has the
 * uncertainty V12_CONFIG.v141IR.bandUncertaintyCm1 (+-10, ENGINEERING JUDGEMENT, 工程判斷，未查證) in place of the +-20 of the 44 older bands.
 * ALL RANGES ARE TEXTBOOK-STYLE RANGES, NOT CALIBRATED (未經校準, page numbers not checked); none was derived from a fixture peak list.
 */
export const V141_RING_BANDS:IRBandKnowledge[]=[
 // ir.ringCarbonyl: ring strain raises C=O (textbook: gamma-lactone ~1795-1760, beta-lactone ~1840, beta-lactam ~1780-1730, five-membered cyclic carbonate ~1850-1790). Bands of the cyclic anhydrides are NOT matched (succinic anhydride keeps its own bands).
 band('lactone-r5','Ester','五員環內酯 C=O（γ-內酯）','環張力使 C=O 上移（未經校準）',[1760,1800],'',{intensity:'strong',companions:[[1000,1300]],smarts:'[CX3;r5;$(C(=[OX1])([#6])[OX2;r5]);!$(C(=[OX1])[OX2][CX3]=[OX1])]'}),
 band('lactone-r4','Ester','四員環內酯 C=O（β-內酯）','環張力使 C=O 上移（未經校準）',[1810,1850],'',{intensity:'strong',companions:[[1000,1300]],smarts:'[CX3;r4;$(C(=[OX1])([#6])[OX2;r4])]'}),
 band('lactam-r4','Amide','β-內醯胺 C=O','環張力使 C=O 上移（未經校準）',[1730,1790],'',{intensity:'strong',companions:[[1500,1650]],smarts:'[CX3;r4;$(C(=[OX1])([#6])[NX3;r4])]'}),
 band('carbonate-r5','Ester','五員環碳酸酯 C=O','環張力使 C=O 上移（未經校準）',[1775,1850],'',{intensity:'strong',companions:[[1000,1300]],smarts:'[CX3;r5;$(C(=[OX1])([OX2;r5])[OX2])]'}),
];
export const V141_SP2_BANDS:IRBandKnowledge[]=[
 // ir.sp2CH: sp2 C-H stretches lie above 3000, sp3 below (textbook: aromatic C-H ~3100-3000, alkene =C-H ~3095-3010, epoxide / cyclopropane C-H ~3100-3000). Stop 19: the gate also takes the C-H of a carbon with two or more Cl / Br and at least one H (CHCl3, CH2Cl2, CHBr3, CH2Br2, CH3-CHCl2; textbook ~3050-3000), by SMARTS only; CCl4 (no H), a single halogen, F and I are not in it.
 band('sp2-ch','C-H','sp² C–H 伸縮（芳香／烯／環氧／環丙烷）','3000 以上的 C–H；3000 以下是 sp³（未經校準）',[3005,3100],'',{intensity:'medium',smarts:'[$([cH]),$([CX3;H1,H2]=[CX3]),$([CX4;r3;!H0]),$([CX4;!H0;$(C([Cl,Br])[Cl,Br])])]'}),
];
export const V141_ALKYL_BANDS:IRBandKnowledge[]=[
 // ir.alkylBend: textbook: CH2 scissoring 1485-1445, CH3 asymmetric bend 1470-1430, CH3 symmetric ("umbrella") bend 1395-1365 (acetyl CH3 ~1360). A fingerprint band (range[1]<1500): specificity LOW (x 0.75) as ether-co and alcohol-co.
 // The 1375 band is only for a CH3 on a CARBON: O-CH3 and N-CH3 have none. NO isopropyl / gem-dimethyl / tBu splitting (postponed, planner decision 4).
 band('alkyl-bend-asym','C-H','CH₂ 剪式／CH₃ 不對稱彎曲','sp³ CH₂、CH₃ 的 C–H 彎曲（未經校準）',[1430,1485],'',{intensity:'medium',smarts:'[CX4;H2,H3]'}),
 band('ch3-bend-sym','C-H','CH₃ 對稱彎曲（傘式）','接在碳上的 CH₃（未經校準）',[1355,1395],'',{intensity:'medium',smarts:'[CH3;$([CH3][#6])]'}),
];
const ESTER_GATE='[CX3;H1,$([CX3][#6])](=[OX1])[OX2][#6;!$([#6]=[OX1])]';
export const V141_ESTER_BANDS:IRBandKnowledge[]=[
 // ir.esterCO: an ester has two or more strong C-O bands, C(=O)-O asymmetric ~1310-1150 (acetates ~1240, benzoates ~1275, formates ~1180) and O-C-C ~1150-1000 (textbook). The v1.4.0 ether band (1000-1270, strong) is for an O between
 // two non-carbonyl carbons, so the ester's own C-O had no band. These two give the ester the same coverage as the ether has; the ether band is NOT narrowed here (next round). Companion: the C=O band (no C=O peak: x 0.65, never excluded).
 // Gate: acyclic esters, formates and lactones; NOT carbonates, carbamates, acids, anhydrides (planner decision 3: no carbonate / carbamate C-O band this round).
 band('ester-co-hi','Ester','酯 C(=O)–O 不對稱伸縮','乙酸酯約 1240、苯甲酸酯約 1275、甲酸酯約 1180（未經校準）',[1150,1310],'',{intensity:'strong',companions:[[1700,1810]],smarts:ESTER_GATE}),
 band('ester-co-lo','Ester','酯 O–C–C 伸縮','約 1050–1040（未經校準）',[1000,1150],'',{intensity:'strong',companions:[[1700,1810]],smarts:ESTER_GATE}),
];
const V141_GROUPS:{active:()=>boolean;bands:IRBandKnowledge[]}[]=[
 {active:v141RingCarbonylActive,bands:V141_RING_BANDS},
 {active:v141Sp2CHActive,bands:V141_SP2_BANDS},
 {active:v141AlkylBendActive,bands:V141_ALKYL_BANDS},
 {active:v141EsterCOActive,bands:V141_ESTER_BANDS},
];
/** The v1.4.1 bands a candidate gets (empty when useV141IR or the group is off, or RDKit is not available). */
export function v141CandidateBands(smiles:string):IRBandKnowledge[]{
 if(!v141IRActive())return [];
 const bands=V141_GROUPS.filter(g=>g.active()).flatMap(g=>g.bands);
 if(!bands.length)return [];
 const hits=matchingSMARTS(smiles,bands.map(b=>b.smarts!))??[];
 return hits.map(i=>({...bands[i],uncertainty:V12_CONFIG.v141IR.bandUncertaintyCm1}));
}
/**
 * v1.4.2 (IR round 2, ir2.alkeneOOP): bands for the CANDIDATE SCORE only, same rules as the v1.4.1 bands above (SMARTS gate, "explaining" bands, +-10 = V12_CONFIG.v142IR.bandUncertaintyCm1, ENGINEERING JUDGEMENT, 工程判斷，未查證).
 * ALL RANGES ARE TEXTBOOK-STYLE, NOT CALIBRATED (未經校準, page numbers not checked); none was derived from a fixture peak list. They are fingerprint bands (range[1] < 1500): specificity LOW (x 0.75), no companions.
 * The substituent of the C=C is ALK = an sp3 carbon, an aromatic carbon or another C=C carbon: NEVER a hetero atom or a carbonyl (vinyl ether, enamine, acrylate, crotonate, vinyl ketone, vinyl halide shift the OOP bands by conjugation /
 * electronegativity, so they get no band). A terminal vinyl R-CH=CH2 keeps its v1.3.2 990 / 910 pair and gets nothing here.
 * Stereo is not specified in the engine's candidate SMILES, so an acyclic 1,2-disubstituted alkene gets BOTH the trans and the cis band (either explains a peak); a ring alkene gets the cis band only.
 * The cis band (665-730, "weak and variable") overlaps the (CH2)n rocking band (720-725): the two are ONE sub-flag (the OOP bands alone make the 1-octene sample ALK0 worse: design report section 4).
 */
const ALK='[CX4,c,$([CX3]=[CX3])]';
export const V142_OOP_BANDS:IRBandKnowledge[]=[
 // vinylidene R2C=CH2 ~895-885 (strong)
 band('vinylidene-oop','Alkene','亞乙烯基 =CH₂ 面外彎曲','R₂C=CH₂ 約 895–885（未經校準）',[885,895],'',{intensity:'strong',strictRange:true,smarts:`[CH2]=[CX3;H0](${ALK})${ALK}`}),
 // trans R-CH=CH-R ~980-960 (strong); acyclic only
 band('alkene-trans-oop','Alkene','反式 1,2-二取代烯 =C–H 面外彎曲','R–CH=CH–R 約 980–960，非環（未經校準）',[960,980],'',{intensity:'strong',strictRange:true,smarts:`${ALK}[CH;!R]=[CH;!R]${ALK}`}),
 // cis R-CH=CH-R ~730-665 (variable, weak and not fixed); also the ring alkenes
 band('alkene-cis-oop','Alkene','順式 1,2-二取代烯 =C–H 面外彎曲','R–CH=CH–R 約 730–665，弱且不定；環內烯（未經校準）',[665,730],'',{intensity:'variable',strictRange:true,smarts:`${ALK}[CH]=[CH]${ALK}`}),
 // trisubstituted R2C=CH-R ~840-790 (medium)
 band('alkene-tri-oop','Alkene','三取代烯 =C–H 面外彎曲','R₂C=CH–R 約 840–790（未經校準）',[790,840],'',{intensity:'medium',strictRange:true,smarts:`[CX3;H1](${ALK})=[CX3;H0](${ALK})${ALK}`}),
 // (CH2)n rocking, n >= 4, ~725-720 (variable); n = 3 (~729-726) is not given; acyclic only
 band('ch2-rock-720','C-H','(CH₂)ₙ 搖擺（n≥4）','非環連續 4 個以上 CH₂，約 725–720（未經校準）',[720,725],'',{intensity:'variable',strictRange:true,smarts:'[CH2;!R][CH2;!R][CH2;!R][CH2;!R]'}),
];
/** The v1.4.2 bands a candidate gets (empty when useV142IR or ir2.alkeneOOP is off, or RDKit is not available). */
export function v142CandidateBands(smiles:string):IRBandKnowledge[]{
 if(!v142AlkeneOOPActive())return [];
 const hits=matchingSMARTS(smiles,V142_OOP_BANDS.map(b=>b.smarts!))??[];
 return hits.map(i=>({...V142_OOP_BANDS[i],uncertainty:V12_CONFIG.v142IR.bandUncertaintyCm1}));
}
/** scoring=true (the candidate ledger): the multi-band table (v1.3.2) plus the v1.4.1 bands plus (useV142IR) the v1.4.2 bands. Mode B's predicted spectrum keeps the v1.3.1 bands. */
export function irCandidateBands(smiles:string,scoring=false):IRBandKnowledge[]{
 const f=graphChemicalFeatures(smiles),atoms=f.graph?.atoms??[];
 const extras:Record<string,boolean>={aliphaticCH:atoms.some(a=>a.element==='C'&&!a.isAromatic&&a.totalHydrogens>0&&a.neighbors.every(n=>n.order===1)),terminalAlkyne:atoms.some(a=>a.element==='C'&&a.totalHydrogens>0&&a.neighbors.some(n=>n.order===3&&atoms[n.toAtom].element==='C')),siloxane:matchesSMARTS(smiles,'[Si]O[Si]')===true,chelatableOH:(f.alcohol||f.phenol)&&f.carbonylCount>0,tertiaryAmine:f.amine&&!f.primaryAmine&&!f.secondaryAmine,amideNH:f.amide&&!f.tertiaryAmide,anhydride:matchesSMARTS(smiles,'[CX3](=O)O[CX3](=O)')===true,acylHalide:matchesSMARTS(smiles,'[CX3](=O)[F,Cl,Br,I]')===true,alkene:atoms.some(a=>a.element==='C'&&!a.isAromatic&&a.neighbors.some(n=>n.order===2&&atoms[n.toAtom].element==='C')),alkyne:atoms.some(a=>a.element==='C'&&a.neighbors.some(n=>n.order===3&&atoms[n.toAtom].element==='C')),sulfoxide:atoms.some(a=>a.element==='S'&&a.neighbors.filter(n=>atoms[n.toAtom].element==='O'&&n.order===2).length===1),thiol:atoms.some(a=>a.element==='S'&&a.totalHydrogens>0),chloride:atoms.some(a=>a.element==='Cl'),bromide:atoms.some(a=>a.element==='Br'),fluoride:atoms.some(a=>a.element==='F')};
 if(scoring&&v132MultiBandActive())extras.terminalVinyl=matchesSMARTS(smiles,'[CH2]=[CH1]-[CX4,c,$([CX3]=[CX3])]')===true;
 const base=(scoring?activeIrBands():IR_BAND_KNOWLEDGE).filter(k=>{
  const feature=k.feature??'';if(!(extras[feature]??(f as unknown as Record<string,unknown>)[feature]))return false;
  if(k.smarts&&matchesSMARTS(smiles,k.smarts)!==true)return false;
  if(k.context){
    const carbonyls=atoms.filter(a=>a.element==='C'&&a.neighbors.some(n=>n.order===2&&atoms[n.toAtom].element==='O'));
    const matching=carbonyls.filter(a=>k.family==='Ketone'?a.neighbors.filter(n=>atoms[n.toAtom].element==='C').length===2:k.family==='Aldehyde'?a.totalHydrogens>0:k.family==='Ester'?a.neighbors.some(n=>atoms[n.toAtom].element==='O'&&n.order===1&&atoms[n.toAtom].totalHydrogens===0):true);
    if(!matching.some(a=>{const conjugated=a.neighbors.some(n=>atoms[n.toAtom].element==='C'&&(atoms[n.toAtom].isAromatic||atoms[n.toAtom].neighbors.some(m=>m.toAtom!==a.index&&m.order===2)));return k.context==='CONJUGATED'?conjugated:!conjugated;}))return false;
  }
  return true;
 });
 const withV141=scoring&&v141IRActive()?v141CandidateList(smiles,base):base;
 return scoring&&v142IRActive()?[...withV141,...v142CandidateBands(smiles)]:withV141;
}
/** ir.sp2CH (stop 29, D): a CH3 / CH2 whose neighbour is a sulfur with an S=O (sulfone, sulfoxide, sulfonamide, sulfonate: the S side); and the upper edge of the aliphatic C-H band for such a candidate. TEXTBOOK-STYLE (about 3010-3030), NOT CALIBRATED. */
export const SULFONYL_CH_SMARTS='[CX4;H2,H3][#16;$([#16]=[OX1])]';
export const SULFONYL_CH_UPPER_CM1=3030;
/** The candidate-score band list of v1.4.1 (the v1.4.0 list `base` plus the four groups); only called with useV141IR on. */
function v141CandidateList(smiles:string,base:IRBandKnowledge[]):IRBandKnowledge[]{
 // ir.sp2CH: the upper edge of the aliphatic C-H band is narrowed (uncertainty above 3000: 20 -> 8) so that a 3030 peak is no longer taken by the tail of the sp3 band; the candidate-score copy only, the IR reading list keeps the band as it was.
 // Stop 29 (D, inside ir.sp2CH): a CH3 / CH2 on a sulfur that carries S=O (sulfone, sulfoxide, sulfonamide: the S side) has its C-H stretch ABOVE 3000 (textbook ~3010-3030), so for such a candidate the upper edge of the aliphatic C-H band is the textbook 3030, not 3000 (the narrowing above 3000 then starts at 3030).
 // Only the candidate-score copy of the band and only while sp2CH is on: with the flag off nothing here runs (bit for bit); candidates without such a group keep exactly the stop-18 band.
 const sulfonylCH=v141Sp2CHActive()&&matchesSMARTS(smiles,SULFONYL_CH_SMARTS)===true;
 const narrowed=v141Sp2CHActive()?base.map(k=>k.id==='aliphatic-ch'?{...k,uncertaintyAbove:V12_CONFIG.v141IR.aliphaticChUpperUncertaintyCm1,...(sulfonylCH?{range:[k.range[0],SULFONYL_CH_UPPER_CM1] as Range}:{})}:k):base;
 return [...narrowed,...v141CandidateBands(smiles)];
}
export function inferIRBands(s:ExperimentalSpectrumData):IRFunctionalGroupFinding[]{
 const peaks=s.peaks.filter(p=>![p.userClassification,p.role,p.signalRole].some(role=>role&&['NOISE','SOLVENT','IMPURITY','REFERENCE_TMS','WATER'].includes(role)));
 // v1.3.0 (E): overtone / combination bands (weak 1650–2000 cm-1 bands next to ring evidence) are not read as functional groups; anhydride readings need the strong pair. The peaks stay in the data.
 const v130=v130OvertoneActive(),overtone=new Set(v130?peaks.filter(p=>isIrOvertone(p,peaks)).map(p=>p.id):[]),pair=!v130||hasAnhydridePair(peaks);
 return peaks.filter(p=>!overtone.has(p.id)).flatMap(p=>activeIrBands().filter(k=>pair||(k.id!=='anhydride'&&k.id!=='anhydride-lower')).map(k=>({k,score:irBandMatch(k,p,peaks,(a,b)=>irRangeCovered(s,a,b))})).filter(v=>v.score>=.30).sort((a,b)=>b.score-a.score).slice(0,5).map(({k,score})=>({
   id:`ir-range-${k.id}-${p.id}`,functionalGroup:k.label,family:k.family,observedPeak:p.x,observedWidthAndShape:`${p.shape??'未確認'}；區間 ${p.observedRange?.join('–')??'未標記'}；寬度 ${p.fwhm??p.width??'未知'}`,expectedRange:`${k.range.join('–')} cm⁻¹ ±${k.uncertainty}；${k.environment}`,region:p.x>=1500?'官能基區':'指紋區',assignment:k.label,companionPeaksObserved:effectiveCompanions(k,p).filter(range=>peaks.some(q=>q.id!==p.id&&inRange(q.x,range))).map(range=>`${range.join('–')} cm⁻¹`),matchLevel:score>.7&&companionsOk(k,p,peaks)&&(k.id!=='amide-nh'||peaks.some(q=>q.id!==p.id&&inRange(q.x,[1630,1695])))?'Strong':score>=.45?'Moderate':'Weak',modelType:'EMPIRICAL',confidence:Math.round(85*score),reasoning:`實測 ${p.x.toFixed(1)} cm⁻¹；峰型 ${p.shape==='broad'?'寬峰':p.shape==='sharp'?'窄峰':'未判定'}；${p.intensityKnown===false?'強度未知':'相對強度已納入'}。${k.shape==='broad'?'寬峰較支持氫鍵／帶包絡假設；':k.shape==='sharp'?'此模式通常較窄，氫鍵／重疊可例外；':''}${effectiveCompanions(k,p).length?'伴隨區 '+effectiveCompanions(k,p).map(range=>`${range.join('–')}：${peaks.some(q=>q.id!==p.id&&inRange(q.x,range))?'已標記支持':'未提供確認（不等於缺失）'}`).join('；')+'。':''}${k.id==='amide-nh'?'須比較羰基與醯胺 II，單一 NH 區峰不足確認醯胺。':''}${k.environment}。${k.measurementLimits}`,inferenceLevel:'LEVEL_3_FUNCTIONAL_GROUP_HYPOTHESIS',alternativeExplanations:k.confusable,electronicAndHBondEffects:[k.environment],evidence:{id:`ir-range-ev-${p.id}-${k.id}`,tag:'[Empirical]',modelType:'EMPIRICAL',sourceType:'Empirical Chemical Rule',certaintyCategory:'Estimated',source:'局部振動區間知識模型',reference:k.source,relevantInformation:`${k.label}／${k.environment}；不是完整分子答案`,confidence:Math.round(85*score)}
 })));
}
