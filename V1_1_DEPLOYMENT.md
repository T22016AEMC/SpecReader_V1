# V1.1 部署與工程紀錄

正式來源：[GitHub](https://github.com/T22016AEMC/SpecReader_V1)，Public 已獲使用者授權。V1 基準 `e190a8d`；V1.1 分支 `v1.1-scientific-core`，工程完成後快轉 main。V0 與其他專案未修改。

既有獨立服務：[SpecReader HTTPS](https://specreader-v1.onrender.com)，Render `srv-db6udpgu01pc73bl1tog`，My Workspace `tea-db6qffon74is738k4q30`，免費 Node 方案。不建立或修改 EluSim，不使用付費資源。

建置：`npm install -g pnpm@11.25.0 && pnpm install --frozen-lockfile && pnpm run build`。啟動：`node dist/server.mjs`。Node 24.19.0，NODE_ENV=production，PORT 由平台提供，綁定 0.0.0.0。EXTERNAL_API_TIMEOUT_MS=20000。Gemini key 僅可由伺服器環境設定；本地科學不依賴它。IR 原圖處理不呼叫 Gemini。

`/api/health` 回傳版本 1.1.0／實際 revision；靜態資源包含同源 RDKit JS/WASM／第三方 notice。`render.yaml` 宣告 HTTP 健康路徑；既有平台服務的 healthCheckPath 仍須按實際查詢核對，不能以 YAML 推定平台已變更。

工程紀錄：一次既有完整回歸 97/97 通過；其後圖片校正／正式 De novo 呼叫／API／評分受影響小型測試 15/15 通過（包含新增第六項 V1.1 測試），最終追溯／匹配界限測試 10/10 通過。TypeScript 已通過，前端 Vite 與後端 esbuild 成功。本機桌面舊八項流程通過；新基線項第一次拖曳失敗，控制點移至頂層後仍失敗，最後確認需先捲入可視範圍，再以真實滑鼠操作，該項重測通過 1/1。未修改驗收斷言或跳過功能。

V1.1 首次部署 `718ded8180b5a069921ffa253835f196e39b73af`，`dep-db7nksbncjis73euuq80`，2026-10-14 12:50:44 UTC 狀態 live。公開 Chrome 桌面 **9/9 通過**：首頁、雙模式、WASM、數值上傳／人工標峰／排名、六模態單獨使用、五點拖曳／套用／重新分析。實際 `/api/health` 200 回傳 1.1.0／718ded8；`/api/system-status` 200；IR AI 替代端點 422 受控提示。未配置 Gemini Key，量子後端狀態為 false，與實作相符。

末次程式 Commit：`ccef958511b089930e450a93581857ff565874ba`。部署 `dep-db7nqd0473hc73e1lqu0`，2026-10-14 13:02:24 UTC 完成，狀態 **live**。最終來源標記／canonical 去重／幾何峰表小型測試 16/16 通過，強度尺度隔離之最後評分測試 4/4 通過；TypeScript 與最後 Vite 建置通過。公開 Edge 針對雙模式／WASM、Mode A 人工標峰／候選排名、五點基線操作 **3/3 通過**；最終健康檢查 HTTP 200 回傳 version=1.1.0、revision=ccef958。首輪 Chrome 9/9 所對應程式為 718ded8，未將不同迭代混稱為同一完整驗收。

本文件與 README 的後續提交只補紀錄，程式來源仍與已驗證 ccef958 相同。既有 Render 服務 plan=free；平台 healthCheckPath 實查為空值（TCP 預設），HTTP `/api/health` 另外實際驗證成功。

正式發佈排除 .env、密鑰、node_modules、dist、測試快取、開發修改腳本及原始實測資料。157 個 Git 來源檔案通過分發路徑／已知密鑰格式掃描。V0 本輪未修改；先前 ZIP SHA256 紀錄為 `a9315297d71842d0e1111c9ad90f271c9f6b1bc300f9ccddd1e23cc1df5b312a`，本輪後續檢查工作區已找不到原 ZIP，所以不能宣稱重新核對其雜湊；`audit_workspace` 審查副本保留。工程成功不等於科學準確度已驗證。
