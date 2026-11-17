import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {AMBIT_HNMR_KNOWLEDGE_BASE_TEXT, AMBIT_HNMR_SOURCE} from '../../src/engines/scientificEngines/ambitHnmrKnowledgeBase';

// v1.4.0 stop 2, task 2: the Ambit-HNMR knowledge base (CC-BY-4.0) is third-party data. The file in third_party/ is the Zenodo file byte for byte (MD5 from the Zenodo record); the embedded copy is the same text.
const FILE = path.resolve(__dirname, '..', '..', 'third_party', 'ambit-hnmr', 'hnmr-knowledgebase.txt');
describe('Ambit-HNMR knowledge base', () => {
  it('the file in third_party/ is the Zenodo file (MD5 of record 4629851, 11.9 kB)', () => {
    const buf = fs.readFileSync(FILE);
    expect(createHash('md5').update(buf).digest('hex')).toBe(AMBIT_HNMR_SOURCE.md5);
    expect(buf.length).toBe(11943);
  });
  it('the embedded copy is the same text (BOM removed, LF)', () => {
    expect(AMBIT_HNMR_KNOWLEDGE_BASE_TEXT).toBe(fs.readFileSync(FILE, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n'));
  });
  it('the attribution is in place: license, DOI and the author names (no affiliation, stop 22) in THIRD_PARTY_NOTICES.md and the README', () => {
    for (const p of [path.resolve(__dirname, '..', '..', 'THIRD_PARTY_NOTICES.md'), path.resolve(__dirname, '..', '..', 'third_party', 'ambit-hnmr', 'README.md')]) {
      const t = fs.readFileSync(p, 'utf8');
      for (const s of ['Ambit-HNMR', '10.5281/zenodo.4629851', 'CC-BY', 'Kochev', 'Tsoneva', 'Frenkeva', 'Jeliazkova']) expect(t, `${path.basename(p)} ${s}`).toContain(s);
      expect(t, `${path.basename(p)}: the authors' affiliation is not named (stop 22)`).not.toContain('Plovdiv');
    }
    expect(AMBIT_HNMR_SOURCE.license).toBe('CC-BY-4.0');
  });
});
