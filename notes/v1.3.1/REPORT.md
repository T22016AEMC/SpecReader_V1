# v1.3.1 報告（簡約先驗、禁含炔醇、讀法行）

基準 `1.3.0`（merge `5559f2a`）。細節見根目錄 `V1_3_1_CHANGELOG.md`。分支 `v1.3.1` 從本機 main（含未推送的 `da061ec`，1.3.0 發佈紀錄）開出，隨本次 PR 一起進 main。

## 1. 改了什麼

| 項 | 內容 |
|---|---|
| A 簡約先驗 | 獨立一項（`parsimonyPrior.ts`；帳本不動）。互為整數倍（每積分單位氫數比 ≥2）且總分相差 <2 分、且倍數式沒有額外證據 → 倍數式扣 1 分，用於 `finalScore` 與排序 |
| B 禁含炔醇 | `[CX2]#[CX2][OX2H1]`，獨立清單 `V131_FORBIDDEN_FRAGMENTS`，IR 帶不解鎖 |
| C 讀法行 | 診斷摘要 ¹H 讀法行列出所有可讀類別（含延後的酯氧次甲基、縮醛 O–CH–O）；新欄位 `readableClasses`，搜尋用的 `classes` 不動 |

旗標 `useV131`（子開關 `v131.parsimony／forbiddenAlkynol／readingLine`）；關閉＝1.3.0。

## 2. A 的差距原因與設計

- 差距原因（量測 CR1）：對甲酚 68.48、三對甲苯基甲醇 67.83。¹H 的整數比對兩者都吻合（比例尺可縮放到任何氫數）、寬 O–H 帶兩者都有 O–H 可解釋；差只來自 IR 弱指紋峰有無對應帶（每個完全不符的弱帶約 1 分）與 ¹H 位移細節，所以倍數式與單體只差 0.5–1 分。
- 窗口 2 分、扣 1 分：換算依據＝一個完全不符的弱指紋帶約動總分 1 分（權重 0.85／IR 權重總和約 13 × IR 佔總分約 0.55，CR1 實測）。扣分 ≤ 窗口，推翻不了超過 1 分的差距，窗口外完全不碰。**工程判斷，待 1.4.0 檢討。**
- 額外證據判準（不扣分）：倍數式有一個觀測（權重 ≥0.3、相容度 ≥0.6），較小候選對它相容度 <0.4 或沒有對應項。¹H 多出的不等價氫環境（多出的訊號只有大分子有環境可配）與 IR 多出的官能基帶用同一條規則。
- 合成驗證沒有誤傷保護樣本，所以沒有退回顯示層。

## 3. 名次對照（目標名次；合成樣本；dense IR 基線；修正前＝旗標關＝1.3.0）

| 樣本 | 修正前 | 修正後 |
|---|---|---|
| 對甲酚，IR 有 3335、¹H 無 OH（CR1；任務主例） | 1/12（68 與三對甲苯基甲醇 68 平手，靠 1.3.0 平手排序） | **1/12**（甲醇扣 1 → 67，不再平手） |
| 同上，物理強度（P1） | 1 | 1 |
| IR 有 3335、¹H 有 OH（P2） | 1 | 1 |
| IR 無 3335、¹H 無 OH（CR0） | 2/10（第 1 是二對甲苯基醚 82） | 2/10 |
| IR 無 3335、¹H 有 OH 4.70（CR2） | 3/13 | **2/13** |
| 雙酚 A 型（B1） | 1 | 1（分數 77 不變） |
| 二對甲苯基醚（ETH1：醚 C–O、無 O–H） | 1 | 1（82 不變） |
| 不對稱聯芳基（ASY1：6 組 ¹H 訊號） | 1/24 | 1/24（80 不變） |
| 苯甲酸乙酯／PMA 型／乙醯苯胺／3-苯丙酸 | 1／1／1／1 | 1／1／1／1（分數不變） |

旗標關閉：12 個樣本的名次、分數與前六名順序與 1.3.0 完全一致（`v131Baseline`）。

## 4. B 誤殺檢查

4 個炔醇（對甲苯基炔醇、乙炔醇、丙炔醇、含另一醇的炔醇）命中；36 個合法分子 0 誤殺（丙炔醇、苯乙炔、乙氧基乙炔、炔醚、烯醇醚、炔酸／炔酸酯、炔烴與醇不相連、對羥基苯乙炔…）。以全部 IR／N 解鎖證據送入合理性閘門仍被擋。

## 5. 已知限制

