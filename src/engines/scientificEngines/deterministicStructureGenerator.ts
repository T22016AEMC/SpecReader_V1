import {searchMolecularGraphs} from './deNovoGraphSearch';
import {canonicalizeMolecule} from './rdkitAdapter';
import {
  CandidateHardValidationResult,
  ParsedChemicalStructure,
  StructuralConstraints,
} from "../../types/spectrum";
import {
  AssembledRawCandidate,
  CombinatorialCandidateAssembler,
  FormulaConstraintEngine,
} from "../candidateGeneration/combinatorialAssembler";
import {
  AssembledCandidateGraph,
  GraphAssemblyEngine,
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
  /**
   * 統一候選結構生成與分子圖硬約束過濾器 (Unified V5 Combinatorial + V7 Graph Validation + Phase 1 Hard Filter Gate):
   * 1. 若使用者輸入之分子式驗證失敗或不支援，立即停止依賴該分子式生成候選，回傳空候選清單。
   * 2. 若使用者明確輸入合法分子式，強制鎖定為唯一權威目標分子式 (Authoritative Target Formula)。
   * 3. 結合 V5 CombinatorialCandidateAssembler 與 GraphAssemblyEngine 組裝候選結構（包含 ortho / meta / para 位置異構物與官能基異構物），並以 3-Round Weisfeiler-Lehman Canonical Graph Signature 去重（合併相同結構之不同 SMILES 寫法，但完整保留所有不同異構物）。
   * 4. 強制通過第一層 Hard Constraints (ChemicalHardConstraintValidator + MolecularGraphValidator + ChemicalGraphValidator)：
   *    - 單一連通圖 (Single connected component)
   *    - 化合價合法 (C=4, O=2, N=3/5, X=1)
   *    - 環閉合括號平衡
   *    - 由實際 SMILES 計算之分子式與宣告分子式、權威目標分子式完全一致
   *    - 總氫原子數與目標分子式完全一致
   *    - 非負整數不飽和度 (DBE)
   * 5. 任何違反 Hard Constraints 的非法結構直接 reject 並記錄具體原因，絕不混入軟性評分或進入最終候選清單。
   */
  static generateValidatedStructuresWithRejections(
    constraints: StructuralConstraints,
    solvedSpace: SolvedConstraintSpace
  ): StructureGenerationOutcome {
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

    // 1. 取得結構模板與同分異構物對照
    const templateGraphs = GraphAssemblyEngine.assembleCandidates(
      constraints,
      solvedSpace.plausibleFormulas,
      solvedSpace.requiredFragments
    );

    // 2. 決定枚舉用目標分子式清單：若有權威目標分子式則唯一鎖定，絕不混入其他分子式
    const targetFormulas: Array<{ formula: string; dbe: number }> = [];
    if (authoritativeTargetFormula) {
      const authDbe =
        constraints.userSuppliedFormula?.ihd ??
        solvedSpace.plausibleFormulas[0]?.unsaturationIndex ??
        0;
      targetFormulas.push({
        formula: authoritativeTargetFormula,
        dbe: authDbe,
      });
    } else {
      for (const pf of solvedSpace.plausibleFormulas.slice(0, 3)) {
        if (!targetFormulas.some((f) => f.formula === pf.formula)) {
          targetFormulas.push({
            formula: pf.formula,
            dbe: pf.unsaturationIndex,
          });
        }
      }
      for (const mf of (constraints.molecularFormula?.candidates || []).slice(0, 2)) {
        if (!targetFormulas.some((f) => f.formula === mf.formula)) {
          targetFormulas.push({
            formula: mf.formula,
            dbe: mf.dbe,
          });
        }
      }
    }

    // Database retrieval above and graph enumeration below run on every request.
    // Without composition, enumerate explicitly labelled small representative families;
    // their atom counts are search bounds, never a measured molecular formula.
    if(!targetFormulas.length||(!authoritativeTargetFormula&&!constraints.estimatedMolecularWeight&&targetFormulas.every(tf=>Object.entries(ChemistryEngine.parseFormulaCounts(tf.formula)).reduce((sum,[e,n])=>sum+(e==='H'?0:n),0)>9))){
      const clues=JSON.stringify([...solvedSpace.requiredFragments,...(constraints.functionalGroups??[]).filter(f=>f.status==='REQUIRED'||f.status==='SUPPORTED')]).toLowerCase();
      const oxygen=/oh|oxygen|carbonyl|ester|醇|羧|羰|氧/.test(clues)?1:0;
      const nitrogen=/amine|nitr|氮|胺/.test(clues)?1:0;
      for(let c=2;c<=5;c++)for(let dbe=0;dbe<=2;dbe++){
        const h=2*c+2+nitrogen-2*dbe;
        targetFormulas.push({formula:ChemistryEngine.formatFormula({C:c,H:h,...(oxygen?{O:oxygen}:{}),...(nitrogen?{N:nitrogen}:{})}),dbe});
      }
    }
    const graphSearchNotes:string[]=[];
    const deNovoGraphs:AssembledCandidateGraph[]=[];
    const graphDeadline=performance.now()+450;
    for(const tf of targetFormulas.slice(0,12)){
      if(performance.now()>graphDeadline||deNovoGraphs.length>=36)break;
      const generated=searchMolecularGraphs(tf.formula,{maxResults:Math.min(6,36-deNovoGraphs.length),maxStates:2500,timeMs:Math.min(80,Math.max(1,graphDeadline-performance.now()))});
      graphSearchNotes.push(generated.note);
      for(const smiles of generated.smiles){
        const p=ChemistryEngine.parseStructureInput(smiles);
        deNovoGraphs.push({id:`de-novo-${deNovoGraphs.length}`,name:'De novo 分子圖候選',iupacName:'Generated molecular graph',molecularFormula:p.molecularFormula,smiles,unsaturationIndex:p.dbe??0,nominalMass:Math.round(p.exactMass),exactMass:p.exactMass,assembledFragments:p.detectedFunctionalGroups,structuralClass:authoritativeTargetFormula?'分子式相容圖候選':'代表性結構族群（組成未確認）',keyStructuralFeatures:p.detectedFunctionalGroups,assemblyNotes:generated.note});
      }
    }
    solvedSpace.solverLog.push(...graphSearchNotes.map(n=>`De novo: ${n}`));
    if(!deNovoGraphs.length)solvedSpace.solverLog.push('De novo 搜尋未產生有效完整圖：可能超過中性小分子組成或時間界限；資料庫與局部片段路徑仍保留。');
    templateGraphs.unshift(...deNovoGraphs);
    const combinatorialRawMap = new Map<string, AssembledRawCandidate>();
    const combinatorialByCanonicalSig = new Map<string, AssembledRawCandidate>();

    for (const tf of targetFormulas) {
      const evalForm = FormulaConstraintEngine.evaluateFormula(
        tf.formula,
        constraints
      );
      if (!evalForm.nitrogenRuleValid && tf.dbe < 0) continue;

      const rawList =
        CombinatorialCandidateAssembler.assembleCandidatesForFormula(
          tf.formula,
          tf.dbe,
          constraints
        );
      for (const raw of rawList) {
        const clean = raw.smiles.trim();
        if (!combinatorialRawMap.has(clean)) {
          combinatorialRawMap.set(clean, raw);
        }
        if (raw.canonicalSignature && !combinatorialByCanonicalSig.has(raw.canonicalSignature)) {
          combinatorialByCanonicalSig.set(raw.canonicalSignature, raw);
        }
      }
    }

    // 3. 以 Canonical Graph Signature 與 SMILES 進行單一權威去重合併（保留所有位置異構物 ortho/meta/para 與官能基異構物，但消除相同結構的不同 SMILES 表示）
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
        origin: tg.id.startsWith('de-novo-') ? "[Generated Candidate]" : "[Known Library Candidate]",
        generationMethodLabel: tg.id.startsWith('de-novo-')?'De novo bounded atom/bond graph enumeration':'Database reference retrieval',
        sourceProvenance: tg.id.startsWith('de-novo-')?'De novo / RDKit sanitized graph':'Database / reference scaffold',
        assemblyNotes: tg.assemblyNotes,
        scaffoldType: tg.structuralClass,
      };

      mergedCandidates.push({
        graph: { ...tg },
        rawCombinatorial,
        canonicalSignature: canonicalKey,
      });
    }

    // 將 V5 CombinatorialCandidateAssembler 組裝出的所有異構物（含鄰/間/對位異構物、官能基異構物）納入同一個候選池
    const orderedCombinatorialEntries = Array.from(
      combinatorialRawMap.values()
    ).sort((a, b) => {
      const aIsHet = Boolean(
        a.scaffoldType &&
          (a.scaffoldType.includes("Pyridine") ||
            a.scaffoldType.includes("pyrrole") ||
            a.scaffoldType.includes("furan"))
      );
      const bIsHet = Boolean(
        b.scaffoldType &&
          (b.scaffoldType.includes("Pyridine") ||
            b.scaffoldType.includes("pyrrole") ||
            b.scaffoldType.includes("furan"))
      );
      if (constraints.heteroaromatic?.status !== "PRESENT" && aIsHet !== bIsHet) {
        return aIsHet ? 1 : -1;
      }
      return 0;
    });

    for (const raw of orderedCombinatorialEntries) {
      if (mergedCandidates.length >= 96) break;
      const cleanSmiles = raw.smiles.trim();
      const canonicalKey = getCanonicalKey(cleanSmiles);
      if (
        seenSmiles.has(cleanSmiles) ||
        seenCanonicalSignatures.has(canonicalKey)
      ) {
        continue;
      }
      seenSmiles.add(cleanSmiles);
      seenCanonicalSignatures.add(canonicalKey);

      const parsed = ChemistryEngine.parseStructureInput(cleanSmiles);
      const assembledGraph: AssembledCandidateGraph = {
        id: raw.id,
        name: raw.name,
        iupacName: raw.iupacName,
        molecularFormula: parsed.molecularFormula || raw.molecularFormula,
        smiles: cleanSmiles,
        unsaturationIndex: parsed.unsaturationIndex ?? parsed.dbe ?? 0,
        nominalMass:
          Object.entries(parsed.atomCounts).reduce((sum,[element,count]) => sum + Math.round(ChemistryEngine.calculateMasses({[element]:1}).exactMass) * count, 0),
        exactMass: Number(parsed.exactMass.toFixed(4)),
        assembledFragments:
          parsed.detectedFunctionalGroups.length > 0
            ? parsed.detectedFunctionalGroups
            : [raw.scaffoldType || "組合分子骨架"],
        structuralClass: raw.scaffoldType || raw.generationMethodLabel,
        keyStructuralFeatures: [
          raw.assemblyNotes,
          ...(parsed.detectedFunctionalGroups.length > 0
            ? [`檢出官能基：${parsed.detectedFunctionalGroups.join("、")}`]
            : []),
        ],
        assemblyNotes: raw.assemblyNotes,
      };

      mergedCandidates.push({
        graph: assembledGraph,
        rawCombinatorial: raw,
        canonicalSignature: canonicalKey,
      });
    }

    // 4. 第一層：Hard Constraints 與 ChemicalHardConstraintValidator + MolecularGraphValidator 驗證閘門
    const validatedGraphs: ValidatedCandidateGraph[] = [];
    const rejectedCandidates: RejectedCandidateGraphRecord[] = [];

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

