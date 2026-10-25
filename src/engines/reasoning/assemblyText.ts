import type {AssemblyV12} from './types';

const LEAF_LABEL: Record<AssemblyV12['leafChecks'][number], string> = {
  AROMATIC: '芳香原子（消毒後確認）', REQUIRED: '必含子結構（允許與其他原子重疊）', EQUIVALENCE: '等價群（精確拓樸軌道）', ALKENE: '烯基 CH 恰有一個非芳香 C=C', STRAIN: '環／鍵應變規則',
};
const RING_LABEL: Record<string, string> = {benzene: '苯環', naphthalene: '萘環', pyridine: '吡啶環'};
const num = (v: number) => String(Number(v.toFixed(2)));

/** "2×benzene[0,3] + naphthalene[1]" → "2 個苯環＋萘環" (the substitution positions are internal and not shown). */
function ringText(patternLabel: string | undefined): string | null {
  if (!patternLabel) return null;
  const parts = patternLabel.split(' + ').map(p => { const m = /^(?:(\d+)×)?([a-z]+)/.exec(p); return m ? `${m[1] ? `${m[1]} 個` : ''}${RING_LABEL[m[2]] ?? m[2]}` : ''; }).filter(Boolean);
  return parts.length ? parts.join('＋') : null;
}
function groupLabel(s: NonNullable<AssemblyV12['signals']>[number]): string {
  if (s.kind === 'AROMATIC') return '芳香 CH';
  if (s.kind === 'EXCHANGEABLE') return `${s.element}H（可交換）`;
  const core = `${s.element}H${s.hPerAtom === 1 ? '' : s.hPerAtom}`;
  return s.kind === 'ALKENE' ? `烯基 ${core}` : core;
}

/** Readable Traditional-Chinese lines for the candidate card ("候選組裝與驗證證據"): shifts, k, substructure names; no internal codes. */
export function v12AssemblyLines(d: AssemblyV12): string[] {
  const lines: string[] = [];
  const required = d.required.length ? `用到的必含子結構：${d.required.map(r => r.label).join('、')}` : '沒有強證據子結構被觸發';
  const leaf = d.leafChecks.length ? `葉端檢查：${d.leafChecks.map(x => LEAF_LABEL[x]).join('；')}` : null;
  if (d.path === 'INVENTORY') {
    const rings = ringText(d.patternLabel);
    lines.push(`1H 原子清單讀法：k=${d.k}，額外可交換 H=${d.extraExchangeable}${d.ratio ? `，整數比 ${d.ratio.join(':')}` : ''}${rings ? `；環：${rings}` : ''}`);
    for (const s of d.signals ?? []) lines.push(`δ ${num(s.shiftPpm)} ppm（${num(s.hTotal)}H）＝${s.atomCount} 個${groupLabel(s)}${s.equivalent ? '，拓樸等價' : ''}${s.singlet ? '，相鄰碳不帶 H' : ''}`);
  } else if (d.path === 'FLEX_NO_INTEGRALS') {
    lines.push('1H 沒有積分：使用舊的彈性原子讀法（H 數不固定）');
  } else {
    lines.push(`1H 約束未能套用（已退回）：改用舊的彈性原子讀法${d.fallbackReason ? `；原因：${d.fallbackReason}` : ''}`);
  }
  lines.push(required);
  if (leaf) lines.push(leaf);
  return lines;
}
