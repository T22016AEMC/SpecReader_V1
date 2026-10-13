import {
  DataPoint,
  ExperimentalSpectrumData,
  IRBandIntensityLevel,
  IRBandShapeCategory,
  IRVibrationType,
  Signal,
  SignalDetectionSource,
  SignalInterpretationCandidate,
  SpectralPeak,
  SpectrumModality,
} from "../types/spectrum";

export class SignalCharacterizationEngine {
  static estimateNoiseFloor(points: DataPoint[], modality: SpectrumModality): number {
    if (!points || points.length < 10) {
      return modality === "MS" ? 0.8 : 1.5;
    }
    const diffs: number[] = [];
    for (let i = 1; i < points.length; i++) {
      diffs.push(Math.abs(points[i].y - points[i - 1].y));
    }
    diffs.sort((a, b) => a - b);
    const medianDiff = diffs[Math.floor(diffs.length * 0.4)] || 0.8;
    return Math.max(0.4, Math.min(8.0, Number((medianDiff * 1.4826).toFixed(2))));
  }

  static measurePeakGeometry(
    peak: SpectralPeak,
    points: DataPoint[],
    allPeaks: SpectralPeak[],
    modality: SpectrumModality,
    noiseFloor: number
  ): {
    localBaseline: number;
    prominence: number;
    fwhm: number;
    width: number;
    area: number;
    signalToNoise: number;
    localContrast: number;
    shape: Signal["shape"];
    peakType: import("../types/spectrum").IRPeakType;
  } {
    const windowRadius =
      modality === "IR"
        ? 260
        : modality === "1H_NMR"
        ? 0.35
        : modality === "13C_NMR"
        ? 4.0
        : 2.5;

    const localPts = points
      .filter((pt) => Math.abs(pt.x - peak.x) <= windowRadius)
      .sort((a, b) => a.x - b.x);

    let localBaseline = 0;
    let fwhm =
      peak.fwhm ??
      peak.width ??
      (modality === "IR"
        ? peak.shape === "very_broad"
          ? 240
          : peak.shape === "broad"
          ? 110
          : 24
        : modality === "1H_NMR"
        ? 0.04
        : modality === "13C_NMR"
        ? 0.6
        : 0.4);

    let area = peak.area ?? 0;

    if (localPts.length >= 5 && modality !== "MS") {
      const sortedY = localPts.map((p) => p.y).sort((a, b) => a - b);
      localBaseline = Number(
        Math.max(0, sortedY[Math.floor(sortedY.length * 0.12)] ?? 0).toFixed(2)
      );
      const netHeight = Math.max(1, peak.y - localBaseline);
      const halfMaxY = localBaseline + netHeight * 0.5;

      let leftX = peak.x - fwhm * 0.5;
      let rightX = peak.x + fwhm * 0.5;

      const leftPts = localPts.filter((p) => p.x <= peak.x).reverse();
      for (const pt of leftPts) {
        if (pt.y <= halfMaxY) {
          leftX = pt.x;
          break;
        }
      }
      const rightPts = localPts.filter((p) => p.x >= peak.x);
      for (const pt of rightPts) {
        if (pt.y <= halfMaxY) {
          rightX = pt.x;
          break;
        }
      }

      const measuredFwhm = Math.abs(rightX - leftX);
      if (measuredFwhm > 0) {
        fwhm = Number(measuredFwhm.toFixed(modality === "1H_NMR" ? 4 : 2));
      }

      let trapArea = 0;
      const corePts = localPts.filter(
        (p) => p.x >= peak.x - fwhm * 1.4 && p.x <= peak.x + fwhm * 1.4
      );
      for (let i = 1; i < corePts.length; i++) {
        const dx = Math.abs(corePts[i].x - corePts[i - 1].x);
        const y1 = Math.max(0, corePts[i - 1].y - localBaseline);
        const y2 = Math.max(0, corePts[i].y - localBaseline);
        trapArea += 0.5 * (y1 + y2) * dx;
      }
      area = Number(Math.max(0.1, trapArea).toFixed(2));
    } else {
      localBaseline = modality === "MS" ? 0 : Number(Math.min(8, peak.y * 0.05).toFixed(2));
      const netHeight = Math.max(1, peak.y - localBaseline);
      area = Number((netHeight * fwhm * 1.064).toFixed(2));
    }

    const prominence = Number(Math.max(0.5, peak.y - localBaseline).toFixed(2));
    const width = Number((peak.width ?? fwhm * 1.65).toFixed(modality === "1H_NMR" ? 4 : 2));
    const signalToNoise = Number(
      Math.max(0.8, prominence / Math.max(0.4, noiseFloor)).toFixed(1)
    );
    const localContrast = Number(
      (prominence / Math.max(1, peak.y + localBaseline)).toFixed(2)
    );

    let shape: Signal["shape"] = peak.shape || peak.bandShape || (modality === "IR" ? "SHARP" : "sharp");
    let peakType: import("../types/spectrum").IRPeakType =
      peak.peakType ||
      (signalToNoise < 3.0 || prominence < Math.max(3.5, noiseFloor * 2.2)
        ? "POSSIBLE_NOISE"
        : peak.y >= 68
        ? "STRONG"
        : peak.y >= 32
        ? "MEDIUM"
        : "WEAK");

    if (!peak.userOverride && !peak.manualEdited && !peak.userModified) {
      if (modality === "IR") {
        const hasStrongerNeighbor = allPeaks.some(
          (other) =>
            other.id !== peak.id &&
            Math.abs(other.x - peak.x) <= 45 &&
            other.y >= peak.y * 1.32
        );
        const hasOverlappingPeer = allPeaks.some(
          (other) =>
            other.id !== peak.id &&
            Math.abs(other.x - peak.x) <= Math.max(28, (fwhm + (other.fwhm || other.width || 24)) * 0.65) &&
            other.y >= peak.y * 0.65 &&
            other.y <= peak.y * 1.32
        );

        if (peak.shape === "UNRESOLVED" || peak.bandShape === "UNRESOLVED") {
          shape = "UNRESOLVED";
        } else if (
          peak.shape === "SHOULDER" ||
          peak.shape === "shoulder" ||
          hasStrongerNeighbor
        ) {
          shape = "SHOULDER";
          if (peakType !== "POSSIBLE_NOISE") peakType = "SHOULDER";
        } else if (
          peak.shape === "OVERLAPPED" ||
          hasOverlappingPeer
        ) {
          shape = "OVERLAPPED";
          if (peakType !== "POSSIBLE_NOISE") peakType = "OVERLAPPED";
        } else if (
          fwhm >= 78 ||
          peak.isBroad ||
          peak.shape === "broad" ||
          peak.shape === "very_broad" ||
          peak.shape === "BROAD"
        ) {
          shape = "BROAD";
        } else if (fwhm >= 36 || peak.shape === "medium" || peak.shape === "MEDIUM_WIDTH") {
          shape = "MEDIUM_WIDTH";
        } else {
          shape = "SHARP";
        }
      } else if (modality === "1H_NMR") {
        const nearbySubpeaks = allPeaks.filter(
          (other) => other.id !== peak.id && Math.abs(other.x - peak.x) <= 0.12
        );
        if (peak.multiplicity === "br" || peak.multiplicity === "br s" || fwhm >= 0.14) {
          shape = "broad";
        } else if (
          (peak.multiplicity && peak.multiplicity !== "s") ||
          nearbySubpeaks.length >= 1
        ) {
          shape = "multiplet";
        } else {
          shape = "sharp";
        }
      } else {
        shape = "sharp";
      }
    }

    return {
      localBaseline,
      prominence,
      fwhm,
      width,
      area,
      signalToNoise,
      localContrast,
      shape,
      peakType,
    };
  }

