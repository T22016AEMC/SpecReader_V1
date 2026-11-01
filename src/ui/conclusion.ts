import type {DataCheckResult} from './dataCheck';
import {summarizeCandidateEvidence, summaryLine, type TraceEvidenceLike} from './evidenceMerge';
import type {ObservationLike} from './obsLabel';

/**
 * Wording of the conclusion cards on the 「預測結構」 tab (v1.2.2 P4, DESIGN_REPORT B1.3).
 * Pure display-layer functions: they read existing analysis fields and build sentences; no score, ranking or search is computed here.
 */

/** Two top scores closer than this (in the whole numbers the card shows) are not treated as different (decision D9). */
export const CLOSE_SCORE_GAP = 5;

/** Generation-status codes that mean the list is not the end of a complete search. */
export const INCOMPLETE_SEARCH_CODES: readonly string[] = ['PARTIAL_CANDIDATES', 'CANCELLED', 'TIME_BUDGET', 'STATE_BUDGET', 'SEARCH_INCOMPLETE', 'SEARCH_LIMIT'];

export type TopWarningKind = 'calibration' | 'incomplete' | 'close';
export interface TopWarning {
  kind: TopWarningKind;
  text: string;
}

/** Data-check items whose ⚠ means 「the axis is not calibrated by the user」 (solvent / frequency warnings stay in the fixed data-check line). */
const CALIBRATION_ITEM_IDS = ['h1-calibration', 'c13-calibration', 'ir-calibration', 'pixel-marks'] as const;

export interface TopWarningInput {
  dataCheck: Pick<DataCheckResult, 'items'> | null;
  generationCode: string | undefined;
  /** Candidate scores in ranked order (best first); only the first two are used. */
  scores: readonly number[];
}

/**
 * The single most important warning of the conclusion area, by priority:
 * ① a spectrum is not calibrated (data check ⚠), ② the search is not complete / was cancelled / ran out of budget, ③ the top two are less than CLOSE_SCORE_GAP apart.
 */
export function pickTopWarning(input: TopWarningInput): TopWarning | null {
  const bad = (input.dataCheck?.items ?? []).filter(i => i.level === 'warn' && (CALIBRATION_ITEM_IDS as readonly string[]).includes(i.id));
  if (bad.length) {
    const h1 = bad.find(i => i.id === 'h1-calibration');
    const first = h1 ?? bad[0];
    return {
      kind: 'calibration',
      text: first.id === 'pixel-marks' ? '仍有標記是像素（座標未確定）——排名可能不可靠' : `${first.label} 未經校正——排名可能不可靠`,
    };
  }
  if (input.generationCode && INCOMPLETE_SEARCH_CODES.includes(input.generationCode)) {
    return {kind: 'incomplete', text: '窮舉未完整——清單只是目前限制下找到的結構'};
  }
  if (input.scores.length >= 2) {
    const gap = Math.round(input.scores[0]) - Math.round(input.scores[1]);
    if (gap < CLOSE_SCORE_GAP) return {kind: 'close', text: `前兩名只差 ${Math.max(0, gap)} 分，不能視為有區別`};
  }
  return null;
}

/** The first sentence of a long engine message (up to the first 「。」), so the status line stays one sentence. */
export const firstSentence = (text: string): string => {
  const i = text.indexOf('。');
  return (i >= 0 ? text.slice(0, i + 1) : text).trim();
};

/** One sentence for the search status; the full text goes into a collapsed block. */
export function searchStatusSentence(code: string | undefined, count: number, message: string | undefined): string {
  switch (code) {
    case 'CANDIDATES_FOUND': return `搜尋在目前限制下走完，取得 ${count} 個候選；這不代表列出所有可能結構。`;
    case 'PARTIAL_CANDIDATES': return `搜尋沒有走完，取得 ${count} 個候選；清單只是目前限制下找到的結構。`;
    case 'CANCELLED': return `搜尋已取消，保留 ${count} 個已驗證候選。`;
    case 'TIME_BUDGET': return '搜尋達到時間預算，尚未完成。';
    case 'STATE_BUDGET': return '搜尋達到狀態預算，尚未完成。';
    case 'SEARCH_INCOMPLETE': return '搜尋曾剪枝或達輸出上限，尚未完整。';
    case 'SEARCH_LIMIT': return '搜尋達資源界限或超出支援範圍，尚未完成。';
    default: return message ? firstSentence(message) : '尚無搜尋結果。';
  }
}

export interface BulletInput {
  evidence: readonly TraceEvidenceLike[];
  observations?: readonly ObservationLike[];
  /** The formula the user declared (analysis input), or null. */
  userFormula: string | null;
  candidateFormula: string;
}

/** The per-spectrum lines shown on a conclusion card: ¹H and IR first, then the other spectra, but at most two spectrum lines; the third line says where the formula came from. */
export function conclusionBullets(input: BulletInput): string[] {
  const summaries = summarizeCandidateEvidence(input.evidence);
  const order = ['1H_NMR', 'IR', '13C_NMR', 'MS', 'MS/MS', 'ToF-SIMS'];
  const picked = summaries.filter(s => order.includes(s.modality)).sort((a, b) => order.indexOf(a.modality) - order.indexOf(b.modality)).slice(0, 2);
  const lines = picked.map(s => summaryLine(s, input.observations));
  lines.push(input.userFormula ? `分子式：使用者指定 ${input.userFormula}` : `分子式：未指定，由證據組出 ${input.candidateFormula}`);
  return lines;
}
