import {V12_CONFIG, type ShiftClassDef, type ShiftClassId} from './v12Config';
import {v140CoverageActive} from '../composition/planningGate';

/** One 1H signal as the inventory sees it. */
export interface H1Signal {
  observationId: string;
  shiftPpm: number;
  relativeIntegral: number | null;
  multiplicity: string | null;
  broad: boolean;
  /** Automatic solvent candidates: kept in the observations but not part of the inventory. */
  optional: boolean;
  /** The user (or the existing classification) marked this signal as exchangeable: it is always an OH/NH reading (D5). */
  exchangeable?: boolean;
}

/** What the IR spectrum says about the aldehyde carbonyl window (D5). null = unknown. */
export interface IrAldehydeContext {
  present: boolean;
  /** The IR coverage includes the 1680–1740 cm-1 window (same notion as irRangeCovered). */
  coversAldehydeRegion: boolean;
  /** A strong C=O band (relative intensity ≥ aldehydeIr.strongRelativeIntensity of the strongest band) lies in the window; null = intensities unknown. */
  strongCarbonyl: boolean | null;
  /**
   * v1.2.1 (B3): the IR shows a conjugated C=O (a band of at least conjugatedCarbonylIr.strongRelativeIntensity of the strongest band at 1630–1735 cm-1).
   * null = cannot be judged (no IR, peak-table / non-image IR, image IR whose calibration is not trusted or whose intensities are unknown). Only === true relaxes a window.
   */
  conjugatedCarbonyl?: boolean | null;
  /**
   * v1.2.3 (stop 3): the IR facts for the ester O–CH classes, present only while they are on. STRONG: a strong band in esterMethine.carbonylRangeCm1; ABSENT: the IR covers the aldehyde/carbonyl region
   * with known intensities and has none; UNKNOWN: no IR, region not covered or intensities unknown.
   */
  esterCarbonyl?: 'STRONG' | 'ABSENT' | 'UNKNOWN';
}
export const NO_IR: IrAldehydeContext = {present: false, coversAldehydeRegion: false, strongCarbonyl: null, conjugatedCarbonyl: null};

export interface ClassifyContext {
  solvent: string;
  /** Elements of the formula (heteroatom classes need their element). */
  formulaElements: Set<string>;
  nitrogenAllowed: boolean;
  ir: IrAldehydeContext;
  /** v1.2.1 (B3): the shift windows per H count of the classes that have them apply (no-formula path only). */
  vinylWindows?: boolean;
  /** v1.2.3 (stop 3): the ester / acetal O–CH classes may apply (formula O count in oxygenCount). */
  esterMethine?: boolean;
  oxygenCount?: number;
  /** The planning feasibility check (which formulas are searched, in which order) counts only the ester / acetal matches that are ordinary readings; a deferred one must not make a formula look feasible or lower its DBE need. */
  esterPlainOnly?: boolean;
}
export interface ClassMatch {
  classId: ShiftClassId;
  def: ShiftClassDef;
  /** Why the class applies (kept for the diagnostics). */
  reason: string;
  /** v1.2.1 (B3): H counts per atom allowed at this shift (a class with hPerAtomWindows); absent = def.hPerAtom. */
  hPerAtom?: number[];
  /** v1.2.1 (B3): an H count was allowed only by the extended window (conjugated C=O). */
  relaxed?: boolean;
  /** v1.2.3 (stop 3): an ester / acetal O–CH match whose IR gate is UNKNOWN: it waits for round 2 with the alkene readings. */
  deferred?: boolean;
}
export interface ClassifyResult {matches: ClassMatch[]; notes: string[]}

const inRange = (v: number, [lo, hi]: [number, number]) => v >= lo && v <= hi;
const classDef = (id: ShiftClassId): ShiftClassDef => V12_CONFIG.shiftClasses.find(c => c.id === id)!;

