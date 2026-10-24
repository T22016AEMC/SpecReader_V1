import {beforeAll, it, expect} from 'vitest';
import {initializeRDKit, canonicalizeMolecule} from '../../src/engines/scientificEngines/rdkitAdapter';
import {enumerateStructures} from '../../src/engines/enumeration';
import {methyl, phenyl} from './fragments';

// T6: measurement only (no pass/fail threshold). The numbers are printed as JSON lines tagged "P1B_PERF" and copied into
// docs/P1B_DESIGN.md as the basis for the stage-2 budget defaults. Node on the development machine, single run.
beforeAll(() => initializeRDKit(), 60000);
const mb = (x: number) => Math.round(x / 1048576);
async function measure(label: string, formula: string, alternatives?: Parameters<typeof enumerateStructures>[0]['alternatives']) {
  const rssBefore = process.memoryUsage().rss, heapBefore = process.memoryUsage().heapUsed;
  const t = performance.now();
  const r = await enumerateStructures({formula, alternatives, budget: {maxStates: 2e9, timeMs: 110000}});
  const ms = Math.round(performance.now() - t);
  const m = process.memoryUsage();
  const row = {label, formula, status: r.status, candidates: r.candidates.length, visited: r.stats.visited, leaves: r.stats.leaves, ms, heapDeltaMB: mb(m.heapUsed - heapBefore), rssMB: mb(m.rss), rssDeltaMB: mb(m.rss - rssBefore)};
  console.log('P1B_PERF ' + JSON.stringify(row));
  return row;
}
it('T6 enumerator timings (measure only)', async () => {
  const rows = [
    await measure('alkane C6', 'C6H14'),
    await measure('alkane C8', 'C8H18'),
    await measure('alkane C10', 'C10H22'),
    await measure('formula only C5H10O', 'C5H10O'),
    await measure('formula only C7H16O', 'C7H16O'),
    await measure('T4(i) 2 phenyl + 2 methyl + free C', 'C15H16', [{id: 'S', fragments: [phenyl(2), methyl(2)]}]),
  ];
  expect(rows.every(r => r.status === 'COMPLETE')).toBe(true);
}, 600000);
it('T6 RDKit canonicalisation of 10000 SMILES (measure only)', async () => {
  const pool: string[] = [];
  for (const f of ['C7H16O', 'C8H18', 'C6H12O', 'C7H14']) pool.push(...(await enumerateStructures({formula: f, budget: {maxStates: 2e9, timeMs: 100000}})).candidates.map(c => c.smiles));
  const list = Array.from({length: 10000}, (_, i) => pool[i % pool.length]);
  const t = performance.now();
  let valid = 0;
  for (const s of list) if (canonicalizeMolecule(s).valid) valid++;
  const ms = performance.now() - t;
  console.log('P1B_PERF ' + JSON.stringify({label: 'RDKit canonicalise 10000 SMILES', distinctInput: pool.length, valid, ms: Math.round(ms), msPerCall: Number((ms / 10000).toFixed(4))}));
  expect(valid).toBe(10000);
}, 300000);
