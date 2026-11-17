# 本機預覽：在你自己的 Windows 電腦上看剛建置的版本（v1.4.1 分支）

給使用者看的、可以照做的步驟。**用你自己的真實譜圖驗證時，檔案只在你自己的電腦上開啟，不要交給 Claude Code**（本文件所有「我實際跑過」的步驟都只用倉庫內的合成資料）。

## 1. 開啟本機預覽

**一次要做的準備（只在要換新版時做）**

1. 開 PowerShell，進到倉庫資料夾（`<本機路徑>` 換成你放倉庫的資料夾，以下同）：
   ```
   cd "<本機路徑>\SpecReader_V1"
   ```
2. 確認在對的分支：`git branch --show-current` 應該印出 `v1.4.1`。
3. 重新建置（約 10 秒；`dist` 資料夾就是建置結果）：
   ```
   corepack pnpm@11.25.0 run clean
   corepack pnpm@11.25.0 run build
   ```
   建置結束時最後幾行會印 `[notices] 16 bundled npm packages appended …`，表示授權清單已附上。
4. 要確認 `dist` 是新的：`(Get-Item dist\index.html).LastWriteTime` 應該是你剛才建置的時間。

**開預覽（每次要看時）**

```
cd "<本機路徑>\SpecReader_V1"
corepack pnpm@11.25.0 run preview
```

看到 `Local: http://localhost:4173/` 就是好了。用 Chrome 或 Edge 開 **http://localhost:4173/**。要關掉：回到 PowerShell 按 `Ctrl+C`。

- 如果 4173 被占用：`vite preview` 會自動換下一個埠（我實際遇到時印出 `Port 4173 is in use, trying another one…`、改用 4174），**以 PowerShell 畫面印出的 `Local:` 網址為準**，本文的網址都要跟著換埠。也可以自己指定：`node node_modules\vite\bin\vite.js preview --port 4180 --strictPort`。
- 重新建置之後，請先 `Ctrl+C` 關掉預覽再重開一次（我沒有測過在預覽開著時重建會怎樣）。
- 這個指令是 Vite 的「預覽伺服器」，**只把 `dist` 當靜態檔案送給瀏覽器**，沒有後端。

### 沒有後端（沒有 /api）對分析有沒有影響？

**對分析本身沒有影響。** 我用這個預覽伺服器在最終建置（2026-11-12 18:01:58，HEAD dea9585）上實際跑過（合成的 ¹H 表，經由 Playwright 驅動 Chrome）：開頁、上傳、按「開始分析」、看到診斷摘要，四種網址（第 2 節）都完成。原因：分析核心（RDKit WASM、組成推斷、評分、診斷摘要）全部在瀏覽器的 Web Worker 裡，不呼叫後端。

**會因為沒有 /api 而不能用的功能**（預覽伺服器對 `/api/…` 的 GET 會回首頁 HTML、POST 回 404，程式裡每一處都有接住錯誤，不會當掉）：

| 功能 | 前端呼叫的路由 | 沒有後端時 |
|---|---|---|
| PubChem 查詢（用名稱／SMILES／InChI 向 PubChem 驗證結構） | `/api/pubchem/compound` | 查詢失敗，結構狀態顯示 `API_ERROR`／查詢失敗；已有 SMILES 的結構仍可分析，只是沒有 PubChem 驗證與 CID |
| 影像譜圖的 AI 輔助辨識峰位（Gemini Vision） | `/api/digitize-spectrum` | 退回本機影像處理（IR 影像本來就走本機描線）；AI 辨識峰位不可用 |
| 報告匯出視窗的「AI 輔助評論」 | `/api/gemini/commentary` | 顯示錯誤訊息；**注意：`server.ts` 本身也沒有這條路由**，所以連完整後端也會回 404，與預覽無關 |
| 結構圖像辨識、AI 推理 | `/api/recognize-structure-image`、`/api/ai-reasoning`（`server.ts` 有，且需要 `GEMINI_API_KEY`） | 我在 `src/` 搜尋，**目前前端沒有任何地方呼叫這兩條路由**，所以預覽時看不到差別 |
| 健康檢查 | `/api/health` | 預覽下回首頁 HTML 而不是 JSON（只影響部署監控，不影響使用） |

其他不受影響：RDKit（`/rdkit/` 底下的 WASM 與授權檔由預覽伺服器送）、`/THIRD_PARTY_NOTICES.txt`、所有計算與匯出。

