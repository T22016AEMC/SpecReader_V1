import {irCandidateBands,irBandMatch} from './irBandKnowledge';
import {globalPeakAssignment} from './globalPeakAssignment';
import {IREngine} from '../irEngine';
import type {IntegratedAnalysisBundle} from '../chemicalFeatureEngine';
import type {ExtendedSpectrumModality,ExperimentalSpectrumData,SpectralPeak,NMRSolvent} from '../../types/spectrum';
import {ChemistryEngine} from '../chemistryEngine';
import {NMRGraphPredictor} from './nmrAtomicEnvironmentModel';
import {graphChemicalFeatures} from './graphChemicalFeatures';
import {graphFragments} from './graphFragmentation';
import {prepareIR,irRangeCovered} from './irSignalProcessing';
import {ionMz,type IonAdduct} from './ionMass';
import {V12_CONFIG} from '../constraints/v12Config';

export interface ScientificEvidence {
  id:string;sourceModality:ExtendedSpectrumModality|'FORMULA';observationIds:string[];
  originalObservedData:{position?:number;intensity?:number;relativeIntegral?:number|null;multiplicity?:string|null;jValues?:number[];formula?:string};
  processingMethod:string;processingSettings?:{irBaseline?:ExperimentalSpectrumData['irManualSettings'];intensityScale?:ExperimentalSpectrumData['irIntensityScale']};proposedInterpretation:string[];supportedFeature:string[];alternativeInterpretations:string[];
  uncertainty:{kind:'UNVALIDATED_MODEL'|'MEASUREMENT';note:string};
  dataCoverage:{min:number|null;max:number|null;complete:boolean};dependency:string[];correlationGroup:string;
}
export interface ScoreLedgerEntry {evidenceId:string;observationIds:string[];sourceModality:ScientificEvidence['sourceModality'];compatibility:number|null;weight:number;contribution:number;method:string;limitations:string[]}
export interface CandidateScoreLedger {entries:ScoreLedgerEntry[];modalityScores:Partial<Record<ExtendedSpectrumModality,number|null>>;modalityWeights:Partial<Record<ExtendedSpectrumModality,number>>;totalScore:number;scoreMeaning:'UNCALIBRATED_COMPATIBILITY';formulaHardCompatible:boolean;limitations:string[]}
function analyte(p:SpectralPeak):boolean {
  return Number.isFinite(p.x)&&Number.isFinite(p.y)&&!p.isPredictedPeak&&!(p.pixelX!==undefined&&p.isCalibrated!==true)&&![p.role,p.signalRole,p.userClassification,p.classificationTag].some(r=>r&&['NOISE','SOLVENT','IMPURITY','WATER','REFERENCE_TMS','ARTIFACT'].includes(r));
}
export function sourceSpectra(bundle:IntegratedAnalysisBundle):Partial<Record<ExtendedSpectrumModality,ExperimentalSpectrumData>> {
  return bundle.scientificSources??bundle.calibratedSpectra??{};
}
export function uniqueObservations(peaks:SpectralPeak[]):SpectralPeak[] {
  const unique=new Map<number,SpectralPeak>();
  for(const p of peaks){if(!analyte(p))continue;const old=unique.get(p.x);if(!old||p.manualEdited||p.userModified||Math.abs(p.y)>Math.abs(old.y))unique.set(p.x,p);}
  return [...unique.values()];
}
export function buildScientificEvidence(bundle:IntegratedAnalysisBundle):ScientificEvidence[] {
  const evidence:ScientificEvidence[]=[];
  for(const [key,s] of Object.entries(sourceSpectra(bundle))) {
    if(!s||!s.validation.isValid||s.digitizationFailed||s.isSimulated)continue;
    const modality=key as ExtendedSpectrumModality,processed=modality==='IR'?prepareIR(s):s;
    const rawPoints=s.irPixelCurve?s.points:s.rawExperimentalSnapshot?.rawPoints?.length?s.rawExperimentalSnapshot.rawPoints:s.points;
    const xs=rawPoints.map(p=>p.x);
    for(const p of uniqueObservations(processed.peaks)) {
      const root=`${modality}:${s.sourceId??s.fileName}:${p.x}`;
      const interpretations=modality==='IR'?bundle.irFindings.filter(f=>Math.abs(f.observedPeak-p.x)<2).map(f=>f.family):modality==='1H_NMR'?bundle.h1Environments.filter(e=>Math.abs(e.shiftPpm-p.x)<.001).map(e=>e.environmentLabel):modality==='13C_NMR'?bundle.c13Summary.environments.filter(e=>Math.abs(e.shiftPpm-p.x)<.001).map(e=>e.assignment):[];
      evidence.push({id:root,sourceModality:modality,observationIds:[root],originalObservedData:{position:p.x,intensity:p.intensityKnown===false?undefined:rawPoints.find(raw=>raw.x===p.x)?.y??p.y,relativeIntegral:p.integration??p.integral??null,multiplicity:p.multiplicity??null,jValues:p.jValues??[]},processingMethod:modality==='IR'?'原始訊號－基線；依吸收方向取符號／相對峰形；原始資料保留':p.detectionSource==='MANUAL'?'人工標峰／座標校正':'數值峰或已校正圖像峰',processingSettings:modality==='IR'?{irBaseline:s.irManualSettings,intensityScale:processed.irIntensityScale}:undefined,proposedInterpretation:interpretations,supportedFeature:interpretations,alternativeInterpretations:['可能重疊、雜質或其他化學環境；未由單峰確認完整結構'],uncertainty:{kind:'UNVALIDATED_MODEL',note:'經驗判讀與模型相容度尚未以實測校準為機率'},dataCoverage:{min:xs.length?Math.min(...xs):null,max:xs.length?Math.max(...xs):null,complete:modality==='IR'&&irRangeCovered(s,Math.min(...xs),Math.max(...xs))},dependency:[],correlationGroup:root});
    }
  }
  if(bundle.userSuppliedFormula)evidence.push({id:'user-formula',sourceModality:'FORMULA',observationIds:['user-formula'],originalObservedData:{formula:bundle.userSuppliedFormula},processingMethod:'元素組成解析',proposedInterpretation:['使用者提供分子式'],supportedFeature:['ELEMENTAL_COMPOSITION'],alternativeInterpretations:[],uncertainty:{kind:'MEASUREMENT',note:'由使用者提供，未聲稱質量或光譜已驗證'},dataCoverage:{min:null,max:null,complete:false},dependency:[],correlationGroup:'user-formula'});
  return evidence;
}
function adduct(s?:ExperimentalSpectrumData):IonAdduct {return s?.msParams?.adductType&&s.msParams.adductType!=='Auto'?s.msParams.adductType:s?.msParams?.ionization==='ESI-'?'[M-H]-':s?.msParams?.ionization==='ESI+'?'[M+H]+':'[M]+•';}
const gaussian=(delta:number,sigma:number)=>Math.exp(-.5*(delta/Math.max(sigma,1e-6))**2);
/**
 * v1.2 (W4): the 1H score also looks from the prediction side. Predicted environments no observation was matched to count against the
 * candidate (exchangeable ones, signal overlaps and an unconfirmed 1H coverage are discounted), and the number of environments and the
 * non-exchangeable H total are compared. Engineering defaults in V12_CONFIG.scoring; the score remains an uncalibrated compatibility.
 */
