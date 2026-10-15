import {beforeAll,it,expect} from 'vitest';
import {relativeIRSignal,physicalIRInputs} from '../src/engines/scientificEngines/irManualBaseline';
import {prepareIR,refreshIRSnapshot} from '../src/engines/scientificEngines/irSignalProcessing';
import {IRAnalysisEngine} from '../src/engines/irEngine';
import {IR_BAND_KNOWLEDGE} from '../src/engines/scientificEngines/irBandKnowledge';
import {WorkbenchOrchestrator} from '../src/engines/workbenchOrchestrator';
import {ChemicalFeatureEngine} from '../src/engines/chemicalFeatureEngine';
import {scoreScientificEvidence} from '../src/engines/scientificEngines/evidenceLedger';
import {NMRAnalysisEngine} from '../src/engines/nmrEngine';
import {NMRGraphPredictor} from '../src/engines/scientificEngines/nmrAtomicEnvironmentModel';
import {describeAtomicEnvironments} from '../src/engines/scientificEngines/atomicChemicalEnvironment';
import {ChemistryEngine} from '../src/engines/chemistryEngine';
import {initializeRDKit} from '../src/engines/scientificEngines/rdkitAdapter';
import {spectrum} from './fixtures';
beforeAll(()=>initializeRDKit());
it('方向差值有符號；基線另一側雜訊不被 abs 變吸收',()=>{const p=[{x:1,y:90},{x:2,y:105}],b=p.map(p=>({x:p.x,y:100}));expect(relativeIRSignal(p,b,'DOWN').map(p=>p.y)).toEqual([10,-5]);expect(relativeIRSignal(p,b,'UP').map(p=>p.y)).toEqual([-10,5]);});
it('像素五點與訊號同座標映射；版本改變實際訊號且原始資料不改',()=>{
 const s=spectrum('IR',[]);s.irPixelCurve=Array.from({length:61},(_,i)=>({x:10+i,y:20+15*Math.exp(-Math.pow((i-30)/6,2))}));s.digitizedFromImage=true;s.sourceType='IMAGE_EXPERIMENTAL';
 s.imageCalibration={plotLeftPx:10,plotRightPx:70,plotTopPx:10,plotBottomPx:70,xAxisStart:4000,xAxisEnd:400,xAxisDirection:'DESCENDING',source:'USER_CALIBRATED',confidence:1};s.irManualSettings={direction:'DOWN',enabled:true,coordinateSpace:'PIXEL',revision:1,anchors:[10,25,40,55,70].map(x=>({x,y:20}))};
 const copy=JSON.stringify(s.irPixelCurve),a=refreshIRSnapshot(s),input=physicalIRInputs(s);expect(input.raw[0].y).toBeCloseTo(83.3333333,5);
 const changed={...a,irManualSettings:{...s.irManualSettings,revision:2,anchors:s.irManualSettings.anchors.map(p=>({...p,y:18}))}};const b=refreshIRSnapshot(changed,a);expect(b.irAnalysisSnapshot!.curveSignature).not.toBe(a.irAnalysisSnapshot!.curveSignature);expect(JSON.stringify(s.irPixelCurve)).toBe(copy);expect(prepareIR(b).irBaselinePoints!.length).toBe(61);
});
it('人工寬峰起訖／覆寫經正式標記 API 保存並送入區間知識及排名',()=>{
 let s=spectrum('IR',[],'Relative intensity');s=WorkbenchOrchestrator.addManualPeak(s,{x:3200,y:70});const id=s.peaks[0].id;s=WorkbenchOrchestrator.updatePeak(s,id,{shape:'broad',isBroad:true,observedRange:[2500,3500],width:1000,userOverride:true});
 expect(s.peaks[0].observedRange).toEqual([2500,3500]);const finding=IRAnalysisEngine.analyzeExperimentalIR(s).findings;expect(IRAnalysisEngine.analyzeExperimentalIR(s).structuralConstraints.requiredFunctionalGroups!.every(g=>g.status!=='REQUIRED')).toBe(true);expect(finding.some(f=>f.observedWidthAndShape.includes('2500–3500'))).toBe(true);expect(IR_BAND_KNOWLEDGE.every(k=>k.environment&&k.measurementLimits&&k.source&&k.confusable.length)).toBe(true);
 const bundle=ChemicalFeatureEngine.buildIntegratedBundle({IR:s});const ledger=scoreScientificEvidence('CCO',bundle);expect(ledger.entries.some(e=>e.sourceModality==='IR'&&e.method.includes('區間'))).toBe(true);
});
it('人工 NMR 多重性／相對積分／J 回推競爭局部環境；無 DEPT 不捏造 CH',()=>{
 let h=spectrum('1H_NMR',[]);h=WorkbenchOrchestrator.addManualPeak(h,{x:3.5,y:80,integral:2,multiplicity:'q',jValues:[7]});const result=NMRAnalysisEngine.analyzeExperimental1HNMR(h);expect(result.environments[0].environmentHypotheses!.some(h=>h.support.some(s=>s.includes('J=7')))).toBe(true);expect(result.totalIntegratedProtons).toBeNull();
 const c=NMRAnalysisEngine.analyzeExperimental13CNMR(spectrum('13C_NMR',[{id:'c',x:65,y:90}]));expect(c.summary.environments[0].deptType).toBe('Unknown');expect(c.summary.environments[0].environmentHypotheses!.length).toBeGreaterThan(1);
 const structure=ChemistryEngine.parseStructureInput('CCO'),hp=NMRGraphPredictor.predict1HFromStructureGraph(structure),cp=NMRGraphPredictor.predict13CFromStructureGraph(structure);expect(hp.environments.some(e=>e.atomicEnvironment!.length>0)).toBe(true);expect(cp.environments.every(e=>e.atomicEnvironment!.every(a=>a.solvent==='Unknown'))).toBe(true);expect(describeAtomicEnvironments('CCO').length).toBe(3);
});
