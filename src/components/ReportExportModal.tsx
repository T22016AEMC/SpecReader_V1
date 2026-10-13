import React, { useState } from "react";
import {
  Check,
  Copy,
  Download,
  FileCode,
  FileText,
  Printer,
  Sparkles,
  X,
} from "lucide-react";
import { WorkbenchOrchestrationState } from "../engines/workbenchOrchestrator";

interface ReportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  orchestrationState: WorkbenchOrchestrationState;
}

export const ReportExportModal: React.FC<ReportExportModalProps> = ({
  isOpen,
  onClose,
  orchestrationState,
}) => {
  const [copied, setCopied] = useState(false);
  const [aiCommentary, setAiCommentary] = useState<string | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  if (!isOpen) return null;

  const { modeAReport, rankedCandidates, validationMatrix } = orchestrationState;
  const topCandidate = rankedCandidates[0];

  const generateMarkdownReport = (): string => {
    const lines: string[] = [
      `# SpecReader 規則與證據導向多光譜結構解析報告`,
      `生成時間：${new Date().toLocaleString()}`,
      `已載入模態：${modeAReport.activeModalities.join(", ") || "無"}`,
      ``,
      `## 一、首選結構結論 (Top #1 Candidate)`,
      topCandidate
        ? `- **化合物名稱**：${topCandidate.name} (${topCandidate.iupacName})\n- **分子式**：${topCandidate.molecularFormula} (IHD = ${topCandidate.unsaturationIndex})\n- **SMILES**：\`${topCandidate.smiles}\`\n- **綜合光譜吻合度**：${topCandidate.scoreBreakdown.totalScore}%`
        : `- 尚未生成候選結構`,
      ``,
      `## 二、跨模態結構約束匯總 (Structural Constraints)`,
      `- **使用者輸入分子式 (Formula Input)**：${modeAReport.constraints.userSuppliedFormula ? `${modeAReport.constraints.userSuppliedFormula.normalizedFormula} (IHD = ${modeAReport.constraints.userSuppliedFormula.ihd})` : "NOT PROVIDED"}`,
      `- **推估標稱分子量 (MS)**：${modeAReport.constraints.estimatedMolecularWeight ?? "NOT PROVIDED"}`,
      `- **氮規則奇偶性**：${modeAReport.constraints.nitrogenRuleParity ?? "NOT PROVIDED"}`,
      `- **¹H NMR 總積分**：${modeAReport.constraints.estimatedProtonCount ?? "NOT PROVIDED"} H`,
      `- **¹³C NMR 碳化學環境數**：${modeAReport.constraints.estimatedCarbonEnvironmentCount ?? "NOT PROVIDED"} 組`,
      `- **芳環取代型態**：${modeAReport.constraints.aromaticSubstitutionPattern ?? "UNKNOWN"}`,
      ``,
      `## 三、跨光譜驗證矩陣 (Cross-Spectrum Validation Matrix)`,
      `| 排名 | 候選結構 | 分子式 | IR | ¹H NMR | ¹³C NMR | MS | MS/MS | ToF-SIMS | 總分 |`,
      `| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |`,
      ...validationMatrix.map(
        (row, idx) =>
          `| #${idx + 1} | ${row.candidateName} | ${row.formula} | ${row.modalityStatus.IR} | ${row.modalityStatus["1H_NMR"]} | ${row.modalityStatus["13C_NMR"]} | ${row.modalityStatus.MS} | ${row.modalityStatus["MS/MS"] ?? "NOT_PROVIDED"} | ${row.modalityStatus["ToF-SIMS"] ?? "NOT_PROVIDED"} | ${row.totalScore}% |`
      ),
      ``,
      `## 四、確定性證據鏈 (Evidence Chain)`,
      ...modeAReport.evidenceChain.map(
        (step) =>
          `${step.stepOrder}. **[${step.modality}]** ${step.observation}\n   - 化學意義：${step.chemicalMeaning}\n   - 結構約束：${step.structuralConstraint}`
      ),
    ];

    if (aiCommentary) {
      lines.push(
        ``,
        `## 五、AI 輔助科學評論 (AI Augmentation — 不覆蓋確定性引擎結論)`,
        aiCommentary
      );
    }

    return lines.join("\n");
  };

  const handleCopyMarkdown = () => {
    navigator.clipboard.writeText(generateMarkdownReport());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadJson = () => {
    const payload = JSON.stringify(orchestrationState, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `SpecReader_Analysis_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRequestAiCommentary = async () => {
    setLoadingAi(true);
    setAiError(null);
    try {
      const response = await fetch("/api/gemini/commentary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "MODE_A",
          contextData: {
            activeModalities: modeAReport.activeModalities,
            constraints: modeAReport.constraints,
            topCandidate: topCandidate
              ? {
                  name: topCandidate.name,
                  formula: topCandidate.molecularFormula,
                  smiles: topCandidate.smiles,
                  score: topCandidate.scoreBreakdown.totalScore,
                  supportingReasons: topCandidate.supportingReasons,
                }
              : null,
            competitors: rankedCandidates.slice(1, 3).map((c) => ({
              name: c.name,
              formula: c.molecularFormula,
              contradictions: c.contradictingReasons,
            })),
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "無法取得 AI 輔助評論");
      }
      setAiCommentary(data.commentary);
    } catch (err: any) {
      setAiError(
        err?.message ||
          "AI 輔助評論連線失敗（確定性規則引擎報告仍可完整匯出）。"
      );
    } finally {
      setLoadingAi(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-slate-100">
              匯出 SpecReader 科學分析報告與結構驗證紀錄
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            <div className="text-xs text-slate-300">
              <span className="font-semibold text-cyan-300">
                核心原則：Deterministic Engine &gt; Rule Evidence &gt; AI Augmentation
              </span>
              <p className="mt-0.5 text-[11px] text-slate-400">
                下方報告由確定性科學引擎生成；您可選配呼叫伺服器端 Gemini 撰寫異構物排他討論。
              </p>
            </div>
            <button
              type="button"
              disabled={loadingAi}
              onClick={handleRequestAiCommentary}
              className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-950/50 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-900/50 disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
              {loadingAi ? "正在生成 AI 補充評論..." : "生成 Gemini 輔助科學評論"}
            </button>
          </div>

          {aiError && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 p-2.5 text-xs text-amber-200">
              {aiError}
            </div>
          )}

          <pre className="max-h-[420px] overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-200">
            {generateMarkdownReport()}
          </pre>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyMarkdown}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  已複製 Markdown
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  複製 Markdown 報告
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleDownloadJson}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
            >
              <FileCode className="h-3.5 w-3.5 text-cyan-400" />
              下載完整 JSON 證據包
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
            >
              <Printer className="h-3.5 w-3.5" />
              列印報告
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-cyan-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-cyan-500"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
};
