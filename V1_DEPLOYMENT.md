# Render 公開桌面部署

Repository：[T22016AEMC/SpecReader_V1](https://github.com/T22016AEMC/SpecReader_V1)，公開、main。使用者已明確授權公開原始碼。

獨立服務：[specreader-v1](https://specreader-v1.onrender.com)，Render `srv-db6udpgu01pc73bl1tog`，My Workspace `tea-db6qffon74is738k4q30`，Singapore，Web Service／Node／free。不修改 EluSim 或任何其他服務。原早期基準已 LIVE；本輪最終版本狀態與測試使用 `validation/public-deployment.json`、`validation/public-smoke.json`（完成後產出）確認，不能把基準部署算作最新科學版本。

## 設定

Build：
```sh
npm install -g pnpm@11.25.0 && pnpm install --frozen-lockfile && pnpm run build
```

Start：`node dist/server.mjs`。Health endpoint：`/api/health`；JSON 有 status、version、revision、localScientificEngines。Render runtime 自動的 `RENDER_GIT_COMMIT` 用來核對實際部署提交。

`render.yaml` 明確設定 healthCheckPath。現有 MCP 建立的服務 API 回傳 healthCheckPath 為空（平台預設檢查）；不能宣稱平台已套用 YAML 該欄。HTTP `/api/health` 的實際驗收與平台欄位設定分開記錄；若 Dashboard 可操作則補設 `/api/health`。

|環境變數|設定|
|---|---|
|NODE_ENV|production|
|NODE_VERSION|24.19.0|
|PORT|由 Render 提供；程式綁定 0.0.0.0|
|EXTERNAL_API_TIMEOUT_MS|20000；限制 1–60 秒|
|REQUEST_LIMIT_PER_MINUTE|選填，預設每 IP 30／60 秒；health 豁免|
|UPLOAD_LIMIT_MB|選填，預設 12 MB；伺服器最大允許 25 MB|
|GEMINI_API_KEY|選填，只放 Render Secret 環境變數；未設定本地科學仍工作|
|GEMINI_MODEL|選填，預設 gemini-2.5-flash；外部服務模型可變，另行核對|

## 正式資源與請求

Vite 產生 dist；Express 供靜態檔及 SPA fallback，`/api/*` 不會被回傳首頁。`prebuild` 將官方依賴中的 RDKit JS／WASM 與授權檔複製到同源路徑 `/rdkit/`，不依賴 CDN。12 MB JSON 大小、受控 413／400／404／429、外部逾時／安全錯誤回應已測；日誌不輸出上傳資料、Key 或內部路徑。科學計算在瀏覽器，外部 AI 失效不使數值／分子圖流程失效。

`pnpm-workspace.yaml` 明確允許 esbuild build script；pnpm 11 的忽略建置脚本規則曾使首輪 Render 建置失敗，已修復並有成功基準部署。正式依賴版本以 lockfile 為準。

## 桌面驗收

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

本機需要已安裝桌面 Chrome。遠端 PowerShell：
```powershell
$env:E2E_BASE_URL='https://specreader-v1.onrender.com'
pnpm test:e2e
node scripts/public-smoke.mjs https://specreader-v1.onrender.com
```

E2E 包含健康／WASM MIME／首頁／Mode B 六模態實際結構預測／Mode A CSV與人工標峰／校正頁／判讀排名／重新整理；詳細通過時間與遠端結果見驗證報告。未做手機適配；Edge／macOS 尚無同等獨立實機證據。

## 常見問題

- 免費服務可能休眠／冷啟動；第一次請求需等候。未使用付費資源。
- 不手動重複建服務。新提交優先由 autoDeploy；確認未觸發或需清除舊快取時才觸發同一服務的新部署。
- WASM 404：核對 prebuild／同源 URL；不能以 rdkitConnected=true 隱藏失敗。
- Gemini 不可用：人工圖片校正、CSV、Mode A／B 本地科學仍可使用；AI 錯誤是外部能力未配置。
- Health 回傳提交不一致：等部署完成後重新比對，不能只憑首頁 HTTP 200 宣稱最新版本上線。
- `.env`、node_modules、dist、驗證快取及 NIST 原始資料禁止上傳；執行 `scripts/verify-distribution.mjs`。

桌面 Edge 可使用相同測試：設定 E2E_BROWSER_CHANNEL=msedge，再執行 test:e2e；預設仍為 chrome，未改 UI。
