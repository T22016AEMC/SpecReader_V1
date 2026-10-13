import {beforeAll,describe,it,expect} from 'vitest';
import {initializeRDKit,canonicalizeMolecule,matchesSMARTS,rdkitStatus} from '../src/engines/scientificEngines/rdkitAdapter';
import {ChemistryEngine} from '../src/engines/chemistryEngine';
import {ChemicalHardConstraintValidator} from '../src/engines/scientificEngines/chemicalHardConstraintValidator';
beforeAll(async()=>{await initializeRDKit();expect(rdkitStatus().available).toBe(true)},30000);
describe('RDKit 分子圖驗證',()=>{
  it('等價 SMILES、芳香性與核心特徵一致',()=>{
    expect(canonicalizeMolecule('CCO').canonical).toBe(canonicalizeMolecule('OCC').canonical);
    expect(ChemistryEngine.parseStructureInput('CCO').detectedFunctionalGroups).toEqual(ChemistryEngine.parseStructureInput('OCC').detectedFunctionalGroups);
    expect(canonicalizeMolecule('c1ccccc1').canonical).toBe(canonicalizeMolecule('C1=CC=CC=C1').canonical);
  });
  it('拒絕非法價態，保留電荷與立體表示',()=>{
    expect(canonicalizeMolecule('C(C)(C)(C)(C)C').valid).toBe(false);
    expect(canonicalizeMolecule('C[N+](C)(C)C').valid).toBe(true);
    expect(canonicalizeMolecule('N[C@@H](C)C(=O)O').canonical).toContain('@');
    expect(matchesSMARTS('CC(=O)O','[CX3](=O)[OX2H1]')).toBe(true);
    expect(matchesSMARTS('CC(=O)OC','[CX3](=O)[OX2H1]')).toBe(false);
  });
  it('合法正負離子不因「非中性」而硬性排除',()=>{
    for(const smiles of ['C[N+](C)(C)C','CC(=O)[O-]']){
      const s=ChemistryEngine.parseStructureInput(smiles);
      const validated=ChemicalHardConstraintValidator.validateCandidateStructure(smiles,s.molecularFormula);
      expect(validated.validationErrors).toEqual([]);expect(validated.isValid).toBe(true);
    }
  });
});