  static resolveDetectionSource(
    peak: SpectralPeak,
    spectrum: ExperimentalSpectrumData
  ): SignalDetectionSource {
    if (peak.detectionSource) return peak.detectionSource;
    if (
      peak.manualEdited ||
      peak.userModified ||
      peak.provenance === "USER_DEFINED" ||
      peak.provenance === "USER_EDITED" ||
      peak.provenance === "USER_MODIFIED"
    ) {
      return "MANUAL";
    }
    if (spectrum.digitizedFromImage || spectrum.sourceType === "IMAGE_EXPERIMENTAL") {
      return "ESTIMATED_FROM_IMAGE";
    }
    return "AUTO";
  }

  static interpretIRSignal(
    wn: number,
    normIntensity: number,
    fwhm: number,
    shape: Signal["shape"],
    allPeaks: SpectralPeak[],
    signalToNoise = 12
  ): {
    interpretation: string;
    candidates: SignalInterpretationCandidate[];
    structuralEvidence: string[];
    irIntensity: IRBandIntensityLevel;
    canonicalIntensity: "STRONG" | "MEDIUM" | "WEAK";
    bandShape: IRBandShapeCategory;
    vibrationType: IRVibrationType;
  } {
    const canonicalIntensity: "STRONG" | "MEDIUM" | "WEAK" =
      normIntensity >= 68 ? "STRONG" : normIntensity >= 32 ? "MEDIUM" : "WEAK";
    const irIntensity: IRBandIntensityLevel =
      normIntensity >= 68 ? "strong" : normIntensity >= 32 ? "medium" : "weak";
    const bandShape: IRBandShapeCategory = shape;

    const hasCarbonylCompanion = allPeaks.some((p) => p.x >= 1650 && p.x <= 1810 && p.y >= 40);
    const hasCOCompanion = allPeaks.some((p) => p.x >= 1020 && p.x <= 1310 && p.y >= 40);
    const hasAromaticRingCompanion = allPeaks.some(
      (p) => p.x >= 1450 && p.x <= 1615 && Math.abs(p.x - wn) > 15 && p.y >= 25
    );
    const hasAliphaticCHCompanion = allPeaks.some(
      (p) => p.x >= 2840 && p.x <= 2995 && p.y >= 18
    );

    let vibrationType: IRVibrationType = "stretching";
    if (signalToNoise < 3.0 || shape === "UNRESOLVED") {
      vibrationType = "UNKNOWN";
    } else if (wn >= 2500 && wn <= 3700) {
      vibrationType = "stretching";
    } else if (wn >= 2100 && wn <= 2285) {
      vibrationType = "stretching";
    } else if (wn >= 1630 && wn <= 1850) {
      vibrationType = "stretching";
    } else if (wn >= 1570 && wn < 1630) {
      vibrationType = hasAromaticRingCompanion ? "RING_VIBRATION" : "stretching";
    } else if (wn >= 1480 && wn < 1570) {
      vibrationType =
        normIntensity >= 70 && wn >= 1515 && wn <= 1560
          ? "stretching"
          : "RING_VIBRATION";
    } else if (wn >= 1440 && wn < 1480) {
      vibrationType = hasAliphaticCHCompanion ? "SCISSORING" : hasAromaticRingCompanion ? "RING_VIBRATION" : "bending";
    } else if (wn >= 1360 && wn <= 1395) {
      vibrationType = hasAliphaticCHCompanion ? "bending" : "stretching";
    } else if (wn >= 1000 && wn <= 1320) {
      vibrationType = normIntensity >= 40 ? "stretching" : hasAromaticRingCompanion ? "bending" : "WAGGING";
    } else if (wn >= 715 && wn <= 732 && hasAliphaticCHCompanion && !hasAromaticRingCompanion) {
      vibrationType = "ROCKING";
    } else if (wn >= 675 && wn <= 900 && (hasAromaticRingCompanion || normIntensity >= 45)) {
      vibrationType = "out_of_plane_bending";
    } else if (wn >= 500 && wn <= 800 && normIntensity >= 55) {
      vibrationType = "stretching";
    } else {
      vibrationType = "UNKNOWN";
    }

    const candidates: SignalInterpretationCandidate[] = [];
    const structuralEvidence: string[] = [];

    const isBroadBand =
      shape === "broad" ||
      shape === "very_broad" ||
      shape === "BROAD" ||
      fwhm >= 80;

    if (wn >= 3200 && wn <= 3650) {
      if (isBroadBand) {
        candidates.push({
          assignment: "O-H 伸縮振動 (ν O-H, 分子間氫鍵締合)",
          functionalGroupOrEnvironment: "醇羥基 (Alcohol R-OH) 或酚羥基 (Phenol Ar-OH)",
          confidence: 0.88,
          provenance: "THEORETICAL",
          reasoning:
            "O-H 鍵高極性產生大 ∂μ/∂Q，分子間氫鍵分佈使力常數 k 連續展寬，形成 3200–3550 cm⁻¹ 強寬吸收帶。",
        });
        structuralEvidence.push("支持含羥基 (-OH) 結構單元（醇或酚）");
      } else {
        candidates.push(
          {
            assignment: "N-H 伸縮振動 (ν N-H, 對稱/反對稱伸縮)",
            functionalGroupOrEnvironment: "一級/二級胺 (-NH₂ / -NHR) 或醯胺 (-CONH-)",
            confidence: 0.82,
            provenance: "EMPIRICAL",
            reasoning:
              "3300–3500 cm⁻¹ 中等強度較尖或雙峰吸收帶符合 N-H 伸縮振動（氫鍵強度弱於 O-H）。",
          },
          {
            assignment: "游離態 O-H 伸縮或末端炔 ≡C-H 伸縮",
            functionalGroupOrEnvironment: "非締合醇/酚 (-OH) 或末端炔 (≡C-H ~3300 cm⁻¹)",
            confidence: wn >= 3260 && wn <= 3330 ? 0.78 : 0.62,
            provenance: "EMPIRICAL",
            reasoning:
              "若無寬化且位於 ~3300 cm⁻¹ 尖峰，相容於 sp 混成末端炔 ≡C-H 伸縮振動。",
          }
        );
        structuralEvidence.push("支持含 N-H (胺/醯胺) 或末端炔 ≡C-H 候選");
      }
    } else if (wn >= 2500 && wn < 3200 && (shape === "very_broad" || fwhm >= 150)) {
      candidates.push({
        assignment: "羧酸二聚體強氫鍵 O-H 伸縮振動 (ν O-H dimer)",
        functionalGroupOrEnvironment: "羧酸 (Carboxylic Acid -COOH)",
        confidence: 0.91,
        provenance: "THEORETICAL",
        reasoning:
          "羧酸中心對稱二聚體強氫鍵大幅降低 O-H 鍵力常數 k，與倍頻發生 Fermi 共振形成橫跨 2500–3300 cm⁻¹ 之超寬帶。",
      });
      structuralEvidence.push("強烈支持羧酸 (-COOH) 官能基");
    } else if (wn >= 3005 && wn < 3120) {
      candidates.push({
        assignment: "sp² C-H 伸縮振動 (ν =C-H / Ar-H)",
        functionalGroupOrEnvironment: "芳香環 (Aromatic / Heteroaromatic C-H) 或烯烴 (=C-H)",
        confidence: 0.85,
        provenance: "THEORETICAL",
        reasoning:
          "sp² 混成碳 (33% s 成分) 鍵長較短、力常數 k 較 sp³ C-H 高，使伸縮頻率落於 > 3000 cm⁻¹。",
      });
      structuralEvidence.push("支持 sp² 不飽和碳氫結構（芳環、雜芳環或烯烴）");
    } else if (wn >= 2840 && wn <= 3000) {
      candidates.push({
        assignment: "sp³ C-H 對稱/反對稱伸縮振動 (ν CH₃ / CH₂)",
        functionalGroupOrEnvironment: "飽和脂肪族烷基 (-CH₃, -CH₂-, -OCH₃)",
        confidence: 0.87,
        provenance: "THEORETICAL",
        reasoning:
          "sp³ 碳氫鍵力常數對應 2850–2970 cm⁻¹ 伸縮吸收帶；若位於 2830–2850 cm⁻¹ 亦相容於甲氧基 (-OCH₃)。",
      });
      structuralEvidence.push("支持含 sp³ 飽和烷基或甲氧基鏈段");
    } else if (wn >= 2690 && wn < 2840) {
      vibrationType = "fermi_resonance";
      candidates.push({
        assignment: "醛基 C(O)-H 伸縮與彎曲倍頻費米共振雙峰 (Fermi doublet)",
        functionalGroupOrEnvironment: "醛基 (Aldehyde -CHO)",
        confidence: hasCarbonylCompanion ? 0.89 : 0.72,
        provenance: "THEORETICAL",
        reasoning:
          "醛基 C-H 基頻伸縮與 ~1390 cm⁻¹ C-H 平面內彎曲倍頻 (2×1390 ≈ 2780 cm⁻¹) 產生量子力學一階微擾分裂為 ~2720/2820 cm⁻¹ 雙峰。",
      });
      structuralEvidence.push("診斷性支持醛基 (-CHO) 結構單元");
    } else if (wn >= 2100 && wn <= 2280) {
      if (wn >= 2210 && wn <= 2265) {
        candidates.push({
          assignment: "C≡N 叁鍵伸縮振動 (ν C≡N)",
          functionalGroupOrEnvironment: "腈基 (Nitrile -C≡N)",
          confidence: 0.9,
          provenance: "THEORETICAL",
          reasoning:
            "碳氮叁鍵高力常數 k (≈ 17.5 mdyn/Å) 與極性偶極矩變化產生 2215–2260 cm⁻¹ 尖銳吸收峰 (DBE ≥ 2)。",
        });
        structuralEvidence.push("支持含腈基 (-C≡N, DBE ≥ 2)");
      } else {
        candidates.push({
          assignment: "C≡C 叁鍵伸縮振動 (ν C≡C)",
          functionalGroupOrEnvironment: "炔基 (Alkyne -C≡C-)",
          confidence: 0.83,
          provenance: "THEORETICAL",
          reasoning:
            "碳碳叁鍵高力常數產生 2100–2210 cm⁻¹ 弱至中等尖峰（對稱內炔因 ∂μ/∂Q ≈ 0 呈紅外非活性或極弱）。",
        });
        structuralEvidence.push("支持含碳碳叁鍵 (-C≡C-, DBE ≥ 2)");
      }
    } else if (wn >= 1650 && wn <= 1830) {
      if (wn >= 1730 && wn <= 1765 && hasCOCompanion) {
        candidates.push({
          assignment: "酯基 C=O 伸縮振動 (ν C=O ester)",
          functionalGroupOrEnvironment: "酯基 (Ester -COOR)",
          confidence: 0.88,
          provenance: "EMPIRICAL",
          reasoning:
            "氧原子高電負度誘導效應強化 C=O 鍵力常數 k，使伸縮頻率升至 1730–1755 cm⁻¹（共軛芳酯約 1715–1730 cm⁻¹），並伴隨強 C-O 伸縮帶。",
        });
        structuralEvidence.push("支持酯基 (-COOR) 結構單元");
      }
      if (wn >= 1680 && wn <= 1728) {
        candidates.push(
          {
            assignment: "酮/醛/共軛酯 C=O 伸縮振動 (ν C=O)",
            functionalGroupOrEnvironment: "共軛醛/酮 (Ar-CHO / Ar-CO-R)、脂肪酮 (R₂C=O) 或芳香酯 (Ar-COOR)",
            confidence: 0.87,
            provenance: "THEORETICAL",
            reasoning:
              "C=O 雙鍵具大偶極矩導數 ∂μ/∂Q，於 1680–1725 cm⁻¹ 產生極強伸縮吸收；與芳環共軛時因 π→π* 離域降低雙鍵成分而紅移約 20–30 cm⁻¹。",
          },
          {
            assignment: "羧酸二聚體 C=O 伸縮振動",
            functionalGroupOrEnvironment: "羧酸 (Carboxylic Acid -COOH)",
            confidence: 0.74,
            provenance: "EMPIRICAL",
            reasoning: "羧酸分子間氫鍵二聚體使 C=O 伸縮紅移至 ~1700–1720 cm⁻¹。",
          }
        );
        structuralEvidence.push("診斷性支持羰基官能基 (C=O, DBE ≥ 1)");
      } else if (wn >= 1650 && wn < 1685) {
        candidates.push({
          assignment: "醯胺 C=O 伸縮 (Amide I) 或高度共軛羰基伸縮",
          functionalGroupOrEnvironment: "醯胺 (Amide -CONH-) 或 α,β-不飽和共軛酮",
          confidence: 0.83,
          provenance: "EMPIRICAL",
          reasoning:
            "氮孤對電子與羰基強烈共振離域顯著降低 C=O 力常數 k，使 Amide I 帶落於 1650–1685 cm⁻¹。",
        });
        structuralEvidence.push("支持醯胺 (-CONH-) 或共軛羰基結構");
      } else {
        candidates.push({
          assignment: "高頻羰基 C=O 伸縮振動 (酸酐 / 醯氯 / 環酯)",
          functionalGroupOrEnvironment: "酸酐 (-CO-O-CO-)、醯氯 (-COCl) 或張力內酯",
          confidence: 0.82,
          provenance: "THEORETICAL",
          reasoning: "強誘導吸電子基或環張力使 C=O 伸縮升至 > 1760 cm⁻¹。",
        });
        structuralEvidence.push("支持高頻羰基官能基 (C=O)");
      }
    } else if (wn >= 1445 && wn < 1650) {
      if (wn >= 1575 && wn <= 1625) {
        candidates.push(
          {
            assignment: "芳香環 / 含氮雜芳環骨架伸縮振動 (ν C=C / ν C=N ring)",
            functionalGroupOrEnvironment: "苯環衍生物 (Aromatic Ring) 或吡啶含氮雜芳環 (Pyridine C=N/C=C)",
            confidence: hasAromaticRingCompanion ? 0.88 : 0.8,
            provenance: "EMPIRICAL",
            reasoning:
              "共軛六元環骨架 C=C 與吡啶 C=N 環伸縮簡正模態於 1580–1615 cm⁻¹ 及 ~1480–1520 cm⁻¹ 成對出現。",
          },
          {
            assignment: "烯烴 C=C 伸縮或一級胺 N-H 剪式彎曲 (δ NH₂)",
            functionalGroupOrEnvironment: "烯烴 (Alkene C=C) 或芳香胺/一級胺 (-NH₂)",
            confidence: 0.68,
            provenance: "EMPIRICAL",
            reasoning: "非對稱烯烴 C=C 伸縮與一級胺 NH₂ 彎曲振動亦落於 1590–1645 cm⁻¹。",
          }
        );
        structuralEvidence.push("支持芳香環/含氮雜芳環骨架 (DBE ≥ 4) 或共軛雙鍵");
      } else if (wn >= 1515 && wn <= 1560 && normIntensity >= 70) {
        candidates.push(
          {
            assignment: "硝基反對稱伸縮 (ν_as NO₂) 或對位取代芳環骨架伸縮",
            functionalGroupOrEnvironment: "硝基化合物 (-NO₂) 或拉電子基取代芳香環",
            confidence: 0.82,
            provenance: "EMPIRICAL",
            reasoning: "1515–1555 cm⁻¹ 強吸收相容於硝基反對稱伸縮或共軛芳環骨架振動。",
          }
        );
        structuralEvidence.push("支持芳香環骨架或硝基 (-NO₂) 候選");
      } else {
        vibrationType = wn <= 1475 ? "in_plane_bending" : "stretching";
        candidates.push({
          assignment:
            wn >= 1475
              ? "芳香環/雜芳環骨架 C=C/C=N 伸縮振動"
              : "芳環骨架伸縮或烷基 CH₂/CH₃ 彎曲振動 (δ CH₂ / δ_as CH₃)",
          functionalGroupOrEnvironment:
            wn >= 1475 ? "芳香環 / 吡啶雜芳環骨架" : "脂肪族 CH₂/CH₃ 或芳環骨架",
          confidence: 0.78,
          provenance: "EMPIRICAL",
          reasoning:
            wn >= 1475
              ? "1480–1520 cm⁻¹ 為典型芳香環與吡啶雜芳環骨架半圓伸縮振動區。"
              : "1445–1475 cm⁻¹ 包含亞甲基剪式彎曲 (scissoring) 與雜芳環骨架吸收。",
        });
        structuralEvidence.push("支持芳香/雜芳環骨架或烷基鏈彎曲特徵");
      }
    } else if (wn >= 1000 && wn < 1350) {
      vibrationType = "stretching";
      candidates.push(
        {
          assignment: "C-O 伸縮振動 (ν C-O, 醚 / 酯 / 醇 / 酚) 或 C-N 伸縮",
          functionalGroupOrEnvironment: "芳基烷基醚 (Ar-O-R)、酯基 (-COOR)、醇 (-C-OH) 或芳香胺 (C-N)",
          confidence: normIntensity >= 55 ? 0.86 : 0.74,
          provenance: "EMPIRICAL",
          reasoning:
            "C-O 單鍵極性大，於 1020–1300 cm⁻¹ 產生強伸縮吸收（芳醚/共軛酯 C-O 約 1230–1280 cm⁻¹ 與 1020–1120 cm⁻¹）。",
        },
        {
          assignment: "芳香環/吡啶環平面內 C-H 彎曲振動 (β C-H in-plane) 或 Si-O-Si 伸縮",
          functionalGroupOrEnvironment: "芳香/吡啶環平面內 C-H 彎曲或有機矽氧烷 (Si-O-Si 1020–1100 cm⁻¹)",
          confidence: 0.7,
          provenance: "EMPIRICAL",
          reasoning:
            "1000–1150 cm⁻¹ 中等峰相容於吡啶/苯環呼吸振動與平面內 C-H 彎曲，極強寬帶則可能為 Si-O-Si。",
        }
      );
      structuralEvidence.push("支持 C-O 雜原子單鍵（醚/酯/醇）或芳環平面內 C-H 彎曲");
    } else if (wn >= 650 && wn < 1000) {
      vibrationType = "out_of_plane_bending";
      if (wn >= 805 && wn <= 855) {
        candidates.push({
          assignment: "芳香環 2 個相鄰 C-H 面外彎曲振動 (γ C-H OOP, 1,4-對位取代特徵)",
          functionalGroupOrEnvironment: "1,4-對位雙取代苯環 (Para-disubstituted benzene) 或 4-取代吡啶",
          confidence: 0.85,
          provenance: "EMPIRICAL",
          reasoning:
            "苯環上 2 個相鄰氫原子同相面外彎曲 (out-of-plane wagging) 特徵落於 805–855 cm⁻¹。",
        });
        structuralEvidence.push("支持 1,4-對位雙取代芳香環拓樸候選");
      } else if (wn >= 690 && wn <= 775) {
        candidates.push({
          assignment: "芳香環 / 吡啶環相鄰 C-H 面外彎曲振動 (γ C-H OOP)",
          functionalGroupOrEnvironment: "單取代苯環 (Monosubstituted)、吡啶環 (Pyridine 700–755 cm⁻¹) 或鄰位雙取代芳環",
          confidence: 0.86,
          provenance: "EMPIRICAL",
          reasoning:
            "4–5 個連續相鄰芳香氫或吡啶環 C-H 面外彎曲與環面外扭曲振動於 695–770 cm⁻¹ 產生強吸收帶。",
        });
        structuralEvidence.push("支持單取代苯環、未取代吡啶或鄰位取代芳環面外彎曲");
      } else {
        candidates.push({
          assignment: "指紋區 C-H 面外彎曲或 C-X (C-Cl / C-Br) 伸縮振動",
          functionalGroupOrEnvironment: "取代芳環/烯烴 C-H OOP 或鹵代烴",
          confidence: 0.72,
          provenance: "EMPIRICAL",
          reasoning: "650–990 cm⁻¹ 指紋區面外彎曲或碳鹵鍵伸縮模態。",
        });
        structuralEvidence.push("提供指紋區取代型態或碳鹵鍵輔助證據");
      }
    } else {
      candidates.push({
        assignment: "指紋區骨架變形或低頻碳鹵鍵伸縮振動",
        functionalGroupOrEnvironment: "分子骨架變形模態 / C-Br / C-I",
        confidence: 0.65,
        provenance: "EMPIRICAL",
        reasoning: "低波數區 (< 650 cm⁻¹) 骨架彎曲或重原子伸縮振動。",
      });
      structuralEvidence.push("低頻骨架指紋特徵");
    }

    const top = candidates[0];
    return {
      interpretation: `${top.assignment} → ${top.functionalGroupOrEnvironment}`,
      candidates,
      structuralEvidence,
      irIntensity,
      canonicalIntensity,
      bandShape,
      vibrationType,
    };
  }

