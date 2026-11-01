import {beforeAll, describe, expect, it} from 'vitest';
import {initializeRDKit, matchingSMARTS} from '../../src/engines/scientificEngines/rdkitAdapter';
import {BRIDGE_LIMITS, FORBIDDEN_FRAGMENTS, bridgeFragments} from '../../src/engines/constraints/forbiddenFragments';
import {enumerateStructures} from '../../src/engines/enumeration';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';

// v1.2.1 B1: a benzene ring may not be bridged across its para positions by ≤ 4 atoms or across its meta positions by ≤ 3 atoms.
// The SMILES are generic textbook molecules (the lists of P2A_REPORT appendix B; the appendix prints 31 "not blocked" lines although its text says 29 — all 31 are checked).
beforeAll(() => initializeRDKit(), 60000);

const hits = (smiles: string): string[] => (matchingSMARTS(smiles, FORBIDDEN_FRAGMENTS.map(f => f.smarts)) ?? []).map(i => FORBIDDEN_FRAGMENTS[i].id);
const bridgeHits = (smiles: string): string[] => hits(smiles).filter(id => /^(PARA|META)_BRIDGE_/.test(id));

describe('B1 the generated SMARTS', () => {
  it('7 patterns: PARA_BRIDGE_1…4 and META_BRIDGE_1…3, exactly as designed', () => {
    expect(BRIDGE_LIMITS).toEqual({para: 4, meta: 3});
    const list = bridgeFragments();
    expect(list.map(f => f.id)).toEqual(['PARA_BRIDGE_1', 'PARA_BRIDGE_2', 'PARA_BRIDGE_3', 'PARA_BRIDGE_4', 'META_BRIDGE_1', 'META_BRIDGE_2', 'META_BRIDGE_3']);
    expect(list.map(f => f.smarts)).toEqual([
      'c12ccc(cc1)~*~2', 'c12ccc(cc1)~*~*~2', 'c12ccc(cc1)~*~*~*~2', 'c12ccc(cc1)~*~*~*~*~2',
      'c12cc(ccc1)~*~2', 'c12cc(ccc1)~*~*~2', 'c12cc(ccc1)~*~*~*~2',
    ]);
    for (const f of list) { expect(f.source).toBe('工程判斷，未查證'); expect(f.stage).toBe('LEAF'); }
    // the production list contains all 7 plus the B2 pattern
    expect(FORBIDDEN_FRAGMENTS.map(f => f.id)).toEqual(expect.arrayContaining(list.map(f => f.id)));
    expect(FORBIDDEN_FRAGMENTS.map(f => f.id)).toContain('CYCLIC_HYDROXY_ORTHOESTER');
  });
});

describe('B1 must block (8)', () => {
  const must: [string, string, string][] = [
    ['[4]paracyclophane (b=4)', 'C1CCCc2ccc1cc2', 'PARA_BRIDGE_4'],
    ['[3]paracyclophane (b=3)', 'C1CCc2ccc1cc2', 'PARA_BRIDGE_3'],
    ['[2]paracyclophane (b=2)', 'C1Cc2ccc1cc2', 'PARA_BRIDGE_2'],
    ['para bridge with an ether chain (b=4)', 'C1COCc2ccc1cc2', 'PARA_BRIDGE_4'],
    ['para bridge with a ketone (b=3)', 'O=C1CCc2ccc1cc2', 'PARA_BRIDGE_3'],
    ['[3]metacyclophane (b=3)', 'C1CCc2cccc1c2', 'META_BRIDGE_3'],
    ['[2]metacyclophane (b=2)', 'C1Cc2cccc1c2', 'META_BRIDGE_2'],
    ['meta O–CH2–O bridge (b=3)', 'C1Oc2cccc(c2)O1', 'META_BRIDGE_3'],
  ];
  for (const [name, smiles, id] of must) it(`${name}: ${smiles} → ${id}`, () => { expect(hits(smiles)).toContain(id); });
});

