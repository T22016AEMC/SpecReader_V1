import React, { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FlaskConical,
  HelpCircle,
  Layers,
  Search,
  Sparkles,
  XCircle,
} from "lucide-react";
import { BidirectionalValidationReport } from "../engines/scientificEngines/predictionAndValidationFramework";
import { ExperimentalSpectrumData, SpectrumModality } from "../types/spectrum";
import { SpectrumViewer } from "./SpectrumViewer";
import { StructureRenderer2D } from "./StructureRenderer2D";

interface StructureSpectrumValidationPageProps {
  bidirectionalReport: BidirectionalValidationReport | null;
  experimentalSpectra: Partial<Record<SpectrumModality, ExperimentalSpectrumData>>;
  customStructureInput: string;
  onChangeStructureInput: (val: string) => void;
  selectedModalities?: SpectrumModality[];
  onToggleModality?: (mod: SpectrumModality) => void;
  onExecutePrediction?: (overrideStructureInput?: string) => void;
  predictionError?: string | null;
  onApplyPresetSmiles?: (smiles: string, label: string) => void;
}

const QUICK_STRUCTURES = [
  {
    label: "乙醯水楊酸 (Aspirin, C9H8O4)",
    smiles: "CC(=O)Oc1ccccc1C(=O)O",
  },
  {
    label: "對乙醯氧基苯甲酸 (Para 異構物, C9H8O4)",
    smiles: "CC(=O)Oc1ccc(C(=O)O)cc1",
  },
  {
    label: "對乙醯胺基酚 (Paracetamol, C8H9NO2)",
    smiles: "CC(=O)Nc1ccc(O)cc1",
  },
  {
    label: "苯甲酸乙酯 (Ethyl Benzoate, C9H10O2)",
    smiles: "CCOC(=O)c1ccccc1",
  },
  {
    label: "乙酸苄酯 (Benzyl Acetate, C9H10O2)",
    smiles: "CC(=O)OCc1ccccc1",
  },
  {
    label: "苯乙酮 (Acetophenone, C8H8O)",
    smiles: "CC(=O)c1ccccc1",
  },
  {
    label: "乙酸乙酯 (Ethyl Acetate, C4H8O2)",
    smiles: "CCOC(=O)C",
  },
];

const ALL_PREDICTABLE_MODALITIES: { id: SpectrumModality; label: string }[] = [
  { id: "IR", label: "IR 紅外光譜" },
  { id: "1H_NMR", label: "¹H NMR 氫譜" },
  { id: "13C_NMR", label: "¹³C NMR 碳譜" },
  { id: "MS", label: "MS 質譜" },
];

export const StructureSpectrumValidationPage: React.FC<
  StructureSpectrumValidationPageProps
