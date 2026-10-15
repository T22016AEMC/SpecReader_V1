import {inferSignalEnvironments} from './scientificEngines/atomicChemicalEnvironment';
import {findEthylPairs, findIsopropylPairs} from "./scientificEngines/nmrFragmentEvidence";
import {
  CandidateNMRConsistencyAnalysis,
  Carbon13SummaryAnalysis,
  CarbonEnvironment,
  CarbonEnvironmentType,
  ConnectivityConstraint,
  EvidenceReference,
  ExperimentalSpectrumData,
  FunctionalGroupConstraint,
  H1NMRIntegrationSemanticsReport,
  HeteroaromaticConstraint,
  JCoupling,
  NMRSolvent,
  ParsedChemicalStructure,
  ProtonEnvironment,
  SpectralPeak,
  SpinCouplingAnalysis,
  StructuralConstraints,
  StructuralMotifConstraint,
} from "../types/spectrum";
import { StructureParserAdapter } from "./chemistryEngine";
import { DataValidator } from "./dataValidator";
import { ChemicalHardConstraintValidator } from "./scientificEngines/chemicalHardConstraintValidator";
import {
  DEUTERATED_SOLVENT_PROFILES,
  matchSolventOrReferenceSignal,
  NMR_LITERATURE_REGISTRY,
  NMRGraphPredictor,
  SpinCouplingCalculator,
  TRACE_IMPURITY_REFERENCE_TABLE,
} from "./scientificEngines/nmrAtomicEnvironmentModel";
import { SpectrumParser } from "./spectrumParser";

export interface NMRSolventReferenceEntry {
  solvent: NMRSolvent;
  labelZh: string;
  h1ResidualPpm: number[];
  h1WaterPpm: number;
  c13ResidualPpm: number[];
  notesZh: string;
}

export const NMR_SOLVENT_RESIDUAL_DATABASE: Record<NMRSolvent, NMRSolventReferenceEntry> = {
  CDCl3: {
    solvent: "CDCl3",
    labelZh: DEUTERATED_SOLVENT_PROFILES.CDCl3.labelZh,
    h1ResidualPpm: [7.26],
    h1WaterPpm: 1.56,
    c13ResidualPpm: [77.16],
    notesZh: DEUTERATED_SOLVENT_PROFILES.CDCl3.notesZh,
  },
  "DMSO-d6": {
    solvent: "DMSO-d6",
    labelZh: DEUTERATED_SOLVENT_PROFILES["DMSO-d6"].labelZh,
    h1ResidualPpm: [2.50],
    h1WaterPpm: 3.33,
    c13ResidualPpm: [39.52],
    notesZh: DEUTERATED_SOLVENT_PROFILES["DMSO-d6"].notesZh,
  },
  CD3OD: {
    solvent: "CD3OD",
    labelZh: DEUTERATED_SOLVENT_PROFILES.CD3OD.labelZh,
    h1ResidualPpm: [3.31],
    h1WaterPpm: 4.87,
    c13ResidualPpm: [49.00],
    notesZh: DEUTERATED_SOLVENT_PROFILES.CD3OD.notesZh,
  },
  D2O: {
    solvent: "D2O",
    labelZh: DEUTERATED_SOLVENT_PROFILES.D2O.labelZh,
    h1ResidualPpm: [4.79],
    h1WaterPpm: 4.79,
    c13ResidualPpm: [],
    notesZh: DEUTERATED_SOLVENT_PROFILES.D2O.notesZh,
  },
  "Acetone-d6": {
    solvent: "Acetone-d6",
    labelZh: DEUTERATED_SOLVENT_PROFILES["Acetone-d6"].labelZh,
    h1ResidualPpm: [2.05],
    h1WaterPpm: 2.84,
    c13ResidualPpm: [29.84, 206.26],
    notesZh: DEUTERATED_SOLVENT_PROFILES["Acetone-d6"].notesZh,
  },
  CD3CN: {
    solvent: "CD3CN",
    labelZh: DEUTERATED_SOLVENT_PROFILES.CD3CN.labelZh,
    h1ResidualPpm: [1.94],
    h1WaterPpm: 2.13,
    c13ResidualPpm: [1.32, 118.26],
    notesZh: DEUTERATED_SOLVENT_PROFILES.CD3CN.notesZh,
  },
  C6D6: {
    solvent: "C6D6",
    labelZh: DEUTERATED_SOLVENT_PROFILES.C6D6.labelZh,
    h1ResidualPpm: [7.16],
    h1WaterPpm: 0.40,
    c13ResidualPpm: [128.06],
    notesZh: DEUTERATED_SOLVENT_PROFILES.C6D6.notesZh,
  },
  "THF-d8": {
    solvent: "THF-d8",
    labelZh: DEUTERATED_SOLVENT_PROFILES["THF-d8"].labelZh,
    h1ResidualPpm: [3.58, 1.72],
    h1WaterPpm: 2.46,
    c13ResidualPpm: [67.21, 25.31],
    notesZh: DEUTERATED_SOLVENT_PROFILES["THF-d8"].notesZh,
  },
  CD2Cl2: {
    solvent: "CD2Cl2",
    labelZh: DEUTERATED_SOLVENT_PROFILES.CD2Cl2.labelZh,
    h1ResidualPpm: [5.32],
    h1WaterPpm: 1.52,
    c13ResidualPpm: [53.84],
    notesZh: DEUTERATED_SOLVENT_PROFILES.CD2Cl2.notesZh,
  },
  "Toluene-d8": {
    solvent: "Toluene-d8",
    labelZh: DEUTERATED_SOLVENT_PROFILES["Toluene-d8"].labelZh,
    h1ResidualPpm: [2.08, 6.97, 7.01, 7.09],
    h1WaterPpm: 0.43,
    c13ResidualPpm: [20.43, 125.13, 127.96, 128.87, 137.48],
    notesZh: DEUTERATED_SOLVENT_PROFILES["Toluene-d8"].notesZh,
  },
  Unknown: {
    solvent: "Unknown",
    labelZh: DEUTERATED_SOLVENT_PROFILES.Unknown.labelZh,
    h1ResidualPpm: [],
    h1WaterPpm: 1.56,
    c13ResidualPpm: [],
    notesZh: DEUTERATED_SOLVENT_PROFILES.Unknown.notesZh,
  },
};