/** B3: the H counts per atom a class with hPerAtomWindows allows at this shift; `relaxed` = at least one is allowed only by the extended window. */
export function allowedHPerAtom(def: ShiftClassDef, shiftPpm: number, ir: IrAldehydeContext): {h: number[]; relaxed: boolean} {
  const h: number[] = [];
  let relaxed = false;
  for (const w of def.hPerAtomWindows ?? []) {
    if (inRange(shiftPpm, w.base)) h.push(w.h);
    else if (w.extended && ir.conjugatedCarbonyl === true && inRange(shiftPpm, w.extended)) { h.push(w.h); relaxed = true; }
  }
  return {h: h.sort((a, b) => a - b), relaxed};
}

/** Chemical-shift window in which a singlet may be an OH/NH in this solvent (D5); other or unknown solvents use the union. */
export function exchangeableSingletRange(solvent: string): [number, number] {
  const by = V12_CONFIG.exchangeable.singletRangePpmBySolvent;
  if (by[solvent]) return by[solvent];
  const all = Object.values(by);
  return [Math.min(...all.map(r => r[0])), Math.max(...all.map(r => r[1]))];
}

/**
 * Every shift class one signal can be read as (the overlapping classes each give an alternative). Decisions D5:
 *  - a signal marked exchangeable is only EXCHANGEABLE;
 *  - singlets (sharp ones too) in the solvent's OH window get an additional EXCHANGEABLE reading;
 *  - the ALDEHYDE reading is removed when the IR covers the window 1680–1740 cm-1 and has no strong C=O there.
 */
