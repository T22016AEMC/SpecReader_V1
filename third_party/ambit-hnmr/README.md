# Ambit-HNMR knowledge base (third-party data, unmodified)

| | |
|---|---|
| File | `hnmr-knowledgebase.txt` (11,943 bytes, MD5 `98ec944631458e1f3c14c4c29f13074a`, identical to the Zenodo file) |
| Source | https://zenodo.org/records/4629851 (file: https://zenodo.org/records/4629851/files/hnmr-knowledgebase.txt?download=1) |
| Title | Ambit-HNMR: an open source tool for prediction of 1H-NMR chemical shifts |
| Version | 1.2 (published February 5, 2021; record modified July 19, 2024) |
| DOI | 10.5281/zenodo.4629851 |
| Authors | Nikolay Kochev, Slava Tsoneva, Maria Frenkeva, Nina Jeliazkova |
| License | Creative Commons Attribution 4.0 International (CC-BY-4.0), as printed on the Zenodo record: "allows re-distribution and re-use of a licensed work on the condition that the creator is appropriately credited" |
| Retrieved | 2026-11-08 |

Attribution text (also in `THIRD_PARTY_NOTICES.md`): "1H additive-increment knowledge base from Ambit-HNMR v1.2 (Kochev, Tsoneva, Frenkeva, Jeliazkova), https://doi.org/10.5281/zenodo.4629851, licensed under CC-BY 4.0. The file is used as data without changes; SpecReader reads the numbers by substituent name."

The same text is embedded verbatim in `src/engines/scientificEngines/ambitHnmrKnowledgeBase.ts` (so that browser and Node builds read one copy); `tests/v14/v140Kb.test.ts` checks that the two are identical.
Only this one file was downloaded; the Java tool and other files of the record were not.