  static interpretH1NMRSignal(
    ppm: number,
    peak: SpectralPeak,
    allPeaks: SpectralPeak[]
  ): {
    interpretation: string;
    candidates: SignalInterpretationCandidate[];
    structuralEvidence: string[];
  } {
    const multStr = peak.multiplicity || "m/s";
    const integStr = peak.integration ? `${peak.integration}H` : "積分待定";
    const candidates: SignalInterpretationCandidate[] = [];
    const structuralEvidence: string[] = [];

    if (ppm >= 10.5 && ppm <= 13.8) {
      candidates.push({
        assignment: `羧酸質子 (-COOH, δ ${ppm.toFixed(2)} ppm, ${integStr})`,
        functionalGroupOrEnvironment: "羧酸 (Carboxylic Acid -COOH) 或強分子內氫鍵酚羥基",
        confidence: 0.9,
        provenance: "THEORETICAL",
        reasoning: "強吸電子羰基與氫鍵二聚體嚴重抽離質子周邊電子雲 (σ 大幅下降)，產生極低場共振。",
      });
      structuralEvidence.push("支持含羧酸 (-COOH) 官能基");
    } else if (ppm >= 9.3 && ppm < 10.5) {
      candidates.push({
        assignment: `醛基甲醯質子 (-CH=O, δ ${ppm.toFixed(2)} ppm, ${integStr}, ${multStr})`,
        functionalGroupOrEnvironment: "醛基 (Aldehyde -CHO / Ar-CHO)",
        confidence: 0.92,
        provenance: "THEORETICAL",
        reasoning: "C=O 雙鍵磁各向異性去遮蔽錐區與氧原子誘導吸電子效應使醛基質子共振於 δ 9.3–10.5 ppm。",
      });
      structuralEvidence.push("診斷性支持醛基 (-CHO) 結構單元");
    } else if (ppm >= 8.35 && ppm < 9.3) {
      candidates.push(
        {
          assignment: `含氮雜芳環鄰氮質子 (Pyridine/Heteroaryl Cα-H, δ ${ppm.toFixed(2)} ppm, ${integStr}, ${multStr})`,
          functionalGroupOrEnvironment: "吡啶 (Pyridine C2/C6-H)、嘧啶或喹啉鄰氮位",
          confidence: 0.91,
          provenance: "THEORETICAL",
          reasoning:
            "芳香環電流效應疊加環內 sp² 氮原子強誘導與磁各向異性去遮蔽，使鄰氮 α-H 特徵落於 δ 8.4–9.2 ppm。",
        },
        {
          assignment: "強吸電子基 (-NO₂) 鄰位芳香質子",
          functionalGroupOrEnvironment: "硝基苯或強缺電子芳香環",
          confidence: 0.72,
          provenance: "EMPIRICAL",
          reasoning: "強吸電子取代基鄰位質子亦可去遮蔽至 δ 8.3–8.8 ppm。",
        }
      );
      structuralEvidence.push("強烈支持吡啶/含氮六元雜芳環 (Pyridine Cα-H) 或強缺電子芳環");
    } else if (ppm >= 6.5 && ppm < 8.35) {
      const hasPyridineAlpha = allPeaks.some((p) => p.x >= 8.35 && p.x <= 9.25);
      if (hasPyridineAlpha) {
        const isGamma = ppm >= 7.55 && ppm <= 8.05;
        candidates.push({
          assignment: isGamma
            ? `吡啶/雜芳環對位質子 (Cγ-H / H4, δ ${ppm.toFixed(2)} ppm, ${integStr}, ${multStr})`
            : `吡啶/雜芳環間位質子 (Cβ-H / H3,H5, δ ${ppm.toFixed(2)} ppm, ${integStr}, ${multStr})`,
          functionalGroupOrEnvironment: "吡啶環 (Pyridine Cβ-H / Cγ-H) 耦合自旋系統",
          confidence: 0.89,
          provenance: "EMPIRICAL",
          reasoning: isGamma
            ? "吡啶 C4 (γ) 位受環氮共振吸電子去遮蔽，化學位移約 δ 7.6–7.9 ppm。"
            : "吡啶 C3/C5 (β) 位受氮共振影響較小，化學位移約 δ 7.1–7.45 ppm。",
        });
        structuralEvidence.push("支持吡啶環 (Pyridine) 耦合質子環境");
      } else {
        candidates.push({
          assignment: `芳香環質子 (Ar-H, δ ${ppm.toFixed(2)} ppm, ${integStr}, ${multStr})`,
          functionalGroupOrEnvironment:
            ppm >= 7.65
              ? "吸電子基 (-CHO/-COOR/-COR) 鄰位芳香質子"
              : ppm <= 7.1
              ? "推電子基 (-OCH₃/-NH₂/-OH) 鄰位芳香質子"
              : "苯環或雜芳環質子環境",
          confidence: 0.88,
          provenance: "THEORETICAL",
          reasoning: "芳香 π 電子環電流在外加磁場 B₀ 誘導產生去遮蔽磁場，使芳環質子共振於 δ 6.5–8.3 ppm。",
        });
        structuralEvidence.push("支持芳香環 (Aromatic Ring, DBE ≥ 4) 結構單元");
      }
    } else if (ppm >= 4.7 && ppm < 6.5) {
      candidates.push({
        assignment: `烯烴質子 (=C-H) 或可交換活潑質子 (δ ${ppm.toFixed(2)} ppm, ${integStr})`,
        functionalGroupOrEnvironment: "烯烴雙鍵 (=CH-) 或酚/醯胺活潑氫",
        confidence: 0.82,
        provenance: "EMPIRICAL",
        reasoning: "sp² 烯鍵各向異性去遮蔽區 (δ 4.7–6.5 ppm)。",
      });
      structuralEvidence.push("支持碳碳雙鍵 (=C-H) 或可交換活潑氫");
    } else if (ppm >= 3.25 && ppm < 4.7) {
      candidates.push({
        assignment:
          peak.multiplicity === "s" && peak.integration === 3
            ? `甲氧基質子 (-OCH₃, δ ${ppm.toFixed(2)} ppm, 3H, s)`
            : peak.multiplicity === "q"
            ? `乙氧基/乙酯亞甲基 (-OCH₂CH₃, δ ${ppm.toFixed(2)} ppm, ${integStr}, q)`
            : `雜原子鄰接質子 (-O-CHn / -N-CHn / Ar-NH₂, δ ${ppm.toFixed(2)} ppm, ${integStr})`,
        functionalGroupOrEnvironment: "烷氧基醚 (-OCH₃/-OC₂H₅)、酯烷氧端 (-COOR) 或芳香胺 (-NH₂)",
        confidence: 0.87,
        provenance: "EMPIRICAL",
        reasoning: "氧/氮高電負度透過 σ 鍵誘導效應去遮蔽鄰接碳上質子至 δ 3.3–4.6 ppm。",
      });
      structuralEvidence.push("支持接氧烷氧基 (-OCH₃ / -OCH₂-) 或胺基環境");
    } else if (ppm >= 1.9 && ppm < 3.25) {
      candidates.push({
        assignment: `α-羰基或苄位質子 (δ ${ppm.toFixed(2)} ppm, ${integStr}, ${multStr})`,
        functionalGroupOrEnvironment: "甲基酮 (-COCH₃)、苄基 (Ar-CH₂-/Ar-CH₃) 或鄰氮烷基",
        confidence: 0.83,
        provenance: "EMPIRICAL",
        reasoning: "鄰接羰基或芳環之各向異性與誘導效應使 sp³ C-H 位移至 δ 1.9–3.2 ppm。",
      });
      structuralEvidence.push("支持 α-羰基烷基 (-COCH₃) 或苄位取代基 (Ar-CHn)");
    } else {
      candidates.push({
        assignment:
          ppm <= 0.3
            ? `矽甲基高場質子 (Si-CH₃ / TMS, δ ${ppm.toFixed(2)} ppm, ${integStr})`
            : `飽和脂肪族烷基質子 (sp³ C-H, δ ${ppm.toFixed(2)} ppm, ${integStr}, ${multStr})`,
        functionalGroupOrEnvironment:
          ppm <= 0.3 ? "有機矽氧烷 (Si-CH₃) 或 TMS 內標" : "飽和烷基鏈 (-CH₃ / -CH₂- / -CH-)",
        confidence: 0.86,
        provenance: "THEORETICAL",
        reasoning:
          ppm <= 0.3
            ? "矽電負度低於碳，強電子遮蔽使 Si-CH₃ 共振於 δ 0.0–0.25 ppm。"
            : "飽和 sp³ 碳氫鍵高電子雲遮蔽使質子落於高場 δ 0.7–1.9 ppm。",
      });
      structuralEvidence.push(
        ppm <= 0.3 ? "支持有機矽甲基 (Si-CH₃)" : "支持飽和脂肪族烷基碳氫鏈"
      );
    }

    return {
      interpretation: `${candidates[0].assignment} → ${candidates[0].functionalGroupOrEnvironment}`,
      candidates,
      structuralEvidence,
    };
  }

