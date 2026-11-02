# SpecReader v1.2.2 發佈報告

設計與驗收數字見 `P4_REPORT.md`、`V1_2_2_CHANGELOG.md`，此處不重述。

## 結果
- **上線成功**：https://specreader-v1.onrender.com ，`/api/health` 回傳 `{"status":"ok","version":"1.2.2","revision":"a60ddc0a512c64bed3a5e73c8c2660c8c67723fd"}`（推送後約 1 分鐘生效；之前顯示 1.2.1）。
- PR：https://github.com/T22016AEMC/SpecReader_V1/pull/10 ，以 **merge commit** 合併（不 squash、不 rebase）。
- **merge commit：`a60ddc0a512c64bed3a5e73c8c2660c8c67723fd`**；分支最後一個提交 `6d0bcf0`（本次小改動）。

## 本次小改動
第 1 頁標記清單：¹H「多重性」下拉、IR「吸收帶形態」下拉移到主列同一行（¹H：位置 δ、積分之後；IR：波數之後）。原「形態 寬／窄」與多重性小標籤移除（下拉本身顯示）。J 值、備註、IR 基線相對強度仍在「明細」。¹³C、MS 系列沒有類似欄位。`data-testid`、`aria-label` 不變。只改 `src/components/PeakObservationTable.tsx`。

## 測試實際數字（6d0bcf0）
- `typecheck`、`build`：無錯。
- 單元測試：68 檔、**911／911 全過**。`v121FlagGolden`（`ethylNoFormula`、`h1OnlyNoFormula`）第一次就過，沒有重跑；停點 4 時兩次失敗（909／911）。已知牆鐘 500 ms 預算不穩定，與 v1.2.1 原版同樣、非本版造成，列入 1.2.3。
- E2E：**36／36 全過**；**沒有修改任何既有 E2E**（「展開明細」那一步變成多餘但無害，所有 `expect` 原封不動）。
- 測試用標記：`baseline 65 ids, now 95; missing 0; new 30`。
- `git diff origin/main -- src/engines src/workers src/types`：空。
- 開發伺服器：原先在 3000 埠執行的實例是版本改成 1.2.2 之前啟動的（版本在啟動時讀入並快取），顯示 1.2.1；程式沒問題，重啟後 `/api/health` 為 1.2.2，建置後的前端含 `v1.2.2` 與診斷摘要 `appVersion:1.2.2`。

## 冒煙檢查（正式站，合成資料）
通過：頁面載入、標題列 v1.2.2；第 1 頁上傳 IR CSV，標記列主列直接看到「吸收帶形態」下拉；第 3 頁輸入 C2H6O 後分析完成，看到「圖譜官能基」與「預測結構」分頁；診斷摘要「版本 1.2.2」；無 page error。

## 回滾
1. Render 後台 Rollback 到 v1.2.1 的部署；或
2. `git revert -m 1 a60ddc0a512c64bed3a5e73c8c2660c8c67723fd` 後推送；或
3. 重新部署 `releases\SpecReader_v1.2.1.zip`。
只想回深色：移除 `index.html` 的 `<html data-theme="light">`。無資料遷移。

發佈檔：`releases\SpecReader_v1.2.2.zip`（`git archive`，不含 `notes/`，1.6 MB）。
