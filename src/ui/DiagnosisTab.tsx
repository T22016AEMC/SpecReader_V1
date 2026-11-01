import React, {useRef, useState} from 'react';
import {Check, ClipboardCopy, Copy, FileCode, Printer} from 'lucide-react';
import type {ModeAResult} from '../engines/analysisSession';
import {fmtScore, shortenNumbers} from './format';
import {LimitedList} from './ShowMore';

/**
 * 「診斷」 tab (v1.2.2 P6, DESIGN_REPORT B1.7): reference material. Top to bottom: 「複製診斷摘要」 with the plain-text preview right under it,
 * 「複製完整分子式表」, the export buttons, then four folded sections (cross-spectrum matrix, traceable evidence, cross-modal consensus, uncertainty), then the six-step process (after the analysis).
 * Display only: the texts come from `diagnosticSummary.ts`, the tables from the analysis output.
 */
type MatrixRow = ModeAResult['validationMatrix'][number];
type EvidenceRow = ModeAResult['spectrumEvidenceList'][number];
type MatrixKey = 'IR' | '1H_NMR' | '13C_NMR' | 'MS' | 'MS/MS' | 'ToF-SIMS';
const MATRIX_COLUMNS: {key: MatrixKey; label: string}[] = [
  {key: 'IR', label: 'IR'}, {key: '1H_NMR', label: '¹H'}, {key: '13C_NMR', label: '¹³C'}, {key: 'MS', label: 'MS'}, {key: 'MS/MS', label: 'MS/MS'}, {key: 'ToF-SIMS', label: 'ToF-SIMS'},
];
const STATUS_TEXT: Record<string, {text: string; cls: string}> = {
  SUPPORTED: {text: '支持', cls: 'border-emerald-500/30 bg-emerald-950/60 text-emerald-300'},
  COMPATIBLE: {text: '相容', cls: 'border-cyan-500/30 bg-cyan-950/60 text-cyan-300'},
  CONTRADICTED: {text: '矛盾', cls: 'border-rose-500/30 bg-rose-950/60 text-rose-300'},
  INSUFFICIENT_DATA: {text: '資料不足', cls: 'border-slate-700 bg-slate-800 text-slate-400'},
};
const providedStatus = (s: string | undefined) => Boolean(s) && s !== 'NOT_PROVIDED';

export interface DiagnosisTabProps {
  hasResult: boolean;
  summaryText: string;
  fullFormulaTableText: string;
  onOpenExport: () => void;
  markdownReport: () => string;
  onDownloadJson: () => void;
  matrix: readonly MatrixRow[];
  evidence: readonly EvidenceRow[];
  consensusNotes: readonly string[];
  uncertaintyNotes: readonly string[];
  /** The six-step process card, shown after the analysis (null while the card is on the prediction tab). */
  processCard: React.ReactNode;
}

const BTN = 'inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700';

function Section({title, count, testId, children}: {title: string; count?: number; testId: string; children: React.ReactNode}) {
  return (
    <details data-testid={testId} className="rounded-xl border border-slate-800 bg-slate-900/80 text-xs">
      <summary className="cursor-pointer px-4 py-2 text-sm font-bold text-slate-100">{title}{count !== undefined && <span className="ml-2 font-mono text-[11px] text-cyan-300">{count}</span>}</summary>
      <div className="space-y-2 border-t border-slate-800 px-4 py-3">{children}</div>
    </details>
  );
}

