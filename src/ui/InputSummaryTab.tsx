import React from 'react';
import type {CalibrationLevel} from './calibrationStatus';

/**
 * 「輸入與校正」 tab of the result page (v1.2.2 P3 + P6): a complete read-only summary per loaded spectrum — calibration status and method,
 * peak table (folded, first 20 rows + 「展開全部」), solvent, frequency, the IR baseline version, and a link to page 2 per spectrum.
 * Display only; the buttons only switch the page.
 */
export interface InputPeakRow {
  id: string;
  /** Position with its unit, already rounded for display (「3350 cm⁻¹」「7.08 ppm」「m/z 105」). */
  position: string;
  intensity: string;
  /** NMR: integral, multiplicity, J; IR: broad/narrow; any: 「像素」 while the mark is not calibrated. */
  detail: string;
}

export interface InputSummaryRow {
  key: string;
  label: string;
  fileName: string;
  peakCount: number;
  /** Chip text of the calibration status (also names the method: 兩點／三點／分段). */
  calibrationLabel: string;
  calibrationDetail: string;
  level: CalibrationLevel;
  peaks: InputPeakRow[];
  /** NMR only. */
  solvent?: string;
  /** ¹H only: null = not declared. */
  frequencyMHz?: number | null;
  /** IR only: the five-point baseline setting version the analysis used (the fixed data-check line carries the `ir-analysis-version` marker). */
  irBaselineText?: string | null;
}

const LEVEL_CLASS: Record<CalibrationLevel, string> = {
  ok: 'border-emerald-500/30 bg-emerald-950/40 text-emerald-300',
  info: 'border-cyan-500/30 bg-cyan-950/40 text-cyan-300',
  warn: 'border-amber-500/50 bg-amber-950/50 text-amber-300',
};
const PEAK_LIMIT = 20;
const BTN = 'rounded-lg border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-medium text-slate-200 hover:bg-slate-700';

export function InputSummaryTab({rows, unprovidedText, onGoPage1, onGoPage2}: {rows: InputSummaryRow[]; unprovidedText: string | null; onGoPage1: () => void; onGoPage2: (key?: string) => void}) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/80 p-4" data-testid="input-summary">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-100">輸入與校正（唯讀摘要）</h2>
        <div className="flex gap-2">
          <button type="button" onClick={onGoPage1} className={BTN}>到第 1 頁修改標記</button>
          <button type="button" onClick={() => onGoPage2()} className={BTN}>到第 2 頁調整校正</button>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 text-xs text-slate-400">尚未載入任何光譜。</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map(r => (
            <li key={r.key} data-testid={`input-summary-${r.key}`} className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-xs">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-mono text-sm font-bold text-cyan-300">{r.label}</span>
                <span className="text-slate-300">{r.fileName}</span>
                <span className="text-slate-400">{r.peakCount} 個峰</span>
                <span className={`rounded border px-2 py-0.5 font-semibold ${LEVEL_CLASS[r.level]}`}>{r.calibrationLabel}</span>
                <button type="button" onClick={() => onGoPage2(r.key)} className="ml-auto text-[11px] font-semibold text-cyan-300 underline hover:text-cyan-200">到第 2 頁調整</button>
              </div>
              <p className="mt-1 text-slate-400">{r.calibrationDetail}</p>
              {(r.solvent !== undefined || r.frequencyMHz !== undefined) && (
                <p className="mt-1 text-slate-300">
                  {r.solvent !== undefined && <>溶劑：{r.solvent && r.solvent !== 'Unknown' ? r.solvent : <span className="text-cyan-300">未宣告</span>}</>}
                  {r.solvent !== undefined && r.frequencyMHz !== undefined && '　'}
                  {r.frequencyMHz !== undefined && <>頻率：{r.frequencyMHz ? `${r.frequencyMHz} MHz` : <span className="text-cyan-300">未宣告，程式以 400 MHz 計算</span>}</>}
                </p>
              )}
              {r.irBaselineText && <p className="mt-1 text-amber-200">五點基線：{r.irBaselineText}</p>}
              {r.peaks.length > 0 && (
                <details data-testid={`input-peaks-${r.key}`} className="mt-1.5">
                  <summary className="cursor-pointer font-semibold text-slate-300">峰表（{r.peaks.length}）</summary>
                  <table className="mt-1 w-full border-collapse text-left text-[11px]">
                    <thead><tr className="border-b border-slate-800 text-[10px] text-slate-400"><th className="py-1 pr-2">#</th><th className="px-2">位置</th><th className="px-2">強度</th><th className="px-2">其他</th></tr></thead>
                    <PeakRows peaks={r.peaks} />
                  </table>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
      {unprovidedText && <p className="mt-3 text-xs text-slate-400">{unprovidedText}</p>}
    </section>
  );
}

/** The table body and its 「展開全部」 button are siblings of the <table> semantics: the button sits in a full-width cell row. */
function PeakRows({peaks}: {peaks: InputPeakRow[]}) {
  const [all, setAll] = React.useState(false);
  const shown = all ? peaks : peaks.slice(0, PEAK_LIMIT);
  return (
    <tbody className="divide-y divide-slate-800/60">
      {shown.map((pk, i) => (
        <tr key={pk.id}><td className="py-1 pr-2 text-slate-500">{i + 1}</td><td className="px-2 font-mono text-cyan-200">{pk.position}</td><td className="px-2 font-mono">{pk.intensity}</td><td className="px-2 text-slate-400">{pk.detail}</td></tr>
      ))}
      {peaks.length > PEAK_LIMIT && (
        <tr><td colSpan={4} className="pt-1">
          <button type="button" aria-expanded={all} onClick={() => setAll(v => !v)} className="text-[11px] font-semibold text-cyan-300 hover:text-cyan-200">
            {all ? '收合' : `展開全部 ${peaks.length} 筆（目前顯示前 ${PEAK_LIMIT} 筆）`}
          </button>
        </td></tr>
      )}
    </tbody>
  );
}
