import React from 'react';
import {ArrowRight} from 'lucide-react';

/**
 * Result page (page 3) skeleton, v1.2.2 P3 (DESIGN_REPORT B1.1, B1.4).
 * Fixed zone: the analysis bar and the tab bar (rendered by App between the header and <main>).
 * Content: five panels that are ALL rendered from the start and only hidden with the `hidden` attribute, so every data-testid and every <details> state stays in the DOM.
 */
export type ResultTabId = 'fg' | 'pred' | 'formula' | 'input' | 'diag';

export const RESULT_TABS: {id: ResultTabId; label: string; primary: boolean; no?: string}[] = [
  {id: 'fg', label: '圖譜官能基', primary: true, no: '①'},
  {id: 'pred', label: '預測結構', primary: true, no: '②'},
  {id: 'formula', label: '分子式與搜尋', primary: false},
  {id: 'input', label: '輸入與校正', primary: false},
  {id: 'diag', label: '診斷', primary: false},
];

export interface ResultTabBadges {
  /** Number of candidates; undefined = no badge. */
  candidates?: number;
  /** The conclusion card has a top warning: the badge gets a ⚠ so a warning is not missed while the tab is not open. */
  predWarn?: boolean;
  /** Number of ⚠ items of the data check. */
  inputWarn?: number;
}

export function ResultTabBar({active, onChange, badges}: {active: ResultTabId; onChange: (id: ResultTabId) => void; badges: ResultTabBadges}) {
  const tab = (t: (typeof RESULT_TABS)[number]) => {
    const selected = active === t.id;
    const badge =
      t.id === 'pred' && badges.candidates !== undefined ? (
        <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-slate-800 px-1.5 font-mono text-[11px] font-bold text-cyan-300">
          {badges.candidates}
          {badges.predWarn && <span className="text-amber-300">⚠<span className="sr-only">（有警告）</span></span>}
        </span>
      ) : t.id === 'input' && (badges.inputWarn ?? 0) > 0 ? (
        <span className="ml-1.5 inline-flex items-center rounded-full border border-amber-500/60 bg-amber-950/70 px-1.5 font-mono text-[11px] font-bold text-amber-300">
          ⚠ {badges.inputWarn}
          <span className="sr-only">（資料檢查有疑慮）</span>
        </span>
      ) : null;
    return (
      <button
        key={t.id}
        type="button"
        role="tab"
        id={`result-tab-${t.id}`}
        aria-selected={selected}
        aria-controls={`result-panel-${t.id}`}
        tabIndex={selected ? 0 : -1}
        data-testid={`result-tab-${t.id}`}
        onClick={() => onChange(t.id)}
        className={`inline-flex items-center whitespace-nowrap border-b-2 px-2.5 transition focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cyan-400 ${t.primary ? 'py-2.5 text-[15px] font-bold' : 'py-2.5 text-xs font-normal'} ${
          selected
            ? 'border-cyan-500 text-cyan-100'
            : `border-transparent hover:text-slate-100 ${t.primary ? 'text-slate-300' : 'text-slate-400'}`
        }`}
      >
        {t.no && <span className="mr-1 text-cyan-400">{t.no}</span>}
        {t.label}
        {badge}
      </button>
    );
  };
  const [fg, pred, ...secondary] = RESULT_TABS;
  // Keyboard (WAI-ARIA tabs, automatic activation): ←/→ move to the previous/next tab (wrapping), Home/End to the first/last; only the selected tab is in the tab order.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    const i = RESULT_TABS.findIndex(t => t.id === active);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? RESULT_TABS.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + RESULT_TABS.length) % RESULT_TABS.length;
    e.preventDefault();
    onChange(RESULT_TABS[next].id);
    document.getElementById(`result-tab-${RESULT_TABS[next].id}`)?.focus();
  };
  return (
    <div role="tablist" aria-label="結果頁分頁" onKeyDown={onKeyDown} className="flex min-w-0 shrink-0 items-center">
      {tab(fg)}
      <ArrowRight aria-hidden="true" className="mx-0.5 h-4 w-4 shrink-0 text-slate-500" />
      {tab(pred)}
      <span aria-hidden="true" className="mx-2.5 h-5 w-px bg-slate-700" />
      <span className="mr-1 text-[11px] text-slate-500">參考資料</span>
      {secondary.map(tab)}
    </div>
  );
}

export interface AnalysisBarProps {
  runs: number;
  rdkit: boolean;
  resultCurrent: boolean;
  busy: boolean;
  cancelRequested: boolean;
  onStart: () => void;
  onCancel: () => void;
  /** Status sentence while not busy (「分析完成…」「資料已變更，請重新分析」…). */
  statusText: string;
  /** The progress line while busy. */
  progressText: string | null;
  error: string | null;
}

/** The fixed analysis bar: analysis-control (data-* attributes), start/cancel buttons, the single role=status and analysis-progress. */
export function AnalysisBar(p: AnalysisBarProps) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2" data-testid="analysis-control" data-analysis-runs={p.runs} data-worker-rdkit={p.rdkit} data-result-current={p.resultCurrent}>
      <button type="button" disabled={p.busy} onClick={p.onStart} className="shrink-0 rounded bg-cyan-600 px-4 py-1.5 text-sm font-bold disabled:opacity-50">
        {p.busy ? '分析中…' : '開始分析'}
      </button>
      {p.busy && (
        <button type="button" data-testid="analysis-cancel" disabled={p.cancelRequested} className="shrink-0 rounded border border-amber-500 px-3 py-1.5 text-sm text-amber-300" onClick={p.onCancel}>
          {p.cancelRequested ? '正在取消並保留部分結果…' : '取消搜尋'}
        </button>
      )}
      {p.busy ? (
        <span role="status" data-testid="analysis-progress" title={p.progressText ?? undefined} className="min-w-0 truncate text-xs text-slate-300">
          {p.progressText ?? '步驟1/6：初始化本地化學工具'}
        </span>
      ) : (
        <span role="status" title={p.statusText} className="min-w-0 truncate text-xs text-slate-300">{p.statusText}</span>
      )}
      {p.error && <span role="alert" className="min-w-0 truncate text-xs text-rose-300" title={p.error}>{p.error}</span>}
    </div>
  );
}

/** The five panels. All of them are in the DOM; the inactive ones carry `hidden`. */
export function ResultPanels({active, panels}: {active: ResultTabId; panels: Record<ResultTabId, React.ReactNode>}) {
  return (
    <>
      {RESULT_TABS.map(t => (
        <div key={t.id} role="tabpanel" id={`result-panel-${t.id}`} aria-labelledby={`result-tab-${t.id}`} data-testid={`result-panel-${t.id}`} hidden={active !== t.id} className="space-y-3">
          {panels[t.id]}
        </div>
      ))}
    </>
  );
}
