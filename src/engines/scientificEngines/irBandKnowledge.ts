import type {ExperimentalSpectrumData,IRFunctionalGroupFinding,SpectralPeak} from '../../types/spectrum';
import {graphChemicalFeatures} from './graphChemicalFeatures';
import {matchesSMARTS} from './rdkitAdapter';
import {irRangeCovered} from './irSignalProcessing';
const SOURCE='https://www2.chemistry.msu.edu/faculty/reusch/VirtTxtJml/Spectrpy/InfraRed/infrared.htm';
type Range=[number,number];
export interface IRBandKnowledge {
 id:string;family:string;label:string;environment:string;range:Range;uncertainty:number;
 specificity:'LOW'|'MEDIUM';
 intensity:'weak'|'variable'|'medium'|'strong';shape:'broad'|'sharp'|'variable';widthRange:Range;
 shoulderPossible:boolean;companions:Range[];fingerprint:Range[];confusable:string[];
 missingBandCondition:string;measurementLimits:string;source:string;
 feature?:string;smarts?:string;context?:'CONJUGATED'|'SATURATED';
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
const inRange=(x:number,[a,b]:Range)=>x>=a&&x<=b;
export function irBandMatch(k:IRBandKnowledge,p:SpectralPeak,peaks:SpectralPeak[],coverage?:(a:number,b:number)=>boolean):number {
 const distance=Math.max(k.range[0]-p.x,0,p.x-k.range[1]);
 let score=(k.specificity==='LOW'?.75:1)*Math.exp(-.5*(distance/k.uncertainty)**2);
 const width=p.observedRange?Math.abs(p.observedRange[1]-p.observedRange[0]):p.fwhm??p.width;
 const broad=p.shape==='broad'||p.shape==='BROAD'||(p.shape!=='sharp'&&p.shape!=='SHARP'&&(p.isBroad||(width??0)>55));
 const shapeKnown=width!==undefined||p.isBroad===true||['broad','sharp','BROAD','SHARP','shoulder','SHOULDER','OVERLAPPED'].includes(p.shape??'');
 if(shapeKnown&&k.shape==='broad'&&!broad)score*=.4;
 if(shapeKnown&&k.shape==='sharp'&&broad)score*=.45;
 if(width&&k.shape==='broad'&&width<k.widthRange[0])score*=.6;
 if(p.observedRange){const overlap=Math.max(0,Math.min(p.observedRange[1],k.range[1])-Math.max(p.observedRange[0],k.range[0]));if(!overlap&&distance>0)score*=.6;}
 if(p.intensityKnown!==false)score*=k.intensity==='weak'?.75+.25*(1-Math.min(1,p.y/100)):.7+.3*Math.min(1,Math.max(0,p.y)/100);
 if(k.companions.length){let matched=0,coveredMissing=0;for(const range of k.companions){if(peaks.some(q=>q.id!==p.id&&inRange(q.x,range)))matched++;else if(coverage?.(...range))coveredMissing++;}score*=.65+.35*matched/k.companions.length;score*=1-.1*coveredMissing/k.companions.length;}
 return Math.max(0,Math.min(1,score));
}
export function irCandidateBands(smiles:string):IRBandKnowledge[]{
 const f=graphChemicalFeatures(smiles),atoms=f.graph?.atoms??[];
 const extras:Record<string,boolean>={aliphaticCH:atoms.some(a=>a.element==='C'&&!a.isAromatic&&a.totalHydrogens>0&&a.neighbors.every(n=>n.order===1)),terminalAlkyne:atoms.some(a=>a.element==='C'&&a.totalHydrogens>0&&a.neighbors.some(n=>n.order===3&&atoms[n.toAtom].element==='C')),siloxane:matchesSMARTS(smiles,'[Si]O[Si]')===true,chelatableOH:(f.alcohol||f.phenol)&&f.carbonylCount>0,tertiaryAmine:f.amine&&!f.primaryAmine&&!f.secondaryAmine,amideNH:f.amide&&!f.tertiaryAmide,anhydride:matchesSMARTS(smiles,'[CX3](=O)O[CX3](=O)')===true,acylHalide:matchesSMARTS(smiles,'[CX3](=O)[F,Cl,Br,I]')===true,alkene:atoms.some(a=>a.element==='C'&&!a.isAromatic&&a.neighbors.some(n=>n.order===2&&atoms[n.toAtom].element==='C')),alkyne:atoms.some(a=>a.element==='C'&&a.neighbors.some(n=>n.order===3&&atoms[n.toAtom].element==='C')),sulfoxide:atoms.some(a=>a.element==='S'&&a.neighbors.filter(n=>atoms[n.toAtom].element==='O'&&n.order===2).length===1),thiol:atoms.some(a=>a.element==='S'&&a.totalHydrogens>0),chloride:atoms.some(a=>a.element==='Cl'),bromide:atoms.some(a=>a.element==='Br'),fluoride:atoms.some(a=>a.element==='F')};
 return IR_BAND_KNOWLEDGE.filter(k=>{
  const feature=k.feature??'';if(!(extras[feature]??(f as unknown as Record<string,unknown>)[feature]))return false;
  if(k.smarts&&matchesSMARTS(smiles,k.smarts)!==true)return false;
  if(k.context){
    const carbonyls=atoms.filter(a=>a.element==='C'&&a.neighbors.some(n=>n.order===2&&atoms[n.toAtom].element==='O'));
    const matching=carbonyls.filter(a=>k.family==='Ketone'?a.neighbors.filter(n=>atoms[n.toAtom].element==='C').length===2:k.family==='Aldehyde'?a.totalHydrogens>0:k.family==='Ester'?a.neighbors.some(n=>atoms[n.toAtom].element==='O'&&n.order===1&&atoms[n.toAtom].totalHydrogens===0):true);
    if(!matching.some(a=>{const conjugated=a.neighbors.some(n=>atoms[n.toAtom].element==='C'&&(atoms[n.toAtom].isAromatic||atoms[n.toAtom].neighbors.some(m=>m.toAtom!==a.index&&m.order===2)));return k.context==='CONJUGATED'?conjugated:!conjugated;}))return false;
  }
  return true;
 });
}
export function inferIRBands(s:ExperimentalSpectrumData):IRFunctionalGroupFinding[]{
 const peaks=s.peaks.filter(p=>![p.userClassification,p.role,p.signalRole].some(role=>role&&['NOISE','SOLVENT','IMPURITY','REFERENCE_TMS','WATER'].includes(role)));
 return peaks.flatMap(p=>IR_BAND_KNOWLEDGE.map(k=>({k,score:irBandMatch(k,p,peaks,(a,b)=>irRangeCovered(s,a,b))})).filter(v=>v.score>=.30).sort((a,b)=>b.score-a.score).slice(0,5).map(({k,score})=>({
   id:`ir-range-${k.id}-${p.id}`,functionalGroup:k.label,family:k.family,observedPeak:p.x,observedWidthAndShape:`${p.shape??'未確認'}；區間 ${p.observedRange?.join('–')??'未標記'}；寬度 ${p.fwhm??p.width??'未知'}`,expectedRange:`${k.range.join('–')} cm⁻¹ ±${k.uncertainty}；${k.environment}`,region:p.x>=1500?'官能基區':'指紋區',assignment:k.label,companionPeaksObserved:k.companions.filter(range=>peaks.some(q=>q.id!==p.id&&inRange(q.x,range))).map(range=>`${range.join('–')} cm⁻¹`),matchLevel:score>.7&&k.companions.some(range=>peaks.some(q=>q.id!==p.id&&inRange(q.x,range)))&&(k.id!=='amide-nh'||peaks.some(q=>q.id!==p.id&&inRange(q.x,[1630,1695])))?'Strong':score>=.45?'Moderate':'Weak',modelType:'EMPIRICAL',confidence:Math.round(85*score),reasoning:`實測 ${p.x.toFixed(1)} cm⁻¹；峰型 ${p.shape==='broad'?'寬峰':p.shape==='sharp'?'窄峰':'未判定'}；${p.intensityKnown===false?'強度未知':'相對強度已納入'}。${k.shape==='broad'?'寬峰較支持氫鍵／帶包絡假設；':k.shape==='sharp'?'此模式通常較窄，氫鍵／重疊可例外；':''}${k.companions.length?'伴隨區 '+k.companions.map(range=>`${range.join('–')}：${peaks.some(q=>q.id!==p.id&&inRange(q.x,range))?'已標記支持':'未提供確認（不等於缺失）'}`).join('；')+'。':''}${k.id==='amide-nh'?'須比較羰基與醯胺 II，單一 NH 區峰不足確認醯胺。':''}${k.environment}。${k.measurementLimits}`,inferenceLevel:'LEVEL_3_FUNCTIONAL_GROUP_HYPOTHESIS',alternativeExplanations:k.confusable,electronicAndHBondEffects:[k.environment],evidence:{id:`ir-range-ev-${p.id}-${k.id}`,tag:'[Empirical]',modelType:'EMPIRICAL',sourceType:'Empirical Chemical Rule',certaintyCategory:'Estimated',source:'局部振動區間知識模型',reference:k.source,relevantInformation:`${k.label}／${k.environment}；不是完整分子答案`,confidence:Math.round(85*score)}
 })));
}