  static interpretC13NMRSignal(
    ppm: number,
    peak: SpectralPeak
  ): {
    interpretation: string;
    candidates: SignalInterpretationCandidate[];
    structuralEvidence: string[];
  } {
    const dept = peak.deptType && peak.deptType !== "Unknown" ? peak.deptType : "C/CHn";
    const candidates: SignalInterpretationCandidate[] = [];
    const structuralEvidence: string[] = [];

    if (ppm >= 188 && ppm <= 225) {
      candidates.push({
        assignment: `醛/酮羰基碳 (C=O, δ ${ppm.toFixed(1)} ppm, ${dept})`,
        functionalGroupOrEnvironment:
          ppm <= 195.5 ? "醛基 (-CHO) 或共軛芳酮 (Ar-CO-R)" : "酮基羰基碳 (Ketone C=O)",
        confidence: 0.92,
        provenance: "THEORETICAL",
        reasoning: "C=O 低能量 n→π* 電子躍遷使順磁去遮蔽項 σ_para 極大，共振於 δ 188–220 ppm。",
      });
      structuralEvidence.push("診斷性支持醛基或酮基羰基碳 (C=O)");
    } else if (ppm >= 162 && ppm < 188) {
      candidates.push(
        {
          assignment: `酯/羧酸/醯胺羰基碳或接氧芳環四級碳 (δ ${ppm.toFixed(1)} ppm, ${dept})`,
          functionalGroupOrEnvironment: "酯基 (-COOR)、羧酸 (-COOH)、醯胺 (-CONH-) 或接氧芳環碳 (Ar-O-R)",
          confidence: 0.88,
          provenance: "THEORETICAL",
          reasoning:
            "雜原子孤對電子向羰基共振供電子提升 π→π* 能隙，使酯/酸/醯胺 C=O 落於 δ 165–185 ppm；接氧對位芳環四級碳亦常落於 δ 158–166 ppm。",
        }
      );
      structuralEvidence.push("支持酯/羧酸/醯胺羰基或接氧芳環四級碳");
    } else if (ppm >= 144 && ppm < 162) {
      candidates.push({
        assignment: `含氮雜芳環鄰氮碳 (Pyridine Cα / C=N) 或雜原子取代芳環碳 (δ ${ppm.toFixed(1)} ppm)`,
        functionalGroupOrEnvironment: "吡啶環鄰氮碳 (Pyridine C2/C6 ~150 ppm) 或接氧/接氮芳環四級碳",
        confidence: 0.89,
        provenance: "THEORETICAL",
        reasoning: "環內 sp² 氮原子強誘導吸電子效應使吡啶 Cα (C2/C6) 顯著去遮蔽至 δ 146–155 ppm。",
      });
      structuralEvidence.push("支持吡啶含氮雜芳環 (Cα ~150 ppm) 或接氧/接氮芳環碳");
    } else if (ppm >= 105 && ppm < 144) {
      candidates.push({
        assignment: `芳香環 / 雜芳環 / 烯烴 sp² 碳 (δ ${ppm.toFixed(1)} ppm, ${dept})`,
        functionalGroupOrEnvironment: "苯環碳、吡啶 Cβ/Cγ 碳或腈基碳 (-C≡N ~115–122 ppm)",
        confidence: 0.88,
        provenance: "THEORETICAL",
        reasoning: "sp² 混成碳 π 電子系統順磁去遮蔽效應對應 δ 105–144 ppm。",
      });
      structuralEvidence.push("支持芳香環/雜芳環 sp² 碳骨架");
    } else if (ppm >= 49 && ppm < 95) {
      candidates.push({
        assignment: `接氧/接氮 sp³ 碳或炔碳 (δ ${ppm.toFixed(1)} ppm, ${dept})`,
        functionalGroupOrEnvironment: "甲氧基 (-OCH₃ ~55 ppm)、乙氧基 (-OCH₂- ~60 ppm) 或 C-O/C-N 碳",
        confidence: 0.87,
        provenance: "EMPIRICAL",
        reasoning: "電負性氧/氮原子誘導去遮蔽使 sp³ 碳位移至 δ 50–88 ppm。",
      });
      structuralEvidence.push("支持接氧烷氧基 (-OCH₃ / -OCH₂-) 或 C-O/C-N 單元");
    } else {
      candidates.push({
        assignment:
          ppm <= 4.0
            ? `矽甲基碳 (Si-CH₃, δ ${ppm.toFixed(1)} ppm)`
            : `飽和脂肪族 sp³ 碳 (δ ${ppm.toFixed(1)} ppm, ${dept})`,
        functionalGroupOrEnvironment:
          ppm <= 4.0 ? "有機矽氧烷 (Si-CH₃)" : "烷基鏈 (-CH₃ / -CH₂- / -CH- / 苄基碳)",
        confidence: 0.86,
        provenance: "THEORETICAL",
        reasoning: "高遮蔽飽和 sp³ 碳環境 (δ -3–48 ppm)。",
      });
      structuralEvidence.push(ppm <= 4.0 ? "支持有機矽甲基碳" : "支持飽和 sp³ 烷基碳鏈");
    }

    return {
      interpretation: `${candidates[0].assignment} → ${candidates[0].functionalGroupOrEnvironment}`,
      candidates,
      structuralEvidence,
    };
  }

