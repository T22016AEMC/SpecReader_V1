# V1.2.0 P1a — 組成推斷層、溶劑標記修正、health 版本號

基準 v1.1.4（`102e045`），分支 `claude-mode`。這是 v1.2.0 的第一段（P1a／P1b／P1c 全部完成才標為 1.2.0），`package.json` 版本暫時維持 **1.1.4**。設計與審核決定見 `docs/P1A_COMPOSITION_DESIGN.md`。

本版只有工程測試結果，**不宣稱任何化合物的辨識準確率**；化合物準確性由使用者測試。

新增：

- `src/engines/composition/`：組成推斷層。從任意光譜組合推出**多個競爭分子式**，各附支持／矛盾／未知理由（帶觀測 ID）與**未校準**的相對信心；使用者分子式仍是唯一且硬性的假設。
  - MS：多個分子離子假設（依游離方式列出離子型式，未確認者降信心；游離方式與極性未知時正負都列）、EI 不合理丟失、M+1 碳數、M+2 的 Cl／Br／S、高解析 ppm 枚舉。
  - ¹³C 碳數下限與 DEPT 氫數下限；¹H 積分最簡整數比與明確列出的整數倍數；IR／NMR 官能基轉成元素與 DBE 下限（兩個獨立模態才為硬限制，且只作下限）。
  - 有界確定性枚舉（DBE、SENIOR、Seven Golden Rules）；F／I／P／Si 預設禁止、有特定證據才開放；截斷與捨棄數量一律回報。
  - 所有可調常數集中於 `compositionConfig.ts`。
- `StructureGenerator` 介面與 `generateForCompositions`：無使用者分子式時對前 3 名分子式各自搜尋（每個最多 48 個，合併最多 144），總狀態與時間不超過原上限；P1b 將以完整窮舉器替換生成器，介面不變。
- 結果欄位：`ModeAResult.compositionInference`、`ReasoningTrace.composition`／`compositionSearch`、`CandidateReasoning.compositionHypothesisIds`。不新增進度步驟或 trace stage，**沒有任何 UI 變更**（顯示留到 P1c）。
- `src/appVersion.ts`；`tests/composition.test.ts`（28 項合成資料邏輯測試，含與 mf-finder 的枚舉交叉核對）。
- devDependency `mf-finder` 3.4.25（MIT），只用於測試，不進入正式建置；`THIRD_PARTY_NOTICES.md` 已更新。

修正：

- **溶劑峰**：只有使用者明確標記（`classificationSource='USER'`）的溶劑／雜質／雜訊／水／參考峰才從 Mode A 觀測排除；自動判定與沒有來源欄位的舊標記保留為 `optionalObservation`，不推高 ¹³C 碳數下限、不計入 ¹H 最簡比。`applyNmrSolventTagging` 寫入 `AUTO_SOLVENT_REFERENCE` 來源且不覆蓋使用者標記。目前 UI 沒有分類控制項（P1c 新增），所以此修正在 UI 上暫無可見效果；benchmark 峰表可用新欄位 `classification` 明確標記。
- **版本號**：`/api/health` 與啟動日誌改為讀取 `package.json` 的 version（開發模式與 `node dist/server.mjs` 皆已驗證）。

其他接線：`DeterministicStructureGenerator` 在候選來自組成假設搜尋時略過「缺少組成約束就不生成」的閘門；`docs/MODE_A_PATH_MAP.md` 已加入組成層與銜接介面。

驗收：Node 24.22.0 下 typecheck、build 成功；vitest 173 個全過（原 145 個預期值不變，新增 28 個）；E2E 15/15。詳見 `notes\v1.2.0\P1A_REPORT.md`。
