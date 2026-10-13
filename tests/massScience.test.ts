import {describe,it,expect} from 'vitest';
import {MolecularFormulaCandidateEngine} from '../src/engines/formulaEngine';
import {isotopeEnvelope} from '../src/engines/scientificEngines/isotopeEnvelope';
import {ionMz} from '../src/engines/scientificEngines/ionMass';
import {MSAnalysisEngine} from '../src/engines/msEngine';
import {MassSpectrometryEngine} from '../src/engines/scientificEngines/massSpectrometryEngine';
import {MSMSFragmentationEngine} from '../src/engines/scientificEngines/msmsFragmentationEngine';
import {ToFSIMSScientificEngine} from '../src/engines/scientificEngines/tofSimsScientificEngine';
import {ChemicalFeatureEngine} from '../src/engines/chemicalFeatureEngine';
import {spectrum} from './fixtures';
describe('MS / MSMS / ToF 質量與來源（合成資料）',()=>{
  it('HRMS 列舉不依赖結構庫，保留真實非零 ppm',()=>{
    const mz=ionMz(46.041864812,'[M+H]+')+.0001;
    const candidates=MolecularFormulaCandidateEngine.generateCandidates({observedIonMz:mz,ionization:'ESI+',isHighResolution:true,massTolerancePpm:5,adductPreference:'[M+H]+'});
    const ethanol=candidates.find(c=>c.formula==='C2H6O');
    expect(ethanol).toBeDefined();expect(ethanol!.massErrorPpm).toBeGreaterThan(1);
    const s=spectrum('MS',[{id:'M',x:mz,y:100,isMolecularIonCandidate:true}]);s.msParams={msType:'LC-MS',ionization:'ESI+',isHighResolution:true,adductType:'[M+H]+'};
    expect(MSAnalysisEngine.analyzeExperimentalMS(s).analysis?.candidateFormulas.some(c=>c.formula==='C2H6O')).toBe(true);
  });
  it('明確 Na 加合優先於 ESI+ 預設，雙電荷不改用一價',()=>{
    const mz=ionMz(46.041864812,'[M+Na]+');const s=spectrum('MS',[{id:'M',x:mz,y:100,isMolecularIonCandidate:true}]);
    s.msParams={msType:'LC-MS',ionization:'ESI+',isHighResolution:true,adductType:'[M+Na]+'};
    expect(new MassSpectrometryEngine().extractPhysicsModel(s).adductModel.detectedAdduct).toBe('[M+Na]+');
    const twice=MolecularFormulaCandidateEngine.generateCandidates({observedIonMz:ionMz(46.041864812,'[M+H]+',2),ionization:'ESI+',chargeState:2,isHighResolution:true,adductPreference:'[M+H]+'});
    expect(twice.some(c=>c.formula==='C2H6O')).toBe(true);
  });
  it('多氯、多溴及碳同位素卷積',()=>{
    const cl=isotopeEnvelope({Cl:2}),br=isotopeEnvelope({Br:2});
    expect(cl.find(p=>p.nominalOffset===2)!.probability/cl[0].probability).toBeCloseTo(2*.2424/.7576,6);
    expect(br.find(p=>p.nominalOffset===2)!.relativeIntensity).toBe(100);
    expect(isotopeEnvelope({C:10}).find(p=>p.nominalOffset===1)!.probability).toBeGreaterThan(.09);
  });
  it('分子式單獨輸入不產生假 HRMS 觀測值',()=>{
    const bundle=ChemicalFeatureEngine.buildIntegratedBundle({},undefined,{molecularFormula:'C2H6O'});
    expect(bundle.constraints.exactMass).toBeUndefined();
    expect(bundle.constraints.molecularFormula?.candidates).toEqual([]);
  });
  it('MSMS 中性損失須正確乘同價電荷',()=>{
    const s=spectrum('MS',[{id:'prec',x:100,y:100},{id:'prod',x:90.994717658,y:70}]);
    s.msParams={msType:'MS/MS',ionization:'ESI+',precursorMz:100,chargeState:2,isHighResolution:true};
    const losses=new MSMSFragmentationEngine().extractPhysicsModel(s).neutralLosses;
    expect(losses.some(l=>l.possibleIdentity==='H2O'&&Math.abs(l.lossDa-18.010564684)<.001)).toBe(true);
  });
  it('負離子 ToF 不被歸屬為正離子 phenyl',()=>{
    const s=spectrum('MS',[{id:'surface',x:91,y:100}]);
    s.msParams={msType:'ToF-SIMS',ionization:'ToF-SIMS-',tofSims:{polarity:'Negative',primaryIon:'Bi3+',primaryIonEnergyKeV:25,massRange:[0,300],ionDoseRegime:'Static (< 10^12 ions/cm²)',substrateMaterial:'高分子薄膜',surfaceMatrixNote:'Synthetic fixture'}};
    const features=new ToFSIMSScientificEngine().extractPhysicsModel(s).secondaryIonFeatures;
    expect(features[0].polarity).toBe('negative');
    expect(features[0].ionAssignment).not.toContain('C7H7+');
  });
});
