import {afterAll, afterEach, beforeAll, describe, expect, it} from 'vitest';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {executeSixStepAnalysis} from '../../src/engines/reasoning/sixStepAnalysis';
import {enumerateStructures} from '../../src/engines/enumeration/enumerate';
import {REASON_LABEL} from '../../src/engines/enumeration/compositionPanelModel';
import {ENUMERATION_CONFIG} from '../../src/engines/enumeration/enumerationConfig';
import {canonNoStereo, fixtureSpectra, SHAPE_BUDGET, STEP_ONLY_TIME_MS} from '../helpers/v121Golden';
import {loadV123} from '../helpers/v123Samples';
import {usePreV142Defaults} from '../helpers/v142PreDefaults';
// v1.4.2 stop 36 (E): this file pins results recorded under the defaults before 1.4.2; the new rule sets (on by default since 1.4.2) are switched to their old values here. No expected value changed.
usePreV142Defaults();

// v1.4.2 stop 34 (A, the Q3 root cause of STOP33): in round 1 of an alkene-exception formula, the deferred ester / acetal O–CH readings (present while the IR carbonyl state is
// UNKNOWN, i.e. whenever the IR is not confirmed complete) run AFTER the alkene readings under their own cap (V12_CONFIG.v123.deferredSecondPass / deferredSecondPassMaxStates),
// instead of sharing the round-1 cap with them. SYNTHETIC samples, full flow (executeSixStepAnalysis), step budget only. Each assertion has its "fix switched off" control.
const legacy = ENUMERATION_CONFIG.legacySupplement as {timeMsPerRun: number};
const legacyWas = legacy.timeMsPerRun;
beforeAll(async () => { legacy.timeMsPerRun = STEP_ONLY_TIME_MS; await initializeRDKit(); }, 60000);
afterAll(() => { legacy.timeMsPerRun = legacyWas; });
const was = {pass: V12_CONFIG.v123.deferredSecondPass, cap: V12_CONFIG.v123.deferredSecondPassMaxStates, schedule: V12_CONFIG.v123.deferredSecondPassSchedule};
afterEach(() => { V12_CONFIG.v123.deferredSecondPass = was.pass; V12_CONFIG.v123.deferredSecondPassMaxStates = was.cap; V12_CONFIG.v123.deferredSecondPassSchedule = was.schedule; });

/** The product's IR state: observationCoverage left unset (fixtureSpectra writes CONFIRMED_COMPLETE, which the product never does). */
async function analyse(id: string, irConfirmed: boolean) {
  const f = loadV123(id);
  const sp = fixtureSpectra(f, {denseBaseline: true}) as {IR: {observationCoverage?: string}};
  if (!irConfirmed) delete sp.IR.observationCoverage;
  const r = await executeSixStepAnalysis({spectra: sp as never, extraInput: {}}, SHAPE_BUDGET);
  const t = canonNoStereo(f.targetSmiles), i = r.rankedCandidates.findIndex(x => canonNoStereo(x.smiles) === t);
  const runs = (r.reasoningTrace?.compositionSearch?.runs ?? []) as {formula: string; enumeration?: {incompleteReasons: string[]}}[];
  return {rank: i < 0 ? null : i + 1, count: r.rankedCandidates.length, runs, result: r};
}

