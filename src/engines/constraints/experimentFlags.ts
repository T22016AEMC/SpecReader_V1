import {V12_CONFIG} from './v12Config';

/**
 * v1.4.1 stop 20 (B): the smallest experiment switch. The page URL parameter `exp` (comma separated) switches the NEW rule sets of v1.4.0 / v1.4.1 on for ONE page load, so the same deployment can be compared with and
 * without them on a real spectrum, without touching any code:
 *   ?exp=h1       -> useV140H1 and all eight v140 sub-flags (alkene, oxygen, matching, plausibility, coverage, solvent, calibration2, round3) on (the parse fix included)
 *   ?exp=ir       -> useV141IR on (its four groups stay at their defaults, which are on)
 *   ?exp=h1,ir    -> both
 *   ?exp=ir2      -> (v1.4.2) useV142IR on: the IR round-2 rules at their sub-flag defaults, i.e. only ir2.alkeneOOP (four alkene OOP bands + (CH2)n rocking); does NOT imply ir
 *   ?exp=ir2neg   -> (v1.4.2) useV142IR on and ir2.negativeEvidence on (missing nitrile / C-nitro / terminal alkyne band deduction, a default-off sub-flag); alkeneOOP stays at its default (on), so the effective state is both parts
 *   ?exp=ir2neg-nitrile / ir2neg-nitro / ir2neg-alkyne -> (v1.4.2 stop 30) useV142IR on and the negative-evidence rule of ONE group on (v142IR.negNitrile / negNitro / negAlkyne); ir2neg = all three (unchanged)
 *   Any of the names can be combined with commas (?exp=h1,ir,ir2,ir2neg).
 * Anything else in the list is ignored without an error. No parameter = nothing changes. Nothing is stored (no localStorage, no cookie): a reload without the parameter is the default again.
 *
 * The analysis core runs in a Web Worker and V12_CONFIG is a module-level object, so the main thread's switch does NOT reach the worker by itself: the main thread tells every worker which experiments are on
 * (message `{type: 'experiments', names}`, see analysisSession.ts / modeA.worker.ts), and the worker reports the experiments that are really on in ITS OWN configuration (`result.runtime.experiments`).
 */
export type ExperimentName = 'h1' | 'ir' | 'ir2' | 'ir2neg' | 'ir2neg-nitrile' | 'ir2neg-nitro' | 'ir2neg-alkyne';
/** The two experiments of v1.4.1 (kept as it was: tests/v14/v141ExperimentFlags.test.ts pins it). The names recognised in total are ALL_EXPERIMENT_NAMES. */
export const EXPERIMENT_NAMES: readonly ExperimentName[] = ['h1', 'ir'];
/** v1.4.2 (stop 25): the IR round-2 experiments; stop 30 adds the three single-group negative-evidence rules. */
export const EXPERIMENT_NAMES_V142: readonly ExperimentName[] = ['ir2', 'ir2neg', 'ir2neg-nitrile', 'ir2neg-nitro', 'ir2neg-alkyne'];
/** Every recognised name, in the fixed order of the diagnostic line. */
export const ALL_EXPERIMENT_NAMES: readonly ExperimentName[] = [...EXPERIMENT_NAMES, ...EXPERIMENT_NAMES_V142];
/** The words of the diagnostic-summary line "已啟用實驗功能：…". */
export const EXPERIMENT_LABELS: Record<ExperimentName, string> = {h1: '¹H 新規則', ir: 'IR 新規則', ir2: 'IR 第二輪（烯烴面外彎曲）', ir2neg: 'IR 第二輪（負向證據）',
  'ir2neg-nitrile': 'IR 第二輪（負向證據：腈）', 'ir2neg-nitro': 'IR 第二輪（負向證據：硝基）', 'ir2neg-alkyne': 'IR 第二輪（負向證據：末端炔）'};
export type ExperimentConfig = Pick<typeof V12_CONFIG, 'useV140H1' | 'useV141IR' | 'v140'> & Partial<Pick<typeof V12_CONFIG, 'useV142IR' | 'v142IR'>>;
/** stop 30: the three negative-evidence groups, the experiment name and the v142IR sub-flag of each, in the fixed order nitrile, nitro, terminal alkyne. */
export const NEG_GROUPS = [
  {name: 'ir2neg-nitrile', flag: 'negNitrile', label: '腈'},
  {name: 'ir2neg-nitro', flag: 'negNitro', label: '硝基'},
  {name: 'ir2neg-alkyne', flag: 'negAlkyne', label: '末端炔'},
] as const;

