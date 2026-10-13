import {
  DataPoint,
  DataValidationIssue,
  DataValidationResult,
  SpectralPeak,
  SpectrumModality,
} from "../types/spectrum";

export class DataValidator {
  static validateSpectrum(
    modality: SpectrumModality,
    fileFormat: string,
    points: DataPoint[],
    peaks: SpectralPeak[],
    digitizedFromImage: boolean = false,
    imageDimensions?: { width: number; height: number },
    digitizationFailed: boolean = false
  ): DataValidationResult {
    const issues: DataValidationIssue[] = [];
    let qualityScore = 100;

    if (digitizationFailed && points.length === 0 && peaks.length === 0) {
      issues.push({
        severity: "error",
        code: "IMAGE_DIGITIZATION_FAILED",
        message: "無法可靠從此圖片擷取光譜資料（圖片解析度不足、缺乏清晰座標軸，或尚未標記訊號峰）。",
        recommendation: "請使用兩點/三點座標校正並在原圖上手動標記訊號峰，或匯入 CSV / JCAMP-DX 數值檔。",
      });
      return {
        isValid: false,
        qualityScore: 0,
        dataQuality: "LOW",
        fileFormat,
        pointCount: 0,
        xRange: [0, 0],
        yRange: [0, 0],
        missingValuesCount: 0,
        duplicateXCount: 0,
        xAxisOrdered: true,
        baselineDriftDetected: false,
        insufficientResolution: true,
        digitizationFailed: true,
        issues,
      };
    }

    // 1. 檢查檔案格式
    const validFormats = [
      "EXCEL",
      "CSV",
      "TXT",
      "JCAMP-DX",
      "PNG",
      "JPG",
      "JPEG",
      "WEBP",
      "IMAGE",
      "IMAGE_DIGITIZED",
      "MANUAL",
      "PRESET",
      "SIMULATED",
    ];
    if (!validFormats.includes(fileFormat.toUpperCase())) {
      issues.push({
        severity: "error",
        code: "INVALID_FORMAT",
        message: `不支援的光譜檔案格式：${fileFormat}`,
        recommendation: "請上傳 XLSX、XLS、CSV、TXT、JCAMP-DX (.jdx/.dx)、PNG、JPG 或 WEBP 格式檔案。",
      });
      qualityScore -= 40;
    }

    // 2. 檢查缺漏值 / NaN
    let missingValuesCount = 0;
    const validPoints: DataPoint[] = [];
    for (const pt of points) {
      if (
        pt === null ||
        pt === undefined ||
        Number.isNaN(pt.x) ||
        Number.isNaN(pt.y) ||
        !Number.isFinite(pt.x) ||
        !Number.isFinite(pt.y)
      ) {
        missingValuesCount++;
      } else {
        validPoints.push(pt);
      }
    }

    if (missingValuesCount > 0) {
      issues.push({
        severity: "warning",
        code: "MISSING_OR_NAN_VALUES",
        message: `偵測到 ${missingValuesCount} 筆缺值或非數值 (NaN) 座標，已自動過濾。`,
        recommendation: "請檢查原始檔案之分隔符號或移除異常標頭文字。",
      });
      qualityScore -= Math.min(20, missingValuesCount * 2);
    }

    // 3. 檢查重複 X 座標與 X 軸順序
    let duplicateXCount = 0;
    let xAxisOrdered = true;
    const seenX = new Set<string>();
    let increasingCount = 0;
    let decreasingCount = 0;

    for (let i = 0; i < validPoints.length; i++) {
      const key = validPoints[i].x.toFixed(4);
      if (seenX.has(key)) {
        duplicateXCount++;
      }
      seenX.add(key);

      if (i > 0) {
        if (validPoints[i].x > validPoints[i - 1].x) increasingCount++;
        else if (validPoints[i].x < validPoints[i - 1].x) decreasingCount++;
      }
    }

    if (increasingCount > 0 && decreasingCount > 0) {
      xAxisOrdered = false;
      issues.push({
        severity: "warning",
        code: "UNORDERED_X_AXIS",
        message: "X 軸座標非單調遞增或遞減，SpecReader 已自動完成座標排序。",
        recommendation: "建議確認匯出數據點是否按單一方向排列。",
      });
      qualityScore -= 8;
    }

    if (duplicateXCount > 0) {
      issues.push({
        severity: "info",
        code: "DUPLICATE_X_COORDINATES",
        message: `偵測到 ${duplicateXCount} 筆重複的 X 軸座標，已自動平均其強度值。`,
        recommendation: "請檢查儀器匯出步長設定。",
      });
      qualityScore -= 4;
    }

    // 4. 檢查 X 與 Y 軸範圍及異常強度
    const xs = validPoints.length > 0 ? validPoints.map((p) => p.x) : peaks.map((p) => p.x);
    const ys = validPoints.length > 0 ? validPoints.map((p) => p.y) : peaks.map((p) => p.y);
    const minX = xs.length > 0 ? Math.min(...xs) : 0;
    const maxX = xs.length > 0 ? Math.max(...xs) : 100;
    const minY = ys.length > 0 ? Math.min(...ys) : 0;
    const maxY = ys.length > 0 ? Math.max(...ys) : 100;

    if (minY < -15 || maxY > 1e8) {
      issues.push({
        severity: "warning",
        code: "ABNORMAL_INTENSITY_SCALE",
        message: `偵測到異常強度動態範圍 ([${minY.toFixed(1)}, ${maxY.toFixed(1)}])，已正規化至 0–100% 全尺度。`,
        recommendation: "請確認偵測器是否飽和或基線是否過度負偏。",
      });
      qualityScore -= 10;
    }

    // 5. 檢查基線偏移
    let baselineDriftDetected = false;
    if (validPoints.length > 20 && modality !== "MS") {
      const edgeLeft = validPoints.slice(0, 5).reduce((s, p) => s + p.y, 0) / 5;
      const edgeRight = validPoints.slice(-5).reduce((s, p) => s + p.y, 0) / 5;
      if (Math.abs(edgeLeft - edgeRight) > 14 || Math.min(edgeLeft, edgeRight) > 18) {
        baselineDriftDetected = true;
        issues.push({
          severity: "warning",
          code: "BASELINE_DRIFT",
          message: `偵測到基線傾斜或偏移 (Δ = ${Math.abs(edgeLeft - edgeRight).toFixed(1)}%)，已套用自動基線校正。`,
          recommendation: "定量分析前建議先檢視原始基線。",
        });
        qualityScore -= 7;
      }
    }

    // 6. 檢查解析度與點密度
    let insufficientResolution = false;
    if (validPoints.length > 0 && validPoints.length < 30 && modality !== "MS") {
      insufficientResolution = true;
      issues.push({
        severity: "warning",
        code: "LOW_SPECTRAL_RESOLUTION",
        message: `資料點密度較低 (${validPoints.length} 點)，峰寬與精細耦合分裂的不確定度較高。`,
        recommendation: "若有原始高解析度 JCAMP-DX 或 CSV 檔案建議優先提供。",
      });
      qualityScore -= 12;
    }

    // 7. 圖片數位化品質提示
    if (digitizedFromImage) {
      issues.push({
        severity: "info",
        code: "DIGITIZED_IMAGE_APPROXIMATION",
        message: "此光譜由點陣圖檔 (PNG/JPG) 數位化擷取，峰位座標為視覺估計值。",
        recommendation: "請於峰值表中檢視數位化結果，並視需要手動微調峰位。",
      });
      qualityScore -= 10;

      if (imageDimensions && (imageDimensions.width < 450 || imageDimensions.height < 220)) {
        insufficientResolution = true;
        issues.push({
          severity: "warning",
          code: "LOW_IMAGE_QUALITY",
          message: `上傳圖片解析度偏低 (${imageDimensions.width}×${imageDimensions.height} px)，細微分裂峰可能模糊。`,
          recommendation: "建議上傳寬度 ≥ 1000 px 之清晰光譜圖或直接提供 CSV 數值檔。",
        });
        qualityScore -= 15;
      }
    }

    if (validPoints.length === 0 && peaks.length === 0) {
      issues.push({
        severity: "error",
        code: "CORRUPTED_OR_EMPTY_DATA",
        message: "無法從輸入資料中擷取任何有效光譜座標或峰值。",
        recommendation: "請確認檔案包含有效之 X, Y 數值欄位或手動新增峰值。",
      });
      qualityScore = 0;
    }

    const clampedScore = Math.max(0, Math.min(100, qualityScore));
    const dataQuality =
      clampedScore >= 80 ? "HIGH" : clampedScore >= 50 ? "MEDIUM" : "LOW";

    return {
      isValid: clampedScore > 25 && (validPoints.length > 0 || peaks.length > 0),
      qualityScore: clampedScore,
      dataQuality,
      fileFormat,
      pointCount: validPoints.length,
      xRange: [Number(minX.toFixed(2)), Number(maxX.toFixed(2))],
      yRange: [Number(minY.toFixed(2)), Number(maxY.toFixed(2))],
      missingValuesCount,
      duplicateXCount,
      xAxisOrdered,
      baselineDriftDetected,
      insufficientResolution,
      digitizationFailed: false,
      issues,
    };
  }
}
