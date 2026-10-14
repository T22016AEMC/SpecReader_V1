# V1.1 部署與工程紀錄

正式來源：[GitHub](https://github.com/T22016AEMC/SpecReader_V1)，Public 已獲使用者授權。V1 基準 `e190a8d`；V1.1 分支 `v1.1-scientific-core`，工程完成後快轉 main。V0 與其他專案未修改。

既有獨立服務：[SpecReader HTTPS](https://specreader-v1.onrender.com)，Render `srv-db6udpgu01pc73bl1tog`，My Workspace `tea-db6qffon74is738k4q30`，免費 Node 方案。不建立或修改 EluSim，不使用付費資源。

建置：`npm install -g pnpm@11.25.0 && pnpm install --frozen-lockfile && pnpm run build`。啟動：`node dist/server.mjs`。Node 24.19.0，NODE_ENV=production，PORT 由平台提供，綁定 0.0.0.0。EXTERNAL_API_TIMEOUT_MS=20000。Gemini key 僅可由伺服器環境設定；本地科學不依賴它。IR 原圖處理不呼叫 Gemini。

`/api/health` 回傳版本 1.1.0／實際 revision；靜態資源包含同源 RDKit JS/WASM／第三方 notice。`render.yaml` 宣告 HTTP 健康路徑；既有平台服務的 healthCheckPath 仍須按實際查詢核對，不能以 YAML 推定平台已變更。

工程紀錄：一次既有完整回歸 97/97 通過；其後圖片校正／正式 De novo 呼叫／API／評分受影響小型測試 15/15 通過（包含新增第六項 V1.1 測試），最終追溯／匹配界限測試 10/10 通過。TypeScript 已通過，前端 Vite 與後端 esbuild 成功。本機桌面舊八項流程通過；新基線項第一次拖曳失敗，控制點移至頂層後仍失敗，最後確認需先捲入可視範圍，再以真實滑鼠操作，該項重測通過 1/1。未修改驗收斷言或跳過功能。

V1.1 最新部署／遠端驗收：待本輪實際部署更新。

正式發佈排除 .env、密鑰、node_modules、dist、測試快取、開發修改腳本及原始實測資料。157 個 Git 來源檔案通過分發路徑／已知密鑰格式掃描。V0 本輪未修改；先前 ZIP SHA256 紀錄為 `a9315297d71842d0e1111c9ad90f271c9f6b1bc300f9ccddd1e23cc1df5b312a`，本輪後續檢查工作區已找不到原 ZIP，所以不能宣稱重新核對其雜湊；`audit_workspace` 審查副本保留。工程成功不等於科學準確度已驗證。