/** Keeps the recognised names (lower case, trimmed), drops everything else and duplicates; the result is in the fixed order of EXPERIMENT_NAMES. Never throws. */
export function sanitizeExperimentNames(values: unknown): ExperimentName[] {
  if (!Array.isArray(values)) return [];
  const wanted = new Set(values.filter((v): v is string => typeof v === 'string').map(v => v.trim().toLowerCase()));
  return ALL_EXPERIMENT_NAMES.filter(n => wanted.has(n));
}
/** `location.search` (with or without the leading "?") -> the recognised experiment names. A missing, empty or unrecognised `exp` gives []. Several `exp` parameters are combined. */
export function parseExperimentParam(search: string | null | undefined): ExperimentName[] {
  if (!search) return [];
  let params: URLSearchParams;
  try { params = new URLSearchParams(search); } catch { return []; }
  return sanitizeExperimentNames(params.getAll('exp').flatMap(v => v.split(',')));
}
/** Switches the named experiments on (never off). Returns the names it applied. */
export function applyExperiments(names: unknown, config: ExperimentConfig = V12_CONFIG): ExperimentName[] {
  const list = sanitizeExperimentNames(names);
  if (list.includes('h1')) {
    config.useV140H1 = true;
    Object.assign(config.v140, {alkene: true, oxygen: true, matching: true, plausibility: true, coverage: true, solvent: true, calibration2: true, round3: true, parseFix: true});
  }
  if (list.includes('ir')) config.useV141IR = true;
  const negSingles = NEG_GROUPS.filter(g => list.includes(g.name));
  if (list.includes('ir2') || list.includes('ir2neg') || negSingles.length) config.useV142IR = true;
  if (list.includes('ir2neg') || negSingles.length) {
    if (!config.v142IR) config.v142IR = {...V12_CONFIG.v142IR, negativeEvidence: false, negNitrile: false, negNitro: false, negAlkyne: false};
    if (list.includes('ir2neg')) config.v142IR.negativeEvidence = true;
    for (const g of negSingles) config.v142IR[g.flag] = true;
  }
  return list;
}
/** stop 30: the effective state of each negative-evidence group (parent AND (total sub-flag OR the group's own sub-flag)), in the order nitrile, nitro, terminal alkyne. */
export function negativeEvidenceGroupStates(config: ExperimentConfig = V12_CONFIG): {name: (typeof NEG_GROUPS)[number]['name']; label: string; on: boolean}[] {
  return NEG_GROUPS.map(g => ({name: g.name, label: g.label, on: Boolean(config.useV142IR && (config.v142IR?.negativeEvidence || config.v142IR?.[g.flag]))}));
}
/** The experiments that are on in THIS configuration (the total switch of each rule set), in the fixed order. */
export function activeExperiments(config: ExperimentConfig = V12_CONFIG): ExperimentName[] {
  const neg = negativeEvidenceGroupStates(config), allNeg = neg.every(g => g.on);
  const on: Record<ExperimentName, boolean> = {
    h1: config.useV140H1, ir: config.useV141IR,
    ir2: Boolean(config.useV142IR && (config.v142IR?.alkeneOOP ?? V12_CONFIG.v142IR.alkeneOOP)),   // the effective states of the two parts (parent AND sub-flag)
    ir2neg: allNeg,                                                                                    // all three groups on (the total sub-flag, or the three single flags together)
    'ir2neg-nitrile': !allNeg && neg[0].on, 'ir2neg-nitro': !allNeg && neg[1].on, 'ir2neg-alkyne': !allNeg && neg[2].on,
  };
  return ALL_EXPERIMENT_NAMES.filter(n => on[n]);
}
/** "¹H 新規則／IR 新規則" for the diagnostic summary; '' when nothing is on. */
export function experimentLabelText(names: readonly ExperimentName[] | undefined): string {
  return sanitizeExperimentNames(names ?? []).map(n => EXPERIMENT_LABELS[n]).join('／');
}
/** stop 30: the second diagnostic line, the state of each of the three negative-evidence groups ("負向證據（IR 第二輪）：腈 開／硝基 關／末端炔 關"); '' when none of them is on (the line is then not shown). */
export function negativeEvidenceStateText(names: readonly ExperimentName[] | undefined): string {
  const list = sanitizeExperimentNames(names ?? []);
  const all = list.includes('ir2neg');
  const states = NEG_GROUPS.map(g => ({label: g.label, on: all || list.includes(g.name)}));
  return states.some(s => s.on) ? `負向證據（IR 第二輪）：${states.map(s => `${s.label} ${s.on ? '開' : '關'}`).join('／')}` : '';
}
