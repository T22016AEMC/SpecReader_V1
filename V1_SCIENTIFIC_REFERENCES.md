# 科學來源、實作及整合狀態

查證：2026-10-13。程式碼授權、模型權重、資料庫及線上服務授權分別審查；研究候選不等於已執行。完整第一輪調查保留在專案外的 `audit_reports/03_GITHUB_RESEARCH.md`。

## 實際安裝、接入並執行

|工具／固定依賴|來源／文獻|實作與測試|授權／限制|
|---|---|---|---|
|RDKit `@rdkit/rdkit` 2026.9.1（精確解析版本見 lockfile）|[官方主庫](https://github.com/rdkit/rdkit)、[JS/WASM](https://github.com/rdkit/rdkit-js)、[文件](https://www.rdkit.org/docs/)、軟體概念 DOI [10.5281/zenodo.591637](https://doi.org/10.5281/zenodo.591637)|`rdkitAdapter.ts` 初始化、canonical／is_valid／SMARTS，`chemistryEngine.ts` 入口；`rdkit.test.ts`、Mode B 及 E2E；不只回傳 connected=true|BSD-3-Clause，保留 `docs/licenses/RDKit.txt` 與靜態 notice；不預測光譜，也未涵蓋所有內建圖解析邊界|
|JCAMP `jcampconverter` **9.6.4**|[npm 精確版本 metadata](https://registry.npmjs.org/jcampconverter/9.6.4)、[README 所列舊 GitHub](https://github.com/cheminfo/jcampconverter)、軟體存檔 DOI [10.5281/zenodo.5091526](https://doi.org/10.5281/zenodo.5091526)|`jcampAdapter.ts` → `spectrumParser.ts`，`inputPrecision.test.ts`、四份 NIST 880 點壓縮實測記錄實際解碼|已安裝包 LICENSE 與官方 registry 均確認 MIT；舊 GitHub URL 本轮 404，不宣稱倉庫仍有效。**12.5.10 registry 是 CC-BY-NC-SA-4.0，未導入，不得無審查升級**。存檔 DOI 入口本輪未能讀全文，不聲稱已核對存檔內容|

## 參考科學原理，自行實作；未執行 Python 工具

|模組|原理與來源|V1 位置／測試|適用邊界|
|---|---|---|---|
|IR 尺度與前處理|A=−log₁₀(T)；[pybaselines Whittaker 文件](https://pybaselines.readthedocs.io/en/latest/algorithms/whittaker.html) 的加權二階差分懲罰；Eilers 2003 *A Perfect Smoother* DOI [10.1021/ac034173t](https://doi.org/10.1021/ac034173t)|`irSignalProcessing.ts`、`whittakerBaseline.ts`；`irProcessing.test.ts`、P0 測試；由數學式獨立寫帶狀 Cholesky，沒有複製 pybaselines 原碼|並非完整反卷積；λ 與峰寬有偏差風險，非均勻採樣採保守分位基線；未讀 ACS 全文，不引述其精度數字|
|IR 官能基|既有 Silverstein／Socrates／Pretsch 群頻率及多峰經驗規則；不是量子計算；[IUPAC JCAMP IR 標準](https://iupac.org/wp-content/uploads/2021/08/JCAMP-DX_IR_1988.pdf)|`irEngine.ts` 的每條規則 referenceInfo／替代解釋；IR／Mode B 回歸與公開實測小樣本|原教材未提供每條可核對頁碼，屬現有知識庫来源，不宣稱新數值已經逐條文獻校準；同峰支持競爭假設|
|¹H NMR|一階裂分、化學環境、相對積分尺度不變性、成對 q/t 與 sept/d 比例及 J 相容|`nmrFragmentEvidence.ts`、`nmrEngine.ts`、`nmrReferenceDatabase.ts`；`nmrJointEvidence.test.ts`、原 22 項回歸|仍為經驗模型，未求解強耦合 Hamiltonian 或二維自旋網路；沒有對應新訓練論文／權重|
|¹³C NMR|局部圖環境、等價環境及 DEPT 脈衝序列的適用限制|`nmrEngine.ts`、`nmrReferenceDatabase.ts`；DEPT／APT 及 Mode B 測試|無量子 GIAO／經驗機器學習高精度模型；芳香 C–O／C–N 與羰基重疊不能單峰定骨架|
|MS 精確質量／同位素|[Pyteomics mass 文件](https://pyteomics.readthedocs.io/en/latest/mass.html) 的組成質量／同位素原理，[NIST 同位素表](https://physics.nist.gov/PhysRefData/Compositions/index.html)、[物理常數](https://physics.nist.gov/cuu/Constants/)|`ionMass.ts`、`isotopeEnvelope.ts`、`formulaEngine.ts`；ppm、Na／H／NH4／去質子／多價及 Cl₂／Br₂／C₁₀ 測試|並未 import 或執行 pyteomics／OpenMS；常數精度與輸出舍入分開。枚舉範圍有限，nominal isotope bin 不是儀器完整峰形|
|MS/MS／ToF-SIMS|分子圖分量、元素守恆、單鍵斷裂、有限中性損失及電子質量|`graphFragmentation.ts`、`msmsFragmentationEngine.ts`、`tofSimsScientificEngine.ts`、`fragmentSpectrumPrediction.ts`；`graphFragments.test.ts`、`massScience.test.ts`|不是 CFM-ID 或 SIRIUS 實作；無完整重排／CE／離子產率，ToF 表面矩陣未建模。plausibility 是啟發式權重，非學習機率|
|候選排名|同原始觀測一次计分、相依來源群、單模態平均後依可靠度整合，分子式單獨硬限制|`evidenceLedger.ts` → `crossSpectrumValidator.ts` → `candidateGenerator.ts`；`evidenceLedger.test.ts`|不是校準 Bayes 後驗、不是 matchms cosine。權重仍待實測校準；候選集合有限|

## 已研究但未整合

|專案／來源|文獻 DOI|授權及部署判斷|目前與後續|
|---|---|---|---|
|[nmrglue](https://github.com/jjhelmus/nmrglue)、[文件](https://nmrglue.readthedocs.io/)|[10.1007/s10858-013-9718-x](https://pmc.ncbi.nlm.nih.gov/articles/PMC3636164/)|BSD-3-Clause；Python／CPU，FID I/O／FFT／phase，不需要 GPU|未安裝、未執行；新增原始 FID 處理時評估，不把峰表分類稱為 nmrglue|
|[matchms](https://github.com/matchms/matchms)、[文件](https://matchms.readthedocs.io/)|[10.21105/joss.02411](https://doi.org/10.21105/joss.02411)、[10.1186/s13321-024-00878-1](https://doi.org/10.1186/s13321-024-00878-1)|Apache-2.0；Python／CPU；譜庫另授权|未整合；有授權的相同離子／能量譜庫後再導入一對一譜匹配|
|[OpenMS／pyOpenMS](https://github.com/OpenMS/OpenMS)、[文件](https://pyopenms.readthedocs.io/)|[10.1002/pmic.201300246](https://doi.org/10.1002/pmic.201300246)|BSD-3-Clause；C++／Python，profile MS／mzML 服務成本較高|未整合；需要原始 profile→centroid 時評估；現有 TypeScript 質量計算並非其 binding|
|[pyteomics](https://github.com/levitsky/pyteomics)、[文件](https://pyteomics.readthedocs.io/)|[10.1007/s13361-012-0516-6](https://doi.org/10.1007/s13361-012-0516-6)、[10.1021/acs.jproteome.8b00717](https://doi.org/10.1021/acs.jproteome.8b00717)|Apache-2.0；Python／CPU|僅參考通用質量原理，未做跨函式庫數值 oracle 測試；後續可作獨立驗證工具|
|[SIRIUS](https://github.com/sirius-ms/sirius)、[v6 文件](https://v6.docs.sirius-ms.io/)|[10.1038/s41592-019-0344-8](https://doi.org/10.1038/s41592-019-0344-8)|程式碼 LGPL-3.0；服務／商用帳號及資料庫另核對；Java／外部服務|未整合 fragmentation tree／CSI:FingerID，不能宣稱已實現同等模型；優先獨立 API 研究|
|CFM-ID：[官方](https://cfmid.wishartlab.com/help)、[作者 Bitbucket](https://bitbucket.org/wishartlab/cfm-id-code/src/master/)|[10.1021/acs.analchem.1c01465](https://doi.org/10.1021/acs.analchem.1c01465)、[10.1093/nar/gkac383](https://doi.org/10.1093/nar/gkac383)|未確認完整程式／權重许可；未查到官方 GitHub 主庫；CPU／Docker／權重|未整合、未下載權重；V1 不偽稱完整碎裂或強度預測|
|[pybaselines](https://github.com/derb12/pybaselines)|軟體 DOI [10.5281/zenodo.5608581](https://doi.org/10.5281/zenodo.5608581)|BSD-3-Clause／Python；部分依賴需另查|僅參考公開數學式，未移植其原碼或聲稱數值等同|
|[FullSSPrUCe](https://github.com/thejonaslab/fullsspruce-public)|[10.1039/d3sc01930f](https://doi.org/10.1039/d3sc01930f)|主程式／權重完整授权尚未確認；訓練環境另需求|未整合 NMR shift/J 模型；需獨立分子留出集與權重许可|
|[pySPM](https://github.com/scholi/pySPM)|專案專屬論文 DOI 未查證|Apache-2.0／Python／CPU；儀器資料權利另审查|未整合 Iontof／PCA。ToF 原始儀器格式與矩陣研究的候選|
|[MAYGEN](https://github.com/MehmetAzizYirik/MAYGEN)|[10.1186/s13321-021-00529-9](https://doi.org/10.1186/s13321-021-00529-9)|MIT／Java，CDK 依賴授權另查|未整合；可改善目前有限候選覆蓋，須限制組合爆炸|

本輪保持 Node／Express＋TypeScript＋RDKit WASM，不需要 Python 後端或 GPU。新模型有可靠权重、條件匹配資料與權利後才增加獨立計算服務；不得強制任一模態依賴該服務。

## 實測來源與資料權利

[NIST Chemistry WebBook SRD 69](https://webbook.nist.gov/chemistry/)，DOI [10.18434/T4D303](https://doi.org/10.18434/T4D303)。只在本機讀取四份氣相 IR 作有限驗證，URL／狀態／SHA-256 見 `validation/measured-ir-manifest.json`；原始資料聲明 NIST SRD collection copyright，未放入 Git／公開網站。資料權利不由解析器的 MIT 或 RDKit BSD 授權代替。

## 既有 PubChem API 的契約更新

[官方 PUG REST 規格](https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest)與論文 DOI [10.1093/nar/gky294](https://pmc.ncbi.nlm.nih.gov/articles/PMC6030920/)。使用 SMILES 保留完整表示，ConnectivitySMILES 只含連接層；單同位素值使用 MonoisotopicMass，ExactMass 是最可能同位素組成。來源／實際 API 回應見 validation/pubchem-field-contract.json；這是公共化學參考值，不是實測 MS 或新的預測模型。
