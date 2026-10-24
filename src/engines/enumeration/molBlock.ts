import type {Problem} from './problem';
import type {NewBond} from './search';

const pad = (n: number) => String(n).padStart(3, ' ');

/**
 * V2000 mol block of one assembled molecule: fragment bonds + new bonds, no explicit hydrogens (RDKit derives implicit H from
 * valence; every atom is saturated by construction). All coordinates are zero, so RDKit builds no conformer and perceives no stereochemistry.
 */
export function buildMolBlock(P: Problem, newBonds: NewBond[]): string {
  const bonds = [...P.fixedBonds.map(b => ({a: b.a, b: b.b, order: b.order})), ...newBonds];
  const lines = ['SpecReader fragment assembly', '  SpecReader', '', `${pad(P.n)}${pad(bonds.length)}  0  0  0  0            999 V2000`];
  for (let i = 0; i < P.n; i++) lines.push(`    0.0000    0.0000    0.0000 ${P.el[i].padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`);
  for (const b of bonds) lines.push(`${pad(b.a + 1)}${pad(b.b + 1)}${pad(b.order)}  0  0  0  0`);
  const charged = P.charge.map((q, i) => ({q, i})).filter(x => x.q !== 0);
  for (let s = 0; s < charged.length; s += 8) {
    const chunk = charged.slice(s, s + 8);
    lines.push(`M  CHG${pad(chunk.length)}${chunk.map(x => ` ${pad(x.i + 1)} ${pad(x.q)}`).join('')}`);
  }
  lines.push('M  END');
  return lines.join('\n');
}
