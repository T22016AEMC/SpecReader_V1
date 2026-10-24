# V1.1.8 修補：IR 圖片校正後重新找峰的強度與殘影

基準 `1.1.7`（PR #6，`405f530`）。package.json 版本 `1.1.8`。只含工程測試的 pass/fail，不含任何準確度宣稱；測試只用自造的合成資料。

## 問題與重現

- **A（強度顛倒）：成立。** `SpectrumParser.recomputeImageSignalsWithCalibration` 在校正後對 `irPixelCurve` 重新呼叫 `processIRSeries`，加入的峰 `y` 是扣基線後的吸收高度（最強帶 = 100）；描線與數值檔路徑用的是描線自身的值（穿透率方向，強帶最低）。合成圖重現：最深的帶（1240 cm⁻¹）y = 100，描線在該處是 35；另一些帶也是 66.3 對 55.1、38.7 對 71.2 等，順序相反。
- **B（重複校正殘影）：引擎層不成立。** 每次校正都從 `imageAnnotations` 重建峰表，重新偵測的峰不會帶到下一次，所以不會留下舊波數（2 點 → 分段 → 2 點的結果與各自單獨校正完全相同，修改前也相同）。**但發現相關缺陷**：使用者在表格中修改過的「重新偵測峰」沒有像素位置，也不在標記清單裡，下次校正時整個被丟掉（修改遺失）。

## 修正（`src/engines/spectrumParser.ts`，`recomputeImageSignalsWithCalibration`）

1. 重新偵測峰的 `y` 換回描線在該 x 的值（與數值檔路徑用 `rawPoints` 換回的做法一致）；峰同時帶 `pixelX`、`pixelY`（原始像素），id 改為由像素決定的 `ir-auto-px<pixelX>`（原本是 `ir-series-<索引>`，換校正後索引會漂移）。
2. 選擇的做法：**每次校正重新產生重新偵測峰**（不保留舊的），並且**保留使用者修改過的重新偵測峰**（`userModified`／`manualEdited`／`manualPeak` 且有 `pixelX`，不在標記清單中者），依 `pixelX` 以新校正重新換算 x，其餘欄位不動。原因：重新偵測峰是校正的衍生物，重算最單純；使用者的修改必須保留；這需要像素位置才能重新換算，所以重新偵測峰要帶 `pixelX`。
3. 2 點、3 點、分段三種校正都經過同一個函式，套用同一修正。
4. 沒有改峰偵測的門檻與演算法、基線、平滑、校正換算；沒有改 UI 版面。

檢查過的強度相關欄位（重新偵測峰）：`y`（已換回描線值）；由 `y` 推得的 `relativeIntensity`、`normalizedIntensity`（由 `SignalCharacterizationEngine.measureSpectrumSignals` 依 `y` 計算，同一份峰表同一定義，測試確認與 `y` 同序）；`prominence`、`area`、`relativeArea`、`localBaseline`、`signalToNoise`、`width`、`fwhm`、`asymmetry`（processIRSeries 的基線校正單位，與數值檔路徑一致，沒有改）。

## 發現但沒有改的事項（需要你決定）

- 第 1 頁手動標記的 `y`：未校正時是預留值 65；校正後由 `pixelToPhysicalIntensity` 算，IR 公式是 `100 − 高度×0.85`（上方高穿透 → 小值），與描線的 `y`（上方高穿透 → 大值）方向相反。這是另一套既有定義，影響範圍廣（檢視器、標記），依指示本版只修重新偵測峰，沒有動它。

## 測試（只含 pass/fail）

- typecheck、build：pass。vitest 380/380（既有 374 個沒有改動，新增 6 個）。E2E 21/21（沒有改動）。
- T1：重新偵測峰的 y 與描線在該 x 的值相差 < 0.6；最深的帶 y 最低、最弱的帶 y 最高；強度欄位同序。pass
- T2：2 點 → 分段 → 2 點，每次峰集合（x、y、id）與單獨做該次校正相同，第三次與第一次相同。pass
- T3／T3b：手動標記與修改過的峰多次校正後保留、依原始像素換算；使用者修改過的重新偵測峰保留且不重複。pass
- T4：數值檔 IR 輸出與修改前完全相同（`tests/goldens/irNumeric.pre118.json`，在修改前於未改動的程式碼上擷取）。pass
- T5：完整流程（合成圖 → IR 證據 → N 證據）：強帶仍是證據中強度最高者；真正的硝基對判為 N 證據、烷基芳香判為無。pass（這一項在修改前也通過，因為證據流程會從描線重新處理，所以它是迴歸保護，不是重現）。
- 修改前，T1 與 T3b 失敗（見重現）。沒有修改任何既有測試的預期值。

## 已知限制

- 手動標記的 y 定義（上段）仍與描線不同。
- 重新偵測峰的 id 由像素決定；舊版保存的結果仍是 `ir-series-*`，重新校正後會換成新 id。
