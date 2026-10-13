# SpecReader_V1

以 V0 為基礎逐階段升級的桌面光譜工作台，保留 React／TypeScript／Vite／Express、Mode A／Mode B、六模態獨立輸入與選填分子式。科學評分屬可解釋的相容性分數，尚未實測校準為結構正確機率。

## 執行

需要 Node.js 24、pnpm 11.25.0。

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm typecheck
pnpm test
pnpm build
NODE_ENV=production pnpm start
pnpm test:e2e
```

Windows PowerShell 正式啟動：先設定 `$env:NODE_ENV='production'`，再執行 `pnpm start`。E2E 自動啟動正式伺服器並使用已安裝的桌面 Chrome。部署驗證可設定 `E2E_BASE_URL` 為實際 HTTPS 網址。

`node scripts/check-phase.mjs <階段名稱>` 依序執行資源準備、嚴格 TypeScript、Vitest、前端與伺服器正式建置；結果寫入 `validation/`。

## 環境設定

請參考 `.env.example`。`GEMINI_API_KEY` 是選填的伺服器環境變數，僅供外部圖片／AI 功能；本地科學引擎及數值分析不需要密鑰。不要提交 `.env` 或密鑰。

`GET /api/health` 提供健康檢查。Render 使用獨立服務，設定 `NODE_ENV=production`，啟動 `node dist/server.mjs`；自動使用 `PORT` 並綁定 `0.0.0.0`。

## RDKit

使用官方 `@rdkit/rdkit`，BSD-3-Clause 授權。建置時從已鎖定的依賴複製 JS／WASM 至本地靜態資源，無需第三方 CDN；生成資源不提交 Git。RDKit 驗證與 canonical SMILES 已接入分子圖入口，內建圖模型保留化學環境判讀。載入失敗時會標明解析器限制。

## 開發狀態

請參閱 `docs/DEVELOPMENT_PROGRESS.md`。目前部署基準是階段性版本；工程通過不代表六模態實測準確率已完成驗證。
