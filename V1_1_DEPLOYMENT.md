# V1.1.3 建置與部署

## 六步驟整合（2026-10-16）

基準b5ca641，分支`feat/v113-six-step-reasoning`；版本仍1.1.3，以Commit區分。沿用同一免費Render服務、Node／React／Vite及已安裝RDKit，沒有新增後端、AI服務或密鑰。工程結果：TypeScript通過；前後端production build通過；原有125項加新8項測試均已驗證（整體132/132後，再補一項並對新檔8/8）；Chrome15個不同案例通過（首次13/15，修正兩個文字定位後針對性3/3）。包括真實滑鼠基線拖曳、取消Worker、局部資訊保留、完整SVG／分子式顯示與無外部AI請求。

公開發佈須核對GitHub main、Render deploy.commit、`/api/health.revision`三者相同，另執行公開瀏覽器操作；本機結果不代表遠端驗收。搜尋在瀏覽器Worker執行，Render免費服務無新增計算費用；低效能桌面仍可能較慢。新完整分子圖需RDKit/WASM載入，失敗有明確錯誤與SMILES。

以下為先前版本與部署歷史，最終新Commit及公開操作結果以本次交付回覆為準。

Repository：https://github.com/T22016AEMC/SpecReader_V1 （使用者已授權Public）。基準3a90a41；修復分支fix/v11-evidence-guided-search，驗證後快轉main；不重置或清除既有成果。

沿用免費獨立Render Web Service `srv-db6udpgu01pc73bl1tog`，Workspace `tea-db6qffon74is738k4q30`，https://specreader-v1.onrender.com 。不建立付費資源、不改其他服務。發佈前實查部署仍為3a90a41；本輪是否更新完成，應以健康端點revision與GitHub main實際對照，不能只看推送或Live。

Build：`npm install -g pnpm@11.25.0 && pnpm install --frozen-lockfile && pnpm run build`

Start：`node dist/server.mjs`；process.env.PORT、0.0.0.0、production靜態檔及SPA回退保留。健康檢查 `/api/health` 回version1.1.3及RENDER_GIT_COMMIT；平台healthCheckPath目前為空/TCP，HTTP另外驗證，不假稱YAML已更新平台設定。

工程命令：

- `node node_modules/typescript/bin/tsc --noEmit`
- `node node_modules/vitest/vitest.mjs run --maxWorkers=1`
- `pnpm run build`
- `node node_modules/@playwright/test/cli.js test`
- `node scripts/verify-distribution.mjs`

本輪最終整體單元／整合回歸125/125通過（16個檔案）；TypeScript、Vite、esbuild均通過。Chrome14個案例已逐項取得通過（首次12/14，其後更新過時驗收條件重跑11/11）；原圖五點實際滑鼠拖曳、縮放、套用與跨頁保存有操作驗證。正式公開版再執行同一批針對性操作，結果以交付回覆及本機validation紀錄為準。

公開煙霧檢查：`EXPECTED_REVISION=<main SHA> node scripts/public-smoke.mjs https://specreader-v1.onrender.com`（Windows以環境變數設定）；另用E2E_BASE_URL執行explicit-analysis、ir-original-baseline、evidence-guided-ui及observation-editing。應確認health/version/revision、首頁／刷新路由、API、RDKit/WASM及真正Worker。GitHub API更新分支若不觸發webhook，使用既有服務清除建置快取的部署操作，避免舊Worker資源。

無新增依賴、GPU或Python後端。API Key仍僅伺服器環境變數；不發佈.env、node_modules、dist、原始使用者圖譜／TEST SPEC或測試快取。RDKit.js/BSD-3-Clause等既有notice仍由prebuild產生。圖及訊號準確度待使用者實測，不以工程通過冒稱科學驗證。

## 實際公開驗收紀錄（2026-10-15）

科學／UI程式Commit `ca3c9ff3dd987180169fda365c02effda9903fee`，Render部署 `dep-db87p3dg1s2s739c7c60` 於07:12:06 UTC為Live。07:14:54 UTC健康端點確認version1.1.3及相同revision；10個HTTP／靜態路由檢查全過（未知API按預期404），包含RDKit WASM及Mode A Worker `modeA.worker-C2SIly0G.js`。

接續在公開HTTPS站執行完整Chrome測試：**14/14通過**，包括實際五點拖曳、縮放、套用／往返、人工寬窄覆寫、NMR／MS欄位、六模態獨立、手動分析Worker與Mode B。公開index資源為`index-DYZnqmUr.js`。與Windows本機index雜湊可能不同；以實際Render revision及公開操作為證據。

後續提交只補本段驗收結果並修正報告函式名稱，沒有變更科學／UI程式；再發佈時核對健康revision與同一組公開資源。最新GitHub／部署Commit以交付回覆及健康端點為準。