- 簡約先驗只在「近分＋互為整數倍」作用；CR2 的第 1 名（環氧 C16H16O，75）與目標差 4 分，在窗口外，不處理。CR0 的二對甲苯基醚在該資料下確實合理地排第 1。
- 額外證據例外在管線層沒有近分的樣本可驗（保護樣本與單體的差距都在窗口外）；例外由單元測試（`v131ParsimonyUnit`）用手工帳本釘住。
- 數值（2、1、0.6、0.4、0.3）未校準。沒有 ¹H 積分的候選不參與。

## 6. 測試

- 新增：`v131Alkynol`、`v131ParsimonyUnit`、`v131ReadingLine`、`v131Baseline`、`v131Acceptance`；`tests/helpers/v131Samples.ts`、`tests/goldens/v131.baseline.json`、`tests/fixtures/v131/{CR2,ETH1,ASY1}.json`、`vitest.flagoff131.config.ts`。
- 既有測試需更新的期望（逐一）：`tests/v12/v123Forbidden.test.ts` 的「子開關 forbiddenN」一例兩個長度斷言：旗標開時有效清單多 1 個炔醇片段（`+ V131_FORBIDDEN_FRAGMENTS.length`），原因是新片段在 useV131 開時屬於有效禁含清單；斷言沒有放寬（仍是精確長度；改成依 `v131ForbiddenAlkynolActive()` 加 0 或 1，所以 `useV131=false` 時恰為 v1.3.0 的長度）。另兩個既有檔只改設定、斷言原封不動：`v130Acceptance.test.ts`、`v130TieBreak.test.ts` 在 beforeAll 把 `useV131` 設為 false（兩者釘的是 v1.3.0 的名次：ALK0 為 27；tieBreak 關時的 v1.2.3 順序），原因是旗標開時簡約先驗會讓 ALK0（1-辛烯，4-辛烯這個 2 倍數式被扣 1 分）27→26，並讓 CR1 的卡比醇在 tieBreak 關時也排到目標後面；這兩個新名次由 `v131Acceptance.test.ts` 釘住（ALK0 = 26、CR1 = 1）。快照沒有改。
- 驗證數字見第 7 節。

## 7. 驗證

- typecheck：`tsc --noEmit` exit 0。
- vitest 全套（旗標開）：84 檔 1117 個測試；第一輪 2 個失敗（`v130Acceptance` ALK0 名次 27→26、`v130TieBreak` 子開關一例），原因都是簡約先驗讓名次改變（上面第 6 節），兩檔改成在 beforeAll 設 `useV131=false` 釘住 v1.3.0 名次、斷言沒動；改完只重跑受影響的 4 個檔（`v123Forbidden`、`v130Acceptance`、`v130TieBreak`、`v131Acceptance`）：44 個全過。沒有再跑第二次全套。
- vitest 全套（`vitest.flagoff131.config.ts`，useV131 關 ＝ v1.3.0）：84 檔 1117 個；第一輪 1 個失敗（`v123Forbidden` 長度斷言寫死了炔醇片段，已改成依閘門加 0 或 1），重跑該檔與 v130 兩檔：30 個全過。v1.3.0 的 1068 個既有測試在旗標關下全過（v131Baseline 另釘 12 個樣本名次與分數等於 v1.3.0）。
- 既有旗標關設定：`vitest.flagoff130.config.ts`、`vitest.flagoff.config.ts` 各跑相關 6 檔（v131Alkynol、v131ParsimonyUnit、v131ReadingLine、v131Baseline、v123Forbidden、diagnosticSummary）：各 63 個全過。
- E2E（Playwright，視窗 1280×720，暫用設定檔覆寫 viewport，未提交）：36 個全過。
- 測試標記檢查：基線 65、現 96、missing 0（新增 `candidate-parsimony-note`，無重複）。

## 8. 發佈

- PR #13，merge commit `029a1c1de40c7e4ca0a1fc88b529094bae59814d`（merge commit，未 squash／rebase；含 da061ec）。本機 main 已 ff 同步。
- Render 約 1 分鐘內自動部署；`/api/health` 回報 `version 1.3.1`、revision `029a1c1`。
- 正式站短檢查（1280×720，合成對甲苯酚 ¹H：7.05 d 2H、6.73 d 2H、4.70 br s 1H、2.28 s 3H，分子式 C7H8O，未用任何真實圖譜）：頁面載入、版本標示 v1.3.1、分析完成、第 1 名為對甲苯酚（相容度 95）、診斷頁摘要出現「¹H 峰表與程式的讀法」且每個訊號列出全部可讀類別（例如 7.05 ppm：芳香 CH、烯基 CH；4.70 ppm：烯基 CH、接 O 的碳 H）；pageerror 0。
- zip：`releases/SpecReader_v1.3.1.zip`（git archive，不含 notes/，469 個檔）。