export class NMRAnalysisEngine {
  static analyzeExperimental1HNMR(
    spectrum?: ExperimentalSpectrumData,
    expectedStructure?: ParsedChemicalStructure | null
  ): {
    environments: ProtonEnvironment[];
    annotatedPeaks: SpectralPeak[];
    symmetrySummary: string;
    totalIntegratedProtons: number | null;
    integrationSemantics: H1NMRIntegrationSemanticsReport;
    protonSummary: {
      solvent: NMRSolvent;
      totalIntegratedProtons: number | null;
      aromaticPatternHint: string;
      environments: ProtonEnvironment[];
      spinSystems: {
        patternName: string;
        chemicalShifts: number[];
        jValues: number[];
        protonCount: number;
      }[];
      exchangeableProtons: {
        shift: number;
        integral: number;
        label: string;
      }[];
      hasAldehydeProton: boolean;
      hasCarboxylicAcidProton: boolean;
      hasExchangeableProton: boolean;
      hasMethoxyGroup: boolean;
      hasAcetoxyOrMethylKetone: boolean;
      summaryNotes: string[];
    };
    structuralConstraints: StructuralConstraints;
    statusMessage: string;
  } {
    if (
      !spectrum ||
      spectrum.digitizationFailed ||
      !spectrum.validation.isValid ||
      spectrum.peaks.length === 0
    ) {
      return {
        environments: [],
        annotatedPeaks: [],
        symmetrySummary: "¹H NMR 資料不足或數位化失敗，無法提取有效環境。",
        totalIntegratedProtons: null,
        integrationSemantics:
          ChemicalHardConstraintValidator.analyzeH1NMRIntegrationSemantics(
            [],
            false,
            false,
            expectedStructure?.atomCounts
          ),
        protonSummary: {
          solvent: spectrum?.nmrSolvent || "Unknown",
          totalIntegratedProtons: 0,
          aromaticPatternHint: "",
          environments: [],
          spinSystems: [],
          exchangeableProtons: [],
          hasAldehydeProton: false,
          hasCarboxylicAcidProton: false,
          hasExchangeableProton: false,
          hasMethoxyGroup: false,
          hasAcetoxyOrMethylKetone: false,
          summaryNotes: [],
        },
        structuralConstraints: {
          source: "1H_NMR",
          confidence: 0,
          evidence: [],
        },
        statusMessage: spectrum?.digitizationFailed
          ? "¹H NMR 分析無法可靠完成（圖片數位化失敗）。"
          : "¹H NMR 資料不足或未提供，無法可靠判定氫化學環境。",
      };
    }

    const activeSolvent: NMRSolvent = spectrum.nmrSolvent || "Unknown";
    const spectrometerFreqMHz = spectrum.spectrometerFrequencyMHz || 400;

    const annotatedPeaks: SpectralPeak[] = [];
    const analytePeaks: SpectralPeak[] = [];

    for (const p of spectrum.peaks) {
      const explicitNonAnalyte =
        (p.role && p.role !== "ANALYTE" && p.role !== "OVERLAP") ||
        (p.signalRole &&
          p.signalRole !== "ANALYTE" &&
          p.signalRole !== "OVERLAP") ||
        p.userClassification === "SOLVENT" ||
        p.userClassification === "NOISE" ||
        p.userClassification === "IMPURITY" ||
        p.classificationTag === "SOLVENT" ||
        p.classificationTag === "NOISE" ||
        p.classificationTag === "IMPURITY" ||
        p.isSolventVerified;

      if (explicitNonAnalyte) {
        annotatedPeaks.push({
          ...p,
          signalRole:
            p.signalRole ||
            (p.userClassification === "SOLVENT" || p.classificationTag === "SOLVENT"
              ? "SOLVENT"
              : p.userClassification === "IMPURITY" || p.classificationTag === "IMPURITY"
                ? "IMPURITY"
                : "NOISE"),
        });
        continue;
      }

      const isExplicitlyConfirmedCompound =
        p.userClassification === "REAL" ||
        p.userClassification === "COMPOUND" ||
        p.role === "ANALYTE" ||
        p.signalRole === "ANALYTE";

      if (!isExplicitlyConfirmedCompound) {
        if (
          Math.abs(p.x) <= 0.02 &&
          (p.integration === null || p.integration === undefined || p.integration === 0)
        ) {
          annotatedPeaks.push({
            ...p,
            signalRole: "REFERENCE_TMS",
            roleReason: "TMS 內標基準峰 (0.00 ppm)",
          });
          continue;
        }
        if (activeSolvent !== "Unknown") {
          const solvMatch = matchSolventOrReferenceSignal(
            "1H_NMR",
            p.x,
            activeSolvent
          );
          if (solvMatch) {
            if (solvMatch.role === "REFERENCE_TMS") {
              annotatedPeaks.push({
                ...p,
                signalRole: "REFERENCE_TMS",
                roleReason: solvMatch.explanationZh,
              });
              continue;
            }
            if (solvMatch.role === "SOLVENT") {
              const isAromaticSolvent =
                activeSolvent === "CDCl3" ||
                activeSolvent === "C6D6" ||
                activeSolvent === "Toluene-d8";
              const hasSplittingJ =
                Array.isArray(p.jValues) && p.jValues.length > 0;
              const isSplitAromaticSample =
                isAromaticSolvent &&
                (hasSplittingJ ||
                  (p.multiplicity &&
                    !["s", "br s", "m"].includes(p.multiplicity.toLowerCase())));
              if (!isSplitAromaticSample) {
                annotatedPeaks.push({
                  ...p,
                  signalRole: "SOLVENT",
                  roleReason: solvMatch.explanationZh,
                });
                continue;
              }
            }
            if (solvMatch.role === "WATER") {
              const isUnsplitWater =
                !p.multiplicity ||
                ["s", "br s", "br"].includes(p.multiplicity.toLowerCase());
              const hasNoJ = !p.jValues || p.jValues.length === 0;
              if (isUnsplitWater && hasNoJ) {
                annotatedPeaks.push({
                  ...p,
                  signalRole: "WATER",
                  roleReason: solvMatch.explanationZh,
                });
                continue;
              }
            }
          }
        }
      }

      const analyPeak: SpectralPeak = {
        ...p,
        signalRole: p.signalRole || "ANALYTE",
      };
      annotatedPeaks.push(analyPeak);
      analytePeaks.push(analyPeak);
    }

    const excludedRoleCount = spectrum.peaks.length - analytePeaks.length;
    const peaks = analytePeaks.slice().sort((a, b) => b.x - a.x);
    const environments: ProtonEnvironment[] = [];

    const isImageSpectrum =
      spectrum.sourceType === "IMAGE_EXPERIMENTAL" || Boolean(spectrum.digitizedFromImage);

    for (let i = 0; i < peaks.length; i++) {
      const pk = peaks[i];
      const shift = pk.x;

      const rawInteg = pk.integration ?? pk.integral;
      const integ: number | null =
        rawInteg !== undefined && rawInteg !== null && Number.isFinite(rawInteg)
          ? Number(rawInteg)
          : null;

      const mult: string | null = pk.multiplicity
        ? pk.multiplicity
        : isImageSpectrum
        ? (pk.width ?? 0.05) >= 0.08
          ? "multiplet"
          : "unresolved"
        : null;

      const jVals: number[] =
        Array.isArray(pk.jValues) && pk.jValues.length > 0
          ? pk.jValues.filter((j) => Number.isFinite(j))
          : [];

      const relIntensity = Number((pk.relativeIntensity ?? pk.y ?? 50).toFixed(1));
      const envSource: "IMAGE_ESTIMATED" | "NUMERIC_EXACT" = isImageSpectrum
        ? "IMAGE_ESTIMATED"
        : "NUMERIC_EXACT";

      const integLabel =
        integ !== null
          ? `相對積分 ${integ}`
          : isImageSpectrum
          ? `積分：未知 (圖片相對強度 ${relIntensity}%)`
          : "積分：未知";
      const multLabel = mult !== null ? mult : "峰型：未知";
      const jLabel = jVals.length > 0 ? `J = ${jVals.join(", ")} Hz` : "J：未知";

      let regionCategory = "脂肪族飽和區 Aliphatic (0.5–1.8 ppm)";
      let expectedRange: [number, number] = [0.5, 1.8];
      let envLabel = "脂肪族 C-H 質子 (Aliphatic CHn)";
      let reasoning = `於 δ ${shift.toFixed(2)} ppm 觀測到共振訊號（${integLabel}，${multLabel}，${jLabel}）。`;
      let inferenceLevel: ProtonEnvironment["inferenceLevel"] = "LEVEL_2_LOCAL_CHEMICAL_ENVIRONMENT";
      let alternativeExplanations: string[] = [];
      let competingHypotheses: NonNullable<ProtonEnvironment["competingHypotheses"]> = [];

      const formulaForbidN =
        expectedStructure?.atomCounts !== undefined &&
        (expectedStructure.atomCounts.N ?? 0) === 0;
      const formulaHasO =
        expectedStructure?.atomCounts === undefined ||
        (expectedStructure.atomCounts.O ?? 0) > 0;

      if (shift >= 10.5 && shift <= 14.2) {
        regionCategory = "羧酸 / 強分子內氫鍵酚羥基質子區 Carboxylic Acid / Chelated Enol-Phenol (10.5–14.2 ppm)";
        expectedRange = [10.5, 14.2];
        envLabel = "強去遮蔽活潑氫 (-COOH 羧酸二聚體 或 分子內氫鍵酚/烯醇 -OH)";
        reasoning = `於極低場 δ ${shift.toFixed(2)} ppm 出現共振（${integLabel}，${multLabel}），符合羧酸二聚體強氫鍵 (-COOH) 或鄰位羰基分子內六元環螯合氫鍵酚羥基 (-OH⋯O=C) 特徵（受溶劑與水分交換影響顯著）。`;
        alternativeExplanations = [
          "羧酸質子 (-COOH，10.5–13.5 ppm，常伴隨 IR 2500–3300 cm⁻¹ 寬帶與 C=O ~1710 cm⁻¹)",
          "分子內螯合氫鍵酚羥基或 β-二酮烯醇式 (Chelated Ar-OH / Enol OH，10.5–14.0 ppm)",
          ...(formulaForbidN ? [] : ["強酸性磺醯亞胺或雜環 NH (僅於含 N 分子式成立)"]),
        ];
      } else if (shift >= 9.3 && shift < 10.5) {
        regionCategory = "醛基質子 / 強氫鍵酚或醯胺活潑氫區 Aldehyde / H-Bonded OH-NH (9.3–10.5 ppm)";
        expectedRange = [9.3, 10.5];
        const isSharpAldehyde =
          mult === "s" ||
          (mult === "d" && jVals.some((j) => j <= 3.5)) ||
          (mult === "t" && jVals.some((j) => j <= 3.5));
        envLabel = isSharpAldehyde
          ? "醛基質子 (-CHO) 或 DMSO-d₆ 中之酚羥基 (Ar-OH)"
          : "醛基質子 (-CHO) 或強氫鍵活潑質子 (-OH / -NH)";
        reasoning = `於低場 δ ${shift.toFixed(2)} ppm 觀測到共振（${integLabel}，${multLabel}），主要對應受羰基磁異向性錐去遮蔽之醛基質子 (-CHO)，或在強氫鍵受體溶劑 (如 DMSO-d₆) 中受去遮蔽之酚羥基 (Ar-OH)。`;
        alternativeExplanations = [
          "醛基質子 (-CHO，通常為尖銳 s 或小耦合 t/d，伴隨 ¹³C 190–205 ppm 與 IR 2720/2820 cm⁻¹ 費米雙峰)",
          "酚羥基 (Ar-OH 於 DMSO-d₆ 或 Acetone-d₆ 中常移至 9.0–10.5 ppm)",
          ...(formulaForbidN ? [] : ["芳基醯胺或雜環活潑 NH (-CONHAr，僅於含 N 分子式成立)"]),
        ];
      } else if (shift >= 8.15 && shift < 9.3) {
        regionCategory = "低場去遮蔽芳香質子區 Deshielded sp² CH (EWG-Substituted Ar-H / Heteroaromatic α-H / Imine CH, 8.15–9.25 ppm)";
        expectedRange = [8.15, 9.25];
        const hasPyridineAlphaBetaJ = jVals.some((j) => j >= 4.2 && j <= 5.7);
        const hasBenzeneOrthoJ = jVals.some((j) => j >= 7.4 && j <= 9.2);
        envLabel = formulaForbidN
          ? `強吸電子基取代芳香質子 EWG-Substituted Ar-H (鄰近 -NO₂, -CN, -COR, -COOR 等，${integLabel})`
          : `低場去遮蔽芳香質子（強吸電子基取代苯環 Ar-H 或含氮雜環 α-H，${integLabel}）`;
        reasoning = `於低場芳香區 δ ${shift.toFixed(2)} ppm（${integLabel}，${multLabel}，${jLabel}）出現去遮蔽訊號。此為 Level 2 局部去遮蔽化學環境，可能源於強吸電子取代基（-NO₂、-COR、-CN、-SO₂R）之誘導與共振去遮蔽效應，${
          formulaForbidN
            ? "且因分子式不含 N，已排除吡啶/含氮雜環假設。"
            : "或環內 sp² 氮原子鄰位 α-CH 去遮蔽；必須結合分子式 N 原子數與 ³J 耦合常數（苯環鄰位 7.5–9.0 Hz vs 吡啶 ³J₂₃ ≈ 4.5–5.5 Hz）進行競爭假設判別，不直接單一鎖定為吡啶環。"
        }`;
        alternativeExplanations = [
          "強吸電子基 (-NO₂, -CN, -C=O, -SO₂R) 鄰位芳香質子 (EWG-Ar-H, ³J_ortho ≈ 7.5–9.0 Hz)",
          "多取代缺電子芳香環或多環芳香烴外圍去遮蔽質子",
          ...(formulaForbidN
            ? []
            : [
                "含氮芳香雜環鄰位 α-H (Pyridine / Diazine / Quinoline α-H, 典型 ³J₂₃ ≈ 4.5–5.5 Hz)",
                "亞胺/肟質子 (-CH=N-) 或低場醯胺活潑氫 (-CONH-)",
              ]),
        ];
        competingHypotheses = [
          {
            
            hypothesis: "強吸電子基取代苯環鄰位質子 (EWG-Substituted Benzene Ar-H)",
            level: "LEVEL_3_FUNCTIONAL_GROUP_HYPOTHESIS",
            plausibility: hasBenzeneOrthoJ || formulaForbidN ? "HIGH" : "MODERATE",
            supportingConditions: [
              ...(hasBenzeneOrthoJ ? [`觀測到典型苯環鄰位耦合 J ≈ ${jVals.join(", ")} Hz (7.4–9.2 Hz)`] : []),
              ...(formulaForbidN ? ["分子式不含 N 原子，完全支持無氮缺電子苯環"] : []),
            ],
            contradictingConditions: [],
            requiredOrthogonalVerification: "其他芳香訊號、J 耦合與碳環境佐證",
          },
          ...(formulaForbidN
            ? []
            : [
                {
                  
                  hypothesis: "含氮芳香雜環 α-位質子 (Pyridine / Quinoline α-H)",
                  level: "LEVEL_4_MOLECULAR_SCAFFOLD_HYPOTHESIS" as const,
                  plausibility: hasPyridineAlphaBetaJ ? "MODERATE" as const : "LOW" as const,
                  supportingConditions: hasPyridineAlphaBetaJ
                    ? [`觀測到 ³J ≈ ${jVals.join(", ")} Hz，落在吡啶 α-β 耦合 (4.3–5.7 Hz) 區間`]
                    : ["位於 8.15–9.25 ppm 低場區，若分子含 N 則列為競爭假設"],
                  contradictingConditions: hasBenzeneOrthoJ
                    ? ["耦合常數 ~7.5–9.0 Hz 較偏向一般苯環鄰位耦合而非吡啶 C2-C3 耦合"]
                    : [],
                  requiredOrthogonalVerification: "獨立含氮證據及其他環訊號；單一位移不能確認骨架",
                },
              ]),
        ];
      } else if (shift >= 6.4 && shift < 8.15) {
        regionCategory = "芳香族與雜環質子區 Aromatic / Heteroaromatic (6.4–8.15 ppm)";
        expectedRange = [6.4, 8.15];
        if (
          integ === 2 &&
          mult === "d" &&
          jVals.some((j) => j >= 7.8 && j <= 9.2)
        ) {
          envLabel =
            shift >= 7.45
              ? "對位雙取代苯環質子（鄰近拉電子基 EWG，2H AA'BB'）"
              : "對位雙取代苯環質子（鄰近推電子基 EDG 如 -OH/-OR，2H AA'BB'）";
          reasoning = `於 δ ${shift.toFixed(2)} ppm 呈現 2H 雙重峰（${jLabel}），顯示 1,4-對位雙取代苯環之鄰位耦合對稱等價環境。`;
        } else {
          envLabel = `芳香環質子或共軛烯基/雜環質子 Aromatic CH (${integLabel})`;
          reasoning = `位於芳香環環電流去遮蔽區 δ ${shift.toFixed(2)} ppm（${integLabel}，${multLabel}，${jLabel}）；若為寬峰亦可能為酚羥基 (Ar-OH) 或芳香醯胺 (-CONH-)。`;
        }
        alternativeExplanations = [
          "取代苯環 C-H 質子 (6.5–8.15 ppm)",
          ...(formulaHasO ? ["酚羥基活潑質子 (Ar-OH，常於 4.5–7.8 ppm 隨溶劑與濃度漂移)"] : []),
          ...(formulaForbidN ? [] : ["含氮雜環 β/γ-CH 或醯胺 NH (僅於含 N 分子式考慮)"]),
        ];
      } else if (shift >= 4.6 && shift < 6.4) {
        regionCategory = "烯基 / 羥基或胺基活潑氫區 Alkene / Exchangeable OH-NH (4.6–6.4 ppm)";
        expectedRange = [4.6, 6.4];
        envLabel = formulaForbidN
          ? "烯基 C=C-H 或醇/酚羥基活潑質子 (-OH)"
          : "烯基 C=C-H 或可交換活潑質子 (-OH / -NH)";
        reasoning = `於 δ ${shift.toFixed(2)} ppm 觀測到訊號（${integLabel}，${multLabel}），可能對應烯基 sp² C-H，或醇/酚羥基 (-OH)${
          formulaForbidN ? "" : "、芳香胺 (-NH₂)"
        } 之可交換質子。`;
        alternativeExplanations = [
          "烯烴雙鍵質子 (C=C-H)",
          "酚羥基或氫鍵化醇羥基 (-OH，於 CDCl₃ 或 DMSO-d₆ 中常見)",
          ...(formulaForbidN ? [] : ["苯胺或醯胺活潑氫 (-NHn)"]),
        ];
      } else if (shift >= 3.1 && shift < 4.6) {
        regionCategory = "雜原子鄰近區 Heteroatom-Adjacent (3.1–4.6 ppm)";
        expectedRange = [3.1, 4.6];
        if (integ === 3 && mult === "s") {
          envLabel = "甲氧基或甲酯基 (-OCH₃)";
          reasoning = `於 δ ${shift.toFixed(2)} ppm 出現 3H 單峰，為直接鍵結於氧原子之孤立甲基 (-OCH₃) 典型訊號。`;
        } else if (integ === 2 && mult === "q") {
          envLabel = "連氧亞甲基的競爭假設（乙氧基需其他訊號佐證）";
          reasoning = `於 δ ${shift.toFixed(2)} ppm 呈現 2H 四重峰（${jLabel}），與鄰近甲基耦合，符合乙氧基酯或醚 (-OCH₂CH₃) 特徵。`;
        } else {
          envLabel = "氧/氮鄰近脂肪族質子 (-O-CHn- / -N-CHn-)";
          reasoning = `於 δ ${shift.toFixed(2)} ppm（${integLabel}，${multLabel}）受電負度氧或氮原子誘導去遮蔽。`;
        }
      } else if (shift >= 1.85 && shift < 3.1) {
        regionCategory = "苄基 / 羰基鄰近區 α-Carbonyl / Benzylic (1.85–3.1 ppm)";
        expectedRange = [1.85, 3.1];
        if (integ === 3 && mult === "s") {
          envLabel = "甲基酮乙醯基 (-C(=O)CH₃) 或芳基/雜芳基甲基 (Ar-CH₃)";
          reasoning = `於 δ ${shift.toFixed(2)} ppm 呈現 3H 單峰，符合無鄰近耦合質子之甲基酮 (-C(=O)CH₃) 或芳環/吡啶環甲基取代基。`;
        } else {
          envLabel = "苄基或羰基 α-位質子 (Benzylic / α-C=O CHn)";
          reasoning = `於 δ ${shift.toFixed(2)} ppm（${integLabel}，${multLabel}，${jLabel}）位於 sp² 碳鄰近去遮蔽區。`;
        }
      } else {
        regionCategory = "高場飽和脂肪區 Aliphatic / Organosilicon (0.0–1.85 ppm)";
        expectedRange = [0.0, 1.85];
        if (shift < 0.35) {
          envLabel = "有機矽甲基質子 (Si-CH₃)";
          reasoning = `於極高場 δ ${shift.toFixed(2)} ppm（${integLabel}，${multLabel}）受電正性矽原子強烈遮蔽，為典型矽氧烷/有機矽甲基訊號。`;
        } else if (integ === 3 && mult === "t") {
          envLabel = "飽和末端訊號；可能為與兩個鄰氫耦合的甲基";
          reasoning = `於 δ ${shift.toFixed(2)} ppm 出現 3H 三重峰（${jLabel}），與鄰近 -CH₂- 四重峰自旋耦合。`;
        } else if (integ === 6 && mult === "d") {
          envLabel = "雙重峰的競爭假設；異丙基需 septet 及比例佐證";
          reasoning = `於 δ ${shift.toFixed(2)} ppm 呈現 6H 雙重峰（${jLabel}），代表兩個化學等價之甲基受單一鄰近次甲基 (CH) 分裂。`;
        } else {
          envLabel = `飽和烷基質子 Alkyl CHn (${integLabel})`;
          reasoning = `於高場飽和區 δ ${shift.toFixed(2)} ppm 觀測到訊號（${integLabel}，${multLabel}，${jLabel}）。`;
        }
      }

      let coupledPartnerShift: number | undefined;
      let deltaNuOverJMin: number | null = null;
      if (jVals.length > 0) {
        const partner = peaks.find(
          (other, idx) =>
            idx !== i &&
            Array.isArray(other.jValues) &&
            other.jValues.some((oj) => Math.abs(oj - jVals[0]) <= 0.45)
        );
        if (partner) {
          coupledPartnerShift = partner.x;
          const deltaHz = Math.abs(shift - partner.x) * spectrometerFreqMHz;
          deltaNuOverJMin = Number((deltaHz / Math.max(0.5, jVals[0])).toFixed(2));
        }
      }

      const isExchangeableEnv =
        pk.isBroad ||
        mult === "br s" ||
        mult === "br" ||
        (shift >= 10.5 && shift <= 13.5) ||
        (pk.assignment ? /OH|NH|COOH|活潑|交換/i.test(pk.assignment) : false);

      const isOverlapOrUncertainEnv =
        pk.userClassification === "OVERLAP" ||
        pk.classificationTag === "OVERLAP" ||
        pk.role === "OVERLAP" ||
        mult === "m" ||
        mult === "multiplet" ||
        mult === "unresolved";

      const jCouplingObjs: JCoupling[] = jVals.map((jVal, jIdx) => {
        let couplingType: JCoupling["couplingType"] = "unassigned";
        const hasTransAlkeneJInGroup = jVals.some((j) => j >= 14.0 && j <= 19.0);
        if (
          shift >= 4.5 &&
          shift <= 7.4 &&
          (jVal >= 13.5 || hasTransAlkeneJInGroup || shift < 6.4)
        ) {
          if (jVal >= 13.5 && jVal <= 19.0) couplingType = "trans-alkene (3J)";
          else if (jVal >= 8.5 && jVal < 13.5) couplingType = "cis-alkene (3J)";
          else if (jVal <= 3.2) couplingType = "geminal-alkene (2J)";
          else couplingType = "vicinal (3J)";
        } else if (shift >= 6.4 && shift <= 9.25) {
          if (jVal >= 6.8 && jVal <= 9.2) couplingType = "ortho-aromatic (3J)";
          else if (jVal >= 4.2 && jVal < 6.8) couplingType = "heteroaromatic-ortho (3J)";
          else if (jVal >= 1.2 && jVal <= 3.5) couplingType = "meta-aromatic (4J)";
          else if (jVal < 1.2) couplingType = "para-aromatic (5J)";
        } else {
          if (jVal >= 11.5 && jVal <= 16.5) couplingType = "geminal (2J)";
          else if (jVal >= 5.5 && jVal <= 8.8) couplingType = "vicinal (3J)";
          else if (jVal >= 1.0 && jVal < 4.0) couplingType = "long-range (4J/5J)";
        }
        return {
          atomA: `H_obs_${i + 1}`,
          atomB: coupledPartnerShift
            ? `H_obs_δ${coupledPartnerShift.toFixed(2)}`
            : `H_partner_${i + 1}_${jIdx + 1}`,
          J: jVal,
          couplingType,
          dihedralAngle: "NOT_PROVIDED",
          confidence: 0.85,
          citationId: "PRETSCH_EMPIRICAL_TABLES",
        };
      });

      const simulatedLines = SpinCouplingCalculator.simulateFirstOrderMultiplet(
        shift,
        jVals.map((jVal) => ({
          jHz: jVal,
          partnerProtons:
            mult === "t"
              ? 2
              : mult === "q"
                ? 3
                : mult === "quint"
                  ? 4
                  : mult === "sext"
                    ? 5
                    : mult === "sept"
                      ? 6
                      : 1,
        })),
        spectrometerFreqMHz
      );

      const isStrongSecondOrder =
        deltaNuOverJMin !== null && deltaNuOverJMin < 6.0;

      const spinCouplingAnalysis: SpinCouplingAnalysis = {
        spinSystemNotation:
          integ === 2 && mult === "d" && shift >= 6.4 && shift <= 8.9
            ? "AA'BB'"
            : isStrongSecondOrder
              ? "AB / ABX (Second-Order Strong Coupling)"
              : isExchangeableEnv
                ? "Exchange-Broadened Labile Spin"
                : isOverlapOrUncertainEnv
                  ? "Overlapped / Complex Multiplet"
                  : jVals.length > 0
                    ? "First-Order Spin System"
                    : "Isolated Singlet",
        couplingOrder: isExchangeableEnv
          ? "EXCHANGE_BROADENED"
          : isStrongSecondOrder
            ? "SECOND_ORDER_STRONG_COUPLING"
            : isOverlapOrUncertainEnv
              ? "UNRESOLVED_MULTIPLET"
              : "FIRST_ORDER",
        deltaNuOverJMin,
        strongCouplingWarning: isStrongSecondOrder
          ? `觀測到二階強耦合特徵 (Δν/J = ${deltaNuOverJMin} < 6 at ${spectrometerFreqMHz} MHz)：相鄰耦合峰呈現屋頂效應 (Roofing effect) 與非一階線強度畸變。`
          : undefined,
        multipletCode: mult || "unresolved",
        multipletDescriptionZh: `${multLabel} (${jLabel})`,
        jCouplings: jCouplingObjs,
        simulatedLines,
        isExchangeBroadened: isExchangeableEnv,
      };

      const potentialSolventOrImpurity = matchSolventOrReferenceSignal(
        "1H_NMR",
        shift,
        activeSolvent
      );

      let pairedStructureAtomGroup: string | undefined;
      if (expectedStructure && !expectedStructure.isFormulaOnly) {
        const fgText = expectedStructure.detectedFunctionalGroups.join(" ");
        if (shift >= 9.3 && fgText.includes("醛")) {
          pairedStructureAtomGroup = `對應預期結構 ${expectedStructure.name} 之醛基 (-CHO)`;
        } else if (shift >= 10.5 && fgText.includes("羧酸")) {
          pairedStructureAtomGroup = `對應預期結構 ${expectedStructure.name} 之羧酸 (-COOH)`;
        } else if (shift >= 6.4 && shift <= 8.6 && fgText.includes("芳香")) {
          pairedStructureAtomGroup = `對應預期結構 ${expectedStructure.name} 之芳香環 C-H`;
        } else if (shift >= 3.1 && shift <= 4.6 && (fgText.includes("醚") || fgText.includes("酯"))) {
          pairedStructureAtomGroup = `對應預期結構 ${expectedStructure.name} 之烷氧基 (-OCHn)`;
        } else {
          pairedStructureAtomGroup = `對應預期結構 ${expectedStructure.molecularFormula} 之脂肪族/取代基位點`;
        }
      }

      const symmetryNote =
        integ === null
          ? isImageSpectrum
            ? `圖片估算訊號 (相對強度 ${relIntensity}%)，未強制推斷精確氫數`
            : "未提供積分面積，無法直接判定磁等價氫原子數目"
          : integ === 2 && shift >= 6.4 && shift <= 8.9
          ? "2H 對稱等價（C₂ 軸對稱芳香環/吡啶環自旋對）"
          : integ === 6
          ? "6H 對稱等價（異丙基/異丁基雙甲基等價）"
          : integ === 3
          ? "3H 快速旋轉甲基等價"
          : `相對積分 ${integ} 化學環境`;

      const baseConf = isImageSpectrum
        ? Math.round((pk.confidence ?? 0.72) * 100)
        : isOverlapOrUncertainEnv
        ? 74
        : integ !== null && mult !== null
        ? 86
        : integ !== null || mult !== null
        ? 74
        : 60;

      if (isStrongSecondOrder && spinCouplingAnalysis.strongCouplingWarning) {
        reasoning += ` ${spinCouplingAnalysis.strongCouplingWarning}`;
      }
      if (potentialSolventOrImpurity) {
        reasoning += ` [提示：${potentialSolventOrImpurity.explanationZh}]`;
      }

      if (isExchangeableEnv) {
        const solventExchangeNote =
          activeSolvent === "DMSO-d6"
            ? "於強氫鍵受體溶劑 DMSO-d₆ 中，-OH 質子交換速率顯著降低，常移向低場（醇 OH 4.0–6.2 ppm 常呈耦合 d/t；酚 Ar-OH 8.5–10.8 ppm 呈尖峰或微寬單峰）。"
            : activeSolvent === "D2O" || activeSolvent === "CD3OD"
              ? `於質子性氘代溶劑 ${activeSolvent} 中，可交換活潑氫 (-OH/-NH/-COOH) 會發生快速 H/D 同位素交換而大幅衰減或消失，並匯入 HDO/CD₃OH 殘留水峰。`
              : "於 CDCl₃ 中，-OH/-NH 化學位移與峰寬高度取決於樣品濃度、水分與溫度（醇 OH 常於 1.0–5.0 ppm 呈 br s；酚 OH 常於 4.5–7.5 ppm）。";
        reasoning += ` [活潑氫溶劑效應：${solventExchangeNote}]`;
        if (alternativeExplanations.length === 0) {
          alternativeExplanations = [
            "醇或酚羥基活潑質子 (-OH，隨溶劑氫鍵與濃度移動，D₂O 交換可消失)",
            ...(formulaForbidN ? [] : ["胺基或醯胺活潑質子 (-NH / -NH₂，受 ¹⁴N 四極矩弛豫影響常呈寬峰)"]),
            "樣品微量水分或 HDO 交換峰",
          ];
        }
      }

      environments.push({
        id: `h1-env-${i}-${Math.round(shift * 100)}`,
        environmentLabel: envLabel,
        shiftPpm: Number(shift.toFixed(2)),
        expectedShiftRange: expectedRange,
        integration: integ,
        rawIntegralValue: integ,
        isExchangeable: isExchangeableEnv,
        isOverlapOrUncertain: isOverlapOrUncertainEnv,
        relativeIntensity: relIntensity,
        multiplicity: mult,
        jCouplingHz: jVals,
        couplings: jCouplingObjs,
        spinCouplingAnalysis,
        solventApplied: activeSolvent,
        spectrometerFrequencyMHz: spectrometerFreqMHz,
        literatureSources: [
          NMR_LITERATURE_REGISTRY.JONAS_2022_MRC,
          NMR_LITERATURE_REGISTRY.PRETSCH_EMPIRICAL_TABLES,
          ...(activeSolvent !== "Unknown"
            ? [NMR_LITERATURE_REGISTRY.GOTTLIEB_1997_JOC, NMR_LITERATURE_REGISTRY.CASABIANCA_2020_MRC]
            : []),
        ],
        dataNature: "EMPIRICAL_INCREMENT_MODEL",
        confidenceLevel: baseConf >= 82 ? "HIGH" : baseConf >= 70 ? "MEDIUM" : "LOW",
        inferenceLevel,
        alternativeExplanations,
        competingHypotheses: competingHypotheses.length > 0 ? competingHypotheses : undefined,
        identifiedImpurityOrSolvent: potentialSolventOrImpurity
          ? {
              name: potentialSolventOrImpurity.name,
              role: potentialSolventOrImpurity.role,
              literatureShiftPpm: potentialSolventOrImpurity.literatureShiftPpm,
              citationDoi: potentialSolventOrImpurity.citationDoi,
              explanationZh: potentialSolventOrImpurity.explanationZh,
            }
          : undefined,
        regionCategory,
        coupledPartnerShift,
        pairedStructureAtomGroup,
        symmetryNote,
        modelType: "EMPIRICAL",
        source: envSource,
        confidence: baseConf,
        reasoning,
      });
    }

    const allHaveIntegration = environments.every((e) => e.integration !== null);
    const totalIntegratedProtons: number | null = null; // Experimental inputs are relative, not an absolute proton calibration.

    const paraDoublets = environments.filter(
      (e) =>
        e.shiftPpm >= 6.4 &&
        e.shiftPpm <= 9.1 &&
        e.integration === 2 &&
        (e.multiplicity === "d" || e.multiplicity === "dd")
    );

    const aromaticAndHeteroEnvs = environments.filter(
      (e) => e.shiftPpm >= 6.4 && e.shiftPpm <= 9.25
    );
    const possibleHeteroaromaticDeshieldedCH = aromaticAndHeteroEnvs.some(
      (e) => e.shiftPpm >= 8.15 && e.shiftPpm <= 9.25
    );
    const isC2vHeteroOrMonoAr =
      aromaticAndHeteroEnvs.length === 3 &&
      possibleHeteroaromaticDeshieldedCH &&
      (() => {
        const integs = aromaticAndHeteroEnvs
          .map((e) => e.integration)
          .filter((n): n is number => n !== null);
        if (integs.length === 3) {
          const sorted = integs.slice().sort((a, b) => a - b);
          const minI = Math.max(1e-6, sorted[0]);
          return (
            Math.abs(sorted[1] / minI - 2) <= 0.35 &&
            Math.abs(sorted[2] / minI - 2) <= 0.35
          );
        }
        return true;
      })();

    const missingIntegCount = environments.filter((e) => e.integration === null).length;
    const missingMultCount = environments.filter((e) => e.multiplicity === null).length;

    // 乙基/乙氧基自旋系統聯合推論：需同時滿足化學位移分區與多重性/積分相容性（不得以單獨 integration===2 當作 quartet，反之亦然）
    const ethylQCandidates = environments.filter(
      (e) =>
        e.shiftPpm >= 2.1 &&
        e.shiftPpm <= 4.65 &&
        (e.multiplicity === "q" || e.multiplicity === "quartet")
    );
    const ethylTCandidates = environments.filter(
      (e) =>
        e.shiftPpm >= 0.85 &&
        e.shiftPpm <= 1.55 &&
        (e.multiplicity === "t" || e.multiplicity === "triplet")
    );
    // 檢查 J 值偶合常數相容性（若皆有測得 J 值，兩者之差應在 1.5 Hz 內）
    const hasEthylPair = ethylQCandidates.some((q) =>
      ethylTCandidates.some((t) => {
        const qi = q.rawIntegralValue ?? q.integration;
        const ti = t.rawIntegralValue ?? t.integration;
        if (qi == null || ti == null || qi <= 0 || ti <= 0 || Math.abs(ti / qi - 1.5) > 0.25) return false;
        const qJ = q.jCouplingHz[0];
        const tJ = t.jCouplingHz[0];
        if (qJ !== undefined && tJ !== undefined) {
          return Math.abs(qJ - tJ) <= 1.6;
        }
        return true;
      })
    );

    let symmetrySummary = "";
    if (isC2vHeteroOrMonoAr) {
      symmetrySummary = `偵測到 C₂v 對稱缺電子芳香雜環（如未取代吡啶環 2H:1H:2H）或強去遮蔽單取代六元芳香環自旋系統（3 組芳香區訊號，含 δ ${aromaticAndHeteroEnvs[0].shiftPpm} ppm 低場訊號）。`;
    } else if (possibleHeteroaromaticDeshieldedCH && aromaticAndHeteroEnvs.length === 2) {
      symmetrySummary = `偵測到對稱取代缺電子芳香雜環系統（2 組芳香區訊號，如 4-取代吡啶 AA'BB' 或 2,6-雙取代吡啶，含 δ ${aromaticAndHeteroEnvs[0].shiftPpm} ppm 低場訊號）。`;
    } else if (possibleHeteroaromaticDeshieldedCH && aromaticAndHeteroEnvs.length === 4) {
      symmetrySummary = `偵測到非對稱單取代缺電子芳香雜環系統（4 組不等價芳香區訊號，如 2-取代或 3-取代吡啶環，含 δ ${aromaticAndHeteroEnvs[0].shiftPpm} ppm 鄰氮 α-H 低場訊號）。`;
    } else if (paraDoublets.length === 2) {
      symmetrySummary = `偵測到典型 1,4-對位雙取代芳香環對稱性（於 δ ${paraDoublets[0].shiftPpm} 與 ${paraDoublets[1].shiftPpm} ppm 出現兩組 2H 雙重峰）。`;
    } else if (hasEthylPair) {
      symmetrySummary = `共辨識出 ${environments.length} 組獨立分析物 ¹H 化學位移訊號；偵測到典型乙基/乙氧基 (-CH₂-CH₃) A₂X₃ 自旋耦合系統 (quartet : triplet 積分約 2 : 3；J 值未提供時仍屬待驗證片段)。`;
    } else {
      symmetrySummary = `共辨識出 ${environments.length} 組獨立分析物 ¹H 化學位移訊號。`;
    }

    if (excludedRoleCount > 0) {
      symmetrySummary += ` （已自動排除 ${excludedRoleCount} 組標記為 SOLVENT / WATER / IMPURITY / REFERENCE 之非分析物訊號）。`;
    }

    if (totalIntegratedProtons !== null) {
      symmetrySummary += ` 總積分質子數為 ${totalIntegratedProtons}H。`;
    } else {
      symmetrySummary += ` 注意：其中 ${missingIntegCount} 組訊號未提供積分值（標示為「積分：未知」）、${missingMultCount} 組未提供精確多重峰型，系統絕不以峰高自動捏造積分或預設為單峰 (s)。`;
    }

    for(const env of environments){
      const peak=spectrum.peaks.find(p=>Math.abs(p.x-env.shiftPpm)<.005);if(!peak)continue;
      const hypotheses=inferSignalEnvironments('1H_NMR',peak,activeSolvent);
      env.environmentHypotheses=hypotheses;
      if(hypotheses.length)env.confidence=Math.min(env.confidence,Math.round(80*hypotheses[0].compatibility));
      if(hypotheses.length)env.environmentLabel=hypotheses.slice(0,3).map(h=>h.label).join('／');
      if(peak.isExchangeable!==undefined)env.isExchangeable=peak.isExchangeable;
      env.alternativeExplanations=hypotheses.map(h=>h.label);
    }
    const structuralConstraints = this.build1HNMRStructuralConstraints(
      spectrum,
      environments,
      expectedStructure
    );
    const integrationSemantics =
      ChemicalHardConstraintValidator.analyzeH1NMRIntegrationSemantics(
        environments,
        isImageSpectrum,
        environments.some((e) => e.isOverlapOrUncertain),
        expectedStructure?.atomCounts,
        activeSolvent
      );

    // Build spinSystems summary for protonSummary
    const isopropylPairs = findIsopropylPairs(environments);
    const spinSystems: {
      patternName: string;
      chemicalShifts: number[];
      jValues: number[];
      protonCount: number;
    }[] = [];

    // Detect Ethyl / Ethoxy (-CH2-CH3) spin system with joint multiplicity & integration compatibility
    let ethylQ: typeof environments[0] | undefined;
    let ethylT: typeof environments[0] | undefined;
    for (const q of ethylQCandidates) {
      for (const t of ethylTCandidates) {
        const qi = q.rawIntegralValue ?? q.integration;
        const ti = t.rawIntegralValue ?? t.integration;
        if (qi == null || ti == null || qi <= 0 || ti <= 0 || Math.abs(ti / qi - 1.5) > 0.25) continue;
        const qJ = q.jCouplingHz[0];
        const tJ = t.jCouplingHz[0];
        if (qJ === undefined || tJ === undefined || Math.abs(qJ - tJ) <= 1.6) {
          ethylQ = q;
          ethylT = t;
          break;
        }
      }
      if (ethylQ && ethylT) break;
    }

    for (const [ch,ch3] of isopropylPairs) spinSystems.push({patternName:"可能的異丙基 (-CH(CH₃)₂)：septet／doublet 比例約 1 : 6",chemicalShifts:[ch.shiftPpm,ch3.shiftPpm],jValues:ch.jCouplingHz,protonCount:7});
    if (ethylQ && ethylT) {
      spinSystems.push({
        patternName:
          ethylQ.shiftPpm >= 3.5
            ? "乙氧基偶合系統 (-OCH2CH3, 2H q + 3H t)"
            : "乙基自旋偶合系統 (-CH2CH3, 2H q + 3H t)",
        chemicalShifts: [ethylQ.shiftPpm, ethylT.shiftPpm],
        jValues: ethylQ.jCouplingHz,
        protonCount: 5,
      });
    }

    // Detect Isopropyl (-CH(CH3)2) spin system
    const iprD = environments.find(
      (e) =>
        e.shiftPpm >= 0.85 &&
        e.shiftPpm <= 1.55 &&
        e.integration === 6 &&
        e.multiplicity === "d"
    );
    const iprCH = environments.find(
      (e) =>
        e.shiftPpm >= 1.6 &&
        e.shiftPpm <= 3.8 &&
        e.integration === 1 &&
        (e.multiplicity === "m" ||
          e.multiplicity === "sept" ||
          e.multiplicity === "hept")
    );
    if (iprD) {
      spinSystems.push({
        patternName: "異丙基自旋偶合系統 (-CH(CH3)2, 1H septet/m + 6H d)",
        chemicalShifts: iprCH ? [iprCH.shiftPpm, iprD.shiftPpm] : [iprD.shiftPpm],
        jValues: iprD.jCouplingHz.length > 0 ? iprD.jCouplingHz : [6.9],
        protonCount: iprCH ? 7 : 6,
      });
    }

    // Detect Monosubstituted Terminal Vinyl (-CH=CH2, ABX/AMX 3x1H with trans & cis J)
    const alkeneEnvs = environments.filter(
      (e) =>
        e.shiftPpm >= 4.8 &&
        e.shiftPpm <= 7.1 &&
        e.jCouplingHz.some((j) => j >= 9.5 && j <= 18.5)
    );
    const hasTransAlkene = alkeneEnvs.some((e) =>
      e.jCouplingHz.some((j) => j >= 14.5 && j <= 18.5)
    );
    const hasCisAlkene = alkeneEnvs.some((e) =>
      e.jCouplingHz.some((j) => j >= 9.0 && j < 14.5)
    );
    if (hasTransAlkene && hasCisAlkene && alkeneEnvs.length >= 2) {
      spinSystems.push({
        patternName:
          "單取代末端乙烯基偶合系統 (-CH=CH2, ³J_trans ≈ 16–18 Hz, ³J_cis ≈ 10–12 Hz, ²J_gem ≈ 1–2 Hz)",
        chemicalShifts: alkeneEnvs.map((e) => e.shiftPpm),
        jValues: Array.from(new Set(alkeneEnvs.flatMap((e) => e.jCouplingHz))),
        protonCount: alkeneEnvs.reduce((s, e) => s + (e.integration || 1), 0),
      });
    }

    const exchangeableProtons = environments
      .filter((e) => e.isExchangeable || e.shiftPpm >= 8.8)
      .map((e) => ({
        shift: e.shiftPpm,
        integral: e.integration || 1,
        label: e.environmentLabel,
      }));

    const protonSummary = {
      solvent: activeSolvent,
      totalIntegratedProtons,
      aromaticPatternHint: symmetrySummary,
      environments,
      spinSystems,
      exchangeableProtons,
      hasAldehydeProton: environments.some(
        (e) => e.shiftPpm >= 9.3 && e.shiftPpm <= 10.3
      ),
      hasCarboxylicAcidProton: environments.some((e) => e.shiftPpm >= 10.5),
      hasExchangeableProton: exchangeableProtons.length > 0,
      hasMethoxyGroup: environments.some(
        (e) =>
          e.shiftPpm >= 3.65 &&
          e.shiftPpm <= 4.0 &&
          (e.integration ?? 3) === 3
      ),
      hasAcetoxyOrMethylKetone: environments.some(
        (e) =>
          e.shiftPpm >= 1.9 &&
          e.shiftPpm <= 2.65 &&
          (e.integration ?? 3) === 3
      ),
      summaryNotes: [symmetrySummary],
    };

    return {
      environments,
      annotatedPeaks,
      symmetrySummary,
      totalIntegratedProtons,
      integrationSemantics,
      protonSummary,
      structuralConstraints,
      statusMessage: `已完成 ¹H NMR 訊號環境分析（共 ${environments.length} 組分析物訊號；${
        totalIntegratedProtons !== null ? `總積分 ${totalIntegratedProtons}H` : "部分訊號缺乏積分/峰型資訊"
      }）。`,
    };
  }

