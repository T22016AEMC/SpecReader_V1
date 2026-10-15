import { StructuralConstraints } from "../../types/spectrum";

export interface CandidateMolecularFormula {
  formula: string;
  atomCounts: Record<string, number>;
  nominalMass: number;
  exactMass: number;
  unsaturationIndex: number;
  score: number;
  rationale: string;
}

export class FormulaGenerator {
  /**
   * 依據標稱分子量、氮規則、¹H 積分、¹³C 環境數與官能基約束，枚舉合法的分子式候選
   */
  static enumeratePlausibleFormulas(
    constraints: StructuralConstraints
  ): CandidateMolecularFormula[] {
    // Section C8: 若使用者輸入之分子式格式錯誤、元素不支援或無法可靠解析，立即停止依賴該分子式進行結構推論
    if (
      constraints.userSuppliedFormulaValidation &&
      (!constraints.userSuppliedFormulaValidation.isValid ||
        !constraints.userSuppliedFormulaValidation.isSupported)
    ) {
      return [];
    }

    // Section C1: 使用者明確輸入有效分子式時，鎖定為唯一權威目標分子式，絕不枚舉其他分子式
    if (
      constraints.userSuppliedFormula?.isValid &&
      constraints.userSuppliedFormula.normalizedFormula
    ) {
      const uf = constraints.userSuppliedFormula;
      return [
        {
          formula: uf.normalizedFormula,
          atomCounts: { ...uf.atomCounts },
          nominalMass: uf.nominalMass,
          exactMass: uf.exactMass,
          unsaturationIndex: uf.ihd,
          score: 100,
          rationale: `使用者明確指定之權威目標分子式 (${uf.normalizedFormula}, Exact Mass=${uf.exactMass} Da, DBE=${uf.ihd})`,
        },
      ];
    }

    if (constraints.userSuppliedFormula?.isValid && constraints.molecularFormula?.lockedFormula) {
      const locked = constraints.molecularFormula.lockedFormula;
      const lockedCand = (constraints.molecularFormula.candidates || []).find(
        (c) => c.formula === locked
      );
      if (lockedCand) {
        const atomCounts: Record<string, number> = {};
        const regex = /([A-Z][a-z]?)(\d*)/g;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(lockedCand.formula)) !== null) {
          if (!match[1]) break;
          const el = match[1];
          const count = match[2] ? parseInt(match[2], 10) : 1;
          atomCounts[el] = (atomCounts[el] || 0) + count;
        }
        return [
          {
            formula: lockedCand.formula,
            atomCounts,
            nominalMass: Math.round(lockedCand.neutralExactMass),
            exactMass: lockedCand.neutralExactMass,
            unsaturationIndex: lockedCand.dbe,
            score: 100,
            rationale:
              lockedCand.notes ||
              `依據權威目標分子式鎖定 (${lockedCand.formula}, DBE=${lockedCand.dbe})`,
          },
        ];
      }
      return [];
    }

    const results: CandidateMolecularFormula[] = [];

    if (
      constraints.molecularFormula?.candidates &&
      constraints.molecularFormula.candidates.length > 0
    ) {
      for (const explicitCand of constraints.molecularFormula.candidates) {
        const atomCounts: Record<string, number> = {};
        const regex = /([A-Z][a-z]?)(\d*)/g;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(explicitCand.formula)) !== null) {
          if (!match[1]) break;
          const el = match[1];
          const count = match[2] ? parseInt(match[2], 10) : 1;
          atomCounts[el] = (atomCounts[el] || 0) + count;
        }
        if (atomCounts.C) {
          results.push({
            formula: explicitCand.formula,
            atomCounts,
            nominalMass: Math.round(explicitCand.neutralExactMass),
            exactMass: explicitCand.neutralExactMass,
            unsaturationIndex: explicitCand.dbe,
            score: Math.min(85, explicitCand.score || 60),
            rationale:
              explicitCand.notes ||
              `依據質量約束推估分子式 (${explicitCand.formula}, DBE=${explicitCand.dbe})`,
          });
        }
      }
    }

    const targetMW = constraints.estimatedMolecularWeight;
    const hasContributingSources =
      constraints.contributingSources &&
      constraints.contributingSources.length > 0;
    const hasAnyEvidence =
      results.length > 0 ||
      Boolean(targetMW) ||
      Boolean(constraints.estimatedProtonCount) ||
      Boolean(constraints.estimatedCarbonEnvironmentCount) ||
      Boolean(constraints.functionalGroups && constraints.functionalGroups.length > 0) ||
      Boolean(hasContributingSources);

    if (!hasAnyEvidence) {
      return [];
    }

    const minC = Math.max(
      1,
      constraints.estimatedCarbonEnvironmentCount
        ? constraints.estimatedCarbonEnvironmentCount
        : 2
    );
    const maxC = targetMW
      ? Math.min(20, Math.floor(targetMW / 12))
      : Math.max(minC + 4, 12);

    const requiresOddN = constraints.nitrogenRuleParity === "ODD";
    const requiresEvenN = constraints.nitrogenRuleParity === "EVEN";

    const fgText = (constraints.functionalGroups || [])
      .filter((f) => f.status === "REQUIRED" || f.status === "SUPPORTED")
      .map((f) => (f.groupName || f.label).toLowerCase())
      .join(" ");

    const minO =
      fgText.includes("carboxylic") && fgText.includes("ester")
        ? 3
        : fgText.includes("ester") || fgText.includes("carboxylic")
          ? 2
          : fgText.includes("carbonyl") ||
              fgText.includes("ketone") ||
              fgText.includes("hydroxyl")
            ? 1
            : 0;

    const nCandidates = requiresOddN
      ? [1, 3]
      : requiresEvenN
        ? [0, 2]
        : [0, 1, 2];

    for (let c = minC; c <= maxC; c++) {
      for (const n of nCandidates) {
        for (let o = minO; o <= 6; o++) {
          let hValues: number[] = [];
          if (targetMW) {
            const rem = targetMW - (c * 12 + n * 14 + o * 16);
            if (rem >= 1 && rem <= 2 * c + n + 2) {
              hValues.push(rem);
            }
          } else if (constraints.estimatedProtonCount) {
            const estH = constraints.estimatedProtonCount;
            for (let dh = -2; dh <= 2; dh++) {
              const h = estH + dh;
              if (h >= 1 && h <= 2 * c + n + 2) {
                hValues.push(h);
              }
            }
          } else {
            hValues = [
              c - 2,
              c - 1,
              c,
              c + 1,
              c + 2,
              c + 4,
              2 * c - 8,
              2 * c - 6,
              2 * c - 4,
              2 * c - 2,
              2 * c,
              2 * c + 2,
            ].filter((h) => h >= 2 && h <= 2 * c + n + 2);
          }

          for (const h of hValues) {
            // 檢查化合價奇偶性 (2C + 2 + N - H 必須為非負偶數)
            const valenceCheck = 2 * c + 2 + n - h;
            if (valenceCheck < 0 || valenceCheck % 2 !== 0) continue;

            const iHD = valenceCheck / 2;
            if (
              constraints.unsaturationEstimateRange &&
              iHD < constraints.unsaturationEstimateRange[0] - 1
            ) {
              continue;
            }

            const nominalMass = c * 12 + h * 1 + n * 14 + o * 16;
            const exactMass =
              c * 12.0 +
              h * 1.007825 +
              n * 14.003074 +
              o * 15.994915;

            let score = 60;
            const notes: string[] = [];

            if (targetMW && nominalMass === targetMW) {
              score += 20;
              notes.push(`標稱分子量 ${nominalMass} Da 吻合 MS 母離子`);
            }
            if (constraints.estimatedProtonCount) {
              const hDiff = Math.abs(h - constraints.estimatedProtonCount);
              if (hDiff === 0) {
                score += 18;
                notes.push(`氫數 H=${h} 完全吻合 ¹H 積分`);
              } else if (hDiff <= 1) {
                score += 12;
                notes.push(`氫數 H=${h} 吻合 ¹H 積分`);
              } else if (hDiff > 2) {
                score -= 25;
              }
            }
            if (
              constraints.estimatedCarbonEnvironmentCount &&
              c >= constraints.estimatedCarbonEnvironmentCount &&
              c <= constraints.estimatedCarbonEnvironmentCount + 2
            ) {
              score += 10;
              notes.push(`碳數 C=${c} 相容於 ¹³C 訊號數`);
            }

            const formulaStr = `C${c > 1 ? c : ""}H${h > 1 ? h : ""}${
              n > 0 ? `N${n > 1 ? n : ""}` : ""
            }${o > 0 ? `O${o > 1 ? o : ""}` : ""}`;

            results.push({
              formula: formulaStr,
              atomCounts: {
                C: c,
                H: h,
                ...(n > 0 ? { N: n } : {}),
                ...(o > 0 ? { O: o } : {}),
              },
              nominalMass,
              exactMass: Number(exactMass.toFixed(4)),
              unsaturationIndex: iHD,
              score: Math.max(10, Math.min(99, score)),
              rationale: notes.join("；") || `符合化合價與不飽和度 IHD=${iHD}`,
            });
          }
        }
      }
    }

    const uniqueByFormula = new Map<string, CandidateMolecularFormula>();
    for (const item of results) {
      const prev = uniqueByFormula.get(item.formula);
      if (!prev || item.score > prev.score) {
        uniqueByFormula.set(item.formula, item);
      }
    }

    return Array.from(uniqueByFormula.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  }
}
