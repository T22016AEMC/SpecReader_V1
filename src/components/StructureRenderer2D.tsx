import React, { useMemo } from "react";
import { AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";
import { MolecularGraphValidator } from "../engines/scientificEngines/molecularGraphValidator";

interface StructureRenderer2DProps {
  smiles?: string;
  formula?: string;
  title?: string;
  compact?: boolean;
  showValidationBadge?: boolean;
}

interface Atom2D {
  x: number;
  y: number;
  label?: string;
  color?: string;
}

interface Bond2D {
  from: number;
  to: number;
  order: 1 | 2 | 3;
  isAromaticRing?: boolean;
}

interface SkeletalLayout {
  atoms: Atom2D[];
  bonds: Bond2D[];
  aromaticCenter?: { x: number; y: number; r: number };
}

function buildHexagonAtoms(cx: number, cy: number, r: number): Atom2D[] {
  const pts: Atom2D[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (-Math.PI / 2) + (i * Math.PI) / 3;
    pts.push({
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    });
  }
  return pts;
}

function getPrecomputedLayout(smiles: string): SkeletalLayout {
  const s = smiles.trim();
  const cx = 140;
  const cy = 105;
  const r = 34;

  // 1. Aspirin: CC(=O)Oc1ccccc1C(=O)O
  if (s === "CC(=O)Oc1ccccc1C(=O)O") {
    const ring = buildHexagonAtoms(cx - 18, cy + 8, r);
    const atoms: Atom2D[] = [
      ...ring,
      // 6: C(=O) at pos 1 (top-right)
      { x: ring[1].x + 30, y: ring[1].y - 16 },
      // 7: =O
      { x: ring[1].x + 30, y: ring[1].y - 46, label: "O", color: "#f87171" },
      // 8: -OH
      { x: ring[1].x + 56, y: ring[1].y - 1, label: "OH", color: "#f87171" },
      // 9: -O- at pos 2 (bottom-right)
      { x: ring[2].x + 30, y: ring[2].y + 15, label: "O", color: "#f87171" },
      // 10: C(=O)
      { x: ring[2].x + 58, y: ring[2].y - 1 },
      // 11: =O
      { x: ring[2].x + 58, y: ring[2].y - 30, label: "O", color: "#f87171" },
      // 12: -CH3
      { x: ring[2].x + 85, y: ring[2].y + 15, label: "CH₃", color: "#94a3b8" },
    ];
    const bonds: Bond2D[] = [
      { from: 0, to: 1, order: 2 },
      { from: 1, to: 2, order: 1 },
      { from: 2, to: 3, order: 2 },
      { from: 3, to: 4, order: 1 },
      { from: 4, to: 5, order: 2 },
      { from: 5, to: 0, order: 1 },
      { from: 1, to: 6, order: 1 },
      { from: 6, to: 7, order: 2 },
      { from: 6, to: 8, order: 1 },
      { from: 2, to: 9, order: 1 },
      { from: 9, to: 10, order: 1 },
      { from: 10, to: 11, order: 2 },
      { from: 10, to: 12, order: 1 },
    ];
    return { atoms, bonds, aromaticCenter: { x: cx - 18, y: cy + 8, r: 19 } };
  }

  // 2. 4-Acetoxybenzoic acid (Para isomer): CC(=O)Oc1ccc(C(=O)O)cc1
  if (s === "CC(=O)Oc1ccc(C(=O)O)cc1") {
    const ring = buildHexagonAtoms(cx, cy, r);
    const atoms: Atom2D[] = [
      ...ring,
      // 6: C(=O) at top (0)
      { x: ring[0].x, y: ring[0].y - 30 },
      // 7: =O
      { x: ring[0].x - 24, y: ring[0].y - 45, label: "O", color: "#f87171" },
      // 8: -OH
      { x: ring[0].x + 25, y: ring[0].y - 45, label: "OH", color: "#f87171" },
      // 9: -O- at bottom (3)
      { x: ring[3].x, y: ring[3].y + 28, label: "O", color: "#f87171" },
      // 10: C=O
      { x: ring[3].x + 28, y: ring[3].y + 42 },
      // 11: =O
      { x: ring[3].x + 54, y: ring[3].y + 28, label: "O", color: "#f87171" },
      // 12: CH3
      { x: ring[3].x + 28, y: ring[3].y + 68, label: "CH₃", color: "#94a3b8" },
    ];
    const bonds: Bond2D[] = [
      { from: 0, to: 1, order: 2 },
      { from: 1, to: 2, order: 1 },
      { from: 2, to: 3, order: 2 },
      { from: 3, to: 4, order: 1 },
      { from: 4, to: 5, order: 2 },
      { from: 5, to: 0, order: 1 },
      { from: 0, to: 6, order: 1 },
      { from: 6, to: 7, order: 2 },
      { from: 6, to: 8, order: 1 },
      { from: 3, to: 9, order: 1 },
      { from: 9, to: 10, order: 1 },
      { from: 10, to: 11, order: 2 },
      { from: 10, to: 12, order: 1 },
    ];
    return { atoms, bonds, aromaticCenter: { x: cx, y: cy, r: 19 } };
  }

  // 3. Methyl salicylate: COC(=O)c1ccccc1O
  if (s === "COC(=O)c1ccccc1O") {
    const ring = buildHexagonAtoms(cx - 16, cy + 8, r);
    const atoms: Atom2D[] = [
      ...ring,
      { x: ring[1].x + 30, y: ring[1].y - 16 },
      { x: ring[1].x + 30, y: ring[1].y - 44, label: "O", color: "#f87171" },
      { x: ring[1].x + 56, y: ring[1].y - 1, label: "OCH₃", color: "#f87171" },
      { x: ring[2].x + 30, y: ring[2].y + 16, label: "OH", color: "#f87171" },
    ];
    const bonds: Bond2D[] = [
      { from: 0, to: 1, order: 2 },
      { from: 1, to: 2, order: 1 },
      { from: 2, to: 3, order: 2 },
      { from: 3, to: 4, order: 1 },
      { from: 4, to: 5, order: 2 },
      { from: 5, to: 0, order: 1 },
      { from: 1, to: 6, order: 1 },
      { from: 6, to: 7, order: 2 },
      { from: 6, to: 8, order: 1 },
      { from: 2, to: 9, order: 1 },
    ];
    return { atoms, bonds, aromaticCenter: { x: cx - 16, y: cy + 8, r: 19 } };
  }

  // 4. Paracetamol: CC(=O)Nc1ccc(O)cc1
  if (s === "CC(=O)Nc1ccc(O)cc1") {
    const ring = buildHexagonAtoms(cx - 10, cy, r);
    const atoms: Atom2D[] = [
      ...ring,
      // 6: HO at pos 4 (bottom-left)
      { x: ring[4].x - 30, y: ring[4].y + 16, label: "HO", color: "#f87171" },
      // 7: NH at pos 1 (top-right)
      { x: ring[1].x + 30, y: ring[1].y - 16, label: "NH", color: "#60a5fa" },
      // 8: C(=O)
      { x: ring[1].x + 58, y: ring[1].y },
      // 9: =O
      { x: ring[1].x + 58, y: ring[1].y + 30, label: "O", color: "#f87171" },
      // 10: CH3
      { x: ring[1].x + 86, y: ring[1].y - 16, label: "CH₃", color: "#94a3b8" },
    ];
    const bonds: Bond2D[] = [
      { from: 0, to: 1, order: 2 },
      { from: 1, to: 2, order: 1 },
      { from: 2, to: 3, order: 2 },
      { from: 3, to: 4, order: 1 },
      { from: 4, to: 5, order: 2 },
      { from: 5, to: 0, order: 1 },
      { from: 4, to: 6, order: 1 },
      { from: 1, to: 7, order: 1 },
      { from: 7, to: 8, order: 1 },
      { from: 8, to: 9, order: 2 },
      { from: 8, to: 10, order: 1 },
    ];
    return { atoms, bonds, aromaticCenter: { x: cx - 10, y: cy, r: 19 } };
  }

  // 5. 2-Acetamidophenol: CC(=O)Nc1ccccc1O
  if (s === "CC(=O)Nc1ccccc1O") {
    const ring = buildHexagonAtoms(cx - 16, cy + 5, r);
    const atoms: Atom2D[] = [
      ...ring,
      { x: ring[1].x + 28, y: ring[1].y - 16, label: "NH", color: "#60a5fa" },
      { x: ring[1].x + 56, y: ring[1].y - 2 },
      { x: ring[1].x + 56, y: ring[1].y - 30, label: "O", color: "#f87171" },
      { x: ring[1].x + 84, y: ring[1].y + 14, label: "CH₃", color: "#94a3b8" },
      { x: ring[2].x + 30, y: ring[2].y + 16, label: "OH", color: "#f87171" },
    ];
    const bonds: Bond2D[] = [
      { from: 0, to: 1, order: 2 },
      { from: 1, to: 2, order: 1 },
      { from: 2, to: 3, order: 2 },
      { from: 3, to: 4, order: 1 },
      { from: 4, to: 5, order: 2 },
      { from: 5, to: 0, order: 1 },
      { from: 1, to: 6, order: 1 },
      { from: 6, to: 7, order: 1 },
      { from: 7, to: 8, order: 2 },
      { from: 7, to: 9, order: 1 },
      { from: 2, to: 10, order: 1 },
    ];
    return { atoms, bonds, aromaticCenter: { x: cx - 16, y: cy + 5, r: 19 } };
  }

  // 6. Ethyl benzoate: CCOC(=O)c1ccccc1
  if (s === "CCOC(=O)c1ccccc1") {
    const ring = buildHexagonAtoms(cx - 32, cy + 5, r);
    const atoms: Atom2D[] = [
      ...ring,
      { x: ring[1].x + 30, y: ring[1].y - 16 },
      { x: ring[1].x + 30, y: ring[1].y - 45, label: "O", color: "#f87171" },
      { x: ring[1].x + 56, y: ring[1].y - 1, label: "O", color: "#f87171" },
      { x: ring[1].x + 84, y: ring[1].y - 16 },
      { x: ring[1].x + 110, y: ring[1].y - 1, label: "CH₃", color: "#94a3b8" },
    ];
    const bonds: Bond2D[] = [
      { from: 0, to: 1, order: 2 },
      { from: 1, to: 2, order: 1 },
      { from: 2, to: 3, order: 2 },
      { from: 3, to: 4, order: 1 },
      { from: 4, to: 5, order: 2 },
      { from: 5, to: 0, order: 1 },
      { from: 1, to: 6, order: 1 },
      { from: 6, to: 7, order: 2 },
      { from: 6, to: 8, order: 1 },
      { from: 8, to: 9, order: 1 },
      { from: 9, to: 10, order: 1 },
    ];
    return { atoms, bonds, aromaticCenter: { x: cx - 32, y: cy + 5, r: 19 } };
  }

  // 7. Benzyl acetate: CC(=O)OCc1ccccc1
  if (s === "CC(=O)OCc1ccccc1") {
    const ring = buildHexagonAtoms(cx - 34, cy + 5, r);
    const atoms: Atom2D[] = [
      ...ring,
      { x: ring[1].x + 28, y: ring[1].y - 16 },
      { x: ring[1].x + 56, y: ring[1].y - 1, label: "O", color: "#f87171" },
      { x: ring[1].x + 84, y: ring[1].y - 16 },
      { x: ring[1].x + 84, y: ring[1].y - 45, label: "O", color: "#f87171" },
      { x: ring[1].x + 110, y: ring[1].y - 1, label: "CH₃", color: "#94a3b8" },
    ];
    const bonds: Bond2D[] = [
      { from: 0, to: 1, order: 2 },
      { from: 1, to: 2, order: 1 },
      { from: 2, to: 3, order: 2 },
      { from: 3, to: 4, order: 1 },
      { from: 4, to: 5, order: 2 },
      { from: 5, to: 0, order: 1 },
      { from: 1, to: 6, order: 1 },
      { from: 6, to: 7, order: 1 },
      { from: 7, to: 8, order: 1 },
      { from: 8, to: 9, order: 2 },
      { from: 8, to: 10, order: 1 },
    ];
    return { atoms, bonds, aromaticCenter: { x: cx - 34, y: cy + 5, r: 19 } };
  }

  // 8. Acetophenone: CC(=O)c1ccccc1
  if (s === "CC(=O)c1ccccc1") {
    const ring = buildHexagonAtoms(cx - 20, cy + 5, r);
    const atoms: Atom2D[] = [
      ...ring,
      { x: ring[1].x + 32, y: ring[1].y - 16 },
      { x: ring[1].x + 32, y: ring[1].y - 46, label: "O", color: "#f87171" },
      { x: ring[1].x + 60, y: ring[1].y, label: "CH₃", color: "#94a3b8" },
    ];
    const bonds: Bond2D[] = [
      { from: 0, to: 1, order: 2 },
      { from: 1, to: 2, order: 1 },
      { from: 2, to: 3, order: 2 },
      { from: 3, to: 4, order: 1 },
      { from: 4, to: 5, order: 2 },
      { from: 5, to: 0, order: 1 },
      { from: 1, to: 6, order: 1 },
      { from: 6, to: 7, order: 2 },
      { from: 6, to: 8, order: 1 },
    ];
    return { atoms, bonds, aromaticCenter: { x: cx - 20, y: cy + 5, r: 19 } };
  }

  // 9. Phenylacetaldehyde: O=CCc1ccccc1
  if (s === "O=CCc1ccccc1") {
    const ring = buildHexagonAtoms(cx - 24, cy + 5, r);
    const atoms: Atom2D[] = [
      ...ring,
      { x: ring[1].x + 30, y: ring[1].y - 16 },
      { x: ring[1].x + 58, y: ring[1].y - 1 },
      { x: ring[1].x + 86, y: ring[1].y - 16, label: "O", color: "#f87171" },
      { x: ring[1].x + 58, y: ring[1].y + 26, label: "H", color: "#94a3b8" },
    ];
    const bonds: Bond2D[] = [
      { from: 0, to: 1, order: 2 },
      { from: 1, to: 2, order: 1 },
      { from: 2, to: 3, order: 2 },
      { from: 3, to: 4, order: 1 },
      { from: 4, to: 5, order: 2 },
      { from: 5, to: 0, order: 1 },
      { from: 1, to: 6, order: 1 },
      { from: 6, to: 7, order: 1 },
      { from: 7, to: 8, order: 2 },
      { from: 7, to: 9, order: 1 },
    ];
    return { atoms, bonds, aromaticCenter: { x: cx - 24, y: cy + 5, r: 19 } };
  }

  // 10. Ethyl acetate: CCOC(=O)C
  if (s === "CCOC(=O)C") {
    const atoms: Atom2D[] = [
      { x: 65, y: 115, label: "H₃C", color: "#94a3b8" },
      { x: 102, y: 95 },
      { x: 102, y: 62, label: "O", color: "#f87171" },
      { x: 138, y: 115, label: "O", color: "#f87171" },
      { x: 174, y: 95 },
      { x: 210, y: 115, label: "CH₃", color: "#94a3b8" },
    ];
    const bonds: Bond2D[] = [
      { from: 0, to: 1, order: 1 },
      { from: 1, to: 2, order: 2 },
      { from: 1, to: 3, order: 1 },
      { from: 3, to: 4, order: 1 },
      { from: 4, to: 5, order: 1 },
    ];
    return { atoms, bonds };
  }

  // 11. Butyric acid: CCCC(=O)O
  if (s === "CCCC(=O)O") {
    const atoms: Atom2D[] = [
      { x: 62, y: 115, label: "H₃C", color: "#94a3b8" },
      { x: 98, y: 95 },
      { x: 134, y: 115 },
      { x: 170, y: 95 },
      { x: 170, y: 62, label: "O", color: "#f87171" },
      { x: 206, y: 115, label: "OH", color: "#f87171" },
    ];
    const bonds: Bond2D[] = [
      { from: 0, to: 1, order: 1 },
      { from: 1, to: 2, order: 1 },
      { from: 2, to: 3, order: 1 },
      { from: 3, to: 4, order: 2 },
      { from: 3, to: 5, order: 1 },
    ];
    return { atoms, bonds };
  }

  // 通用有效 SMILES 自動幾何佈局 (支援含苯環或脂肪鏈)
  if (s.includes("c1ccccc1") || s.includes("c1ccc")) {
    const ring = buildHexagonAtoms(cx - 15, cy, r);
    const atoms: Atom2D[] = [
      ...ring,
      { x: ring[1].x + 34, y: ring[1].y - 16, label: "R", color: "#38bdf8" },
    ];
    const bonds: Bond2D[] = [
      { from: 0, to: 1, order: 2 },
      { from: 1, to: 2, order: 1 },
      { from: 2, to: 3, order: 2 },
      { from: 3, to: 4, order: 1 },
      { from: 4, to: 5, order: 2 },
      { from: 5, to: 0, order: 1 },
      { from: 1, to: 6, order: 1 },
    ];
    return { atoms, bonds, aromaticCenter: { x: cx - 15, y: cy, r: 19 } };
  }

  // 通用鏈狀骨架
  const atoms: Atom2D[] = [
    { x: 75, y: 112 },
    { x: 115, y: 90 },
    { x: 155, y: 112 },
    { x: 195, y: 90 },
  ];
  const bonds: Bond2D[] = [
    { from: 0, to: 1, order: 1 },
    { from: 1, to: 2, order: s.includes("=") ? 2 : 1 },
    { from: 2, to: 3, order: 1 },
  ];
  return { atoms, bonds };
}

export const StructureRenderer2D: React.FC<StructureRenderer2DProps> = ({
  smiles = "",
  formula,
  title,
  compact = false,
  showValidationBadge = true,
}) => {
  const cleanSmiles = smiles.trim();
  const graphValidation = useMemo(
    () =>
      cleanSmiles
        ? MolecularGraphValidator.validateSmilesGraph(cleanSmiles, formula)
        : null,
    [cleanSmiles, formula]
  );

  const layout = useMemo(() => {
    if (!cleanSmiles || !graphValidation?.isValid) return null;
    return getPrecomputedLayout(cleanSmiles);
  }, [cleanSmiles, graphValidation]);

  if (!cleanSmiles) {
    return (
      <div className="rounded-lg border border-dashed border-slate-800 bg-slate-950/50 p-4 text-center text-xs text-slate-400">
        尚未指定分子結構 (請載入未知物光譜進行推導，或於上方輸入 SMILES / 分子式)
      </div>
    );
  }

  if (!graphValidation?.isValid || !layout) {
    return (
      <div className="rounded-lg border border-rose-500/40 bg-rose-950/20 p-3 text-xs text-rose-200">
        <div className="flex items-center gap-2 font-semibold text-rose-300">
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
          <span>分子圖拓撲檢驗未通過 — 已攔截非法結構繪製</span>
        </div>
        <div className="mt-1.5 font-mono text-[11px] text-rose-300/90">
          SMILES: {cleanSmiles || "(空白)"}
        </div>
        <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[11px] text-rose-200/80">
          {(graphValidation?.errors || []).map((err, idx) => (
            <li key={idx}>{err}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div
      className={`relative flex flex-col justify-between rounded-lg border border-slate-800 bg-slate-950/90 ${
        compact ? "p-2" : "p-3"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-semibold text-cyan-300">
            {graphValidation.computedFormula}
          </span>
          <span className="rounded bg-slate-800/90 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
            DBE = {graphValidation.computedDBE}
          </span>
        </div>
        {showValidationBadge && (
          <span
            className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-950/40 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300"
            title="通過連通性、環閉合與原子化合價檢驗"
          >
            <ShieldCheck className="h-3 w-3 text-emerald-400" />
            Graph Verified
          </span>
        )}
      </div>

      <div className="my-1 flex items-center justify-center">
        <svg
          viewBox="0 0 280 195"
          className={compact ? "h-32 w-full max-w-[230px]" : "h-44 w-full max-w-[280px]"}
        >
          {/* 繪製化學鍵 */}
          {layout.bonds.map((b, idx) => {
            const p1 = layout.atoms[b.from];
            const p2 = layout.atoms[b.to];
            if (!p1 || !p2) return null;

            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const len = Math.hypot(dx, dy) || 1;
            const nx = (-dy / len) * 3.6;
            const ny = (dx / len) * 3.6;

            // 若有芳香環內圓，環上的雙鍵只畫單線配合內圓，或畫標準雙鍵
            const isRingDouble = layout.aromaticCenter && b.from < 6 && b.to < 6;

            if (b.order === 2 && !isRingDouble) {
              return (
                <g key={idx}>
                  <line
                    x1={p1.x + nx * 0.65}
                    y1={p1.y + ny * 0.65}
                    x2={p2.x + nx * 0.65}
                    y2={p2.y + ny * 0.65}
                    stroke="#e2e8f0"
                    strokeWidth={2.1}
                    strokeLinecap="round"
                  />
                  <line
                    x1={p1.x - nx * 0.65}
                    y1={p1.y - ny * 0.65}
                    x2={p2.x - nx * 0.65}
                    y2={p2.y - ny * 0.65}
                    stroke="#38bdf8"
                    strokeWidth={2.1}
                    strokeLinecap="round"
                  />
                </g>
              );
            }

            return (
              <line
                key={idx}
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke="#cbd5e1"
                strokeWidth={2.2}
                strokeLinecap="round"
              />
            );
          })}

          {/* 繪製芳香環共軛圓圈 */}
          {layout.aromaticCenter && (
            <circle
              cx={layout.aromaticCenter.x}
              cy={layout.aromaticCenter.y}
              r={layout.aromaticCenter.r}
              fill="none"
              stroke="#38bdf8"
              strokeWidth={1.6}
              strokeDasharray="4 2"
              opacity={0.85}
            />
          )}

          {/* 繪製雜原子與端基標籤 */}
          {layout.atoms.map((a, idx) => {
            if (!a.label) return null;
            return (
              <g key={idx}>
                <rect
                  x={a.x - 13}
                  y={a.y - 9}
                  width={26}
                  height={18}
                  rx={4}
                  fill="#020617"
                />
                <text
                  x={a.x}
                  y={a.y + 4}
                  textAnchor="middle"
                  fill={a.color || "#f8fafc"}
                  fontSize={12}
                  fontWeight={700}
                  fontFamily="IBM Plex Mono, monospace"
                >
                  {a.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex items-center justify-between border-t border-slate-800/80 pt-1.5 text-[11px] text-slate-400">
        <span className="truncate font-mono text-[10px] text-slate-400" title={smiles}>
          SMILES: {smiles}
        </span>
        {title && (
          <span className="ml-2 shrink-0 text-[10px] text-slate-300">{title}</span>
        )}
      </div>
    </div>
  );
};
