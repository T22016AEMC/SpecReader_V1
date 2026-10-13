import {describe,it,expect} from 'vitest';
import {graphFragments} from '../src/engines/scientificEngines/graphFragmentation';
import {graphChemicalFeatures} from '../src/engines/scientificEngines/graphChemicalFeatures';
describe('分子圖官能基與單鍵裂解假設（非機器學習模型）',()=>{
  it('同分子式酸／酯的圖特徵不同',()=>{
    expect(graphChemicalFeatures('CC(=O)O').acid).toBe(true);
    expect(graphChemicalFeatures('COC=O').acid).toBe(false);
    expect(graphChemicalFeatures('COC=O').ester).toBe(true);
    expect(graphChemicalFeatures('CCO').alcohol).toBe(true);
  });
  it('丙酮可形成乙醯陽離子的守恆組成假設',()=>{
    const acetyl=graphFragments('CC(=O)C').find(f=>f.formula==='C2H3O');
    expect(acetyl).toBeDefined();expect(acetyl!.mz).toBeCloseTo(43.017841136,5);
    expect(graphFragments('C1CCCCC1')).toEqual([]); // A single cut does not detach a ring fragment.
  });
});
