import {ionMz, massError, neutralMassFromIon, type IonAdduct} from "./scientificEngines/ionMass";
import {
  EvidenceItem,
  EvidenceReference,
  ExperimentalSpectrumData,
  FragmentationConstraint,
  MSComprehensiveAnalysis,
  MSFragmentAnalysis,
  MSFragmentationMechanismCategory,
  MolecularFormulaCandidate,
  ParsedChemicalStructure,
  SpectralPeak,
  StructuralConstraints,
} from "../types/spectrum";
import { ChemistryEngine, KNOWN_STRUCTURAL_LIBRARY } from "./chemistryEngine";
import { DataValidator } from "./dataValidator";
import { SpectrumParser } from "./spectrumParser";

const NEUTRAL_LOSS_TABLE: {
  lossDa: number;
  tolerance: number;
  formula: string;
  mechanism: MSFragmentationMechanismCategory;
  meaningZh: string;
}[] = [
  { lossDa: 15, tolerance: 0.6, formula: "CH₃•", mechanism: "α-cleavage", meaningZh: "甲基自由基脫落 (Methyl radical loss)" },
  { lossDa: 17, tolerance: 0.6, formula: "OH• / NH₃", mechanism: "α-cleavage", meaningZh: "羥基自由基或氨脫落 (-COOH / -CONH₂)" },
  { lossDa: 18, tolerance: 0.6, formula: "H₂O", mechanism: "Charge-directed fragmentation", meaningZh: "脫水反應 (醇/羧酸 H₂O loss)" },
  { lossDa: 28, tolerance: 0.6, formula: "CO / C₂H₄", mechanism: "McLafferty", meaningZh: "脫一氧化碳 (CO) 或乙烯 (C₂H₄)" },
  { lossDa: 29, tolerance: 0.6, formula: "CHO• / C₂H₅•", mechanism: "α-cleavage", meaningZh: "甲醯基或乙基自由基脫落" },
  { lossDa: 31, tolerance: 0.6, formula: "OCH₃•", mechanism: "α-cleavage", meaningZh: "甲氧基自由基脫落 (甲酯/甲醚)" },
  { lossDa: 42, tolerance: 0.6, formula: "CH₂=C=O", mechanism: "McLafferty", meaningZh: "乙烯酮脫落 (乙醯基酯/乙醯胺特徵重排)" },
  { lossDa: 43, tolerance: 0.6, formula: "CH₃CO• / C₃H₇•", mechanism: "α-cleavage", meaningZh: "乙醯基或丙基自由基脫落" },
  { lossDa: 45, tolerance: 0.6, formula: "OC₂H₅• / COOH•", mechanism: "α-cleavage", meaningZh: "乙氧基或羧基自由基脫落" },
  { lossDa: 46, tolerance: 0.6, formula: "C₂H₅OH / NO₂•", mechanism: "Charge-directed fragmentation", meaningZh: "乙醇脫落 (鄰位效應) 或硝基脫落" },
  { lossDa: 60, tolerance: 0.6, formula: "CH₃COOH", mechanism: "McLafferty", meaningZh: "乙酸脫落 (鄰乙醯水楊酸/乙酸酯特徵重排)" },
];

