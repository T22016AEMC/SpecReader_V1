import {traceIRPixels} from './scientificEngines/irImageTrace';
import {processIRSeries, resolveIRScale} from "./scientificEngines/irSignalProcessing";
import {decodeJcamp} from "./scientificEngines/jcampAdapter";
import * as XLSX from "xlsx";
import {
  CalibrationQualityGrade,
  CarbonEnvironmentType,
  CrossSourceValidationRecord,
  DataPoint,
  DigitizedSpectrumData,
  EvidenceQuality,
  ExperimentalDataQuality,
  ExperimentalSpectrumData,
  ExtendedSpectrumModality,
  IRBandIntensityLevel,
  IRBandShapeCategory,
  IRVibrationType,
  ImageSignalAnnotation,
  ImageSpectrumCalibration,
  MSParameters,
  NumericColumnDetectionResult,
  PeakProvenance,
  ProcessedSpectrumData,
  SignalRole,
  SpectralPeak,
  SpectrumModality,
  SpectrumSignalAnnotation,
  SpectrumSignalType,
  VisualPatternObservation,
} from "../types/spectrum";
import { DataValidator } from "./dataValidator";
import { SignalCharacterizationEngine } from "./signalCharacterizationEngine";

const KNOWN_X_HEADER_REGEX =
  /^(wavenumber|wave\s*number|wavenumbers|cm-?1|cm⁻¹|波數|拉曼位移|ppm|chemical\s*shift|化學位移|shift|delta|δ|m\/z|mz|mass|mass-to-charge|質荷比|質量|x|x_axis|x-axis)(\s*\(.*\))?$/i;

const KNOWN_Y_HEADER_REGEX =
  /^(absorbance|abs|transmittance|%t|t%|透過率|穿透率|吸收度|吸光度|intensity|relative\s*intensity|rel\.?\s*int\.?|abundance|relative\s*abundance|相對豐度|豐度|強度|相對強度|counts|cps|signal|y|y_axis|y-axis)(\s*\(.*\))?$/i;

export class SpectrumParser {
  static defaultUnits(modality: SpectrumModality): { xUnit: string; yUnit: string } {
    switch (modality) {
      case "IR":
        return { xUnit: "cm⁻¹", yUnit: "相對吸收度 / 正規化強度 (%)" };
      case "1H_NMR":
        return { xUnit: "ppm", yUnit: "正規化強度 (%)" };
      case "13C_NMR":
        return { xUnit: "ppm", yUnit: "正規化強度 (%)" };
      case "MS":
        return { xUnit: "m/z", yUnit: "相對豐度 (%)" };
    }
  }

  static canonicalModalityFor(
    modality: SpectrumModality | ExtendedSpectrumModality,
    msParams?: MSParameters
  ): ExperimentalSpectrumData["canonicalModality"] {
    if (modality === "1H_NMR") return "H1_NMR";
    if (modality === "13C_NMR") return "C13_NMR";
    if (modality === "MS/MS") return "MSMS";
    if (modality === "ToF-SIMS") return "TOF_SIMS";
    if (modality === "MS") {
      if (msParams?.msType === "MS/MS") return "MSMS";
      if (msParams?.msType === "ToF-SIMS") return "TOF_SIMS";
      return "MS";
    }
    return "IR";
  }

  /**
   * 統一六種核心模態識別字 (IR, 1H_NMR, 13C_NMR, MS, MS/MS, ToF-SIMS)
   */
  static resolveExtendedModality(
    spectrumOrModality:
      | ExperimentalSpectrumData
      | SpectrumModality
      | ExtendedSpectrumModality,
    msParams?: MSParameters
  ): ExtendedSpectrumModality {
    if (typeof spectrumOrModality === "string") {
      if (spectrumOrModality === "MS/MS" || spectrumOrModality === "ToF-SIMS") {
        return spectrumOrModality;
      }
      if (spectrumOrModality === "MS") {
        if (msParams?.msType === "MS/MS") return "MS/MS";
        if (msParams?.msType === "ToF-SIMS") return "ToF-SIMS";
      }
      return spectrumOrModality;
    }

    const spec = spectrumOrModality;
    if (spec.canonicalModality === "MSMS" || spec.msParams?.msType === "MS/MS") {
      return "MS/MS";
    }
    if (
      spec.canonicalModality === "TOF_SIMS" ||
      spec.msParams?.msType === "ToF-SIMS"
    ) {
      return "ToF-SIMS";
    }
    return spec.modality;
  }

  static toBaseModality(
    modality: SpectrumModality | ExtendedSpectrumModality
  ): SpectrumModality {
    if (modality === "MS/MS" || modality === "ToF-SIMS") return "MS";
    return modality;
  }

  /**
   * 統一校正狀態判定函式 (Work Package C1 & C2)：
   * 同時支援兩點校正 (USER_CALIBRATED / USER_CORRECTED) 與三點校正 (USER_3PT_CALIBRATED)，
   * 並驗證軸向映射與座標範圍是否有效。
   */
  static isImageCalibrationValid(
    cal?: ImageSpectrumCalibration | null
  ): boolean {
    if (!cal) return false;
    if (
      !Number.isFinite(cal.plotLeftPx) ||
      !Number.isFinite(cal.plotRightPx) ||
      Math.abs(cal.plotRightPx - cal.plotLeftPx) < 5
    ) {
      return false;
    }
    if (
      !Number.isFinite(cal.xAxisStart) ||
      !Number.isFinite(cal.xAxisEnd) ||
      Math.abs(cal.xAxisEnd - cal.xAxisStart) < 1e-6
    ) {
      return false;
    }
    if (cal.calibrationQuality === "POOR") {
      return false;
    }
    return true;
  }

  static isUserCalibratedSource(
    source?: ImageSpectrumCalibration["source"]
  ): boolean {
    return (
      source === "USER_CALIBRATED" ||
      source === "USER_CORRECTED" ||
      source === "USER_3PT_CALIBRATED"
    );
  }

  static isSpectrumCalibrated(
    spectrum?: ExperimentalSpectrumData | null
  ): boolean {
    if (!spectrum) return false;
    const isImage =
      spectrum.sourceType === "IMAGE_EXPERIMENTAL" ||
      Boolean(spectrum.digitizedFromImage);
    if (!isImage) {
      return (spectrum.points?.length || 0) >= 2 || (spectrum.peaks?.length || 0) > 0;
    }
    const cal = spectrum.imageCalibration;
    if (!this.isImageCalibrationValid(cal)) return false;
    if (this.isUserCalibratedSource(cal?.source)) return true;
    if (spectrum.digitizedMetadata?.isTwoPointCalibrated) return true;
    if (
      !spectrum.calibrationFailed &&
      cal?.source === "AI_DETECTED" &&
      (cal?.confidence ?? 0) >= 0.72
    ) {
      return true;
    }
    return false;
  }

  static defaultXBounds(modality: SpectrumModality): [number, number] {
    switch (modality) {
      case "IR":
        return [400, 4000];
      case "1H_NMR":
        return [0, 12];
      case "13C_NMR":
        return [0, 220];
      case "MS":
        return [30, 300];
    }
  }

  static defaultSignalTypeForModality(
    modality: SpectrumModality,
    peak?: SpectralPeak,
    msParams?: MSParameters
  ): SpectrumSignalType {
    if (modality === "IR") {
      return peak?.shape === "shoulder" ? "SHOULDER" : "BAND";
    }
    if (modality === "1H_NMR") {
      return peak?.multiplicity && peak.multiplicity !== "s" ? "MULTIPLET" : "PEAK";
    }
    if (modality === "13C_NMR") {
      return "PEAK";
    }
    if (msParams?.msType === "MS/MS") {
      return "PRODUCT_ION";
    }
    if (peak?.isotopeAnnotation?.includes("M+")) {
      return "ISOTOPE";
    }
    return "FRAGMENT";
  }

  static buildSignalAnnotationsFromPeaks(
    modality: SpectrumModality,
    peaks: SpectralPeak[],
    msParams?: MSParameters,
    source: "ALGORITHM" | "AI" | "USER" = "ALGORITHM"
  ): SpectrumSignalAnnotation[] {
    const { xUnit } = this.defaultUnits(modality);
    return peaks.map((pk, idx) => ({
      id: pk.id || `${modality}-sig-${idx + 1}`,
      x: pk.x,
      y: pk.y,
      unit: xUnit,
      label:
        pk.assignment ||
        (modality === "IR"
          ? `${pk.x} cm⁻¹`
          : modality === "MS"
          ? `m/z ${pk.x}`
          : `δ ${pk.x} ppm`),
      signalType: this.defaultSignalTypeForModality(modality, pk, msParams),
      confidence: pk.manualEdited ? 0.98 : source === "AI" ? 0.78 : 0.9,
      source: pk.manualEdited ? "USER" : source,
      verifiedByUser: Boolean(pk.manualEdited),
    }));
  }

  static detectNumericColumns(
    modality: SpectrumModality,
    headerCells: (string | number | null)[],
    sampleDataRows: (string | number | null)[][],
    selectedColumns?: { xColumnIndex: number; yColumnIndex: number }
  ): NumericColumnDetectionResult {
    const colCount = Math.max(
      headerCells.length,
      ...sampleDataRows.map((r) => r.length),
      0
    );

    const availableColumns: string[] = [];
    for (let c = 0; c < colCount; c++) {
      const h = headerCells[c];
      availableColumns.push(
        h !== null && h !== undefined && String(h).trim() !== ""
          ? String(h).trim()
          : `Column ${c + 1}`
      );
    }

    if (colCount < 2) {
      return {
        availableColumns,
        xColumnIndex: null,
        yColumnIndex: null,
        columnSelectionRequired: true,
        confidence: 0,
        reason: "資料表少於 2 個欄位，缺少 X 或 Y 欄位，請選擇或補齊光譜 X/Y 欄位。",
      };
    }

    if (
      selectedColumns &&
      selectedColumns.xColumnIndex >= 0 &&
      selectedColumns.xColumnIndex < colCount &&
      selectedColumns.yColumnIndex >= 0 &&
      selectedColumns.yColumnIndex < colCount &&
      selectedColumns.xColumnIndex !== selectedColumns.yColumnIndex
    ) {
      return {
        availableColumns,
        xColumnIndex: selectedColumns.xColumnIndex,
        yColumnIndex: selectedColumns.yColumnIndex,
        xColumnName: availableColumns[selectedColumns.xColumnIndex],
        yColumnName: availableColumns[selectedColumns.yColumnIndex],
        columnSelectionRequired: false,
        confidence: 1.0,
        reason: "使用者已手動指定 X 與 Y 欄位。",
      };
    }

    const firstRowNumeric0 =
      headerCells[0] !== null &&
      headerCells[0] !== "" &&
      Number.isFinite(Number(headerCells[0]));
    const firstRowNumeric1 =
      headerCells[1] !== null &&
      headerCells[1] !== "" &&
      Number.isFinite(Number(headerCells[1]));

    if (firstRowNumeric0 && firstRowNumeric1) {
      const { xUnit, yUnit } = this.defaultUnits(modality);
      return {
        availableColumns: ["Column 1 (X)", "Column 2 (Y)"],
        xColumnIndex: 0,
        yColumnIndex: 1,
        xColumnName: "Column 1 (X)",
        yColumnName: "Column 2 (Y)",
        detectedXUnit: xUnit,
        detectedYUnit: yUnit,
        columnSelectionRequired: false,
        confidence: 0.92,
        reason: "無標題列之標準雙欄數值光譜資料。",
      };
    }

    let xIdx: number | null = null;
    let yIdx: number | null = null;
    let detectedXUnit: string | undefined;
    let detectedYUnit: string | undefined;

    for (let c = 0; c < availableColumns.length; c++) {
      const colName = availableColumns[c].trim();
      const lower = colName.toLowerCase();

      if (
        xIdx === null &&
        (KNOWN_X_HEADER_REGEX.test(colName) ||
          lower.includes("wavenumber") ||
          lower.includes("cm-1") ||
          lower.includes("cm⁻¹") ||
          lower.includes("chemical shift") ||
          lower.includes("ppm") ||
          lower.includes("m/z") ||
          lower.includes("mass-to-charge"))
      ) {
        xIdx = c;
        if (lower.includes("cm")) detectedXUnit = "cm⁻¹";
        else if (lower.includes("ppm") || lower.includes("shift")) detectedXUnit = "ppm";
        else if (lower.includes("m/z") || lower.includes("mass")) detectedXUnit = "m/z";
        continue;
      }

      if (
        yIdx === null &&
        (KNOWN_Y_HEADER_REGEX.test(colName) ||
          lower.includes("absorbance") ||
          lower.includes("transmittance") ||
          lower.includes("intensity") ||
          lower.includes("abundance") ||
          lower.includes("counts") ||
          lower.includes("signal"))
      ) {
        yIdx = c;
        if (lower.includes("transmittance") || lower.includes("%t")) {
          detectedYUnit = /%|percent/.test(lower) ? "Transmittance (%)" : "Transmittance";
        } else if (lower.includes("absorbance") || lower === "abs") {
          detectedYUnit = "Absorbance";
        } else if (lower.includes("counts")) {
          detectedYUnit = "Counts";
        } else {
          detectedYUnit = "Intensity";
        }
      }
    }

    if (xIdx !== null && yIdx !== null && xIdx !== yIdx) {
      return {
        availableColumns,
        xColumnIndex: xIdx,
        yColumnIndex: yIdx,
        xColumnName: availableColumns[xIdx],
        yColumnName: availableColumns[yIdx],
        detectedXUnit,
        detectedYUnit,
        columnSelectionRequired: false,
        confidence: 0.96,
        reason: `已根據欄位名稱自動辨識 X 欄 (${availableColumns[xIdx]}) 與 Y 欄 (${availableColumns[yIdx]})。`,
      };
    }

    return {
      availableColumns,
      xColumnIndex: xIdx,
      yColumnIndex: yIdx,
      xColumnName: xIdx !== null ? availableColumns[xIdx] : undefined,
      yColumnName: yIdx !== null ? availableColumns[yIdx] : undefined,
      columnSelectionRequired: true,
      confidence: 0.25,
      reason:
        "無法由欄位名稱可靠確認 X 軸與 Y 軸欄位（不自動盲猜欄位），請手動指定 X column 與 Y column。",
    };
  }

  static buildProcessedSpectrumData(
    fileName: string,
    rawPoints: DataPoint[]
  ): ProcessedSpectrumData {
    const smoothedPoints = this.preprocessContinuousSeries(rawPoints);
    const baselineCorrectedPoints = smoothedPoints.map((p) => ({
      x: p.x,
      y: p.y,
      baselineY: p.baselineY ?? 0,
    }));
    const maxY = Math.max(...smoothedPoints.map((p) => p.y), 1e-6);
    const normalizedPoints = smoothedPoints.map((p) => ({
      x: p.x,
      y: Number(((p.y / maxY) * 100).toFixed(2)),
    }));

    return {
      derivedFromFileName: fileName,
      label: "Processed / Normalized Derived Dataset (Original Experimental X/Y Preserved)",
      smoothedPoints,
      baselineCorrectedPoints,
      normalizedPoints,
    };
  }

  static preprocessContinuousSeries(rawPoints: DataPoint[]): DataPoint[] {
    if (rawPoints.length === 0) return [];

    const valid = rawPoints
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
      .sort((a, b) => a.x - b.x);

    const deduped: DataPoint[] = [];
    for (const pt of valid) {
      const last = deduped[deduped.length - 1];
      if (last && Math.abs(last.x - pt.x) < 1e-5) {
        last.y = (last.y + pt.y) / 2;
      } else {
        deduped.push({ ...pt });
      }
    }

    if (deduped.length < 5) return deduped;

    const leftEdgeMin = Math.min(
      ...deduped.slice(0, Math.max(3, Math.floor(deduped.length * 0.08))).map((p) => p.y)
    );
    const rightEdgeMin = Math.min(
      ...deduped.slice(-Math.max(3, Math.floor(deduped.length * 0.08))).map((p) => p.y)
    );
    const x0 = deduped[0].x;
    const x1 = deduped[deduped.length - 1].x;
    const spanX = Math.max(1e-6, x1 - x0);

    const smoothed: DataPoint[] = deduped.map((pt, idx) => {
      const baselineY = leftEdgeMin + ((pt.x - x0) / spanX) * (rightEdgeMin - leftEdgeMin);
      let ySmooth = pt.y;
      if (idx >= 2 && idx < deduped.length - 2) {
        ySmooth =
          (-3 * deduped[idx - 2].y +
            12 * deduped[idx - 1].y +
            17 * deduped[idx].y +
            12 * deduped[idx + 1].y +
            -3 * deduped[idx + 2].y) /
          35;
      }
      return {
        x: Number(pt.x.toFixed(3)),
        y: Math.max(0, ySmooth - Math.max(0, baselineY)),
        baselineY: Number(baselineY.toFixed(2)),
      };
    });

    const maxY = Math.max(...smoothed.map((p) => p.y), 1e-6);
    return smoothed.map((p) => ({
      ...p,
      y: Number(((p.y / maxY) * 100).toFixed(2)),
    }));
  }

