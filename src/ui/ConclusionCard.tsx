import React, {useState} from 'react';
import {Nmrshiftdb2Notice} from './Nmrshiftdb2Notice';

/**
 * Conclusion card (top candidates) and compact row (the others) of the 「預測結構」 tab, v1.2.2 P4 (DESIGN_REPORT B1.3).
 * Presentation only: every text and node comes from the caller, which reads it from the analysis result.
 */
export interface CandidateView {
  id: string;
  rank: number;
  name: string;
  formula: string;
  /** 「78/100」 */
  scoreText: string;
  /** 1–3 short lines (spectrum summaries, formula source). */
  bullets: string[];
  /** The `候選來源：…` line (the sentence about bounded search / uncalibrated score is said once in the block heading). */
  sourceLine: string;
  selected: boolean;
  onSelect: () => void;
  onSendToModeB: () => void;
  /** Rendered lazily: the 2D structure (top cards always, compact rows only when open). */
  structure: () => React.ReactNode;
  /** `CandidateReasoningDetails` (collapsed `candidate-reasoning`). */
  reasoning: () => React.ReactNode;
  /** The 「支持與矛盾」 area content. */
  evidence: () => React.ReactNode;
  /** v1.4.2 stop 35 (D): the card shows a ¹H prediction result (conclusion.ts cardShowsH1Prediction); the nmrshiftdb2 notice is shown with it. */
  showsH1?: boolean;
}

const EVIDENCE_OPEN = '展開支持與矛盾';
const EVIDENCE_CLOSE = '收合支持與矛盾';

export function ConclusionCard({c}: {c: CandidateView}) {
  const [open, setOpen] = useState(false);
  const regionId = `candidate-evidence-${c.id}`;
  return (
    <article
      data-testid="conclusion-card"
      data-rank={c.rank}
      onClick={c.onSelect}
      className={`flex min-w-0 cursor-pointer flex-col rounded-xl border p-3 transition ${c.selected ? 'border-cyan-500 bg-slate-950 shadow-lg' : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`rounded px-2 py-0.5 font-mono text-xs font-bold ${c.rank === 1 ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-300'}`}>Rank #{c.rank}</span>
        <span className="font-mono text-base font-extrabold text-cyan-300">模型相容度：{c.scoreText}</span>
      </div>
      <h3 className="mt-1.5 truncate text-sm font-bold text-slate-100" title={c.name}>{c.name}　<span className="font-mono text-xs font-normal text-cyan-300">{c.formula}</span></h3>
      <div className="mx-auto my-2 w-full max-w-[250px]">{c.structure()}</div>
      <ul className="list-disc space-y-0.5 pl-4 text-xs text-slate-300">
        {c.bullets.map((b, i) => <li key={i}>{b}</li>)}
      </ul>
      {c.showsH1 && <Nmrshiftdb2Notice testId="card-nmrshiftdb2-notice" className="mt-1" />}
      <p className="mt-1.5 text-[11px] text-amber-200" data-testid="candidate-source">{c.sourceLine}</p>
      {c.reasoning()}
      <div className="mt-auto flex flex-wrap gap-2 border-t border-slate-800 pt-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={regionId}
          onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-700"
        >
          {open ? EVIDENCE_CLOSE : EVIDENCE_OPEN}
        </button>
        <button
          type="button"
          onClick={e => { e.stopPropagation(); c.onSendToModeB(); }}
          className="rounded-lg border border-amber-500/40 bg-amber-950/40 px-3 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-900/50"
        >
          送入 Mode B 獨立預測其理論光譜 →
        </button>
      </div>
      {open && <div id={regionId} className="mt-2 border-t border-slate-800 pt-2" onClick={e => e.stopPropagation()}>{c.evidence()}</div>}
    </article>
  );
}

/** A candidate below the top group: one line; opening it shows what the old full card showed. */
export function CompactCandidateRow({c}: {c: CandidateView}) {
  const [open, setOpen] = useState(false);
  const regionId = `candidate-evidence-${c.id}`;
  return (
    <li data-testid="compact-candidate" data-rank={c.rank} className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="rounded bg-slate-800 px-2 py-0.5 font-mono font-bold text-slate-300">#{c.rank}</span>
        <span className="font-mono font-bold text-cyan-300">{c.formula}</span>
        <span className="min-w-0 flex-1 truncate text-slate-200" title={c.name}>{c.name}</span>
        <span className="font-mono font-bold text-cyan-300">模型相容度：{c.scoreText}</span>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={regionId}
          onClick={() => setOpen(v => !v)}
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-700"
        >
          {open ? EVIDENCE_CLOSE : EVIDENCE_OPEN}
        </button>
      </div>
      {open && (
        <div id={regionId} className="mt-2 space-y-2 border-t border-slate-800 pt-2">
          <div className="grid gap-3 md:grid-cols-[300px_1fr]">
            <div>{c.structure()}</div>
            <div>
              <ul className="list-disc space-y-0.5 pl-4 text-xs text-slate-300">{c.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>
              {c.showsH1 && <Nmrshiftdb2Notice testId="card-nmrshiftdb2-notice" className="mt-1" />}
              <p className="mt-1.5 text-[11px] text-amber-200" data-testid="candidate-source">{c.sourceLine}</p>
              {c.reasoning()}
            </div>
          </div>
          {c.evidence()}
          <button
            type="button"
            onClick={c.onSendToModeB}
            className="rounded-lg border border-amber-500/40 bg-amber-950/40 px-3 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-900/50"
          >
            送入 Mode B 獨立預測其理論光譜 →
          </button>
        </div>
      )}
    </li>
  );
}
