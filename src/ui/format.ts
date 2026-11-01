/**
 * Display-layer number formatting (v1.2.2 UI redesign, docs: notes/v1.2.2/DESIGN_REPORT.md B1.6).
 * Pure functions that only change how a number is SHOWN; no calculation, no export content is touched.
 */
const MISSING = '—';
const finite = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

/** Candidate score, per-spectrum score, overall consistency: whole numbers (69.72911737907232 → 70). */
export const fmtScore = (v: number | null | undefined): string => (finite(v) ? String(Math.round(v)) : MISSING);
/** "78/100" as printed on the conclusion card. */
export const fmtScoreOf100 = (v: number | null | undefined): string => (finite(v) ? `${Math.round(v)}/100` : MISSING);
/** One compatibility value of 0…1, two decimals (0.9794354838709677 → 0.98). */
export const fmtCompat = (v: number | null | undefined): string => (finite(v) ? v.toFixed(2) : MISSING);
/** ¹H shift: two decimals, trailing zeros kept (7.1 → 7.10). */
export const fmtShift1H = (v: number | null | undefined): string => (finite(v) ? v.toFixed(2) : MISSING);
/** ¹³C shift: one decimal, a whole number stays whole (65 → 65). */
export const fmtShift13C = (v: number | null | undefined): string => (finite(v) ? String(Number(v.toFixed(1))) : MISSING);
/** IR wavenumber or width in cm⁻¹: whole numbers (540.2727272727275 → 540). */
export const fmtWavenumber = (v: number | null | undefined): string => (finite(v) ? String(Math.round(v)) : MISSING);
/** NMR integral: one decimal, a whole number stays whole (2 → 2, 2.04 → 2). */
export const fmtIntegral = (v: number | null | undefined): string => (finite(v) ? String(Number(v.toFixed(1))) : MISSING);
/** m/z: nominal values as they are; high resolution keeps four decimals. */
export const fmtMz = (v: number | null | undefined, highResolution = false): string => (finite(v) ? (highResolution ? v.toFixed(4) : String(Number(v.toFixed(2)))) : MISSING);

/**
 * Shortens every number with three or more decimals inside free text (the engine writes e.g. "寬度 540.2727272727275" or "69.72911737907232/100").
 * Numbers of 100 or more become whole numbers, the others keep two decimals. A number that follows "m/z" or is followed by "Da" is a mass and is left alone.
 */
export function shortenNumbers(text: string): string {
  return text.replace(/(\d+\.\d{3,})/g, (match: string, _g: string, offset: number) => {
    const before = text.slice(Math.max(0, offset - 6), offset);
    const after = text.slice(offset + match.length, offset + match.length + 3);
    if (/m\/z\s*$/.test(before) || /^\s*Da/.test(after)) return match;
    const v = Number(match);
    return Math.abs(v) >= 100 ? String(Math.round(v)) : String(Number(v.toFixed(2)));
  });
}