  static build1HNMRStructuralConstraints(
    spectrum?: ExperimentalSpectrumData,
    precomputedEnvs?: ProtonEnvironment[],
    expectedStructure?: ParsedChemicalStructure | null
  ): StructuralConstraints {
    if (!spectrum || spectrum.digitizationFailed || spectrum.peaks.length === 0) {
      return { source: "1H_NMR", confidence: 0, evidence: [] };
    }

    const environments =
      precomputedEnvs !== undefined
        ? precomputedEnvs
        : this.analyzeExperimental1HNMR(spectrum, expectedStructure).environments;

    const formulaForbidN =
      expectedStructure?.atomCounts !== undefined &&
      (expectedStructure.atomCounts.N ?? 0) === 0;
    const formulaHasN =
      expectedStructure?.atomCounts !== undefined &&
      (expectedStructure.atomCounts.N ?? 0) > 0;

    const requiredFunctionalGroups: FunctionalGroupConstraint[] = [];
    const requiredSubstructures: StructuralMotifConstraint[] = [];
    const connectivityConstraints: ConnectivityConstraint[] = [];
    const evidence: EvidenceReference[] = [];

    const hasAldehyde = environments.find((e) => e.shiftPpm >= 9.3 && e.shiftPpm <= 10.6);
    if (hasAldehyde) {
      requiredFunctionalGroups.push({
        groupFamily: "Aldehyde",
        label: "醛基 Aldehyde (-CHO)",
        status: "REQUIRED",
        observedSignal: `δ ${hasAldehyde.shiftPpm} ppm (${
          hasAldehyde.integration !== null ? `${hasAldehyde.integration}H` : "積分未知"
        })`,
        expectedRange: "9.3–10.6 ppm",
        sourceModality: "1H_NMR",
        confidence: hasAldehyde.confidence,
      });
      requiredSubstructures.push({
        motifId: "motif-h1-cho",
        motifLabel: "醛基片段 (-CH=O)",
        smilesFragmentHint: "C=O",
        status: "REQUIRED",
        sourceModality: "1H_NMR",
        supportingObservation: `δ ${hasAldehyde.shiftPpm} ppm`,
        confidence: hasAldehyde.confidence,
      });
    }

    const hasAcid = environments.find((e) => e.shiftPpm > 10.6 && e.shiftPpm <= 13.5);
    if (hasAcid) {
      requiredFunctionalGroups.push({
        groupFamily: "Carboxylic acid",
        label: "羧酸 Carboxylic Acid (-COOH) 或分子內強氫鍵酚羥基",
        status: "PROBABLE",
        observedSignal: `δ ${hasAcid.shiftPpm} ppm`,
        expectedRange: "10.6–13.5 ppm",
        sourceModality: "1H_NMR",
        confidence: hasAcid.confidence,
      });
    }

    // Labile OH / NH protons in 1.5–10.5 ppm
    const labileEnv = environments.find(
      (e) => e.isExchangeable && e.shiftPpm >= 1.5 && e.shiftPpm <= 10.5
    );
    if (labileEnv) {
      requiredFunctionalGroups.push({
        groupFamily: "Alcohol",
        label: formulaForbidN
          ? "可交換羥基質子 (-OH：醇羥基或酚羥基)"
          : "可交換活潑氫 (-OH 羥基 或 -NH 胺/醯胺質子，競爭性假設)",
        status: "POSSIBLE",
        observedSignal: `δ ${labileEnv.shiftPpm} ppm (${labileEnv.multiplicity || "br s"})`,
        expectedRange: "1.5–10.5 ppm (solvent-dependent)",
        sourceModality: "1H_NMR",
        confidence: 72,
      });
    }

    const aromaticEnvs = environments.filter(
      (e) => e.shiftPpm >= 6.4 && e.shiftPpm <= 9.25 && !e.isExchangeable
    );
    const heteroAlphaEnvs = aromaticEnvs.filter((e) => e.shiftPpm >= 8.15 && e.shiftPpm <= 9.25);
    // Check whether coupling constants specifically indicate pyridine α-β coupling (4.3–5.7 Hz) vs benzene ortho coupling (7.4–9.2 Hz)
    const hasPyridineAlphaJ = heteroAlphaEnvs.some((e) =>
      e.jCouplingHz.some((j) => j >= 4.2 && j <= 5.7)
    );
    const hasBenzeneOrthoJOnDownfield = heteroAlphaEnvs.some((e) =>
      e.jCouplingHz.some((j) => j >= 7.4 && j <= 9.2)
    );

    let heteroaromaticConstraints: HeteroaromaticConstraint | undefined = formulaForbidN
      ? {
          status: "ABSENT",
          supportingSignals: ["分子式不含 N 原子 (N=0)，已排除吡啶與含氮芳香雜環假設"],
          confidence: 98,
        }
      : undefined;

    let substitutionHint:
      | "1,4-para"
      | "1,2-ortho"
      | "1,3-meta"
      | "monosubstituted"
      | "disubstituted-general"
      | "unknown" = "unknown";

    if (aromaticEnvs.length === 2) {
      const both2HDoublets = aromaticEnvs.every(
        (e) =>
          (e.integration === 2 || e.integration === null) &&
          (e.multiplicity === "d" ||
            e.multiplicity === "dd" ||
            e.multiplicity === "AA'BB'" ||
            e.multiplicity === "m" ||
            e.multiplicity === "multiplet" ||
            e.multiplicity === "unresolved" ||
            e.multiplicity === null)
      );
      substitutionHint = both2HDoublets ? "1,4-para" : "disubstituted-general";
      if (both2HDoublets) {
        const allowPyridineAlt = !formulaForbidN && heteroAlphaEnvs.length > 0 && !hasBenzeneOrthoJOnDownfield;
        requiredSubstructures.push({
          motifId: "motif-h1-para-ar",
          motifLabel: allowPyridineAlt
            ? "1,4-對位雙取代苯環 (AA'BB' 2H+2H) 或 4-取代吡啶環（競爭假設）"
            : "1,4-對位雙取代苯環 (1,4-para-disubstituted benzene ring, AA'BB' 2H+2H)",
          smilesFragmentHint: "c1ccc(...)cc1",
          status: "REQUIRED",
          sourceModality: "1H_NMR",
          supportingObservation: `δ ${aromaticEnvs[0].shiftPpm} & ${aromaticEnvs[1].shiftPpm} ppm`,
          confidence: 88,
        });
      }
      if (!formulaForbidN && heteroAlphaEnvs.length > 0 && (hasPyridineAlphaJ || formulaHasN)) {
        const strongParaPyridineEvidence = Boolean(
          hasPyridineAlphaJ && (formulaHasN || expectedStructure?.atomCounts === undefined)
        );
        heteroaromaticConstraints = {
          status: strongParaPyridineEvidence ? "PRESENT" : "POSSIBLE",
          ringTypes: ["pyridine", "pyrimidine", "pyrazine"],
          alphaToNitrogenProtonCount: heteroAlphaEnvs[0].integration ?? 2,
          symmetryType: "C2v_4_substituted_or_2_6_disubstituted_pyridine",
          supportingSignals: heteroAlphaEnvs.map((e) => `δ ${e.shiftPpm} ppm`),
          confidence: strongParaPyridineEvidence ? 84 : 68,
        };
        requiredFunctionalGroups.push({
          groupFamily: "Heteroaromatic",
          label: "對稱取代含氮芳香雜環或強拉電子對位苯環 (Competing Hypothesis: 4-Substituted Pyridine vs EWG-Para-Benzene)",
          status: "POSSIBLE",
          observedSignal: `δ ${aromaticEnvs.map((e) => e.shiftPpm).join(", ")} ppm`,
          expectedRange: "α-H / EWG-ortho-H 8.15–8.9 ppm, β-H 6.9–7.8 ppm",
          sourceModality: "1H_NMR",
          confidence: strongParaPyridineEvidence ? 82 : 68,
        });
      }
    } else if (aromaticEnvs.length === 1 && aromaticEnvs[0].integration === 5) {
      substitutionHint = "monosubstituted";
    } else if (aromaticEnvs.length === 3) {
      const integs = aromaticEnvs
        .map((e) => e.integration)
        .filter((n): n is number => n !== null);
      const is212Ratio =
        integs.length === 3 &&
        (() => {
          const sorted = integs.slice().sort((a, b) => a - b);
          const minI = Math.max(1e-6, sorted[0]);
          return (
            Math.abs(sorted[1] / minI - 2) <= 0.35 &&
            Math.abs(sorted[2] / minI - 2) <= 0.35
          );
        })();

      if (is212Ratio) {
        substitutionHint = "monosubstituted";
      } else {
        substitutionHint = "disubstituted-general";
      }

      if (!formulaForbidN && heteroAlphaEnvs.length > 0 && (hasPyridineAlphaJ || formulaHasN || is212Ratio)) {
        const totalAlphaH = heteroAlphaEnvs.reduce((s, e) => s + (e.integration ?? 2), 0);
        // Only lock PRESENT if J is characteristic of pyridine α-β (4.2–5.7 Hz) OR downfield signal is >= 8.45 ppm without benzene ortho J (7.4–9.2 Hz)
        const strongPyridineEvidence = Boolean(
          (hasPyridineAlphaJ ||
            (is212Ratio &&
              !hasBenzeneOrthoJOnDownfield &&
              heteroAlphaEnvs.some((e) => e.shiftPpm >= 8.45))) &&
            (formulaHasN || expectedStructure?.atomCounts === undefined)
        );
        heteroaromaticConstraints = {
          status: strongPyridineEvidence ? "PRESENT" : "POSSIBLE",
          ringTypes: ["pyridine", "pyrimidine", "quinoline"],
          alphaToNitrogenProtonCount: totalAlphaH,
          symmetryType: is212Ratio
            ? "C2v_unsubstituted_pyridine_or_sym_heteroaromatic"
            : "heteroaromatic_or_ewg_aromatic_3_signals",
          supportingSignals: aromaticEnvs.map(
            (e) =>
              `δ ${e.shiftPpm} ppm (${e.integration !== null ? `${e.integration}H` : "?H"}, ${
                e.multiplicity || "?"
              })`
          ),
          confidence: strongPyridineEvidence ? 82 : 68,
        };
        requiredFunctionalGroups.push({
          groupFamily: "Heteroaromatic",
          label: "含氮六元芳香雜環或強吸電子取代苯環 (Competing Hypothesis: Pyridine vs EWG-Benzene)",
          status: strongPyridineEvidence ? "PROBABLE" : "POSSIBLE",
          observedSignal: `δ ${aromaticEnvs.map((e) => e.shiftPpm).join(", ")} ppm (downfield signal at ${heteroAlphaEnvs[0].shiftPpm} ppm)`,
          expectedRange: "8.15–8.9 ppm, 7.0–7.9 ppm",
          sourceModality: "1H_NMR",
          confidence: strongPyridineEvidence ? 82 : 68,
        });
      }
      if (is212Ratio) {
        requiredSubstructures.push({
          motifId: "motif-h1-mono-ar",
          motifLabel: formulaForbidN
            ? "單取代苯環 (Monosubstituted Benzene 2H:2H:1H)"
            : "單取代苯環或 C₂v 六元芳香雜環 (Monosubstituted Benzene / C₂v Aromatic 2H:2H:1H)",
          smilesFragmentHint: "c1ccccc1",
          status: "PROBABLE",
          sourceModality: "1H_NMR",
          supportingObservation: `3 組芳香質子訊號 2H:2H:1H (${aromaticEnvs
            .map((e) => `${e.shiftPpm} ppm`)
            .join(", ")})`,
          confidence: 85,
        });
      }
    } else if (aromaticEnvs.length >= 4) {
      const hasIsolatedMetaProton = aromaticEnvs.some(
        (e) =>
          (e.integration === 1 || e.integration === null) &&
          (e.multiplicity === "s" ||
            e.multiplicity === "br s" ||
            (e.jCouplingHz.length > 0 &&
              e.jCouplingHz.every((j) => j <= 3.2)))
      );
      const orthoCoupledCount = aromaticEnvs.filter(
        (e) =>
          e.multiplicity === "d" ||
          e.multiplicity === "dd" ||
          e.multiplicity === "t" ||
          e.multiplicity === "td" ||
          e.multiplicity === "ddd" ||
          e.jCouplingHz.some((j) => j >= 6.8 && j <= 9.2)
      ).length;

      if (aromaticEnvs.length === 4) {
        if (hasIsolatedMetaProton) {
          substitutionHint = "1,3-meta";
        } else if (orthoCoupledCount >= 3) {
          substitutionHint = "1,2-ortho";
        } else {
          substitutionHint = "disubstituted-general";
        }
      } else {
        substitutionHint = "disubstituted-general";
      }

      if (!formulaForbidN && heteroAlphaEnvs.length > 0 && (hasPyridineAlphaJ || formulaHasN)) {
        const alphaCount = heteroAlphaEnvs.reduce((s, e) => s + (e.integration ?? 1), 0);
        heteroaromaticConstraints = {
          status: hasPyridineAlphaJ ? "PRESENT" : "POSSIBLE",
          ringTypes: ["pyridine", "quinoline", "isoquinoline"],
          alphaToNitrogenProtonCount: alphaCount,
          symmetryType:
            aromaticEnvs.length === 4
              ? "Cs_2_or_3_substituted_pyridine_or_disub_ewg_benzene"
              : "substituted_pyridine_or_quinoline",
          supportingSignals: aromaticEnvs.map((e) => `δ ${e.shiftPpm} ppm`),
          confidence: hasPyridineAlphaJ ? 82 : 68,
        };
        requiredFunctionalGroups.push({
          groupFamily: "Heteroaromatic",
          label: "單取代吡啶環或強拉電子雙取代苯環 (Competing Hypothesis: 2-/3-Substituted Pyridine vs 1,2-/1,3-EWG-Benzene)",
          status: "POSSIBLE",
          observedSignal: `δ ${aromaticEnvs.map((e) => e.shiftPpm).join(", ")} ppm`,
          expectedRange: "8.15–9.0 ppm, 7.0–7.9 ppm",
          sourceModality: "1H_NMR",
          confidence: hasPyridineAlphaJ ? 80 : 68,
        });
      }
    }

    const methoxyEnv = environments.find(
      (e) =>
        e.shiftPpm >= 3.3 &&
        e.shiftPpm <= 4.15 &&
        (e.integration === 3 || e.integration === null) &&
        (e.multiplicity === "s" ||
          e.multiplicity === "unresolved" ||
          e.multiplicity === "multiplet" ||
          e.multiplicity === null)
    );
    if (methoxyEnv) {
      requiredFunctionalGroups.push({
        groupFamily: "Ether",
        label: "甲氧基或甲酯基 (-OCH₃)",
        status: "PROBABLE",
        observedSignal: `δ ${methoxyEnv.shiftPpm} ppm (${
          methoxyEnv.integration !== null ? `相對積分 ${methoxyEnv.integration}` : "積分未知"
        })`,
        expectedRange: "3.3–4.15 ppm",
        sourceModality: "1H_NMR",
        confidence: methoxyEnv.confidence,
      });
      requiredSubstructures.push({
        motifId: "motif-h1-och3",
        motifLabel: "甲氧基/甲酯基片段 (-OCH₃)",
        smilesFragmentHint: "CO",
        status: "PROBABLE",
        sourceModality: "1H_NMR",
        supportingObservation: `δ ${methoxyEnv.shiftPpm} ppm (3H, s)`,
        confidence: methoxyEnv.confidence,
      });
    }

    const ethoxyPair = findEthylPairs(environments).find(([q])=>q.shiftPpm>=3.5);
    const ethoxyQ=ethoxyPair?.[0], ethoxyT=ethoxyPair?.[1];
    if (ethoxyQ && ethoxyT) {
      requiredSubstructures.push({
        motifId: "motif-h1-oc2h5",
        motifLabel: "乙氧基酯/醚片段 (-OCH₂CH₃)",
        smilesFragmentHint: "CCOC",
        status: "PROBABLE",
        sourceModality: "1H_NMR",
        supportingObservation: `δ ${ethoxyQ.shiftPpm} ppm (2H, q) + δ ${ethoxyT.shiftPpm} ppm (3H, t)`,
        confidence: 88,
      });
      connectivityConstraints.push({
        fromMotif: `-OCH₂- (δ ${ethoxyQ.shiftPpm} ppm)`,
        toMotif: `-CH₃ (δ ${ethoxyT.shiftPpm} ppm)`,
        relationship: "SPIN_COUPLED",
        supportingObservation: ethoxyQ.jCouplingHz.length ? `J coupling ${ethoxyQ.jCouplingHz.join(", ")} Hz` : "J 未提供；多重性與相對積分支持的局部片段假設",
        confidence: 88,
      });
    }

    for (const env of environments) {
      evidence.push({
        modality: "1H_NMR",
        observation: `¹H NMR = δ ${env.shiftPpm} ppm (${
          env.integration !== null ? `相對積分 ${env.integration}` : "integration unknown"
        }, ${env.multiplicity || "multiplicity unknown"})`,
        interpretation: env.environmentLabel,
        constraintSummary: `proton environment compatible with ${env.regionCategory}`,
        modelType: "EMPIRICAL",
        confidence: env.confidence,
      });
    }

    const alphaCarbonylEnv = environments.find(
      (e) => e.shiftPpm >= 2.0 && e.shiftPpm <= 2.9
    );
    if (alphaCarbonylEnv && !hasAldehyde && !hasAcid) {
      requiredFunctionalGroups.push({
        groupFamily: "Ketone",
        label: "鄰近羰基之脂肪族質子 (α-CHₙ to C=O)",
        status: "PROBABLE",
        observedSignal: `δ ${alphaCarbonylEnv.shiftPpm} ppm (${
          alphaCarbonylEnv.integration !== null ? `相對積分 ${alphaCarbonylEnv.integration}` : "?H"
        }, ${alphaCarbonylEnv.multiplicity || "?"})`,
        expectedRange: "2.0–2.9 ppm",
        sourceModality: "1H_NMR",
        confidence: 78,
      });
    }

    const totalIntegratedProtons = environments.reduce(
      (sum, e) => sum + (e.integration || 0),
      0
    );

    const avgConf =
      environments.length > 0
        ? Math.round(
            environments.reduce((sum, e) => sum + e.confidence, 0) / environments.length
          )
        : 0;

    if(heteroaromaticConstraints?.status==='PRESENT'){
      heteroaromaticConstraints={...heteroaromaticConstraints,status:'POSSIBLE',confidence:Math.min(65,heteroaromaticConstraints.confidence??65),supportingSignals:[...(heteroaromaticConstraints.supportingSignals??[]),'1D 位移與 J 只能支持競爭局部環境，未確認特定雜環骨架']};
    }
    return {
      source: "1H_NMR",
      heteroaromaticConstraints,
      requiredFunctionalGroups,
      requiredSubstructures,
      aromaticity:
        aromaticEnvs.length > 0
          ? {
              status: "PRESENT",
              substitutionPatternHint: substitutionHint,
              supportingSignals: aromaticEnvs.map(
                (e) =>
                  `δ ${e.shiftPpm} ppm (${e.integration !== null ? `${e.integration}H` : "?H"}, ${
                    e.multiplicity || "?"
                  })`
              ),
              confidence: 86,
            }
          : {
              status: "ABSENT",
              supportingSignals: ["No proton resonances in 6.5–9.2 ppm aromatic/heteroaromatic region"],
              confidence: 76,
            },
      carbonyl: hasAldehyde
        ? {
            status: "PRESENT",
            allowedSubtypes: ["Aldehyde"],
            excludedSubtypes: ["Carboxylic acid"],
            supportingSignals: [`δ ${hasAldehyde.shiftPpm} ppm (-CHO)`],
            confidence: hasAldehyde.confidence,
          }
        : hasAcid
        ? {
            status: "PRESENT",
            allowedSubtypes: ["Carboxylic acid"],
            excludedSubtypes: ["Aldehyde"],
            supportingSignals: [`δ ${hasAcid.shiftPpm} ppm (-COOH)`],
            confidence: hasAcid.confidence,
          }
        : alphaCarbonylEnv
        ? {
            status: "POSSIBLE",
            allowedSubtypes: methoxyEnv || ethoxyQ ? ["Ester", "Ketone"] : ["Ketone", "Ester", "Amide"],
            excludedSubtypes: ["Aldehyde", "Carboxylic acid"],
            supportingSignals: [`δ ${alphaCarbonylEnv.shiftPpm} ppm (α-CHₙ to C=O)`],
            confidence: 78,
          }
        : methoxyEnv || ethoxyQ
        ? {
            status: "POSSIBLE",
            allowedSubtypes: ["Ester"],
            excludedSubtypes: ["Aldehyde", "Carboxylic acid"],
            supportingSignals: [
              `δ ${(methoxyEnv || ethoxyQ)!.shiftPpm} ppm (-OCHₙ)`,
            ],
            confidence: 72,
          }
        : undefined,
      protonEnvironments: environments.map((e) => ({
        shiftPpm: e.shiftPpm,
        expectedRange: e.expectedShiftRange,
        integration: e.integration,
        relativeIntensity: e.relativeIntensity,
        multiplicity: e.multiplicity,
        jCouplingHz: e.jCouplingHz,
        environmentLabel: e.environmentLabel,
        source: e.source,
        confidence: e.confidence,
      })),
      protonNMR: {
        totalIntegratedProtons: undefined,
        couplingPatterns: [
          ...(ethoxyQ && ethoxyT
            ? [
                `乙基/乙氧基 (-CH₂-CH₃) A₂X₃ 耦合系統：δ ${ethoxyQ.shiftPpm} ppm (2H, q) ↔ δ ${ethoxyT.shiftPpm} ppm (3H, t)`,
              ]
            : []),
          ...(substitutionHint === "1,4-para"
            ? ["1,4-對位二取代苯環 (AA'BB') 鄰位雙重峰對"]
            : []),
          ...(heteroaromaticConstraints?.status === "PRESENT"
            ? ["含氮芳香雜環 (Pyridine) C₂v 自旋耦合網路"]
            : []),
        ],
        confidence: avgConf,
      },
      connectivityConstraints,
      dbe: {
        minDbe: (aromaticEnvs.length > 0 ? 4 : 0) + (hasAldehyde || hasAcid || alphaCarbonylEnv ? 1 : 0),
        allowsAromaticRing: aromaticEnvs.length > 0,
        allowsCarbonylOrUnsaturation: Boolean(hasAldehyde || hasAcid || alphaCarbonylEnv || aromaticEnvs.length > 0),
        confidence: avgConf,
      },
      confidence: avgConf,
      evidence,
    };
  }

