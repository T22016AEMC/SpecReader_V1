# 可發布候選清單（v1.4.1 分支，第二十一站；本機，沒有推送、沒有升版、沒有部署）

標記：**已完成**／**待使用者**／**待 GitHub 恢復**。「已完成」都附證據（log／commit／數字）。

## 一、程式與建置

| # | 項目 | 狀態 | 證據／說明 |
|---|---|---|---|
| 1 | 乾淨重建 dist，記錄建置時間與 HEAD | **已完成** | `clean`＋`run build`：dist 建置 **2026-11-12 18:01:58**（`dist/index.html`；授權清單 18:02:00），當時 HEAD **dea9585**；建置約 8 秒。之後的 commit 只改文件（E、F）；若再改原始碼要重建重跑 |
| 2 | E2E 重跑（預設設定，含 `?exp` 兩個情境） | **已完成** | `playwright test`：**38／38 通過**（4.2 分），與第二十站的 38／38 相同；log `notes/v1.4.1/_s21_e2e.log` |
| 3 | 旗標全關 golden＋v14（預設設定） | **已完成** | **33 檔 508 測試全過**（1356 s）；log `notes/v1.4.1/_s21_golden.log` |
| 4 | 旗標全關整套（parseFix 預設改變之後） | **已完成** | `vitest.flagoff.config.ts`：**倉庫內 115 檔 1736 測試全過、0 失敗**（實跑 119 檔 1741，多的 4 檔 5 測試是本機未入庫的暫存量測檔）；1129 s；log `_s21_suite.log` |
| 5 | parse 修正預設生效（你的決定） | **已完成** | d4c4304；量測 0 名次變、0 分數變；3 個測試改切換變數／語意（見 PARSEFIX_MEASURE.md） |
| 6 | 署名與授權清單 | **已完成**（缺 1 項） | cd245c7；缺：`median-quickselect` 無授權檔（見第四節） |
| 7 | 本機預覽文件 | **已完成** | `notes/v1.4.1/LOCAL_PREVIEW.md`（倉庫內與 `SpecReader/notes/v1.4.1/` 兩份）；`vite preview` 實測可用 |

## 二、需要你做的事

| # | 項目 | 狀態 | 說明 |
|---|---|---|---|
| 8 | **真實譜圖驗證**：PMA、對甲酚、雙酚 A、benchmark | **待使用者** | 用本機預覽 4 種網址（預設、`?exp=ir`、`?exp=h1`、`?exp=h1,ir`）各跑一次；記錄格式在 LOCAL_PREVIEW.md 第 3 節。v1.3.2 的強羰基門檻、多帶組合、視窗修正與 parse 修正都沒有真實譜圖驗證；真實譜圖只在你自己的電腦上用，不交給 Claude Code |
| 9 | **版本號與版號規劃** | **待使用者** | `package.json` 目前 **1.3.1**（與 Render 上相同）。累積未發布內容：v1.3.2（預設生效，從未發布）、v1.4.0（¹H，預設關）、v1.4.1（IR，預設關）、parse 修正（預設生效）、`?exp=` 開關。選項：(a) 一次升 **1.4.1**（分支名也是 1.4.1；CHANGELOG 合併寫 1.3.2／1.4.0／1.4.1）；(b) 依序補 1.3.2、1.4.0、1.4.1 三個版號（需要拆提交或只標記）。只有 `package.json` 帶版本字串（診斷摘要與 `/api/health` 讀它）。**升版前還缺**：沒有 1.3.2／1.4.0／1.4.1 的 CHANGELOG 與 REPORT（目前最新是 `V1_3_1_CHANGELOG.md`）、`releases/` 的 zip |
| 10 | v1.4.0／v1.4.1 的功能要不要預設開 | **待使用者** | 目前預設全關，只能用 `?exp=` 在一次載入內打開；沒有介面開關 |
| 11 | `median-quickselect` 授權缺項 | **待使用者**（第二十二站查過，仍缺） | 該套件 package.json 寫 ISC，但套件內無授權檔與版權行；**第二十二站查了 npm registry 的套件資料與公開倉庫 mad-gooze/median-quickselect（發布 commit 6cf2e36 與 master）：只有「ISC」字樣，無 LICENSE 檔、無版權行，所以仍不補寫；清單標 MISSING，並在清單內寫明查找結果**。選項：接受、向作者取得、換掉相依（它是間接相依：`jcampconverter` → `ml-array-median` → `median-quickselect`，見 `pnpm-lock.yaml`） |
| 12 | ~~`THIRD_PARTY_NOTICES.md`／`third_party/ambit-hnmr/README.md` 仍寫作者單位~~ | **已完成（第二十二站，151d43d）** | 兩份文件現在只列作者姓名、不列單位；`v140Kb` 與 `v141DeployedNotices` 兩個測試改成「必須含姓名、不得含單位」。（`ambitHnmrKnowledgeBase.ts` 檔頭註解的單位已在第二十三站拿掉，5c87ee0，只改註解。） |

## 三、發布與部署