const DIAGNOSTIC_IONS: {
  mz: number;
  formula: string;
  mechanism: MSFragmentationMechanismCategory;
  meaningZh: string;
}[] = [
  { mz: 43, formula: "[CH₃CO]⁺ / [C₃H₇]⁺", mechanism: "α-cleavage", meaningZh: "乙醯基正離子 (Acylium) 或丙基正離子" },
  { mz: 65, formula: "[C₅H₅]⁺", mechanism: "Radical / Homolytic cleavage", meaningZh: "環戊二烯正離子 (芳環二次脫 CO/HCN 碎片)" },
  { mz: 73, formula: "[Si(CH₃)₃]⁺", mechanism: "Surface Fragmentation", meaningZh: "三甲基矽基正離子 (PDMS 矽氧烷特徵基峰)" },
  { mz: 77, formula: "[C₆H₅]⁺", mechanism: "α-cleavage", meaningZh: "苯基正離子 (Phenyl cation)" },
  { mz: 91, formula: "[C₇H₇]⁺", mechanism: "Benzylic cleavage", meaningZh: "䓬正離子 (Tropylium ion，苄基特徵)" },
  { mz: 92, formula: "[C₆H₄O]⁺• / [H₂N-C₆H₄]⁺", mechanism: "McLafferty", meaningZh: "水楊酸/鄰位重排離子或胺基苯基離子" },
  { mz: 105, formula: "[C₆H₅CO]⁺", mechanism: "α-cleavage", meaningZh: "苯甲醯基正離子 (Benzoyl cation)" },
  { mz: 120, formula: "[C₇H₄O₂]⁺• / [H₂N-C₆H₄-CO]⁺", mechanism: "McLafferty", meaningZh: "水楊酸酐重排基峰或對胺基苯甲醯基正離子" },
  { mz: 135, formula: "[CH₃O-C₆H₄-CO]⁺", mechanism: "α-cleavage", meaningZh: "甲氧基苯甲醯基正離子 ([M-H]⁺)" },
  { mz: 138, formula: "[C₇H₆O₃]⁺•", mechanism: "McLafferty", meaningZh: "水楊酸分子離子峰 (乙醯水楊酸脫乙烯酮 Δ42)" },
  { mz: 147, formula: "[Si₂O(CH₃)₅]⁺", mechanism: "Surface Fragmentation", meaningZh: "五甲基二矽氧烷特徵二次離子" },
  { mz: 161, formula: "[C₁₂H₁₇]⁺", mechanism: "α-cleavage", meaningZh: "布洛芬脫羧基 (-COOH, Δ45) 苄基正離子基峰" },
  { mz: 183, formula: "[⁷⁹Br-C₆H₄-CO]⁺", mechanism: "α-cleavage", meaningZh: "溴代苯甲醯基正離子 (M - CH₃•)" },
];