  static analyzeExperimental13CNMR(
    spectrum?: ExperimentalSpectrumData,
    expectedStructure?: ParsedChemicalStructure | null
  ): {
    summary: Carbon13SummaryAnalysis;
    excludedSolventShifts: number[];
    structuralConstraints: StructuralConstraints;
    statusMessage: string;
  } {
    const limitationsNote =
      "¹³C NMR 科學判讀限制：觀測到的 ¹³C 訊號數不一定等於分子式總碳數。分子對稱軸（如對位取代苯環）、非對稱碳之化學位移偶然重疊（Accidental Overlap）、四級碳（如 C=O、無氫 ipso-C）因弛豫時間 T₁ 較長導致訊號微弱，以及溶劑殘留峰（如 CDCl₃ 三重峰於 77.16 ppm、DMSO-d₆ 七重峰於 39.52 ppm）皆會影響觀測峰數。";

    if (
      !spectrum ||
      spectrum.digitizationFailed ||
      !spectrum.validation.isValid ||
      spectrum.peaks.length === 0
    ) {
      return {
        excludedSolventShifts: [],
        summary: {
          observedSignalCount: 0, uniqueCarbonCount: 0,
          expectedTheoreticalEnvironments: expectedStructure?.uniqueCarbonEnvironmentsCount || null,
          environments: [],
          symmetryAndOverlapNote: "¹³C NMR 資料不足，無法進行碳環境與對稱性比對。",
          limitationsNote,
        },
        structuralConstraints: {
          source: "13C_NMR",
          confidence: 0,
          evidence: [],
        },
        statusMessage: spectrum?.digitizationFailed
          ? "¹³C NMR 分析無法可靠完成（圖片數位化失敗）。"
          : "¹³C NMR 資料不足或未提供，無法可靠判定碳骨架環境。",
      };
    }

    const isImageSpectrum =
      spectrum.sourceType === "IMAGE_EXPERIMENTAL" || Boolean(spectrum.digitizedFromImage);
    const activeSolvent: NMRSolvent = spectrum.nmrSolvent || "Unknown";

    const excludedSolventShifts: number[] = [];
    const analytePeaks = spectrum.peaks.filter((p) => {
      const explicitNonAnalyte =
        (p.role && p.role !== "ANALYTE" && p.role !== "OVERLAP") ||
        (p.signalRole &&
          p.signalRole !== "ANALYTE" &&
          p.signalRole !== "OVERLAP") ||
        p.userClassification === "SOLVENT" ||
        p.userClassification === "NOISE" ||
        p.userClassification === "IMPURITY" ||
        p.classificationTag === "SOLVENT" ||
        p.classificationTag === "NOISE" ||
        p.classificationTag === "IMPURITY" ||
        p.isSolventVerified;
      if (explicitNonAnalyte) {
        excludedSolventShifts.push(p.x);
        return false;
      }

      const isExplicitlyConfirmedCompound =
        p.userClassification === "REAL" ||
        p.userClassification === "COMPOUND" ||
        p.role === "ANALYTE" ||
        p.signalRole === "ANALYTE";
      if (!isExplicitlyConfirmedCompound && activeSolvent !== "Unknown") {
        const solvMatch = matchSolventOrReferenceSignal(
          "13C_NMR",
          p.x,
          activeSolvent
        );
        if (solvMatch && solvMatch.role === "SOLVENT") {
          excludedSolventShifts.push(p.x);
          return false;
        }
      }
      return true;
    });

    const solventExcludedCount = spectrum.peaks.length - analytePeaks.length;
    const peaks = analytePeaks.slice().sort((a, b) => b.x - a.x);
    const environments: CarbonEnvironment[] = peaks.map((pk, idx) => {
      const shift = pk.x;
      const experiment = spectrum.c13ExperimentMode ?? spectrum.nmrExperimentType;
      const rawDept = pk.deptType || (experiment === "DEPT_90" ? "CH" : experiment === "DEPT_135" && pk.y < 0 ? "CH2" : "Unknown");
      const dept: CarbonEnvironment["deptType"] =
        rawDept === "C_quat" ? "C" : rawDept;

      let regionCategory = "脂肪族 sp³ 碳區 Aliphatic C (0–50 ppm)";
      let expectedRange: [number, number] = [0, 50];
      let assignment = "飽和脂肪族 sp³ 碳 (Aliphatic Carbon)";
      let inferredCarbonType: CarbonEnvironmentType =
        pk.carbonType ||
        (dept !== "Unknown" ? dept : "POSSIBLE_CH_OR_CH2_OR_C");

      if (Math.abs(shift - 77.16) <= 0.6) {
        regionCategory = "常見溶劑參考區 Solvent Signal (~77 ppm)";
        expectedRange = [76.5, 77.8];
        assignment = "可能為氘代氯仿 (CDCl₃) 溶劑殘留峰或雜原子取代脂肪碳";
      } else if (shift >= 188) {
        regionCategory = "醛 / 酮羰基碳區 Ketone / Aldehyde C=O (188–220 ppm)";
        expectedRange = [188, 220];
        if (!pk.carbonType && dept === "Unknown") inferredCarbonType = "CARBONYL_REGION";
        assignment =
          dept === "CH"
            ? "醛基羰基碳 (-CH=O, DEPT CH)"
            : "酮基或醛基羰基碳 (C=O, 四級碳或 CH)";
      } else if (shift >= 164 && shift < 188) {
        regionCategory = "羧酸 / 酯 / 醯胺羰基區 Acid / Ester / Amide C=O (164–188 ppm)";
        expectedRange = [164, 188];
        if (!pk.carbonType && dept === "Unknown") inferredCarbonType = "CARBONYL_REGION";
        assignment = "羧酸、酯基或醯胺羰基碳 (C=O, 四級碳訊號通常較弱)";
      } else if (shift >= 145 && shift < 164) {
        const formulaForbidN =
          expectedStructure?.atomCounts !== undefined &&
          (expectedStructure.atomCounts.N ?? 0) === 0;
        regionCategory =
          dept === "C" || formulaForbidN
            ? "低場 sp² 碳區：氧取代芳香四級碳 (Ar-C_ipso-O) 或吸電子取代芳香碳 (145–164 ppm)"
            : "低場 sp² 碳區：氧取代芳香四級碳 / 吸電子取代芳香碳 / 雜芳香環 α-C (145–164 ppm)";
        expectedRange = [145, 164];
        if (!pk.carbonType && dept === "Unknown") inferredCarbonType = "AROMATIC_OR_ALKENE_REGION";
        assignment =
          dept === "C" || formulaForbidN
            ? "酚羥基/烷氧基取代之芳香四級碳 (Ar-C_ipso-O, 150–162 ppm) 或強吸電子取代芳香碳"
            : dept === "CH"
              ? "低場去遮蔽 sp² CH（含氮芳香雜環 α-CH、共軛烯酮 β-CH 或亞胺 -CH=N-，需視分子式是否含 N 判別）"
              : "連氧芳香環四級碳 (Ar-C_ipso-O)、吸電子基取代芳香碳，或含氮雜環 α-碳（競爭性假設）";
      } else if (shift >= 100 && shift < 145) {
        regionCategory = "芳香環 / 雜環 / 烯基 sp² 碳區 Aromatic / Heteroaromatic / Alkene C (100–145 ppm)";
        expectedRange = [100, 145];
        if (!pk.carbonType && dept === "Unknown") inferredCarbonType = "AROMATIC_OR_ALKENE_REGION";
        assignment =
          dept === "C"
            ? "取代芳香環四級碳 (Quaternary Ar-C_ipso) 或腈基碳 (-C≡N, 114–124 ppm)"
            : "芳香環 sp² CH、酚/苯胺鄰對位遮蔽碳 (112–122 ppm) 或烯基碳";
      } else if (shift >= 50 && shift < 95) {
        regionCategory = "雜原子鄰近 sp³ 碳區 / 炔碳區 C-O / C-N / Alkyne sp C (50–95 ppm)";
        expectedRange = [50, 95];
        assignment =
          dept === "CH3"
            ? "甲氧基碳 (-OCH₃) 或 N-甲基碳"
            : dept === "CH2"
            ? "烷氧基/羥甲基亞甲基碳 (-OCH₂-)"
            : "鍵結於氧或氮之 sp³ 碳 (-O-C / -N-C) 或炔基 sp 碳";
      } else {
        regionCategory = "脂肪族 sp³ 碳區 Aliphatic C (0–50 ppm)";
        expectedRange = [0, 50];
        if (!pk.carbonType && dept === "Unknown" && isImageSpectrum) {
          inferredCarbonType = "POSSIBLE_CH_OR_CH2_OR_C";
        }
        assignment =
          shift < 5
            ? "有機矽甲基碳 (Si-CH₃, 高場強遮蔽)"
            : dept === "CH3"
            ? "脂肪族甲基碳 (-CH₃)"
            : "脂肪族 sp³ 碳 (CH₃ / CH₂ / CH / C)";
      }

      const isQuatSlow = dept === "C";

      const hybridization: CarbonEnvironment["hybridization"] =
        shift >= 100 && shift <= 225
          ? "sp2"
          : shift >= 65 && shift < 100 && assignment.includes("炔")
          ? "sp"
          : "sp3";

      return {
        id: `c13-env-${idx}-${Math.round(shift * 10)}`,
        shiftPpm: Number(shift.toFixed(1)),
        expectedRange,
        regionCategory,
        deptType: dept,
        carbonType: inferredCarbonType,
        hybridization,
        assignment,
        inferenceLevel: "LEVEL_2_LOCAL_CHEMICAL_ENVIRONMENT",
        alternativeExplanations:
          shift >= 145 && shift < 164
            ? [
                "酚或芳基醚/酯之連氧四級碳 (Ar-C_ipso-O, 150–163 ppm)",
                "硝基或醯基取代之芳香四級碳 (Ar-C_ipso-EWG, 145–155 ppm)",
                "含氮芳香雜環 α-碳 (Pyridine/Quinoline C2/C6, 146–158 ppm，僅於含 N 分子式成立)",
              ]
            : undefined,
        solventApplied: activeSolvent,
        isQuaternarySlowRelaxation: isQuatSlow,
        relaxationAndNoeNote: isQuatSlow
          ? "四級碳 (C_quat / C=O) 缺乏直接鍵結質子，無 ¹H→¹³C NOE 增益且自旋-晶格弛豫時間 T₁ 較長。"
          : undefined,
        deptCompatibility:
          dept !== "Unknown"
            ? {
                dept90Visible: dept === "CH",
                dept135Phase:
                  dept === "C"
                    ? "ABSENT_QUATERNARY_C"
                    : dept === "CH2"
                    ? "DOWN_CH2"
                    : "UP_CH_CH3",
              }
            : undefined,
        literatureSources: [
          NMR_LITERATURE_REGISTRY.JONAS_2022_MRC,
          NMR_LITERATURE_REGISTRY.PRETSCH_EMPIRICAL_TABLES,
        ],
        dataNature: "EMPIRICAL_INCREMENT_MODEL",
        modelType: "EMPIRICAL",
        source: isImageSpectrum ? "IMAGE_ESTIMATED" : "NUMERIC_EXACT",
        confidence: isImageSpectrum
          ? Math.round((pk.confidence ?? 0.72) * 100)
          : dept !== "Unknown"
          ? 86
          : 78,
      };
    });

    const totalFormulaC = expectedStructure?.atomCounts?.C || null;
    const expectedUniqueC = expectedStructure?.uniqueCarbonEnvironmentsCount || null;
    let symmetryAndOverlapNote = `實驗觀測到 ${environments.length} 組 ¹³C 共振訊號。`;
    if (solventExcludedCount > 0) {
      symmetryAndOverlapNote += ` （已自動排除 ${solventExcludedCount} 組溶劑/雜質非分析物碳峰）。`;
    }

    if (totalFormulaC !== null) {
      if (environments.length < totalFormulaC) {
        symmetryAndOverlapNote += ` 少於分子式總碳數 (${totalFormulaC}C)，顯示分子具備對稱等價碳（如對位苯環 CH 對偶）、偶然化學位移重疊，或四級碳訊號過弱未顯現。`;
      } else if (environments.length === totalFormulaC) {
        symmetryAndOverlapNote += ` 與分子式總碳數 (${totalFormulaC}C) 一致，顯示所有碳原子皆處於化學不等價環境。`;
      } else {
        symmetryAndOverlapNote += ` 多於預期分子碳數 (${totalFormulaC}C)，可能包含溶劑殘留峰、旋轉異構物 (Rotamers) 或微量雜質。`;
      }
    }

    for(const env of environments){
      const peak=spectrum.peaks.find(p=>Math.abs(p.x-env.shiftPpm)<.005);if(!peak)continue;
      const hypotheses=inferSignalEnvironments('13C_NMR',peak,spectrum.nmrSolvent??'Unknown');
      env.environmentHypotheses=hypotheses;
      if(hypotheses.length)env.confidence=Math.min(env.confidence,Math.round(80*hypotheses[0].compatibility));
      if(hypotheses.length)env.assignment=hypotheses.slice(0,3).map(h=>h.label).join('／');
    }
    const summary: Carbon13SummaryAnalysis = {
      observedSignalCount: environments.length,
      uniqueCarbonCount: environments.length,
      expectedTheoreticalEnvironments: expectedUniqueC,
      environments,
      symmetryAndOverlapNote,
      limitationsNote,
      quaternaryRelaxationNote:
        "四級碳 (如 C=O、C≡N、Ar-C_ipso) 因無直接鍵結 ¹H，缺乏 NOE 增益且 T₁ 弛豫時間較長；若實驗缺漏 1–2 個四級碳訊號，屬於常見量測弛豫現象，不等同於結構直接矛盾。",
      solventExcludedCount,
    };
    const structuralConstraints = this.build13CNMRStructuralConstraints(
      spectrum,
      summary,
      expectedStructure
    );

    return {
      summary,
      excludedSolventShifts,
      structuralConstraints,
      statusMessage: `已完成 ¹³C NMR 碳環境分析（觀測到 ${environments.length} 組碳訊號）。`,
    };
  }

