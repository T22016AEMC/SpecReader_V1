import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

// v1.4.2 stop 34 (D): the Telex Regular font inside RDKit_minimal.wasm is under the SIL Open Font License 1.1; its full text goes into the DEPLOYED /THIRD_PARTY_NOTICES.txt
// (scripts/prepare-assets.mjs assembles docs/licenses/). The text is the one of RDKit's Data/Fonts/telex_font_license.txt at the commit of @rdkit/rdkit 2026.9.1, copied unchanged.
const ROOT = path.resolve(__dirname, '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8').replace(/\r\n/g, '\n');

describe('Telex Regular font: OFL 1.1 in the deployed notices', () => {
  const t = read('docs', 'licenses', 'Telex-Regular-OFL-1.1.txt');
  it('names the source (RDKit commit of the npm package) and carries the copyright line and the whole OFL 1.1', () => {
    expect(t).toContain('https://github.com/rdkit/rdkit/blob/fece8caa860bdf6c9c82bdb9253f22a0cf87150c/Data/Fonts/telex_font_license.txt');
    expect(t).toContain('Copyright 2011 The Telex Project Authors (info@andrestorresi.com.ar), with Reserved Font Name Telex.');
    expect(t).toContain('SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007');
    // every section of the license, in order, up to the last words of the disclaimer
    const sections = ['PREAMBLE', 'DEFINITIONS', 'PERMISSION & CONDITIONS', '1) Neither the Font Software', '2) Original or Modified Versions', '3) No Modified Version', '4) The name(s) of the Copyright Holder(s)', '5) The Font Software, modified or unmodified', 'TERMINATION', 'DISCLAIMER', 'OTHER DEALINGS IN THE FONT SOFTWARE.'];
    let at = -1;
    for (const s of sections) { const i = t.indexOf(s, at + 1); expect(i, s).toBeGreaterThan(at); at = i; }
  });
  it('the package version in the header is the installed @rdkit/rdkit', () => {
    const v = JSON.parse(read('node_modules', '@rdkit', 'rdkit', 'package.json')).version;
    expect(t).toContain(`@rdkit/rdkit ${v}`);
  });
  it('prepare-assets.mjs puts it into /THIRD_PARTY_NOTICES.txt right after the RDKit notice', () => {
    const script = read('scripts', 'prepare-assets.mjs');
    expect(script).toContain("['RDKit.txt','Telex-Regular-OFL-1.1.txt',");
  });
});
