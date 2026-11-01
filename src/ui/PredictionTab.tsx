import React from 'react';
import {AlertTriangle, ArrowLeft} from 'lucide-react';
import {CompactCandidateRow, ConclusionCard, type CandidateView} from './ConclusionCard';
import type {TopWarning} from './conclusion';

/**
 * 「預測結構」 tab (v1.2.2 P4, DESIGN_REPORT B1.3). From top to bottom:
 * back button + the one most important warning, the analysis-process card (only while running / after a cancel), the conclusion cards (top 3),
 * the other candidates as compact rows (or the zero-candidate explanation), one-sentence search status + composition source,
 * constraint summary (collapsed), and the 「De novo 搜尋狀態與界限」 block (collapsed).
 */
export const TOP_CANDIDATE_COUNT = 3;

export interface PredictionTabProps {
  onBack: () => void;
  onGoCalibration: () => void;
  warning: TopWarning | null;
  /** The ReasoningPanel while the analysis runs or after a cancel (null otherwise). */
  processCard: React.ReactNode;
  hasResult: boolean;
  busy: boolean;
  candidates: CandidateView[];
  /** Replaces the cards when there is no candidate (the old zero-candidate explanation). */
  zeroCandidate: React.ReactNode;
  search: {code: string | undefined; sentence: string; fullText: string; compositionSource: string};
  constraintItems: {label: string; value: string}[];
  deNovo: React.ReactNode;
}

export function PredictionTab(p: PredictionTabProps) {
  const top = p.candidates.slice(0, TOP_CANDIDATE_COUNT);
  const rest = p.candidates.slice(TOP_CANDIDATE_COUNT);
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={p.onBack} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700">
          <ArrowLeft className="h-3.5 w-3.5" /> 回圖譜官能基
        </button>
        {p.warning && (
          <div data-testid="top-warning" data-kind={p.warning.kind} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-amber-500/50 bg-amber-950/40 px-3 py-1.5 text-xs font-semibold text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
            <span className="min-w-0">{p.warning.text}</span>
            {p.warning.kind === 'calibration' && (
              <button type="button" onClick={p.onGoCalibration} className="ml-auto shrink-0 rounded bg-amber-500 px-2.5 py-0.5 text-[11px] font-extrabold text-slate-950 hover:bg-amber-400">回第 2 頁校正</button>
            )}
          </div>
        )}
      </div>

      {p.processCard}

      {!p.hasResult && !p.busy && <p className="rounded-xl border border-dashed border-slate-800 p-6 text-center text-xs text-slate-400">尚未分析。按上方「開始分析」後，這裡會列出候選結構。</p>}

      {p.hasResult && (
        <>
          <section className="space-y-2" data-testid="conclusion-block">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-100">預測結構（共 {p.candidates.length} 個候選）</h2>
              <p className="text-[11px] text-slate-400">模型相容度不是機率（未校準；同一原始觀測僅計一次）。有界搜尋，資訊不足時不能確認完整結構。</p>
            </div>
            <div>
              <p data-testid="evidence-method-note" className="text-[11px] text-slate-400">各峰的相容分：候選分子圖選出區間／環境知識，與實測峰型／寬度／伴隨峰比較；每原始峰只計一次。展開「支持與矛盾」看每個峰的結果；排名相近時，請到「診斷」頁對照跨譜驗證矩陣。</p>
            </div>
            {p.candidates.length === 0 ? (
              p.zeroCandidate
            ) : (
              <>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                  {top.map(c => <ConclusionCard key={c.id} c={c} />)}
                </div>
                {rest.length > 0 && (
                  <div>
                    <h3 className="mb-1 text-xs font-bold text-slate-300">其餘候選（{rest.length} 個）</h3>
                    <ul className="space-y-1.5">{rest.map(c => <CompactCandidateRow key={c.id} c={c} />)}</ul>
                  </div>
                )}
              </>
            )}
          </section>

          <section className="space-y-1">
            <p data-testid="generation-status" data-code={p.search.code} className="text-xs text-slate-200">{p.search.sentence}</p>
            <p className="text-xs text-slate-400">{p.search.compositionSource}</p>
            <details className="text-xs text-slate-400"><summary>完整搜尋說明</summary><p className="mt-1">{p.search.fullText}</p></details>
          </section>

          {p.constraintItems.length > 0 && (
            <details className="text-xs text-slate-300" data-testid="constraint-summary">
              <summary className="cursor-pointer font-semibold text-slate-200">約束摘要</summary>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {p.constraintItems.map(i => <li key={i.label}>{i.label}：{i.value}</li>)}
              </ul>
            </details>
          )}
          {p.deNovo}
        </>
      )}
    </>
  );
}