export function classifySignal(signal: H1Signal, ctx: ClassifyContext): ClassifyResult {
  const notes: string[] = [];
  const exch = classDef('EXCHANGEABLE');
  // v1.4.0 stop 10 (v140.coverage): a thiol S-H is readable when S is the only heteroatom that can carry an exchangeable H (no O, no N)
  const hasExchangeableElement = ctx.formulaElements.has('O') || ctx.formulaElements.has('N') || (v140CoverageActive() && ctx.formulaElements.has('S'));
  if (signal.exchangeable) {
    if (!hasExchangeableElement) notes.push(`${signal.observationId}：已標記為可交換，但分子式沒有 O／N`);
    return {matches: hasExchangeableElement ? [{classId: 'EXCHANGEABLE', def: exch, reason: '使用者或既有分類已標記為可交換'}] : [], notes};
  }
  const matches: ClassMatch[] = [];
  const v = signal.shiftPpm;
  for (const def of V12_CONFIG.shiftClasses) {
    const windows = Boolean(ctx.vinylWindows) && Boolean(def.hPerAtomWindows);
    const allowed = windows ? allowedHPerAtom(def, v, ctx.ir) : null;
    if (def.id === 'EXCHANGEABLE' || (allowed ? allowed.h.length === 0 : !inRange(v, def.rangePpm))) continue;
    if (def.heteroatom === 'O' && !ctx.formulaElements.has('O')) { notes.push(`${signal.observationId}：${def.id} 需要 O，分子式沒有`); continue; }
    if (def.heteroatom === 'N' && !(ctx.formulaElements.has('N') && ctx.nitrogenAllowed)) { notes.push(`${signal.observationId}：${def.id} 需要 N（且有 N 證據），不納入`); continue; }
    if (def.id === 'ALDEHYDE' && ctx.ir.present && ctx.ir.coversAldehydeRegion && ctx.ir.strongCarbonyl === false) {
      notes.push(`${signal.observationId}：IR 涵蓋 ${V12_CONFIG.aldehydeIr.rangeCm1.join('–')} cm-1 但沒有強 C=O，刪除 ALDEHYDE 解讀`);
      continue;
    }
    if (def.id === 'ALDEHYDE' && ctx.ir.present && ctx.ir.coversAldehydeRegion && ctx.ir.strongCarbonyl === null) notes.push(`${signal.observationId}：IR 強度未知，保留 ALDEHYDE 解讀`);
    matches.push(allowed
      ? {classId: def.id, def, reason: `位移 ${v} ppm 在 ${def.id} 的視窗內（每原子 H 數 ${allowed.h.join('、')}${allowed.relaxed ? '；放寬窗依 IR 共軛 C=O' : ''}）`, hPerAtom: allowed.h, ...(allowed.relaxed ? {relaxed: true} : {})}
      : {classId: def.id, def, reason: `位移 ${v} ppm 在 ${def.id} 範圍 ${def.rangePpm.join('–')}`});
  }
  // v1.4.0 stop 10 (useV140H1 and v140.coverage): classes for the windows no class of the table read (V12_CONFIG.v140Coverage). A class that needs an element applies only when the formula has it.
  if (v140CoverageActive()) {
    const el = ctx.formulaElements;
    const has = (r?: string) => !r || (r === 'HAL' ? ['F', 'Cl', 'Br', 'I'].some(x => el.has(x)) : r === 'N' ? el.has('N') && ctx.nitrogenAllowed : r === 'NO' ? el.has('N') && el.has('O') : el.has(r));
    for (const def of V12_CONFIG.v140Coverage.classes) {
      if (!inRange(v, def.rangePpm)) continue;
      if (!has(def.requires)) { notes.push(`${signal.observationId}：${def.id} 需要 ${def.requires}，分子式（或證據）沒有`); continue; }
      matches.push({classId: def.id, def, reason: `位移 ${v} ppm 在 ${def.id} 範圍 ${def.rangePpm.join('–')}`});
    }
  }
  // v1.2.3 (stop 3): ester / acetal O–CH (see V12_CONFIG.esterMethine for the sources and the gate).
  if (ctx.esterMethine && (ctx.oxygenCount ?? 0) >= V12_CONFIG.esterMethine.minOxygen && ctx.ir.esterCarbonyl !== 'ABSENT') {
    for (const c of V12_CONFIG.esterMethine.classes) {
      const deferred = c.alwaysDeferred || ctx.ir.esterCarbonyl !== 'STRONG';
      if (deferred && ctx.esterPlainOnly) continue;
      const hs = c.windows.filter(w => inRange(v, w.rangePpm)).map(w => w.h);
      if (!hs.length) continue;
      const def: ShiftClassDef = {id: c.id, rangePpm: [Math.min(...c.windows.map(w => w.rangePpm[0])), Math.max(...c.windows.map(w => w.rangePpm[1]))], hPerAtom: hs, hybrid: null, exchangeable: false, heteroatom: 'O', basis: c.basis};
      matches.push({classId: c.id, def, reason: `位移 ${v} ppm 在 ${c.id} 的視窗內（每原子 H 數 ${hs.join('、')}；${deferred ? 'IR 沒有羰基證據也沒有矛盾：與烯基讀法一起放第二輪' : 'IR 有強 C=O 帶'}）`, hPerAtom: hs, ...(deferred ? {deferred: true} : {})});
    }
  }
  if (hasExchangeableElement) {
    const ex = V12_CONFIG.exchangeable;
    let reason: string | null = null;
    const broadRange: [number, number] = v140CoverageActive() ? [Math.min(ex.broadRangePpm[0], V12_CONFIG.v140Coverage.exchangeableBroadLowPpm), ex.broadRangePpm[1]] : ex.broadRangePpm;
    if (signal.broad && inRange(v, broadRange)) reason = `寬峰且位移在 ${broadRange.join('–')} ppm`;
    else if (v > ex.alwaysAbovePpm) reason = `位移大於 ${ex.alwaysAbovePpm} ppm`;
    else if (signal.multiplicity === 's' && inRange(v, exchangeableSingletRange(ctx.solvent))) reason = `單峰在 ${ctx.solvent || '未知溶劑'} 的 OH 範圍 ${exchangeableSingletRange(ctx.solvent).join('–')} ppm`;
    if (reason) matches.push({classId: 'EXCHANGEABLE', def: exch, reason});
  }
  return {matches, notes};
}