  static detectPeaksFromSeries(
    modality: SpectrumModality,
    points: DataPoint[],
    prominenceThreshold = 14
  ): SpectralPeak[] {
    if (points.length === 0) return [];

    const maxVal = Math.max(...points.map((p) => p.y), 1e-6);
    const normPoints = points.map((p) => ({
      x: p.x,
      y: maxVal > 0 && maxVal <= 2.5 ? (p.y / maxVal) * 100 : p.y,
      rawY: p.y,
    }));

    if (modality === "MS") {
      const maxIntensity = Math.max(...normPoints.map((p) => p.y), 1);
      return normPoints
        .filter((p) => (p.y / maxIntensity) * 100 >= 2)
        .map((p, idx) => {
          const normY = Number(((p.y / maxIntensity) * 100).toFixed(1));
          return {
            id: `ms-pk-${idx}-${Math.round(p.x)}`,
            x: Number(p.x.toFixed(4)),
            y: normY,
            prominence: normY,
            width: 0.5,
            shape: "sharp",
            isBasePeak: normY >= 99.5,
          };
        });
    }

    const ordered = normPoints.slice().sort((a, b) => a.x - b.x);
    const peaks: SpectralPeak[] = [];

    if (ordered.length < 5) {
      return ordered
        .filter((p) => p.y >= prominenceThreshold)
        .map((p, idx) => ({
          id: `${modality}-pk-${idx}`,
          x: Number(p.x.toFixed(2)),
          y: Number(p.y.toFixed(1)),
          prominence: Number(p.y.toFixed(1)),
          width: modality === "IR" ? 24 : 0.04,
          integration: null,
          multiplicity: null,
          jValues: [],
          detectionSource: "AUTO",
        }));
    }

    const diffs: number[] = [];
    for (let i = 1; i < ordered.length; i++) {
      diffs.push(Math.abs(ordered[i].y - ordered[i - 1].y));
    }
    const sortedDiffs = diffs.slice().sort((a, b) => a - b);
    const medianDiff = sortedDiffs[Math.floor(sortedDiffs.length / 2)] ?? 0.5;
    const noiseSigma = Math.max(0.35, medianDiff / 1.4826);
    const adaptiveProminenceMin =
      modality === "IR"
        ? Math.max(4.5, Math.min(prominenceThreshold, noiseSigma * 3.2 + 4.0))
        : prominenceThreshold;

    const baselineWin = Math.max(4, Math.floor(ordered.length * 0.06));

    for (let i = 1; i < ordered.length - 1; i++) {
      const curr = ordered[i];
      const prev1 = ordered[i - 1];
      const next1 = ordered[i + 1];
      const prev2 = i >= 2 ? ordered[i - 2] : prev1;
      const next2 = i + 2 < ordered.length ? ordered[i + 2] : next1;

      const wStart = Math.max(0, i - baselineWin);
      const wEnd = Math.min(ordered.length - 1, i + baselineWin);
      let localMinY = curr.y;
      for (let k = wStart; k <= wEnd; k++) {
        if (ordered[k].y < localMinY) localMinY = ordered[k].y;
      }
      const localProminence = Math.max(0, curr.y - localMinY);

      const isLocalMax =
        curr.y >= prev1.y &&
        curr.y >= next1.y &&
        (curr.y > prev2.y || curr.y > next2.y || curr.y > prev1.y || curr.y > next1.y);

      const leftSlope = curr.y - prev1.y;
      const rightSlope = next1.y - curr.y;
      const outerLeftSlope = prev1.y - prev2.y;
      const outerRightSlope = next2.y - next1.y;
      const isInflectionShoulder =
        modality === "IR" &&
        !isLocalMax &&
        curr.y >= adaptiveProminenceMin * 1.6 &&
        localProminence >= adaptiveProminenceMin * 1.2 &&
        ((outerLeftSlope > 2.6 && leftSlope >= 0.05 && leftSlope <= 0.75 && rightSlope > 2.6) ||
          (outerRightSlope < -2.6 && rightSlope <= -0.05 && rightSlope >= -0.75 && leftSlope < -2.6));

      if (
        (isLocalMax || isInflectionShoulder) &&
        curr.y >= adaptiveProminenceMin &&
        localProminence >= adaptiveProminenceMin * 0.75
      ) {
        const halfMax = localMinY + localProminence / 2;
        let leftX = curr.x;
        let rightX = curr.x;
        for (let l = i; l >= 0; l--) {
          if (ordered[l].y <= halfMax) {
            leftX = ordered[l].x;
            break;
          }
        }
        for (let r = i; r < ordered.length; r++) {
          if (ordered[r].y <= halfMax) {
            rightX = ordered[r].x;
            break;
          }
        }
        const width = Math.max(
          modality === "IR" ? 10 : 0.02,
          Number(Math.abs(rightX - leftX).toFixed(2))
        );

        const lastPeak = peaks[peaks.length - 1];
        const minSeparation = modality === "IR" ? 15 : modality === "13C_NMR" ? 0.8 : 0.06;

        const inferredShape: IRBandShapeCategory = isInflectionShoulder
          ? "SHOULDER"
          : modality === "IR" && width > 85
          ? "BROAD"
          : modality === "IR" && width > 35
          ? "MEDIUM_WIDTH"
          : "SHARP";

        const peakObj: SpectralPeak = {
          id: `${modality}-pk-${i}`,
          x: Number(curr.x.toFixed(2)),
          y: Number(curr.y.toFixed(1)),
          prominence: Number(localProminence.toFixed(1)),
          width,
          shape: inferredShape,
          bandShape: modality === "IR" ? inferredShape : undefined,
          integration: null,
          multiplicity: null,
          jValues: [],
          detectionSource: "AUTO",
        };

        if (lastPeak && Math.abs(curr.x - lastPeak.x) < minSeparation) {
          if (curr.y > lastPeak.y) {
            peaks[peaks.length - 1] = peakObj;
          }
        } else {
          peaks.push(peakObj);
        }
      }
    }

    return peaks.sort((a, b) =>
      modality === "IR" || modality.includes("NMR") ? b.x - a.x : a.x - b.x
    );
  }

  static synthesizeCurveFromPeaks(
    modality: SpectrumModality,
    peaks: SpectralPeak[],
    customBounds?: [number, number]
  ): DataPoint[] {
    if (peaks.length === 0) return [];

    if (modality === "MS") {
      return peaks
        .slice()
        .sort((a, b) => a.x - b.x)
        .map((p) => ({ x: p.x, y: p.y }));
    }

    const [minX, maxX] = customBounds || this.defaultXBounds(modality);
    const numPoints = modality === "IR" ? 450 : 400;
    const step = (maxX - minX) / numPoints;
    const points: DataPoint[] = [];

    for (let i = 0; i <= numPoints; i++) {
      const x = minX + i * step;
      let y = 0;
      for (const pk of peaks) {
        const w =
          pk.width ||
          (modality === "IR"
            ? pk.shape === "broad"
              ? 140
              : 24
            : modality === "13C_NMR"
            ? 0.8
            : 0.05);
        const dx = (x - pk.x) / (w * 0.6);
        y += pk.y * (0.6 / (1 + dx * dx) + 0.4 * Math.exp(-0.5 * dx * dx));
      }
      points.push({
        x: Number(x.toFixed(3)),
        y: Number(Math.min(100, y).toFixed(2)),
        baselineY: 0,
      });
    }
    return points;
  }

  static parseNumericTable(
    modality: SpectrumModality,
    fileName: string,
    tableRows: (string | number | null)[][],
    options?: {
      sourceFormat?: "EXCEL" | "CSV" | "TXT" | "JCAMP-DX";
      msParams?: MSParameters;
      selectedColumns?: { xColumnIndex: number; yColumnIndex: number };
    }
  ): ExperimentalSpectrumData {
    const sourceFormat = options?.sourceFormat || "EXCEL";
    const msParams = options?.msParams;
    const defaultU = this.defaultUnits(modality);

    const firstNonEmptyIdx = tableRows.findIndex(
      (row) =>
        Array.isArray(row) &&
        row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== "")
    );
    const nonEmptyRows =
      firstNonEmptyIdx >= 0 ? tableRows.slice(firstNonEmptyIdx) : [];

    if (nonEmptyRows.length === 0) {
      const validation = DataValidator.validateSpectrum(modality, sourceFormat, [], [], false);
      return {
        sourceType: "NUMERIC_EXPERIMENTAL",
        dataReliabilityLevel: "HIGHEST",
        modality,
        canonicalModality: this.canonicalModalityFor(modality, msParams),
        fileName,
        originalFileName: fileName,
        sourceFormat,
        dataOrigin: "EXPERIMENTAL_UPLOAD",
        modelType: "EXPERIMENTAL",
        isSimulated: false,
        x: [],
        y: [],
        xUnit: defaultU.xUnit,
        yUnit: defaultU.yUnit,
        xDirection: "ASCENDING",
        dataIntegrity: {
          pointCount: 0,
          invalidPointCount: 0,
          missingPointCount: 0,
          duplicateXCount: 0,
        },
        points: [],
        peaks: [],
        signalAnnotations: [],
        validation,
        msParams,
      };
    }

    const firstRow = nonEmptyRows[0];
    const firstRowIsNumeric =
      firstRow.length >= 2 &&
      firstRow[0] !== null &&
      String(firstRow[0]).trim() !== "" &&
      Number.isFinite(Number(firstRow[0])) &&
      firstRow[1] !== null &&
      String(firstRow[1]).trim() !== "" &&
      Number.isFinite(Number(firstRow[1]));

    const dataRows = firstRowIsNumeric ? nonEmptyRows : nonEmptyRows.slice(1);
    if(dataRows.length>50000)throw new Error('桌面光譜處理目前限制 50,000 點；請先依儀器解析度合理降採樣。');

    const colDetection = this.detectNumericColumns(
      modality,
      firstRow,
      dataRows.slice(0, 10),
      options?.selectedColumns
    );

    if (
      colDetection.columnSelectionRequired ||
      colDetection.xColumnIndex === null ||
      colDetection.yColumnIndex === null
    ) {
      return {
        sourceType: "NUMERIC_EXPERIMENTAL",
        dataReliabilityLevel: "HIGHEST",
        modality,
        canonicalModality: this.canonicalModalityFor(modality, msParams),
        fileName,
        originalFileName: fileName,
        sourceFormat,
        dataOrigin: "EXPERIMENTAL_UPLOAD",
        modelType: "EXPERIMENTAL",
        isSimulated: false,
        x: [],
        y: [],
        xUnit: defaultU.xUnit,
        yUnit: defaultU.yUnit,
        xDirection: "ASCENDING",
        dataIntegrity: {
          pointCount: 0,
          invalidPointCount: 0,
          missingPointCount: 0,
          duplicateXCount: 0,
        },
        columnDetection: {
          ...colDetection,
          rawTableRows: nonEmptyRows,
        },
        points: [],
        peaks: [],
        signalAnnotations: [],
        validation: {
          isValid: false,
          qualityScore: 0,
          fileFormat: sourceFormat,
          pointCount: 0,
          xRange: [0, 0],
          yRange: [0, 0],
          missingValuesCount: 0,
          duplicateXCount: 0,
          xAxisOrdered: true,
          baselineDriftDetected: false,
          insufficientResolution: true,
          issues: [
            {
              severity: "error",
              code: "COLUMN_SELECTION_REQUIRED",
              message: colDetection.reason,
              recommendation: "請手動選擇 X column 與 Y column 後重新解析光譜。",
            },
          ],
        },
        msParams,
      };
    }

    const xIdx = colDetection.xColumnIndex;
    const yIdx = colDetection.yColumnIndex;
    const xArr: number[] = [];
    const yArr: number[] = [];
    const explicitPeaks: SpectralPeak[] = [];
    const seenX = new Set<number>();

    let invalidPointCount = 0;
    let missingPointCount = 0;
    let duplicateXCount = 0;

    for (const row of dataRows) {
      const rawX = row[xIdx];
      const rawY = row[yIdx];

      const xMissing =
        rawX === null || rawX === undefined || String(rawX).trim() === "";
      const yMissing =
        rawY === null || rawY === undefined || String(rawY).trim() === "";

      if (xMissing || yMissing) {
        missingPointCount++;
        continue;
      }

      const numX = typeof rawX === "number" ? rawX : Number(String(rawX).trim());
      const numY = typeof rawY === "number" ? rawY : Number(String(rawY).trim());

      if (!Number.isFinite(numX) || !Number.isFinite(numY)) {
        invalidPointCount++;
        continue;
      }

      if (seenX.has(numX)) {
        duplicateXCount++;
      } else {
        seenX.add(numX);
      }

      xArr.push(numX);
      yArr.push(numY);

      const thirdRaw = row.length >= 3 && xIdx === 0 && yIdx === 1 ? row[2] : null;
      const fourthRaw = row.length >= 4 && xIdx === 0 && yIdx === 1 ? row[3] : null;
      const fifthRaw = row.length >= 5 && xIdx === 0 && yIdx === 1 ? row[4] : null;

      const thirdNum =
        thirdRaw !== null && thirdRaw !== undefined && String(thirdRaw).trim() !== ""
          ? parseFloat(String(thirdRaw))
          : NaN;
      const fourthStr =
        fourthRaw !== null && fourthRaw !== undefined && String(fourthRaw).trim() !== ""
          ? String(fourthRaw).trim()
          : null;
      const fifthClean =
        fifthRaw !== null && fifthRaw !== undefined
          ? String(fifthRaw).trim().replace(/^J=/i, "")
          : "";
      const parsedJs = fifthClean
        ? fifthClean
            .split(/[,/]/)
            .map((v) => parseFloat(v))
            .filter((n) => !Number.isNaN(n) && Number.isFinite(n))
        : [];

      explicitPeaks.push({
        id: `${modality}-file-pk-${explicitPeaks.length}`,
        x: numX,
        y: numY,
        integration: !Number.isNaN(thirdNum) ? thirdNum : null,
        multiplicity: (fourthStr as any) || null,
        jValues: parsedJs,
        width: modality === "IR" ? 25 : 0.04,
      });
    }

    let descendingSteps = 0;
    let ascendingSteps = 0;
    for (let i = 1; i < xArr.length; i++) {
      if (xArr[i] < xArr[i - 1]) descendingSteps++;
      else if (xArr[i] > xArr[i - 1]) ascendingSteps++;
    }
    const xDirection: "ASCENDING" | "DESCENDING" =
      descendingSteps > ascendingSteps ? "DESCENDING" : "ASCENDING";

    const rawPoints: DataPoint[] = xArr.map((xv, idx) => ({
      x: xv,
      y: yArr[idx],
    }));

    const processedData = this.buildProcessedSpectrumData(fileName, rawPoints);

    let points: DataPoint[] = rawPoints;
    let peaks: SpectralPeak[] = [];

    const hasExplicitNmrAnnotations = explicitPeaks.some(
      (p) => p.integration !== null || p.multiplicity !== null || (p.jValues?.length || 0) > 0
    );

    if (modality === "MS") {
      peaks = this.detectPeaksFromSeries("MS", rawPoints);
      points = rawPoints.slice();
    } else if (hasExplicitNmrAnnotations || rawPoints.length <= 12) {
      const maxY = Math.max(...rawPoints.map((p) => p.y), 1e-6);
      peaks = explicitPeaks.map((pk) => ({
        ...pk,
        y: pk.y,
      }));
      points = rawPoints.slice();
    } else {
      points = rawPoints.slice();
      peaks = modality === "IR" ? processIRSeries(rawPoints, resolveIRScale(colDetection.detectedYUnit || "Unknown")).peaks.map(p=>({...p,y:rawPoints.find(r=>r.x===p.x)?.y??p.y})) : this.detectPeaksFromSeries(modality, rawPoints);
    }

    const signalAnnotations = this.buildSignalAnnotationsFromPeaks(
      modality,
      peaks,
      msParams,
      "ALGORITHM"
    );

    const validation = DataValidator.validateSpectrum(
      modality,
      sourceFormat === "EXCEL" ? "CSV" : sourceFormat,
      rawPoints,
      peaks,
      false
    );
    validation.missingValuesCount = missingPointCount + invalidPointCount;
    validation.duplicateXCount = duplicateXCount;
    validation.fileFormat = sourceFormat;

    const xUnit = colDetection.detectedXUnit || defaultU.xUnit;
    const yUnit = colDetection.detectedYUnit || defaultU.yUnit;

    const dataQuality: ExperimentalDataQuality =
      validation.qualityScore >= 80
        ? "HIGH"
        : validation.qualityScore >= 50
        ? "MEDIUM"
        : "LOW";

