# IR 座標軸校正現況調查（v1.1.7-hotfix.2 工作一）

基準：`ca9066b`（1.1.7-hotfix.1）。本文件只描述現況，依程式碼與合成資料（`tests/irAxisFixture.ts`）的實際輸出整理。

## 1. 完整程式路徑

UI「套用校正」：`App.tsx` `handleApplyCalibration`（:1006）
- 進階面板開啟且模式為 `THREE_POINT` → `WorkbenchOrchestrator.applyThreePointCalibration(spec,{pointA,pointB,pointC})`
- 其他 → `WorkbenchOrchestrator.applyTwoPointCalibration(spec,{pointA,pointB})`

### 1.1 兩點校正

`WorkbenchOrchestrator.applyTwoPointCalibration`（`workbenchOrchestrator.ts`）：

**圖片光譜**（`digitizedFromImage` 或 `IMAGE_*` 來源）→ `SpectrumParser.calibrateImageFromTwoPoints`（`spectrumParser.ts:1728`）：
- `slope = (B.physicalX − A.physicalX) / (B.pixelX − A.pixelX)`，`intercept = A.physicalX − slope × A.pixelX`。
- `xAxisStart／xAxisEnd` 由 `plotLeftPx／plotRightPx` 依同一直線換算。
- 診斷欄位：`rSquared = 1`、`residuals = [0,0,0]`、`rmse = 0`、`calibrationQuality = "GOOD"`（兩點必然完全吻合）；`referencePoint2` 是 A、B 的中點，不是使用者的點。
- 接著 `recomputeImageSignalsWithCalibration`（見 1.3）。
- orchestrator 包裝層最後把 `points` 設為空陣列，並更新 `digitizedMetadata`。

**數值光譜** → 不使用像素：把整個舊 X 範圍（點與峰的最小～最大值）**線性拉伸**到 `[min(A,B), max(A,B)]` 的物理值；只移動點與峰的 X，重算 `DataValidator`。若兩個校正值不是光譜兩端，整條光譜會被壓縮或拉伸。

### 1.2 三點最小平方（3-Point OLS）與軸向診斷

`WorkbenchOrchestrator.applyThreePointCalibration` → `SpectrumParser.calibrateImageFromThreePoints`（`spectrumParser.ts:1557`）。**圖片與數值光譜都走這個函式**（見第 2 節）。
- 驗證：三點都必須有限、像素不重複、物理值不重複，否則 `calibrationFailed`，各點標 `INVALID`，品質 `POOR`。
- 最小平方：`slope = Sxy / Sxx`、`intercept = ȳ − slope × x̄`；殘差 `rᵢ = physicalᵢ − (slope × pixelᵢ + intercept)`；`R² = 1 − SSres / Syy`；`RMSE = √(SSres / 3)`；`normalizedRMSE = RMSE / 物理跨度`。
- 方向：依像素排序後兩段斜率同號才算 `sameDirection`。
- 品質：
  - GOOD：同向、R² ≥ 0.998、nRMSE ≤ 0.015
  - ACCEPTABLE：同向、R² ≥ 0.985、nRMSE ≤ 0.045
  - 其他為 POOR
- 每點狀態：`|rᵢ| / 跨度 ≤ 0.025` 為 `VALIDATED`，否則 `HIGH_RESIDUAL`。
- **POOR 時不套用校正**：回傳 `calibrationFailed: true` 與訊息「校正點可能選取錯誤，或圖片 X 軸存在非線性失真，請重新確認。」，峰位維持未校正。
- 非 POOR → `recomputeImageSignalsWithCalibration`。

**第三點的作用**：參與最小平方擬合（影響斜率與截距）並提供殘差診斷，但模型仍是單一直線，不能修正分段座標軸。

**以使用者實測點驗算**（3000 → 331、1500 → 824、500 → 1319）：
- 斜率 −2.530 cm⁻¹/px，殘差約 +84、−168、+85 cm⁻¹。
- R² = 0.9866，nRMSE = 0.048 → **POOR，校正不套用**。
- 合成圖片重現同樣結果（`tests/goldens/irLinearCalibration.hotfix1.json`）。
- 兩點校正（3000、500）判為 GOOD，但同一直線使 1600 cm⁻¹ 的帶被換算到約 1800 cm⁻¹ 附近。這與使用者回報的「1600 附近的帶被標成 1800–1880」一致。

### 1.3 校正後如何轉換「標記」（任意數量）

