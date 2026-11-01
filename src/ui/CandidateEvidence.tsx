import React from 'react';
import type {CandidateStructure} from '../types/spectrum';
import {fmtScore, shortenNumbers} from './format';

/**
 * The 「支持與矛盾」 area of one candidate (v1.2.2 P4, DESIGN_REPORT B1.3): the content the old candidate card printed in full, now inside a collapsible area.
 * P4 keeps the content as it was (merging into one line, de-duplication and short labels are P5); long numbers are shortened for display only.
 */
export interface CandidateEvidenceProps {
  cand: CandidateStructure;
  graphInfo?: {heavyAtomCount: number; ringCount: number};
  /** Number of spectra with data (picks the wording of the uncertainty note). */
  modalityCount: number;
}

export function CandidateEvidence({cand, graphInfo, modalityCount}: CandidateEvidenceProps) {
  const nmr = cand.nmrConsistencyAnalysis;
  return (
    <div className="space-y-2 text-xs" data-testid="candidate-evidence">
      {cand.scientificScoreLedger && (
        <details className="text-xs text-slate-400">
          <summary>實測支持與矛盾證據</summary>
          {cand.scientificScoreLedger.entries.filter(e => e.compatibility !== null).slice(0, 24).map(e => (
            <p key={e.evidenceId}>
              {e.sourceModality} · {e.evidenceId} · {(e.compatibility ?? 0) >= 0.6 ? '支持' : (e.compatibility ?? 0) < 0.3 ? '矛盾／模型無法解釋' : '弱相容'} · {shortenNumbers(e.method)}
            </p>
          ))}
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
            <span>{fmtScore(nmr.overallScore)}%</span>
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
      <div className="space-y-1.5">
        <div className="font-semibold text-emerald-300">支持證據与相關峰位 ({cand.supportingReasons.length})：</div>
        <ul className="list-disc space-y-1 pl-4 text-[11px] text-slate-300">
          {cand.supportingReasons.map((r, i) => <li key={i}>{shortenNumbers(r)}</li>)}
        </ul>
        <div className="mt-2 font-semibold text-rose-300">反對證據 / 排他矛盾點 ({cand.contradictingReasons.length})：</div>
        {cand.contradictingReasons.length > 0 ? (
          <ul className="list-disc space-y-1 pl-4 text-[11px] text-rose-200/90">
            {cand.contradictingReasons.map((r, i) => <li key={i}>{shortenNumbers(r)}</li>)}
          </ul>
        ) : (
          <div className="text-[11px] text-slate-400">目前提供的實驗證據中無直接排他矛盾。</div>
        )}
        <div className="mt-2 rounded border border-amber-500/20 bg-amber-950/20 p-2 text-[11px] text-amber-200/90">
          <span className="font-semibold text-amber-300">不確定性評估：</span>
          {modalityCount <= 1
            ? '目前僅依賴有限模態或分子式生成同分異構物候選，位置異構物（如鄰/間/對位）仍具不確定性，建議補充 ¹H/¹³C NMR 裂分與對稱性證據。'
            : '已結合多模態光譜進行交叉排他評分；若排名相近，建議對照「診斷」頁的跨譜驗證矩陣。'}
        </div>
      </div>
    </div>
  );
}
