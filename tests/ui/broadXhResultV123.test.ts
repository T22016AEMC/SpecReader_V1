import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import {executeSixStepAnalysis} from '../../src/engines/reasoning/sixStepAnalysis';
import {buildDataCheck} from '../../src/ui/dataCheck';
import {buildDiagnosticSummary, type DiagnosticInput} from '../../src/ui/diagnosticSummary';
import {filterIrEvidence, hiddenNotice, IR_WEAK_RULE, type FunctionalGroupRow, type IrFindingRow} from '../../src/ui/irEvidenceFilter';
import {fixtureSpectra} from '../helpers/v121Golden';
import {loadV123} from '../helpers/v123Samples';

// v1.2.3 stop 4 (4.1): the result page with the v1.2.3 flag ON. tests/ui/s1Analysis.ts runs the old UI tests with useV123 = false (they were written for the 1.2.2 analysis of S1), so this file is the
// one that exercises the flag-on path of the display layer: an isolated broad O–H / N–H band of a SYNTHETIC sample (P2: p-cresol with a broad 3338 band and the ¹H OH peak; P4: the single-broad-peak
// shape of the user's case, rebuilt synthetically) must not be hidden as "IR 證據不足", and the diagnostic summary must report the same shown / hidden counts. Nothing real is used.
const BROAD_GROUPS = ['酚 O–H', '可能分子內氫鍵 OH', '氫鍵 O–H', '一級胺 N–H', '二級胺 N–H'];
const BUDGET = {timeMs: 3_600_000, maxStates: 20_000}; // the functional-group / IR-finding part does not depend on the budget; step budget only so nothing depends on the machine's speed
let was: boolean;
beforeAll(() => { was = V12_CONFIG.useV123; V12_CONFIG.useV123 = true; });
afterAll(() => { V12_CONFIG.useV123 = was; });

async function resultPage(id: string) {
  await initializeRDKit();
  expect(V12_CONFIG.useV123).toBe(true);
  const spectra = fixtureSpectra(loadV123(id), {denseBaseline: true}) as Record<string, any>;
  const r = await executeSixStepAnalysis({spectra, extraInput: {}}, BUDGET);
  const rows = r.modeAReport!.constraints.functionalGroups as FunctionalGroupRow[];
  const findings = r.modeAReport!.irFindings as unknown as IrFindingRow[];
  const summaryOf = (filter: ReturnType<typeof filterIrEvidence>) => buildDiagnosticSummary({
    generatedAt: '2026-11-02 12:00', appVersion: '1.2.3-test', resultIsCurrent: true,
    dataCheck: buildDataCheck({'1H_NMR': spectra['1H_NMR'], IR: spectra.IR}),
    h1Peaks: spectra['1H_NMR'].peaks.map((p: any) => ({position: p.position ?? p.x, integration: p.integration, multiplicity: p.multiplicity, jValues: p.jValues})),
    irPeaks: spectra.IR.peaks.map((p: any) => ({position: p.position ?? p.x, broad: Boolean(p.isBroad)})),
    irCalibrationText: '數值檔，無需校正',
    hiddenIrGroups: filter.hiddenCount, shownIrGroups: filter.shownCount,
    panel: undefined, composition: undefined, observations: [], topCandidates: [],
  } as unknown as DiagnosticInput);
  return {rows, findings, summaryOf, spectra};
}

describe.each(['P2', 'P4'])('flag ON, synthetic sample %s: isolated broad O–H / N–H is not hidden as "IR 證據不足"', id => {
  it('the broad 3338 band is in the sample as a single broad IR peak (the situation under test)', async () => {
    const {spectra} = await resultPage(id);
    const broad = spectra.IR.peaks.filter((p: any) => p.isBroad);
    expect(broad.map((p: any) => p.position ?? p.x)).toEqual([3338]);
  }, 60000);
  it('every broad O–H / N–H group is shown with reason BROAD_XH and none of them is in the hidden list', async () => {
    const {rows, findings} = await resultPage(id);
    const f = filterIrEvidence(rows, findings);
    const present = f.groups.filter(g => BROAD_GROUPS.includes(g.name));
    expect(present.map(g => g.name).sort()).toEqual([...BROAD_GROUPS].sort());
    for (const g of present) { expect(g.hidden, g.name).toBe(false); expect(g.reason, g.name).toBe('BROAD_XH'); }
    expect(f.hidden.map(g => g.name).filter(n => BROAD_GROUPS.includes(n))).toEqual([]);
    expect(f.shownCount + f.hiddenCount).toBe(f.total);
  }, 60000);
  it('bypass check: with the A8 window emptied (the 1.2.2 rule) the same groups ARE hidden, so the test above is not vacuous', async () => {
    const {rows, findings} = await resultPage(id);
    const old = filterIrEvidence(rows, findings, {...IR_WEAK_RULE, broadXhRangeCm1: [0, 0]});
    const now = filterIrEvidence(rows, findings);
    expect(old.hidden.map(g => g.name).filter(n => BROAD_GROUPS.includes(n)).length).toBeGreaterThan(0);
    expect(now.hiddenCount).toBeLessThan(old.hiddenCount);
    expect(hiddenNotice(now)).toContain(`另有 ${now.hiddenCount} 項 IR 證據不足的官能基`);
  }, 60000);
  it('the diagnostic summary IR line carries the filter\'s shown / hidden counts (broad O–H / N–H counted as shown)', async () => {
    const {rows, findings, summaryOf} = await resultPage(id);
    const f = filterIrEvidence(rows, findings);
    const line = summaryOf(f).split('\n').find(l => l.startsWith('- 官能基（IR）：'))!;
    expect(line).toBe(`- 官能基（IR）：顯示 ${f.shownCount} 項；因 IR 證據不足而隱藏 ${f.hiddenCount} 項（只是顯示層篩選，匯出與本摘要的資料不變）`);
    const old = filterIrEvidence(rows, findings, {...IR_WEAK_RULE, broadXhRangeCm1: [0, 0]});
    expect(summaryOf(old).split('\n').find(l => l.startsWith('- 官能基（IR）：'))).not.toBe(line);
    // the only groups that change from hidden to shown are the broad O–H / N–H ones
    expect(old.hiddenCount - f.hiddenCount).toBe(old.hidden.filter(g => BROAD_GROUPS.includes(g.name)).length);
    expect(f.hidden.map(g => g.name).sort()).toEqual(old.hidden.filter(g => !BROAD_GROUPS.includes(g.name)).map(g => g.name).sort());
  }, 60000);
});