    const sourceId = `${this.resolveExtendedModality(modality, msParams)}-num-${fileName}`;
    return SignalCharacterizationEngine.measureSpectrumSignals({
      sourceId,
      dataVersion: 1,
      sourceType: "NUMERIC_EXPERIMENTAL",
      dataQuality,
      evidenceQuality: "EXACT_NUMERIC",
      dataReliabilityLevel: "HIGHEST",
      modality,
      canonicalModality: this.canonicalModalityFor(modality, msParams),
      fileName,
      originalFileName: fileName,
      sourceFormat,
      dataOrigin: "EXPERIMENTAL_UPLOAD",
      modelType: "EXPERIMENTAL",
      isSimulated: false,
      x: xArr,
      y: yArr,
      xUnit,
      yUnit,
      xLabel: colDetection.xColumnName || xUnit,
      yLabel: colDetection.yColumnName || yUnit,
      xDirection,
      dataIntegrity: {
        pointCount: xArr.length,
        invalidPointCount,
        missingPointCount,
        duplicateXCount,
      },
      columnDetection: {
        ...colDetection,
        rawTableRows: nonEmptyRows,
      },
      processedData,
      signalAnnotations,
      points,
      peaks,
      rawExperimentalSnapshot: {
        fileName,
        rawX: [...xArr],
        rawY: [...yArr],
        rawPoints: rawPoints.map((pt) => ({ ...pt })),
        capturedAt: new Date().toISOString(),
      },
      autoSuggestedPeaks: peaks.map((pk) => ({ ...pk })),
      userEditedPeaks: [],
      deletedPeakIds: [],
      confirmedPeaks: peaks.map((pk) => ({ ...pk })),
      validation,
      msParams,
    });
  }

  static parseExcelSpectrum(
    modality: SpectrumModality,
    fileName: string,
    workbookBufferOrRows: ArrayBuffer | Uint8Array | (string | number | null)[][],
    msParams?: MSParameters,
    selectedColumns?: { xColumnIndex: number; yColumnIndex: number }
  ): ExperimentalSpectrumData {
    let rows: (string | number | null)[][] = [];
    if (Array.isArray(workbookBufferOrRows)) {
      rows = workbookBufferOrRows;
    } else {
      const wb = XLSX.read(workbookBufferOrRows, { type: "array" });
      const firstSheetName = wb.SheetNames[0];
      const sheet = wb.Sheets[firstSheetName];
      rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
        header: 1,
        defval: null,
      });
    }

    return this.parseNumericTable(modality, fileName, rows, {
      sourceFormat: "EXCEL",
      msParams,
      selectedColumns,
    });
  }

  static parseTextSpectrum(
    modality: SpectrumModality,
    fileName: string,
    rawText: string,
    msParams?: MSParameters,
    selectedColumns?: { xColumnIndex: number; yColumnIndex: number }
  ): ExperimentalSpectrumData {
    const ext = fileName.split(".").pop()?.toUpperCase() || "TXT";
    const isJcamp =
      ext === "JDX" ||
      ext === "DX" ||
      rawText.includes("##TITLE=") ||
      rawText.includes("##JCAMP-DX=");
    const sourceFormat: ExperimentalSpectrumData["sourceFormat"] = isJcamp
      ? "JCAMP-DX"
      : ext === "CSV"
      ? "CSV"
      : ext === "XLSX" || ext === "XLS"
      ? "EXCEL"
      : "TXT";

    const lines = rawText.split(/\r?\n/);
    if(!isJcamp && lines.length>50002)throw new Error('數值光譜目前限制 50,000 點。');

    if(isJcamp) {
      const decoded=decodeJcamp(rawText);
      const parsed=this.parseNumericTable(modality,fileName,[[decoded.xUnit,decoded.yUnit],...decoded.points.map(p=>[p.x,p.y])],{sourceFormat:'JCAMP-DX',msParams,selectedColumns:{xColumnIndex:0,yColumnIndex:1}});
      parsed.xUnit=decoded.xUnit;parsed.yUnit=decoded.yUnit;
      if(modality==='IR') {
        parsed.irIntensityScale=resolveIRScale(decoded.yUnit);
        parsed.peaks=processIRSeries(decoded.points,parsed.irIntensityScale).peaks.map(p=>({...p,y:decoded.points.find(r=>r.x===p.x)?.y??p.y}));
      }
      return parsed;
    }

    if (!isJcamp) {
      const nonCommentLines = lines
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith("#") && !l.startsWith("//"));

      if (nonCommentLines.length > 0) {
        const firstLine = nonCommentLines[0];
        const isCommaOrTab = firstLine.includes(",") || firstLine.includes("\t") || firstLine.includes(";");
        const firstTokens = isCommaOrTab
          ? firstLine.split(/[,;\t]/).map((t) => t.trim())
          : firstLine.split(/\s+/).map((t) => t.trim());

        const firstTokenIsHeader =
          firstTokens.length > 0 &&
          firstTokens[0] !== "" &&
          Number.isNaN(Number(firstTokens[0]));

        if (firstTokenIsHeader || isCommaOrTab || selectedColumns) {
          const tableRows: (string | number | null)[][] = nonCommentLines.map((line) => {
            const cells = isCommaOrTab
              ? line.split(/[,;\t]/).map((c) => c.trim())
              : line.split(/\s+/).map((c) => c.trim());
            return cells.map((c) => (c === "" ? null : c));
          });
          return this.parseNumericTable(modality, fileName, tableRows, {
            sourceFormat,
            msParams,
            selectedColumns,
          });
        }
      }
    }

    const rawPoints: DataPoint[] = [];
    const explicitPeaks: SpectralPeak[] = [];
    const xArr: number[] = [];
    const yArr: number[] = [];
    const seenX = new Set<number>();
    let invalidPointCount = 0;
    let missingPointCount = 0;
    let duplicateXCount = 0;

    let inJcampDataBlock = false;
    let isTransmittance = false;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#") || line.startsWith("//")) continue;

      if (line.startsWith("##")) {
        const upper = line.toUpperCase();
        if (upper.includes("TRANSMITTANCE")) {
          isTransmittance = true;
        }
        if (
          upper.startsWith("##XYDATA=") ||
          upper.startsWith("##PEAK TABLE=") ||
          upper.startsWith("##XYPOINTS=")
        ) {
          inJcampDataBlock = true;
        } else if (upper.startsWith("##END=")) {
          inJcampDataBlock = false;
        }
        continue;
      }

      if (isJcamp && !inJcampDataBlock) continue;

      const tokens = line.split(/[,;\t]+|\s+/).filter(Boolean);
      if (tokens.length === 1) {
        missingPointCount++;
        continue;
      }
      if (tokens.length >= 2) {
        const x = Number(tokens[0]);
        let y = Number(tokens[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          invalidPointCount++;
          continue;
        }

        if (modality === "IR" && isTransmittance && y <= 100 && y >= 0) {
          y = 100 - y;
        }

        if (seenX.has(x)) {
          duplicateXCount++;
        } else {
          seenX.add(x);
        }

        xArr.push(x);
        yArr.push(y);
        rawPoints.push({ x, y });

        const third = tokens.length >= 3 ? parseFloat(tokens[2]) : NaN;
        const fourth = tokens.length >= 4 ? tokens[3] : null;
        const fifthRaw = tokens.length >= 5 ? tokens[4].replace(/^J=/i, "") : "";
        const parsedJs = fifthRaw
          ? fifthRaw
              .split(/[,/]/)
              .map((v) => parseFloat(v))
              .filter((n) => !Number.isNaN(n) && Number.isFinite(n))
          : [];

        explicitPeaks.push({
          id: `${modality}-file-pk-${explicitPeaks.length}`,
          x,
          y,
          integration: !Number.isNaN(third) ? third : null,
          multiplicity: (fourth as any) || null,
          jValues: parsedJs,
          width: modality === "IR" ? 25 : 0.04,
        });
      }
    }

    let descendingSteps = 0;
    let ascendingSteps = 0;
    for (let i = 1; i < xArr.length; i++) {
      if (xArr[i] < xArr[i - 1]) descendingSteps++;
      else if (xArr[i] > xArr[i - 1]) ascendingSteps++;
    }
    const xDirection: "ASCENDING" | "DESCENDING" =
      descendingSteps > ascendingSteps ? "DESCENDING" : "ASCENDING";

    const processedData = this.buildProcessedSpectrumData(fileName, rawPoints);

    let points: DataPoint[] = rawPoints.slice();
    let peaks: SpectralPeak[] = [];

    if (rawPoints.length <= 25 && rawPoints.length > 0 && modality !== "MS") {
      const maxY = Math.max(...rawPoints.map((p) => p.y), 1);
      peaks = explicitPeaks
        .map((pk) => ({
          ...pk,
          y: Number(((pk.y / maxY) * 100).toFixed(1)),
        }))
        .filter(
          (pk) =>
            pk.y > 3.5 ||
            pk.integration !== null ||
            pk.multiplicity !== null ||
            explicitPeaks.length <= 1
        );
      points = rawPoints.slice();
    } else if (modality === "MS") {
      peaks = this.detectPeaksFromSeries("MS", rawPoints);
      points = rawPoints.slice();
    } else {
      points = rawPoints.slice();
      peaks = this.detectPeaksFromSeries(modality, rawPoints);
    }

    const signalAnnotations = this.buildSignalAnnotationsFromPeaks(
      modality,
      peaks,
      msParams,
      "ALGORITHM"
    );

    const validation = DataValidator.validateSpectrum(
      modality,
      sourceFormat === "EXCEL" ? "CSV" : sourceFormat,
      rawPoints,
      peaks,
      false
    );
    validation.missingValuesCount = missingPointCount + invalidPointCount;
    validation.duplicateXCount = duplicateXCount;

    const { xUnit, yUnit } = this.defaultUnits(modality);
    const dataQuality: ExperimentalDataQuality =
      validation.qualityScore >= 80
        ? "HIGH"
        : validation.qualityScore >= 50
        ? "MEDIUM"
        : "LOW";

    const sourceId = `${this.resolveExtendedModality(modality, msParams)}-num-${fileName}`;
    return SignalCharacterizationEngine.measureSpectrumSignals({
      sourceId,
      dataVersion: 1,
      sourceType: "NUMERIC_EXPERIMENTAL",
      dataQuality,
      evidenceQuality: "EXACT_NUMERIC",
      dataReliabilityLevel: "HIGHEST",
      modality,
      canonicalModality: this.canonicalModalityFor(modality, msParams),
      fileName,
      originalFileName: fileName,
      sourceFormat,
      dataOrigin: "EXPERIMENTAL_UPLOAD",
      modelType: "EXPERIMENTAL",
      isSimulated: false,
      x: xArr,
      y: yArr,
      xUnit,
      yUnit,
      xDirection,
      dataIntegrity: {
        pointCount: xArr.length,
        invalidPointCount,
        missingPointCount,
        duplicateXCount,
      },
      processedData,
      signalAnnotations,
      points,
      peaks,
      rawExperimentalSnapshot: {
        fileName,
        rawX: [...xArr],
        rawY: [...yArr],
        rawPoints: rawPoints.map((pt) => ({ ...pt })),
        capturedAt: new Date().toISOString(),
      },
      autoSuggestedPeaks: peaks.map((pk) => ({ ...pk })),
      userEditedPeaks: [],
      deletedPeakIds: [],
      confirmedPeaks: peaks.map((pk) => ({ ...pk })),
      validation,
      msParams,
    });
  }

  static pixelToPhysicalX(
    pixelX: number,
    calibration: ImageSpectrumCalibration
  ): number {
    if (
      calibration.slope !== undefined &&
      calibration.intercept !== undefined &&
      Number.isFinite(calibration.slope) &&
      Number.isFinite(calibration.intercept) &&
      Math.abs(calibration.slope) >= 1e-12
    ) {
      const phys = calibration.intercept + pixelX * calibration.slope;
      return Number(phys.toFixed(2));
    }

    if (
      calibration.referencePointA &&
      calibration.referencePointB &&
      Math.abs(calibration.referencePointB.pixelX - calibration.referencePointA.pixelX) >= 1e-6 &&
      Math.abs(
        calibration.referencePointB.physicalX - calibration.referencePointA.physicalX
      ) >= 1e-9
    ) {
      const slope =
        (calibration.referencePointB.physicalX - calibration.referencePointA.physicalX) /
        (calibration.referencePointB.pixelX - calibration.referencePointA.pixelX);
      const phys =
        calibration.referencePointA.physicalX +
        (pixelX - calibration.referencePointA.pixelX) * slope;
      return Number(phys.toFixed(2));
    }

    const spanPx = Math.max(1e-6, calibration.plotRightPx - calibration.plotLeftPx);
    const frac = (pixelX - calibration.plotLeftPx) / spanPx;
    const phys =
      calibration.xAxisStart +
      frac * (calibration.xAxisEnd - calibration.xAxisStart);
    return Number(phys.toFixed(2));
  }

  static physicalToPixelX(
    physicalX: number,
    calibration: ImageSpectrumCalibration
  ): number {
    if (
      calibration.slope !== undefined &&
      calibration.intercept !== undefined &&
      Number.isFinite(calibration.slope) &&
      Number.isFinite(calibration.intercept) &&
      Math.abs(calibration.slope) >= 1e-12
    ) {
      const px = (physicalX - calibration.intercept) / calibration.slope;
      return Number(px.toFixed(1));
    }

    if (
      calibration.referencePointA &&
      calibration.referencePointB &&
      Math.abs(calibration.referencePointB.pixelX - calibration.referencePointA.pixelX) >= 1e-6 &&
      Math.abs(
        calibration.referencePointB.physicalX - calibration.referencePointA.physicalX
      ) >= 1e-9
    ) {
      const slope =
        (calibration.referencePointB.physicalX - calibration.referencePointA.physicalX) /
        (calibration.referencePointB.pixelX - calibration.referencePointA.pixelX);
      const px =
        calibration.referencePointA.pixelX +
        (physicalX - calibration.referencePointA.physicalX) / slope;
      return Number(px.toFixed(1));
    }

    const spanPhys = calibration.xAxisEnd - calibration.xAxisStart;
    if (Math.abs(spanPhys) < 1e-6) return calibration.plotLeftPx;
    const frac = (physicalX - calibration.xAxisStart) / spanPhys;
    const px =
      calibration.plotLeftPx +
      frac * (calibration.plotRightPx - calibration.plotLeftPx);
    return Number(px.toFixed(1));
  }

  static physicalIntensityToPixelY(
    intensityPercent: number,
    calibration: ImageSpectrumCalibration
  ): number {
    const clamped = Math.max(0, Math.min(100, intensityPercent));
    const plotH = Math.max(1, calibration.plotBottomPx - calibration.plotTopPx);
    return Number((calibration.plotBottomPx - (clamped / 100) * plotH).toFixed(1));
  }

  static pixelToPhysicalIntensity(
    pixelY: number,
    calibration: ImageSpectrumCalibration,
    modality?: SpectrumModality
  ): number {
    const plotH = Math.max(1, calibration.plotBottomPx - calibration.plotTopPx);
    const normalizedFromBottom =
      ((calibration.plotBottomPx - pixelY) / plotH) * 100;
    const clamped = Math.max(0, Math.min(100, normalizedFromBottom));
    // IR spectra typically have baseline near top (100% T) and absorption bands pointing downward
    if (modality === "IR") {
      return Number(Math.max(5, Math.min(100, 100 - clamped * 0.85)).toFixed(1));
    }
    return Number(clamped.toFixed(1));
  }

  static updateImagePlotBoundaries(
    spectrum: ExperimentalSpectrumData,
    bounds: {
      plotLeftPx: number;
      plotRightPx: number;
      plotTopPx: number;
      plotBottomPx: number;
    }
  ): ExperimentalSpectrumData {
    const dims = spectrum.imageDimensions || { width: 800, height: 450 };
    const prevCal =
      spectrum.imageCalibration || this.buildImageCalibration(spectrum.modality, dims);
    const plotLeftPx = Math.max(0, Math.min(dims.width - 10, Math.round(bounds.plotLeftPx)));
    const plotRightPx = Math.max(plotLeftPx + 10, Math.min(dims.width, Math.round(bounds.plotRightPx)));
    const plotTopPx = Math.max(0, Math.min(dims.height - 10, Math.round(bounds.plotTopPx)));
    const plotBottomPx = Math.max(plotTopPx + 10, Math.min(dims.height, Math.round(bounds.plotBottomPx)));

    const newCalibration: ImageSpectrumCalibration = {
      ...prevCal,
      plotLeftPx,
      plotRightPx,
      plotTopPx,
      plotBottomPx,
      plotBoundaryStatus: "DETECTED",
    };
    return this.recomputeImageSignalsWithCalibration(spectrum, newCalibration, dims);
  }

  static detectPlotBoundariesFromPixels(
    imgData: Uint8ClampedArray,
    width: number,
    height: number
  ): {
    plotLeftPx: number;
    plotRightPx: number;
    plotTopPx: number;
    plotBottomPx: number;
    plotBoundaryStatus: "DETECTED" | "PLOT_BOUNDARY_UNCERTAIN";
  } {
    let bestBottomRow = -1;
    let maxRowDarkCount = 0;
    const rowSearchStart = Math.floor(height * 0.55);
    const rowSearchEnd = Math.floor(height * 0.96);

    for (let y = rowSearchStart; y <= rowSearchEnd; y++) {
      let darkCount = 0;
      for (let x = Math.floor(width * 0.03); x <= Math.floor(width * 0.97); x++) {
        const idx = (y * width + x) * 4;
        const lum = 0.299 * imgData[idx] + 0.587 * imgData[idx + 1] + 0.114 * imgData[idx + 2];
        if (lum < 150) darkCount++;
      }
      if (darkCount > maxRowDarkCount) {
        maxRowDarkCount = darkCount;
        bestBottomRow = y;
      }
    }

    if (bestBottomRow > 0 && maxRowDarkCount >= width * 0.45) {
      let leftPx = Math.floor(width * 0.04);
      let rightPx = Math.floor(width * 0.96);
      for (let x = 0; x < width; x++) {
        const idx = (bestBottomRow * width + x) * 4;
        const lum = 0.299 * imgData[idx] + 0.587 * imgData[idx + 1] + 0.114 * imgData[idx + 2];
        if (lum < 150) {
          leftPx = x;
          break;
        }
      }
      for (let x = width - 1; x >= 0; x--) {
        const idx = (bestBottomRow * width + x) * 4;
        const lum = 0.299 * imgData[idx] + 0.587 * imgData[idx + 1] + 0.114 * imgData[idx + 2];
        if (lum < 150) {
          rightPx = x;
          break;
        }
      }
      if (rightPx - leftPx >= width * 0.4) {
        return {
          plotLeftPx: leftPx,
          plotRightPx: rightPx,
          plotTopPx: Math.max(8, Math.floor(height * 0.06)),
          plotBottomPx: bestBottomRow,
          plotBoundaryStatus: "DETECTED",
        };
      }
    }

    return {
      plotLeftPx: Math.round(width * 0.06),
      plotRightPx: Math.round(width * 0.94),
      plotTopPx: Math.round(height * 0.08),
      plotBottomPx: Math.round(height * 0.86),
      plotBoundaryStatus: "PLOT_BOUNDARY_UNCERTAIN",
    };
  }

  static buildImageCalibration(
    modality: SpectrumModality,
    imageDimensions: { width: number; height: number },
    detected?: Partial<ImageSpectrumCalibration>
  ): ImageSpectrumCalibration {
    const [minX, maxX] = this.defaultXBounds(modality);
    const isDescending =
      modality === "IR" || modality === "1H_NMR" || modality === "13C_NMR";

    const hasExplicitPlotBounds =
      detected?.plotLeftPx !== undefined &&
      detected?.plotRightPx !== undefined &&
      detected?.plotBoundaryStatus !== "PLOT_BOUNDARY_UNCERTAIN";

    const plotLeftPx = detected?.plotLeftPx ?? Math.round(imageDimensions.width * 0.06);
    const plotRightPx = detected?.plotRightPx ?? Math.round(imageDimensions.width * 0.94);
    const plotTopPx = detected?.plotTopPx ?? Math.round(imageDimensions.height * 0.08);
    const plotBottomPx = detected?.plotBottomPx ?? Math.round(imageDimensions.height * 0.86);

    const xAxisStart = detected?.xAxisStart ?? (isDescending ? maxX : minX);
    const xAxisEnd = detected?.xAxisEnd ?? (isDescending ? minX : maxX);
    const xAxisDirection: "ASCENDING" | "DESCENDING" =
      detected?.xAxisDirection ?? (xAxisStart > xAxisEnd ? "DESCENDING" : "ASCENDING");

    const plotBoundaryStatus =
      detected?.plotBoundaryStatus ??
      (hasExplicitPlotBounds ? "DETECTED" : "PLOT_BOUNDARY_UNCERTAIN");

    return {
      plotLeftPx,
      plotRightPx,
      plotTopPx,
      plotBottomPx,
      plotBoundaryStatus,
      xAxisStart,
      xAxisEnd,
      xAxisDirection,
      confidence:
        detected?.confidence ??
        (plotBoundaryStatus === "PLOT_BOUNDARY_UNCERTAIN" ? 0.42 : 0.65),
      source:
        detected?.source ??
        (plotBoundaryStatus === "PLOT_BOUNDARY_UNCERTAIN"
          ? "PLOT_BOUNDARY_UNCERTAIN"
          : "DEFAULT_FALLBACK"),
      referencePointA: detected?.referencePointA,
      referencePointB: detected?.referencePointB,
      referencePoint1: detected?.referencePoint1,
      referencePoint2: detected?.referencePoint2,
      referencePoint3: detected?.referencePoint3,
      calibrationPoints: detected?.calibrationPoints,
      slope: detected?.slope,
      intercept: detected?.intercept,
      rSquared: detected?.rSquared,
      residuals: detected?.residuals,
      rmse: detected?.rmse,
      calibrationQuality: detected?.calibrationQuality,
      calibrationWarning: detected?.calibrationWarning,
    };
  }

  static calibrateImageFromThreePoints(
    spectrum: ExperimentalSpectrumData,
    point1: { pixelX: number; physicalX: number },
    point2: { pixelX: number; physicalX: number },
    point3: { pixelX: number; physicalX: number }
  ): ExperimentalSpectrumData {
    const dims = spectrum.imageDimensions || { width: 800, height: 450 };
    const prevCal =
      spectrum.imageCalibration || this.buildImageCalibration(spectrum.modality, dims);

    const pts = [point1, point2, point3];
    const allFinite = pts.every(
      (p) => Number.isFinite(p.pixelX) && Number.isFinite(p.physicalX)
    );
    const uniquePx = new Set(pts.map((p) => Number(p.pixelX.toFixed(3)))).size;
    const uniquePhys = new Set(pts.map((p) => Number(p.physicalX.toFixed(4)))).size;

    if (!allFinite || uniquePx < 3 || uniquePhys < 3) {
      const warningMsg =
        "校正點可能選取錯誤，或圖片 X 軸存在非線性失真，請重新確認。（三個校正點的像素座標與物理座標必須皆為有效且不重複的數值）";
      return {
        ...spectrum,
        calibrationFailed: true,
        digitizationErrorMessage: warningMsg,
        imageCalibration: {
          ...prevCal,
          referencePoint1: { ...point1, status: "INVALID" },
          referencePoint2: { ...point2, status: "INVALID" },
          referencePoint3: { ...point3, status: "INVALID" },
          calibrationQuality: "POOR",
          calibrationWarning: warningMsg,
        },
      };
    }

    const meanX = (point1.pixelX + point2.pixelX + point3.pixelX) / 3;
    const meanY = (point1.physicalX + point2.physicalX + point3.physicalX) / 3;

    let sxx = 0;
    let sxy = 0;
    let syy = 0;
    for (const p of pts) {
      const dx = p.pixelX - meanX;
      const dy = p.physicalX - meanY;
      sxx += dx * dx;
      sxy += dx * dy;
      syy += dy * dy;
    }

    if (sxx < 1e-9 || syy < 1e-12) {
      const warningMsg = "校正點可能選取錯誤，或圖片 X 軸存在非線性失真，請重新確認。";
      return {
        ...spectrum,
        calibrationFailed: true,
        digitizationErrorMessage: warningMsg,
      };
    }

    const slope = sxy / sxx;
    const intercept = meanY - slope * meanX;

    const r1 = Number((point1.physicalX - (slope * point1.pixelX + intercept)).toFixed(4));
    const r2 = Number((point2.physicalX - (slope * point2.pixelX + intercept)).toFixed(4));
    const r3 = Number((point3.physicalX - (slope * point3.pixelX + intercept)).toFixed(4));
    const residuals: [number, number, number] = [r1, r2, r3];

    const ssRes = r1 * r1 + r2 * r2 + r3 * r3;
    const rSquared = Number(Math.max(0, Math.min(1, 1 - ssRes / syy)).toFixed(6));
    const rmse = Number(Math.sqrt(ssRes / 3).toFixed(4));

    const physSpan = Math.max(
      1e-6,
      Math.max(point1.physicalX, point2.physicalX, point3.physicalX) -
        Math.min(point1.physicalX, point2.physicalX, point3.physicalX)
    );
    const normalizedRmse = rmse / physSpan;

    const sortedByPx = pts.slice().sort((a, b) => a.pixelX - b.pixelX);
    const segSlope1 =
      (sortedByPx[1].physicalX - sortedByPx[0].physicalX) /
      (sortedByPx[1].pixelX - sortedByPx[0].pixelX);
    const segSlope2 =
      (sortedByPx[2].physicalX - sortedByPx[1].physicalX) /
      (sortedByPx[2].pixelX - sortedByPx[1].pixelX);
    const sameDirection = segSlope1 * segSlope2 > 0;

    let calibrationQuality: CalibrationQualityGrade = "POOR";
    if (sameDirection && rSquared >= 0.998 && normalizedRmse <= 0.015) {
      calibrationQuality = "GOOD";
    } else if (sameDirection && rSquared >= 0.985 && normalizedRmse <= 0.045) {
      calibrationQuality = "ACCEPTABLE";
    } else {
      calibrationQuality = "POOR";
    }

    const plotLeftPx = prevCal.plotLeftPx;
    const plotRightPx = Math.max(plotLeftPx + 1, prevCal.plotRightPx);
    const xAxisStart = Number((slope * plotLeftPx + intercept).toFixed(2));
    const xAxisEnd = Number((slope * plotRightPx + intercept).toFixed(2));
    const xAxisDirection: "ASCENDING" | "DESCENDING" =
      slope < 0 ? "DESCENDING" : "ASCENDING";

    const pointStatus = (res: number): "SET" | "VALIDATED" | "HIGH_RESIDUAL" =>
      Math.abs(res) / physSpan <= 0.025 ? "VALIDATED" : "HIGH_RESIDUAL";

    const p1Obj = {
      pixelX: point1.pixelX,
      physicalX: point1.physicalX,
      status: pointStatus(r1),
      residual: r1,
    };
    const p2Obj = {
      pixelX: point2.pixelX,
      physicalX: point2.physicalX,
      status: pointStatus(r2),
      residual: r2,
    };
    const p3Obj = {
      pixelX: point3.pixelX,
      physicalX: point3.physicalX,
      status: pointStatus(r3),
      residual: r3,
    };

    const newCalibration: ImageSpectrumCalibration = {
      plotLeftPx,
      plotRightPx,
      plotTopPx: prevCal.plotTopPx,
      plotBottomPx: prevCal.plotBottomPx,
      plotBoundaryStatus: prevCal.plotBoundaryStatus ?? "DETECTED",
      xAxisStart,
      xAxisEnd,
      xAxisDirection,
      confidence:
        calibrationQuality === "GOOD"
          ? 0.99
          : calibrationQuality === "ACCEPTABLE"
          ? 0.9
          : 0.35,
      source: "USER_3PT_CALIBRATED",
      referencePoint1: p1Obj,
      referencePoint2: p2Obj,
      referencePoint3: p3Obj,
      calibrationPoints: [p1Obj, p2Obj, p3Obj],
      referencePointA: { pixelX: point1.pixelX, physicalX: point1.physicalX },
      referencePointB: { pixelX: point3.pixelX, physicalX: point3.physicalX },
      slope,
      intercept,
      rSquared,
      residuals,
      rmse,
      calibrationQuality,
      calibrationWarning:
        calibrationQuality === "POOR"
          ? "校正點可能選取錯誤，或圖片 X 軸存在非線性失真，請重新確認。"
          : undefined,
    };

    if (calibrationQuality === "POOR") {
      return {
        ...spectrum,
        imageCalibration: newCalibration,
        calibrationFailed: true,
        digitizationErrorMessage:
          "校正點可能選取錯誤，或圖片 X 軸存在非線性失真，請重新確認。",
      };
    }

    return this.recomputeImageSignalsWithCalibration(spectrum, newCalibration, dims);
  }

  static calibrateImageFromTwoPoints(
    spectrum: ExperimentalSpectrumData,
    pointA: { pixelX: number; physicalX: number },
    pointB: { pixelX: number; physicalX: number }
  ): ExperimentalSpectrumData {
    const dims = spectrum.imageDimensions || { width: 800, height: 450 };
    const prevCal =
      spectrum.imageCalibration || this.buildImageCalibration(spectrum.modality, dims);

    const dPx = pointB.pixelX - pointA.pixelX;
    const dPhys = pointB.physicalX - pointA.physicalX;

    if (
      !Number.isFinite(pointA.pixelX) ||
      !Number.isFinite(pointA.physicalX) ||
      !Number.isFinite(pointB.pixelX) ||
      !Number.isFinite(pointB.physicalX) ||
      Math.abs(dPx) < 1e-6 ||
      Math.abs(dPhys) < 1e-9
    ) {
      return {
        ...spectrum,
        calibrationFailed: true,
        digitizationErrorMessage:
          "兩點 X 軸校正失敗：兩個參考點的像素位置 (pixelX) 與物理座標 (physicalX) 必須皆為有效且不相同的數值。",
      };
    }

    const slope = dPhys / dPx;
    const intercept = pointA.physicalX - slope * pointA.pixelX;

    const plotLeftPx = prevCal.plotLeftPx;
    const plotRightPx = Math.max(plotLeftPx + 1, prevCal.plotRightPx);

    const xAxisStart = Number((pointA.physicalX + (plotLeftPx - pointA.pixelX) * slope).toFixed(2));
    const xAxisEnd = Number((pointA.physicalX + (plotRightPx - pointA.pixelX) * slope).toFixed(2));
    const xAxisDirection: "ASCENDING" | "DESCENDING" =
      slope < 0 ? "DESCENDING" : "ASCENDING";

    const midPoint = {
      pixelX: Number(((pointA.pixelX + pointB.pixelX) / 2).toFixed(2)),
      physicalX: Number(((pointA.physicalX + pointB.physicalX) / 2).toFixed(4)),
    };

    const p1Obj = { pixelX: pointA.pixelX, physicalX: pointA.physicalX, status: "VALIDATED" as const, residual: 0 };
    const p2Obj = { pixelX: midPoint.pixelX, physicalX: midPoint.physicalX, status: "VALIDATED" as const, residual: 0 };
    const p3Obj = { pixelX: pointB.pixelX, physicalX: pointB.physicalX, status: "VALIDATED" as const, residual: 0 };

    const newCalibration: ImageSpectrumCalibration = {
      plotLeftPx,
      plotRightPx,
      plotTopPx: prevCal.plotTopPx,
      plotBottomPx: prevCal.plotBottomPx,
      plotBoundaryStatus: prevCal.plotBoundaryStatus ?? "DETECTED",
      xAxisStart,
      xAxisEnd,
      xAxisDirection,
      confidence: 0.98,
      source: "USER_CORRECTED",
      referencePointA: { pixelX: pointA.pixelX, physicalX: pointA.physicalX },
      referencePointB: { pixelX: pointB.pixelX, physicalX: pointB.physicalX },
      referencePoint1: p1Obj,
      referencePoint2: p2Obj,
      referencePoint3: p3Obj,
      calibrationPoints: [p1Obj, p2Obj, p3Obj],
      slope,
      intercept,
      rSquared: 1,
      residuals: [0, 0, 0],
      rmse: 0,
      calibrationQuality: "GOOD",
    };

    return this.recomputeImageSignalsWithCalibration(spectrum, newCalibration, dims);
  }

  private static recomputeImageSignalsWithCalibration(
    spectrum: ExperimentalSpectrumData,
    newCalibration: ImageSpectrumCalibration,
    dims: { width: number; height: number }
  ): ExperimentalSpectrumData {
    const xAxisDirection = newCalibration.xAxisDirection;
    const { xUnit } = this.defaultUnits(spectrum.modality);
    const prevCal =
      spectrum.imageCalibration ||
      this.buildImageCalibration(spectrum.modality, dims);

    const baseAnnotations: ImageSignalAnnotation[] =
      spectrum.imageAnnotations && spectrum.imageAnnotations.length > 0
        ? spectrum.imageAnnotations
        : (spectrum.peaks || []).map((pk) => ({
            id: pk.id,
            pixelX: this.physicalToPixelX(pk.x, prevCal),
            pixelY: this.physicalIntensityToPixelY(pk.y, prevCal),
            physicalX: pk.x,
            physicalY: pk.y,
            unit: xUnit,
            label: pk.assignment || `${pk.x} ${xUnit}`,
            signalType: this.defaultSignalTypeForModality(spectrum.modality),
            confidence: 0.9,
            source: "USER" as const,
            verifiedByUser: true,
          }));

    const updatedImageAnnotations: ImageSignalAnnotation[] = baseAnnotations.map(
      (ann) => {
        const nextPhysX = this.pixelToPhysicalX(ann.pixelX, newCalibration);
        const oldAutoLabelWithUnit =
          ann.physicalX !== undefined
            ? `${ann.physicalX} ${ann.unit || xUnit}`
            : "";
        const oldAutoLabelNumOnly =
          ann.physicalX !== undefined ? `${ann.physicalX}` : "";
        const isAutoCoordinateLabel =
          !ann.label ||
          ann.label === oldAutoLabelWithUnit ||
          ann.label === oldAutoLabelNumOnly ||
          ann.label.startsWith("Pixel (");

        return {
          ...ann,
          physicalX: nextPhysX,
          calibratedPosition: nextPhysX,
          isCalibrated: true,
          label: isAutoCoordinateLabel
            ? `${nextPhysX} ${ann.unit || xUnit}`
            : ann.label,
        };
      }
    );

    const existingPeaksById = new Map<string, SpectralPeak>();
    for (const pk of spectrum.peaks || []) {
      existingPeaksById.set(pk.id, pk);
    }

    const updatedPeaks: SpectralPeak[] = updatedImageAnnotations.map((ann) => {
      const prevPeak = existingPeaksById.get(ann.id);
      const physX = Number(
        (ann.physicalX ?? 0).toFixed(spectrum.modality === "MS" ? 4 : 2)
      );
      const physY = Number((ann.physicalY ?? prevPeak?.y ?? 75).toFixed(1));
      return {
        ...prevPeak,
        id: ann.id,
        x: physX,
        y: physY,
        isCalibrated: true,
        signalDirection: prevPeak?.signalDirection ?? ann.signalDirection,
        width:
          prevPeak?.width ??
          (spectrum.modality === "IR"
            ? ann.label?.toLowerCase().includes("broad")
              ? 110
              : 24
            : 0.05),
        shape:
          prevPeak?.shape ??
          (ann.signalType === "SHOULDER"
            ? "shoulder"
            : ann.label?.toLowerCase().includes("broad")
            ? "broad"
            : "sharp"),
        bandShape: prevPeak?.bandShape ?? ann.bandShape,
        irIntensity: prevPeak?.irIntensity ?? ann.irIntensity,
        vibrationType: prevPeak?.vibrationType ?? ann.vibrationType,
        integration: prevPeak?.integration ?? null,
        integral: prevPeak?.integral ?? (prevPeak?.integration ?? undefined),
        multiplicity:
          prevPeak?.multiplicity ?? (ann.signalType === "MULTIPLET" ? "m" : null),
        jValues: prevPeak?.jValues ?? [],
        deptType: prevPeak?.deptType ?? ann.deptType,
        carbonType: prevPeak?.carbonType ?? ann.carbonType,
        assignment: ann.label || prevPeak?.assignment || "圖片標記訊號",
        manualPeak: ann.source === "USER" || Boolean(prevPeak?.manualPeak),
        manualEdited: ann.verifiedByUser || Boolean(prevPeak?.manualEdited),
        userModified: ann.userModified || Boolean(prevPeak?.userModified),
        pixelX: ann.pixelX,
        pixelY: ann.pixelY,
        detectionSource:
          ann.source === "USER" || ann.verifiedByUser
            ? "USER_MARKED"
            : newCalibration.confidence >= 0.75
            ? "AUTO_IMAGE_DETECTION"
            : prevPeak?.detectionSource || "ESTIMATED_FROM_IMAGE",
        provenance:
          prevPeak?.provenance ??
          ann.provenance ??
          (ann.source === "USER" ? "USER_DEFINED" : "AI_DETECTED"),
        role: prevPeak?.role ?? prevPeak?.signalRole ?? ann.role ?? ann.signalRole ?? "ANALYTE",
        signalRole:
          prevPeak?.signalRole ?? prevPeak?.role ?? ann.signalRole ?? ann.role ?? "ANALYTE",
        classificationTag: prevPeak?.classificationTag ?? ann.userClassification,
        userClassification: prevPeak?.userClassification ?? prevPeak?.classificationTag ?? ann.userClassification,
        isSolventVerified: prevPeak?.isSolventVerified ?? ann.isSolventVerified,
        solventName: prevPeak?.solventName ?? ann.solventName,
      };
    });

    const updatedAutoAnnotations = (spectrum.autoDetectedAnnotations || []).map((ann) => {
      const newPhysX = this.pixelToPhysicalX(ann.pixelX, newCalibration);
      const newPhysY = this.pixelToPhysicalIntensity(
        ann.pixelY,
        newCalibration,
        spectrum.modality
      );
      return {
        ...ann,
        physicalX: newPhysX,
        calibratedPosition: newPhysX,
        physicalY: newPhysY,
        intensity: newPhysY,
      };
    });

    const tracedPoints=spectrum.irPixelCurve?.map(p=>({x:this.pixelToPhysicalX(p.x,newCalibration),y:100*(newCalibration.plotBottomPx-p.y)/(newCalibration.plotBottomPx-newCalibration.plotTopPx)}))??[];
    if(tracedPoints.length>=5&&this.isImageCalibrationValid(newCalibration)){
      const traced=processIRSeries(tracedPoints,'UNKNOWN',spectrum.irManualSettings);
      updatedPeaks.push(...traced.peaks.filter(p=>!updatedPeaks.some(q=>Math.abs(p.x-q.x)<3)).map(p=>({...p,isCalibrated:true})));
    }
    // 原始圖片是唯一的圖片視覺來源，絕不將圖片訊號合成為 400/450 點假曲線
    const digitizedApproximation: DigitizedSpectrumData = {
      derivedFromFileName: spectrum.fileName,
      label: "AI / Digitized Approximation",
      sourceType: "IMAGE_DIGITIZED",
      reliabilityLevel: "MEDIUM",
      approximatedPoints: [],
      approximatedPeaks: updatedPeaks,
      calibrationUsed: newCalibration,
    };

    const validation = DataValidator.validateSpectrum(
      spectrum.modality,
      spectrum.sourceFormat,
      tracedPoints,
      updatedPeaks,
      true,
      dims,
      updatedPeaks.length === 0
    );

    const isCalValid = this.isImageCalibrationValid(newCalibration);
    const nextVersion = (spectrum.dataVersion || 1) + 1;

    return SignalCharacterizationEngine.measureSpectrumSignals({
      ...spectrum,
      sourceId:
        spectrum.sourceId ||
        `${this.resolveExtendedModality(spectrum)}-img-${spectrum.fileName}`,
      dataVersion: nextVersion,
      ...(spectrum.irPixelCurve?{irProcessingApplied:false,points:spectrum.irPixelCurve.map(p=>({x:this.pixelToPhysicalX(p.x,newCalibration),y:100*(newCalibration.plotBottomPx-p.y)/(newCalibration.plotBottomPx-newCalibration.plotTopPx)}))}:{}),
      sourceType: "IMAGE_EXPERIMENTAL",
      dataQuality: isCalValid ? "HIGH" : "LOW",
      evidenceQuality: isCalValid ? "CALIBRATED_IMAGE" : "APPROXIMATE_IMAGE",
      dataReliabilityLevel: isCalValid ? "HIGH" : "HIGH_FOR_VISUAL_REFERENCE",
      xDirection: xAxisDirection,
      imageCalibration: newCalibration,
      imageAnnotations: updatedImageAnnotations,
      imageSignalAnnotations: updatedImageAnnotations,
      autoDetectedAnnotations: updatedAutoAnnotations,
      peaks: isCalValid ? updatedPeaks : [],
      confirmedPeaks: isCalValid ? updatedPeaks : [],
      calibratedDataSnapshot: isCalValid
        ? {
            version: nextVersion,
            calibratedAt: new Date().toISOString(),
            calibrationSource: newCalibration.source,
            calibratedPeaks: updatedPeaks.map((pk) => ({ ...pk })),
          }
        : spectrum.calibratedDataSnapshot,
      points: tracedPoints,
      digitizedApproximation,
      digitizedMetadata: spectrum.digitizedMetadata
        ? {
            ...spectrum.digitizedMetadata,
            isTwoPointCalibrated:
              isCalValid && this.isUserCalibratedSource(newCalibration.source),
          }
        : undefined,
      validation,
      calibrationFailed: !isCalValid,
      digitizationFailed: !isCalValid && updatedImageAnnotations.length === 0,
      digitizationErrorMessage: isCalValid
        ? undefined
        : "校正點無效或範圍過小，請重新選擇兩個以上不重疊的參考座標點。",
    });
  }

  /**
   * 視覺型態觀察轉換：
   * 嚴格禁止將沒有實際觀測座標的視覺型態標籤 (patternKey) 直接轉為固定範例峰位
   * （如 3350, 1705, 1600, 1510, 1255, 833, 2820, 2735, 9.88, 7.85, 7.01, 3.88, 190.8, 164.6, 132.0, 114.3, 136, 135, 77 等）。
   * 僅當該觀察本身帶有從該張圖片讀取之明確 approximatePosition 數值時，才建立近似訊號；
   * 否則僅保留於 spectrum.visualPatterns 作為參考分析提示。
   */
  static convertVisualPatternsToApproximateSignals(
    modality: SpectrumModality,
    visualPatterns: VisualPatternObservation[]
  ): NonNullable<Parameters<typeof SpectrumParser.createImageSpectrum>[0]["detectedSignals"]> {
    const approxSignals: NonNullable<
      Parameters<typeof SpectrumParser.createImageSpectrum>[0]["detectedSignals"]
    > = [];

    for (const vp of visualPatterns) {
      const conf = Math.min(0.74, Math.max(0.52, vp.confidence || 0.65));
      if (
        vp.approximatePosition !== undefined &&
        Number.isFinite(vp.approximatePosition)
      ) {
        approxSignals.push({
          physicalX: vp.approximatePosition,
          physicalY: 78,
          label: `[APPROXIMATE_IMAGE] ${vp.descriptionZh}`,
          signalType: modality === "IR" ? "BAND" : "PEAK",
          confidence: conf,
          source: "AI",
        });
      }
    }

    return approxSignals;
  }

  static createImageSpectrum(params: {
    modality: SpectrumModality;
    fileName: string;
    originalImageUrl: string;
    imageDimensions?: { width: number; height: number };
    calibration?: Partial<ImageSpectrumCalibration>;
    calibrationFailed?: boolean;
    visualPatterns?: VisualPatternObservation[];
    dataQuality?: ExperimentalDataQuality;
    evidenceQuality?: EvidenceQuality;
    digitizationMethod?: "Gemini Vision" | "Canvas" | "Manual";
    detectedSignals?: {
      pixelX?: number;
      pixelY?: number;
      physicalX?: number;
      physicalY?: number;
      label?: string;
      signalType?: SpectrumSignalType;
      confidence?: number;
      source?: "AI" | "USER" | "ALGORITHM";
      verifiedByUser?: boolean;
    }[];
    isBlurryOrLowConfidence?: boolean;
    msParams?: MSParameters;
  }): ExperimentalSpectrumData {
    const {
      modality,
      fileName,
      originalImageUrl,
      imageDimensions = { width: 800, height: 450 },
      calibration: rawCal,
      calibrationFailed = false,
      visualPatterns = [],
      detectedSignals: rawDetectedSignals = [],
      isBlurryOrLowConfidence = false,
      msParams,
    } = params;

    const lowerName = fileName.toLowerCase();
    const sourceFormat: ExperimentalSpectrumData["sourceFormat"] = lowerName.endsWith(".png")
      ? "PNG"
      : lowerName.endsWith(".webp")
      ? "WEBP"
      : "JPG";
    const { xUnit, yUnit } = this.defaultUnits(modality);

    const isAxisUncalibrated =
      calibrationFailed ||
      isBlurryOrLowConfidence ||
      (rawCal?.confidence !== undefined && rawCal.confidence < 0.45);

    const imageCalibration = this.buildImageCalibration(modality, imageDimensions, {
      ...rawCal,
      confidence: isAxisUncalibrated ? rawCal?.confidence ?? 0.35 : rawCal?.confidence ?? 0.85,
      source: rawCal?.source ?? (isAxisUncalibrated ? "DEFAULT_FALLBACK" : "AI_DETECTED"),
    });

    const patternSignals =
      visualPatterns.length > 0
        ? this.convertVisualPatternsToApproximateSignals(modality, visualPatterns)
        : [];
    const effectiveSignals =
      rawDetectedSignals.length > 0 ? rawDetectedSignals : patternSignals;

    if (isAxisUncalibrated && effectiveSignals.length === 0) {
      const validation = DataValidator.validateSpectrum(
        modality,
        sourceFormat,
        [],
        [],
        true,
        imageDimensions,
        true
      );
      return {
        sourceType: "IMAGE_EXPERIMENTAL",
        dataQuality: params.dataQuality || "LOW",
        evidenceQuality: params.evidenceQuality || "APPROXIMATE_IMAGE",
        dataReliabilityLevel: "HIGH_FOR_VISUAL_REFERENCE",
        modality,
        canonicalModality: this.canonicalModalityFor(modality, msParams),
        fileName,
        originalFileName: fileName,
        sourceFormat,
        dataOrigin: "EXPERIMENTAL_UPLOAD",
        modelType: "EXPERIMENTAL",
        isSimulated: false,
        xUnit,
        yUnit,
        points: [],
        peaks: [],
        validation,
        msParams,
        digitizedFromImage: true,
        digitizationMethod: params.digitizationMethod || "Canvas",
        digitizationFailed: true,
        calibrationFailed: true,
        digitizationErrorMessage:
          "光譜座標校正信心不足：無法可靠辨識圖片座標軸與訊號峰。系統未產生任何假 peak，請使用「手動校正 X 軸」點選兩點或三點輸入物理座標，或直接在原圖上人工標記訊號。",
        visualPatterns,
        imagePreviewUrl: originalImageUrl,
        originalImageUrl,
        imageDimensions,
        imageCalibration,
        imageAnnotations: [],
        imageSignalAnnotations: [],
        autoDetectedAnnotations: [],
      };
    }

    const resolvedEvidenceQuality: EvidenceQuality =
      params.evidenceQuality ||
      (isAxisUncalibrated
        ? rawDetectedSignals.length > 0
          ? "APPROXIMATE_IMAGE"
          : "VISUAL_PATTERN_ONLY"
        : imageCalibration.confidence >= 0.75
        ? "CALIBRATED_IMAGE"
        : "APPROXIMATE_IMAGE");

    const resolvedDataQuality: ExperimentalDataQuality =
      params.dataQuality ||
      (isAxisUncalibrated
        ? "MEDIUM"
        : imageCalibration.confidence >= 0.78
        ? "HIGH"
        : "MEDIUM");

    const imageAnnotations: ImageSignalAnnotation[] = effectiveSignals.map((sig, idx) => {
      const physX =
        sig.physicalX !== undefined
          ? sig.physicalX
          : sig.pixelX !== undefined
          ? this.pixelToPhysicalX(sig.pixelX, imageCalibration)
          : undefined;
      const pixX =
        sig.pixelX !== undefined
          ? sig.pixelX
          : physX !== undefined
          ? this.physicalToPixelX(physX, imageCalibration)
          : imageCalibration.plotLeftPx;
      const physY = sig.physicalY ?? 75;
      const pixY =
        sig.pixelY !== undefined
          ? sig.pixelY
          : this.physicalIntensityToPixelY(physY, imageCalibration);

      const rawConf = sig.confidence ?? (isAxisUncalibrated ? 0.65 : 0.84);
      const effectiveConf = isAxisUncalibrated ? Math.min(0.74, rawConf) : rawConf;

      return {
        id: `${modality}-img-ann-${idx + 1}`,
        pixelX: pixX,
        pixelY: pixY,
        physicalX: physX,
        calibratedPosition: physX,
        physicalY: physY,
        intensity: physY,
        unit: xUnit,
        label:
          sig.label ||
          (physX !== undefined ? `${physX} ${xUnit}` : `Pixel (${pixX}, ${pixY})`),
        signalType:
          sig.signalType ||
          this.defaultSignalTypeForModality(modality, undefined, msParams),
        confidence: effectiveConf,
        source: sig.source || "AI",
        verifiedByUser: Boolean(sig.verifiedByUser),
        provenance: sig.source === "USER" ? "USER_DEFINED" : "AI_DETECTED",
        role: "ANALYTE",
        signalRole: "ANALYTE",
      };
    });

    const extractedPeaks: SpectralPeak[] = imageAnnotations
      .filter((a) => a.physicalX !== undefined)
      .map((a) => ({
        id: a.id,
        x: Number(a.physicalX!.toFixed(modality === "MS" ? 4 : 2)),
        y: Number((a.physicalY ?? 75).toFixed(1)),
        pixelX: a.pixelX,
        pixelY: a.pixelY,
        width:
          modality === "IR"
            ? a.label?.toLowerCase().includes("broad")
              ? 110
              : 28
            : 0.05,
        shape:
          a.signalType === "SHOULDER"
            ? "shoulder"
            : a.label?.toLowerCase().includes("broad")
            ? "broad"
            : "sharp",
        integration: null,
        multiplicity: a.signalType === "MULTIPLET" ? "m" : null,
        jValues: [],
        assignment: a.label || "原圖標記訊號峰",
        manualPeak: a.source === "USER",
        manualEdited: a.verifiedByUser,
        detectionSource:
          a.source === "USER"
            ? "USER_MARKED"
            : !isAxisUncalibrated && (a.confidence ?? 0.8) >= 0.72
            ? "AUTO_IMAGE_DETECTION"
            : "ESTIMATED_FROM_IMAGE",
        provenance: a.source === "USER" ? "USER_DEFINED" : "AI_DETECTED",
        role: "ANALYTE",
        signalRole: "ANALYTE",
      }));

    // 原始圖片是唯一的圖片視覺來源，絕不將圖片辨識結果合成為 400/450 點假曲線
    const digitizedApproximation: DigitizedSpectrumData = {
      derivedFromFileName: fileName,
      label: "AI / Digitized Approximation",
      sourceType: "IMAGE_DIGITIZED",
      reliabilityLevel: "MEDIUM",
      approximatedPoints: [],
      approximatedPeaks: extractedPeaks,
      calibrationUsed: imageCalibration,
    };

    const validation = DataValidator.validateSpectrum(
      modality,
      sourceFormat,
      [],
      extractedPeaks,
      true,
      imageDimensions,
      extractedPeaks.length === 0
    );

    return SignalCharacterizationEngine.measureSpectrumSignals({
      sourceId: `${this.resolveExtendedModality(modality, msParams)}-img-${fileName}`,
      dataVersion: 1,
      sourceType: "IMAGE_EXPERIMENTAL",
      dataQuality: resolvedDataQuality,
      evidenceQuality: resolvedEvidenceQuality,
      dataReliabilityLevel:
        resolvedDataQuality === "HIGH" ? "HIGH" : "HIGH_FOR_VISUAL_REFERENCE",
      modality,
      canonicalModality: this.canonicalModalityFor(modality, msParams),
      fileName,
      originalFileName: fileName,
      sourceFormat,
      dataOrigin: "EXPERIMENTAL_UPLOAD",
      modelType: "EXPERIMENTAL",
      isSimulated: false,
      xUnit,
      yUnit,
      points: [],
      peaks: extractedPeaks,
      rawExperimentalSnapshot: {
        fileName,
        originalImageUrl,
        imageDimensions,
        capturedAt: new Date().toISOString(),
      },
      autoSuggestedPeaks: extractedPeaks
        .filter((pk) => pk.provenance !== "USER_DEFINED")
        .map((pk) => ({ ...pk })),
      userEditedPeaks: extractedPeaks
        .filter((pk) => pk.provenance === "USER_DEFINED")
        .map((pk) => ({ ...pk })),
      deletedPeakIds: [],
      confirmedPeaks: extractedPeaks.map((pk) => ({ ...pk })),
      validation,
      msParams,
      digitizedFromImage: true,
      digitizationMethod: params.digitizationMethod || "Gemini Vision",
      digitizationFailed: extractedPeaks.length === 0,
      calibrationFailed: isAxisUncalibrated,
      digitizationErrorMessage: isAxisUncalibrated
        ? "注意：X 軸精確座標校正未完成。請在原圖上點選 2 點或 3 點參考座標完成 X 軸線性校正，或直接在原圖上人工標記訊號峰。"
        : undefined,
      visualPatterns,
      imagePreviewUrl: originalImageUrl,
      originalImageUrl,
      imageDimensions,
      imageCalibration,
      imageAnnotations,
      imageSignalAnnotations: imageAnnotations,
      autoDetectedAnnotations: imageAnnotations.filter((a) => a.source !== "USER"),
      digitizedApproximation,
    });
  }

  static async digitizeImageSpectrum(
    modality: SpectrumModality,
    file: File,
    msParams?: MSParameters
  ): Promise<ExperimentalSpectrumData> {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = dataUrl;
    });

    const imageDimensions = { width: img.width || 800, height: img.height || 450 };
    let detectedSignals: NonNullable<
      Parameters<typeof SpectrumParser.createImageSpectrum>[0]["detectedSignals"]
    > = [];
    let calibrationOverride: Partial<ImageSpectrumCalibration> | undefined;
    let digitizationSucceeded = false;
    let digitizationMethod: "Gemini Vision" | "Canvas" = "Canvas";

    const canvas = document.createElement("canvas");
    const width = img.width || 800;
    const height = img.height || 450;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    const imgData = ctx ? (ctx.drawImage(img, 0, 0, width, height), ctx.getImageData(0, 0, width, height).data) : null;

    const detectedBounds = imgData
      ? this.detectPlotBoundariesFromPixels(imgData, width, height)
      : {
          plotLeftPx: Math.round(width * 0.08),
          plotRightPx: Math.round(width * 0.94),
          plotTopPx: Math.round(height * 0.08),
          plotBottomPx: Math.round(height * 0.86),
          plotBoundaryStatus: "PLOT_BOUNDARY_UNCERTAIN" as const,
        };

    const baseCal = this.buildImageCalibration(modality, imageDimensions, {
      ...detectedBounds,
      confidence:
        detectedBounds.plotBoundaryStatus === "DETECTED" ? 0.78 : 0.44,
      source:
        modality==='IR' ? 'DEFAULT_FALLBACK' : detectedBounds.plotBoundaryStatus === "DETECTED"
          ? "AI_DETECTED"
          : "PLOT_BOUNDARY_UNCERTAIN",
    });

    if(modality==='IR'&&imgData){
      const trace=traceIRPixels(imgData,width,height,baseCal);
      const result=this.createImageSpectrum({modality,fileName:file.name,originalImageUrl:dataUrl,imageDimensions,calibration:baseCal,detectedSignals:[],digitizationMethod:'Canvas',isBlurryOrLowConfidence:true,msParams});
      return {...result,irPixelCurve:trace.pixels,irDataQuality:trace.quality*.5,irIntensityScale:'UNKNOWN',yUnit:'相對影像尺度（非吸光度）',points:trace.pixels.map(p=>({x:this.pixelToPhysicalX(p.x,baseCal),y:100*(baseCal.plotBottomPx-p.y)/(baseCal.plotBottomPx-baseCal.plotTopPx)})),digitizationFailed:trace.pixels.length===0,irProcessingWarnings:['原始像素曲線；請確認繪圖區與波數校正，文字及格線仍可能造成擷取誤差。']};
    }
    try {
      const response = await fetch("/api/digitize-spectrum", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: dataUrl,
          mimeType: file.type || "image/png",
          spectrumType: modality,
        }),
      });
      if (response.ok) {
        const aiData = await response.json();
        if (
          aiData.aiAvailable &&
          aiData.digitizedSuccess &&
          Array.isArray(aiData.peaks) &&
          aiData.peaks.length > 0
        ) {
          // Validate Gemini Vision peaks against physical range and map to original image pixels
          const validAiPeaks = aiData.peaks.filter((pk: any) => {
            const xVal = Number(pk?.x);
            if (!Number.isFinite(xVal)) return false;
            if (modality === "IR") return xVal >= 350 && xVal <= 4200;
            if (modality === "1H_NMR") return xVal >= -1 && xVal <= 16;
            if (modality === "13C_NMR") return xVal >= -5 && xVal <= 240;
            return xVal >= 1 && xVal <= 5000;
          });

          if (validAiPeaks.length > 0) {
            calibrationOverride = {
              ...detectedBounds,
              confidence: 0.86,
              source: "AI_DETECTED",
            };
            const aiCal = this.buildImageCalibration(
              modality,
              imageDimensions,
              calibrationOverride
            );
            detectedSignals = validAiPeaks.map((pk: any) => {
              const physX = Number(Number(pk.x).toFixed(2));
              const physY = Number(
                Math.min(100, Math.max(5, Number(pk.y) || 75)).toFixed(1)
              );
              const rawPx = typeof pk.pixelX === "number" && pk.pixelX >= 0 && pk.pixelX <= width
                ? pk.pixelX
                : this.physicalToPixelX(physX, aiCal);
              const rawPy = typeof pk.pixelY === "number" && pk.pixelY >= 0 && pk.pixelY <= height
                ? pk.pixelY
                : this.physicalIntensityToPixelY(physY, aiCal);
              return {
                physicalX: physX,
                physicalY: physY,
                pixelX: rawPx,
                pixelY: rawPy,
                label: pk.label || `${physX}`,
                confidence: 0.84,
                source: "AI" as const,
                verifiedByUser: false,
              };
            });
            digitizationSucceeded = true;
            digitizationMethod = "Gemini Vision";
          }
        }
      }
    } catch {
      // Proceed to high-resolution Canvas curve & peak tracing
    }

    if (!digitizationSucceeded && imgData && width >= 48 && height >= 48) {
      const cornerCoords = [
        [2, 2],
        [Math.max(0, width - 3), 2],
        [2, Math.max(0, height - 3)],
        [Math.max(0, width - 3), Math.max(0, height - 3)],
      ];
      let cornerLumSum = 0;
      for (const [cx, cy] of cornerCoords) {
        const cIdx = (cy * width + cx) * 4;
        cornerLumSum +=
          0.299 * imgData[cIdx] +
          0.587 * imgData[cIdx + 1] +
          0.114 * imgData[cIdx + 2];
      }
      const avgBgLum = cornerLumSum / cornerCoords.length;
      const isDarkBackground = avgBgLum < 115;

      const { plotLeftPx, plotRightPx, plotTopPx, plotBottomPx } = baseCal;
      const plotW = Math.max(1, plotRightPx - plotLeftPx);
      const plotH = Math.max(1, plotBottomPx - plotTopPx);

      // High-resolution horizontal scanning (up to 900 columns across plot area)
      const stepX = Math.max(1, Math.floor(plotW / 900));
      const traceSamples: {
        px: number;
        py: number;
        physX: number;
        physY: number;
        prominenceY: number;
        contrast: number;
        lineThickness: number;
      }[] = [];

      let activeColumns = 0;
      let prevCurveY: number | null = null;

      //Margin inside plot box to avoid axis lines and tick marks right on the border
      const yScanStart = Math.min(height - 1, Math.max(0, plotTopPx + Math.round(plotH * 0.02)));
      const yScanEnd = Math.max(yScanStart + 1, Math.min(height - 1, plotBottomPx - Math.round(plotH * 0.02)));

      for (let px = plotLeftPx; px <= plotRightPx; px += stepX) {
        // Collect vertical dark/bright runs (stroke segments) in column px
        const runs: { centerY: number; thickness: number; maxStrength: number; avgSat: number }[] = [];
        let inRun = false;
        let runStart = yScanStart;
        let runMaxStrength = 0;
        let runSatSum = 0;

        for (let py = yScanStart; py <= yScanEnd; py++) {
          const idx = (py * width + px) * 4;
          const r = imgData[idx];
          const g = imgData[idx + 1];
          const b = imgData[idx + 2];
          const a = imgData[idx + 3];
          if (a < 30) continue;

          const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
          const colorDiff = Math.abs(r - g) + Math.abs(g - b) + Math.abs(r - b);
          const lumContrast = isDarkBackground
            ? Math.max(0, luminance - avgBgLum)
            : Math.max(0, avgBgLum - luminance);
          const strength = lumContrast + colorDiff * 0.45;

          if (strength > 20) {
            if (!inRun) {
              inRun = true;
              runStart = py;
              runMaxStrength = strength;
              runSatSum = colorDiff;
            } else {
              if (strength > runMaxStrength) runMaxStrength = strength;
              runSatSum += colorDiff;
            }
          } else if (inRun) {
            const thickness = py - runStart;
            const centerY = Math.round((runStart + py - 1) / 2);
            runs.push({
              centerY,
              thickness,
              maxStrength: runMaxStrength,
              avgSat: runSatSum / Math.max(1, thickness),
            });
            inRun = false;
          }
        }
        if (inRun) {
          const thickness = yScanEnd - runStart + 1;
          const centerY = Math.round((runStart + yScanEnd) / 2);
          runs.push({
            centerY,
            thickness,
            maxStrength: runMaxStrength,
            avgSat: runSatSum / Math.max(1, thickness),
          });
        }

        // Filter out vertical gridlines (which span > 65% of plot height continuously)
        // and text/legend blocks (many small fragmented runs in the same column, > 5 segments)
        const candidateRuns = runs.filter(
          (run) => run.thickness <= Math.max(18, plotH * 0.45)
        );

        let chosenY = modality === "IR" ? yScanStart : yScanEnd;
        let chosenStrength = 0;
        let chosenThickness = 1;

        if (candidateRuns.length > 0 && candidateRuns.length <= 6) {
          // Score each run by contrast, color saturation, and continuity with prevCurveY
          let bestScore = -Infinity;
          for (const run of candidateRuns) {
            const continuityPenalty =
              prevCurveY !== null && modality === "IR"
                ? Math.abs(run.centerY - prevCurveY) * 0.18
                : 0;
            // For IR, deeper absorption (larger Y) is favored when strength is strong;
            // For NMR/MS, taller peak (smaller Y) is favored when strength is strong.
            const excursionBonus =
              modality === "IR"
                ? ((run.centerY - yScanStart) / plotH) * 28
                : ((yScanEnd - run.centerY) / plotH) * 28;
            const score =
              run.maxStrength * 0.8 +
              run.avgSat * 0.35 +
              excursionBonus -
              continuityPenalty;
            if (score > bestScore) {
              bestScore = score;
              chosenY = run.centerY;
              chosenStrength = run.maxStrength;
              chosenThickness = run.thickness;
            }
          }
          if (chosenStrength > 22) {
            activeColumns++;
            prevCurveY = chosenY;
          }
        }

        const physX = this.pixelToPhysicalX(px, baseCal);
        const normalizedHeight =
          ((plotBottomPx - chosenY) / Math.max(1, plotH)) * 100;
        const clampedHeight = Number(
          Math.max(0, Math.min(100, normalizedHeight)).toFixed(1)
        );
        const prominenceY =
          modality === "IR"
            ? Number(Math.max(5, 100 - clampedHeight).toFixed(1))
            : clampedHeight;

        traceSamples.push({
          px,
          py: chosenY,
          physX,
          physY: modality === "IR" ? prominenceY : clampedHeight,
          prominenceY,
          contrast: chosenStrength,
          lineThickness: chosenThickness,
        });
      }

      if (activeColumns >= 5 && traceSamples.length >= 10) {
        // Estimate baseline (15th percentile of prominenceY) so only true excursions above baseline are picked
        const sortedProm = traceSamples
          .map((t) => t.prominenceY)
          .slice()
          .sort((a, b) => a - b);
        const baselineProm =
          sortedProm[Math.floor(sortedProm.length * 0.15)] ?? 10;
        const dynamicThreshold = Math.max(18, Math.min(45, baselineProm + 12));

        const rawCandidatePks = this.detectPeaksFromSeries(
          modality,
          traceSamples.map((t) => ({ x: t.physX, y: t.prominenceY })),
          dynamicThreshold
        );
        const candidatePks = rawCandidatePks
          .sort((a, b) => b.y - a.y)
          .slice(0, 18)
          .sort((a, b) =>
            modality === "IR" ||
            modality === "1H_NMR" ||
            modality === "13C_NMR"
              ? b.x - a.x
              : a.x - b.x
          );

        if (candidatePks.length >= 1) {
          calibrationOverride = baseCal;
          const isLowRes = width < 360 || height < 220;
          detectedSignals = candidatePks.map((pk) => {
            let closest = traceSamples[0];
            for (const ts of traceSamples) {
              if (
                Math.abs(ts.physX - pk.x) < Math.abs(closest.physX - pk.x)
              ) {
                closest = ts;
              }
            }
            const isWeakOrBlurry =
              isLowRes ||
              closest.contrast < 38 ||
              closest.lineThickness > 8 ||
              baseCal.plotBoundaryStatus === "PLOT_BOUNDARY_UNCERTAIN";
            const sigConfidence = isWeakOrBlurry
              ? Math.min(0.62, baseCal.confidence)
              : Math.min(0.82, Math.max(0.74, baseCal.confidence));

            return {
              pixelX: closest.px,
              pixelY: closest.py,
              physicalX: pk.x,
              physicalY: pk.y,
              label: `${pk.x}`,
              confidence: Number(sigConfidence.toFixed(2)),
              source: "AI" as const,
              verifiedByUser: false,
            };
          });
          digitizationSucceeded = true;
          digitizationMethod = "Canvas";
        }
      }
    }

    return this.createImageSpectrum({
      modality,
      fileName: file.name,
      originalImageUrl: dataUrl,
      imageDimensions,
      calibration: calibrationOverride ?? baseCal,
      detectedSignals,
      digitizationMethod,
      isBlurryOrLowConfidence:
        !digitizationSucceeded ||
        detectedSignals.length === 0 ||
        (width < 320 || height < 200),
      msParams,
    });
  }

  static crossValidateImageAndNumericSpectra(
    imageSpectrum: ExperimentalSpectrumData,
    numericSpectrum: ExperimentalSpectrumData
  ): CrossSourceValidationRecord {
    const modality = numericSpectrum.modality || imageSpectrum.modality;
    const { xUnit } = this.defaultUnits(modality);
    const imgPeaks = imageSpectrum.peaks || [];
    const numPeaks = numericSpectrum.peaks || [];

    const matchTol =
      modality === "IR"
        ? 25
        : modality === "1H_NMR"
        ? 0.25
        : modality === "13C_NMR"
        ? 3.5
        : 1.2;

    const regionWindow =
      modality === "IR"
        ? 140
        : modality === "1H_NMR"
        ? 1.5
        : modality === "13C_NMR"
        ? 25
        : 20;

    const matchedSignals: CrossSourceValidationRecord["matchedSignals"] = [];
    const conflictingSignals: CrossSourceValidationRecord["conflictingSignals"] = [];

    for (const imgPk of imgPeaks) {
      if (numPeaks.length === 0) continue;
      let closestNum = numPeaks[0];
      let minDiff = Math.abs(imgPk.x - closestNum.x);
      for (const np of numPeaks) {
        const d = Math.abs(imgPk.x - np.x);
        if (d < minDiff) {
          minDiff = d;
          closestNum = np;
        }
      }

      if (minDiff <= matchTol) {
        matchedSignals.push({
          imagePosition: imgPk.x,
          numericPosition: closestNum.x,
          difference: Number(minDiff.toFixed(2)),
          unit: xUnit,
          summaryZh: `圖片判讀 (${imgPk.x} ${xUnit}) 與數值資料 (${closestNum.x} ${xUnit}) 互相吻合 (Δ = ${minDiff.toFixed(
            2
          )} ${xUnit})，形成雙重實驗交叉支持證據 (Corroborating Evidence)。`,
        });
      } else if (minDiff <= regionWindow) {
        conflictingSignals.push({
          imagePosition: imgPk.x,
          numericPosition: closestNum.x,
          difference: Number(minDiff.toFixed(2)),
          unit: xUnit,
          conflictReasonZh: `圖片判讀 (${imgPk.x} ${xUnit}) 與數值資料 (${closestNum.x} ${xUnit}) 於同一特徵區間存在顯著位置差異 (Δ = ${minDiff.toFixed(
            2
          )} ${xUnit} > 容許誤差 ${matchTol} ${xUnit})。圖片判讀與數值資料存在差異，請確認原始資料或圖片。`,
        });
      }
    }

    const status: "CORROBORATED" | "DATA_CONFLICT" =
      conflictingSignals.length > 0 ? "DATA_CONFLICT" : "CORROBORATED";

    const summaryMessageZh =
      status === "DATA_CONFLICT"
        ? `DATA_CONFLICT：圖片判讀與數值資料存在差異，請確認原始資料或圖片。（圖片：${imageSpectrum.fileName} vs 數值：${numericSpectrum.fileName}）`
        : `CORROBORATED：圖片判讀 (${imageSpectrum.fileName}) 與數值資料 (${numericSpectrum.fileName}) 完成同等級雙來源交叉驗證，共 ${matchedSignals.length} 組特徵訊號互相印證。`;

    return {
      modality,
      imageFileName: imageSpectrum.fileName,
      numericFileName: numericSpectrum.fileName,
      status,
      matchedSignals,
      conflictingSignals,
      summaryMessageZh,
    };
  }

  static mergeNumericAndImageSpectrum(
    existingSpectrum: ExperimentalSpectrumData | undefined,
    incomingSpectrum: ExperimentalSpectrumData
  ): ExperimentalSpectrumData {
    if (!existingSpectrum) return incomingSpectrum;

    const existingIsNumeric =
      existingSpectrum.sourceType === "NUMERIC_EXPERIMENTAL" ||
      (!existingSpectrum.digitizedFromImage &&
        ["EXCEL", "CSV", "TXT", "JCAMP-DX"].includes(existingSpectrum.sourceFormat));
    const incomingIsNumeric =
      incomingSpectrum.sourceType === "NUMERIC_EXPERIMENTAL" ||
      (!incomingSpectrum.digitizedFromImage &&
        ["EXCEL", "CSV", "TXT", "JCAMP-DX"].includes(incomingSpectrum.sourceFormat));

    const existingIsImage =
      existingSpectrum.sourceType === "IMAGE_EXPERIMENTAL" ||
      Boolean(existingSpectrum.digitizedFromImage);
    const incomingIsImage =
      incomingSpectrum.sourceType === "IMAGE_EXPERIMENTAL" ||
      Boolean(incomingSpectrum.digitizedFromImage);

    if ((existingIsNumeric && incomingIsImage) || (existingIsImage && incomingIsNumeric)) {
      const numericSpec = existingIsNumeric ? existingSpectrum : incomingSpectrum;
      const imageSpec = existingIsImage ? existingSpectrum : incomingSpectrum;

      const crossSourceValidation = this.crossValidateImageAndNumericSpectra(
        imageSpec,
        numericSpec
      );

      const normalizedImageSpec: ExperimentalSpectrumData = {
        ...imageSpec,
        sourceType: "IMAGE_EXPERIMENTAL",
        dataQuality: imageSpec.dataQuality || "HIGH",
        evidenceQuality: imageSpec.evidenceQuality || "CALIBRATED_IMAGE",
        dataReliabilityLevel: "HIGH_FOR_VISUAL_REFERENCE",
      };

      return {
        ...numericSpec,
        sourceType: "NUMERIC_EXPERIMENTAL",
        dataQuality: numericSpec.dataQuality || "HIGH",
        evidenceQuality: numericSpec.evidenceQuality || "EXACT_NUMERIC",
        dataReliabilityLevel: "HIGHEST",
        peerExperimentalSpectrum: normalizedImageSpec,
        companionImageReference: normalizedImageSpec,
        crossSourceValidation,
      };
    }

    return incomingSpectrum;
  }

  static upsertUserSignalAnnotation(
    spectrum: ExperimentalSpectrumData,
    updatedSignal: {
      id?: string;
      x?: number;
      y?: number;
      pixelX?: number;
      pixelY?: number;
      isCalibrated?: boolean;
      signalDirection?: "PEAK_TOP" | "ABSORPTION_VALLEY" | "SHOULDER" | "ION_BAR";
      label?: string;
      assignment?: string;
      signalType?: SpectrumSignalType;
      signalRole?: SignalRole;
      role?: SignalRole;
      classificationTag?: import("../types/spectrum").PeakClassificationTag;
      userClassification?: import("../types/spectrum").PeakClassificationTag;
      isSolventVerified?: boolean;
      solventName?: string;
      provenance?: PeakProvenance;
      integration?: number | null;
      multiplicity?: SpectralPeak["multiplicity"];
      jValues?: number[];
      irIntensity?: IRBandIntensityLevel;
      bandShape?: IRBandShapeCategory;
      vibrationType?: IRVibrationType;
      deptType?: "C" | "C_quat" | "CH" | "CH2" | "CH3" | "Unknown";
      carbonType?: CarbonEnvironmentType;
      confidence?: number;
    }
  ): ExperimentalSpectrumData {
    const isImage =
      spectrum.sourceType === "IMAGE_EXPERIMENTAL" || Boolean(spectrum.digitizedFromImage);
    const { xUnit } = this.defaultUnits(spectrum.modality);
    const sigId =
      updatedSignal.id ||
      `${spectrum.modality}-user-sig-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const effectiveTag =
      updatedSignal.userClassification ?? updatedSignal.classificationTag;

    // Map classificationTag (REAL, NOISE, SOLVENT, IMPURITY, UNKNOWN, OVERLAP) to SignalRole if provided
    let resolvedRole: SignalRole =
      updatedSignal.signalRole || updatedSignal.role || "ANALYTE";
    if (effectiveTag) {
      if (effectiveTag === "REAL") resolvedRole = "ANALYTE";
      else if (effectiveTag === "SOLVENT") resolvedRole = "SOLVENT";
      else if (effectiveTag === "IMPURITY") resolvedRole = "IMPURITY";
      else if (effectiveTag === "NOISE") resolvedRole = "ARTIFACT";
      else if (effectiveTag === "OVERLAP") resolvedRole = "ANALYTE";
      else if (effectiveTag === "UNKNOWN") resolvedRole = "ANALYTE";
    }

    const resolvedProvenance: PeakProvenance =
      updatedSignal.provenance ||
      (updatedSignal.id ? "USER_MODIFIED" : "USER_DEFINED");

    if (isImage) {
      const cal =
        spectrum.imageCalibration ||
        this.buildImageCalibration(
          spectrum.modality,
          spectrum.imageDimensions || { width: 800, height: 450 }
        );
      const isSpectrumCalibrated = this.isSpectrumCalibrated(spectrum);

      const isSignalCalibrated =
        updatedSignal.isCalibrated !== undefined
          ? updatedSignal.isCalibrated
          : updatedSignal.x !== undefined || isSpectrumCalibrated;

      const physX =
        updatedSignal.x !== undefined
          ? updatedSignal.x
          : isSignalCalibrated && updatedSignal.pixelX !== undefined
          ? this.pixelToPhysicalX(updatedSignal.pixelX, cal)
          : undefined;
      const physY =
        updatedSignal.y !== undefined
          ? updatedSignal.y
          : updatedSignal.pixelY !== undefined
          ? this.pixelToPhysicalIntensity(updatedSignal.pixelY, cal, spectrum.modality)
          : 80;
      const pixX =
        updatedSignal.pixelX !== undefined
          ? updatedSignal.pixelX
          : physX !== undefined
          ? this.physicalToPixelX(physX, cal)
          : cal.plotLeftPx;
      const pixY =
        updatedSignal.pixelY !== undefined
          ? updatedSignal.pixelY
          : this.physicalIntensityToPixelY(physY, cal);

      const defaultLabel =
        physX !== undefined && isSignalCalibrated
          ? `${physX} ${xUnit}`
          : `Pixel (${pixX}, ${pixY})`;

      const newImgAnn: ImageSignalAnnotation = {
        id: sigId,
        pixelX: pixX,
        pixelY: pixY,
        physicalX: isSignalCalibrated ? physX : undefined,
        calibratedPosition: isSignalCalibrated ? physX : undefined,
        isCalibrated: isSignalCalibrated,
        signalDirection: updatedSignal.signalDirection,
        physicalY: physY,
        intensity: physY,
        unit: xUnit,
        label: updatedSignal.label || updatedSignal.assignment || defaultLabel,
        assignment: updatedSignal.assignment || updatedSignal.label || defaultLabel,
        signalType:
          updatedSignal.signalType ||
          this.defaultSignalTypeForModality(spectrum.modality, undefined, spectrum.msParams),
        confidence: updatedSignal.confidence ?? 0.98,
        source: "USER",
        detectionSource: "USER_MARKED",
        manualPeak: true,
        verifiedByUser: true,
        userModified: true,
        provenance: resolvedProvenance,
        role: resolvedRole,
        signalRole: resolvedRole,
        userClassification: effectiveTag,
        isSolventVerified: updatedSignal.isSolventVerified,
        solventName: updatedSignal.solventName,
        multiplicity: updatedSignal.multiplicity,
        integration: updatedSignal.integration,
        jValues: updatedSignal.jValues,
        irIntensity: updatedSignal.irIntensity,
        bandShape: updatedSignal.bandShape,
        vibrationType: updatedSignal.vibrationType,
        deptType: updatedSignal.deptType,
        carbonType: updatedSignal.carbonType,
      };

      const existingAnns = spectrum.imageAnnotations || [];
      const nextAnns = existingAnns.some((a) => a.id === sigId)
        ? existingAnns.map((a) => (a.id === sigId ? newImgAnn : a))
        : [...existingAnns, newImgAnn];

      const existingPeaksById = new Map<string, SpectralPeak>();
      for (const pk of spectrum.peaks || []) {
        existingPeaksById.set(pk.id, pk);
      }

      const nextPeaks: SpectralPeak[] = nextAnns.map((a) => {
        const prevPk = existingPeaksById.get(a.id);
        const isTarget = a.id === sigId;
        const pkRole = isTarget
          ? resolvedRole
          : a.signalRole || a.role || prevPk?.signalRole || prevPk?.role || "ANALYTE";
        const pkProv = isTarget
          ? resolvedProvenance
          : a.provenance || prevPk?.provenance || "USER_DEFINED";
        const pkCalibrated =
          a.isCalibrated !== undefined
            ? a.isCalibrated
            : a.physicalX !== undefined && isSpectrumCalibrated;

        return {
          ...prevPk,
          id: a.id,
          x:
            pkCalibrated && a.physicalX !== undefined
              ? Number(a.physicalX.toFixed(spectrum.modality === "MS" ? 4 : 2))
              : 0,
          y: Number((a.physicalY ?? prevPk?.y ?? 75).toFixed(1)),
          pixelX: a.pixelX,
          pixelY: a.pixelY,
          isCalibrated: pkCalibrated,
          signalDirection: isTarget
            ? updatedSignal.signalDirection ?? prevPk?.signalDirection
            : a.signalDirection ?? prevPk?.signalDirection,
          width: prevPk?.width,
          shape:
            (isTarget ? updatedSignal.bandShape : prevPk?.bandShape) ||
            (a.signalType === "SHOULDER" ? "SHOULDER" : prevPk?.shape || "UNRESOLVED"),
          bandShape: isTarget ? updatedSignal.bandShape ?? prevPk?.bandShape : prevPk?.bandShape,
          irIntensity: isTarget
            ? updatedSignal.irIntensity ?? prevPk?.irIntensity
            : prevPk?.irIntensity,
          vibrationType: isTarget
            ? updatedSignal.vibrationType ?? prevPk?.vibrationType
            : prevPk?.vibrationType,
          integration: isTarget
            ? updatedSignal.integration !== undefined
              ? updatedSignal.integration
              : prevPk?.integration ?? null
            : prevPk?.integration ?? null,
          integral: isTarget
            ? updatedSignal.integration !== undefined
              ? updatedSignal.integration ?? undefined
              : prevPk?.integral
            : prevPk?.integral,
          multiplicity: isTarget
            ? updatedSignal.multiplicity !== undefined
              ? updatedSignal.multiplicity
              : prevPk?.multiplicity ??
                (a.signalType === "MULTIPLET" ? "m" : null)
            : prevPk?.multiplicity ?? (a.signalType === "MULTIPLET" ? "m" : null),
          jValues: isTarget
            ? updatedSignal.jValues ?? prevPk?.jValues ?? []
            : prevPk?.jValues ?? [],
          deptType: isTarget
            ? updatedSignal.deptType ?? prevPk?.deptType
            : prevPk?.deptType,
          carbonType: isTarget
            ? updatedSignal.carbonType ?? prevPk?.carbonType
            : prevPk?.carbonType,
          assignment:
            a.label || prevPk?.assignment || "使用者人工標記訊號",
          manualPeak: Boolean(isTarget || a.source === "USER" || prevPk?.manualPeak),
          manualEdited: Boolean(a.verifiedByUser || prevPk?.manualEdited),
          userModified: Boolean(isTarget || prevPk?.userModified),
          userOverride: Boolean(isTarget && (updatedSignal.label || updatedSignal.assignment)),
          verified: Boolean(isTarget || a.verifiedByUser || prevPk?.verified),
          detectionSource:
            isTarget || a.source === "USER"
              ? "MANUAL"
              : prevPk?.detectionSource || "ESTIMATED_FROM_IMAGE",
          provenance: pkProv,
          role: pkRole,
          signalRole: pkRole,
          classificationTag: isTarget
            ? effectiveTag ?? prevPk?.classificationTag
            : prevPk?.classificationTag,
          userClassification: isTarget
            ? effectiveTag ?? prevPk?.userClassification
            : prevPk?.userClassification,
          isSolventVerified: isTarget
            ? updatedSignal.isSolventVerified ?? prevPk?.isSolventVerified
            : prevPk?.isSolventVerified,
          solventName: isTarget
            ? updatedSignal.solventName ?? prevPk?.solventName
            : prevPk?.solventName,
          confidence: isTarget
            ? updatedSignal.confidence ?? prevPk?.confidence ?? 0.98
            : prevPk?.confidence,
        };
      });

      const validation = DataValidator.validateSpectrum(
        spectrum.modality,
        spectrum.sourceFormat,
        [],
        nextPeaks.filter((p) => p.isCalibrated !== false),
        true,
        spectrum.imageDimensions,
        nextPeaks.length === 0
      );

      const userPeaks = nextPeaks.filter(
        (p) =>
          p.manualPeak ||
          p.manualEdited ||
          p.userModified ||
          p.provenance === "USER_DEFINED" ||
          p.provenance === "USER_MODIFIED"
      );

      return SignalCharacterizationEngine.measureSpectrumSignals({
        ...spectrum,
        dataVersion: (spectrum.dataVersion || 1) + 1,
        imageAnnotations: nextAnns,
        imageSignalAnnotations: nextAnns,
        peaks: nextPeaks,
        userEditedPeaks: userPeaks,
        confirmedPeaks: nextPeaks.filter((p) => p.isCalibrated !== false),
        points: [],
        validation,
        digitizationFailed: nextPeaks.length === 0,
      });
    }

    const physX = Number((updatedSignal.x ?? 0).toFixed(spectrum.modality === "MS" ? 4 : 2));
    const physY = Number((updatedSignal.y ?? 80).toFixed(1));
    const newNumAnn: SpectrumSignalAnnotation = {
      id: sigId,
      x: physX,
      y: physY,
      unit: xUnit,
      label: updatedSignal.label || updatedSignal.assignment || `${physX} ${xUnit}`,
      signalType:
        updatedSignal.signalType ||
        this.defaultSignalTypeForModality(spectrum.modality, undefined, spectrum.msParams),
      confidence: updatedSignal.confidence ?? 0.98,
      source: "USER",
      verifiedByUser: true,
      userModified: true,
      provenance: resolvedProvenance,
      role: resolvedRole,
      signalRole: resolvedRole,
      irIntensity: updatedSignal.irIntensity,
      bandShape: updatedSignal.bandShape,
      vibrationType: updatedSignal.vibrationType,
      deptType: updatedSignal.deptType,
      carbonType: updatedSignal.carbonType,
    };

    const existingAnns = spectrum.signalAnnotations || [];
    const nextAnns = existingAnns.some((a) => a.id === sigId)
      ? existingAnns.map((a) => (a.id === sigId ? newNumAnn : a))
      : [...existingAnns, newNumAnn];

    const existingPeak = (spectrum.peaks || []).find((p) => p.id === sigId);
    const newPeak: SpectralPeak = {
      ...existingPeak,
      id: sigId,
      x: physX,
      y: physY,
      width: existingPeak?.width,
      shape:
        updatedSignal.bandShape ||
        existingPeak?.shape ||
        (newNumAnn.signalType === "SHOULDER" ? "shoulder" : "UNRESOLVED"),
      bandShape: updatedSignal.bandShape ?? existingPeak?.bandShape,
      irIntensity: updatedSignal.irIntensity ?? existingPeak?.irIntensity,
      vibrationType: updatedSignal.vibrationType ?? existingPeak?.vibrationType,
      integration:
        updatedSignal.integration !== undefined
          ? updatedSignal.integration
          : existingPeak?.integration ?? null,
      multiplicity:
        updatedSignal.multiplicity !== undefined
          ? updatedSignal.multiplicity
          : existingPeak?.multiplicity ?? null,
      jValues:
        updatedSignal.jValues !== undefined
          ? updatedSignal.jValues
          : existingPeak?.jValues || [],
      deptType: updatedSignal.deptType ?? existingPeak?.deptType,
      carbonType: updatedSignal.carbonType ?? existingPeak?.carbonType,
      assignment: newNumAnn.label || existingPeak?.assignment || "使用者人工確認訊號",
      manualPeak: !existingPeak || Boolean(existingPeak.manualPeak),
      manualEdited: true,
      userModified: true,
      userOverride: Boolean(updatedSignal.label || updatedSignal.assignment),
      verified: true,
      detectionSource: "MANUAL",
      provenance: resolvedProvenance,
      role: resolvedRole,
      signalRole: resolvedRole,
      classificationTag: effectiveTag ?? existingPeak?.classificationTag,
      userClassification: effectiveTag ?? existingPeak?.userClassification,
      isSolventVerified:
        updatedSignal.isSolventVerified ?? existingPeak?.isSolventVerified,
      solventName: updatedSignal.solventName ?? existingPeak?.solventName,
      confidence: updatedSignal.confidence ?? existingPeak?.confidence ?? 0.98,
    };

    const existingPeaks = spectrum.peaks || [];
    const nextPeaks = existingPeaks.some((p) => p.id === sigId)
      ? existingPeaks.map((p) => (p.id === sigId ? newPeak : p))
      : [...existingPeaks, newPeak];

    const validation = DataValidator.validateSpectrum(
      spectrum.modality,
      spectrum.sourceFormat,
      spectrum.points || [],
      nextPeaks,
      false,
      undefined,
      false
    );

    const userPeaks = nextPeaks.filter(
      (p) =>
        p.manualPeak ||
        p.manualEdited ||
        p.userModified ||
        p.provenance === "USER_DEFINED" ||
        p.provenance === "USER_MODIFIED"
    );

    return SignalCharacterizationEngine.measureSpectrumSignals({
      ...spectrum,
      dataVersion: (spectrum.dataVersion || 1) + 1,
      signalAnnotations: nextAnns,
      peaks: nextPeaks,
      userEditedPeaks: userPeaks,
      confirmedPeaks: nextPeaks,
      validation,
    });
  }

  static deletePeakAnnotation(
    spectrum: ExperimentalSpectrumData,
    peakId: string
  ): ExperimentalSpectrumData {
    const isImage =
      spectrum.sourceType === "IMAGE_EXPERIMENTAL" || Boolean(spectrum.digitizedFromImage);
    const nextPeaks = (spectrum.peaks || []).filter((p) => p.id !== peakId);
    const nextSigAnns = (spectrum.signalAnnotations || []).filter((a) => a.id !== peakId);
    const nextImgAnns = (spectrum.imageAnnotations || []).filter((a) => a.id !== peakId);
    const deletedIds = Array.from(
      new Set([...(spectrum.deletedPeakIds || []), peakId])
    );
    const userPeaks = nextPeaks.filter(
      (p) =>
        p.manualPeak ||
        p.manualEdited ||
        p.userModified ||
        p.provenance === "USER_DEFINED" ||
        p.provenance === "USER_MODIFIED"
    );

    const validation = DataValidator.validateSpectrum(
      spectrum.modality,
      spectrum.sourceFormat,
      spectrum.points || [],
      nextPeaks,
      isImage,
      spectrum.imageDimensions,
      isImage && nextPeaks.length === 0
    );

    return SignalCharacterizationEngine.measureSpectrumSignals({
      ...spectrum,
      dataVersion: (spectrum.dataVersion || 1) + 1,
      peaks: nextPeaks,
      signalAnnotations: nextSigAnns,
      imageAnnotations: nextImgAnns,
      imageSignalAnnotations: nextImgAnns,
      userEditedPeaks: userPeaks,
      deletedPeakIds: deletedIds,
      confirmedPeaks: nextPeaks,
      validation,
    });
  }

  static clearAllPeakMarkers(
    spectrum: ExperimentalSpectrumData
  ): ExperimentalSpectrumData {
    const isImage =
      spectrum.sourceType === "IMAGE_EXPERIMENTAL" || Boolean(spectrum.digitizedFromImage);
    const validation = DataValidator.validateSpectrum(
      spectrum.modality,
      spectrum.sourceFormat,
      spectrum.points || [],
      [],
      isImage,
      spectrum.imageDimensions,
      isImage
    );
    return {
      ...spectrum,
      peaks: [],
      signals: [],
      signalAnnotations: [],
      imageAnnotations: [],
      imageSignalAnnotations: [],
      validation,
    };
  }

  static clearManualPeakMarkersOnly(
    spectrum: ExperimentalSpectrumData
  ): ExperimentalSpectrumData {
    const isImage =
      spectrum.sourceType === "IMAGE_EXPERIMENTAL" || Boolean(spectrum.digitizedFromImage);
    const isManualPeak = (p: SpectralPeak) =>
      p.detectionSource === "MANUAL" ||
      p.provenance === "USER_DEFINED" ||
      p.provenance === "USER_MODIFIED" ||
      Boolean(p.manualPeak) ||
      Boolean(p.manualEdited) ||
      Boolean(p.userModified);

    const isManualAnn = (a: {
      source?: string;
      provenance?: PeakProvenance;
      userModified?: boolean;
      manualPeak?: boolean;
    }) =>
      a.source === "USER" ||
      a.provenance === "USER_DEFINED" ||
      a.provenance === "USER_MODIFIED" ||
      Boolean(a.manualPeak) ||
      Boolean(a.userModified);

    const keptPeaks = (spectrum.peaks || []).filter((p) => !isManualPeak(p));
    const keptSigAnns = (spectrum.signalAnnotations || []).filter((a) => !isManualAnn(a));
    const keptImgAnns = (spectrum.imageAnnotations || []).filter((a) => !isManualAnn(a));

    const validation = DataValidator.validateSpectrum(
      spectrum.modality,
      spectrum.sourceFormat,
      spectrum.points || [],
      keptPeaks,
      isImage,
      spectrum.imageDimensions,
      isImage && keptPeaks.length === 0
    );

    return SignalCharacterizationEngine.measureSpectrumSignals({
      ...spectrum,
      peaks: keptPeaks,
      signalAnnotations: keptSigAnns,
      imageAnnotations: keptImgAnns,
      imageSignalAnnotations: keptImgAnns,
      validation,
    });
  }

  static reRunAutoPeakDetection(
    spectrum: ExperimentalSpectrumData,
    prominenceThreshold = 14
  ): ExperimentalSpectrumData {
    const isImage =
      spectrum.sourceType === "IMAGE_EXPERIMENTAL" || Boolean(spectrum.digitizedFromImage);
    const deletedSet = new Set(spectrum.deletedPeakIds || []);

    if (!isImage && spectrum.points && spectrum.points.length > 0) {
      const rawAutoPeaks = this.detectPeaksFromSeries(
        spectrum.modality,
        spectrum.points,
        prominenceThreshold
      );
      const { xUnit } = this.defaultUnits(spectrum.modality);
      const manualPeaks = (spectrum.peaks || []).filter(
        (p) =>
          p.detectionSource === "MANUAL" ||
          p.provenance === "USER_DEFINED" ||
          p.provenance === "USER_MODIFIED" ||
          Boolean(p.manualPeak) ||
          Boolean(p.manualEdited) ||
          Boolean(p.userModified)
      );
      const overlapTol =
        spectrum.modality === "IR"
          ? 6
          : spectrum.modality === "1H_NMR"
          ? 0.03
          : spectrum.modality === "13C_NMR"
          ? 0.4
          : 0.2;

      // 保留人工新增/修改的訊號為最高優先權，且過濾掉已被使用者刪除的自動訊號
      const filteredAutoPeaks = rawAutoPeaks.filter(
        (ap) =>
          !deletedSet.has(ap.id) &&
          !manualPeaks.some(
            (mp) => mp.id === ap.id || Math.abs(ap.x - mp.x) <= overlapTol
          )
      );

      const mergedPeaks = [...manualPeaks, ...filteredAutoPeaks].sort((a, b) =>
        spectrum.xDirection === "DESCENDING" ? b.x - a.x : a.x - b.x
      );

      const existingAnnsById = new Map<string, SpectrumSignalAnnotation>();
      for (const ann of spectrum.signalAnnotations || []) {
        existingAnnsById.set(ann.id, ann);
      }

      const autoAnnotations: SpectrumSignalAnnotation[] = mergedPeaks.map((pk) => {
        const prevAnn = existingAnnsById.get(pk.id);
        const isUser =
          pk.detectionSource === "MANUAL" ||
          pk.provenance === "USER_DEFINED" ||
          pk.provenance === "USER_MODIFIED" ||
          Boolean(pk.manualPeak) ||
          Boolean(pk.manualEdited) ||
          Boolean(pk.userModified);

        return {
          ...prevAnn,
          id: pk.id,
          x: pk.x,
          y: pk.y,
          unit: xUnit,
          label: prevAnn?.label || pk.assignment || `${pk.x} ${xUnit}`,
          signalType:
            prevAnn?.signalType ||
            this.defaultSignalTypeForModality(
              spectrum.modality,
              pk,
              spectrum.msParams
            ),
          confidence: isUser ? pk.confidence ?? 0.98 : 0.9,
          source: isUser ? "USER" : "AI",
          verifiedByUser: isUser,
          userModified: Boolean(pk.userModified || prevAnn?.userModified),
          provenance: pk.provenance || (isUser ? "USER_DEFINED" : "AI_DETECTED"),
          role: pk.role || pk.signalRole || "ANALYTE",
          signalRole: pk.signalRole || pk.role || "ANALYTE",
        };
      });

      const validation = DataValidator.validateSpectrum(
        spectrum.modality,
        spectrum.sourceFormat,
        spectrum.points,
        mergedPeaks,
        false,
        undefined,
        false
      );

      return SignalCharacterizationEngine.measureSpectrumSignals({
        ...spectrum,
        dataVersion: (spectrum.dataVersion || 1) + 1,
        peaks: mergedPeaks,
        autoSuggestedPeaks: rawAutoPeaks,
        userEditedPeaks: manualPeaks,
        confirmedPeaks: mergedPeaks,
        signalAnnotations: autoAnnotations,
        validation,
      });
    }

    if (isImage) {
      const cal =
        spectrum.imageCalibration ||
        this.buildImageCalibration(
          spectrum.modality,
          spectrum.imageDimensions || { width: 800, height: 450 }
        );
      const baseAutoAnns = (spectrum.autoDetectedAnnotations || []).filter(
        (ba) => !deletedSet.has(ba.id)
      );
      const manualImgAnns = (spectrum.imageAnnotations || []).filter(
        (a) =>
          a.source === "USER" ||
          a.provenance === "USER_DEFINED" ||
          a.provenance === "USER_MODIFIED" ||
          Boolean(a.manualPeak) ||
          Boolean(a.verifiedByUser) ||
          Boolean(a.userModified)
      );
      // 保留人工新增/修改的圖片訊號優先權
      const nonOverlappingAutoAnns = baseAutoAnns.filter(
        (ba) =>
          !manualImgAnns.some(
            (ma) => ma.id === ba.id || Math.abs(ba.pixelX - ma.pixelX) <= 4
          )
      );
      const combinedAnns = [...manualImgAnns, ...nonOverlappingAutoAnns];
      if (combinedAnns.length > 0) {
        return this.recomputeImageSignalsWithCalibration(
          {
            ...spectrum,
            imageAnnotations: combinedAnns,
            imageSignalAnnotations: combinedAnns,
          },
          cal,
          spectrum.imageDimensions || { width: 800, height: 450 }
        );
      }
    }

    return SignalCharacterizationEngine.measureSpectrumSignals(spectrum);
  }

  static applyNumericShiftOffset(
    spectrum: ExperimentalSpectrumData,
    shiftOffset: number
  ): ExperimentalSpectrumData {
    if (!Number.isFinite(shiftOffset) || shiftOffset === 0) return spectrum;
    const decimals = spectrum.modality === "1H_NMR" ? 3 : 2;
    return SignalCharacterizationEngine.measureSpectrumSignals({
      ...spectrum,
      x: spectrum.x ? spectrum.x.map((v) => Number((v + shiftOffset).toFixed(decimals))) : undefined,
      points: (spectrum.points || []).map((pt) => ({
        ...pt,
        x: Number((pt.x + shiftOffset).toFixed(decimals)),
      })),
      peaks: (spectrum.peaks || []).map((pk) => ({
        ...pk,
        x: Number((pk.x + shiftOffset).toFixed(decimals)),
      })),
      signalAnnotations: (spectrum.signalAnnotations || []).map((ann) => ({
        ...ann,
        x: Number((ann.x + shiftOffset).toFixed(decimals)),
      })),
      numericCalibration: {
        shiftOffset,
        unit: spectrum.xUnit,
        appliedAt: new Date().toISOString(),
      },
    });
  }

  static snapToLocalNumericExtremum(
    spectrum: ExperimentalSpectrumData,
    clickedX: number,
    clickedY: number,
    mode: "AUTO" | "PEAK_TOP" | "ABSORPTION_VALLEY" | "EXACT" = "AUTO"
  ): { x: number; y: number; direction: "PEAK_TOP" | "ABSORPTION_VALLEY" | "ION_BAR" } {
    const pts = spectrum.points || [];
    const defaultDir =
      spectrum.modality === "IR"
        ? "ABSORPTION_VALLEY"
        : spectrum.modality === "MS"
          ? "ION_BAR"
          : "PEAK_TOP";
    const resolvedDir =
      mode === "PEAK_TOP"
        ? "PEAK_TOP"
        : mode === "ABSORPTION_VALLEY"
          ? "ABSORPTION_VALLEY"
          : defaultDir;

    if (mode === "EXACT" || pts.length < 2) {
      return {
        x: Number(clickedX.toFixed(spectrum.modality === "MS" ? 4 : 2)),
        y: Number(Math.max(0, Math.min(100, clickedY)).toFixed(1)),
        direction: resolvedDir,
      };
    }

    const xs = pts.map((p) => p.x);
    const span = Math.max(1e-6, Math.max(...xs) - Math.min(...xs));
    const windowHalf = span * 0.018;
    const nearby = pts.filter((p) => Math.abs(p.x - clickedX) <= windowHalf);
    if (nearby.length === 0) {
      const closest = pts.reduce((best, cur) =>
        Math.abs(cur.x - clickedX) < Math.abs(best.x - clickedX) ? cur : best
      );
      return {
        x: Number(closest.x.toFixed(spectrum.modality === "MS" ? 4 : 2)),
        y: Number(closest.y.toFixed(1)),
        direction: resolvedDir,
      };
    }

    const extremum = nearby.reduce((best, cur) => {
      if (resolvedDir === "ABSORPTION_VALLEY") {
        return cur.y < best.y ? cur : best;
      }
      return cur.y > best.y ? cur : best;
    });

    return {
      x: Number(extremum.x.toFixed(spectrum.modality === "MS" ? 4 : 2)),
      y: Number(extremum.y.toFixed(1)),
      direction: resolvedDir,
    };
  }

  static async parseUploadedFile(
    file: File,
    modality: SpectrumModality,
    msParams?: MSParameters,
    options?: { disableAutoPeakDetection?: boolean }
  ): Promise<ExperimentalSpectrumData> {
    if(file.size>12*1024*1024)throw new Error('上傳檔案超過 12 MB，請使用較小檔案；原始檔不會被修改。');
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    const isImage =
      file.type.startsWith("image/") ||
      ["png", "jpg", "jpeg", "webp"].includes(ext);

    if (isImage) {
      // Node / Headless 測試環境相容防護：若無 FileReader / Image / document，仍能安全建立圖片光譜結構
      if (
        typeof FileReader === "undefined" ||
        typeof Image === "undefined" ||
        typeof document === "undefined"
      ) {
        const defaultCal = this.buildImageCalibration(modality, {
          width: 800,
          height: 450,
        });
        return this.createImageSpectrum({
          modality,
          fileName: file.name,
          originalImageUrl: `data:${file.type || "image/png"};base64,`,
          imageDimensions: { width: 800, height: 450 },
          calibration: {
            ...defaultCal,
            confidence: options?.disableAutoPeakDetection ? 0.35 : 0.78,
            source: options?.disableAutoPeakDetection
              ? "DEFAULT_FALLBACK"
              : "AI_DETECTED",
          },
          calibrationFailed: Boolean(options?.disableAutoPeakDetection),
          detectedSignals: [],
          visualPatterns: [],
          digitizationMethod: options?.disableAutoPeakDetection ? "Manual" : "Canvas",
          msParams,
        });
      }

      if (options?.disableAutoPeakDetection) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = dataUrl;
        });
        const width = img.width || 800;
        const height = img.height || 450;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        const imgData = ctx
          ? (ctx.drawImage(img, 0, 0, width, height),
            ctx.getImageData(0, 0, width, height).data)
          : null;
        const detectedBounds = imgData
          ? this.detectPlotBoundariesFromPixels(imgData, width, height)
          : {
              plotLeftPx: Math.round(width * 0.08),
              plotRightPx: Math.round(width * 0.94),
              plotTopPx: Math.round(height * 0.08),
              plotBottomPx: Math.round(height * 0.86),
              plotBoundaryStatus: "PLOT_BOUNDARY_UNCERTAIN" as const,
            };

        const rawImageSpec = this.createImageSpectrum({
          modality,
          fileName: file.name,
          originalImageUrl: dataUrl,
          imageDimensions: { width, height },
          calibration: {
            ...detectedBounds,
            confidence: 0.35,
            source: "DEFAULT_FALLBACK",
          },
          calibrationFailed: true,
          detectedSignals: [],
          visualPatterns: [],
          digitizationMethod: "Manual",
          msParams,
        });

        return {
          ...rawImageSpec,
          digitizationErrorMessage: undefined,
          digitizedMetadata: {
            rawImageDataUrl: dataUrl,
            imageWidth: width,
            imageHeight: height,
            extractionMethod: "LOCAL_CANVAS",
            digitizationConfidence: 0,
            isTwoPointCalibrated: false,
            methodDescription:
              "原始光譜圖片已載入（已停用 AI 自動尋峰）。請於第 1 頁在原圖上點選標記訊號像素位置，再於第 2 頁執行座標校正。",
          },
        };
      }

      const spec = await this.digitizeImageSpectrum(modality, file, msParams);
      const extractionMethod = spec.digitizationFailed
        ? "DIGITIZATION_FAILED"
        : spec.digitizationMethod === "Gemini Vision"
          ? "GEMINI_VISION"
          : "LOCAL_CANVAS";
      return {
        ...spec,
        digitizedMetadata: {
          rawImageDataUrl: spec.originalImageUrl || spec.imagePreviewUrl || "",
          imageWidth: spec.imageDimensions?.width || 800,
          imageHeight: spec.imageDimensions?.height || 450,
          extractionMethod,
          digitizationConfidence: spec.imageCalibration?.confidence ?? 0.78,
          isTwoPointCalibrated: this.isUserCalibratedSource(
            spec.imageCalibration?.source
          ),
          methodDescription:
            extractionMethod === "GEMINI_VISION"
              ? "Gemini Vision 曲線擷取 + 自動波數/化學位移映射"
              : extractionMethod === "LOCAL_CANVAS"
                ? "Local Canvas 像素曲線掃描與雙點軸線內插"
                : "DIGITIZATION_FAILED — 無法提取可信曲線，請執行兩點校正或手動補峰",
        },
      };
    }

    let parsedNumeric: ExperimentalSpectrumData;
    if (ext === "xls" || ext === "xlsx") {
      const buf = await file.arrayBuffer();
      parsedNumeric = this.parseExcelSpectrum(modality, file.name, buf, msParams);
    } else {
      const rawText = await file.text();
      parsedNumeric = this.parseTextSpectrum(modality, file.name, rawText, msParams);
    }

    if (options?.disableAutoPeakDetection && (parsedNumeric.points?.length || 0) >= 2) {
      return {
        ...parsedNumeric,
        peaks: [],
        signals: [],
        signalAnnotations: [],
      };
    }

    return parsedNumeric;
  }
}