`recomputeImageSignalsWithCalibration`（`spectrumParser.ts:1804`）：
1. 取 `imageAnnotations`；沒有時由舊 `peaks` 以**舊校正**的 `physicalToPixelX` 反推像素。
2. 每個標記以 `pixelToPhysicalX(ann.pixelX, 新校正)` 重算 `physicalX`；若標籤是自動座標字串則一併更新。
3. 重建 `peaks`：**保留原 `id`、`pixelX`、`pixelY`** 與所有既有欄位，只更新 `x`（IR 取兩位小數）與 `isCalibrated`。
4. `autoDetectedAnnotations` 同樣換算。
5. IR 描線 `irPixelCurve` 以 `pixelToPhysicalX` 換算成物理座標（Y 以 `100 × (plotBottomPx − y) / (plotBottomPx − plotTopPx)`），執行 `processIRSeries`，把不在既有峰 3 cm⁻¹ 內的偵測峰加入。
6. 交給 `SignalCharacterizationEngine.measureSpectrumSignals`。

標記數量沒有上限；所有標記都經過同一個 `pixelToPhysicalX`。

## 2. 圖片光譜與數值光譜是否共用

| 項目 | 圖片光譜 | 數值光譜 |
|---|---|---|
| 兩點 | `calibrateImageFromTwoPoints`（像素 → 物理直線） | orchestrator 內的線性範圍拉伸（不使用像素） |
| 三點 | `calibrateImageFromThreePoints` | **同一個圖片函式**：以預設圖片尺寸建立圖片校正，標記由舊校正反推像素，orchestrator 再把 `points` 清空 → 數值曲線被丟棄，這條路徑實際上不適合數值光譜 |
| 換算函式 | `pixelToPhysicalX`／`physicalToPixelX`（`spectrumParser.ts:1294／1334`） | 不經過換算函式 |
| 另一套換算 | `irManualBaseline.ts` 的 `pixelIRX`：IR 處理把 `irPixelCurve` 轉成波數時**自己**用 slope／intercept → referencePointA／B → plot 邊界，未經 `pixelToPhysicalX`；`irSignalProcessing.ts:147` 換算峰的 `observedRange` 也用它 | — |
| UI 端換算 | `SpectrumViewer` 使用 `pixelToPhysicalX`／`physicalToPixelX`；`App.tsx` 的即時預覽用 `pixelToPhysicalX`；**`PeakObservationTable.tsx` 編輯已校正圖片峰位置時自己用 slope／intercept 反推 `pixelX`** | — |

結論：圖片光譜的峰位換算集中在 `pixelToPhysicalX`，但另有兩處各自實作直線換算（`pixelIRX` 與 `PeakObservationTable`）。新增任何非直線模式都必須三處一起更新，否則觀測峰與 IR 處理用的描線會落在不同座標上。

## 3. 校正後的峰位是否寫回觀測，以及消費端

會。校正結果直接寫回 `spectrum.peaks[].x`（保留 ID），並透過 `irPixelCurve` 的換算影響 IR 處理：

1. `WorkbenchOrchestrator.prepareModeAEvidence` → `observationSpectrum` → `SpectralEvidenceExtractor.extractAllEvidence` → `ChemicalFeatureEngine.extractIntegratedConstraints` → `IRAnalysisEngine.analyzeExperimentalIR`（產生 `irFindings` 與官能基約束）。
2. `prepareIR`（`irSignalProcessing.ts`）：校正來源為 USER_* 的圖片會以 `physicalIRInputs`（`pixelIRX`）把描線轉成波數，執行 `processIRSeries` 產生自動峰，並為手動峰補上強度與峰型。消費者：
   - `hypothesisGenerator.collectObservedEvidence`（ObservedEvidence → N 證據、組成推斷、假設、局部結構）
   - `evidenceLedger.buildScientificEvidence`／`scoreScientificEvidence`（IR 候選評分）
   - `composition/functionalGroupBounds`、`nitrogenEvidence`、`structurePlausibility`（IR 帶證據）
   - `measureIRBandMorphology`（寬窄判定）
   - 舊評分器 `SpectrumConsistencyEvaluator`
3. Mode B 的「可選實驗比對」（`PredictionAndValidationFramework.compareModality`）使用同一份實驗光譜的峰。
4. UI：`SpectrumViewer` 疊圖與標記位置、`PeakObservationTable` 的位置欄、校正頁的即時預覽表。

因此錯誤的座標軸會同時影響 IR 歸屬、官能基判讀、N 證據、組成推斷與候選評分。

## 4. hotfix.1 峰偵測門檻與「平坦區假峰」的重新檢視

使用者比對後確認，先前被當成「平坦區假峰」的點其實落在真實吸收帶上，只是座標軸被直線換算後標到錯誤波數。在合成圖片上用兩點直線校正重現：真實帶仍被偵測到，只是波數偏移。hotfix.1 的突出度與平坦區門檻只作用在偵測階段，真實帶的突出度遠高於門檻；這點由 `tests/irPiecewiseCalibration.test.ts` 的驗收 E 以合成光譜（強帶、相鄰窄帶、寬帶旁的帶、整數像素描線）驗證。