> = ({
  bidirectionalReport,
  experimentalSpectra,
  customStructureInput,
  onChangeStructureInput,
  selectedModalities = ["IR", "1H_NMR", "13C_NMR", "MS"],
  onToggleModality,
  onExecutePrediction,
  predictionError,
}) => {
  const [activeModality, setActiveModality] = useState<SpectrumModality>("IR");
  const [enableExpOverlay, setEnableExpOverlay] = useState<boolean>(false);

  const structure = bidirectionalReport?.structure;
  const modalityReports = bidirectionalReport?.modalityReports;
  const overallConsistencyScore =
    bidirectionalReport?.overallConsistencyScore ?? null;
  const overallVerdict = bidirectionalReport?.overallVerdict ?? "AWAITING_INPUT";
  const currentModalityReport = modalityReports?.[activeModality];
  const expSpec = experimentalSpectra[activeModality];

  return (
    <div className="space-y-5">
      {/* Mode B 獨立工作區說明橫幅 */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-amber-500 px-2 py-0.5 font-mono text-[11px] font-extrabold text-slate-950">
              MODE B 獨立預測模式
            </span>
            <h2 className="text-sm font-bold text-amber-200">
              輸入分子結構 → 選擇預測模態 → 執行反向光譜預測 (Structure → Predicted Spectrum)
            </h2>
          </div>
          <p className="mt-0.5 text-xs text-slate-300">
            此模式與 Mode A 完全執行隔離：不會因 Mode A 候選結構自動啟動，也不會將 PREDICTED 預測光譜混入 EXPERIMENTAL 實驗證據。
          </p>
        </div>
        {Object.keys(experimentalSpectra).length > 0 && (
          <button
            type="button"
            onClick={() => setEnableExpOverlay((prev) => !prev)}
            className={`rounded-lg border px-3 py-1.5 font-mono text-xs font-semibold transition ${
              enableExpOverlay
                ? "border-cyan-500 bg-cyan-950/70 text-cyan-200"
                : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600"
            }`}
          >
            {enableExpOverlay
              ? "✓ 已啟用：與實驗光譜疊圖比對"
              : "選用：疊加實驗光譜比對"}
          </button>
        )}
      </div>

      {/* 頂部結構輸入、模態選擇與明確執行按鈕 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 lg:col-span-7">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-100">
                1. 輸入有效分子結構並選擇欲預測之光譜種類
              </h3>
              <p className="mt-0.5 text-xs text-slate-400">
                請明確輸入 SMILES 或化合物名稱，勾選要預測的光譜模態後點擊「執行反向光譜預測」。
              </p>
            </div>
            {enableExpOverlay && overallConsistencyScore !== null ? (
              <div className="text-right">
                <div className="font-mono text-xl font-bold text-cyan-300">
                  {overallConsistencyScore}%
                </div>
                <div className="text-[10px] text-slate-400">
                  雙向疊圖綜合吻合度
                </div>
              </div>
            ) : (
              <span className="rounded border border-amber-500/40 bg-amber-950/50 px-2.5 py-1 font-mono text-xs font-semibold text-amber-300">
                {bidirectionalReport
                  ? "PREDICTED [THEORETICAL / EMPIRICAL]"
                  : "AWAITING USER EXECUTION"}
              </span>
            )}
          </div>

          {/* 結構輸入框 + 明確執行按鈕 */}
          <div className="mt-3 flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="text"
                value={customStructureInput}
                onChange={(e) => onChangeStructureInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onExecutePrediction?.();
                  }
                }}
                placeholder="輸入有效 SMILES（例如 CC(=O)Oc1ccccc1C(=O)O）或化合物名稱..."
                className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 font-mono text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => onExecutePrediction?.()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-xs font-extrabold text-slate-950 shadow-sm hover:bg-amber-400"
            >
              <Sparkles className="h-3.5 w-3.5" />
              執行反向光譜預測
            </button>
          </div>

          {/* 選擇要預測的光譜種類 */}
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2">
            <span className="text-xs font-semibold text-slate-300">
              選擇欲預測之光譜種類：
            </span>
            {ALL_PREDICTABLE_MODALITIES.map((m) => {
              const checked = selectedModalities.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onToggleModality?.(m.id)}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-xs font-semibold transition ${
                    checked
                      ? "border-amber-500 bg-amber-950/70 text-amber-200"
                      : "border-slate-800 bg-slate-900 text-slate-500 hover:text-slate-300"
                  }`}
                >
                  <span>{checked ? "☑" : "☐"}</span>
                  <span>{m.label}</span>
                </button>
              );
            })}
          </div>

          {/* 錯誤或未輸入提示 */}
          {predictionError && (
            <div className="mt-3 rounded-lg border border-rose-500/40 bg-rose-950/30 p-3 text-xs text-rose-200">
              <strong className="font-bold text-rose-300">結構輸入檢核提示：</strong>{" "}
              {predictionError}
            </div>
          )}

          {/* 快速切換結構與同分異構物對照 */}
          <div className="mt-3">
            <div className="mb-1.5 text-[11px] font-medium text-slate-400">
              範例分子結構（點擊將填入結構並執行 Mode B 預測）：
            </div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_STRUCTURES.map((q) => {
                const isCurrent = customStructureInput.trim() === q.smiles;
                return (
                  <button
                    key={q.smiles}
                    type="button"
                    onClick={() => {
                      onChangeStructureInput(q.smiles);
                      onExecutePrediction?.(q.smiles);
                    }}
                    className={`rounded border px-2 py-1 text-[11px] transition ${
                      isCurrent
                        ? "border-amber-500 bg-amber-950/60 font-semibold text-amber-200"
                        : "border-slate-800 bg-slate-950/80 text-slate-300 hover:border-slate-700"
                    }`}
                  >
                    {q.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 結構正規化摘要 */}
          {structure ? (
            <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-800/80 pt-3 sm:grid-cols-4">
              <div className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-2">
                <div className="text-[10px] text-slate-400">正規化分子式</div>
                <div className="mt-0.5 font-mono text-xs font-bold text-cyan-300">
                  {structure.molecularFormula}
                </div>
              </div>
              <div className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-2">
                <div className="text-[10px] text-slate-400">精確質量 / 標稱質量</div>
                <div className="mt-0.5 font-mono text-xs font-bold text-slate-200">
                  {Number(structure.exactMass || 0).toFixed(4)} /{" "}
                  {structure.nominalMass ?? Math.round(structure.exactMass || 0)} Da
                </div>
              </div>
              <div className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-2">
                <div className="text-[10px] text-slate-400">不飽和度 (IHD / DBE)</div>
                <div className="mt-0.5 font-mono text-xs font-bold text-amber-300">
                  {structure.unsaturationIndex ?? structure.dbe ?? 0}
                </div>
              </div>
              <div className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-2">
                <div className="text-[10px] text-slate-400">資料性質標示</div>
                <div className="mt-0.5 font-mono text-xs font-bold text-amber-300">
                  PREDICTED ({overallVerdict})
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-dashed border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-400">
              尚未執行 Mode B 反向光譜預測。請於上方輸入有效化學結構（SMILES 或名稱），選擇欲預測之光譜種類，並點擊「執行反向光譜預測」按鈕。系統不會自動套用 Mode A 候選結構替代。
            </div>
          )}
        </div>

        {/* 右側 2D 結構骨架渲染與圖驗證狀態 */}
        <div className="lg:col-span-5">
          <StructureRenderer2D
            smiles={structure?.smiles || customStructureInput}
            formula={structure?.molecularFormula}
            title={structure?.rawInput}
          />
        </div>
      </div>

      {!bidirectionalReport || !modalityReports || !currentModalityReport ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-center text-sm text-slate-400">
          請先提供有效分子結構並點擊「執行反向光譜預測」，即可檢視所選光譜種類之 PREDICTED 理論預測光譜與特徵峰表。
        </div>
      ) : (
        <>

      {/* 四模態切換器與狀態列 */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {(["IR", "1H_NMR", "13C_NMR", "MS"] as SpectrumModality[]).map((mod) => {
          const rep = modalityReports[mod];
          const isSelected = activeModality === mod;
          const isModalityChecked = selectedModalities.includes(mod);
          return (
            <button
              key={mod}
              type="button"
              onClick={() => setActiveModality(mod)}
              className={`flex flex-col justify-between rounded-xl border p-3 text-left transition ${
                isSelected
                  ? "border-amber-500 bg-amber-950/30 shadow-sm"
                  : isModalityChecked
                    ? "border-slate-800 bg-slate-900/70 hover:border-slate-700"
                    : "border-slate-900 bg-slate-950/40 opacity-60"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-slate-100">
                  {mod === "1H_NMR"
                    ? "¹H NMR"
                    : mod === "13C_NMR"
                      ? "¹³C NMR"
                      : mod}
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                    rep.status === "SUPPORTED"
                      ? "bg-emerald-950/70 text-emerald-300 border border-emerald-500/30"
                      : rep.status === "COMPATIBLE"
                        ? "bg-cyan-950/70 text-cyan-300 border border-cyan-500/30"
                        : rep.status === "CONTRADICTED"
                          ? "bg-rose-950/70 text-rose-300 border border-rose-500/30"
                          : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {rep.status === "NOT_PROVIDED" ? "NOT PROVIDED" : rep.status}
                </span>
              </div>
              <div className="mt-2 flex items-baseline justify-between font-mono text-xs">
                <span className="text-slate-400">
                  {rep.experimentalProvided
                    ? `吻合 ${rep.compatibleCount + rep.shiftedCount} / 缺漏 ${rep.missingPeakCount}`
                    : "僅顯示理論預測譜"}
                </span>
                {rep.consistencyScore !== null && (
                  <span className="font-bold text-cyan-300">
                    {rep.consistencyScore}%
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* 理論預測光譜視覺化（預設獨立顯示理論預測光譜，僅在使用者主動開啟疊圖時疊加實驗光譜） */}
      <SpectrumViewer
        spectrum={
          enableExpOverlay && expSpec
            ? expSpec
            : currentModalityReport.predictedSpectrum
        }
        overlaySpectrum={
          enableExpOverlay && expSpec
            ? currentModalityReport.predictedSpectrum
            : undefined
        }
        height={300}
      />

      {/* 吻合峰 / 缺漏峰 / 額外峰 / 溶劑峰 雙向對齊明細表 */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-bold text-slate-100">
              {activeModality === "1H_NMR"
                ? "¹H NMR"
                : activeModality === "13C_NMR"
                  ? "¹³C NMR"
                  : activeModality}{" "}
              雙向峰位對齊與差異診斷 (Compatible / Missing / Extra Peaks)
            </h4>
            <p className="text-xs text-slate-400">
              {currentModalityReport.summaryText}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
            <span className="rounded border border-emerald-500/30 bg-emerald-950/40 px-2 py-0.5 text-emerald-300">
              Compatible: {currentModalityReport.compatibleCount}
            </span>
            <span className="rounded border border-cyan-500/30 bg-cyan-950/40 px-2 py-0.5 text-cyan-300">
              Shifted: {currentModalityReport.shiftedCount}
            </span>
            <span className="rounded border border-amber-500/30 bg-amber-950/40 px-2 py-0.5 text-amber-300">
              Missing: {currentModalityReport.missingPeakCount}
            </span>
            <span className="rounded border border-rose-500/30 bg-rose-950/40 px-2 py-0.5 text-rose-300">
              Extra: {currentModalityReport.extraPeakCount}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] text-slate-400">
                <th className="py-2 pr-3">分類狀態</th>
                <th className="px-3 py-2 font-mono">理論預測位置</th>
                <th className="px-3 py-2 font-mono">實驗觀測位置</th>
                <th className="px-3 py-2 font-mono">偏差 Δ</th>
                <th className="px-3 py-2">官能基 / 化學環境歸屬</th>
                <th className="py-2 pl-3">雙向驗證說明</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {currentModalityReport.items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-800/30">
                  <td className="py-2 pr-3">
                    {item.category === "COMPATIBLE" && (
                      <span className="inline-flex items-center gap-1 rounded bg-emerald-950/60 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-300 border border-emerald-500/30">
                        <CheckCircle2 className="h-3 w-3" />
                        COMPATIBLE
                      </span>
                    )}
                    {item.category === "SHIFTED" && (
                      <span className="inline-flex items-center gap-1 rounded bg-cyan-950/60 px-2 py-0.5 font-mono text-[10px] font-semibold text-cyan-300 border border-cyan-500/30">
                        <Layers className="h-3 w-3" />
                        SHIFTED
                      </span>
                    )}
                    {item.category === "MISSING_IN_EXPERIMENTAL" && (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-950/60 px-2 py-0.5 font-mono text-[10px] font-semibold text-amber-300 border border-amber-500/30">
                        <AlertCircle className="h-3 w-3" />
                        MISSING PEAK
                      </span>
                    )}
                    {item.category === "EXTRA_IN_EXPERIMENTAL" && (
                      <span className="inline-flex items-center gap-1 rounded bg-rose-950/60 px-2 py-0.5 font-mono text-[10px] font-semibold text-rose-300 border border-rose-500/30">
                        <XCircle className="h-3 w-3" />
                        EXTRA PEAK
                      </span>
                    )}
                    {item.category === "SOLVENT_IGNORED" && (
                      <span className="inline-flex items-center gap-1 rounded bg-violet-950/60 px-2 py-0.5 font-mono text-[10px] font-semibold text-violet-300 border border-violet-500/30">
                        <FlaskConical className="h-3 w-3" />
                        SOLVENT IGNORED
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-slate-200">
                    {item.predictedPosition !== undefined
                      ? `${item.predictedPosition} ${item.unit}`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-cyan-300">
                    {item.experimentalPosition !== undefined
                      ? `${item.experimentalPosition} ${item.unit}`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-slate-300">
                    {item.delta !== undefined
                      ? `${item.delta} ${item.unit}`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-200">
                    {item.featureAssignment}
                  </td>
                  <td className="py-2 pl-3 text-slate-400">
                    {item.explanation}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
        </>
      )}
    </div>
  );
};
