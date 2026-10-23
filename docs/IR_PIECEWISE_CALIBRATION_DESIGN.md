# IR 分段線性校正：UI 設計（v1.1.7-hotfix.2，待審核）

> 狀態：**設計稿，尚未實作 UI。** 計算層（`axisCalibration.ts`、`axisCalibrationConfig.ts`、`SpectrumParser.calibrateImageFromPiecewise`、`WorkbenchOrchestrator.applyPiecewiseCalibration` / `checkCalibrationLinearity`）已完成並有合成資料測試（commit 41513d6）。本文件只描述 UI 怎麼接上去。
>
> 原則：現有「2 點校正」與「進階選項：三點最小平方法校正 (3-Point OLS) 與軸向診斷」的版面、預設值、行為完全不變；只新增一個收合區塊與少量狀態。

## 1. 現況（Mode A 第 2 頁，右側校正面板，`src/App.tsx`）

- 狀態：`calibrationMode: "TWO_POINT" | "THREE_POINT"`（預設 `TWO_POINT`）、`showAdvancedCalibration`、`calibPointA/B/C`、`nextCalibTarget: "A" | "B" | "C"`、`calibrationMessage`。
- 點圖：左側 `SpectrumViewer`（`imageInteractionMode="CALIBRATE"`）以 `onPickImagePixel` 依 `nextCalibTarget` 填入 A → B →（3 點模式時）C。
- 即時預覽：`liveCalibrationPreview`（只用 A、B 組成直線）→ `livePreviewMapPixelX` 與「第 1 頁標記訊號座標轉換即時預覽」表。
- 套用：`handleApplyCalibration` → `applyTwoPointCalibration` 或 `applyThreePointCalibration`。

## 2. 新增項目（最小新增）

### 2.1 模式

- `calibrationMode` 型別擴充為 `"TWO_POINT" | "THREE_POINT" | "PIECEWISE"`，預設仍是 `TWO_POINT`。
- 在現有「進階選項：三點…」收合區塊**下方**新增第二個同樣樣式的收合按鈕：

  `進階選項：分段線性校正（座標軸中途換比例時使用）`

- 兩個進階區塊互斥：打開分段區塊時，3 點區塊自動收合、模式設為 `PIECEWISE`；收合分段區塊時回到 `TWO_POINT`（與現有 3 點區塊收合時的行為一致）。

### 2.2 校正點（最多 5 個：A–E）

- 分段模式沿用既有 A、B、C 三個點的狀態與輸入欄（不另開一套），另新增 `calibPointD`、`calibPointE`（初始為「未設定」）。
- 分段區塊內列出 C、D、E 三列（A、B 已在上方原位置），每列：`點圖取樣 X` 按鈕、Pixel X / Y、實際刻度值；D、E 各有「清除」按鈕。實際送出的點 = A、B + 已設定的 C／D／E（2–5 點）。
- `nextCalibTarget` 擴充為 `"A" | "B" | "C" | "D" | "E"`。分段模式下點圖順序 A → B → C → D → E → A；跳過的點不送出。
- 面板顯示一行說明：`點的順序不限，系統會依像素位置排序；相鄰兩點之間各自線性換算，兩端外推沿用最近一段。`

### 2.3 預設勾選框（只在 IR 且分段模式顯示）

- `☐ IR 座標軸在 2000 cm⁻¹ 處換比例（2:1）`（文字取自 `AXIS_CALIBRATION_CONFIG.presets.IR_SCALE_BREAK_2000.label`），**預設不勾**。
- 下方小字：`此預設依使用者回報的圖譜座標特性設定，僅在你確認圖片座標軸確實如此時勾選。`
- 勾選後，系統依 config 的轉折位置與比例推出 2000 cm⁻¹ 轉折點；推出的轉折點在預覽表下以 `推定轉折點：px ≈ 577.5 → 2000 cm⁻¹（由預設推出）` 列出，讓使用者看得到。

### 2.4 即時預覽

- 分段模式下 `liveCalibrationPreview` 改由 `buildPiecewiseAxis(points, {presetId})` 組成含 `piecewiseKnots` 的校正物件；因為 `SpectrumParser.pixelToPhysicalX` 已支援分段，`livePreviewMapPixelX` 與預覽表不需改動就會使用同一套換算。
- 若 `buildPiecewiseAxis` 回傳錯誤，預覽表標頭右側（原「請設定兩個不同刻度點」位置）顯示該錯誤文字（紅字），套用按鈕停用。
- `calibrationPreviewPoints` 在分段模式顯示 A–E 中已設定的點（C 紫、D 綠 `#34d399`、E 粉 `#f472b6`）。

