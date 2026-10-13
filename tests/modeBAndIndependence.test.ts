import {beforeAll,describe,it,expect} from 'vitest';
import {initializeRDKit} from '../src/engines/scientificEngines/rdkitAdapter';
import {WorkbenchOrchestrator} from '../src/engines/workbenchOrchestrator';
import {ChemicalFeatureEngine} from '../src/engines/chemicalFeatureEngine';
import {scoreScientificEvidence} from '../src/engines/scientificEngines/evidenceLedger';
import {spectrum} from './fixtures';
import type {ExtendedSpectrumModality,ExperimentalSpectrumData} from '../src/types/spectrum';
const mods:ExtendedSpectrumModality[]=['IR','1H_NMR','13C_NMR','MS','MS/MS','ToF-SIMS'];
beforeAll(()=>initializeRDKit(),30000);
describe('Mode B 分子圖與六模態（合成回歸，非實測准确率）',()=>{
  it.each(['CCO','Oc1ccccc1','CC(=O)C','CCOC(C)=O','O=C(O)c1ccccc1','O=Cc1ccccc1','Nc1ccccc1','CC(N)=O','OCCO','CCOCC','n1ccccc1','CC(=O)O'])('合法結構 %s 的六種預測可執行並保留預測來源',smiles=>{
    const r=WorkbenchOrchestrator.runModeBPrediction(smiles,mods);
    expect(r.errorMessage).toBeNull();
    for(const mod of mods){const s=r.bidirectionalReport!.modalityReports[mod].predictedSpectrum;expect(s.isSimulated).toBe(true);expect(s.peaks.length).toBeGreaterThan(0);expect(s.peaks.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))).toBe(true);}
    expect(r.bidirectionalReport!.overallConsistencyScore).toBeNull();
  });
  it.each(mods)('單獨預測 %s 不需要其他模態',mod=>{
    const r=WorkbenchOrchestrator.runModeBPrediction('CCO',[mod]);
    expect(r.errorMessage).toBeNull();
    for(const m of mods)expect(r.bidirectionalReport!.modalityReports[m].predictedSpectrum.peaks.length>0).toBe(m===mod);
  });
  it('等價 SMILES 的 IR 峰與核心式一致；非法結構／僅式輸入不能偽造預測',()=>{
    const a=WorkbenchOrchestrator.runModeBPrediction('CCO'),b=WorkbenchOrchestrator.runModeBPrediction('OCC');
    expect(a.parsedStructure!.molecularFormula).toBe(b.parsedStructure!.molecularFormula);
    expect(a.bidirectionalReport!.modalityReports.IR.predictedSpectrum.peaks.map(p=>p.x)).toEqual(b.bidirectionalReport!.modalityReports.IR.predictedSpectrum.peaks.map(p=>p.x));
    for(const invalid of ['','C(C)(C)(C)(C)C','C2H6O'])expect(WorkbenchOrchestrator.runModeBPrediction(invalid).errorMessage).toBeTruthy();
  });
  it('可能碎片未見時不稱為確定缺峰；同一實測峰不重複匹配',()=>{
    const msms=spectrum('MS',[{id:'p',x:47.0491,y:100}]);
    const r=WorkbenchOrchestrator.runModeBPrediction('CCO',['MS/MS'],{'MS/MS':msms});
    const report=r.bidirectionalReport!.modalityReports['MS/MS'];
    expect(report.missingPeakCount).toBe(0);expect(report.compatibleCount+report.shiftedCount).toBeLessThanOrEqual(1);
  });
});
const inputs:Partial<Record<ExtendedSpectrumModality,ExperimentalSpectrumData>>={
  IR:spectrum('IR',[{id:'oh',x:3350,y:70,width:110,isBroad:true},{id:'co',x:1050,y:100}], 'Relative intensity'),
  '1H_NMR':spectrum('1H_NMR',[{id:'t',x:1.2,y:100,integration:3,multiplicity:'t'},{id:'q',x:3.6,y:70,integration:2,multiplicity:'q'}]),
  '13C_NMR':spectrum('13C_NMR',[{id:'c1',x:18,y:100},{id:'c2',x:58,y:90}]),
  MS:{...spectrum('MS',[{id:'m',x:46.0413,y:100,isMolecularIonCandidate:true}]),msParams:{msType:'EI-MS',ionization:'EI',adductType:'[M]+•'}},
  'MS/MS':{...spectrum('MS',[{id:'pre',x:47.0491,y:90},{id:'loss',x:29.0386,y:100}]),msParams:{msType:'MS/MS',ionization:'ESI+',precursorMz:47.0491}},
  'ToF-SIMS':{...spectrum('MS',[{id:'frag',x:31,y:100}]),msParams:{msType:'ToF-SIMS',ionization:'ToF-SIMS+',tofSims:{polarity:'Positive',primaryIon:'Bi3+',primaryIonEnergyKeV:25,massRange:[0,500],ionDoseRegime:'Static (< 10^12 ions/cm²)',surfaceMatrixNote:'synthetic fixture',substrateMaterial:'高分子薄膜'}}},
};
describe('Mode A 七種平行來源',()=>{
  it.each(mods)('%s 無分子式可完成正式管線並追溯原始觀測',mod=>{
    const r=WorkbenchOrchestrator.runModeAPipeline({[mod]:inputs[mod]});
    expect(r.bundle.userSuppliedFormula).toBeFalsy();
    expect(r.bundle.scientificEvidence!.some(e=>e.sourceModality===mod)).toBe(true);
    for(const c of r.rankedCandidates)expect(Number.isFinite(c.finalScore)).toBe(true);
  });
  it('63 種非空光譜組合都可建立證據與有限評分，無前置模態',()=>{
    for(let mask=1;mask<64;mask++){
      const selected=Object.fromEntries(mods.filter((_,i)=>mask&(1<<i)).map(m=>[m,inputs[m]]));
      const bundle=ChemicalFeatureEngine.buildIntegratedBundle(selected,undefined,{msmsSpectrum:selected['MS/MS'],tofSimsSpectrum:selected['ToF-SIMS']});
      const ledger=scoreScientificEvidence('CCO',bundle);expect(Number.isFinite(ledger.totalScore)).toBe(true);
      for(const m of mods)if(!(m in selected))expect(ledger.modalityScores[m]).toBeNull();
    }
  },30000);
  it('分子式单獨輸入只有元素限制，沒有假光譜證據',()=>{
    const r=WorkbenchOrchestrator.runModeAPipeline({}, {molecularFormula:'C2H6O'});
    expect(r.bundle.scientificEvidence!.every(e=>e.sourceModality==='FORMULA')).toBe(true);
    expect(r.bundle.constraints.exactMass).toBeUndefined();
  });
  it('非法質量／電荷與未指定多加合不使其他模態崩潰',()=>{
    for(const z of [0,NaN,2]){
      const bad={...inputs.MS!,msParams:{...inputs.MS!.msParams!,chargeState:z,adductType:'[M+Na]+' as const}};
      const r=WorkbenchOrchestrator.runModeAPipeline({IR:inputs.IR,MS:bad});
      expect(r.bundle.scientificEvidence!.some(e=>e.sourceModality==='IR')).toBe(true);
      expect(r.bundle.scientificEvidence!.some(e=>e.sourceModality==='MS')).toBe(false);
    }
  });
});
