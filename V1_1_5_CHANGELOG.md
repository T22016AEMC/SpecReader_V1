# V1.1.5 — P1a 組成推斷層（中間版本）

基準 v1.1.4，分支 `claude-mode`。**中間版本：P1b（給定分子式完整窮舉結構異構物）與 P1c（完整性評分、跨分子式排名與結果頁）將接續，三段完成後才標為 v1.2.0。** 詳細內容見 `V1_2_0_P1A_CHANGELOG.md` 與 `docs/P1A_COMPOSITION_DESIGN.md`。

本版內容：

- **P1a 組成推斷層**（`src/engines/composition/`）：從任意光譜組合推出多個競爭分子式，各附支持／矛盾／未知理由與未校準的相對信心；使用者分子式仍是唯一硬性假設。沒有使用者分子式時，對信心前 3 名的分子式各自搜尋（每個最多 48 個候選），總狀態與時間不超過原上限。
- **溶劑標記來源修正**：只有使用者明確標記（`classificationSource='USER'`）的非分析物峰才從 Mode A 觀測排除；自動判定與舊標記保留為可選觀測。
- **health 版本號修正**：`/api/health` 與啟動日誌改讀 `package.json` 的 version。
- **Golden Rules 小分子例外**：碳數 ≤ 2 的分子式，Table 2 的元素比例規則只作軟懲罰（CHCl₃、CH₂Cl₂、CCl₄、CF₃Br 不再被硬排除）；碳數 ≥ 3 維持原規則。Golden Rules 數值已依 Kind & Fiehn 2007 原文核對。
- **UI 無變更。**

已知限制：

- 結構生成器仍是既有的有界 beam 圖搜尋（deNovoGraphSearch），只支援 C、H、N、O、F、Cl、Br；P1b 才替換為完整窮舉。
- 組成推斷結果只在資料中，尚未顯示在 UI（P1c）。
- UI 尚未加入峰分類（溶劑標記）控制項，所以溶劑修正在 UI 上暫無可見效果（P1c）。
- 相對信心與評分權重都未校準；化合物辨識準確性由使用者測試。