export function bidirectional1H(hObs:ScientificEvidence[],hPred:{shiftPpm:number;integration?:number|null;isExchangeable?:boolean}[],assignment:Map<number,number>,integralScale:number|null,coverageComplete:boolean):ScoreLedgerEntry[]{
  const SC=V12_CONFIG.scoring,out:ScoreLedgerEntry[]=[];
  const assigned=new Set(assignment.values());
  const hOf=(p:{integration?:number|null})=>p.integration??0;
  const integralOf=(i:number)=>hObs[i].originalObservedData.relativeIntegral;
  const total=hPred.filter(p=>!p.isExchangeable).reduce((s,p)=>s+hOf(p),0);
  let merged=0;
  hPred.forEach((p,j)=>{
    if(assigned.has(j))return;
    if(!p.isExchangeable&&integralScale){
      for(const [i,j2] of assignment){
        const q=hPred[j2],v=integralOf(i);
        if(q.isExchangeable||v==null||!(v>0)||Math.abs(q.shiftPpm-p.shiftPpm)>SC.overlapShiftPpm)continue;
        const sum=hOf(q)+hOf(p);
        if(sum>0&&Math.abs(v/integralScale-sum)<=SC.overlapIntegralTolerance*sum){merged++;return;}
      }
    }
    const factor=(p.isExchangeable?SC.exchangeableUnmatchedFactor:1)*(coverageComplete?1:SC.incompleteCoverageUnmatchedFactor);
    const id=`1H:unmatched-predicted:${p.shiftPpm.toFixed(2)}`;
    out.push({evidenceId:id,observationIds:[id],sourceModality:'1H_NMR',compatibility:0,weight:SC.unmatchedPredictedWeight*factor,contribution:0,method:`預測多出的 1H 環境 δ ${p.shiftPpm.toFixed(2)}（${hOf(p)}H${p.isExchangeable?'，可交換':''}）沒有任何觀測與之配對${coverageComplete?'':'；1H 涵蓋未確認完整，扣分減半'}`,limitations:['雙向評分：預測多出的環境不一定是錯，可能未標記或重疊；未校準權重']});
  });
  const nPred=hPred.filter(p=>!p.isExchangeable).length;
  const nObs=hObs.filter((_,i)=>{const j=assignment.get(i);return j===undefined||!hPred[j].isExchangeable;}).length;
  const delta=Math.max(0,nPred-nObs-merged);
  const countId='1H:environment-count';
  out.push({evidenceId:countId,observationIds:[countId],sourceModality:'1H_NMR',compatibility:Math.exp(-((delta/SC.envCountSigma)**2)),weight:SC.envCountWeight,contribution:0,method:`非可交換 1H 環境數：預測 ${nPred}、觀測 ${nObs}、重疊合併 ${merged}`,limitations:['經驗環境分組；對稱類別以預測器的拓樸分組為準']});
  if(integralScale!==null&&total>0){
    const obsH=hObs.reduce((s,_,i)=>{const j=assignment.get(i),v=integralOf(i);return s+((j!==undefined&&hPred[j].isExchangeable)||v==null||!(v>0)?0:v/integralScale);},0);
    const sigma=Math.max(SC.integralTotalSigmaMin,SC.integralTotalSigmaFraction*total);
    const id='1H:integral-total';
    out.push({evidenceId:id,observationIds:[id],sourceModality:'1H_NMR',compatibility:gaussian(obsH-total,sigma),weight:SC.integralTotalWeight,contribution:0,method:`非可交換 1H 總數：預測 ${total}H、觀測（以配對積分比例換算）${obsH.toFixed(1)}H`,limitations:['積分比例尺由已配對訊號的中位數估計']});
  }
  for(const e of out)e.contribution=e.weight*(e.compatibility??0);
  return out;
}
export function scoreScientificEvidence(smiles:string,bundle:IntegratedAnalysisBundle):CandidateScoreLedger {
  const structure=ChemistryEngine.parseStructureInput(smiles),features=graphChemicalFeatures(smiles),sources=sourceSpectra(bundle);
  const evidence=bundle.scientificEvidence??buildScientificEvidence(bundle),entries:ScoreLedgerEntry[]=[];
  const hPred=NMRGraphPredictor.predict1HFromStructureGraph(structure,{solvent:sources['1H_NMR']?.nmrSolvent??'Unknown'}).environments;
  const cPred=NMRGraphPredictor.predict13CFromStructureGraph(structure,{solvent:sources['13C_NMR']?.nmrSolvent??'Unknown'}).environments;

  const hObs=evidence.filter(e=>e.sourceModality==='1H_NMR'),cObs=evidence.filter(e=>e.sourceModality==='13C_NMR');
  const hMatrix=hObs.map(ev=>hPred.map(p=>{
    let v=gaussian((ev.originalObservedData.position??0)-p.shiftPpm,(p.uncertaintyPpm??.3)+.2);
    const mult=ev.originalObservedData.multiplicity;
    if(mult&&p.multiplicity&&mult!==p.multiplicity&&!['m','unresolved','br s'].includes(mult))v*=.5;
    const observedJ=ev.originalObservedData.jValues??[],predictedJ=p.couplings?.map(c=>c.J)??[];
    if(observedJ.length&&predictedJ.length)v*=.7+.3*observedJ.reduce((sum,j)=>sum+Math.max(...predictedJ.map(k=>gaussian(j-k,3))),0)/observedJ.length;
    return v;
  }));
  const cObsTotal=cObs.reduce((sum,e)=>sum+(e.originalObservedData.relativeIntegral??0),0),cPredTotal=cPred.reduce((sum,e)=>sum+(e.equivalentCarbonCount??1),0);
  const cMatrix=cObs.map(ev=>cPred.map(p=>{let v=gaussian((ev.originalObservedData.position??0)-p.shiftPpm,(p.uncertaintyPpm??8)+3);if(sources['13C_NMR']?.quantitativeCarbonExperiment&&cObsTotal>0&&ev.originalObservedData.relativeIntegral!=null)v*=gaussian(ev.originalObservedData.relativeIntegral/cObsTotal-(p.equivalentCarbonCount??1)/cPredTotal,.15);return v;}));
  let hAssignment=globalPeakAssignment(hMatrix);
  // Relative integrals constrain ratios only among matched observations. Extra
  // predicted environments may simply be unmarked; they are never the denominator.
  const relativeScale=(assignment:Map<number,number>)=>{
    const ratios=[...assignment].flatMap(([i,j])=>{const value=hObs[i].originalObservedData.relativeIntegral,p=hPred[j];return value!=null&&value>0&&!p.isExchangeable&&(p.integration??0)>0?[value/p.integration!]:[];}).sort((a,b)=>a-b);
    return ratios.length>=2?ratios[Math.floor(ratios.length/2)]:null;
  };
  const integralScale=relativeScale(hAssignment);
  if(integralScale!==null){
    for(let i=0;i<hObs.length;i++)for(let j=0;j<hPred.length;j++){
      const value=hObs[i].originalObservedData.relativeIntegral,p=hPred[j];
      if(value!=null&&value>0&&!p.isExchangeable&&(p.integration??0)>0)hMatrix[i][j]*=gaussian(Math.log(value/(integralScale*p.integration!)),.4);
    }
    hAssignment=globalPeakAssignment(hMatrix);
  }
  const cAssignment=globalPeakAssignment(cMatrix);
  const irPred=IREngine.predictIRFromStructure(structure).spectrum.peaks;
  const candidateIRBands=irCandidateBands(smiles);
  const irProcessed=sources.IR?prepareIR(sources.IR):null;
  const precursor=bundle.msmsAnalysis?.physicsModel.precursorIon;
  const msmsFragments=graphFragments(smiles,adduct(sources['MS/MS']),sources['MS/MS']?.msParams?.chargeState??1);
  const tofNegative=(sources['ToF-SIMS']?.msParams?.tofSims?.polarity??sources['ToF-SIMS']?.msParams?.polarity)==='Negative';
  const tofFragments=graphFragments(smiles,'[M]+•',tofNegative?-1:1,true);
  for(const ev of evidence) {
    const x=ev.originalObservedData.position;let compatibility:number|null=null,weight=0,method='資料不足；無獨立分數';const limitations:string[]=[];
    if(ev.sourceModality==='FORMULA') {
      compatibility=structure.molecularFormula===ev.originalObservedData.formula?1:0;method='分子式硬限制；不再當作光譜加分';
    } else if(x!==undefined && ev.sourceModality==='IR') {
      const observed=irProcessed?.peaks.find(p=>Math.abs(p.x-x)<2);
      compatibility=observed&&candidateIRBands.length?Math.max(...candidateIRBands.map(k=>irBandMatch(k,observed,irProcessed!.peaks,(a,b)=>irRangeCovered(sources.IR!,a,b)))):0;
      weight=Math.min(1,(observed?.signalToNoise??10)/10)*(irProcessed?.irDataQuality??.6)*(.5+.5*Math.sqrt(Math.max(0,observed?.relativeArea??1)))*(.7+.3*Math.min(1,(observed?.prominence??100)/100));
      method='候選分子圖選出區間／環境知識，與實測峰型／寬度／伴隨峰比較；每原始峰只計一次';limitations.push('經驗振動特徵模型，非量子光譜；相對像素峰高不是吸光度');
    } else if(x!==undefined && ev.sourceModality==='1H_NMR') {
      const row=hObs.indexOf(ev),best=hAssignment.get(row);
      compatibility=best===undefined?0:hMatrix[row][best];weight=best!==undefined&&hPred[best].isExchangeable?.3:.8;
      method='全域一對一位移／多重性／J／已配對局部積分比例（未標記預測訊號不扣分）';limitations.push('經驗一階模型；重疊及二階效應未完整求解');
    } else if(x!==undefined && ev.sourceModality==='13C_NMR') {
      const row=cObs.indexOf(ev),best=cAssignment.get(row);
      compatibility=best===undefined?0:cMatrix[row][best];weight=.8;method='全域碳環境匹配（含未匹配訊號）';limitations.push('經驗位移與等價碳模型，非高精度量子或訓練模型');
    } else if(x!==undefined && ev.sourceModality==='MS') {
      const s=sources.MS,observed=bundle.msAnalysis?.molecularIonCandidateMz;
      if(s?.msParams?.ionAssignmentConfirmed&&observed!==null&&observed!==undefined&&Math.abs(x-observed)<.001){const theoretical=ionMz(ChemistryEngine.calculateMasses(structure.atomCounts).exactMass,adduct(s),s?.msParams?.chargeState??1);const tolerance=s?.msParams?.isHighResolution?theoretical*(s.msParams.massTolerancePpm??5)/1e6:(s?.msParams?.massToleranceDa??.5);compatibility=gaussian(x-theoretical,tolerance);weight=.9;method='實測分子離子候選與理論離子 m/z／電荷／加合比較';limitations.push('未人工確認分子離子時，其歸屬仍為假設');}
    } else if(x!==undefined && ev.sourceModality==='MS/MS') {
      if(!precursor||precursor.charge===null){method='前驅／電荷未提供，保留實測產品離子，無法可靠換算中性損失';limitations.push('未指定電荷時不將 m/z 差當 Da');entries.push({evidenceId:ev.id,observationIds:ev.observationIds,sourceModality:ev.sourceModality,compatibility:null,weight:0,contribution:0,method,limitations});continue;}if(Math.abs(x-precursor.mz)<.01)continue;
      const params=sources['MS/MS']?.msParams;
      const tol=params?.isHighResolution?Math.max(1e-6,x*(params.massTolerancePpm??5)/1e6):(params?.massToleranceDa??.5);
      compatibility=msmsFragments.length?Math.max(...msmsFragments.map(f=>gaussian(x-f.mz,tol)*f.plausibility)):null;
      const loss=(precursor.mz-x)*Math.abs(precursor.charge);
      const plausibleLoss=(Math.abs(loss-18.010564684)<tol&&(features.alcohol||features.phenol||features.acid))||(Math.abs(loss-43.989829239)<tol&&features.acid)||(Math.abs(loss-17.0265491)<tol&&(features.primaryAmine||features.amide));
      if(plausibleLoss)compatibility=Math.max(compatibility??0,.65);
      weight=compatibility===null?0:.55;method='候選圖單鍵裂解／有限中性損失相容；每個產物離子計一次';limitations.push('未建立 CE 依賴、完整重排或 CFM-ID 模型；產品電荷暫按同價假設');
    } else if(x!==undefined && ev.sourceModality==='ToF-SIMS') {
      compatibility=tofFragments.length?Math.max(...tofFragments.map(f=>gaussian(x-f.mz,.5)*f.plausibility)):null;
      const interpreted=bundle.tofSimsAnalysis?.physicsModel.secondaryIonFeatures.find(f=>Math.abs(f.mz-x)<.001);
      if(interpreted?.ionClass==='organosilicon_secondary_ion')compatibility=(structure.atomCounts.Si??0)>0?.65:0;
      else if(interpreted?.ionClass==='aromatic_hydrocarbon_secondary_ion')compatibility=features.aromatic?.6:0;
      else if(interpreted?.ionClass==='oxygenated_secondary_ion')compatibility=(structure.atomCounts.O??0)>0?.55:0;
      weight=compatibility===null?0:.3;method='表面碎片／極性與候選組成的弱相容性';limitations.push('基質、基底、污染及离子產率未知；不能確認整個表面分子');
    }
    if(V12_CONFIG.useV12Constraints){
      // v1.2 (D3): one image-source factor for every spectrum (default 1.0); the LOW-quality rule is unchanged.
      if(ev.sourceModality!=='FORMULA'){const input=sources[ev.sourceModality];if(input?.digitizedFromImage)weight*=V12_CONFIG.scoring.imageSourceWeightFactor;if(ev.sourceModality!=='IR'&&input?.dataQuality==='LOW')weight*=.5;}
    }else if(ev.sourceModality!=='FORMULA'&&ev.sourceModality!=='IR'){const input=sources[ev.sourceModality];if(input?.digitizedFromImage)weight*=.5;if(input?.dataQuality==='LOW')weight*=.5;}
    entries.push({evidenceId:ev.id,observationIds:ev.observationIds,sourceModality:ev.sourceModality,compatibility,weight,contribution:weight*(compatibility??0),method,limitations});
  }
  if(V12_CONFIG.useV12Constraints&&hObs.length&&hPred.length)entries.push(...bidirectional1H(hObs,hPred,hAssignment,integralScale,sources['1H_NMR']?.observationCoverage==='CONFIRMED_COMPLETE'));
  if(sources.IR&&irProcessed){
    for(const [lo,hi] of [[1630,1850],[2100,2300]]){
      const expected=irPred.filter(p=>p.x>=lo&&p.x<=hi&&p.y>=70);
      if(!expected.length||!irRangeCovered(sources.IR,lo,hi)||irProcessed.peaks.some(p=>p.x>=lo&&p.x<=hi))continue;
      const id=`IR:coverage:${lo}-${hi}`;
      const weight=.2*(irProcessed.irDataQuality??.5);
      entries.push({evidenceId:id,observationIds:[id],sourceModality:'IR',compatibility:0,weight,contribution:0,method:'實際掃描範圍內未檢出候選預期強吸收，弱反證（不適用 OH/NH）',limitations:['偵測門檻／重疊可能遮蔽；非硬限制']});
    }
  }
  const modalityScores:CandidateScoreLedger['modalityScores']={},modalityWeights:CandidateScoreLedger['modalityWeights']={};
  let totalWeight=0,totalContribution=0;
  for(const mod of ['IR','1H_NMR','13C_NMR','MS','MS/MS','ToF-SIMS'] as const){const terms=entries.filter(e=>e.sourceModality===mod&&e.weight>0);const total=terms.reduce((s,e)=>s+e.weight,0);modalityScores[mod]=total?100*terms.reduce((s,e)=>s+e.contribution,0)/total:null;const reliability=terms.length?total/terms.length:0;modalityWeights[mod]=reliability;if(modalityScores[mod]!=null){totalWeight+=reliability;totalContribution+=modalityScores[mod]!*reliability;}}
  return {entries,modalityScores,modalityWeights,totalScore:totalWeight?totalContribution/totalWeight:0,scoreMeaning:'UNCALIBRATED_COMPATIBILITY',formulaHardCompatible:!bundle.userSuppliedFormula||bundle.userSuppliedFormula===structure.molecularFormula,limitations:['候選集合非完整異構物搜尋；全域峰配對每側最多 128 個環境；排名不能證明唯一結構','評分是未校準的模型相容度，並非結構正確機率']};
}

