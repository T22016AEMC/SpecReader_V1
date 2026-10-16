# V1.1.3 本輪來源增補

沒有新增第三方依賴或複製開源原始碼。實際執行既有 RDKit.js 2026.9.1（BSD-3-Clause，https://github.com/rdkit/rdkit-js）作分子圖淨化、canonical與SMARTS；新原子／芳環增量beam圖搜尋是本專案自有程式，並非整合某個通用生成器。

IR常見OH氫鍵寬峰、NH與羰基伴隨區間，參考MSU教學資料：https://www2.chemistry.msu.edu/faculty/reusch/VirtTxtJml/Spectrpy/InfraRed/infrared.htm 。使用化學原理與區間知識，沒有複製圖片或測試物實測數據，沒有虛構DOI／準確率。

nmrglue、matchms、pyOpenMS、pyteomics、SIRIUS、CFM-ID仍未作本版執行依賴；不得稱已整合。既有工具／授權紀錄如下，歷史搜尋架構說明以V1.1.3文件為準。

---
# 實際整合與參考

既有查證細節保留 `V1_SCIENTIFIC_REFERENCES.md`（2026-10-13）；本輪新增方法查證 2026-10-14。沒有引入模型權重、Python、GPU 或未授權資料。

|狀態|來源／文獻|程式位置／授權|
|---|---|---|
|實際整合|[RDKit](https://github.com/rdkit/rdkit)、[JS/WASM](https://github.com/rdkit/rdkit-js)、[MinimalLib](https://github.com/rdkit/rdkit/blob/master/Code/MinimalLib/README.md)、軟體 DOI [10.5281/zenodo.591637](https://doi.org/10.5281/zenodo.591637)|`@rdkit/rdkit` lock 2026.9.1；`rdkitAdapter.ts`／新 `deNovoGraphSearch.ts` 使用 MOL block、validity、canonical SMILES。BSD-3-Clause，保留完整 notice。RDKit 本身不預測光譜。|
|既有實際整合|[jcampconverter 9.6.4](https://registry.npmjs.org/jcampconverter/9.6.4)、[SheetJS](https://docs.sheetjs.com/)|`jcampAdapter.ts`／`spectrumParser.ts`；9.6.4 MIT、SheetJS 0.20.3 Apache-2.0；保留 notice，不升級至授權不同的新 JCAMP 版本。|
|自行實作方法|[全域指派問題官方說明](https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.linear_sum_assignment.html)，Crouse DOI [10.1109/TAES.2016.140952](https://doi.org/10.1109/TAES.2016.140952)|`globalPeakAssignment.ts` 自寫 Hungarian；SciPy 文件描述的是另一種指派算法，僅參考問題定義，沒有 import／複製 SciPy 程式。|
|自行實作方法|[MAYGEN](https://github.com/MehmetAzizYirik/MAYGEN)，DOI [10.1186/s13321-021-00529-9](https://doi.org/10.1186/s13321-021-00529-9)|MAYGEN MIT，**未整合**。本輪自寫有界圖枚舉，不宣稱實作其完整 orderly generation 或全部異構物枚舉。|
|既有自行實作|[pybaselines Whittaker](https://pybaselines.readthedocs.io/en/latest/algorithms/whittaker.html)，Eilers DOI [10.1021/ac034173t](https://doi.org/10.1021/ac034173t)|`whittakerBaseline.ts` 自寫數學算法；無 pybaselines 依賴。五點線性基線／像素追蹤亦為自寫確定性處理。|
|研究／原理參考，未整合|[nmrglue](https://github.com/jjhelmus/nmrglue) BSD-3，DOI [10.1007/s10858-013-9718-x](https://doi.org/10.1007/s10858-013-9718-x)；[matchms](https://github.com/matchms/matchms) Apache-2，DOI [10.21105/joss.02411](https://doi.org/10.21105/joss.02411)|沒有 FID 處理後端或 matchms 譜庫匹配；NMR／碎片評分仍為 TypeScript 經驗圖模型。|
|研究／原理參考，未整合|[OpenMS／pyOpenMS](https://github.com/OpenMS/OpenMS) BSD-3，DOI [10.1002/pmic.201300246](https://doi.org/10.1002/pmic.201300246)；[Pyteomics](https://github.com/levitsky/pyteomics) Apache-2，DOI [10.1007/s13361-012-0516-6](https://doi.org/10.1007/s13361-012-0516-6)；[pymzML](https://github.com/pymzml/pymzML)|`ionMass.ts`／`isotopeEnvelope.ts`／`formulaEngine.ts` 自寫組成與質量算法，沒有執行這些 Python 工具。pymzML 本輪未導入。|
|研究，未整合|[SIRIUS](https://github.com/sirius-ms/sirius) LGPL-3 程式、服務／模型另有條件，DOI [10.1038/s41592-019-0344-8](https://doi.org/10.1038/s41592-019-0344-8)；[CFM-ID 官方程式](https://bitbucket.org/wishartlab/cfm-id-code/)，DOI [10.1021/acs.analchem.1c01465](https://doi.org/10.1021/acs.analchem.1c01465)|沒有 SIRIUS／CFM-ID 模型。CFM-ID 不捏造 GitHub 主庫；權重與再散布條件未完成確認，所以未導入。|

工程依據：`tests/v11Engineering.test.ts`（運算／圖片校正／圖有效性／正式呼叫）、既有 NMR／MS 回歸與桌面測試。這些不是獨立科學準確率驗收。教材群頻率與經驗 NMR 參數沿用 V1 的來源與限制，未宣稱逐條新校準。

修復版（2026-10-15）：新增知識為自行整理的群頻率／局部原子環境區間，來源 [MSU IR 教材](https://www2.chemistry.msu.edu/faculty/reusch/VirtTxtJml/Spectrpy/InfraRed/infrared.htm)／[MSU NMR 教材](https://www2.chemistry.msu.edu/faculty/reusch/VirtTxtJml/Spectrpy/nmr/nmr1.htm)，不複製整份教材、分子參考譜或第三方程式。`irBandKnowledge.ts` 記錄各列來源與限制，矽氧烷沿用 Socrates 群頻率教科書依據。`atomicChemicalEnvironment.ts`／`nmrAtomicEnvironmentModel.ts` 自行實作圖環境與經驗參數，未整合量子後端。無新依賴或模型授權變更。`tests/irNmrRepairFlow.test.ts` 及原圖桌面互動案例只驗證運作與資料傳遞。
# 2026-10-16 六步驟整合補充

沿用已安裝 `@rdkit/rdkit` 2026.9.1（BSD-3-Clause；https://github.com/rdkit/rdkit-js 、https://github.com/rdkit/rdkit）。`rdkitAdapter.depictMolecule`直接使用已整合API生成完整分子SVG；canonical淨化及結構驗證延用原路徑。沒有新依賴、模型權重或第三方原始碼複製。

`hypothesisGenerator`／`localStructureInference`／局部圖接合與協作式搜尋為專案自行實作。化學環境區間來源沿用MSU教學資料（https://www2.chemistry.msu.edu/faculty/reusch/VirtTxtJml/Spectrpy/nmr/nmr1.htm）與既有IR來源；不是量子化學或校準機率模型。nmrglue、matchms、pyOpenMS、pyteomics、SIRIUS、CFM-ID仍未整合，不作相反宣稱。
