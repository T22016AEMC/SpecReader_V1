import React from 'react';
import type {ModeAResult} from '../engines/analysisSession';
import {buildCompositionPanel, type PanelBadge, type PanelModel, type ReasonLine} from '../engines/enumeration/compositionPanelModel';

const Badge = ({b}: {b: PanelBadge}) => <span data-testid="composition-badge" data-badge={b.id} className="mr-1 rounded border border-amber-500/60 bg-amber-950/60 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">{b.text}</span>;
const Reasons = ({title, items}: {title: string; items: ReasonLine[]}) => items.length === 0 ? null : <div><p className="font-semibold text-slate-300">{title}</p><ul className="ml-4 list-disc">{items.map((r, i) => <li key={i}>{r.text}（{r.source}，{r.strength}）</li>)}</ul></div>;

/** Read-only, collapsible composition panel (P1b stage 3/4). Rendering only: all wording comes from compositionPanelModel. */
export function CompositionPanelView({model, stale}: {model: PanelModel; stale: boolean}) {
  return <details data-testid="composition-panel" className="rounded border border-slate-700 bg-slate-950 p-3 text-xs">
    <summary data-testid="composition-panel-summary" className="cursor-pointer font-bold text-cyan-300">
      {model.summary}
      {model.badges.length > 0 && <span className="ml-2">{model.badges.map(b => <Badge key={b.id} b={b}/>)}</span>}
      {stale && <span className="ml-2 font-normal text-amber-300">資料已變更，以下為舊結果</span>}
    </summary>
    <div className="mt-2 space-y-2">
      <details open data-testid="composition-hypotheses">
        <summary className="font-semibold text-slate-200">分子式假設（{model.hypothesisCount}）</summary>
        {model.emptyMessage && <p className="mt-1 text-slate-400">{model.emptyMessage}</p>}
        {model.rows.length > 0 && <table className="mt-1 w-full border-collapse text-left">
          <thead><tr className="border-b border-slate-800 text-[10px] text-slate-400">
            <th className="py-1 pr-2">排序</th><th className="px-2">分子式</th><th className="px-2">DBE</th>
            <th className="px-2" title="對稱單元倍數：總 H ≈ k × 單元 H；沒有 1H 積分時為 —">k</th><th className="px-2">質量依據</th>
            <th className="px-2" title="各假設間的相對比較，不是機率，也沒有以實測準確度校準">相對信心（未校準）</th><th className="px-2">大小</th><th className="px-2">窮舉結果</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-800/60 align-top">{model.rows.map(r => <tr key={r.rank} data-formula={r.formula}>
            <td className="py-1 pr-2">{r.rank}</td>
            <td className="px-2 font-mono">{r.formula}{r.unsupportedNote && <span className="block text-[10px] text-slate-400">{r.unsupportedNote}</span>}</td>
            <td className="px-2">{r.dbe}</td><td className="px-2">{r.k}</td>
            <td className="px-2">{r.massBasis}{r.massDetail && <span className="block text-[10px] text-slate-400">{r.massDetail}</span>}</td>
            <td className="px-2" title={r.confidenceTooltip} data-testid="composition-confidence"><span>#{r.confidenceRank}</span><span aria-hidden className="ml-1 inline-block h-2 w-16 rounded bg-slate-800 align-middle"><span className="block h-2 rounded bg-cyan-500" style={{width: `${Math.round(r.confidenceBar * 100)}%`}}/></span></td>
            <td className="px-2">{r.size}</td>
            <td className="px-2" data-testid="composition-search-cell">
              <span>{r.search.text}</span>{r.search.badges.length > 0 && <span className="ml-1">{r.search.badges.map(b => <Badge key={b.id} b={b}/>)}</span>}
              {r.search.note && <span className="block text-[10px] text-slate-400">{r.search.note}</span>}
              {(r.search.readings.length > 0 || r.search.excluded.length > 0) && <details className="mt-1"><summary className="cursor-pointer text-slate-300">各讀法</summary>
                {r.search.readings.map((x, i) => <p key={i}>{x.text}</p>)}
                {r.search.excluded.map((x, i) => <p key={`x${i}`} data-testid="composition-excluded-local" className="text-slate-400">{x}</p>)}
              </details>}
            </td>
          </tr>)}</tbody>
        </table>}
      </details>
      {model.overview && <div data-testid="composition-overview" className="text-slate-300">
        <p>{model.overview.text}</p>{model.overview.prefilterText && <p>{model.overview.prefilterText}</p>}<p>{model.overview.deferredNote}</p>
      </div>}
      <details><summary className="cursor-pointer font-semibold text-slate-200">支持／矛盾／未知理由</summary>
        {model.rows.map(r => <div key={r.rank} className="mt-1"><p className="font-mono text-cyan-300">{r.formula}</p><Reasons title="支持" items={r.support}/><Reasons title="矛盾" items={r.contradiction}/><Reasons title="未知" items={r.unknown}/></div>)}
      </details>
      <details><summary className="cursor-pointer font-semibold text-slate-200">{model.nitrogen.title}</summary>
        <p>{model.nitrogen.note}</p><ul className="ml-4 list-disc">{model.nitrogen.reasons.map((r, i) => <li key={i}>{r.text}（{r.source}，{r.strength}）</li>)}</ul>
      </details>
      <details><summary className="cursor-pointer font-semibold text-slate-200">元素線索與邊界</summary>
        <ul className="ml-4 list-disc">{model.clues.map((c, i) => <li key={i}>{c}</li>)}</ul>
        {model.excludedElements.length > 0 && <p>已排除的元素：{model.excludedElements.join('；')}</p>}
        <p>邊界：{model.bounds}</p>
      </details>
      <details open data-testid="composition-limitations"><summary className="cursor-pointer font-semibold text-slate-200">限制</summary>
        <ul className="ml-4 list-disc text-slate-300">{model.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul>
      </details>
    </div>
  </details>;
}

/** Builds the model from an analysis result; renders nothing when the result has no composition inference. */
export function CompositionPanel({result, stale}: {result: ModeAResult; stale: boolean}) {
  const model = buildCompositionPanel({
    composition: result.compositionInference,
    runs: result.reasoningTrace?.compositionSearch?.runs ?? [],
    mode: result.reasoningTrace?.compositionSearch?.mode,
    enumeration: result.solvedConstraintSpace?.searchResult?.enumeration,
    localStructures: result.reasoningTrace?.localStructures ?? [],
  });
  return model ? <CompositionPanelView model={model} stale={stale}/> : null;
}
