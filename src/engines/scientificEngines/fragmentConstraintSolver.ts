import { StructuralConstraints } from "../../types/spectrum";
import {
  CandidateMolecularFormula,
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
  searchResult?: import("./deNovoGraphSearch").DeNovoSearchResult;
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

    const plausibleFormulas:CandidateMolecularFormula[] = [];
    solverLog.push('先建立局部化學環境與圖限制；不以前置推測分子式限制候選。使用者分子式另作硬限制。');

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