describe('B1 must not block (31)', () => {
  const must: [string, string][] = [
    ['[2.2]paracyclophane (known compound; its 1,4 path runs through the second ring, 8 atoms)', 'C1Cc2ccc(CCc3ccc1cc3)cc2'],
    ['[2.2]metacyclophane (same reason)', 'C1Cc2cccc(CCc3cccc1c3)c2'],
    ['benzonorbornene (ortho)', 'c1ccc2c(c1)C1CCC2C1'],
    ['triptycene', 'c1ccc2c(c1)C1c3ccccc3C2c2ccccc12'],
    ['naphthalene', 'c1ccc2ccccc2c1'],
    ['anthracene', 'c1ccc2cc3ccccc3cc2c1'],
    ['phenanthrene', 'c1ccc2c(c1)ccc1ccccc12'],
    ['pyrene', 'c1cc2ccc3cccc4ccc(c1)c2c34'],
    ['triphenylene', 'c1ccc2c(c1)c1ccccc1c1ccccc21'],
    ['tetralin', 'c1ccc2CCCCc2c1'],
    ['indane', 'c1ccc2CCCc2c1'],
    ['acenaphthene', 'C1Cc2cccc3cccc1c23'],
    ['biphenyl', 'c1ccc(cc1)-c1ccccc1'],
    ['2-phenylpyridine', 'c1ccc(cc1)-c1ccccn1'],
    ['indole', 'c1ccc2[nH]ccc2c1'],
    ['carbazole', 'c1ccc2c(c1)[nH]c1ccccc12'],
    ['dibenzofuran', 'c1ccc2c(c1)oc1ccccc12'],
    ['fluorene', 'c1ccc2c(c1)Cc1ccccc12'],
    ['benzo-15-crown-5', 'C1COCCOc2ccccc2OCCOCCO1'],
    ['[6]paracyclophane (b=6)', 'C1CCCCCc2ccc1cc2'],
    ['[5]paracyclophane (b=5, outside the spec)', 'C1CCCCc2ccc1cc2'],
    ['[4]metacyclophane (b=4, outside the spec)', 'C1CCCc2cccc1c2'],
    ['m-xylene', 'Cc1cccc(C)c1'],
    ['p-cymene', 'CC(C)c1ccc(C)cc1'],
    ['bisphenol A (S1 target)', 'CC(C)(c1ccc(O)cc1)c1ccc(O)cc1'],
    ['diethyl terephthalate (D1 target)', 'CCOC(=O)c1ccc(C(=O)OCC)cc1'],
    ['ethyl 4-methylbenzoate (E1 target)', 'CCOC(=O)c1ccc(C)cc1'],
    ['1,4-bis(benzyloxy)benzene', 'c1ccc(COc2ccc(OCc3ccccc3)cc2)cc1'],
    ['long macrocycle, 1,4 bridge b=10', 'C1CCCCCCCCCCc2ccc1cc2'],
    ['1,3-benzodioxole (ortho-fused)', 'c1ccc2OCOc2c1'],
    ['quinoline', 'c1ccc2ncccc2c1'],
  ];
  for (const [name, smiles] of must) it(`${name}: ${smiles}`, () => { expect(hits(smiles), smiles).toEqual([]); });
});

describe('B1 in the enumerator', () => {
  it('C8H8 (pure formula): the short para/meta bridges are not produced while the rule is on; with the sub-switch off the same molecule class is a candidate', async () => {
    // C8H8 contains [2]paracyclophane C1Cc2ccc1cc2 (b=2) and [2]metacyclophane C1Cc2cccc1c2 among its isomers
    const run = async () => enumerateStructures({formula: 'C8H8', budget: {maxStates: 5e7, timeMs: 180000}});
    const on = await run();
    expect(on.candidates.map(c => c.smiles).filter(s => bridgeHits(s).length)).toEqual([]);
    const byId = on.stats.rejected.v12?.forbiddenById ?? {};
    expect(Object.keys(byId).some(id => id.startsWith('PARA_BRIDGE_') || id.startsWith('META_BRIDGE_'))).toBe(true);
    V12_CONFIG.planning.forbiddenFragments = false;
    try {
      const off = await run();
      expect(off.candidates.map(c => c.smiles).filter(s => bridgeHits(s).length).length).toBeGreaterThan(0);
      // the list removes exactly the molecules that contain a listed fragment
      const removed = off.candidates.map(c => c.smiles).filter(s => !on.candidates.some(c => c.smiles === s));
      expect(removed.every(s => hits(s).length > 0)).toBe(true);
    } finally { V12_CONFIG.planning.forbiddenFragments = true; }
  }, 360000);
});
