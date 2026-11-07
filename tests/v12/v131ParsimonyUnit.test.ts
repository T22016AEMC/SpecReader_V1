import {describe, expect, it} from 'vitest';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {hasExtraEvidence, multipleOf, parsimonyPenalties} from '../../src/engines/scientificEngines/parsimonyPrior';
import type {ParsimonyInput} from '../../src/engines/scientificEngines/parsimonyPrior';
import type {ScoreLedgerEntry} from '../../src/engines/scientificEngines/evidenceLedger';

// v1.3.1 (A): the parsimony prior on hand-made ledger entries (no pipeline). Numbers: V12_CONFIG.parsimonyV131 (window 2, penalty 1; engineering judgement).
const entry = (id: string, compatibility: number | null, weight = 0.85, modality: ScoreLedgerEntry['sourceModality'] = 'IR'): ScoreLedgerEntry =>
  ({evidenceId: id, observationIds: [id], sourceModality: modality, compatibility, weight, contribution: weight * (compatibility ?? 0), method: 'm', limitations: []});
const item = (key: string, total: number, hydrogensPerUnit: number | null, entries: ScoreLedgerEntry[]): ParsimonyInput => ({key, total, hydrogensPerUnit, entries});
const same = [entry('a', 0.9), entry('b', 0.8), entry('c', 0.2)];
const P = V12_CONFIG.parsimonyV131;

describe('multipleOf', () => {
  it('integer ratios >= 2 only', () => {
    expect(multipleOf(2, 1)).toBe(2); expect(multipleOf(3.05, 1)).toBe(3); expect(multipleOf(6, 2)).toBe(3);
    expect(multipleOf(1, 1)).toBeNull(); expect(multipleOf(1.5, 1)).toBeNull(); expect(multipleOf(1, 2)).toBeNull(); expect(multipleOf(0, 1)).toBeNull();
  });
});
describe('parsimonyPenalties', () => {
  it('the numbers are the documented ones and the penalty cannot exceed the window', () => { expect(P.windowPoints).toBe(2); expect(P.penaltyPoints).toBe(1); expect(P.penaltyPoints).toBeLessThanOrEqual(P.windowPoints); });
  it('a multiple within the window of the monomer, with no extra evidence, loses the penalty; the monomer does not', () => {
    const r = parsimonyPenalties([item('mono', 68.4, 1, same), item('dimer', 68.9, 2, same), item('trimer', 67.8, 3, same)]);
    expect(r.get('mono')!.penalty).toBe(0);
    expect(r.get('dimer')).toMatchObject({penalty: 1, baseKey: 'mono', multiple: 2, exempt: false});
    expect(r.get('trimer')).toMatchObject({penalty: 1, baseKey: 'mono', multiple: 3});
  });
  it('a clear gap is never touched: a multiple that is more than the window above (or below) keeps its score', () => {
    const r = parsimonyPenalties([item('mono', 60, 1, same), item('dimer', 62.5, 2, same), item('trimer', 56, 3, same)]);
    expect(r.get('dimer')!.penalty).toBe(0); expect(r.get('trimer')!.penalty).toBe(0);
  });
  it('a gap inside the window but larger than the penalty is not overturned (3 points above the monomer stays above after one point)', () => {
    const r = parsimonyPenalties([item('mono', 60, 1, same), item('dimer', 61.9, 2, same)]);
    expect(61.9 - r.get('dimer')!.penalty).toBeGreaterThan(60);
  });
  it('extra evidence exempts: the multiple explains an observation the monomer cannot (a 1H environment or a functional-group band)', () => {
    const mono = [entry('a', 0.9), entry('h1:1.62', 0, 0.8, '1H_NMR')], dimer = [entry('a', 0.9), entry('h1:1.62', 0.95, 0.8, '1H_NMR')];
    expect(hasExtraEvidence(dimer, mono)).toBe(true);
    const r = parsimonyPenalties([item('mono', 70, 1, mono), item('dimer', 70.5, 2, dimer)]);
    expect(r.get('dimer')).toMatchObject({penalty: 0, exempt: true, baseKey: 'mono'});
    // an observation both explain, or one the multiple explains only weakly, or a negligible weight, is not extra evidence
    expect(hasExtraEvidence([entry('a', 0.9)], [entry('a', 0.8)])).toBe(false);
    expect(hasExtraEvidence([entry('a', 0.5)], [entry('a', 0)])).toBe(false);
    expect(hasExtraEvidence([entry('a', 0.9, 0.1)], [entry('a', 0)])).toBe(false);
  });
  it('an observation the monomer has no entry for counts as unexplained; two-way summary lines (display) never count', () => {
    expect(hasExtraEvidence([entry('z', 0.9)], [entry('a', 0.9)])).toBe(true);
    expect(hasExtraEvidence([{...entry('z', 0.9), display: 'x'}], [])).toBe(false);
  });
  it('unknown scale (fewer than two matched signals) takes no part', () => {
    const r = parsimonyPenalties([item('mono', 68, 1, same), item('dimer', 68, null, same)]);
    expect(r.get('dimer')!.penalty).toBe(0);
  });
  it('equal size candidates (same hydrogens per unit) are not multiples of each other', () => {
    const r = parsimonyPenalties([item('a', 68, 1, same), item('b', 68.2, 1, same), item('c', 68.1, 1.1, same)]);
    for (const k of ['a', 'b', 'c']) expect(r.get(k)!.penalty).toBe(0);
  });
});
