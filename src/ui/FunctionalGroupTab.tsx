import React from 'react';
import {ArrowRight} from 'lucide-react';
import type {FunctionalGroupConstraint, IRFunctionalGroupFinding} from '../types/spectrum';
import type {ChemicalHypothesis, LocalStructureHypothesis} from '../engines/reasoning/types';
import {mergeFunctionalGroups, type MergedGroup} from './evidenceMerge';
import {fmtIntegral, fmtMz, fmtShift13C, fmtShift1H, fmtWavenumber, shortenNumbers} from './format';
import {filterIrEvidence, hiddenNotice, matchFinding, type FunctionalGroupRow, type IrFindingRow} from './irEvidenceFilter';
import {obsLabels, type ObservationLike} from './obsLabel';
import {LimitedList} from './ShowMore';

/**
 * 「圖譜官能基」 tab (v1.2.2 P5, DESIGN_REPORT B1.4–B1.6): bulleted rows only, no inner scroll areas.
 * ① 官能基證據: same-name groups merged into one row (open for the peaks), IR-only isolated-peak groups hidden behind one notice (display filter, nothing deleted),
 *    the template sentences said once in the block note, observation ids shown as short labels, numbers rounded.
 * ② 分子連結（局部結構假設）: one summary line + folded details; ③ 化學環境: three folded blocks.
 * Reads the analysis output only.
 */
export interface FunctionalGroupTabProps {
  hasResult: boolean;
  groups: FunctionalGroupConstraint[];
  irFindings: IRFunctionalGroupFinding[];
  /** Traceable evidence list, used to name the related peaks of a row that has no observed signal text. */
  evidenceList: {inferredGroup?: string; spectrumType?: string; peakPosition?: string | number}[];
  observations?: readonly ObservationLike[];
  proton: any | null;
  carbon: any | null;
  ms: any | null;
  msmsProductIons: number | null;
  msmsNeutralLosses: number | null;
  tofFeatures: number | null;
  localStructures: readonly LocalStructureHypothesis[];
  hypotheses: readonly ChemicalHypothesis[];
  partialHypotheses?: readonly string[];
  /** Only MS-type data were given: the old "MS alone cannot determine a structure" note. */
  msOnlyNote: boolean;
  onNext: () => void;
}

const LEVEL_CLASS = {
  SUPPORTED: 'border-emerald-500/40 bg-emerald-950/60 text-emerald-300',
  POSSIBLE: 'border-cyan-500/40 bg-cyan-950/60 text-cyan-300',
  WEAK: 'border-slate-600 bg-slate-800 text-slate-300',
} as const;
const RESTRICTING = ['REQUIRED', 'FORBIDDEN', 'EXCLUDED', 'CONFLICTING'];
const TAG = 'rounded border px-1.5 py-0.5 text-[10px] font-semibold';
const FINDING_LEVEL: Record<string, string> = {Strong: '較支持', Moderate: '可能', Weak: '證據不足'};
const LIST_LIMIT = 10;
const LOCAL_LIMIT = 15;
const GROUP_LIMIT = 20;
const SUPPORT_TEXT = {SUPPORTED: '較支持', POSSIBLE: '可能', UNKNOWN: '未知'} as const;

function rowSupportText(fg: FunctionalGroupConstraint): string {
  return fg.status !== 'FORBIDDEN' && fg.status !== 'EXCLUDED' && fg.status !== 'CONFLICTING'
    ? fg.notes || fg.reasoning || '符合實驗特徵區間與結構約束'
    : '未觀測到足夠支持此官能基之實驗訊號';
}

