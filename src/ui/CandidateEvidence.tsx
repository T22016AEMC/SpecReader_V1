import React, {useState} from 'react';
import type {CandidateStructure} from '../types/spectrum';
import {perSignalEvidence, summarizeCandidateEvidence, summaryLine, type TraceEvidenceLike} from './evidenceMerge';
import {fmtCompat, fmtScore, shortenNumbers} from './format';
import {obsLabel, type ObservationLike} from './obsLabel';
import {ShowMoreButton} from './ShowMore';

/**
 * The 「支持與矛盾」 area of one candidate (v1.2.2 P5, DESIGN_REPORT B1.3/B1.6): a per-spectrum summary first
 * ("IR：10 個峰中 8 個與預測一致、1 個不明、1 個矛盾（560）"); the item-by-item table (short observation label, result, two-decimal compatibility) is one click further.
 * The sentence about how the score is built is said once, in the heading of the 預測結構 tab. No "no contradiction" line when there is none.
 */
export interface CandidateEvidenceProps {
  cand: CandidateStructure;
  graphInfo?: {heavyAtomCount: number; ringCount: number};
  /** Number of spectra with data (picks the wording of the uncertainty note). */
  modalityCount: number;
  /** `reasoningTrace.candidates[].evidence` of this candidate (three-state results per observation). */
  evidence?: readonly TraceEvidenceLike[];
  observations?: readonly ObservationLike[];
}

/** The sentence the engine repeats on every score entry; the tab heading says it once, so the table only prints a method that differs from it. */
const TEMPLATE_METHOD = /每原始峰只計一次|未標記預測訊號不扣分/;
const resultOf = (compat: number): '支持' | '矛盾' | '不明' => (compat >= 0.6 ? '支持' : compat < 0.3 ? '矛盾' : '不明');
const RESULT_CLASS = {支持: 'text-emerald-300', 矛盾: 'text-rose-300', 不明: 'text-slate-400'} as const;
const TABLE_LIMIT = 20;

type LedgerEntry = NonNullable<CandidateStructure['scientificScoreLedger']>['entries'][number];

function EvidenceTable({entries, observations}: {entries: LedgerEntry[]; observations?: readonly ObservationLike[]}) {
  const [all, setAll] = useState(false);
  const obsMap = observations ? new Map(observations.map(o => [o.id, o])) : undefined;
  const shown = all ? entries : entries.slice(0, TABLE_LIMIT);
  return (
    <>
      <table className="mt-1 w-full border-collapse text-left text-[11px]">
        <thead><tr className="border-b border-slate-800 text-[10px] text-slate-400"><th className="py-1 pr-2">觀測</th><th className="px-2">結果</th><th className="px-2">相容分</th><th className="px-2">完整 ID</th></tr></thead>
        <tbody className="divide-y divide-slate-800/60">
          {shown.map(e => {
            const result = resultOf(e.compatibility ?? 0);
            return (
              <tr key={e.evidenceId}>
                <td className="py-1 pr-2 font-mono text-cyan-200">{obsLabel(e.evidenceId, obsMap)}</td>
                <td className={`px-2 font-semibold ${RESULT_CLASS[result]}`}>{result}</td>
                <td className="px-2 font-mono">{fmtCompat(e.compatibility)}</td>
                <td className="px-2 text-[10px] text-slate-500">{e.evidenceId}{e.method && !TEMPLATE_METHOD.test(e.method) ? `｜${shortenNumbers(e.method)}` : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {entries.length > TABLE_LIMIT && <ShowMoreButton all={all} total={entries.length} shown={TABLE_LIMIT} onToggle={() => setAll(v => !v)} />}
    </>
  );
}

export function CandidateEvidence({cand, graphInfo, modalityCount, evidence, observations}: CandidateEvidenceProps) {
  const nmr = cand.nmrConsistencyAnalysis;
  const summaries = summarizeCandidateEvidence(perSignalEvidence(evidence ?? []));
  const wholeSpectrumChecks = (evidence ?? []).filter(e => e.observationIds.length === 0 && e.modality.endsWith('NMR'));
  const entries = (cand.scientificScoreLedger?.entries ?? []).filter(e => e.compatibility !== null);
  const hasContradictionLine = summaries.some(s => s.contradiction > 0);
  return (
    <div className="space-y-2 text-xs" data-testid="candidate-evidence">
      {summaries.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-4 text-slate-200" data-testid="candidate-evidence-summary">
          {summaries.map(s => <li key={s.modality}>{summaryLine(s, observations)}</li>)}
          {wholeSpectrumChecks.map((e, i) => <li key={`w${i}`}>{e.method ? shortenNumbers(e.method) : `${e.modality} 整體檢查`}</li>)}
        </ul>
      )}
      {!hasContradictionLine && cand.contradictingReasons.length > 0 && (
        <ul className="list-disc pl-4 text-[11px] text-rose-200/90">{cand.contradictingReasons.map((r, i) => <li key={i}>{shortenNumbers(r)}</li>)}</ul>
      )}
      {entries.length > 0 && (
        <details className="text-slate-400" data-testid="candidate-evidence-table">
          <summary className="cursor-pointer text-slate-300">逐筆明細（{entries.length} 筆：觀測、結果、相容分）</summary>
          <EvidenceTable entries={entries} observations={observations} />
        </details>
      )}
      <div className="font-mono text-xs text-slate-400">
        IUPAC: {cand.iupacName} | <strong className="text-cyan-300">{cand.molecularFormula}</strong> (IHD={cand.unsaturationIndex})
      </div>
      {graphInfo && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/20 p-2 font-mono text-[11px] text-emerald-300">
          ✓ 拓撲化合價檢驗通過 | 重原子數: {graphInfo.heavyAtomCount} | 環數: {graphInfo.ringCount}
        </div>
      )}
      {nmr && (
        <div className="space-y-1 rounded-lg border border-violet-500/30 bg-violet-950/20 p-2.5 text-[11px]">
          <div className="flex items-center justify-between font-mono font-bold text-violet-200">
            <span>NMR 科學一致性 ({nmr.overallStatus})</span>
            <span>{fmtScore(nmr.overallScore)}/100</span>
          </div>
          <div className="text-slate-300">
            <span className="font-semibold text-cyan-300">¹H 積分/活潑氫：</span>
            總氫 {nmr.protonIntegrationConsistency.computedTotalH}H（碳上 {nmr.protonIntegrationConsistency.computedCarbonAttachedH}H + 可交換 {nmr.protonIntegrationConsistency.computedExchangeableH}H）· {nmr.protonIntegrationConsistency.status}
          </div>
          <div className="text-slate-300">
            <span className="font-semibold text-amber-300">¹³C 對稱與弛豫：</span>
            預期 {nmr.carbonSymmetryAndCountConsistency.expectedUniqueCarbons} 組不等價碳（含 {nmr.carbonSymmetryAndCountConsistency.quaternaryCarbonsCount} 個四級碳）
          </div>
        </div>
      )}
      {modalityCount <= 1 && (
        <div className="rounded border border-amber-500/20 bg-amber-950/20 p-2 text-[11px] text-amber-200/90">
          <span className="font-semibold text-amber-300">不確定性：</span>
          目前僅依賴有限模態或分子式生成同分異構物候選，位置異構物（如鄰/間/對位）仍具不確定性，建議補充 ¹H/¹³C NMR 裂分與對稱性證據。
        </div>
      )}
    </div>
  );
}
