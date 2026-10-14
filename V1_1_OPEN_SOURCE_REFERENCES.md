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
