# V1.1 修復版部署與工程紀錄

正式來源：[Public GitHub](https://github.com/T22016AEMC/SpecReader_V1)。本輪修復分支 `fix/v11-ir-image-calibration-environments`，起點 main `a58db3c`；保留 V1 `v1-baseline-e190a8d` 及先前 V1.1 分支歷史。工程版本 **1.1.1**。

既有獨立服務：[SpecReader HTTPS](https://specreader-v1.onrender.com)，Render `srv-db6udpgu01pc73bl1tog`，My Workspace `tea-db6qffon74is738k4q30`，免費 Node。未新建付費資源，未修改 EluSim／V0。

Build：`npm install -g pnpm@11.25.0 && pnpm install --frozen-lockfile && pnpm run build`。Start：`node dist/server.mjs`。Node24.19.0，NODE_ENV=production，PORT由平台提供並綁0.0.0.0；EXTERNAL_API_TIMEOUT_MS=20000。密鑰僅可放伺服器環境；本地科學引擎及 IR 像素處理不依賴 Gemini。

2026-10-15 工程檢查：

- `node node_modules/typescript/bin/tsc --noEmit` 通過。
- `pnpm run build`：Vite 前端與 esbuild 後端通過；保留 bundle 體積提示，未停用型別／移除測試。
- 七個受影響測試檔 **54/54** 通過：`irNmrRepairFlow`、`irProcessing`、`nmrJointEvidence`、`evidenceLedger`、`api`、`modeBAndIndependence`、`v11Engineering`。
- Chrome 桌面 **10/10** 通過：雙模式、API／WASM、CSV與人工標峰／排名、六模態獨立上傳、新原圖五點拖曳／縮放／校正／保留／重設／套用／停用及數值基線。原圖測試檢查真實滑鼠命中、五點逐一變更、連線更新、圖片 URL 不變、校正未誤觸、第3頁訊號簽章更新及 IR 區間推論可見。
- 互動測試使用少量確定性工程圖片／數值，不是實測光譜或科學準確率驗收。之前 V1.1 的 CSV 基線測試不能代替原圖驗收，本次補上。

版本核對：`/api/health` 應回傳 version=1.1.1 與 Render 實際 Git revision；與 [main Commit](https://github.com/T22016AEMC/SpecReader_V1/commits/main) 核對，不能只看 Live。`/api/system-status`、首頁、同源 RDKit WASM 及公開原圖操作另行驗證。此文件不硬編碼自身 Commit 雜湊，發佈結果以實際健康回應和本輪交付回覆記錄。

`render.yaml` 宣告 `/api/health`；既有平台 healthCheckPath 上次實查空值／TCP，HTTP 健康由實際請求另外確認，不假設 YAML 自動更新平台設定。免費服務可能冷啟動。

公開前執行 `node scripts/verify-distribution.mjs`，排除 .env（僅範例保留）、密鑰、node_modules、dist、原始實測資料、快取及開發腳本；第三方 notice 於建置產生，無新增套件／模型。本輪工作區未找到原 V0 ZIP，沒有重新宣稱核對其雜湊。科學準確度仍待使用者實測。