  static interpretMSSignal(
    mz: number,
    normIntensity: number,
    peak: SpectralPeak,
    allPeaks: SpectralPeak[],
    spectrum: ExperimentalSpectrumData
  ): {
    interpretation: string;
    candidates: SignalInterpretationCandidate[];
    structuralEvidence: string[];
  } {
    const mzRound = Math.round(mz);
    const msType = spectrum.msParams?.msType || "EI-MS";
    const maxMz = Math.max(...allPeaks.map((p) => p.x), mz);
    const deltaFromTop = Math.round(maxMz - mz);

    const candidates: SignalInterpretationCandidate[] = [];
    const structuralEvidence: string[] = [];

    if (msType === "ToF-SIMS" && [73, 147, 207, 221, 59, 75, 149].includes(mzRound)) {
      candidates.push({
        assignment: `ToF-SIMS 有機矽氧烷特徵二次離子 m/z ${mzRound}`,
        functionalGroupOrEnvironment:
          mzRound === 73
            ? "[Si(CH₃)₃]⁺ 三甲基矽基二次正離子"
            : mzRound === 147
            ? "[Si₂O(CH₃)₅]⁺ 五甲基二矽氧烷二次正離子"
            : `PDMS / 矽氧烷表面二次離子簇 (m/z ${mzRound})`,
        confidence: 0.88,
        provenance: "REFERENCE_BASED",
        reasoning: "一次離子束碰撞級聯溫和動量轉移區釋放之有機矽氧烷特徵二次離子系列。",
      });
      structuralEvidence.push("支持聚二甲基矽氧烷 (PDMS / Si-O-Si) 表面結構單元");
    } else if (Math.abs(mz - maxMz) <= 0.45 && normIntensity >= 10) {
      candidates.push({
        assignment:
          spectrum.msParams?.ionization === "ESI+"
            ? `準分子離子候選 [M+H]⁺ (m/z ${mz.toFixed(2)})`
            : spectrum.msParams?.ionization === "ESI-"
            ? `去質子化準分子離子候選 [M-H]⁻ (m/z ${mz.toFixed(2)})`
            : `分子離子候選 [M]⁺• 或前驅離子 (m/z ${mz.toFixed(2)})`,
        functionalGroupOrEnvironment: `決定分子量與氮規則約束 (m/z ${mz.toFixed(2)})`,
        confidence: 0.86,
        provenance: "THEORETICAL",
        reasoning: "高質量端顯著離子峰定義分子離子/前驅離子候選與單同位素質量。",
      });
      structuralEvidence.push(`提供分子量與分子式約束 (m/z ${mz.toFixed(2)})`);
    } else if ([77, 91, 105, 120, 135, 79, 52].includes(mzRound)) {
      const descMap: Record<number, [string, string]> = {
        77: ["[C₆H₅]⁺ 苯基正離子 (α-cleavage)", "支持單取代苯環或芳環骨架"],
        91: ["[C₇H₇]⁺ 䓬/苄基正離子 (Benzylic cleavage)", "支持苄位取代芳香環 (Ar-CH₂-)"],
        105: ["[C₆H₅CO]⁺ 苯甲醯基正離子 (α-cleavage)", "支持苯甲醯基 (Ph-C=O) 結構單元"],
        120: ["[H₂N-C₆H₄-CO]⁺ 胺基苯甲醯基正離子", "支持胺基苯甲酸酯/醯胺結構"],
        135: ["[CH₃O-C₆H₄-CO]⁺ 甲氧基苯甲醯基正離子", "支持甲氧基苯甲醛/酮結構"],
        79: ["[C₅H₅N]⁺• 吡啶分子離子或含氮芳環離子", "支持吡啶 (Pyridine C₅H₅N) 雜芳環"],
        52: ["[C₄H₄]⁺• (吡啶脫 HCN -27 Da 特徵碎片)", "支持吡啶環收縮脫去 HCN 裂解路徑"],
      };
      const [assign, ev] = descMap[mzRound];
      candidates.push({
        assignment: `m/z ${mzRound}: ${assign}`,
        functionalGroupOrEnvironment: ev,
        confidence: 0.85,
        provenance: "CHEMICAL_RULE_BASED",
        reasoning: `特徵奇/偶電子裂解離子 m/z ${mzRound}，倒推母體含對應芳香或醯基子結構。`,
      });
      structuralEvidence.push(ev);
    } else if (deltaFromTop > 0 && [1, 15, 17, 18, 27, 28, 29, 31, 43, 44, 45].includes(deltaFromTop)) {
      candidates.push({
        assignment: `產物/碎片離子 m/z ${mz.toFixed(1)} (中性丟失 -${deltaFromTop} Da)`,
        functionalGroupOrEnvironment:
          deltaFromTop === 27
            ? "脫去 HCN (-27 Da, 含氮雜芳環/芳香胺特徵)"
            : deltaFromTop === 28
            ? "脫去 CO 或 C₂H₄ (-28 Da, 羰基或 McLafferty 重排)"
            : deltaFromTop === 29
            ? "脫去 CHO• 或 C₂H₅• (-29 Da, 醛基或乙基 α-裂解)"
            : deltaFromTop === 15
            ? "脫去 CH₃• (-15 Da, 甲基 α-裂解)"
            : deltaFromTop === 18
            ? "脫去 H₂O (-18 Da, 醇/羧酸電荷導向脫水)"
            : `特徵中性丟失 -${deltaFromTop} Da 裂解路徑`,
        confidence: 0.8,
        provenance: "CHEMICAL_RULE_BASED",
        reasoning: `與高質量母離子相差 ${deltaFromTop} Da，符合特徵中性碎片脫去機制。`,
      });
      structuralEvidence.push(`支持可發生 -${deltaFromTop} Da 中性丟失之官能基子結構`);
    } else {
      candidates.push({
        assignment: `質譜離子訊號 m/z ${mz.toFixed(2)} (${normIntensity.toFixed(0)}%)`,
        functionalGroupOrEnvironment: "電子撞擊或碰撞誘導骨架裂解碎片",
        confidence: 0.72,
        provenance: "EMPIRICAL",
        reasoning: "提供分子量分佈與碎片指紋約束。",
      });
      structuralEvidence.push(`m/z ${mz.toFixed(1)} 裂解碎片約束`);
    }

    return {
      interpretation: `${candidates[0].assignment} → ${candidates[0].functionalGroupOrEnvironment}`,
      candidates,
      structuralEvidence,
    };
  }