export function DiagnosisTab(p: DiagnosisTabProps) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = (text: string) => {
    setFeedback(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setFeedback(null), 3000);
  };
  const copy = async (text: string, done: string) => {
    try {
      await navigator.clipboard.writeText(text);
      say(done);
    } catch {
      say('瀏覽器不允許寫入剪貼簿；請直接選取預覽文字複製。');
    }
  };
  const providedColumns = MATRIX_COLUMNS.filter(c => p.matrix.some(r => providedStatus(r.modalityStatus[c.key])));
  const missingColumns = MATRIX_COLUMNS.filter(c => !providedColumns.includes(c));
  const badge = (status: string | undefined, score: number | null | undefined) => {
    if (!providedStatus(status)) return null;
    const s = STATUS_TEXT[status as string] ?? {text: String(status), cls: 'border-slate-700 bg-slate-800 text-slate-300'};
    return <span className={`whitespace-nowrap rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold ${s.cls}`}>{s.text}{status !== 'INSUFFICIENT_DATA' && score != null ? ` ${fmtScore(score)}/100` : ''}</span>;
  };

  return (
    <>
      {!p.hasResult ? (
        <p className="rounded-xl border border-dashed border-slate-800 p-6 text-center text-xs text-slate-400">尚未分析。分析後，這裡會列出診斷摘要、驗證矩陣與可追溯證據。</p>
      ) : (
        <section data-testid="diagnostic-summary" className="space-y-2 rounded-xl border border-cyan-500/30 bg-slate-900/90 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => copy(p.summaryText, '已複製診斷摘要')} className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-bold text-white hover:bg-cyan-500">
              <ClipboardCopy className="h-4 w-4" /> 複製診斷摘要
            </button>
            <button type="button" onClick={() => copy(p.fullFormulaTableText, '已複製完整分子式表')} className={BTN}>
              <Copy className="h-3.5 w-3.5" /> 複製完整分子式表
            </button>
            <span aria-live="polite" data-testid="diagnostic-copy-feedback" className="text-xs text-emerald-300">{feedback}</span>
          </div>
          <p className="text-[11px] text-slate-400">純文字，7 個固定小節，不含檔案內容。下方是將被複製的內容；「完整分子式表」包含全部假設列與每列的搜尋狀態、未搜尋原因。</p>
          <pre data-testid="diagnostic-preview" className="whitespace-pre-wrap break-words rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-slate-200">{p.summaryText}</pre>
        </section>
      )}

      <section data-testid="diagnostic-export" className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/80 p-3">
        <span className="text-xs font-bold text-slate-100">匯出</span>
        <button type="button" onClick={p.onOpenExport} className={BTN}>開啟匯出視窗</button>
        <button type="button" onClick={() => copy(p.markdownReport(), '已複製 Markdown 報告')} className={BTN}><Check className="h-3.5 w-3.5 text-slate-400" /> 複製 Markdown 報告</button>
        <button type="button" onClick={p.onDownloadJson} className={BTN}><FileCode className="h-3.5 w-3.5 text-cyan-400" /> 下載完整 JSON 證據包</button>
        <button type="button" onClick={() => window.print()} className={BTN}><Printer className="h-3.5 w-3.5" /> 列印報告</button>
      </section>

      {p.hasResult && (
        <>
          {p.matrix.length > 0 && (
            <Section title="跨光譜一致性驗證矩陣" count={p.matrix.length} testId="diagnostic-matrix">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] text-slate-400">
                      <th className="py-2 pr-3">排名 / 候選結構</th><th className="px-3 py-2 font-mono">分子式</th>
                      {providedColumns.map(c => <th key={c.key} className="px-2 py-2 font-mono">{c.label}</th>)}
                      <th className="py-2 pl-3 font-mono">綜合吻合度</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {p.matrix.map((row, idx) => (
                      <tr key={row.candidateId}>
                        <td className="py-2 pr-3 font-semibold text-slate-100">#{idx + 1} {row.candidateName}</td>
                        <td className="px-3 py-2 font-mono text-[11px] text-cyan-300"><div>{row.formula}</div><div className="text-[10px] text-slate-400">{row.smiles}</div></td>
                        {providedColumns.map(c => <td key={c.key} className="px-2 py-2">{badge(row.modalityStatus[c.key], row.modalityScores[c.key])}</td>)}
                        <td className="py-2 pl-3 font-mono text-sm font-extrabold text-cyan-300">{fmtScore(row.totalScore)}/100</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {missingColumns.length > 0 && <p className="text-slate-400">未提供：{missingColumns.map(c => c.label).join('、')}（不當成反證）</p>}
            </Section>
          )}

          {p.evidence.length > 0 && (
            <Section title="可追溯證據明細" count={p.evidence.length} testId="diagnostic-evidence">
              <p className="text-slate-400">區分化學式證據、使用者化學資訊與六種獨立實驗光譜證據；每列：來源、觀測、推論與規則、方向、對候選的影響。</p>
              <LimitedList as="div" items={p.evidence} limit={20} label="筆" className="space-y-1.5" render={ev => (
                  <div key={ev.id} className="rounded border border-slate-800 bg-slate-950/70 p-2">
                    <p className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-mono font-bold text-cyan-300">[{ev.sourceSpectrum || ev.spectrumType}]</span>
                      <span className="font-mono text-slate-200">{shortenNumbers(String(ev.evidenceChain?.observedPeak || `${ev.peakPosition} (${ev.intensity ?? ''})`))}</span>
                      <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${ev.direction === 'CONTRADICTING' ? 'bg-rose-950/70 text-rose-300' : ev.direction === 'INCONCLUSIVE' ? 'bg-amber-950/70 text-amber-300' : 'bg-emerald-950/70 text-emerald-300'}`}>{ev.direction || 'SUPPORTING'}</span>
                      <span className="text-[10px] text-slate-500">{ev.evidenceCategory || 'EXPERIMENTAL_SPECTRUM'}</span>
                    </p>
                    <p className="text-[11px] text-slate-200"><span className="font-semibold">{ev.inferredGroup}</span>　<span className="text-slate-400">{shortenNumbers(String(ev.ruleApplied || ev.chemicalMeaning || ''))}</span></p>
                    <p className="text-[11px] text-slate-300">{shortenNumbers(String(ev.scoreImpact || ev.chemicalMeaning || ''))}{ev.uncertaintyNote && <span className="ml-2 text-amber-300/80">不確定性：{shortenNumbers(ev.uncertaintyNote)}</span>}</p>
                    <p className="text-[10px] text-slate-500">{ev.id}</p>
                  </div>
                )} />
            </Section>
          )}

          <Section title="跨模態共識與輔助證據印證" count={p.consensusNotes.length} testId="diagnostic-consensus">
            <ul className="list-disc space-y-1 pl-4 text-slate-300">{p.consensusNotes.map((n, i) => <li key={i}>{shortenNumbers(n)}</li>)}</ul>
          </Section>
          <Section title="不確定性、未校正訊號與溶劑排除紀錄" count={p.uncertaintyNotes.length} testId="diagnostic-uncertainty">
            <ul className="list-disc space-y-1 pl-4 text-slate-300">{p.uncertaintyNotes.map((n, i) => <li key={i}>{shortenNumbers(n)}</li>)}</ul>
          </Section>
        </>
      )}
      {p.processCard}
    </>
  );
}