  static build13CNMRStructuralConstraints(
    spectrum?: ExperimentalSpectrumData,
    precomputedSummary?: Carbon13SummaryAnalysis,
    expectedStructure?: ParsedChemicalStructure | null
  ): StructuralConstraints {
    if (!spectrum || spectrum.digitizationFailed || spectrum.peaks.length === 0) {
      return { source: "13C_NMR", confidence: 0, evidence: [] };
    }

    const summary =
      precomputedSummary !== undefined
        ? precomputedSummary
        : this.analyzeExperimental13CNMR(spectrum, expectedStructure).summary;

    const formulaForbidN =
      expectedStructure?.atomCounts !== undefined &&
      (expectedStructure.atomCounts.N ?? 0) === 0;
    const formulaHasN =
      expectedStructure?.atomCounts !== undefined &&
      (expectedStructure.atomCounts.N ?? 0) > 0;

    const envs = summary.environments;
    const requiredFunctionalGroups: FunctionalGroupConstraint[] = [];
    const requiredSubstructures: StructuralMotifConstraint[] = [];
    const evidence: EvidenceReference[] = [];

    const aldKetCarbon = envs.find((c) => c.shiftPpm >= 188 && c.shiftPpm <= 220);
    const preliminaryAromaticCount = envs.filter((c) => c.shiftPpm >= 100 && c.shiftPpm < 166).length;
    const esterAcidCarbon = envs.find(
      (c) =>
        (c.shiftPpm >= 165.5 && c.shiftPpm < 188) ||
        (c.shiftPpm >= 164 && c.shiftPpm < 165.5 && preliminaryAromaticCount < 4)
    );
    const ipsoOxyCarbon = envs.find(
      (c) => c.shiftPpm >= 150 && c.shiftPpm < 166 && c !== esterAcidCarbon
    );
    const aromaticCarbons = envs.filter(
      (c) => c.shiftPpm >= 100 && c.shiftPpm < 166 && c !== esterAcidCarbon
    );
    const alkoxyCarbon = envs.find((c) => c.shiftPpm >= 50 && c.shiftPpm < 95);
    const silylCarbon = envs.find((c) => c.shiftPpm < 5);

    if (aldKetCarbon) {
      requiredFunctionalGroups.push({
        groupFamily: "Carbonyl",
        label: "醛或酮羰基碳 (Aldehyde / Ketone C=O)",
        status: "REQUIRED",
        observedSignal: `δ ${aldKetCarbon.shiftPpm} ppm`,
        expectedRange: "188–220 ppm",
        sourceModality: "13C_NMR",
        confidence: aldKetCarbon.confidence,
      });
    }

    if (esterAcidCarbon) {
      requiredFunctionalGroups.push({
        groupFamily: "Ester",
        label: "酯/羧酸/醯胺羰基碳 (Ester / Acid / Amide C=O)",
        status: "REQUIRED",
        observedSignal: `δ ${esterAcidCarbon.shiftPpm} ppm`,
        expectedRange: "164–188 ppm",
        sourceModality: "13C_NMR",
        confidence: esterAcidCarbon.confidence,
      });
    }

    if (alkoxyCarbon) {
      requiredFunctionalGroups.push({
        groupFamily: "Ether",
        label: "連氧 sp³ 碳 (-OCH₃ / -OCH₂- / 醇 C-OH)",
        status: "PROBABLE",
        observedSignal: `δ ${alkoxyCarbon.shiftPpm} ppm`,
        expectedRange: "50–95 ppm",
        sourceModality: "13C_NMR",
        confidence: alkoxyCarbon.confidence,
      });
    }

    if (silylCarbon) {
      requiredFunctionalGroups.push({
        groupFamily: "Siloxane",
        label: "有機矽甲基碳 (Si-CH₃)",
        status: "PROBABLE",
        observedSignal: `δ ${silylCarbon.shiftPpm} ppm`,
        expectedRange: "-5–5 ppm",
        sourceModality: "13C_NMR",
        confidence: silylCarbon.confidence,
      });
    }

    if (ipsoOxyCarbon && aromaticCarbons.length >= 4) {
      requiredSubstructures.push({
        motifId: "motif-c13-oxy-ar",
        motifLabel: formulaForbidN
          ? "氧取代芳香環骨架 (酚/芳基醚/芳基酯 Ar-C_ipso-O)"
          : "氧/氮取代芳香環骨架 (Oxygenated/Aminated Aromatic Ring Ar-C_ipso)",
        smilesFragmentHint: "Oc1ccccc1",
        status: "PROBABLE",
        sourceModality: "13C_NMR",
        supportingObservation: `δ ${ipsoOxyCarbon.shiftPpm} ppm (ipso C-O/C-N) + ${aromaticCarbons.length} aromatic C signals`,
        confidence: 82,
      });
    }

    for (const c of envs) {
      evidence.push({
        modality: "13C_NMR",
        observation: `¹³C NMR = δ ${c.shiftPpm} ppm (DEPT: ${c.deptType})`,
        interpretation: c.assignment,
        constraintSummary: `carbon environment in ${c.regionCategory}`,
        modelType: "EMPIRICAL",
        confidence: c.confidence,
      });
    }

    const allowedSubtypes: (
      | "Aldehyde"
      | "Ketone"
      | "Ester"
      | "Carboxylic acid"
      | "Amide"
    )[] = [];
    if (aldKetCarbon) {
      if (aldKetCarbon.deptType === "CH") {
        allowedSubtypes.push("Aldehyde");
      } else if (aldKetCarbon.deptType === "C") {
        allowedSubtypes.push("Ketone");
      } else {
        allowedSubtypes.push("Aldehyde", "Ketone");
      }
    }
    if (esterAcidCarbon) allowedSubtypes.push("Ester", "Carboxylic acid", ...(formulaForbidN ? [] : ["Amide" as const]));

    // Only consider pyridine/heteroaromatic if N is not forbidden AND the 145–160 ppm peak is NOT explicitly a quaternary C (C_ipso-O)
    const hasHeteroAlphaCarbon = aromaticCarbons.some(
      (c) => c.shiftPpm >= 145 && c.shiftPpm <= 160 && c.deptType !== "C"
    );
    const hasExplicitAlphaCH = aromaticCarbons.some(
      (c) => c.shiftPpm >= 145 && c.shiftPpm <= 160 && c.deptType === "CH"
    );
    const hasHeteroBetaCarbon = aromaticCarbons.some(
      (c) => c.shiftPpm >= 118 && c.shiftPpm <= 129
    );
    const isSymmetricalPyridineC13 =
      !formulaForbidN &&
      aromaticCarbons.length === 3 &&
      hasHeteroAlphaCarbon &&
      hasHeteroBetaCarbon &&
      !alkoxyCarbon;
    const isAsymmetricalPyridineC13 =
      !formulaForbidN &&
      aromaticCarbons.length === 5 &&
      hasHeteroAlphaCarbon &&
      hasHeteroBetaCarbon &&
      (hasExplicitAlphaCH || formulaHasN);

    let heteroaromaticConstraints: HeteroaromaticConstraint | undefined = formulaForbidN
      ? {
          status: "ABSENT",
          supportingSignals: ["分子式不含 N 原子 (N=0)，145–165 ppm 訊號歸屬於連氧或吸電子取代芳香碳 (Ar-C_ipso)"],
          confidence: 98,
        }
      : undefined;

    if (isSymmetricalPyridineC13 || isAsymmetricalPyridineC13) {
      const isConfirmedByDeptOrN = hasExplicitAlphaCH || formulaHasN;
      heteroaromaticConstraints = {
        status: isConfirmedByDeptOrN ? "PRESENT" : "POSSIBLE",
        ringTypes: ["pyridine", "pyrimidine", "quinoline"],
        symmetryType: isSymmetricalPyridineC13
          ? "C2v_symmetrical_pyridine_or_sym_ar_3_carbons"
          : "Cs_asymmetrical_pyridine_or_ar_5_carbons",
        supportingSignals: aromaticCarbons.map((c) => `δ ${c.shiftPpm} ppm`),
        confidence: isConfirmedByDeptOrN ? 82 : 68,
      };
      requiredFunctionalGroups.push({
        groupFamily: "Heteroaromatic",
        label: isSymmetricalPyridineC13
          ? "對稱含氮芳香雜環或對稱多取代苯環 (Competing Hypothesis: C₂v Pyridine vs Symmetrical Benzene)"
          : "非對稱含氮芳香雜環或取代苯環 (Competing Hypothesis: 2-/3-Substituted Pyridine vs Substituted Benzene)",
        status: isConfirmedByDeptOrN ? "PROBABLE" : "POSSIBLE",
        observedSignal: aromaticCarbons.map((c) => `δ ${c.shiftPpm} ppm`).join(", "),
        expectedRange: "145–160 ppm (Cα or Ar-C_ipso), 118–145 ppm",
        sourceModality: "13C_NMR",
        confidence: isConfirmedByDeptOrN ? 82 : 68,
      });
    }

    return {
      source: "13C_NMR",
      heteroaromaticConstraints,
      molecularFormula: {
        candidates: [],
        minCarbonCount: envs.length,
        confidence: 80,
      },
      requiredFunctionalGroups,
      requiredSubstructures,
      aromaticity:
        aromaticCarbons.length >= 2
          ? {
              status: "PRESENT",
              substitutionPatternHint:
                isSymmetricalPyridineC13
                  ? envs.length > 3
                    ? "1,4-para"
                    : "monosubstituted"
                  : isAsymmetricalPyridineC13
                  ? "disubstituted-general"
                  : aromaticCarbons.length === 4
                  ? "1,4-para"
                  : "unknown",
              supportingSignals: aromaticCarbons.map((c) => `δ ${c.shiftPpm} ppm`),
              confidence: 86,
            }
          : {
              status: "ABSENT",
              supportingSignals: ["No aromatic/alkene sp² carbons in 100–165 ppm"],
              confidence: 78,
            },
      carbonyl:
        allowedSubtypes.length > 0
          ? {
              status: "PRESENT",
              allowedSubtypes,
              supportingSignals: [
                ...(aldKetCarbon ? [`δ ${aldKetCarbon.shiftPpm} ppm`] : []),
                ...(esterAcidCarbon ? [`δ ${esterAcidCarbon.shiftPpm} ppm`] : []),
              ],
              confidence: 85,
            }
          : undefined,
      carbonEnvironments: envs.map((c) => ({
        shiftPpm: c.shiftPpm,
        expectedRange: c.expectedRange,
        deptType: c.deptType,
        carbonType: c.carbonType,
        regionCategory: c.regionCategory,
        assignment: c.assignment,
        source: c.source,
        confidence: c.confidence,
      })),
      dbe: {
        minDbe: (aromaticCarbons.length >= 2 ? 4 : 0) + (allowedSubtypes.length > 0 ? 1 : 0),
        allowsAromaticRing: aromaticCarbons.length >= 2,
        allowsCarbonylOrUnsaturation: allowedSubtypes.length > 0 || aromaticCarbons.length > 0,
        confidence: 82,
      },
      confidence: 82,
      evidence,
    };
  }

