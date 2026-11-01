# SpecReader v1.2.2 停點 1 報告（P0 純函式＋P1 樣式變數與標題列）

分支 `v1.2.2-ui`（未推送、未開 PR）。本報告對應設計報告第 2 版（`DESIGN_REPORT.md`）。

## 做了什麼
- **報告與草圖**（commit 3bf8327）：納入 D1–D12 與 6 項修改；8 張草圖重新產生。
- **P0**（commit 86e5ca5）：`src/ui/` 七個純函式（資料檢查、校正狀態、IR 證據不足篩選、證據合併、觀測標籤、數字取整、診斷摘要＋完整分子式表）與 80 個新測試；`check-testids` 轉入 `scripts/`。畫面沒有任何變化。
- **P1**：色票對照表＋`data-theme="light"` 旗標、14 px 可見捲軸、列印樣式、logo、標題列重寫、`<main>` 成為唯一的捲動區、譜圖 SVG 色碼改用變數。

## 驗收（實際輸出）
| # | 項目 | 結果 |
|---|---|---|
| 1 | typecheck／build | 無錯誤 |
| 2 | vitest | **66 檔、872 個全過**（原有 792 個全過、測試程式碼未更動；新增 80 個：dataCheck 18、irEvidenceFilter 15、diagnosticSummary 13、evidenceMerge 11、obsLabel 8、calibrationStatus 8、format 7） |
| 3 | E2E | **26／26 全過**，沒有任何測試檔被修改（`git diff HEAD -- tests` 為空） |
| 4 | 測試用標記 | `baseline 65 ids, now 65; missing 0; new 0` |
| 5 | 分析程式不變 | `git diff origin/main -- src/engines src/workers src/types` 輸出 0 位元組（空） |
| 6 | 兩種視窗量測（1280×720、1920×1080；第 1 頁、第 2 頁、第 3 頁、Mode B） | 56 項量測全過：無橫向捲動；整個文件不捲動（只有 `<main>` 捲動）；固定區（標題列＋步驟列）在內容捲動 800 px 後位置完全不變；`<main>` 捲軸寬 14 px（≥12）；`<main>` 之外沒有其他垂直捲動容器；頁面無 JavaScript 錯誤。截圖與原始數字在 `p1-screenshots/`（`measurements.json`） |
| 7 | 列印（`emulateMedia('print')`） | 第 3 頁：`<main>` 的 overflow 變 `visible`、不截斷（1280：clientHeight＝scrollHeight＝3840；1920：3807）；文件高度遠大於一個螢幕；實際輸出 PDF 共 5 頁。全頁截圖與 PDF 在 `p1-screenshots/` |
| 8 | 拖曳／縮放 | 既有 E2E 涵蓋且全過（`ir-original-baseline`、`v11-baseline`）；另外手動檢查：在 `<main>` 先捲 120 px 後拖曳基線第 3 點，`data-y` 153.5→177.2；放大與重置縮放正常 |

另外：**回滾驗證**——移除 `<html data-theme="light">` 後再跑同一套量測，56 項同樣全過，畫面回到深色（`--theme=dark`）。

## 色票對照表「試做」的效果
**做法：** 專案的所有色彩 class（約 1,000 個）都是 Tailwind 工具類，建置後讀取 `var(--color-<色>-<階>)`。`scripts/gen-light-theme.mjs` 讀 Tailwind 自己的色票，產生 `src/theme-light.css`（235 個變數）：中性色整組反轉（深底→淺底、淺字→深字），彩色的深色底（900／950）變淡底、淺色字（100–400）變深字，500／600（實心按鈕）不動。沒有改任何 class 名稱。

**好的地方：** 整站（第 1、2、3 頁、Mode B、卡片、表格、徽章、警示框、按鈕）一次變淺色，版面、對比與資訊層次都保持；半透明寫法（例如 `bg-cyan-950/60`）也正確轉換；回滾只要移除一個屬性。

