import { StructuralConstraints } from "../../types/spectrum";
import {
  CandidateMolecularFormula,
  FormulaGenerator,
} from "../candidateGeneration/formulaGenerator";
import {
  ChemicalFragmentDefinition,
  FragmentLibrary,
} from "../candidateGeneration/fragmentLibrary";

export interface SolvedConstraintSpace {
  plausibleFormulas: CandidateMolecularFormula[];
  requiredFragments: ChemicalFragmentDefinition[];
  forbiddenGroups: string[];
  unsaturationRange: [number, number];
  estimatedNominalMW?: number;
  aromaticPattern: StructuralConstraints["aromaticSubstitutionPattern"];
  solverLog: string[];
}

export class FragmentConstraintSolver {
  /**
   * 確定性結構約束求解器 (Fragment Constraint Solver)：
   * 根據提取出的光譜證據，收斂分子式、不飽和度 (DBE)、必備子結構與禁用官能基
   */
  static solveConstraintSpace(
    constraints: StructuralConstraints
  ): SolvedConstraintSpace {
    const solverLog: string[] = [];

    const plausibleFormulas =
      FormulaGenerator.enumeratePlausibleFormulas(constraints);
    if (plausibleFormulas.length > 0) {
      solverLog.push(
        `分子式枚舉器根據分子量與化合價奇偶規則收斂出 ${plausibleFormulas.length} 組候選分子式，首選為 ${plausibleFormulas[0].formula} (DBE=${plausibleFormulas[0].unsaturationIndex})。`
      );
    }

    const requiredFragments =
      FragmentLibrary.selectCompatibleFragments(constraints);
    if (requiredFragments.length > 0) {
      solverLog.push(
        `子結構約束求解器鎖定 ${requiredFragments.length} 個相容化學片段：${requiredFragments.map((f) => f.name).join("、")}。`
      );
    }

    const forbiddenGroups = (constraints.functionalGroups || [])
      .filter((fg) => fg.status === "FORBIDDEN" || fg.status === "EXCLUDED")
      .map((fg) => fg.groupName || fg.label);

    if (forbiddenGroups.length > 0) {
      solverLog.push(
        `根據缺席特徵峰排除以下官能基：${forbiddenGroups.join("、")}。`
      );
    }

    const unsaturationRange: [number, number] =
      constraints.unsaturationEstimateRange ||
      (plausibleFormulas[0]
        ? [
            Math.max(0, plausibleFormulas[0].unsaturationIndex - 1),
            plausibleFormulas[0].unsaturationIndex + 1,
          ]
        : [0, 8]);

    return {
      plausibleFormulas,
      requiredFragments,
      forbiddenGroups,
      unsaturationRange,
      estimatedNominalMW: constraints.estimatedMolecularWeight ?? undefined,
      aromaticPattern: constraints.aromaticSubstitutionPattern,
      solverLog,
    };
  }
}
