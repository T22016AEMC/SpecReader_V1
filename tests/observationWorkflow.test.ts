import {beforeAll,it,expect,vi} from 'vitest';
import {spectrum} from './fixtures';
import {ChemistryEngine} from '../src/engines/chemistryEngine';
import {ChemicalHardConstraintValidator} from '../src/engines/scientificEngines/chemicalHardConstraintValidator';
import {NMRAnalysisEngine} from '../src/engines/nmrEngine';
import {IRAnalysisEngine} from '../src/engines/irEngine';
import {MSAnalysisEngine} from '../src/engines/msEngine';
import {SpectrumParser} from '../src/engines/spectrumParser';
import {SignalCharacterizationEngine} from '../src/engines/signalCharacterizationEngine';
import {WorkbenchOrchestrator} from '../src/engines/workbenchOrchestrator';
import {emptyModeAState} from '../src/engines/analysisSession';
import {initializeRDKit} from '../src/engines/scientificEngines/rdkitAdapter';
import {searchMolecularGraphs} from '../src/engines/scientificEngines/deNovoGraphSearch';
import {generationStatus} from '../src/engines/candidateGeneration/generationStatus';
import {scoreScientificEvidence} from '../src/engines/scientificEngines/evidenceLedger';
import {ChemicalFeatureEngine} from '../src/engines/chemicalFeatureEngine';
import {MSMSFragmentationEngine} from '../src/engines/scientificEngines/msmsFragmentationEngine';
import {irRangeCovered} from '../src/engines/scientificEngines/irSignalProcessing';
import type {StructuralConstraints} from '../src/types/spectrum';
beforeAll(()=>initializeRDKit());
it('BUG019 空 UI 與標記新增／更新不呼叫完整科學引擎或舊化學分類',()=>{
 const pipeline=vi.spyOn(WorkbenchOrchestrator,'runModeAPipeline'),chem=vi.spyOn(SignalCharacterizationEngine,'characterizeSpectrumSignals');
 expect(emptyModeAState().rankedCandidates).toEqual([]);
 let s=spectrum('1H_NMR',[]);s=WorkbenchOrchestrator.addManualPeak(s,{x:3.5,y:60});s=WorkbenchOrchestrator.updatePeak(s,s.peaks[0].id,{integration:null,integral:undefined,note:'觀測備註'});
 expect(pipeline).not.toHaveBeenCalled();expect(chem).not.toHaveBeenCalled();expect(s.peaks[0].integration).toBeNull();expect(s.peaks[0].note).toBe('觀測備註');pipeline.mockRestore();chem.mockRestore();
});
it('BUG001 單一低場 H 不強制含氮骨架，明確 N 組成仍可生成有效圖',()=>{
 const s=spectrum('1H_NMR',[{id:'h',x:8.7,y:80,manualPeak:true}]);const c=NMRAnalysisEngine.analyzeExperimental1HNMR(s).structuralConstraints;
 expect(c.heteroaromaticConstraints).toBeUndefined();expect(c.requiredFunctionalGroups?.some(g=>g.groupFamily==='Heteroaromatic'&&g.status==='REQUIRED')).not.toBe(true);
 const n=searchMolecularGraphs('C2H7N',{maxResults:2,timeMs:200});expect(n.smiles.length).toBeGreaterThan(0);expect(n.smiles.every(x=>ChemistryEngine.parseStructureInput(x).atomCounts.N===1)).toBe(true);
});
it('BUG002 相對積分等比例不改分，J／多重性／位移改變相容性',()=>{
 const make=(factor:number,multiplicity:'q'|'s'='q',j=7,shift=3.7)=>ChemicalFeatureEngine.buildIntegratedBundle({'1H_NMR':spectrum('1H_NMR',[{id:'q',x:shift,y:80,integration:2*factor,multiplicity,jValues:[j]},{id:'t',x:1.2,y:100,integration:3*factor,multiplicity:'t',jValues:[7]}])});
 const a=scoreScientificEvidence('CCO',make(1)),scaled=scoreScientificEvidence('CCO',make(4));expect(a.totalScore).toBeCloseTo(scaled.totalScore,6);
 expect(scoreScientificEvidence('CCO',make(1,'s',14,5)).totalScore).not.toBe(a.totalScore);
});
it('BUG009 13C 積分記錄保留，寬頻去耦不計碳數／CHn',()=>{
 const s=spectrum('13C_NMR',[{id:'c',x:65,y:80,integration:5,manualPeak:true}]);const result=NMRAnalysisEngine.analyzeExperimental13CNMR(s);expect(result.summary.environments[0].deptType).toBe('Unknown');
 const bundle=ChemicalFeatureEngine.buildIntegratedBundle({'13C_NMR':s}),a=scoreScientificEvidence('CCO',bundle);s.peaks[0].integration=500;const b=scoreScientificEvidence('CCO',ChemicalFeatureEngine.buildIntegratedBundle({'13C_NMR':s}));expect(a.totalScore).toBe(b.totalScore);expect(s.peaks[0].integration).toBe(500);
});
it('BUG003 使用者組成硬限制與候選實際圖分子式一致',()=>{
 const result=WorkbenchOrchestrator.runModeAPipeline({},{molecularFormula:'C2H6O'});expect(result.rankedCandidates.length).toBeGreaterThan(0);
 for(const c of result.rankedCandidates){expect(c.molecularFormula).toBe(ChemistryEngine.parseStructureInput(c.smiles).molecularFormula);expect(c.molecularFormula).toBe('C2H6O');expect(c.candidateOrigin).not.toBe('[Known Library Candidate]');}
});
it('BUG011 C15H16O2 DBE=8、質量正確，超出圖枚舉不等於化學無效',()=>{
 const v=ChemicalHardConstraintValidator.parseAndValidateFormula('C15H16O2');expect(v.isValid).toBe(true);expect(v.dbe).toBe(8);expect(v.exactMass).toBeCloseTo(228.11503,4);
 const result=searchMolecularGraphs('C15H16O2');expect(result.status).toBe('UNSUPPORTED');const c:StructuralConstraints={source:'MULTI_MODAL',confidence:0,userSuppliedFormulaValidation:v};const status=generationStatus(c,0,[result.note]);expect(status.code).toBe('SEARCH_LIMIT');expect(status.userFormula).toBe('C15H16O2');
});
it('BUG013 區分缺少、格式、化學限制、搜尋界限、無匹配與執行錯誤',()=>{
 const base:StructuralConstraints={source:'MULTI_MODAL',confidence:0};expect(generationStatus(base,0,[]).code).toBe('FORMULA_NOT_PROVIDED');
 const c=(f:string):StructuralConstraints=>({...base,userSuppliedFormulaValidation:ChemicalHardConstraintValidator.parseAndValidateFormula(f)});
 expect(generationStatus(c('C2H?'),0,[]).code).toBe('INVALID_FORMULA_FORMAT');expect(generationStatus(c('C2H99'),0,[]).code).toBe('CHEMICALLY_INVALID_FORMULA');
 expect(generationStatus(c('C2H6O'),0,['已達資源界限']).code).toBe('SEARCH_LIMIT');expect(generationStatus(c('C2H6O'),0,[]).code).toBe('NO_MATCH_WITHIN_SEARCH');expect(generationStatus(base,0,[],'failure').code).toBe('EXECUTION_ERROR');
});
it('BUG014／018 一個或三個 IR 人工觀測可分析，不代表完整未標記區',()=>{
 for(const xs of [[1715],[1715,3300,1050]]){const s=spectrum('IR',xs.map((x,i)=>({id:String(i),x,y:80,manualPeak:true})), 'Relative intensity');s.sourceFormat='MANUAL';s.points=[];const r=IRAnalysisEngine.analyzeExperimentalIR(s);expect(r.findings.length).toBeGreaterThan(0);expect(r.structuralConstraints.excludedFunctionalGroups).toEqual([]);expect(irRangeCovered(s,1600,1850)).toBe(false);}
});
it('BUG008 寬峰區間與備註在後續欄位更新後仍保存',()=>{
 let s=spectrum('IR',[]);s=WorkbenchOrchestrator.addManualPeak(s,{x:3300,y:80});const id=s.peaks[0].id;
 s=WorkbenchOrchestrator.updatePeak(s,id,{shape:'broad',observedRange:[3100,3550],width:450});s=WorkbenchOrchestrator.updatePeak(s,id,{note:'寬廣吸收'});
 expect(s.peaks[0].observedRange).toEqual([3100,3550]);expect(s.peaks[0].shape).toBe('broad');expect(s.peaks[0].note).toBe('寬廣吸收');
});
it('BUG017 手動記錄接近氘代溶劑仍保留作競爭觀測',()=>{
 for(const modality of ['1H_NMR','13C_NMR'] as const){const s=spectrum(modality,[{id:'observed',x:modality==='1H_NMR'?7.26:77.16,y:80,manualPeak:true}]);s.nmrSolvent='CDCl3';const result=modality==='1H_NMR'?NMRAnalysisEngine.analyzeExperimental1HNMR(s).environments:NMRAnalysisEngine.analyzeExperimental13CNMR(s).summary.environments;expect(result.length).toBe(1);}
});
it('BUG010 未確認離子不得當中性質量；無前驅保留產品且不捏造損失',()=>{
 const s=spectrum('MS',[{id:'ion',x:101,y:100}]);const r=MSAnalysisEngine.analyzeExperimentalMS(s).analysis!;expect(r.estimatedNominalMw).toBeNull();expect(r.candidateFormulas).toEqual([]);
 const msms=new MSMSFragmentationEngine().extractPhysicsModel(s);expect(msms.precursorIon).toBeNull();expect(msms.productIons.length).toBe(1);expect(msms.neutralLosses).toEqual([]);
});

it('BUG004／019 空白輸入或未確認 MS 組成不捏造完整候選',()=>{
 expect(WorkbenchOrchestrator.runModeAPipeline({}).rankedCandidates).toEqual([]);
 const r=WorkbenchOrchestrator.runModeAPipeline({MS:spectrum('MS',[{id:'m',x:101,y:100}])});expect(r.rankedCandidates).toEqual([]);expect(r.bundle.msAnalysis?.estimatedNominalMw).toBeNull();
});

it('BUG014 強度未知的單一 IR 標記仍能進行位置假設，不捏造強度／寬度',()=>{
 const s=spectrum('IR',[{id:'p',x:1715,y:0,intensityKnown:false,manualPeak:true,shape:'UNRESOLVED'}]);s.points=[];s.sourceFormat='MANUAL';const r=IRAnalysisEngine.analyzeExperimentalIR(s);expect(r.findings.length).toBeGreaterThan(0);expect(s.peaks[0].y).toBe(0);expect(s.peaks[0].width).toBeUndefined();
});
