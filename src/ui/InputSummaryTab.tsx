import React from 'react';
import type {CalibrationLevel} from './calibrationStatus';

/**
 * 「輸入與校正」 tab of the result page (v1.2.2 P3): a read-only summary per loaded spectrum. The full version (peak tables) comes in P6.
 * Display only; the buttons only switch the page.
 */
export interface InputSummaryRow {
  key: string;
  label: string;
  fileName: string;
  peakCount: number;
  calibrationLabel: string;
  calibrationDetail: string;
  level: CalibrationLevel;
  /** NMR only. */
  solvent?: string;
  /** ¹H only: null = not declared. */
  frequencyMHz?: number | null;
}

const LEVEL_CLASS: Record<CalibrationLevel, string> = {
  ok: 'border-emerald-500/30 bg-emerald-950/40 text-emerald-300',
  info: 'border-cyan-500/30 bg-cyan-950/40 text-cyan-300',
  warn: 'border-amber-500/50 bg-amber-950/50 text-amber-300',
};

export function InputSummaryTab({rows, unprovidedText, onGoPage1, onGoPage2}: {rows: InputSummaryRow[]; unprovidedText: string | null; onGoPage1: () => void; onGoPage2: () => void}) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/80 p-4" data-testid="input-summary">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-100">輸入與校正（唯讀摘要）</h2>
        <div className="flex gap-2">
          <button type="button" onClick={onGoPage1} className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-medium text-slate-200 hover:bg-slate-700">到第 1 頁修改標記</button>
          <button type="button" onClick={onGoPage2} className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-medium text-slate-200 hover:bg-slate-700">到第 2 頁調整校正</button>
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
              </div>
              <p className="mt-1 text-slate-400">{r.calibrationDetail}</p>
              {(r.solvent !== undefined || r.frequencyMHz !== undefined) && (
                <p className="mt-1 text-slate-300">
                  {r.solvent !== undefined && <>溶劑：{r.solvent && r.solvent !== 'Unknown' ? r.solvent : '未宣告'}</>}
                  {r.solvent !== undefined && r.frequencyMHz !== undefined && '　'}
                  {r.frequencyMHz !== undefined && <>頻率：{r.frequencyMHz ? `${r.frequencyMHz} MHz` : '未宣告，程式以 400 MHz 計算'}</>}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {unprovidedText && <p className="mt-3 text-xs text-slate-400">{unprovidedText}</p>}
    </section>
  );
}
