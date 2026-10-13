import {describe,it,expect} from 'vitest';
import {NMRAnalysisEngine} from '../src/engines/nmrEngine';
import {spectrum} from './fixtures';
describe('NMR 聯合片段與碳實驗類型（合成資料）',()=>{
  it('乙氧基限制須通過比例及 J；所有積分比例縮放一致',()=>{
    for(const scale of [1,2,20]) {
      const s=spectrum('1H_NMR',[{id:'q',x:4.1,y:100,integration:2*scale,multiplicity:'q',jValues:[7]},{id:'t',x:1.2,y:90,integration:3*scale,multiplicity:'t',jValues:[7]}]);
      const result=NMRAnalysisEngine.analyzeExperimental1HNMR(s);
      expect(result.structuralConstraints.requiredSubstructures?.some(m=>m.motifId==='motif-h1-oc2h5')).toBe(true);
      s.peaks[1].jValues=[13];
      expect(NMRAnalysisEngine.analyzeExperimental1HNMR(s).structuralConstraints.requiredSubstructures?.some(m=>m.motifId==='motif-h1-oc2h5')).toBe(false);
    }
  });
  it('異丙基為 septet / doublet 比例約 1 : 6 的聯合假設',()=>{
    const s=spectrum('1H_NMR',[{id:'ch',x:3.9,y:60,integration:2,multiplicity:'sept',jValues:[6]},{id:'ch3',x:1.1,y:100,integration:12,multiplicity:'d',jValues:[6]}]);
    expect(NMRAnalysisEngine.analyzeExperimental1HNMR(s).protonSummary.spinSystems.some(p=>p.patternName.includes('異丙'))).toBe(true);
  });
  it('一般去耦碳譜不以峰高判 CH；DEPT90 與負向 DEPT135 使用實驗語義',()=>{
    const s=spectrum('13C_NMR',[{id:'c',x:62,y:-80}]);
    expect(NMRAnalysisEngine.analyzeExperimental13CNMR(s).summary.environments[0].deptType).toBe('Unknown');
    s.c13ExperimentMode='DEPT_135';
    expect(NMRAnalysisEngine.analyzeExperimental13CNMR(s).summary.environments[0].deptType).toBe('CH2');
    s.c13ExperimentMode='DEPT_90';
    expect(NMRAnalysisEngine.analyzeExperimental13CNMR(s).summary.environments[0].deptType).toBe('CH');
  });
});