### 2.5 套用

- 套用按鈕文字：`套用分段線性校正並轉換 N 個標記訊號`。
- `handleApplyCalibration` 新增 `PIECEWISE` 分支 → `WorkbenchOrchestrator.applyPiecewiseCalibration(spec, {points, presetId})`。
  - 失敗（`calibrationFailed`）：`calibrationMessage` 設為 ERROR，顯示 `digitizationErrorMessage`（例如「校正點順序不一致：…」），光譜不變。
  - 成功：SUCCESS 訊息 `分段線性校正成功 (IR)！共 K 段，轉換 N 個訊號標記；原始像素座標已完整保留。`（有預設時附 `（含預設推定轉折點 2000 cm⁻¹）`）。
- 現有 A/B 間距 < 5 px 與 A、B 數值相同的前置檢查只用在 2 點／3 點分支；分段分支由 `buildPiecewiseAxis` 的驗證負責（已涵蓋重複、過近、順序不一致等）。

### 2.6 非線性警告（2 點與 3 點模式，不阻擋）

- 文字：`座標軸可能非線性，建議使用分段線性模式`（`AXIS_CALIBRATION_CONFIG.linearityWarningText`）。
- 判斷：`WorkbenchOrchestrator.checkCalibrationLinearity(calibration, checkPoints)`，殘差 > `linearityResidualFractionOfSpan × 數值跨距`（目前 0.5%）就警告。
- 3 點模式：檢查點為 A、B、C（以套用後或預覽中的直線換算）。
- 2 點模式：需要第三個點才能判斷，見 §4 待決問題 1。
- 位置：套用按鈕正上方一個琥珀色提示框（與現有 `calibrationWarning` 同樣式），並附一個 `改用分段線性校正` 文字按鈕（點了只是打開分段區塊、保留已輸入的 A/B/C，不自動套用）。套用成功訊息末尾也附同一句警告。
- 警告只是提示：不改變任何校正結果，也不擋套用。

### 2.7 狀態標籤與峰表

- `SpectrumViewer.tsx:319` 目前把非 `THREE_POINT` 都標成「2-Point 已校正」。新增 `PIECEWISE` → `分段線性 已校正`（只加一個條件，其餘不動）。
- `PeakObservationTable.tsx:40` 使用者手改位置時，自己用 slope/intercept 反推像素，分段校正下會算錯。改為呼叫 `SpectrumParser.physicalToPixelX(v, c)`；在 2 點／3 點校正下該函式與現有公式結果相同，行為不變（會加測試證明）。

## 3. 測試計畫（UI 階段）

- vitest：預覽組裝（分段 → `pixelToPhysicalX` 與套用後結果一致）、PeakObservationTable 反推像素在直線校正下與舊公式相同、分段校正下回到正確像素。
- E2E 新增 1 支：上傳合成分段軸 IR 圖 → 打開分段區塊 → 輸入 3000/1500/500 + 勾預設 → 套用 → 峰表位置落在容許值內；另驗證 2 點模式出現非線性警告但仍可套用。
- 既有 vitest 與 15 支 E2E 全部須通過；若有預期值改動會逐條列在 REPORT。

## 4. 審核決定（使用者已回覆；版面與文字細節仍待使用者另行審核，之後才實作 UI）

1. **2 點模式線性度檢查點**：採用。新增「線性度檢查點（選填，只檢查、不參與校正）」，放在既有「進階選項」區塊內，不新增版面區塊。（§2.6 的位置描述以此為準，實作前再依使用者的版面意見調整。）
2. **吸光度單位的峰偵測方向**：本版不動，列為已知限制（REPORT 與 KNOWN_LIMITATIONS 記載）。
3. **3 點校正不合格卻顯示成功**：改為依實際結果顯示；失敗時顯示明確的繁體中文失敗原因（含品質等級、R²、nRMSE 與未套用的說明）。**每一處改動的 UI 文字須逐項列進 `V1_1_7_hotfix2_CHANGELOG.md`**（舊文字 → 新文字 → 位置）。
4. **適用範圍**：分段模式只給 IR；NMR 圖片不開放（分段區塊與預設都只在 IR 顯示）。
