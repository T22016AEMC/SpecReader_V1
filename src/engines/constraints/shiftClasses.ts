import {V12_CONFIG, type ShiftClassDef, type ShiftClassId} from './v12Config';

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
}
export const NO_IR: IrAldehydeContext = {present: false, coversAldehydeRegion: false, strongCarbonyl: null};

export interface ClassifyContext {
  solvent: string;
  /** Elements of the formula (heteroatom classes need their element). */
  formulaElements: Set<string>;
  nitrogenAllowed: boolean;
  ir: IrAldehydeContext;
}
export interface ClassMatch {
  classId: ShiftClassId;
  def: ShiftClassDef;
  /** Why the class applies (kept for the diagnostics). */
  reason: string;
}
export interface ClassifyResult {matches: ClassMatch[]; notes: string[]}

const inRange = (v: number, [lo, hi]: [number, number]) => v >= lo && v <= hi;
const classDef = (id: ShiftClassId): ShiftClassDef => V12_CONFIG.shiftClasses.find(c => c.id === id)!;

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
  const hasExchangeableElement = ctx.formulaElements.has('O') || ctx.formulaElements.has('N');
  if (signal.exchangeable) {
    if (!hasExchangeableElement) notes.push(`${signal.observationId}：已標記為可交換，但分子式沒有 O／N`);
    return {matches: hasExchangeableElement ? [{classId: 'EXCHANGEABLE', def: exch, reason: '使用者或既有分類已標記為可交換'}] : [], notes};
  }
  const matches: ClassMatch[] = [];
  const v = signal.shiftPpm;
  for (const def of V12_CONFIG.shiftClasses) {
    if (def.id === 'EXCHANGEABLE' || !inRange(v, def.rangePpm)) continue;
    if (def.heteroatom === 'O' && !ctx.formulaElements.has('O')) { notes.push(`${signal.observationId}：${def.id} 需要 O，分子式沒有`); continue; }
    if (def.heteroatom === 'N' && !(ctx.formulaElements.has('N') && ctx.nitrogenAllowed)) { notes.push(`${signal.observationId}：${def.id} 需要 N（且有 N 證據），不納入`); continue; }
    if (def.id === 'ALDEHYDE' && ctx.ir.present && ctx.ir.coversAldehydeRegion && ctx.ir.strongCarbonyl === false) {
      notes.push(`${signal.observationId}：IR 涵蓋 ${V12_CONFIG.aldehydeIr.rangeCm1.join('–')} cm-1 但沒有強 C=O，刪除 ALDEHYDE 解讀`);
      continue;
    }
    if (def.id === 'ALDEHYDE' && ctx.ir.present && ctx.ir.coversAldehydeRegion && ctx.ir.strongCarbonyl === null) notes.push(`${signal.observationId}：IR 強度未知，保留 ALDEHYDE 解讀`);
    matches.push({classId: def.id, def, reason: `位移 ${v} ppm 在 ${def.id} 範圍 ${def.rangePpm.join('–')}`});
  }
  if (hasExchangeableElement) {
    const ex = V12_CONFIG.exchangeable;
    let reason: string | null = null;
    if (signal.broad && inRange(v, ex.broadRangePpm)) reason = `寬峰且位移在 ${ex.broadRangePpm.join('–')} ppm`;
    else if (v > ex.alwaysAbovePpm) reason = `位移大於 ${ex.alwaysAbovePpm} ppm`;
    else if (signal.multiplicity === 's' && inRange(v, exchangeableSingletRange(ctx.solvent))) reason = `單峰在 ${ctx.solvent || '未知溶劑'} 的 OH 範圍 ${exchangeableSingletRange(ctx.solvent).join('–')} ppm`;
    if (reason) matches.push({classId: 'EXCHANGEABLE', def: exch, reason});
  }
  return {matches, notes};
}