  static characterizeSpectrumSignals(
    spectrum: ExperimentalSpectrumData
  ): ExperimentalSpectrumData {
    if (!spectrum || !spectrum.peaks || spectrum.peaks.length === 0) {
      return {
        ...spectrum,
        signals: [],
      };
    }

    const modality = spectrum.modality;
    const effectiveModality: Signal["modality"] =
      modality === "MS" && spectrum.msParams?.msType === "MS/MS"
        ? "MS/MS"
        : modality === "MS" && spectrum.msParams?.msType === "ToF-SIMS"
        ? "ToF-SIMS"
        : modality;

    const points = spectrum.points || [];
    const noiseFloor = this.estimateNoiseFloor(points, modality);
    const maxPeakY = Math.max(...spectrum.peaks.map((p) => p.y || 0), 1);

    const enrichedPeaks: SpectralPeak[] = [];
    const unifiedSignals: Signal[] = [];

    for (const pk of spectrum.peaks) {
      const normalizedIntensity = Number(
        Math.max(0, Math.min(100, (pk.y / maxPeakY) * 100)).toFixed(1)
      );
      const geom = this.measurePeakGeometry(
        { ...pk, y: normalizedIntensity },
        points,
        spectrum.peaks,
        modality,
        noiseFloor
      );
      const detectionSource = this.resolveDetectionSource(pk, spectrum);

      let interpretation = pk.interpretation || pk.assignment || "";
      let interpretationCandidates: SignalInterpretationCandidate[] =
        pk.interpretationCandidates || [];
      let structuralEvidence: string[] = pk.structuralEvidence || [];
      let irIntensity = pk.irIntensity;
      let bandShape = pk.bandShape;
      let vibrationType = pk.vibrationType;

      if (modality === "IR") {
        const irRes = this.interpretIRSignal(
          pk.x,
          normalizedIntensity,
          geom.fwhm,
          geom.shape,
          spectrum.peaks
        );
        interpretation =
          pk.userOverride && pk.assignment ? pk.assignment : irRes.interpretation;
        interpretationCandidates = irRes.candidates;
        structuralEvidence = irRes.structuralEvidence;
        irIntensity = pk.irIntensity || irRes.irIntensity;
        bandShape = pk.bandShape || irRes.bandShape;
        vibrationType = pk.vibrationType || irRes.vibrationType;
      } else if (modality === "1H_NMR") {
        const h1Res = this.interpretH1NMRSignal(pk.x, pk, spectrum.peaks);
        interpretation =
          pk.userOverride && pk.assignment ? pk.assignment : h1Res.interpretation;
        interpretationCandidates = h1Res.candidates;
        structuralEvidence = h1Res.structuralEvidence;
      } else if (modality === "13C_NMR") {
        const c13Res = this.interpretC13NMRSignal(pk.x, pk);
        interpretation =
          pk.userOverride && pk.assignment ? pk.assignment : c13Res.interpretation;
        interpretationCandidates = c13Res.candidates;
        structuralEvidence = c13Res.structuralEvidence;
      } else {
        const msRes = this.interpretMSSignal(
          pk.x,
          normalizedIntensity,
          pk,
          spectrum.peaks,
          spectrum
        );
        interpretation =
          pk.userOverride && pk.assignment ? pk.assignment : msRes.interpretation;
        interpretationCandidates = msRes.candidates;
        structuralEvidence = msRes.structuralEvidence;
      }

      const baseConf =
        detectionSource === "MANUAL"
          ? 0.94
          : detectionSource === "AUTO"
          ? 0.89
          : Math.max(0.68, spectrum.imageCalibration?.confidence ?? 0.8);
      const snrBonus = geom.signalToNoise >= 15 ? 0.04 : geom.signalToNoise < 4 ? -0.08 : 0;
      const confidence = Number(
        Math.max(0.5, Math.min(0.98, pk.confidence ?? baseConf + snrBonus)).toFixed(2)
      );

      const userOverride = Boolean(pk.userOverride || pk.manualEdited || pk.userModified);
      const verified = Boolean(pk.verified || detectionSource === "MANUAL");
      const role = pk.role || pk.signalRole || "ANALYTE";

      const signalQuality: "GOOD" | "MODERATE" | "LOW" =
        geom.signalToNoise >= 8
          ? "GOOD"
          : geom.signalToNoise >= 3.5
          ? "MODERATE"
          : "LOW";

      const normIrIntensity =
        modality === "IR"
          ? ((irIntensity ? String(irIntensity).toUpperCase() : undefined) as
              | "STRONG"
              | "MEDIUM"
              | "WEAK"
              | undefined)
          : undefined;
      const normIrShape =
        modality === "IR"
          ? ((geom.shape ? String(geom.shape).toUpperCase() : undefined) as any)
          : undefined;
      const normIrVib =
        modality === "IR"
          ? ((vibrationType ? String(vibrationType).toUpperCase() : "UNKNOWN") as any)
          : undefined;

      const signalObj: Signal = {
        id: pk.id,
        modality: effectiveModality,
        position: pk.x,
        xUnit:
          spectrum.xUnit ||
          (modality === "IR" ? "cm⁻¹" : modality === "MS" ? "m/z" : "ppm"),
        intensity: pk.y,
        relativeIntensity: normalizedIntensity,
        normalizedIntensity,
        width: geom.width,
        fwhm: geom.fwhm,
        area: geom.area,
        prominence: geom.prominence,
        localBaseline: geom.localBaseline,
        signalToNoise: geom.signalToNoise,
        localContrast: geom.localContrast,
        shape: geom.shape,
        irIntensity: normIrIntensity,
        irShape: normIrShape,
        irVibrationType: normIrVib,
        vibrationType,
        peakType: geom.peakType,
        signalQuality,
        confidence,
        detectionSource,
        interpretation,
        interpretationCandidates,
        structuralEvidence,
        userOverride,
        verified,
        role,
        classificationTag: pk.classificationTag,
      };

      unifiedSignals.push(signalObj);

      enrichedPeaks.push({
        ...pk,
        relativeIntensity: normalizedIntensity,
        normalizedIntensity,
        prominence: geom.prominence,
        width: geom.width,
        fwhm: geom.fwhm,
        area: geom.area,
        localBaseline: geom.localBaseline,
        signalToNoise: geom.signalToNoise,
        localContrast: geom.localContrast,
        shape: geom.shape,
        bandShape: normIrShape || bandShape,
        irIntensity: irIntensity || normIrIntensity,
        vibrationType: vibrationType || normIrVib,
        peakType: geom.peakType,
        signalQuality,
        isBroad:
          geom.shape === "broad" ||
          geom.shape === "very_broad" ||
          geom.shape === "BROAD",
        confidence,
        detectionSource,
        interpretation,
        interpretationCandidates,
        structuralEvidence,
        userOverride,
        verified,
        role,
        signalRole: role,
        assignment: pk.assignment || interpretationCandidates[0]?.assignment || interpretation,
      });
    }

    if (modality === "1H_NMR") {
      const analytePeaks = enrichedPeaks.filter(
        (p) => (p.role || p.signalRole || "ANALYTE") === "ANALYTE"
      );
      const missingInteg = analytePeaks.every(
        (p) => p.integration === undefined || p.integration === null
      );
      if (missingInteg && analytePeaks.length >= 2 && points.length >= 25) {
        const minArea = Math.min(...analytePeaks.map((p) => Math.max(0.05, p.area || 0.1)));
        if (minArea > 0) {
          for (const p of enrichedPeaks) {
            if ((p.role || p.signalRole || "ANALYTE") === "ANALYTE" && p.area) {
              const estH = Math.max(1, Math.min(9, Math.round(p.area / minArea)));
              p.integration = estH;
            }
          }
        }
      }
    }

    return {
      ...spectrum,
      peaks: enrichedPeaks,
      signals: unifiedSignals,
    };
  }
}