  static predict1HNMRFromStructure(
    structure: ParsedChemicalStructure,
    options?: {
      solvent?: NMRSolvent;
      spectrometerFrequencyMHz?: number;
      temperatureK?: number;
    }
  ): {
    spectrum: ExperimentalSpectrumData;
    environments: ProtonEnvironment[];
  } {
    const smiles = (structure.smiles || "").trim();
    const hasConnectivity = Boolean(
      structure.hasVerifiableConnectivity ?? (!structure.isFormulaOnly && smiles.length > 0)
    );
    const solvent: NMRSolvent = options?.solvent || "Unknown";
    const freqMHz = options?.spectrometerFrequencyMHz || 400;

    let peaks: SpectralPeak[] = [];
    let graphEnvironments: ProtonEnvironment[] = [];

    if (hasConnectivity) {
      const graphPred = NMRGraphPredictor.predict1HFromStructureGraph(structure, {
        solvent,
        spectrometerFrequencyMHz: freqMHz,
        temperatureK:options?.temperatureK,
      });
      if (graphPred.environments.length > 0) {
        peaks = graphPred.peaks;
        graphEnvironments = graphPred.environments;
      }
    }

    const points = SpectrumParser.synthesizeCurveFromPeaks("1H_NMR", peaks);
    const validation = DataValidator.validateSpectrum(
      "1H_NMR",
      "SIMULATED",
      points,
      peaks,
      false
    );
    const spectrum: ExperimentalSpectrumData = {
      modality: "1H_NMR",
      fileName: `${structure.molecularFormula}_Empirical_1H_NMR.jdx`,
      sourceFormat: "SIMULATED",
      dataOrigin: "EMPIRICAL_SIMULATION",
      modelType: "EMPIRICAL",
      isSimulated: true,
      nmrSolvent: solvent,
      spectrometerFrequencyMHz: freqMHz,
      temperatureK: options?.temperatureK ?? 298,
      xUnit: "化學位移 δ (ppm)",
      yUnit: "經驗式預測相對強度 (%)",
      points,
      peaks,
      validation,
    };

    if (graphEnvironments.length > 0) {
      return { spectrum, environments: graphEnvironments };
    }
    const { environments } = this.analyzeExperimental1HNMR(spectrum, structure);
    return { spectrum, environments };
  }