**還需要人工修的（已修）：**
1. 實心 500 級按鈕上的 `text-slate-950`（近黑字）被反轉成近白字，在黃／青底上對比不足 → 在 `index.css` 以一條規則固定為深色（9 處一次處理）。
2. `hover:bg-amber-400` 等較亮的底色被當文字色一起變深 → 三條規則固定。
3. 譜圖 SVG（`SpectrumViewer.tsx`）有 13 個為深色底寫死的色碼（格線、刻度、座標軸、峰標籤、曲線、圓點外框、單位文字）→ 改成 CSS 變數（深色值＝原本色碼，淺色值另訂）；其餘疊在原圖上的標記與基線（深色小標籤、黃色基線）本來就在圖片上，兩種主題都清楚，沒有動。
4. `IRCalibrationTools.tsx`、`PiecewiseCalibrationControls.tsx`、`StructureRenderer2D.tsx` 沒有需要改的顏色（結構圖原本就在白底上）。

**尚未處理／觀察到的（不屬於 P1）：**
- `text-slate-500`、`text-cyan-500` 等 500 級小字在白底的對比約 3–4.7:1，偏淡但可讀；P7 做無障礙時再一併檢查。
- 固定區目前在 1280×720 佔 175 px（標題列 64＋步驟列 111，因為步驟列的統計膠囊換行；1920 寬為 137 px）。這是 P2 要縮成 44 px 的步驟列，P1 依指示不動它的文字與結構。

結論：**試做成功，不需要改備案。**

## 其他改動
- 標題列：64 px、40 px 圖示（`public/logo/specreader-icon-96.png`）＋HTML 文字 `SpecReader`（Reader 為品牌藍）＋版本小標籤（取自 package.json，建置時由 vite `define` 注入，目前顯示 v1.2.1）＋一行說明＋分段式模式切換＋「匯出報告」。模式按鈕可見文字縮短為「Mode A：實驗證據」「Mode B：輸入結構」，完整字串用視覺隱藏文字保留，可存取名稱不變（E2E 以完整名稱找按鈕，全過）。舊的 `DETERMINISTIC DUAL-MODE WORKBENCH` 徽章移到版本標籤的提示文字。
- `public/logo/`：依指示複製兩個原檔（`specreader-logo-icon.png` 199 KB、`specreader-logo-full.png` 1.1 MB）；另產生標題列用 96×96、favicon 32×32、apple-touch 180×180。**請注意：** 整張字標檔會進入 dist（多 1.1 MB），標題列與 favicon 沒有用到它；若不想增加發佈檔大小，可以之後移除。
- `index.html`：移除 `class="dark"`、body 的寫死底色；favicon 改用圖示。
- `index.css`：變數（頁面底色、捲軸、譜圖）、可見捲軸（內容區 14 px，其餘 8 px；Firefox 用 `scrollbar-width`）、列印樣式（`<main>` 與外層容器在列印時不截斷）。
- 步驟列、各頁內容、`data-testid`、文字：沒有改。

## 需要你決定／風險有變
- **沒有需要決定的新事項。**
- 風險變化：①固定區在 1280×720 目前偏高（175 px），要靠 P2 縮步驟列才會達到設計的 156／188 px；②各頁內部仍有 7 個「捲軸裡的捲軸」（標記清單、校正預覽、環境卡、證據表），依計畫在 P2、P3 處理，P1 只保證 `<main>` 之外沒有；③`public/logo` 的 1.1 MB 字標檔（見上）。

## 附錄 A 重新核對（加一步的測試）
逐行重讀 11 個 E2E 規格後，因預設分頁改為「圖譜官能基」，**需要「加一步」的測試是 14 個**（原估 9 個）：切換分頁 11 個（#2、9、10、11、12、13、14、15、18、25、26）、展開列 3 個（#16、17、24）。這是靜態判斷，要到停點 3（P3 改預設分頁）才能實跑確認；停點 1 沒有修改任何 E2E。

## 在本機怎麼看
- 網頁：`corepack pnpm@11.25.0 dev`（網址依畫面輸出，預設 http://localhost:3000）；或 `corepack pnpm@11.25.0 build` 後 `node dist/server.mjs`（PORT 預設見 server.ts）。
- 草圖：`notes\v1.2.2\mockup\index.html`（雙擊）。
- 截圖：`notes\v1.2.2\p1-screenshots\`。重跑量測：啟動 production server 後 `node notes/v1.2.2/tools/p1-visual.mjs`（深色回滾驗證加 `--theme=dark`）。