describe('Q3 (alkene CH at 5.10 in a two-O formula, IR not confirmed complete)', () => {
  it('the target is generated, at the rank it has when the IR is confirmed complete (3)', async () => {
    const complete = await analyse('Q3', true), unconfirmed = await analyse('Q3', false);
    expect(complete.rank).toBe(3);
    expect(unconfirmed.rank).toBe(complete.rank);
    // the deferred pass is reported with its own reason, not as the round-1 cap
    const target = unconfirmed.runs.find(x => x.formula === 'C8H16O2')!;
    expect(target.enumeration!.incompleteReasons).toContain('ROUND1_DEFERRED_STEP_CAP');
    expect(target.enumeration!.incompleteReasons).not.toContain('ROUND1_STEP_CAP');
    // v1.4.2 stop 36: the candidate count of stop 34 / 35 (243) is pinned too, and the result stays cloneable (the worker posts it: no resumeDeferred function may be left)
    expect(unconfirmed.count).toBe(243);
    expect(() => structuredClone(unconfirmed.result)).not.toThrow();
  }, 300000);
  it('control: with the fix off (one shared pass, v1.2.3 – stop 33) the target is not generated', async () => {
    V12_CONFIG.v123.deferredSecondPass = false;
    expect((await analyse('Q3', false)).rank).toBeNull();
  }, 300000);
  it('the alkene pass alone reproduces the confirmed-complete state exactly (deferred cap 1 step: same rank and candidate count)', async () => {
    V12_CONFIG.v123.deferredSecondPassMaxStates = 1;
    const a = await analyse('Q3', false);
    V12_CONFIG.v123.deferredSecondPassMaxStates = was.cap;
    const complete = await analyse('Q3', true);
    expect(a.rank).toBe(complete.rank);
    expect(a.count).toBe(complete.count);
  }, 300000);
});

describe('M1b (PMA type, a real ester O–CH at 5.09: read only by the deferred pass while the IR is not confirmed)', () => {
  it('the target stays first with the default cap; with the deferred pass starved (1 step) it is lost', async () => {
    expect((await analyse('M1b', false)).rank).toBe(1);
    V12_CONFIG.v123.deferredSecondPassMaxStates = 1;
    expect((await analyse('M1b', false)).rank).toBeNull();
  }, 300000);
});

describe('M7 (the stop-34 count: the deferred pass adds acetal candidates)', () => {
  it('IR not confirmed complete: 160 candidates, the target 5th (stop 34 / 35)', async () => {
    const a = await analyse('M7', false);
    expect(a.count).toBe(160);
    expect(a.rank).toBe(5);
  }, 300000);
});

describe('v1.4.2 stop 36: when the deferred pass runs (deferredSecondPassSchedule)', () => {
  it('the default is ROUND2 (after round 1); with the step-only budget AFTER (stop 34 / 35) gives the same rank and candidate count (Q3)', async () => {
    expect(V12_CONFIG.v123.deferredSecondPassSchedule).toBe('ROUND2');
    const round2 = await analyse('Q3', false);
    V12_CONFIG.v123.deferredSecondPassSchedule = 'AFTER';
    const after = await analyse('Q3', false);
    expect([round2.rank, round2.count]).toEqual([after.rank, after.count]);
    expect(round2.result.rankedCandidates.map(x => x.smiles)).toEqual(after.result.rankedCandidates.map(x => x.smiles));
  }, 300000);
});

describe('pieces', () => {
  it('enumerateStructures `known`: candidates of an earlier call count as found and are returned again, nothing is new', async () => {
    const first = await enumerateStructures({formula: 'C4H10O', budget: {maxStates: 200000, timeMs: STEP_ONLY_TIME_MS}});
    expect(first.candidates.length).toBeGreaterThan(3);
    const again = await enumerateStructures({formula: 'C4H10O', budget: {maxStates: 200000, timeMs: STEP_ONLY_TIME_MS}, known: new Map(first.candidates.map(c => [c.smiles, c.alternativeSetIds]))});
    expect(again.candidates.map(c => c.smiles)).toEqual(first.candidates.map(c => c.smiles));
    expect(again.sets.reduce((a, s) => a + s.newCandidates, 0)).toBe(0);
  }, 60000);
  it('the new reason has words, and the setting is on by default with the measured cap', () => {
    expect(REASON_LABEL.ROUND1_DEFERRED_STEP_CAP.length).toBeGreaterThan(20);
    expect(V12_CONFIG.v123.deferredSecondPass).toBe(true);
    expect(V12_CONFIG.v123.deferredSecondPassMaxStates).toBe(1_000_000);
  });
});
