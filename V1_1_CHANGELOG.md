# V1.1 操作與科學資料流修復（工程版本 1.1.1）

修復分支 `fix/v11-ir-image-calibration-environments`，起點 `a58db3c`；保留 V1 基準 `v1-baseline-e190a8d` 及先前 V1.1 歷史。未修改 V0 或其他專案。

- `SpectrumViewer.tsx`／`IRCalibrationTools.tsx`：移除第 1 頁基線控制；第 2 頁原圖 SVG 預設顯示五點與連線，Pointer Capture 拖曳 X/Y。控制點位於疊加層最上方；懸停座標資訊改為浮層，避免工具列換行移動畫布、導致滑鼠誤點校正。縮放沿用同一圖片座標。
- `App.tsx`：兩個第 2 頁檢視器均接入草稿與正式設定回呼。草稿跨頁保留，套用才更新正式來源；座標校正、標峰與設定更新經同一版本化流程。第 3 頁顯示設定版本、訊號／特徵變化與候選順序狀態。
- `irManualBaseline.ts`／`irSignalProcessing.ts`：原圖不翻轉；曲線與五點同時映射物理座標，使用有符號吸收方向差值，不取絕對值。保留原始、基線與校正訊號；停用五點使用原尺度參考背景。圖片無可靠 Y 刻度只作相對強度。
- `irBandKnowledge.ts`／`irEngine.ts`／`evidenceLedger.ts`：區間、化學環境、峰型／寬度、相對強度與不同伴隨峰共同產生競爭假設；候選分子圖選出同一知識庫可支持的振動特徵，再與實測比較。每原始峰只計一次。IR 假設不再變成 REQUIRED／EXCLUDED 或無覆蓋範圍的羰基 ABSENT 硬限制。
- 人工 IR 標峰新增尖峰／寬峰／肩峰與寬峰起訖；`workbenchOrchestrator.ts` 修復更新時遺失 shape／width／range／override 的問題，`spectrumParser.ts` 校正時保留標記欄位。
- `nmrAtomicEnvironmentModel.ts`：原圖環境預測移至明確模組；移除 `nmrEngine.ts` 已知分子完整光譜回退，未知溶劑不再預設 CDCl3。舊 `nmrReferenceDatabase.ts` 只作相容匯出。
- `atomicChemicalEnvironment.ts`：共用圖描述、¹H／¹³C 訊號競爭局部環境、條件與不確定性；人工多重性、相對積分、可選 J／交換資訊保留。一般 ¹³C 不再預設 CH；預留 2D 關聯約束資料結構。
- MS 類沿用質量／結構碎片限制，單獨 MS 類有能力提醒但仍可分析。De novo 仍是 RDKit 驗證的有界分子圖搜尋，明示九重原子、組成與資源限制，未盲目擴大。

工程測試不代表科學準確度。先前基線驗收主要使用 CSV，不能證明原圖互動；本次加入原圖真實滑鼠拖曳與套用版本檢查。
