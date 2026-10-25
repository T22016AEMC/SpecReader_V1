import type {EnumerationRunDiagnostic, IncompleteReason} from './types';

/**
 * What kept structures out in a v1.2 analysis, in words (Traditional Chinese, no internal codes): used by the "no candidate" explanation on the
 * candidate area and by the "實際套用的約束" section of the composition panel, so both show the same numbers.
 */
export interface ExclusionStats {
  required: {label: string; count: number}[];
  aromatic: number;
  equivalence: number;
  alkene: number;
  strain: {label: string; count: number}[];
  plausibility: {label: string; count: number}[];
  total: number;
}
export const PLAUSIBILITY_LABEL: Record<string, string> = {
  PEROXIDE: '過氧 O–O 鍵', N_O_N: 'N–O–N 連接', N_DI_OH: 'N 上連兩個以上的 OH', N_O_LINK: 'N–O 鍵', CUMULATED_N: '疊氮／重氮的累積 N 雙鍵', GEM_DIOL: '偶二醇',
  ENOL: '非芳香烯醇', KETENE: '烯酮', AMINAL: '非環狀胺縮醛／半縮醛胺', HEMIACETAL_ACYCLIC: '非環狀半縮醛／半縮酮', ORTHOESTER_ACYCLIC: '非環狀原酸酯型',
};
export const STRAIN_LABEL: Record<string, string> = {
  TRIPLE_BOND_IN_SMALL_RING: '小環中的三鍵', CUMULATED_CENTRE: '累積雙鍵中心（丙二烯型）', MULTIPLE_SMALL_RINGS: '多個三、四員環共用同一原子',
};
const add = (m: Map<string, number>, k: string, n: number) => m.set(k, (m.get(k) ?? 0) + n);

export function exclusionStats(runs: (EnumerationRunDiagnostic | undefined)[], rejected: {violatedConstraints: string[]}[] = []): ExclusionStats {
  const required = new Map<string, number>(), strain = new Map<string, number>(), plaus = new Map<string, number>();
  let aromatic = 0, equivalence = 0, alkene = 0;
  for (const e of runs) {
    if (!e?.v12) continue;
    const v = e.rejected?.v12;
    if (v) {
      aromatic += v.aromaticFailed; equivalence += v.equivalenceFailed; alkene += v.alkeneFailed;
      for (const [id, n] of Object.entries(v.requiredById ?? {})) add(required, e.v12.required.find(r => r.id === id)?.label ?? id, n);
    }
    for (const [rule, n] of Object.entries(e.rejected?.strainByRule ?? {})) add(strain, STRAIN_LABEL[rule] ?? rule, n);
  }
  for (const r of rejected) for (const c of r.violatedConstraints) {
    const m = /^PLAUSIBILITY\(([A-Z_]+)\)/.exec(c);
    if (m) add(plaus, PLAUSIBILITY_LABEL[m[1]] ?? m[1], 1);
  }
  const list = (m: Map<string, number>) => [...m].map(([label, count]) => ({label, count}));
  const out: ExclusionStats = {required: list(required), aromatic, equivalence, alkene, strain: list(strain), plausibility: list(plaus), total: 0};
  out.total = out.required.reduce((s, x) => s + x.count, 0) + aromatic + equivalence + alkene + out.strain.reduce((s, x) => s + x.count, 0) + out.plausibility.reduce((s, x) => s + x.count, 0);
  return out;
}

/** The lines of the statistics ("必含子結構『…』排除了 N 個" …); only non-zero items. */
export function exclusionLines(s: ExclusionStats): string[] {
  const lines: string[] = [];
  for (const r of s.required) lines.push(`必含子結構『${r.label}』排除了 ${r.count} 個`);
  if (s.aromatic) lines.push(`芳香原子檢查排除了 ${s.aromatic} 個`);
  if (s.equivalence) lines.push(`等價（對稱）檢查排除了 ${s.equivalence} 個`);
  if (s.alkene) lines.push(`烯基（非芳香 C=C）檢查排除了 ${s.alkene} 個`);
  for (const r of s.strain) lines.push(`應變規則『${r.label}』排除了 ${r.count} 個`);
  for (const r of s.plausibility) lines.push(`化學合理性規則『${r.label}』排除了 ${r.count} 個`);
  return lines;
}

export interface ZeroCandidateInput {
  runs: (EnumerationRunDiagnostic | undefined)[];
  /** Formula entered by the user. */
  userFormula: string | null;
  rejectedCandidates: {violatedConstraints: string[]}[];
  /** Labels for incomplete reasons (the panel's REASON_LABEL). */
  reasonLabel: Record<IncompleteReason, string>;
  /** The 1H coverage was not confirmed complete / some 1H signals have no integral. */
  coverageUnconfirmed: boolean;
}
export interface ZeroCandidateExplanation {headline: string; blocked: string[]; blockedEmpty: string | null; unfinished: string[]; suggestions: string[]}

/** Explanation shown instead of an empty candidate area when the 1H constraints are on and nothing survived; null when no run used them. */
export function zeroCandidateExplanation(input: ZeroCandidateInput): ZeroCandidateExplanation | null {
  const used = input.runs.filter((e): e is EnumerationRunDiagnostic => Boolean(e?.v12));
  if (!used.length) return null;
  const stats = exclusionStats(input.runs, input.rejectedCandidates);
  const blocked = exclusionLines(stats);
  const unfinished = used.filter(e => !e.complete).map(e => {
    const reasons = e.incompleteReasons.map(r => input.reasonLabel[r] ?? '').filter(Boolean);
    return `${e.formula ?? '（未知分子式）'}：${reasons.length ? reasons.join('、') : '預算內沒有跑完'}`;
  });
  const suggestions: string[] = [];
  if (!input.userFormula) suggestions.push('填入分子式可縮小搜尋範圍');
  if (used.some(e => e.v12!.path === 'FLEX_NO_INTEGRALS')) suggestions.push('有 1H 訊號缺少積分，補上積分才能建立原子清單');
  if (input.coverageUnconfirmed) suggestions.push('1H 涵蓋尚未確認完整；確認訊號都已列出，才能比較預測多出的環境');
  if (used.some(e => !e.complete)) suggestions.push('預算內沒有跑完的部分可以在較長的預算或較少的分子式假設下再試');
  return {
    headline: '在預算內找不到符合 1H 約束與強證據的結構',
    blocked, blockedEmpty: blocked.length ? null : '沒有任何結構被葉端檢查排除：預算內沒有走到可供檢查的完整結構',
    unfinished, suggestions,
  };
}
