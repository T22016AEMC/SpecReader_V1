import {describe,it,expect} from 'vitest';
import {ChemicalFeatureEngine} from '../src/engines/chemicalFeatureEngine';
import {scoreScientificEvidence} from '../src/engines/scientificEngines/evidenceLedger';
import {CandidateGenerator} from '../src/engines/candidateGenerator';
import {spectrum} from './fixtures';
describe('候選證據去重與可重建分數',()=>{
  it('同一 IR 峰重複輸入／不同假設不增加獨立證據或分數',()=>{
    const peaks=[{id:'oh',x:3350,y:80,width:100,isBroad:true},{id:'co',x:1050,y:100,width:20}];
    const a=ChemicalFeatureEngine.buildIntegratedBundle({IR:spectrum('IR',peaks)}),b=ChemicalFeatureEngine.buildIntegratedBundle({IR:spectrum('IR',[...peaks,{...peaks[0],id:'duplicate'}])});
    expect(scoreScientificEvidence('CCO',a).totalScore).toBe(scoreScientificEvidence('CCO',b).totalScore);
    expect(new Set(b.scientificEvidence?.map(e=>e.id)).size).toBe(b.scientificEvidence?.length);
  });
  it('未測模態與分子式不產生假光譜分數，帳本能重建總分',()=>{
    const s=spectrum('1H_NMR',[{id:'t',x:1.2,y:100,integration:3,multiplicity:'t'},{id:'q',x:3.6,y:90,integration:2,multiplicity:'q'}]);
    const b=ChemicalFeatureEngine.buildIntegratedBundle({'1H_NMR':s});const l=scoreScientificEvidence('CCO',b);
    expect(l.modalityScores.IR).toBeNull();expect(l.modalityScores.MS).toBeNull();
    const weights=Object.entries(l.modalityWeights);const sum=weights.reduce((s,[,w])=>s+(w??0),0);
    const rebuilt=weights.reduce((s,[key,w])=>s+(l.modalityScores[key as keyof typeof l.modalityScores]??0)*(w??0),0)/sum;
    expect(l.totalScore).toBeCloseTo(rebuilt,10);
    expect(l.scoreMeaning).toBe('UNCALIBRATED_COMPATIBILITY');
  });
  it('同式酸／酯由具體碎片證據得到不同相容分',()=>{
    const s=spectrum('MS',[{id:'prec',x:61.0284,y:60},{id:'prod',x:43.0178,y:100}]);
    s.msParams={msType:'MS/MS',ionization:'ESI+',precursorMz:61.0284,chargeState:1};
    const b=ChemicalFeatureEngine.buildIntegratedBundle({},undefined,{msmsSpectrum:s});
    const acid=scoreScientificEvidence('CC(=O)O',b),ester=scoreScientificEvidence('COC=O',b);
    expect(acid.modalityScores['MS/MS']).not.toBe(ester.modalityScores['MS/MS']);
    expect(acid.entries.some(e=>e.sourceModality==='MS/MS'&&e.observationIds.length>0)).toBe(true);
  });
  it('正式排名候選攜帶帳本，最終總分使用同一計算結果',()=>{
    const b=ChemicalFeatureEngine.buildIntegratedBundle({IR:spectrum('IR',[{id:'co',x:1715,y:100},{id:'ch',x:2920,y:30}])},undefined,{molecularFormula:'C3H6O'});
    const results=CandidateGenerator.executeUnifiedPipelineFromBundle(b).rankedCandidates;
    expect(results.length).toBeGreaterThan(0);
    for(const c of results){expect(c.scientificScoreLedger).toBeDefined();expect(c.finalScore).toBe(Math.round(c.scientificScoreLedger!.totalScore));}
  });
});