  static predict13CNMRFromStructure(
    structure: ParsedChemicalStructure,
    options?: {
      solvent?: NMRSolvent;
      spectrometerFrequencyMHz?: number;
      temperatureK?: number;
    }
  ): {
    spectrum: ExperimentalSpectrumData;
    environments: CarbonEnvironment[];
  } {
    const smiles = (structure.smiles || "").trim();
    const hasConnectivity = Boolean(
      structure.hasVerifiableConnectivity ?? (!structure.isFormulaOnly && smiles.length > 0)
    );
    const solvent: NMRSolvent = options?.solvent || "Unknown";
    const freqMHz = options?.spectrometerFrequencyMHz || 100;

    let peaks: SpectralPeak[] = [];
    let graphEnvironments: CarbonEnvironment[] = [];

    if (hasConnectivity) {
      const graphPred = NMRGraphPredictor.predict13CFromStructureGraph(structure, {
        solvent,
        temperatureK:options?.temperatureK,
      });
      if (graphPred.environments.length > 0) {
        peaks = graphPred.peaks;
        graphEnvironments = graphPred.environments;
      }
    }

    const points = SpectrumParser.synthesizeCurveFromPeaks("13C_NMR", peaks);
    const validation = DataValidator.validateSpectrum(
      "13C_NMR",
      "SIMULATED",
      points,
      peaks,
      false
    );
    const spectrum: ExperimentalSpectrumData = {
      modality: "13C_NMR",
      fileName: `${structure.molecularFormula}_Empirical_13C_NMR.jdx`,
      sourceFormat: "SIMULATED",
      dataOrigin: "EMPIRICAL_SIMULATION",
      modelType: "EMPIRICAL",
      isSimulated: true,
      nmrSolvent: solvent,
      spectrometerFrequencyMHz: freqMHz,
      temperatureK: options?.temperatureK ?? 298,
      xUnit: "化學位移 δ (ppm)",
      yUnit: "經驗式預測相對強度 (%)",
      points,
      peaks,
      validation,
    };

    if (graphEnvironments.length > 0) {
      return { spectrum, environments: graphEnvironments };
    }
    const { summary } = this.analyzeExperimental13CNMR(spectrum, structure);
    return { spectrum, environments: summary.environments };
  }

  static predictEmpirical1HNMR(
    structure: ParsedChemicalStructure,
    options?: { solvent?: NMRSolvent; spectrometerFrequencyMHz?: number }
  ) {
    return this.predict1HNMRFromStructure(structure, options);
  }

  static predictEmpirical13CNMR(
    structure: ParsedChemicalStructure,
    options?: { solvent?: NMRSolvent; spectrometerFrequencyMHz?: number }
  ) {
    return this.predict13CNMRFromStructure(structure, options);
  }