| # | 項目 | 狀態 | 說明 |
|---|---|---|---|
| 13 | 推送、PR、合併 | **待 GitHub 恢復** | GitHub 暫停，**未推送**。遠端 `origin/main` 仍在 v1.3.1 合併點 **029a1c1**（本次 `git ls-remote origin` 讀得到、HEAD＝029a1c1）；本機 `main`＝4267039（比遠端多 1 個發布紀錄 commit）；`v1.3.2`、`v1.4.0`、`v1.4.1` 三個分支只在本機；v1.4.1 比 v1.3.1 多 45 個 commit |
| 14 | Render 正式環境目前版本 | **已確認（只讀）** | `GET https://specreader-v1.onrender.com/api/health`（2026-11-12 約 17:5x）→ `{"status":"ok","version":"1.3.1","revision":"029a1c1de40c7e4ca0a1fc88b529094bae59814d","localScientificEngines":true}`，HTTP 200；即正式環境＝v1.3.1 的合併點，尚未部署任何 v1.3.2 以後內容 |
| 15 | 部署 | **待 GitHub 恢復** | Render 由 `main` 自動部署（`render.yaml`：`pnpm install --frozen-lockfile && pnpm run build`，`node dist/server.mjs`，健康檢查 `/api/health`）。這一站沒有部署、沒有觸發任何 hook |
| 16 | Deploy Hook／金鑰不得入庫 | **已完成（確認）** | 搜尋結果見下一節；**沒有找到** |

### Deploy Hook／金鑰字樣搜尋（2026-11-12，倉庫 `SpecReader_V1`）
- 工作樹所有檔案（排除 `node_modules`、`dist`、`.git`、`.codegraph`、`test-results`）搜 `api.render.com/deploy`、`deploy hook`、`deploy_hook`、`?key=…`、`RENDER_API_KEY`、`GEMINI_API_KEY=<值>`：**0 筆**。
- 已追蹤檔案搜 Google API 金鑰（`AIza…`）、`sk-…`、GitHub 權杖（`ghp_`、`github_pat_`）、Slack 權杖、私鑰區塊：**0 筆**（`scripts/verify-distribution.mjs` 裡有同類的檢查用正規式，不是金鑰）。
- git 歷史（所有分支）用 `-S` 搜 `api.render.com/deploy`、`deploy hook`、`deploy?key`：**0 筆**。
- 已建置的 `dist/` 搜 `AIza…`、`api.render.com/deploy`：**0 筆**。
- `.env.example`（唯一追蹤的 env 檔）只有變數名稱與預設／空白值，沒有實際金鑰；沒有 `.env`／`.env.local` 檔（`.gitignore` 已含 `.env*`）。
- 會出現的 Render 服務 ID（`srv-…`）與 Workspace ID（`tea-…`）（第三十三站已在工作樹改成 `<Render 服務 ID>` 等中性寫法；git 歷史仍有原值）在 `V1_DEPLOYMENT.md`、`V1_1_DEPLOYMENT.md`、`validation/public-deployment.json`、`validation/v11-release.json`：這是服務／工作區識別碼，**不是 Deploy Hook 的金鑰**（Deploy Hook 的網址帶 `?key=`），但請你自己判斷是否要公開。
- 之後若要用 Deploy Hook：存在 Render／GitHub 的 secrets 或你自己的環境變數，不要寫進任何檔案或 commit 訊息。

## 三之二、第二十三站（本機，沒有推送、沒有升版）
| # | 項目 | 狀態 | 證據／說明 |
|---|---|---|---|
| 17 | 環丙烷次甲基細分（雜原子對其他） | **已完成（評估；未採用）** | f633ee5；條件 3b 不成立（環丙醇次甲基 +0.19／合併 −0.79／細分 −0.53）→ 維持合併；src 沒動；數字 `STOP23_A_RESULTS.txt` |
| 18 | 限制清單與發布文件 | **已完成** | 新增 `notes/v1.4.1/KNOWN_LIMITS.md`；發布說明草稿第 5、7、9 節與本表更新（倉庫內與 `SpecReader/notes/v1.4.1/` 兩份） |
| 19 | `ambitHnmrKnowledgeBase.ts` 檔頭註解拿掉單位 | **已完成** | 5c87ee0；只改註解；沒有測試斷言該註解 |
| 20 | `legacyGolden` 並行偶發失敗 | **已完成** | 03efa6e；測試 helper 的 `timeMs` 改成步數預算；src 的時間切片是設計、沒動；沒改期望值 |
| 21 | 旗標全開整套＋分類 | **已完成** | 118 檔 1856：235 失敗＝205 釘旗標關閉結果的 baseline／golden（含 16 個只在 IR 開才敗）＋24 其他舊的旗標狀態相依＋21 只在 IR 開（與 STOP18 同）＋1 round3 預設值斷言；round3 無行為類失敗（發布說明第 9 節） |
| 22 | 乾淨重建、E2E、旗標全關整套 | **已完成** | dist 建置 **2026-11-13 13:39:22**，HEAD **48133ae**；E2E **38／38**（4.1 分）；全關整套 **118 檔 1856 全過、0 失敗**（2498 s） |

## 四、本站已知缺口
- `median-quickselect`（見 11）。
- 診斷摘要與 `/api/health` 顯示的版本仍是 1.3.1（尚未升版）。
- 本機預覽沒有後端：PubChem 查詢、影像譜圖的 AI 輔助辨識不能用（詳見 LOCAL_PREVIEW.md 第 1 節）；「報告匯出」的「AI 輔助評論」連完整後端也不能用（`server.ts` 沒有 `/api/gemini/commentary` 路由，與本站無關，未處理）。
- 新規則（`?exp=h1`、`?exp=ir`）與 v1.3.2 的三項預設改動、parse 修正都沒有真實譜圖驗證。