**想連後端一起測**（不需要時可略過）：
```
cd "<本機路徑>\SpecReader_V1"
$env:NODE_ENV = "production"; $env:PORT = "3012"
node dist\server.mjs
```
網址 `http://localhost:3012/`。`/api/health` 會回 `{"status":"ok","version":"1.3.1",…}`；沒有設 `GEMINI_API_KEY` 時 `/api/system-status` 的 `geminiAiAvailable` 是 `false`（AI 功能不可用）；PubChem 查詢需要這台電腦連得上網路。這就是 Render 上跑的那個伺服器。

## 2. 四種網址與診斷摘要上應該看到什麼

`?exp=` 只對**這一次載入的頁面**有效；重新整理時網址沒帶就回到預設。大小寫不拘、逗號分隔、認不得的值會被忽略。

| 網址 | 開了什麼 | 診斷摘要標題下的那一行 |
|---|---|---|
| `http://localhost:4173/` | 預設設定（v1.3.2 的行為＋第二十一站起的 parse 修正：THF、甲醇、環戊烷等能預測 ¹H） | **沒有**「已啟用實驗功能」那一行 |
| `http://localhost:4173/?exp=ir` | ＋v1.4.1 的 IR 新規則（`useV141IR`） | `已啟用實驗功能：IR 新規則` |
| `http://localhost:4173/?exp=h1` | ＋v1.4.0 的 ¹H 新規則（`useV140H1` 與全部 v140 子旗標） | `已啟用實驗功能：¹H 新規則` |
| `http://localhost:4173/?exp=h1,ir` | 兩者都開 | `已啟用實驗功能：¹H 新規則／IR 新規則` |

那一行的位置：診斷摘要第 1 行「SpecReader 診斷摘要」、第 2 行「產生時間…｜版本 1.3.1｜結果為目前輸入」，**第 3 行**就是它（沒開就整行不出現）。這一行來自分析 Worker 自己的回報，看得到就表示 Worker 那邊真的被切換了；看不到就是沒切換成功（先檢查網址、是不是重新整理後少了 `?exp=`）。

怎麼打開診斷摘要：上傳譜圖 → 第 3 頁「化學判讀」→（有分子式就填）→「開始分析」→ 等結果出現 → 「診斷」分頁，預覽框就是診斷摘要。我在本機預覽上用合成 ¹H 表（C₁₅H₁₆O₂）實際看到上表四種結果，與預期逐字相同。

## 3. 驗證時要記錄什麼

每份譜（PMA、對甲酚、雙酚 A、benchmark 各份）各用 **4 種網址**各跑一次，每次記：

| 欄位 | 怎麼填 |
|---|---|
| 譜圖名稱／輸入 | 哪些譜（¹H、IR、…）、有沒有填分子式、溶劑與頻率有沒有宣告 |
| 網址 | 4 種之一 |
| 目標結構名次 | 診斷摘要「前幾名候選」裡，你知道的正確結構排第幾；沒進前幾名就寫「未進榜」 |
| 該結構的相容度 | 同一行 `相容度 NN/100` |
| 診斷摘要那一行 | 抄下「已啟用實驗功能：…」整行，沒有就寫「無」 |
| 截圖或文字結果 | 診斷摘要整段文字複製存檔，或截圖（含網址列） |
| 備註 | 排序變化、跑多久、有沒有看到「未完整（INCOMPLETE）」 |

注意事項：
- 比較請看「前幾名候選」的名次與相容度；**「各規則擋掉的結構數」不要拿來比較**：我在同一組合成 ¹H 表上換網址，這些數字就會變（例如 2062／2199），而那組輸入根本沒有 IR，`?exp=ir` 不可能影響它——窮舉有步數／時間預算，標「未完整」時尤其不穩定。
- 同一網址重跑一次，名次若有變化，也要記下（可能是預算造成）。
- 新規則（`?exp=h1`、`?exp=ir`）**沒有任何真實譜圖驗證過**，你的紀錄就是第一次驗證。
- 預設網址已包含 parse 修正，所以 `?exp=h1` 與預設的差別來自 v1.4.0 的其他 ¹H 規則，不是 parse 修正。

## 4. 提醒

- **你的真實譜圖只在你自己的電腦上使用**：用本機預覽（`localhost`）開啟，檔案不會離開這台電腦（沒有後端時更不會）；**不要把真實譜圖、截圖或結果檔交給 Claude Code**，把你的觀察用文字告訴規劃者即可。
- 本機預覽看的是 `dist` 裡的建置結果。改了原始碼要重新 `run build` 才看得到；建置時間與當時的 commit 記在 `notes/v1.4.1/STOP21_CHECKPOINT.md`。
- 本文件的版本號 1.3.1 是 `package.json` 目前的值（還沒升版）。
