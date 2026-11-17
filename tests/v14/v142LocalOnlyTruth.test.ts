import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadStop7} from '../helpers/v140Truth';
// v1.4.2 stop 36 (F): the stop-7 spectra (Fulmer 2010 Table S7) are local-only; empty lists without the file (the tests that read them skip)
const {STOP7_RECORDS, STOP7_SPECTRA} = await loadStop7();
import {hasLocalOnly, LOCAL_ONLY, loadTier1, loadTier1Full, loadTier2, localOnlyNote} from '../helpers/v140Truth';

// v1.4.2 stop 35 (B, C): the Fulmer 2010 tables are replaced by derived files (only what the tests read, own arrangement, source on every record); the original transcriptions
// and the grade-A entries of tier 2 (user-looked-up SDBS / ChemicalBook / RSC SI values) are local-only (tests/fixtures/local-only/, git-ignored).
// With the local files present, the loaders give exactly what the old files gave; without them (the public repository) these comparisons are skipped with a note.
const ROOT = path.resolve(__dirname, '..', '..');
const FULMER_DOI = '10.1021/om100106e';
const note = (k: Parameters<typeof hasLocalOnly>[0], what: string) => { if (!hasLocalOnly(k)) console.info(localOnlyNote(k, what)); return !hasLocalOnly(k); };

// v1.4.2 stop 36 (F): the two derived Fulmer files are local-only too; their checks skip without them
describe('derived files', () => {
  it.skipIf(note('tier1Derived', 'the check of the tier-1 derived file'))('tier 1: every shift record names its source (authors, journal, year, DOI); no multiplicity, row number or range end is kept', () => {
    const raw = JSON.parse(fs.readFileSync(LOCAL_ONLY.tier1Derived, 'utf8'));
    expect(raw.shifts.length).toBe(677);
    for (const s of raw.shifts) {
      expect(s.source).toContain('Fulmer GR');
      expect(s.source).toContain('Organometallics 2010');
      expect(s.source).toContain(FULMER_DOI);
      expect(typeof s.ppm).toBe('number');
    }
    expect(raw.sources.fulmer2010).toMatchObject({journal: 'Organometallics', year: 2010, doi: FULMER_DOI});
    const text = JSON.stringify(raw.compounds);
    for (const k of ['multiplicityS1', 's1Row', 'crossCheckNote', 'usable', '"range"', '"mid"']) expect(text, k).not.toContain(k);
  });
  it.skipIf(note('stop7Derived', 'the check of the stop-7 derived module'))('stop-7 spectra: 31 records, each with its source; the tuple the tests read is built from the records', () => {
    expect(STOP7_RECORDS.length).toBe(31);
    for (const r of STOP7_RECORDS) expect(r.source).toMatchObject({authors: expect.stringContaining('Fulmer GR'), journal: 'Organometallics', year: 2010, doi: FULMER_DOI});
    expect(STOP7_SPECTRA.length).toBe(31);
    expect(STOP7_SPECTRA[0]).toEqual(['ethyl acetate', 'CC(=O)OCC', 'C4H8O2', [{x: 4.12, integration: 2, multiplicity: 'q'}, {x: 2.05, integration: 3, multiplicity: 's'}, {x: 1.26, integration: 3, multiplicity: 't'}]]);
  });
  it('the public tier-2 file holds no grade-A entry and no SDBS / ChemicalBook source label on a compound; the local-only folder is git-ignored', () => {
    const t2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/v140/h1Truth2.json'), 'utf8')) as {compounds: {grade?: string; source?: string}[]};
    expect(t2.compounds.filter(c => c.grade === 'A')).toEqual([]);
    expect(t2.compounds.filter(c => /SDBS|ChemicalBook|SpectraBase/i.test(c.source ?? ''))).toEqual([]);
    expect(fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8').split(/\r?\n/)).toContain('tests/fixtures/local-only/');
    // v1.4.2 stop 36 (F): the derived Fulmer files are not in the public fixtures any more
    for (const f of ['tests/fixtures/v140/fulmer2010H1.derived.json', 'tests/fixtures/v140/fulmer2010Stop7.derived.ts']) expect(fs.existsSync(path.join(ROOT, f)), f).toBe(false);
  });
});

describe('with the local-only originals: the loaders give what the old files gave', () => {
  it.skipIf(note('tier1Full', 'the tier-1 comparison with the original transcription'))('tier 1: same compounds, signals (the 3 unusable ones left out), values (the midpoint of a range) and order', () => {
    const full = loadTier1Full(), d = loadTier1();
    expect(d.compounds.map(c => [c.name, c.smiles])).toEqual(full.compounds.map(c => [c.name, c.smiles]));
    full.compounds.forEach((c, i) => {
      const old = c.signals.filter(s => s.usable !== false);
      expect(d.compounds[i].signals.map(s => [s.label, s.smarts, s.nH, Boolean(s.exchangeable), s.note ?? null])).toEqual(old.map(s => [s.label, s.smarts, s.nH, Boolean(s.exchangeable), s.note ?? null]));
      old.forEach((s, j) => {
        const want = Object.entries(s.values ?? {}).map(([k, v]) => [k, typeof v === 'number' ? v : v.mid]);
        expect(Object.entries(d.compounds[i].signals[j].values ?? {}), `${c.name} ${s.label}`).toEqual(want);
      });
    });
  });
  it.skipIf(note('stop7Full', 'the stop-7 comparison with the original module'))('stop-7 spectra: the same 31 [name, SMILES, formula, peaks] as the original module', async () => {
    const mod = await import(/* @vite-ignore */ LOCAL_ONLY.stop7Full) as {STOP7_SPECTRA: [string, string, string, unknown[], string][]};
    expect(STOP7_SPECTRA).toEqual(mod.STOP7_SPECTRA.map(([n, s, f, p]) => [n, s, f, p]));
  });
  it.skipIf(note('tier2GradeA', 'the tier-2 comparison with the original file'))('tier 2: the public file plus the local grade-A entries is the original file, compound for compound, in order', () => {
    const original = JSON.parse(fs.readFileSync(path.join(path.dirname(LOCAL_ONLY.tier2GradeA), 'h1Truth2.full.json'), 'utf8')) as {compounds: unknown[]};
    expect(loadTier2('all').compounds).toEqual(original.compounds);
  });
});
