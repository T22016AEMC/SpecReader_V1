import type {DeNovoSearchResult} from './deNovoGraphSearch';
import type {LocalStructureHypothesis} from '../reasoning/types';
export interface StructureGenerationOptions {searchResult?:DeNovoSearchResult;localStructures?:LocalStructureHypothesis[];
 /** The search ran on composition-hypothesis formulas (P1a); those formulas are the composition basis, so the gate below is skipped. */
 compositionDriven?:boolean;
 /** N-specific evidence (v1.1.7-hotfix.1). Applied to every generation path: the fallback search alphabet and the final candidate gate. */
 nitrogenEvidence?:import('../composition/nitrogenEvidence').NitrogenEvidence;
 /** Specific evidence for the chemical-plausibility gate (v1.1.7-hotfix.1); without it only the user-formula exception applies. */
 plausibility?:PlausibilityEvidence}
import {NO_PLAUSIBILITY_EVIDENCE,plausibilityViolations,type PlausibilityEvidence,type PlausibilityRule} from './structurePlausibility';
import {searchMolecularGraphs,graphSearchHints} from './deNovoGraphSearch';
import {canonicalizeMolecule} from './rdkitAdapter';
import {
  CandidateHardValidationResult,
  ParsedChemicalStructure,
  StructuralConstraints,
} from "../../types/spectrum";
import {
  AssembledRawCandidate,
} from "../candidateGeneration/combinatorialAssembler";
import {
  AssembledCandidateGraph,
} from "../candidateGeneration/graphAssemblyEngine";
import { ChemicalGraphValidator } from "../candidateGeneration/graphValidator";
import { ChemistryEngine } from "../chemistryEngine";
import { ChemicalHardConstraintValidator } from "./chemicalHardConstraintValidator";
import { SolvedConstraintSpace } from "./fragmentConstraintSolver";
import {
  MolecularGraphValidationResult,
  MolecularGraphValidator,
} from "./molecularGraphValidator";

export interface ValidatedCandidateGraph {
  candidate: AssembledCandidateGraph;
  graphValidation: MolecularGraphValidationResult;
  hardValidation: CandidateHardValidationResult;
  canonicalSignature: string;
  parsedStructure?: ParsedChemicalStructure;
  rawCombinatorialCandidate: AssembledRawCandidate;
  hardConstraintPassed: boolean;
  satisfiedConstraints: string[];
  violatedConstraints: string[];
  rejectionReasons: string[];
}

export interface RejectedCandidateGraphRecord {
  candidate: AssembledCandidateGraph;
  graphValidation: MolecularGraphValidationResult;
  hardValidation?: CandidateHardValidationResult;
  hardConstraintPassed: false;
  violatedConstraints: string[];
  rejectionReasons: string[];
}

export interface StructureGenerationOutcome {
  validatedGraphs: ValidatedCandidateGraph[];
  rejectedCandidates: RejectedCandidateGraphRecord[];
}

