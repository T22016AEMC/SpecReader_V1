import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {AMBIT_HNMR_SOURCE} from '../../src/engines/scientificEngines/ambitHnmrKnowledgeBase';

// v1.4.1 stop 20 (C): the Ambit-HNMR attribution (CC-BY-4.0) goes into the DEPLOYED /THIRD_PARTY_NOTICES.txt, which scripts/prepare-assets.mjs assembles from docs/licenses/. The text is taken from the files
// of the repository (third_party/ambit-hnmr/README.md and THIRD_PARTY_NOTICES.md), not written separately.
const ROOT = path.resolve(__dirname, '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
describe('deployed third-party notices', () => {
  it('prepare-assets.mjs assembles the Ambit-HNMR notice together with RDKit, jcampconverter and SheetJS', () => {
    const script = read('scripts', 'prepare-assets.mjs');
    for (const f of ['RDKit.txt', 'jcampconverter-9.6.4.txt', 'SheetJS-0.20.3.txt', 'Ambit-HNMR-1.2.txt', 'Data-Sources.txt']) {
      expect(script, f).toContain(`'${f}'`);
      expect(fs.existsSync(path.join(ROOT, 'docs', 'licenses', f)), f).toBe(true);
    }
  });
  it('the Ambit-HNMR notice carries source, authors, DOI, license, retrieval, the file identity and the statement of changes', () => {
    const t = read('docs', 'licenses', 'Ambit-HNMR-1.2.txt');
    for (const s of ['Ambit-HNMR', 'Kochev', 'Tsoneva', 'Frenkeva', 'Jeliazkova', 'https://creativecommons.org/licenses/by/4.0/', AMBIT_HNMR_SOURCE.url, `https://doi.org/${AMBIT_HNMR_SOURCE.doi}`, 'CC-BY-4.0', 'Creative Commons Attribution 4.0 International',
      AMBIT_HNMR_SOURCE.md5, 'Changes made by SpecReader', 'not edited', 'SMARTS', 'substituent name']) expect(t, s).toContain(s);
  });
  it('the credit line is the one of the repository README (same words)', () => {
    const readme = read('third_party', 'ambit-hnmr', 'README.md'), notice = read('docs', 'licenses', 'Ambit-HNMR-1.2.txt');
    const credit = readme.match(/Attribution text[^:]*: "([^"]+?) The file is used as data without changes;/)?.[1];
    expect(credit).toBeTruthy();
    // stop 21 (B): the deployed credit names the authors only and carries the CC-BY-4.0 license link; stop 22: the README credit names the authors only as well (no affiliation anywhere)
    expect(credit).not.toContain('Plovdiv');
    const creditAuthorsOnly = credit!.slice(0, -1);
    expect(notice).toContain(creditAuthorsOnly);
    expect(notice).not.toContain('Plovdiv');
    expect(read('THIRD_PARTY_NOTICES.md')).not.toContain('Plovdiv');
  });
});