  /**
   * Phase 2 Section 七：NMR 與候選結構的可解釋科學一致性評估器
   * 完整檢驗：
   * 1. 實驗峰 → 候選結構預期訊號雙向對應與誤差範圍
   * 2. 積分與候選結構氫分布（總氫數、碳上氫數、活潑氫）一致性
   * 3. 峰分裂與 J 值自旋耦合網路相容性
   * 4. ¹³C 訊號數與分子拓撲對稱性、四級碳慢弛豫 (T₁/NOE) 一致性
   * 5. 缺漏訊號是否可由交換、重疊或弛豫解釋 vs 結構性矛盾
   * 6. 額外實驗峰是否來自殘留溶劑、水分或痕量雜質 (Gottlieb 1997 / Fulmer 2010)
   */
  static evaluateCandidateNMRConsistency(params: {
    candidateStructure: ParsedChemicalStructure;
    expH1Spectrum?: ExperimentalSpectrumData;
    expC13Spectrum?: ExperimentalSpectrumData;
    authoritativeTargetFormula?: string | null;
    h1IntegrationSemantics?: H1NMRIntegrationSemanticsReport;
  }): CandidateNMRConsistencyAnalysis {
    const {
      candidateStructure,
      expH1Spectrum,
      expC13Spectrum,
      authoritativeTargetFormula,
      h1IntegrationSemantics,
    } = params;

    const solvent: NMRSolvent =
      expH1Spectrum?.nmrSolvent || expC13Spectrum?.nmrSolvent || "Unknown";
    const solventProfile =
      DEUTERATED_SOLVENT_PROFILES[solvent] || DEUTERATED_SOLVENT_PROFILES.Unknown;
    const freqMHz = expH1Spectrum?.spectrometerFrequencyMHz || 400;

    const predH1 = this.predict1HNMRFromStructure(candidateStructure, {
      solvent,
      spectrometerFrequencyMHz: freqMHz,
    });
    const predC13 = this.predict13CNMRFromStructure(candidateStructure, {
      solvent,
    });

    const expH1Analysis = expH1Spectrum
      ? this.analyzeExperimental1HNMR(expH1Spectrum, candidateStructure)
      : null;
    const expC13Analysis = expC13Spectrum
      ? this.analyzeExperimental13CNMR(expC13Spectrum, candidateStructure)
      : null;

    const mappings: CandidateNMRConsistencyAnalysis["experimentalToCandidateSignalMappings"] =
      [];
    const missingExpectedSignals: CandidateNMRConsistencyAnalysis["missingExpectedSignals"] =
      [];
    const extraExperimentalSignals: CandidateNMRConsistencyAnalysis["extraExperimentalSignals"] =
      [];
    const minorDeviations: string[] = [];
    const structuralContradictions: string[] = [];

    // 1. Evaluate 1H experimental vs candidate predicted environments
    const matchedPredH1Indices = new Set<number>();

    if (expH1Analysis && expH1Analysis.environments.length > 0) {
      for (const expEnv of expH1Analysis.environments) {
        let bestIdx = -1;
        let bestDiff = Infinity;

        for (let i = 0; i < predH1.environments.length; i++) {
          const pEnv = predH1.environments[i];
          const diff = Math.abs(expEnv.shiftPpm - pEnv.shiftPpm);
          // Prefer unmatched first, or closest shift
          const penalty = matchedPredH1Indices.has(i) ? 0.6 : 0;
          if (diff + penalty < bestDiff) {
            bestDiff = diff;
            bestIdx = i;
          }
        }

        if (bestIdx >= 0) {
          const pEnv = predH1.environments[bestIdx];
          const unc = (pEnv.uncertaintyPpm || 0.25) + 0.35;
          const withinUnc = bestDiff <= unc;

          const expMult = (expEnv.multiplicity || "").toLowerCase();
          const predMult = (pEnv.multiplicity || "").toLowerCase();
          const multCompatible =
            !expMult ||
            !predMult ||
            expMult === predMult ||
            expMult === "m" ||
            predMult === "m" ||
            (expMult.includes("s") && predMult.includes("s")) ||
            (expMult.includes("d") && predMult.includes("d")) ||
            (expMult.includes("t") && predMult.includes("t"));

          const intCompatible =
            expEnv.integration === null ||
            pEnv.integration === null ||
            (() => {
              const expSum = expH1Analysis.environments.filter(e => !e.isExchangeable).reduce((s,e) => s + (e.rawIntegralValue ?? e.integration ?? 0), 0);
              const predSum = predH1.environments.filter(e => !e.isExchangeable).reduce((s,e) => s + (e.integration ?? 0), 0);
              if (expSum <= 0 || predSum <= 0) return true;
              return Math.abs((expEnv.rawIntegralValue ?? expEnv.integration) / expSum - pEnv.integration / predSum) <= 0.12;
            })();

          if (bestDiff <= 1.25) {
            matchedPredH1Indices.add(bestIdx);
            mappings.push({
              experimentalShiftPpm: expEnv.shiftPpm,
              candidateAtomGroup:
                pEnv.atomGroupLabel || pEnv.environmentLabel,
              candidatePredictedShiftPpm: pEnv.shiftPpm,
              shiftDifferencePpm: Number(bestDiff.toFixed(2)),
              isWithinUncertainty: withinUnc,
              multiplicityCompatible: multCompatible,
              integrationCompatible: intCompatible,
              noteZh: withinUnc
                ? `實驗 δ ${expEnv.shiftPpm} ppm 與預測 ${pEnv.environmentLabel} (δ ${pEnv.shiftPpm} ppm) 吻合 (Δδ = ${bestDiff.toFixed(2)} ppm)`
                : `實驗 δ ${expEnv.shiftPpm} ppm 與預測 ${pEnv.environmentLabel} (δ ${pEnv.shiftPpm} ppm) 存在偏移 (Δδ = ${bestDiff.toFixed(2)} ppm)`,
            });
            if (!withinUnc && bestDiff <= 1.25) {
              minorDeviations.push(
                `¹H 訊號 δ ${expEnv.shiftPpm} ppm 與理論預測 δ ${pEnv.shiftPpm} ppm 偏差 ${bestDiff.toFixed(2)} ppm（屬溶劑或取代基微調範圍）。`
              );
            }
          } else {
            // Check if this extra experimental peak matches a known trace impurity
            const traceMatch = TRACE_IMPURITY_REFERENCE_TABLE.find((imp) => {
              const sShifts =
                imp.h1ShiftsBySolvent[solvent] ?? imp.h1ShiftsBySolvent.CDCl3;
              return (
                Array.isArray(sShifts) &&
                sShifts.some((s) => Math.abs(s.ppm - expEnv.shiftPpm) <= 0.08)
              );
            });
            extraExperimentalSignals.push({
              modality: "1H_NMR",
              observedShiftPpm: expEnv.shiftPpm,
              likelyOrigin: traceMatch ? "TRACE_IMPURITY" : "UNEXPLAINED_SIGNAL",
              explanationZh: traceMatch
                ? `實驗峰 δ ${expEnv.shiftPpm} ppm 可能來自常見實驗室痕量殘留溶劑 ${traceMatch.nameZh} (${traceMatch.citationId})`
                : `實驗峰 δ ${expEnv.shiftPpm} ppm 未能在候選結構 ${candidateStructure.molecularFormula} 中找到對應質子環境 (最小差距 Δδ = ${bestDiff.toFixed(2)} ppm)`,
            });
          }
        }
      }

      // Check missing expected 1H signals from candidate
      for (let i = 0; i < predH1.environments.length; i++) {
        if (matchedPredH1Indices.has(i)) continue;
        const pEnv = predH1.environments[i];
        const canExplainByExchange = Boolean(pEnv.isExchangeable);
        const canExplainBySolventMask = (
          solventProfile.h1ResidualShifts || []
        ).some((rp) => Math.abs(rp.ppm - pEnv.shiftPpm) <= 0.18);
        const canExplain = canExplainByExchange || canExplainBySolventMask;
        const isHard =
          !canExplain &&
          (pEnv.chemicalEnvironmentClass === "ALDEHYDE_CHO" ||
            (pEnv.integration || 0) >= 2);

        const explanationZh = canExplainByExchange
          ? `預期之 ${pEnv.environmentLabel} (δ ~${pEnv.shiftPpm} ppm) 為可交換活潑氫 (-OH/-NH/-COOH)，於 ${solventProfile.labelZh} 中可能因快速氘交換或寬化而未顯現。`
          : canExplainBySolventMask
            ? `預期之 ${pEnv.environmentLabel} (δ ~${pEnv.shiftPpm} ppm) 鄰近 ${solventProfile.labelZh} 殘留溶劑峰，可能發生訊號重疊遮蔽。`
            : `候選結構預期應出現 ${pEnv.environmentLabel} (δ ~${pEnv.shiftPpm} ppm, ${pEnv.integration || 1}H, ${pEnv.multiplicity || "m"})，但實驗 ¹H NMR 未觀測到對應訊號。`;

        missingExpectedSignals.push({
          modality: "1H_NMR",
          predictedShiftPpm: pEnv.shiftPpm,
          expectedGroupLabel: pEnv.environmentLabel,
          canBeExplainedByExchangeOrOverlapOrRelaxation: canExplain,
          explanationZh,
          isHardConflict: isHard,
        });

        if (isHard) {
          structuralContradictions.push(explanationZh);
        } else {
          minorDeviations.push(explanationZh);
        }
      }
    }

    // Also record excluded solvent/water/impurity peaks from experimental 1H spectrum
    if (expH1Spectrum) {
      for (const pk of expH1Spectrum.peaks) {
        if (
          pk.signalRole === "SOLVENT" ||
          pk.signalRole === "WATER" ||
          pk.signalRole === "IMPURITY" ||
          pk.signalRole === "REFERENCE_TMS"
        ) {
          extraExperimentalSignals.push({
            modality: "1H_NMR",
            observedShiftPpm: pk.x,
            likelyOrigin:
              pk.signalRole === "SOLVENT"
                ? "RESIDUAL_SOLVENT"
                : pk.signalRole === "WATER"
                  ? "WATER_HDO"
                  : "TRACE_IMPURITY",
            explanationZh:
              pk.roleReason ||
              `已辨識並排除非樣品峰 δ ${pk.x} ppm (${pk.signalRole})`,
          });
        }
      }
    }

    // 2. Proton integration consistency
    const sem =
      h1IntegrationSemantics || expH1Analysis?.integrationSemantics;
    const protonIntegrationReport =
      ChemicalHardConstraintValidator.evaluateProtonCountConsistency(
        candidateStructure.smiles || "",
        authoritativeTargetFormula ?? candidateStructure.molecularFormula,
        sem
      );

    if (protonIntegrationReport.status === "CONTRADICTICTED" as any || protonIntegrationReport.status === "CONTRADICTED") {
      for (const r of protonIntegrationReport.contradictionReasons) {
        if (!structuralContradictions.includes(r)) {
          structuralContradictions.push(r);
        }
      }
    }

    // 3. Evaluate 13C symmetry, signal count, and quaternary carbon relaxation consistency
    const expectedUniqueCarbons = predC13.environments.length;
    const quaternaryCarbonsCount = predC13.environments.filter(
      (c) => c.deptType === "C" || c.isQuaternarySlowRelaxation
    ).length;
    const observedRealCarbons = expC13Analysis
      ? expC13Analysis.summary.uniqueCarbonCount
      : 0;

    let c13Consistent = true;
    let c13ExplanationZh = "尚未提供 ¹³C NMR 實驗數據。";

    if (expC13Analysis && observedRealCarbons > 0) {
      const diffC = expectedUniqueCarbons - observedRealCarbons;
      if (diffC === 0) {
        c13Consistent = true;
        c13ExplanationZh = `實驗觀測到 ${observedRealCarbons} 組獨立 ¹³C 訊號，與候選結構拓撲對稱等價類預期之 ${expectedUniqueCarbons} 組碳環境完全吻合。`;
      } else if (diffC > 0 && diffC <= quaternaryCarbonsCount + 1) {
        c13Consistent = true;
        c13ExplanationZh = `候選結構預期有 ${expectedUniqueCarbons} 組不等價碳，實驗觀測到 ${observedRealCarbons} 組（少 ${diffC} 組）；此差異可由結構中 ${quaternaryCarbonsCount} 個四級碳之長 T₁ 弛豫或芳香峰重疊合理解釋。`;
        minorDeviations.push(c13ExplanationZh);
      } else if (diffC < 0) {
        c13Consistent = false;
        c13ExplanationZh = `實驗觀測到 ${observedRealCarbons} 組獨立樣品碳訊號，超過候選結構因分子對稱性所能產生之最大不等價碳數 (${expectedUniqueCarbons} 組)，代表分子對稱性矛盾。`;
        structuralContradictions.push(c13ExplanationZh);
      } else {
        c13Consistent = false;
        c13ExplanationZh = `候選結構預期應有 ${expectedUniqueCarbons} 組不等價碳，但實驗僅觀測到 ${observedRealCarbons} 組（差距達 ${diffC} 組，超出四級碳弛豫或偶然重疊可解釋範圍）。`;
        structuralContradictions.push(c13ExplanationZh);
      }

      // Check key carbonyl / heteroaromatic 13C regions
      for (const pC of predC13.environments) {
        const matchedExpC = expC13Analysis.summary.environments.find(
          (eC) => Math.abs(eC.shiftPpm - pC.shiftPpm) <= 8.5
        );
        if (!matchedExpC) {
          const canExplainRelax = Boolean(pC.isQuaternarySlowRelaxation);
          const isHardCarbonConflict =
            pC.shiftPpm >= 162 && !canExplainRelax;
          missingExpectedSignals.push({
            modality: "13C_NMR",
            predictedShiftPpm: pC.shiftPpm,
            expectedGroupLabel: pC.assignment,
            canBeExplainedByExchangeOrOverlapOrRelaxation: canExplainRelax,
            explanationZh: canExplainRelax
              ? `預期四級碳 ${pC.assignment} (δ ~${pC.shiftPpm} ppm) 未見明顯峰，可能因無鍵結質子導致長 T₁ 弛豫與缺乏 NOE 增益。`
              : `候選結構預期應出現碳訊號 ${pC.assignment} (δ ~${pC.shiftPpm} ppm)，但實驗 ¹³C NMR 未觀測到對應區域訊號。`,
            isHardConflict: isHardCarbonConflict,
          });
        }
      }
    }

    // 4. Overall status & score
    const coverageRatio =
      predH1.environments.length > 0
        ? Number(
            (matchedPredH1Indices.size / predH1.environments.length).toFixed(2)
          )
        : 1;

    const splittingCompatible = mappings.every((m) => m.multiplicityCompatible);
    const splittingSummaryZh = splittingCompatible
      ? "實驗峰分裂型態與候選結構自旋耦合網路相容。"
      : "部分實驗峰分裂多重度與候選結構局部鄰位質子耦合網路存在差異。";

    let overallStatus: CandidateNMRConsistencyAnalysis["overallStatus"] =
      "CONSISTENT";
    let overallScore = 92;

    if (structuralContradictions.length > 0) {
      overallStatus = "STRUCTURAL_CONTRADICTION";
      overallScore = Math.max(15, 65 - structuralContradictions.length * 22);
    } else if (minorDeviations.length > 0) {
      overallStatus = "COMPATIBLE_WITH_MINOR_DEVIATIONS";
      overallScore = Math.max(70, 90 - minorDeviations.length * 5);
    }

    const pCountConsistent =
      protonIntegrationReport.status !== "CONTRADICTED" &&
      (protonIntegrationReport.status as string) !== "CONTRADICTICTED";
    const withinUncCount = mappings.filter((m) => m.isWithinUncertainty).length;
    const shiftScore =
      mappings.length > 0
        ? Math.round((withinUncCount / mappings.length) * 100)
        : overallScore;
    const multCompatibleCount = mappings.filter((m) => m.multiplicityCompatible).length;
    const multScore =
      mappings.length > 0
        ? Math.round((multCompatibleCount / mappings.length) * 100)
        : 85;

    return {
      overallStatus,
      overallScore,
      experimentalToCandidateSignalMappings: mappings,
      candidateExpectedSignalCoverage: coverageRatio,
      protonIntegrationConsistency: {
        status: protonIntegrationReport.status,
        computedTotalH: protonIntegrationReport.computedTotalHydrogens,
        computedCarbonAttachedH:
          protonIntegrationReport.computedCarbonBoundHydrogens ??
          protonIntegrationReport.computedCarbonBoundProtons,
        computedExchangeableH:
          protonIntegrationReport.computedExchangeableHydrogens,
        observedIntegratedH:
          protonIntegrationReport.observedTotalProtons ??
          (protonIntegrationReport as any).observedTotalH ??
          null,
        explanationZh:
          protonIntegrationReport.supportingNotes[0] ||
          protonIntegrationReport.contradictionReasons[0] ||
          "氫數與積分已完成比對。",
      },
      splittingAndJCouplingConsistency: {
        isConsistent: splittingCompatible,
        matchedSpinSystems:
          expH1Analysis?.protonSummary.spinSystems.map((s) => s.patternName) ||
          [],
        conflictingSpinSystems: mappings
          .filter((m) => !m.multiplicityCompatible)
          .map((m) => `δ ${m.experimentalShiftPpm} ppm vs ${m.candidateAtomGroup}`),
        summaryZh: splittingSummaryZh,
      },
      carbonSymmetryAndCountConsistency: {
        expectedUniqueCarbons,
        observedRealCarbons,
        quaternaryCarbonsCount,
        isConsistent: c13Consistent,
        explanationZh: c13ExplanationZh,
      },
      missingExpectedSignals,
      extraExperimentalSignals,
      minorDeviations,
      structuralContradictions,
      // Unified compatibility fields for evaluators and UI
      protonCountConsistent: pCountConsistent,
      ExchangeableProtonExplanation:
        protonIntegrationReport.supportingNotes.find((n) => n.includes("活潑氫") || n.includes("交換")) ||
        missingExpectedSignals.find((m) => m.canBeExplainedByExchangeOrOverlapOrRelaxation)?.explanationZh ||
        null,
      c13SignalCountConsistent: c13Consistent,
      chemicalShiftConsistencyScore: shiftScore,
      multiplicityConsistencyScore: multScore,
      consistencyNotes: [
        ...(protonIntegrationReport.supportingNotes || []),
        ...(c13Consistent && expC13Analysis ? [c13ExplanationZh] : []),
        ...mappings.filter((m) => m.isWithinUncertainty).map((m) => m.noteZh),
      ],
      penalties: [
        ...structuralContradictions,
        ...minorDeviations,
      ],
    };
  }
}

export { NMRAnalysisEngine as NMREngine };