export class DeterministicStructureGenerator {
  /** Evidence-guided bounded graph growth, followed by the existing independent
   * valence, connectivity and authoritative user-composition hard gates.
   * No guessed formula or whole-compound catalogue enters the candidate frontier.
   */
  static generateValidatedStructuresWithRejections(
    constraints: StructuralConstraints,
    solvedSpace: SolvedConstraintSpace,
    options:StructureGenerationOptions={}
  ): StructureGenerationOutcome {
    if(options.searchResult)solvedSpace.searchResult=options.searchResult;
    // Section C8: 若使用者輸入之分子式格式無效、違反價數奇偶或含不支援元素，立即停止結構推論，不回傳任何充數候選
    if (
      constraints.userSuppliedFormulaValidation &&
      (!constraints.userSuppliedFormulaValidation.isValid ||
        !constraints.userSuppliedFormulaValidation.isSupported)
    ) {
      return {
        validatedGraphs: [],
        rejectedCandidates: [],
      };
    }

    const authoritativeTargetFormula =
      constraints.userSuppliedFormula?.isValid &&
      constraints.userSuppliedFormula.normalizedFormula
        ? constraints.userSuppliedFormula.normalizedFormula
        : null;

    if(!authoritativeTargetFormula&&!options.compositionDriven&&(!(constraints.contributingSources??[]).length||(!constraints.estimatedMolecularWeight&&!(constraints.contributingSources??[]).some(source=>['IR','1H_NMR','13C_NMR'].includes(source))))){
      solvedSpace.solverLog.push('缺少可支持組成的實測約束；保留局部觀測，不生成任意完整分子。');
      return {validatedGraphs:[],rejectedCandidates:[]};
    }
    // Without N-specific evidence (and without a user formula) N is excluded on every path, including this fallback search.
    const nitrogenBlocked=!authoritativeTargetFormula&&options.nitrogenEvidence?.mode==='NONE';
    const generated=options.searchResult??searchMolecularGraphs(authoritativeTargetFormula??undefined,{hints:{...graphSearchHints(constraints),localStructures:options.localStructures,...(nitrogenBlocked?{nitrogen:false,nitrogenForbidden:true}:{})},timeMs:900,maxStates:12000,maxResults:24});
    solvedSpace.searchResult=generated;
    solvedSpace.solverLog.push(generated.note,...generated.partialHypotheses);
    const templateGraphs:AssembledCandidateGraph[]=generated.smiles.map((smiles,index)=>{
      const p=ChemistryEngine.parseStructureInput(smiles);
      return {id:`de-novo-${index}`,name:'圖擴展候選（非唯一結構）',iupacName:'Generated graph hypothesis',molecularFormula:p.molecularFormula,smiles,unsaturationIndex:p.dbe??0,nominalMass:Math.round(p.exactMass),exactMass:p.exactMass,assembledFragments:p.detectedFunctionalGroups,structuralClass:authoritativeTargetFormula?'使用者組成相容的圖候選':'局部證據引導的代表性圖；組成未確認',keyStructuralFeatures:p.detectedFunctionalGroups,assemblyNotes:generated.note};
    });
    // No whole-compound catalogue or formula-first combinatorial route is used here.

    // 3. 以 Canonical Graph Signature 與 SMILES 進行單一權威去重合併（消除已搜尋到的相同結構表示，不保證搜尋所有位置異構物）
    const mergedCandidates: Array<{
      graph: AssembledCandidateGraph;
      rawCombinatorial: AssembledRawCandidate;
      canonicalSignature: string;
    }> = [];
    const seenCanonicalSignatures = new Set<string>();
    const seenSmiles = new Set<string>();

    const getCanonicalKey = (smiles: string): string => {
      const canonical=canonicalizeMolecule(smiles);
      if(canonical.available&&canonical.valid)return `RDKIT:${canonical.canonical}`;
      const check = ChemicalGraphValidator.validateCandidateSmiles(smiles);
      if (check.valid && check.canonicalSignature) {
        return check.canonicalSignature;
      }
      return `RAW_SMILES::${smiles.trim()}`;
    };

    for (const tg of templateGraphs) {
      const cleanSmiles = tg.smiles.trim();
      const canonicalKey = getCanonicalKey(cleanSmiles);
      if (
        seenSmiles.has(cleanSmiles) ||
        seenCanonicalSignatures.has(canonicalKey)
      ) {
        continue;
      }
      seenSmiles.add(cleanSmiles);
      seenCanonicalSignatures.add(canonicalKey);

      const rawCombinatorial: AssembledRawCandidate = {
        id: tg.id,
        name: tg.name,
        iupacName: tg.iupacName,
        smiles: cleanSmiles,
        canonicalSignature: canonicalKey,
        molecularFormula: tg.molecularFormula,
        origin: "[Generated Candidate]",
        generationMethodLabel: 'De novo evidence-guided graph growth',
        sourceProvenance: 'De novo / RDKit sanitized graph',
        assemblyNotes: tg.assemblyNotes,
        scaffoldType: tg.structuralClass,
      };

      mergedCandidates.push({
        graph: { ...tg },
        rawCombinatorial,
        canonicalSignature: canonicalKey,
      });
    }

    // 4. 第一層：Hard Constraints 與 ChemicalHardConstraintValidator + MolecularGraphValidator 驗證閘門
    const validatedGraphs: ValidatedCandidateGraph[] = [];
    const rejectedCandidates: RejectedCandidateGraphRecord[] = [];
    const plausibility: PlausibilityEvidence = options.plausibility ?? {...NO_PLAUSIBILITY_EVIDENCE, userFormula: Boolean(authoritativeTargetFormula), nitrogenEvidence: options.nitrogenEvidence?.mode === 'EVIDENCE'};
    const plausibilityCounts = new Map<PlausibilityRule, number>();

    for (const {
      graph: candidate,
      rawCombinatorial,
      canonicalSignature,
    } of mergedCandidates) {
      // 執行單一權威化學式與結構硬限制驗證
      const hardValidation =
        ChemicalHardConstraintValidator.validateCandidateStructure(
          candidate.smiles,
          candidate.molecularFormula,
          authoritativeTargetFormula,
          constraints.h1IntegrationSemantics
        );

      const graphValidation = MolecularGraphValidator.validateSmilesGraph(
        candidate.smiles,
        authoritativeTargetFormula || candidate.molecularFormula
      );
      const chemGraphCheck = ChemicalGraphValidator.validateCandidateSmiles(
        candidate.smiles,
        authoritativeTargetFormula || candidate.molecularFormula
      );

      const rejectionReasons: string[] = [];
      const violatedConstraints: string[] = [];
      const satisfiedConstraints: string[] = [];

      if (!hardValidation.isValid || !hardValidation.isSupported) {
        rejectionReasons.push(...hardValidation.validationErrors);
        violatedConstraints.push(
          "HARD_CONSTRAINT: 未通過化學結構或分子式硬限制驗證"
        );
      }
      if (
        authoritativeTargetFormula &&
        hardValidation.formulaMatch === false
      ) {
        const msg = `HARD_CONSTRAINT: 實際計算分子式 (${hardValidation.computedFormula || "未知"}) 與目標分子式 (${authoritativeTargetFormula}) 不符`;
        if (!violatedConstraints.includes(msg)) {
          violatedConstraints.push(msg);
        }
        if (!rejectionReasons.includes(msg)) {
          rejectionReasons.push(msg);
        }
      }
      if (hardValidation.protonConsistency?.isHardFailure) {
        const msg =
          hardValidation.protonConsistency.contradictionReasons[0] ||
          "HARD_CONSTRAINT: 候選結構實際總氫數與目標分子式硬限制不符";
        if (!violatedConstraints.includes(msg)) {
          violatedConstraints.push(msg);
        }
        if (!rejectionReasons.includes(msg)) {
          rejectionReasons.push(msg);
        }
      }

      if (!graphValidation.isValid) {
        for (const err of graphValidation.errors) {
          if (!rejectionReasons.includes(err)) {
            rejectionReasons.push(err);
          }
        }
        violatedConstraints.push("HARD_CONSTRAINT: 分子圖拓撲或化合價不合法");
      }
      if (!graphValidation.isConnected) {
        violatedConstraints.push("HARD_CONSTRAINT: 非單一連通分子圖");
      }
      if (!graphValidation.allValencesValid) {
        violatedConstraints.push("HARD_CONSTRAINT: 原子化合價違反標準價數規則");
      }
      if (!graphValidation.isRingClosureBalanced) {
        violatedConstraints.push("HARD_CONSTRAINT: 環閉合標記未成對平衡");
      }
      if (
        graphValidation.computedFormula &&
        graphValidation.computedFormula !== candidate.molecularFormula
      ) {
        violatedConstraints.push(
          `HARD_CONSTRAINT: 宣告分子式與實際結構不一致 (${graphValidation.computedFormula} ≠ ${candidate.molecularFormula})`
        );
      }
      if (
        authoritativeTargetFormula &&
        graphValidation.computedFormula !== authoritativeTargetFormula
      ) {
        violatedConstraints.push(
          `HARD_CONSTRAINT: 實際分子式 (${graphValidation.computedFormula}) 與使用者指定目標分子式 (${authoritativeTargetFormula}) 不一致`
        );
      }
      if (
        graphValidation.computedDBE < 0 ||
        !Number.isInteger(graphValidation.computedDBE)
      ) {
        rejectionReasons.push(
          `計算不飽和度 DBE=${graphValidation.computedDBE} 不為非負整數`
        );
        violatedConstraints.push("HARD_CONSTRAINT: 不可能之分子式或不飽和度");
      }
      if (!chemGraphCheck.valid && chemGraphCheck.reason) {
        if (!rejectionReasons.includes(chemGraphCheck.reason)) {
          rejectionReasons.push(chemGraphCheck.reason);
        }
        violatedConstraints.push("HARD_CONSTRAINT: 化學結構解析器檢核未通過");
      }

      // Chemical-plausibility gate: unstable linkages without specific evidence are rejected with the reason recorded.
      for (const v of plausibilityViolations(candidate.smiles, plausibility)) {
        const msg = `PLAUSIBILITY(${v.rule}): ${v.text}`;
        violatedConstraints.push(msg);
        rejectionReasons.push(msg);
        plausibilityCounts.set(v.rule, (plausibilityCounts.get(v.rule) ?? 0) + 1);
      }
      if (nitrogenBlocked && /N(?![a-z])/.test(hardValidation.computedFormula || candidate.molecularFormula)) {
        const msg = "HARD_CONSTRAINT: 無 N 專屬證據（無 MS、無使用者分子式），不接受含 N 的候選";
        violatedConstraints.push(msg);
        rejectionReasons.push(msg);
      }
      if (rejectionReasons.length > 0 || violatedConstraints.length > 0) {
        rejectedCandidates.push({
          candidate,
          graphValidation,
          hardValidation,
          hardConstraintPassed: false,
          violatedConstraints,
          rejectionReasons,
        });
        continue;
      }

      // 強制以實際 SMILES 計算出的分子式作為候選分子式
      const verifiedCandidate: AssembledCandidateGraph = {
        ...candidate,
        molecularFormula: hardValidation.computedFormula,
      };
      const verifiedRawCombinatorial: AssembledRawCandidate = {
        ...rawCombinatorial,
        molecularFormula: hardValidation.computedFormula,
      };

      satisfiedConstraints.push(
        `通過單一連通分子圖驗證 (${graphValidation.heavyAtomCount} 個重原子, 環數=${graphValidation.ringCount})`,
        `通過全原子標準化合價與分子式硬限制檢驗 (計算分子式 ${hardValidation.computedFormula}, 總氫數=${hardValidation.protonConsistency?.computedTotalHydrogens ?? hardValidation.atomCounts.H ?? 0}H, DBE=${graphValidation.computedDBE})`
      );
      if (authoritativeTargetFormula) {
        satisfiedConstraints.push(
          `嚴格吻合使用者指定之權威目標分子式 ${authoritativeTargetFormula}`
        );
      }

      validatedGraphs.push({
        candidate: verifiedCandidate,
        graphValidation,
        hardValidation,
        canonicalSignature,
        parsedStructure:
          chemGraphCheck.parsedStructure ||
          ChemistryEngine.parseStructureInput(candidate.smiles),
        rawCombinatorialCandidate: verifiedRawCombinatorial,
        hardConstraintPassed: true,
        satisfiedConstraints,
        violatedConstraints: [],
        rejectionReasons: [],
      });
    }

    if (plausibilityCounts.size) solvedSpace.solverLog.push(`化學合理性檢查剔除候選：${[...plausibilityCounts].map(([rule, n]) => `${rule}×${n}`).join('、')}（原因見 rejectedCandidates）。`);
    return {
      validatedGraphs,
      rejectedCandidates,
    };
  }

  /**
   * 向下相容介面：回傳通過第一層 Hard Constraints 與 MolecularGraphValidator 的有效候選圖集合
   */
  static generateValidatedStructures(
    constraints: StructuralConstraints,
    solvedSpace: SolvedConstraintSpace
  ): ValidatedCandidateGraph[] {
    return this.generateValidatedStructuresWithRejections(
      constraints,
      solvedSpace
    ).validatedGraphs;
  }
}

