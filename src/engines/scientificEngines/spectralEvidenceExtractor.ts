import {
  ExperimentalSpectrumData,
  ExtendedSpectrumModality,
  SpectrumEvidence,
  SpectrumModality,
  StructuralConstraints,
} from "../../types/spectrum";
import {
  ChemicalFeatureEngine,
  ExtraChemicalEvidenceInput,
  IntegratedAnalysisBundle,
} from "../chemicalFeatureEngine";

export interface ExtractedEvidenceReport {
  bundle: IntegratedAnalysisBundle;
  spectrumEvidenceList: SpectrumEvidence[];
  constraints: StructuralConstraints;
}

export class SpectralEvidenceExtractor {
  /**
   * 確定性光譜證據提取引擎 (Deterministic Spectral Evidence Extractor)：
   * 將各模態光譜之已校正實驗峰與規則判定轉換為標準化 `SpectrumEvidence[]`，
   * 嚴格排除被標記為 SOLVENT / NOISE / IMPURITY 之訊號以及尚未完成座標校正 (isCalibrated === false) 之訊號。
   */
  static extractAllEvidence(
    spectra: Partial<
      Record<SpectrumModality | ExtendedSpectrumModality, ExperimentalSpectrumData>
    >,
    extraInput?: ExtraChemicalEvidenceInput
  ): ExtractedEvidenceReport {
    const bundle = ChemicalFeatureEngine.extractIntegratedConstraints(
      spectra,
      undefined,
      extraInput
    );
    const spectrumEvidenceList: SpectrumEvidence[] = [];

    // 0. 分子式證據 (若使用者直接輸入分子式 — 嚴格標記為「化學式證據 CHEMICAL_FORMULA_EVIDENCE」，絕不假裝成 MS 光譜)
    if (
      bundle.userSuppliedFormula &&
      bundle.constraints.molecularFormula?.candidates?.[0]
    ) {
      const fc = bundle.constraints.molecularFormula.candidates[0];
      spectrumEvidenceList.push({
        id: `se-formula-${fc.formula}`,
        sourceId: `user-formula-${fc.formula}`,
        sourceSpectrum: "FORMULA",
        spectrumType: "FORMULA",
        evidenceCategory: "CHEMICAL_FORMULA_EVIDENCE",
        scientificProvenance: "CHEMICAL_FORMULA_EVIDENCE",
        peakPosition: fc.formula,
        intensity: `IHD/DBE=${fc.dbe}`,
        inferredGroup: `化學式證據 ${fc.formula}`,
        chemicalMeaning: `使用者輸入之化學式證據 ${fc.formula} (MW=${Math.round(
          fc.neutralExactMass
        )} Da, 精確質量 ${fc.neutralExactMass.toFixed(
          4
        )} Da, 不飽和度 IHD/DBE=${fc.dbe}, 氮規則=${
          fc.nitrogenRuleValid ? "相容" : "異常"
        })`,
        ruleApplied: "元素組成、價鍵平衡與不飽和度 (IHD/DBE) 定律",
        direction: "SUPPORTING",
        dataQualityNote: "使用者明確提供之分子式輸入 (非質譜觀測值)",
        uncertaintyNote: "分子式僅限制元素組成與總不飽和度，需搭配光譜區分同分異構物",
        scoreImpact: "硬性限制候選結構之分子式與 IHD/DBE",
        confidence: 0.98,
        requiredOrOptional: "REQUIRED",
        evidenceChain: {
          observedPeak: `User Input Formula: ${fc.formula}`,
          interpretation: `Exact Mass ${fc.neutralExactMass.toFixed(4)} Da, IHD/DBE = ${fc.dbe}`,
          functionalGroup: `元素組成限制 (${fc.formula})`,
          constraint: `Locked Formula = ${fc.formula}, DBE = ${fc.dbe}`,
          candidateMatch: "所有候選結構必須符合此元素組成與不飽和度",
          validationStatus: "SUPPORTED",
        },
      });
    }

    // 0b. 使用者輸入之其他化學資訊證據
    if (extraInput?.chemicalNotes && extraInput.chemicalNotes.trim().length > 0) {
      const notes = extraInput.chemicalNotes.trim();
      spectrumEvidenceList.push({
        id: "se-user-chemical-notes",
        sourceId: "user-chemical-notes",
        sourceSpectrum: "CHEMICAL_NOTES",
        spectrumType: "CHEMICAL_NOTES",
        evidenceCategory: "USER_CHEMICAL_INFO",
        scientificProvenance: "USER_CHEMICAL_INFO",
        peakPosition: "Chemical Notes",
        intensity: "User Input",
        inferredGroup: `化學測試/實驗備註 (${notes})`,
        chemicalMeaning: `使用者輸入之其他化學證據：${notes}`,
        ruleApplied: "濕式化學反應與樣品來源限制規則",
        direction: "SUPPORTING",
        dataQualityNote: "使用者手動輸入之輔助化學資訊",
        uncertaintyNote: "取決於實驗觀察準確度",
        scoreImpact: "提供對應官能基支持或排他限制",
        confidence: 0.85,
        requiredOrOptional: "OPTIONAL",
        evidenceChain: {
          observedPeak: notes,
          interpretation: "化學衍生/顯色或反應性觀察",
          functionalGroup: notes,
          constraint: `Chemical Note Constraint: ${notes}`,
          candidateMatch: "優先支持符合此化學性質之候選結構",
          validationStatus: "SUPPORTED",
        },
      });
    }

    // 1. IR 證據轉換 (保留波數、原始強度與吸光度/透射率語義)
    const irSpec = spectra.IR;
    const irYUnit = irSpec?.yUnit || "%T";
    const irSemantics =
      /abs/i.test(irYUnit)
        ? "吸光度 (Absorbance)"
        : /%t|trans/i.test(irYUnit)
          ? "透射率 (%Transmittance)"
          : `縱軸單位 (${irYUnit})`;

    for (const ir of bundle.irFindings) {
      if (
        ir.status === "PRESENT" ||
        ir.status === "POSSIBLE" ||
        ir.status === "ABSENT"
      ) {
        const primaryPeak =
          (ir.observedPeaks || [ir.observedPeak])[0] ?? ir.observedPeak;
        const rawInt = ir.observedIntensities?.[0] ?? "Medium/Strong";
        const isAbsent = ir.status === "ABSENT";
        spectrumEvidenceList.push({
          id: `se-ir-${ir.id || ir.groupName || ir.functionalGroup}`,
          sourceId: irSpec?.fileName || "IR_Experimental",
          sourceSpectrum: "IR",
          spectrumType: "IR",
          evidenceCategory: "EXPERIMENTAL_SPECTRUM",
          scientificProvenance: "EXPERIMENTAL",
          peakPosition: primaryPeak,
          peakRange: ir.expectedRange,
          intensity: `${rawInt} (${irSemantics})`,
          shape: ir.bandShape ?? ir.observedWidthAndShape ?? "Sharp",
          inferredGroup: ir.groupName || ir.functionalGroup,
          chemicalMeaning: `[IR ${irSemantics}] ${
            ir.vibrationMode || "特徵振動"
          } — ${ir.reasoning}`,
          ruleApplied: `IR 經驗頻率與伴隨峰規則 (${ir.expectedRange})`,
          direction: isAbsent
            ? "CONTRADICTING"
            : ir.status === "PRESENT"
              ? "SUPPORTING"
              : "INCONCLUSIVE",
          dataQualityNote: irSpec?.dataQuality
            ? `IR 資料品質: ${irSpec.dataQuality}`
            : "已校正 IR 實測訊號",
          uncertaintyNote: isAbsent
            ? "基於涵蓋此波數範圍且未見特徵吸收帶作為排他參考"
            : "單一 IR 吸收帶可能受共軛或氫鍵位移影響，需結合伴隨峰與 NMR 判讀",
          scoreImpact: isAbsent
            ? "排除需要此強吸收帶之官能基"
            : "支持對應官能基並提高候選結構評分",
          confidence:
            ir.confidence >= 85
              ? 0.92
              : ir.confidence >= 70
                ? 0.76
                : 0.58,
          requiredOrOptional: isAbsent
            ? "EXCLUDED"
            : ir.status === "PRESENT" && ir.confidence >= 85
              ? "REQUIRED"
              : "OPTIONAL",
          sourcePeakIds: ir.evidenceIds || (ir.evidence?.id ? [ir.evidence.id] : []),
          evidenceChain: {
            observedPeak: primaryPeak
              ? `${primaryPeak} cm⁻¹ (${rawInt}, ${irSemantics})`
              : `區間 ${ir.expectedRange} 未見吸收`,
            interpretation: ir.vibrationMode || ir.assignment,
            functionalGroup: ir.groupName || ir.functionalGroup,
            constraint: `${ir.status}: ${ir.groupName || ir.functionalGroup}`,
            candidateMatch: "比對候選結構是否具備此振動官能基",
            validationStatus: isAbsent ? "CONTRADICTED" : "SUPPORTED",
          },
        });
      }
    }

    // 2. 1H NMR 證據轉換 (保持 1H_NMR 獨立，排除溶劑峰與未校正峰)
    if (spectra["1H_NMR"] && bundle.protonSummary) {
      for (const pk of spectra["1H_NMR"].peaks) {
        if (
          pk.isCalibrated === false ||
          pk.userClassification === "SOLVENT" ||
          pk.userClassification === "NOISE" ||
          pk.isSolventVerified
        ) {
          continue;
        }
        const matchEnv = bundle.protonSummary.environments.find(
          (e) => Math.abs((e.shiftPpm ?? e.chemicalShift ?? 0) - pk.x) < 0.08
        );
        const envLabel =
          matchEnv?.environmentLabel || pk.assignment || "¹H 自旋環境";
        spectrumEvidenceList.push({
          id: `se-h1-${pk.id}`,
          sourceId: spectra["1H_NMR"].fileName || "1H_NMR_Experimental",
          sourceSpectrum: "1H_NMR",
          spectrumType: "1H_NMR",
          evidenceCategory: "EXPERIMENTAL_SPECTRUM",
          scientificProvenance: "EXPERIMENTAL",
          peakId: pk.id,
          peakPosition: Number(pk.x.toFixed(2)),
          intensity: pk.integral ? `${pk.integral}H` : pk.y,
          multiplicity: pk.multiplicity || "m",
          integral: pk.integral || pk.integration || 1,
          inferredGroup: envLabel,
          chemicalMeaning: `δH ${pk.x.toFixed(2)} ppm (${
            pk.multiplicity || "m"
          }, ${pk.integral || pk.integration || 1}H): ${envLabel}`,
          ruleApplied: "¹H NMR 化學位移屏蔽效應與 n+1 自旋偶合裂分規則",
          direction: "SUPPORTING",
          dataQualityNote: `溶劑參考: ${spectra["1H_NMR"].nmrSolvent || "CDCl3"}`,
          uncertaintyNote:
            pk.multiplicity === "m" || pk.multiplicity === "br s"
              ? "多重重疊峰或交換性質子受溶劑與濃度影響"
              : "化學位移與偶合常數提供鄰接質子數限制",
          scoreImpact: "約束候選結構之質子環境數、積分比例與芳環取代型態",
          confidence: 0.88,
          requiredOrOptional: "REQUIRED",
          sourcePeakIds: [pk.id],
          evidenceChain: {
            observedPeak: `δH ${pk.x.toFixed(2)} ppm (${pk.multiplicity || "s"}, ${
              pk.integral || pk.integration || 1
            }H)`,
            interpretation: envLabel,
            functionalGroup: envLabel,
            constraint: `1H Environment at ${pk.x.toFixed(2)} ppm`,
            candidateMatch: "檢驗候選結構之質子環境與積分比",
            validationStatus: "SUPPORTED",
          },
        });
      }
    }

    // 3. 13C NMR 證據轉換 (保持 13C_NMR 獨立，排除溶劑峰)
    if (bundle.carbonSummary) {
      for (const env of bundle.carbonSummary.environments) {
        const shiftVal = env.shiftPpm ?? env.shift ?? 0;
        const regionLabel =
          env.regionLabel ||
          env.candidateFragments?.[0] ||
          "¹³C 環境";
        const candidateDesc =
          env.candidateFragments?.join(" / ") || regionLabel;
        spectrumEvidenceList.push({
          id: `se-c13-${env.peakId || shiftVal.toFixed(1)}`,
          sourceId: spectra["13C_NMR"]?.fileName || "13C_NMR_Experimental",
          sourceSpectrum: "13C_NMR",
          spectrumType: "13C_NMR",
          evidenceCategory: "EXPERIMENTAL_SPECTRUM",
          scientificProvenance: "EXPERIMENTAL",
          peakId: env.peakId,
          peakPosition: Number(shiftVal.toFixed(1)),
          intensity: env.deptType || "C",
          inferredGroup: regionLabel,
          chemicalMeaning: `δC ${shiftVal.toFixed(1)} ppm (${
            env.deptType || "C"
          }): ${candidateDesc}`,
          ruleApplied: "¹³C NMR 碳混成軌域化學位移區間與 DEPT 級數規則",
          direction: "SUPPORTING",
          dataQualityNote: `共觀測 ${bundle.carbonSummary.observedSignalCount} 個獨立碳訊號`,
          uncertaintyNote: "對稱等效碳可能重疊為單一訊號",
          scoreImpact: "約束碳骨架環境數、羰基碳 (160–220 ppm) 與芳香碳對稱性",
          confidence: env.confidence === "HIGH" ? 0.9 : 0.78,
          requiredOrOptional: shiftVal >= 160 ? "REQUIRED" : "OPTIONAL",
          sourcePeakIds: env.peakId ? [env.peakId] : [],
          evidenceChain: {
            observedPeak: `δC ${shiftVal.toFixed(1)} ppm (${env.deptType || "C"})`,
            interpretation: candidateDesc,
            functionalGroup: regionLabel,
            constraint: `13C Environment at ${shiftVal.toFixed(1)} ppm`,
            candidateMatch: "檢驗候選結構之獨立碳環境數與區域分佈",
            validationStatus: "SUPPORTED",
          },
        });
      }
    }

    // 4. 一級 MS 證據轉換 (僅限一般 MS，嚴格與 MS/MS 及 ToF-SIMS 區隔)
    if (bundle.msSummary) {
      for (const ion of bundle.msSummary.detectedIons) {
        if (
          ion.ionType === "M+•" ||
          ion.ionType === "[M+H]+" ||
          ion.ionType === "BasePeak" ||
          ion.relativeIntensity >= 25
        ) {
          spectrumEvidenceList.push({
            id: `se-ms-ion-${Math.round(ion.mz)}`,
            sourceId: spectra.MS?.fileName || "MS_Experimental",
            sourceSpectrum: "MS",
            spectrumType: "MS",
            evidenceCategory: "EXPERIMENTAL_SPECTRUM",
            scientificProvenance: "EXPERIMENTAL",
            peakPosition: ion.mz,
            intensity: `${ion.relativeIntensity}%`,
            inferredGroup: `MS ${ion.ionType}`,
            chemicalMeaning: `[一級 MS] ${ion.label}`,
            ruleApplied: "質譜分子離子判定、氮規則與同位素豐度規則",
            direction: "SUPPORTING",
            dataQualityNote: `一級質譜離子 m/z ${ion.mz}`,
            uncertaintyNote: "EI 強裂解下分子離子峰可能較弱",
            scoreImpact: "約束標稱分子量與特徵一級碎片",
            confidence: ion.confidence === "HIGH" ? 0.92 : 0.78,
            requiredOrOptional:
              ion.ionType === "M+•" || ion.ionType === "BasePeak"
                ? "REQUIRED"
                : "OPTIONAL",
            evidenceChain: {
              observedPeak: `MS m/z ${ion.mz} (${ion.relativeIntensity}%)`,
              interpretation: ion.label,
              functionalGroup: ion.ionType,
              constraint: `MS Ion m/z ${ion.mz}`,
              candidateMatch: "檢驗候選結構分子量與主要裂解離子",
              validationStatus: "SUPPORTED",
            },
          });
        }
      }

      for (const nl of bundle.msSummary.neutralLosses) {
        spectrumEvidenceList.push({
          id: `se-ms-loss-${nl.fromMz}-${nl.toMz}`,
          sourceId: spectra.MS?.fileName || "MS_Experimental",
          sourceSpectrum: "MS",
          spectrumType: "MS",
          evidenceCategory: "EXPERIMENTAL_SPECTRUM",
          scientificProvenance: "EXPERIMENTAL",
          peakPosition: nl.toMz,
          peakRange: [nl.toMz, nl.fromMz],
          intensity: `-Δ${nl.lossMass} Da`,
          inferredGroup: `MS 脫去 ${nl.proposedNeutralFormula || nl.candidateFormula}`,
          chemicalMeaning: `[一級 MS 中性丟失] ${nl.chemicalMeaning} (m/z ${nl.fromMz} → ${nl.toMz}): ${nl.structuralImplication}`,
          ruleApplied: "一級質譜 α-斷裂與特徵中性分子脫去規則",
          direction: "SUPPORTING",
          dataQualityNote: `由 m/z ${nl.fromMz} 脫去 ${nl.lossMass} Da`,
          uncertaintyNote: "同重素中性碎片需搭配分子式與 IR 確認",
          scoreImpact: "支持對應可裂解取代基（如乙醯基 -42 Da、水 -18 Da）",
          confidence: nl.confidence === "HIGH" ? 0.9 : 0.76,
          requiredOrOptional: "OPTIONAL",
          evidenceChain: {
            observedPeak: `MS m/z ${nl.fromMz} → ${nl.toMz} (-${nl.lossMass} Da)`,
            interpretation: nl.chemicalMeaning,
            functionalGroup: nl.proposedNeutralFormula || nl.candidateFormula,
            constraint: `MS Neutral Loss -${nl.lossMass} Da`,
            candidateMatch: "檢驗候選結構是否具對應可脫去基團",
            validationStatus: "SUPPORTED",
          },
        });
      }
    }

    // 5. MS/MS 證據轉換 (嚴格保留 MS/MS 來源模態，包含 Precursor Ion、Product Ion、Neutral Loss)
    if (bundle.msmsAnalysis) {
      const msmsFile =
        extraInput?.msmsSpectrum?.fileName ||
        spectra["MS/MS"]?.fileName ||
        (spectra.MS?.canonicalModality === "MSMS" ? spectra.MS.fileName : undefined) ||
        "MSMS_Experimental";
      const precIon = bundle.msmsAnalysis.physicsModel.precursorIon;
      const precMz = precIon?.mz ?? 0;
      if (precMz > 0 && precIon) {
        spectrumEvidenceList.push({
          id: `se-msms-precursor-${Math.round(precMz)}`,
          sourceId: msmsFile,
          sourceSpectrum: "MS/MS",
          spectrumType: "MS/MS",
          evidenceCategory: "EXPERIMENTAL_SPECTRUM",
          scientificProvenance: "EXPERIMENTAL",
          peakPosition: precMz,
          intensity: "Precursor Ion",
          inferredGroup: `MS/MS 母離子 m/z ${precMz}`,
          chemicalMeaning: `[MS/MS Precursor Ion] 選定母離子 m/z ${precMz} (${precIon.adductType})`,
          ruleApplied: "串聯質譜母離子選擇與碰撞誘導解離 (CID) 質量守恆",
          direction: "SUPPORTING",
          dataQualityNote: `MS/MS 母離子 m/z ${precMz}`,
          uncertaintyNote: "母離子為所有子離子與中性丟失之共同前驅來源",
          scoreImpact: "錨定 MS/MS 裂解樹之母離子質量",
          confidence: 0.95,
          requiredOrOptional: "REQUIRED",
          evidenceChain: {
            observedPeak: `MS/MS Precursor m/z ${precMz}`,
            interpretation: "CID 母離子",
            functionalGroup: `Precursor m/z ${precMz}`,
            constraint: `MS/MS Precursor = ${precMz}`,
            candidateMatch: "母離子需與候選結構分子量或加合離子相容",
            validationStatus: "SUPPORTED",
          },
        });
      }

      for (const nl of bundle.msmsAnalysis.physicsModel.neutralLosses) {
        spectrumEvidenceList.push({
          id: `se-msms-loss-${nl.precursorMz}-${nl.productMz}`,
          sourceId: msmsFile,
          sourceSpectrum: "MS/MS",
          spectrumType: "MS/MS",
          evidenceCategory: "EXPERIMENTAL_SPECTRUM",
          scientificProvenance: "EXPERIMENTAL",
          peakPosition: nl.productMz,
          peakRange: [nl.productMz, nl.precursorMz],
          intensity: `-Δ${nl.lossDa.toFixed(1)} Da`,
          inferredGroup: `MS/MS 脫去 ${
            nl.possibleIdentity || `${nl.lossDa.toFixed(0)} Da`
          }`,
          chemicalMeaning: `[MS/MS Neutral Loss] (${nl.precursorMz} → ${
            nl.productMz
          }): ${nl.scientificNote || "CID 中性分子脫去路徑"}`,
          ruleApplied: "MS/MS CID 偶電子/奇電子中性脫去規則",
          direction: "SUPPORTING",
          dataQualityNote: `MS/MS 子離子 m/z ${nl.productMz}`,
          uncertaintyNote: "CID 能量會影響競爭裂解通道之相對豐度",
          scoreImpact: "直接驗證母離子與子離子間之共價連接關係",
          confidence: nl.confidence,
          requiredOrOptional: "OPTIONAL",
          evidenceChain: {
            observedPeak: `MS/MS m/z ${nl.precursorMz} → ${nl.productMz} (-${nl.lossDa.toFixed(1)} Da)`,
            interpretation: nl.scientificNote || "CID 中性脫去",
            functionalGroup: nl.possibleIdentity || `-${nl.lossDa.toFixed(0)} Da`,
            constraint: `MS/MS Neutral Loss -${nl.lossDa.toFixed(1)} Da`,
            candidateMatch: "檢驗候選結構於 CID 下是否可產生此脫去",
            validationStatus: "SUPPORTED",
          },
        });
      }

      for (const prod of bundle.msmsAnalysis.physicsModel.productIons) {
        spectrumEvidenceList.push({
          id: `se-msms-prod-${Math.round(prod.mz)}`,
          sourceId: msmsFile,
          sourceSpectrum: "MS/MS",
          spectrumType: "MS/MS",
          evidenceCategory: "EXPERIMENTAL_SPECTRUM",
          scientificProvenance: "EXPERIMENTAL",
          peakPosition: prod.mz,
          intensity: `${prod.intensity}%`,
          inferredGroup: `MS/MS 子離子 ${
            prod.possibleFormula || `m/z ${prod.mz}`
          }`,
          chemicalMeaning: `[MS/MS Product Ion] ${
            prod.structuralMotifHint || `MS/MS 子離子 m/z ${prod.mz}`
          }`,
          ruleApplied: "MS/MS 子離子核心骨架識別規則",
          direction: "SUPPORTING",
          dataQualityNote: `MS/MS Product Ion m/z ${prod.mz}`,
          uncertaintyNote: "低質量區子離子可能來自多步連續裂解",
          scoreImpact: "支持對應子結構片段存在",
          confidence: prod.confidence,
          requiredOrOptional: "OPTIONAL",
          evidenceChain: {
            observedPeak: `MS/MS Product Ion m/z ${prod.mz} (${prod.intensity}%)`,
            interpretation: prod.structuralMotifHint || "MS/MS 子離子",
            functionalGroup: prod.possibleFormula || `m/z ${prod.mz}`,
            constraint: `MS/MS Product Ion m/z ${prod.mz}`,
            candidateMatch: "檢驗候選結構是否含此子離子核心骨架",
            validationStatus: "SUPPORTED",
          },
        });
      }
    }

    // 6. ToF-SIMS 證據轉換 (嚴格保留 ToF-SIMS 模態、正/負離子極性與表面二次離子資訊)
    if (bundle.tofSimsAnalysis) {
      const tofFile =
        extraInput?.tofSimsSpectrum?.fileName ||
        spectra["ToF-SIMS"]?.fileName ||
        (spectra.MS?.canonicalModality === "TOF_SIMS" ? spectra.MS.fileName : undefined) ||
        "ToF_SIMS_Experimental";
      const rawPolarity =
        bundle.tofSimsAnalysis.physicsModel.surfaceConditions?.polarity ||
        "positive";
      const polarity =
        rawPolarity === "negative" ? "NEGATIVE" : "POSITIVE";
      for (const feat of bundle.tofSimsAnalysis.physicsModel
        .secondaryIonFeatures) {
        spectrumEvidenceList.push({
          id: `se-tof-${polarity}-${Math.round(feat.mz)}`,
          sourceId: tofFile,
          sourceSpectrum: "ToF-SIMS",
          spectrumType: "ToF-SIMS",
          evidenceCategory: "EXPERIMENTAL_SPECTRUM",
          scientificProvenance: "EXPERIMENTAL",
          peakPosition: feat.mz,
          intensity: `${feat.intensity}% (${polarity} mode)`,
          inferredGroup: `ToF-SIMS [${polarity}] ${feat.ionAssignment}`,
          chemicalMeaning: `[ToF-SIMS ${polarity} 二次離子] ${feat.fragmentClass} (${
            feat.surfaceFragmentationMechanism || feat.surfaceRelevance
          })`,
          ruleApplied: "ToF-SIMS 表面二次離子濺射與簇離子指紋規則",
          direction: "SUPPORTING",
          dataQualityNote: `ToF-SIMS 極性模式: ${polarity}`,
          uncertaintyNote:
            "ToF-SIMS 具高表面敏感度，二次離子受基質效應與表面重組影響，不單獨等同於整相分子量",
          scoreImpact: "提供表面官能基團、雜原子與芳香/矽氧烷簇離子輔助印證",
          confidence: feat.confidence,
          requiredOrOptional: "OPTIONAL",
          evidenceChain: {
            observedPeak: `ToF-SIMS (${polarity}) m/z ${feat.mz} (${feat.intensity}%)`,
            interpretation: `${feat.ionAssignment} — ${feat.fragmentClass}`,
            functionalGroup: feat.ionAssignment,
            constraint: `ToF-SIMS Secondary Ion m/z ${feat.mz} (${polarity})`,
            candidateMatch: "檢驗候選結構是否可釋出對應表面二次離子",
            validationStatus: "SUPPORTED",
          },
        });
      }
    }

    return {
      bundle,
      spectrumEvidenceList,
      constraints: bundle.constraints,
    };
  }
}
