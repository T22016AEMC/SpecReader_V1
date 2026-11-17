import {describe, expect, it} from 'vitest';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {activeExperiments, applyExperiments, type ExperimentConfig} from '../../src/engines/constraints/experimentFlags';
import {PRE_V142_DEFAULTS} from '../helpers/v142PreDefaults';

// v1.4.2 stop 36 (E): the planner's defaults for 1.4.2. On: everything ?exp=h1, ?exp=ir and ?exp=ir2 switched on. Off: the IR negative evidence (ir2neg and its three groups).
describe('1.4.2 defaults', () => {
  it('h1: useV140H1 and every v140 sub-flag (parse fix and round3 included) are on', () => {
    expect(V12_CONFIG.useV140H1).toBe(true);
    for (const k of ['alkene', 'oxygen', 'matching', 'plausibility', 'coverage', 'solvent', 'calibration2', 'round3', 'parseFix'] as const) expect(V12_CONFIG.v140[k], k).toBe(true);
  });
  it('ir: useV141IR and its four groups are on', () => {
    expect(V12_CONFIG.useV141IR).toBe(true);
    for (const k of ['alkylBend', 'esterCO', 'ringCarbonyl', 'sp2CH'] as const) expect(V12_CONFIG.v141IR[k], k).toBe(true);
  });
  it('ir2: useV142IR and alkeneOOP are on; the negative evidence and its three groups are off', () => {
    expect(V12_CONFIG.useV142IR).toBe(true);
    expect(V12_CONFIG.v142IR.alkeneOOP).toBe(true);
    for (const k of ['negativeEvidence', 'negNitrile', 'negNitro', 'negAlkyne'] as const) expect(V12_CONFIG.v142IR[k], k).toBe(false);
  });
  it('the defaults equal what ?exp=h1,ir,ir2 switched on from the defaults before 1.4.2, and they report h1, ir and ir2 (not ir2neg)', () => {
    const old = structuredClone({...PRE_V142_DEFAULTS, v140: {...PRE_V142_DEFAULTS.v140}, v142IR: {...V12_CONFIG.v142IR}}) as unknown as ExperimentConfig;
    applyExperiments(['h1', 'ir', 'ir2'], old);
    expect({h1: old.useV140H1, ir: old.useV141IR, ir2: old.useV142IR, v140: old.v140}).toEqual({h1: V12_CONFIG.useV140H1, ir: V12_CONFIG.useV141IR, ir2: V12_CONFIG.useV142IR, v140: V12_CONFIG.v140});
    expect(activeExperiments(V12_CONFIG)).toEqual(['h1', 'ir', 'ir2']);
  });
});
