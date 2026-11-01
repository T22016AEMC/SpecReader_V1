import React, {useState} from 'react';
import type {DataCheckItem, DataCheckResult} from './dataCheck';

/**
 * The fixed one-line data check of the result page (v1.2.2 P3, DESIGN_REPORT B1.2).
 * All good = a green line; any ⚠ = an amber line; the detail list floats over the content (it never pushes the layout).
 * Display only: it reads a DataCheckResult, nothing here changes an analysis.
 */
export interface IrVersionInfo {version: number; signature: string; text: string}

const TONE = {
  ok: {bar: 'border-emerald-500/30 bg-emerald-950/40 text-emerald-300', item: 'text-emerald-300', mark: 'bg-emerald-950/80 text-emerald-300'},
  info: {bar: 'border-cyan-500/30 bg-cyan-950/40 text-cyan-200', item: 'text-cyan-300', mark: 'bg-cyan-950/80 text-cyan-300'},
  warn: {bar: 'border-amber-500/50 bg-amber-950/50 text-amber-200', item: 'font-bold text-amber-300', mark: 'bg-amber-950/80 text-amber-300'},
} as const;

const GO_PAGE_2: DataCheckItem['id'][] = ['h1-calibration', 'c13-calibration', 'ir-calibration', 'pixel-marks'];

export function DataCheckBar({check, irVersion, onGoCalibration}: {check: DataCheckResult; irVersion: IrVersionInfo | null; onGoCalibration: () => void}) {
  const [open, setOpen] = useState(false);
  const tone = TONE[check.worst];
  return (
    <div data-testid="data-check" data-level={check.worst} data-warn-count={check.warnCount} className={`border-b text-xs ${tone.bar}`}>
     <div className="relative mx-auto flex h-8 w-full max-w-[1600px] items-center gap-3 px-4">
      <b className="shrink-0">資料檢查：</b>
      <div className="flex min-w-0 shrink-0 items-center gap-3">
        {check.summary.map(s => (
          <span key={s.id} className={`shrink-0 whitespace-nowrap ${TONE[s.level].item}`}>
            {s.label} {s.mark}
          </span>
        ))}
      </div>
      {check.items.filter(i => (i.id === 'solvent' || i.id === 'frequency') && i.level === 'info').map(i => (
        <span key={i.id} data-testid={`data-check-note-${i.id}`} title={i.text} className="hidden min-w-0 shrink truncate whitespace-nowrap text-cyan-300 min-[1100px]:inline">{i.text}</span>
      ))}
      {check.worst === 'warn' && <span className="shrink-0 whitespace-nowrap font-semibold">有 ⚠ 項目，請展開確認</span>}
      {check.worst === 'info' && <span className="hidden shrink-0 whitespace-nowrap opacity-80 min-[1500px]:inline">ℹ＝數值檔或手動輸入，程式無法判斷是否已校準</span>}
      {check.stale && <span className="shrink-0 whitespace-nowrap opacity-80">（針對目前輸入）</span>}
      {irVersion && (
        <span
          data-testid="ir-analysis-version"
          data-version={irVersion.version}
          data-curve-signature={irVersion.signature}
          title={irVersion.text}
          className="min-w-0 flex-1 truncate text-amber-200"
        >
          {irVersion.text}
        </span>
      )}
      <button
        type="button"
        aria-expanded={open}
        aria-controls="data-check-detail"
        aria-label={open ? '收合資料檢查明細' : '展開資料檢查明細'}
        onClick={() => setOpen(v => !v)}
        className="ml-auto shrink-0 rounded border border-current px-2 py-0.5 text-[11px] font-semibold"
      >
        {open ? '收合' : '展開'}
      </button>
      {open && (
        <div id="data-check-detail" data-testid="data-check-detail" className="absolute right-4 top-full z-30 mt-1 w-[34rem] max-w-[calc(100vw-2rem)] rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs text-slate-200 shadow-xl">
          <ul className="space-y-2">
            {check.items.map(i => (
              <li key={i.id} className="flex gap-2">
                <span className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${TONE[i.level].mark}`}>
                  {i.level === 'ok' ? '✓' : i.level === 'info' ? 'i' : '!'}
                </span>
                <span className="min-w-0">
                  {i.text}
                  {i.detail && <span className="text-slate-400">　{i.detail}</span>}
                  {i.level === 'warn' && GO_PAGE_2.includes(i.id) && (
                    <button type="button" onClick={onGoCalibration} className="ml-2 font-semibold text-cyan-300 underline">到第 2 頁校正</button>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {check.unprovidedText && <p className="mt-2 text-slate-400">{check.unprovidedText}</p>}
          {check.staleText && <p className="mt-2 text-amber-300">{check.staleText}</p>}
          <p className="mt-2 text-[11px] text-slate-500">只讀現有資料，不改任何分析。</p>
        </div>
      )}
     </div>
    </div>
  );
}