function GroupRow({merged, groups, findingsOf, evidenceList}: {
  merged: MergedGroup;
  groups: FunctionalGroupConstraint[];
  findingsOf: (g: FunctionalGroupConstraint) => IRFunctionalGroupFinding | null;
  evidenceList: FunctionalGroupTabProps['evidenceList'];
}) {
  const rows = merged.rowIndexes.map(i => groups[i]);
  return (
    <li data-testid="fg-group" data-group={merged.name} data-level={merged.level} className="rounded-lg border border-slate-800 bg-slate-950/80 text-xs">
      <details>
        <summary className="flex cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5">
          <span className="text-sm font-bold text-slate-100">{merged.name}</span>
          <span className="font-mono text-[11px] text-cyan-300">— {merged.peakText}</span>
          <span className={`${TAG} ${LEVEL_CLASS[merged.level]}`}>{merged.levelText}</span>
          {merged.bandShape && <span className={`${TAG} border-slate-600 bg-slate-800 text-slate-300`}>{merged.bandShape}峰</span>}
          {merged.modalities.length >= 2 && <span className={`${TAG} border-violet-500/40 bg-violet-950/60 text-violet-200`}>跨模態印證 {merged.modalities.join('+')}</span>}
          {merged.restrictingStatus && <span className={`${TAG} border-rose-500/40 bg-rose-950/60 text-rose-300`}>{merged.restrictingStatus}</span>}
        </summary>
        <ul className="space-y-1.5 border-t border-slate-800 px-3 py-2">
          {rows.map((fg, i) => {
            const finding = findingsOf(fg);
            const related = fg.observedSignal
              ? `${(fg.sourceModalities?.length ? fg.sourceModalities : [fg.sourceModality]).join('+')} (${shortenNumbers(fg.observedSignal)})`
              : evidenceList.filter(ev => {
                  const inf = (ev.inferredGroup || '').toLowerCase(), name = merged.name.toLowerCase();
                  return inf && name && (inf.includes(name) || name.includes(inf));
                }).map(ev => `${ev.spectrumType}(${ev.peakPosition})`).join('、') || '跨譜規則評估';
            const restricting = RESTRICTING.includes(fg.status);
            return (
              <li key={i} className="space-y-0.5">
                <p className="font-mono text-[11px] text-cyan-200">
                  {finding ? `IR ${fmtWavenumber(finding.observedPeak)} cm⁻¹` : related}
                  <span className="ml-2 text-slate-400">{fg.status}{finding ? `｜${FINDING_LEVEL[finding.matchLevel]}` : ''}</span>
                </p>
                <p className="text-[11px] text-slate-300"><span className="font-semibold text-emerald-300">支持：</span>{shortenNumbers(finding?.chemicalInterpretation || finding?.reasoning || rowSupportText(fg))}</p>
                {restricting && <p className="text-[11px] text-slate-300"><span className="font-semibold text-rose-300">反對／排他：</span>{shortenNumbers(fg.notes || fg.reasoning || '實驗光譜缺乏此官能基必備吸收帶或共振峰')}</p>}
                {finding && (
                  <p className="text-[10px] text-slate-400">
                    {finding.observedWidthAndShape ? `${shortenNumbers(finding.observedWidthAndShape)}｜` : ''}
                    伴隨帶已觀測：{finding.companionPeaksObserved.length ? finding.companionPeaksObserved.join('、') : '無'}
                    <span className="ml-2 text-slate-500">{finding.id}</span>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </details>
    </li>
  );
}

function environmentLines(proton: any, carbon: any, ms: any) {
  const h = (proton?.environments ?? []).map((env: any, i: number) => {
    const shift = Number(env.shiftPpm ?? env.chemicalShift ?? env.shift ?? 0);
    const integ = env.integration ?? env.integral ?? '—';
    const text = env.environmentLabel || env.environment || env.environmentType || env.regionCategory || '質子共振環境';
    return {key: `h${i}`, head: `δ ${fmtShift1H(shift)} ppm (${env.multiplicity || 's'}, ${typeof integ === 'number' ? fmtIntegral(integ) : integ}H)`, text: `環境：${text}`};
  });
  const c = (carbon?.environments ?? []).map((cEnv: any, i: number) => {
    const shift = Number(cEnv.shiftPpm ?? cEnv.chemicalShift ?? cEnv.shift ?? 0);
    return {key: `c${i}`, head: `δ ${fmtShift13C(shift)} ppm (${cEnv.deptType || 'C'})`, text: `→ ${cEnv.regionCategory || cEnv.assignment || cEnv.regionLabel || '碳化學環境'}`};
  });
  return {h, c, losses: (ms?.neutralLosses ?? []) as any[]};
}

function Fold({title, count, testId, children}: {title: string; count?: number; testId: string; children: React.ReactNode}) {
  return (
    <details data-testid={testId} className="rounded-lg border border-slate-800 bg-slate-950/70 text-xs">
      <summary className="cursor-pointer px-3 py-1.5 font-semibold text-slate-200">{title}{count !== undefined && <span className="ml-1.5 font-mono text-[11px] text-cyan-300">{count}</span>}</summary>
      <div className="space-y-1.5 border-t border-slate-800 px-3 py-2">{children}</div>
    </details>
  );
}

function LocalStructureSection({locals, hypotheses, observations}: {locals: readonly LocalStructureHypothesis[]; hypotheses: readonly ChemicalHypothesis[]; observations?: readonly ObservationLike[]}) {
  const level = (k: LocalStructureHypothesis['supportLevel']) => locals.filter(l => l.supportLevel === k).length;
  const rel = (k: string) => locals.reduce((n, l) => n + l.relations.filter(r => r.kind === k).length, 0);
  const possible = rel('POSSIBLE_CONNECTION') + rel('SUPPORTED_CONNECTION'), unknown = rel('UNKNOWN'), excluded = rel('EXCLUDED_BY_VALENCE');
  return (
    <section data-testid="fg-local-structures" className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/80 p-4">
      <h2 className="text-sm font-bold text-slate-100">分子連結（局部結構假設）證據</h2>
      {locals.length === 0 ? (
        <p className="text-xs text-slate-400">這次分析沒有產生局部結構假設。</p>
      ) : (
        <>
          <p className="text-xs text-slate-300">
            {locals.length} 個局部結構（較支持 {level('SUPPORTED')}、可能 {level('POSSIBLE')}{level('UNKNOWN') ? `、未知 ${level('UNKNOWN')}` : ''}）；
            彼此的連結關係：{possible} 組可能連結、{unknown} 組未知{excluded ? `、${excluded} 組被價數排除` : ''}。
          </p>
          <p data-testid="fg-local-note" className="text-[11px] text-slate-400">這些連結共享同一個觀測，不可當成兩個獨立片段必須共存；沒有 COSY／HSQC／HMBC 直接觀測連接。局部結構只是假設，不是完整候選。</p>
          <Fold title="局部結構明細" count={locals.length} testId="fg-local-details">
            <LimitedList items={locals} limit={LOCAL_LIMIT} as="ul" className="space-y-1.5" label="個" render={l => (
              <li key={l.id} data-local-ref={l.id} className="rounded border border-slate-800 p-2">
                <p className="font-semibold text-slate-100">{l.description} <span className="font-mono text-[10px] text-slate-500">{l.id}</span> <span className="text-[11px] text-cyan-300">{SUPPORT_TEXT[l.supportLevel]}</span></p>
                <p className="text-[11px] text-slate-300">原子 {l.atoms.map(a => a.element).join('–')}；{l.bonds.length} 鍵；{l.ports.length} 個開放連接點</p>
                <p className="text-[11px] text-slate-300">來源觀測：{obsLabels(l.observationIds, observations)}</p>
                {l.unknown[0] && <p className="text-[11px] text-slate-400">{l.unknown[0]}</p>}
                <p className="text-[10px] text-slate-500">
                  {(['POSSIBLE_CONNECTION', 'UNKNOWN', 'EXCLUDED_BY_VALENCE', 'SUPPORTED_CONNECTION'] as const).flatMap(k => {
                    const ids = l.relations.filter(r => r.kind === k).map(r => r.otherId);
                    return ids.length ? [`${{POSSIBLE_CONNECTION: '可能連結', UNKNOWN: '未知', EXCLUDED_BY_VALENCE: '被價數排除', SUPPORTED_CONNECTION: '較支持連結'}[k]}：${ids.join('、')}`] : [];
                  }).join('｜')}
                </p>
                <p className="text-[10px] text-slate-500">完整觀測 ID：{l.observationIds.join('、')}</p>
              </li>
            )} />
          </Fold>
        </>
      )}
      {hypotheses.length > 0 && (
        <Fold title="競爭化學環境與觀測來源" count={hypotheses.length} testId="fg-competing-hypotheses">
          <LimitedList items={hypotheses} limit={LIST_LIMIT} as="ul" className="space-y-1" label="項" render={h => (
            <li key={h.id} className="text-[11px] text-slate-300">
              <span className="font-mono text-slate-500">{h.id}</span>／{h.description}：{h.support.map(s => shortenNumbers(s)).join('；')}。替代假設 {h.alternativeIds.join(', ') || '尚未列出'}{h.uncertainties[0] ? `；${h.uncertainties[0]}` : ''}
            </li>
          )} />
        </Fold>
      )}
    </section>
  );
}

export function FunctionalGroupTab(p: FunctionalGroupTabProps) {
  const rows = p.groups as FunctionalGroupRow[];
  const findings = p.irFindings.filter(f => f.status !== 'ABSENT') as unknown as IrFindingRow[];
  const filter = filterIrEvidence(rows, findings);
  const merged = mergeFunctionalGroups(rows, findings);
  const hiddenNames = new Set(filter.hidden.map(g => g.name));
  const rank = (m: MergedGroup) => (m.restrictingStatus ? 0 : 1) * 10 + (m.level === 'SUPPORTED' ? 0 : m.level === 'POSSIBLE' ? 1 : 2);
  const sorted = [...merged].sort((a, b) => rank(a) - rank(b));
  const shown = sorted.filter(m => !hiddenNames.has(m.name)), hidden = sorted.filter(m => hiddenNames.has(m.name));
  const findingsOf = (g: FunctionalGroupConstraint): IRFunctionalGroupFinding | null => (g.sourceModality === 'IR' ? (matchFinding(g, findings) as unknown as IRFunctionalGroupFinding | null) : null);
  const used = new Set(p.groups.flatMap(g => { const f = findingsOf(g); return f ? [f.id] : []; }));
  const unmatched = p.irFindings.filter(f => f.status !== 'ABSENT' && !used.has(f.id));
  const notice = hiddenNotice(filter);
  const env = environmentLines(p.proton, p.carbon, p.ms);
  const renderGroup = (m: MergedGroup) => <GroupRow key={m.name} merged={m} groups={p.groups} findingsOf={findingsOf} evidenceList={p.evidenceList} />;

  if (!p.hasResult) {
    return <p className="rounded-xl border border-dashed border-slate-800 p-6 text-center text-xs text-slate-400">尚未分析。按上方「開始分析」後，這裡會列出圖譜上的官能基證據。</p>;
  }
  return (
    <>
      {!!p.partialHypotheses?.length && <ul data-testid="local-structure-hypotheses" className="text-xs text-slate-300">{p.partialHypotheses.map((h, i) => <li key={i}>{h}</li>)}</ul>}
      <section data-testid="fg-evidence" className="space-y-2 rounded-xl border border-cyan-500/30 bg-slate-900/90 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-cyan-200">官能基證據</h2>
          <span className="rounded border border-cyan-500/30 bg-cyan-950/60 px-2.5 py-0.5 font-mono text-[11px] font-bold text-cyan-300">
            {merged.length} 種官能基{hidden.length ? `（顯示 ${shown.length}、隱藏 ${hidden.length}）` : ''}
          </span>
        </div>
        <p data-testid="fg-block-note" className="text-[11px] leading-relaxed text-slate-400">
          每一行是一種官能基，點開看每個峰與伴隨帶。目前僅依賴單一模態之孤立峰支持，吸收帶可能受重疊或化學環境影響，不可單憑此單一峰斷言唯一官能基，需結合其他光譜或分子式綜合確認；
          已獲 X+Y 跨模態雙重印證者標「跨模態印證」，不確定性較低；建議結合互補光譜模態（如 ¹³C NMR 或 MS）進一步降低同分異構物不確定性。
        </p>
        {merged.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-800 bg-slate-950/50 p-6 text-center text-xs text-slate-400">
            目前尚無已校正之特徵光譜峰可供官能基判讀。若您僅輸入分子式，請直接參閱「預測結構」；若已標記圖片訊號，請確認已於第 2 頁套用座標校正。
          </div>
        ) : (
          <>
            <LimitedList items={shown} limit={GROUP_LIMIT} as="ul" className="space-y-1.5" label="種" testId="fg-group-list" render={renderGroup} />
            {hidden.length > 0 && notice && (
              <details data-testid="fg-hidden-groups" className="rounded-lg border border-dashed border-slate-700 bg-slate-950/50 text-xs">
                <summary className="cursor-pointer px-3 py-1.5 text-slate-300">{notice}</summary>
                <div className="border-t border-slate-800 px-3 py-2">
                  <p className="mb-1.5 text-[11px] text-slate-400">只有 IR、只有一個孤立峰、沒有任何伴隨帶被觀測；這只是不預設顯示，資料與匯出內容不變。</p>
                  <LimitedList items={hidden} limit={GROUP_LIMIT} as="ul" className="space-y-1.5" label="種" render={renderGroup} />
                </div>
              </details>
            )}
            {unmatched.length > 0 && (
              <Fold title="其他 IR 吸收帶判讀" count={unmatched.length} testId="fg-other-ir">
                <LimitedList items={unmatched} limit={LIST_LIMIT} as="ul" className="space-y-1" label="項" render={f => (
                  <li key={f.id} className="text-[11px] text-slate-300">
                    <span className="font-mono text-cyan-200">IR {fmtWavenumber(f.observedPeak)} cm⁻¹</span>　{f.groupName || f.functionalGroup}｜{FINDING_LEVEL[f.matchLevel]}：{shortenNumbers(f.chemicalInterpretation || f.reasoning || '')}
                  </li>
                )} />
              </Fold>
            )}
          </>
        )}
      </section>

      <LocalStructureSection locals={p.localStructures} hypotheses={p.hypotheses} observations={p.observations} />

      <section data-testid="fg-environments" className="space-y-1.5 rounded-xl border border-slate-800 bg-slate-900/80 p-4">
        <h2 className="text-sm font-bold text-slate-100">化學環境</h2>
        <p className="text-[11px] text-slate-400">IR 吸收帶的判讀已併入上方官能基列；以下是其他光譜的環境內容。</p>
        <Fold title="¹H NMR 質子環境與自旋偶合" count={p.proton ? env.h.length : undefined} testId="fg-env-h1">
          {p.proton ? (
            <LimitedList items={env.h} limit={LIST_LIMIT} as="ul" className="space-y-1" label="組" render={(e: any) => (
              <li key={e.key} className="text-[11px]"><span className="font-mono font-semibold text-cyan-200">{e.head}</span>　<span className="text-slate-300">{e.text}</span></li>
            )} />
          ) : <p className="text-[11px] text-slate-500">未提供 ¹H NMR 光譜</p>}
        </Fold>
        <Fold title="¹³C NMR 碳骨架與對稱性" count={p.carbon ? env.c.length : undefined} testId="fg-env-c13">
          {p.carbon ? (
            <>
              {(p.carbon.symmetryAndOverlapNote || p.carbon.symmetryAssessment) && <p className="text-[11px] text-slate-300">{p.carbon.symmetryAndOverlapNote || p.carbon.symmetryAssessment}</p>}
              <LimitedList items={env.c} limit={LIST_LIMIT} as="ul" className="space-y-1" label="組" render={(e: any) => (
                <li key={e.key} className="font-mono text-[11px]"><span className="text-amber-300">{e.head}</span> <span className="text-slate-300">{e.text}</span></li>
              )} />
            </>
          ) : <p className="text-[11px] text-slate-500">未提供 ¹³C NMR 光譜</p>}
        </Fold>
        <Fold title="MS / MS/MS / ToF-SIMS 裂解診斷" testId="fg-env-ms">
          {p.ms ? (
            <>
              <p className="font-mono text-[11px] text-slate-200">M+• = {p.ms.estimatedMolecularIonMz == null ? '—' : fmtMz(Number(p.ms.estimatedMolecularIonMz))}　|　Base Peak = {p.ms.basePeakMz == null ? '—' : fmtMz(Number(p.ms.basePeakMz))}</p>
              <LimitedList items={env.losses} limit={LIST_LIMIT} as="ul" className="space-y-1" label="條" render={(nl: any, i: number) => (
                <li key={i} className="text-[11px] text-slate-300"><span className="font-mono text-amber-300">-Δ{fmtMz(Number(nl.lossMass))} Da:</span> {nl.lostNeutralFormula} ({nl.chemicalMeaning})</li>
              )} />
            </>
          ) : <p className="text-[11px] text-slate-500">未提供一級 MS 質譜</p>}
          {p.msmsProductIons !== null && <p className="text-[11px] text-violet-200"><strong>MS/MS 診斷：</strong>共擷取 {p.msmsProductIons} 個子離子與 {p.msmsNeutralLosses ?? 0} 條中性脫去路徑</p>}
          {p.tofFeatures !== null && <p className="text-[11px] text-violet-200"><strong>ToF-SIMS 診斷：</strong>共解析 {p.tofFeatures} 個表面特徵二次離子</p>}
        </Fold>
        {p.msOnlyNote && <p className="text-xs text-amber-200">本版本可利用 MS 質量、可能分子式及碎片資訊提供結構限制，但尚無法僅憑 MS 資料可靠確定完整分子結構，建議搭配 IR 或 NMR。</p>}
      </section>

      <div className="flex justify-end">
        <button type="button" onClick={p.onNext} className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-bold text-white hover:bg-cyan-500">看預測結構 <ArrowRight className="h-4 w-4" /></button>
      </div>
    </>
  );
}
