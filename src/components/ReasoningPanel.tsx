import React from 'react';
import type {AnalysisProgress,ReasoningTrace,CandidateReasoning} from '../engines/reasoning/types';
import {v12AssemblyLines} from '../engines/reasoning/assemblyText';
export function ReasoningPanel({trace,progress,busy}:{trace?:ReasoningTrace;progress:AnalysisProgress|null;busy:boolean}){
 if(!trace&&!progress)return null;
 const locals=busy?progress?.localStructures:trace?.localStructures??progress?.localStructures;
 return <section data-testid="six-step-reasoning" className="rounded border border-slate-700 bg-slate-950 p-3 text-xs">
  <p className="font-bold text-cyan-300">六步驟化學推理（本地規則／分子圖，無外部 AI API）</p>
  {busy&&progress&&<p role="status" data-testid="analysis-progress">步驟{progress.step}/6：{progress.stage}；已展開 {progress.visited??0} 狀態、取得 {progress.candidateCount??0} 個待驗證圖；搜尋 {(Math.max(0,progress.elapsedMs??0)/1000).toFixed(1)} 秒</p>}
  {!busy&&trace&&<ol className="mt-2 space-y-1">{trace.stages.map(s=><li key={s.step} data-testid={`reasoning-step-${s.step}`}><strong>{s.step}. {s.module}</strong> — {s.summary}</li>)}</ol>}
  {locals&&locals.length>0&&<details open data-testid="local-structure-plan"><summary>局部結構假設：{locals.length}個（不是完整候選）</summary><div className="mt-1 grid grid-cols-2 gap-2">{locals.map(l=><div key={l.id} data-local-id={l.id} className="rounded border border-slate-800 p-2"><b>{l.description}</b><p>{l.id}；原子 {l.atoms.map(a=>a.element).join('–')}；{l.bonds.length}鍵；{l.ports.length}開放連接點</p><p>來源觀測：{l.observationIds.join('、')}</p><p className="text-slate-400">{l.unknown[0]}</p></div>)}</div></details>}
  {!busy&&trace&&<details><summary>競爭化學環境與觀測來源（{trace.hypotheses.length}項）</summary>{trace.hypotheses.map(h=><p key={h.id}>{h.id}／{h.description}：{h.support.join('；')}。替代假設 {h.alternativeIds.join(', ')||'尚未列出'}；{h.uncertainties[0]}</p>)}</details>}
 </section>;
}
export function CandidateReasoningDetails({record:r}:{record?:CandidateReasoning}){
 if(!r)return null;
 return <details className="my-2 text-[11px] text-slate-300" data-testid="candidate-reasoning"><summary>候選組裝與驗證證據</summary><p>局部圖：{r.localStructureIds.join('、')||'通用原子／鍵擴展；未指派特定局部圖'}</p><p>組裝提案（不是直接觀測鍵結）：{r.assembly?.operations.join(' → ')??'組裝來源未提供'}</p>{r.assembly?.v12&&<div data-testid="candidate-v12-assembly">{v12AssemblyLines(r.assembly.v12).map((t,i)=><p key={i}>{t}</p>)}</div>}{r.evidence.map((e,i)=><p key={i}>{e.status}／{e.modality}：{e.observationIds.length?`${e.observationIds.join(', ')}；`:''}{e.method}</p>)}<p className="text-amber-300">{r.limitations.join('；')}</p></details>;
}