export class MSAnalysisEngine {
  static analyzeExperimentalMS(
    spectrum?: ExperimentalSpectrumData,
    expectedStructure?: ParsedChemicalStructure | null
  ): {
    analysis: MSComprehensiveAnalysis | null;
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
        analysis: null,
        structuralConstraints: {
          source: "MS",
          confidence: 0,
          evidence: [],
        },
        statusMessage: "MS 資料不足或未提供。",
      };
    }

    const activePeaks = spectrum.peaks.filter(
      (p) =>
        (!p.role || p.role === "ANALYTE") &&
        (!p.signalRole || p.signalRole === "ANALYTE") &&
        p.userClassification !== "NOISE" &&
        p.userClassification !== "SOLVENT" &&
        p.userClassification !== "IMPURITY" &&
        p.classificationTag !== "NOISE" &&
        p.classificationTag !== "SOLVENT" &&
        p.classificationTag !== "IMPURITY" &&
        !p.isSolventVerified
    );

    if (activePeaks.length === 0) {
      return {
        analysis: null,
        structuralConstraints: { source: "MS", confidence: 0, evidence: [] },
        statusMessage: "MS 無有效分析物訊號峰。",
      };
    }

    const msType = spectrum.msParams?.msType || "EI-MS";
    const ionization = spectrum.msParams?.ionization || "EI";
    const sortedByIntensity = [...activePeaks].sort((a, b) => b.y - a.y);
    const sortedByMzDesc = [...activePeaks].sort((a, b) => b.x - a.x);

    const basePeak = sortedByIntensity[0];

    // 尋找分子離子或前驅離子
    let parentPeak = activePeaks.find(
      (p) => p.isMolecularIonCandidate || p.isPrecursorIon
    );
    if (!parentPeak) {
      for (const cand of sortedByMzDesc) {
        if (cand.y < 1.0) continue;
        const hasM1Parent = activePeaks.find(
          (p) => Math.abs(cand.x - p.x - 1.0) <= 0.35 && p.y > cand.y * 1.5
        );
        const hasM2Parent = activePeaks.find(
          (p) =>
            Math.abs(cand.x - p.x - 2.0) <= 0.4 &&
            p.y >= cand.y * 0.8 &&
            !cand.isMolecularIonCandidate
        );
        if (!hasM1Parent && !hasM2Parent) {
          parentPeak = cand;
          break;
        }
      }
    }
    if (!parentPeak) parentPeak = sortedByMzDesc[0];

    const parentMz = parentPeak.x;
    const charge = spectrum.msParams?.chargeState ?? 1;
    const adduct: IonAdduct = spectrum.msParams?.adductType && spectrum.msParams.adductType !== "Auto" ? spectrum.msParams.adductType : ionization === "ESI-" ? "[M-H]-" : ionization === "ESI+" ? "[M+H]+" : "[M]+•";
    const neutralObserved = neutralMassFromIon(parentMz, adduct, charge);
    const isEsiPlus = ionization === "ESI+";
    const estimatedNominalMw =
      msType === "ToF-SIMS"
        ? null
        : Math.round(neutralObserved);

    // 檢查 M+1 與 M+2 同位素簇
    const mPlus1 = activePeaks.find(
      (p) => Math.abs(p.x - (parentMz + 1.00335483507 / Math.abs(charge))) <= 0.4
    );
    const mPlus2 = activePeaks.find(
      (p) => Math.abs(p.x - (parentMz + 1.997 / Math.abs(charge))) <= 0.45
    );

    const m2Ratio =
      mPlus2 && parentPeak.y > 0 ? (mPlus2.y / parentPeak.y) * 100 : 0;
    const hasBromineSignature = m2Ratio >= 80 && m2Ratio <= 120;
    const hasChlorineSignature = m2Ratio >= 25 && m2Ratio <= 42;
    const hasSulfurOrSiliconSignature =
      msType === "ToF-SIMS" ||
      activePeaks.some((p) => Math.abs(p.x - 73) <= 0.5 || Math.abs(p.x - 147) <= 0.5);

    const m1Ratio =
      mPlus1 && parentPeak.y > 0 ? (mPlus1.y / parentPeak.y) * 100 : 0;
    const estimatedCarbonCountFromMPlus1 =
      m1Ratio > 1.1 && m1Ratio < 30 ? Math.round(m1Ratio / 1.1) : null;

    // 候選分子式推算
    const candidateFormulas: MolecularFormulaCandidate[] = [];
    if (estimatedNominalMw) {
      const knownMatches = KNOWN_STRUCTURAL_LIBRARY.filter((k) => {
        const counts = ChemistryEngine.parseFormulaCounts(k.formula);
        const { mw } = ChemistryEngine.calculateMasses(counts);
        return Math.abs(Math.round(mw) - estimatedNominalMw) <= 1;
      });

      const seenFormulas = new Set<string>();
      for (const km of knownMatches) {
        if (seenFormulas.has(km.formula)) continue;
        seenFormulas.add(km.formula);
        const counts = ChemistryEngine.parseFormulaCounts(km.formula);
        const { exactMass } = ChemistryEngine.calculateMasses(counts);
        const theoreticalIonMz = ionMz(exactMass, adduct, charge);
        const error = massError(parentMz, theoreticalIonMz);
        const highResolution = spectrum.msParams?.isHighResolution ?? false;
        const tolerance = highResolution ? theoreticalIonMz * (spectrum.msParams?.massTolerancePpm ?? 5) / 1e6 : (spectrum.msParams?.massToleranceDa ?? .5);
        if (Math.abs(error.da) > tolerance) continue;
        const dbe = ChemistryEngine.calculateDBE(counts);
        const nCount = counts.N || 0;
        const nRuleValid = estimatedNominalMw % 2 === nCount % 2;

        candidateFormulas.push({
          formula: km.formula,
          neutralExactMass: exactMass,
          theoreticalIonMz,
          observedIonMz: parentMz,
          adductLabel: `${adduct} (|z|=${Math.abs(charge)})`,
          massErrorDa: error.da,
          massErrorPpm: error.ppm,
          dbe,
          nitrogenRuleValid: nRuleValid,
          isotopeCompatibility: "High",
          halogenSignatureMatch: hasBromineSignature
            ? "⁷⁹Br/⁸¹Br (1:1)"
            : hasChlorineSignature
              ? "³⁵Cl/³⁷Cl (3:1)"
              : "無鹵素同位素異常",
          score: Math.max(0, 100 * (1 - Math.abs(error.da) / tolerance)),
          notes: `符合標稱質量 ${estimatedNominalMw} Da、氮規則 (${
            nCount % 2 === 1 ? "奇數 N" : "偶數/0 N"
          }) 與不飽和度 DBE = ${dbe}`,
        });
      }
    }

    // 碎片與中性丟失分析
    const fragments: MSFragmentAnalysis[] = [];
    const msmsPathways: MSComprehensiveAnalysis["msmsPathways"] = [];
    const fragConstraints: FragmentationConstraint[] = [];
    const evidenceRefs: EvidenceReference[] = [];
    const evidenceItems: EvidenceItem[] = [];

    for (const pk of sortedByMzDesc) {
      const diag = DIAGNOSTIC_IONS.find((d) => Math.abs(d.mz - pk.x) <= 0.6);
      const loss =
        pk.id !== parentPeak.id && parentMz > pk.x
          ? NEUTRAL_LOSS_TABLE.find(
              (nl) => Math.abs(parentMz - pk.x - nl.lossDa) <= nl.tolerance
            )
          : undefined;

      let ionType: MSFragmentAnalysis["ionType"] = "裂解碎片離子 Fragment Ion";
      if (msType === "ToF-SIMS") {
        ionType = "ToF-SIMS 特徵二次離子";
      } else if (pk.id === parentPeak.id) {
        ionType = isEsiPlus ? "質子化分子離子 [M+H]+" : "分子離子 [M]+•";
      } else if (mPlus1 && pk.id === mPlus1.id) {
        ionType = "同位素峰 Isotope Peak";
      } else if (mPlus2 && pk.id === mPlus2.id) {
        ionType = "同位素峰 Isotope Peak";
      } else if (pk.id === basePeak.id) {
        ionType = "基峰 Base Peak";
      }

      const pathwayText = loss
        ? `由母離子 m/z ${parentMz} 脫去 ${loss.formula} (-${loss.lossDa} Da)：${loss.meaningZh}`
        : diag
          ? diag.meaningZh
          : pk.assignment || `碎片離子 m/z ${pk.x}`;

      fragments.push({
        mz: pk.x,
        relativeIntensity: pk.y,
        ionType,
        formulaSuggestion: diag?.formula || pk.assignment || `m/z ${pk.x}`,
        mechanismCategory: loss?.mechanism || diag?.mechanism || "α-cleavage",
        neutralLossFromParent: loss ? loss.lossDa : undefined,
        neutralLossIdentity: loss ? loss.formula : undefined,
        cleavagePathway: pathwayText,
        structuralCompatibility: "High",
        modelType: "EMPIRICAL",
        confidence: pk.y >= 30 || pk.id === parentPeak.id ? 88 : 76,
      });

      if (loss) {
        msmsPathways.push({
          precursorMz: parentMz,
          productMz: pk.x,
          neutralLossDa: loss.lossDa,
          neutralLossFormula: loss.formula,
          mechanismCategory: loss.mechanism,
          cleavageMechanism: loss.meaningZh,
          candidateCompatibility: "與核心官能基裂解途徑相容",
          likelihood: pk.y >= 35 ? "高可能性候選路徑" : "中度可能性候選路徑",
        });

        fragConstraints.push({
          ionMz: pk.x,
          neutralLossDa: loss.lossDa,
          formulaOrLossIdentity: loss.formula,
          mechanismNote: pathwayText,
          sourceModality: msType === "MS/MS" ? "MSMS" : "MS",
          confidence: 86,
        });
      } else if (diag) {
        fragConstraints.push({
          ionMz: pk.x,
          formulaOrLossIdentity: diag.formula,
          mechanismNote: diag.meaningZh,
          sourceModality: msType === "ToF-SIMS" ? "TOF_SIMS" : "MS",
          confidence: 88,
        });
      }

      if (pk.id === parentPeak.id || pk.id === basePeak.id || pk.y >= 25) {
        evidenceRefs.push({
          modality:
            msType === "MS/MS"
              ? "MS/MS"
              : msType === "ToF-SIMS"
                ? "ToF-SIMS"
                : "MS",
          observation: `m/z ${pk.x} (${pk.y.toFixed(0)}%)`,
          interpretation: pathwayText,
          constraintSummary:
            pk.id === parentPeak.id && estimatedNominalMw
              ? `標稱分子量 MW = ${estimatedNominalMw} Da`
              : `支持特徵碎片 ${diag?.formula || `m/z ${pk.x}`}`,
          modelType: "EMPIRICAL",
          confidence: 88,
        });

        evidenceItems.push({
          id: `ev-ms-${pk.id}`,
          tag: "[Empirical]",
          modelType: "EMPIRICAL",
          sourceType: "Empirical Chemical Rule",
          certaintyCategory: "Estimated",
          source: "MSModelAdapter (質譜同位素與裂解規則引擎)",
          reference: "IUPAC 單同位素質量、氮規則與 McLafferty / α-裂解規則",
          relevantInformation: `m/z ${pk.x} (${pk.y.toFixed(0)}%): ${pathwayText}`,
          confidence: 88,
        });
      }
    }

    const isotopeDesc = hasBromineSignature
      ? `觀測到顯著 M/M+2 (m/z ${parentMz}/${mPlus2?.x}) 約 1:1 雙峰 (${m2Ratio.toFixed(0)}%)，明確指示含 1 個溴原子 (⁷⁹Br/⁸¹Br)。`
      : hasChlorineSignature
        ? `觀測到 M/M+2 約 3:1 同位素峰 (${m2Ratio.toFixed(0)}%)，明確指示含 1 個氯原子 (³⁵Cl/³⁷Cl)。`
        : hasSulfurOrSiliconSignature
          ? "觀測到特徵有機矽二次離子簇 (m/z 73, 147)。"
          : `標準 ¹²C/¹³C 同位素分佈${
              estimatedCarbonCountFromMPlus1
                ? `（由 M+1 推估約含 ${estimatedCarbonCountFromMPlus1} 個碳）`
                : ""
            }。`;

    const analysis: MSComprehensiveAnalysis = {
      msType,
      ionization,
      modelType: "EMPIRICAL",
      molecularIonCandidateMz: msType === "ToF-SIMS" ? null : parentMz,
      precursorIonMz: msType === "MS/MS" ? parentMz : null,
      basePeakMz: basePeak.x,
      estimatedNominalMw,
      exactMassEstimate: candidateFormulas[0]?.neutralExactMass || estimatedNominalMw,
      isNominalMassOnly: !spectrum.msParams?.isHighResolution,
      adductLabel: `${adduct} (|z|=${Math.abs(charge)})`,
      candidateFormulas,
      isotopePatternSummary: {
        hasChlorineSignature,
        hasBromineSignature,
        hasSulfurOrSiliconSignature,
        estimatedCarbonCountFromMPlus1,
        description: isotopeDesc,
      },
      fragments,
      msmsPathways,
      tofSimsAnalysis:
        msType === "ToF-SIMS" && spectrum.msParams?.tofSims
          ? {
              polarity: spectrum.msParams.tofSims.polarity,
              primaryIon: spectrum.msParams.tofSims.primaryIon,
              primaryIonEnergyKeV: spectrum.msParams.tofSims.primaryIonEnergyKeV,
              ionDoseRegime: spectrum.msParams.tofSims.ionDoseRegime,
              substrateMaterial: spectrum.msParams.tofSims.substrateMaterial,
              surfaceMatrixNote: spectrum.msParams.tofSims.surfaceMatrixNote,
              expectedIonFamilies: ["[Si(CH₃)₃]⁺ (m/z 73)", "[Si₂O(CH₃)₅]⁺ (m/z 147)"],
              conditionEffectSummary: "靜態 Bi₃⁺ 一次離子束保持完整表面寡聚物指紋碎片。",
              conditionWarning: "ToF-SIMS 強度受表面基質效應影響，不直接代表本體莫耳濃度。",
            }
          : undefined,
      evidence: evidenceItems,
    };

    const structuralConstraints: StructuralConstraints = {
      source:
        msType === "MS/MS"
          ? "MS/MS"
          : msType === "ToF-SIMS"
            ? "ToF-SIMS"
            : "MS",
      molecularFormula:
        candidateFormulas.length > 0
          ? {
              candidates: candidateFormulas,
              lockedFormula: undefined,
              exactMass: candidateFormulas[0].neutralExactMass,
              nominalMass: estimatedNominalMw,
              confidence: 88,
            }
          : undefined,
      exactMass: {
        nominalMw: estimatedNominalMw,
        exactMass: candidateFormulas[0]?.neutralExactMass || estimatedNominalMw,
        observedIonMz: parentMz,
        adductLabel: `${adduct} (|z|=${Math.abs(charge)})`,
        isHighResolution: Boolean(spectrum.msParams?.isHighResolution),
        confidence: 88,
      },
      isotopeConstraints: {
        hasBromine: hasBromineSignature,
        hasChlorine: hasChlorineSignature,
        hasSiliconOrSulfur: hasSulfurOrSiliconSignature,
        estimatedCarbonCountFromMPlus1,
        description: isotopeDesc,
        confidence: 90,
      },
      fragmentationConstraints: fragConstraints,
      confidence: 88,
      evidence: evidenceRefs,
    };

    return {
      analysis,
      structuralConstraints,
      statusMessage: `已完成 ${msType} 質譜解析：基峰 m/z ${basePeak.x}${
        estimatedNominalMw ? `，推估標稱分子量 MW = ${estimatedNominalMw} Da` : ""
      }。`,
    };
  }

  static predictMSFromStructure(structure: ParsedChemicalStructure): {
    spectrum: ExperimentalSpectrumData;
    analysis: MSComprehensiveAnalysis;
  } {
    const mw = Math.round(structure.molecularWeight || structure.exactMass || 150);
    const smiles = (structure.smiles || "").trim();
    const known = KNOWN_STRUCTURAL_LIBRARY.find(
      (k) =>
        smiles &&
        k.smilesAliases.some((a) => a.toLowerCase() === smiles.toLowerCase())
    );

    const peaks: SpectralPeak[] = [];
    if (known) {
      const baseMz = known.keyMsBasePeak;
      peaks.push({
        id: "pred-ms-base",
        x: baseMz,
        y: 100,
        isBasePeak: true,
        isPredictedPeak: true,
        assignment: `[經驗模型預測] 基峰 Base Peak m/z ${baseMz}`,
      });
      if (baseMz !== mw) {
        peaks.push({
          id: "pred-ms-m",
          x: mw,
          y: known.formula === "C9H8O4" ? 12 : 48,
          isMolecularIonCandidate: true,
          isPredictedPeak: true,
          assignment: `[經驗模型預測] 分子離子 [M]⁺• (${structure.molecularFormula})`,
        });
      }
      if (structure.atomCounts.Br) {
        peaks.push({
          id: "pred-ms-m2",
          x: mw + 2,
          y: 47,
          isotopeAnnotation: "⁸¹Br [M+2]⁺•",
          isPredictedPeak: true,
          assignment: "[經驗模型預測] ⁸¹Br M+2 同位素峰",
        });
      }
      if (known.formula === "C9H8O4") {
        peaks.push(
          {
            id: "pred-ms-138",
            x: 138,
            y: 58,
            isPredictedPeak: true,
            assignment: "[經驗模型預測] [M - CH₂=C=O]⁺• (m/z 138)",
          },
          {
            id: "pred-ms-92",
            x: 92,
            y: 30,
            isPredictedPeak: true,
            assignment: "[經驗模型預測] [C₆H₄O]⁺• (m/z 92)",
          },
          {
            id: "pred-ms-43",
            x: 43,
            y: 26,
            isPredictedPeak: true,
            assignment: "[經驗模型預測] [CH₃CO]⁺ (m/z 43)",
          }
        );
      } else if ((structure.atomCounts.C || 0) >= 6 && !structure.atomCounts.Si) {
        peaks.push({
          id: "pred-ms-77",
          x: 77,
          y: 38,
          isPredictedPeak: true,
          assignment: "[經驗模型預測] 芳環特徵離子 [C₆H₅]⁺ (m/z 77)",
        });
      }
    } else {
      peaks.push(
        {
          id: "pred-ms-gen-m",
          x: mw,
          y: 45,
          isMolecularIonCandidate: true,
          isPredictedPeak: true,
          assignment: `[經驗模型預測] 分子離子 [M]⁺• (m/z ${mw})`,
        },
        {
          id: "pred-ms-gen-bp",
          x: Math.max(43, mw - 15),
          y: 100,
          isBasePeak: true,
          isPredictedPeak: true,
          assignment: `[經驗模型預測] α-裂解主要碎片離子`,
        }
      );
    }

    const sortedPeaks = peaks.sort((a, b) => a.x - b.x);
    const points = SpectrumParser.synthesizeCurveFromPeaks("MS", sortedPeaks);
    const validation = DataValidator.validateSpectrum(
      "MS",
      "SIMULATED",
      points,
      sortedPeaks,
      false
    );

    const spectrum: ExperimentalSpectrumData = {
      modality: "MS",
      fileName: `${structure.molecularFormula}_Empirical_MS.jdx`,
      sourceFormat: "SIMULATED",
      dataOrigin: "EMPIRICAL_SIMULATION",
      modelType: "EMPIRICAL",
      isSimulated: true,
      xUnit: "m/z",
      yUnit: "相對豐度 (%)",
      points,
      peaks: sortedPeaks,
      validation,
      msParams: {
        msType: "EI-MS",
        ionization: "EI",
        massToleranceDa: 0.5,
        isHighResolution: false,
      },
    };

    const { analysis } = this.analyzeExperimentalMS(spectrum, structure);
    return {
      spectrum,
      analysis: analysis!,
    };
  }

  static predictEmpiricalMS(structure: ParsedChemicalStructure) {
    return this.predictMSFromStructure(structure);
  }

  static buildMSStructuralConstraints(
    spectrum?: ExperimentalSpectrumData
  ): StructuralConstraints {
    return this.analyzeExperimentalMS(spectrum).structuralConstraints;
  }
}

export { MSAnalysisEngine as MSEngine };

