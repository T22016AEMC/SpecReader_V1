# v1.4.3 全套測試檢查點（2026-11-18 23:07，使用者指示停掉）

全套（`vitest run --maxWorkers=1 --exclude tests/_scratch/**`，139 檔）從 21:45 跑到 23:07，只完成 6 個檔，**0 失敗**。HEAD＝7021a14（package.json 1.4.3）。原始記錄：`%TEMP%\v143\full_test2.log`。

| 檔案 | 測試數 | 結果 | 耗時 |
|---|---|---|---|
| tests/v12/v132Stop4Acceptance.test.ts | 67 | 過 | 1679 s |
| tests/v14/v140Calibration2Rank.test.ts | 43 | 過 | 1027 s |
| tests/v12/v123AClass.test.ts | 12 | 過 | 607 s |
| tests/v14/v142Ir2Snapshot.test.ts | 55 | 過 | 537 s |
| tests/v14/v140Round3Snapshot.test.ts | 84 | 過 | 484 s |
| tests/v14/v141FlagOnSnapshot.test.ts | 55 | 過 | 445 s |

使用者訊息說「已通過 5 個」；停止前又完成了第 6 個（v141FlagOnSnapshot），一併記錄、不重跑。第一次全套（含本機專用 tests/_scratch）另外中止：該資料夾被 .git/info/exclude 排除、不在倉庫內，且有失敗與長時間卡住，記錄 `full_test_with_scratch_aborted.log`。
