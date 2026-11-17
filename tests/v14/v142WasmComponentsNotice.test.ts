import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

// v1.4.2 stop 35 (E): the components inside the RDKit WebAssembly build go into the deployed /THIRD_PARTY_NOTICES.txt (docs/licenses/RDKit-WASM-components.txt, after RDKit and Telex).
// FreeType under the FreeType License with the FTL credit sentence; zlib 1.3.2 (statically linked); Emscripten "version not confirmed"; libc++ / compiler-rt / musl "possibly linked";
// every license text unchanged, each with the address it was read from (notes/v1.4.2/THIRD_PARTY_NOTICES_DRAFT.md section 2, STOP35_REPORT.md E).
const ROOT = path.resolve(__dirname, '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8').replace(/\r\n/g, '\n');
const t = read('docs', 'licenses', 'RDKit-WASM-components.txt');
// A section runs from its title to the next component title (the license texts themselves contain lines of '=').
const TITLES = ['InChI 1.07.3', 'coordgenlibs 3.0.2', 'RingDecomposerLib 1.1.3_rdkit', 'FreeType 2.13.3', 'zlib 1.3.2', 'Boost 1.87.0', 'Emscripten runtime', 'LLVM libc++abi', 'musl libc'].map(x => '\n' + x);
const section = (title: string) => { const i = t.indexOf(title); expect(i, title).toBeGreaterThan(0); const ends = TITLES.map(x => t.indexOf(x, i + 1)).filter(j => j > i); return t.slice(i, ends.length ? Math.min(...ends) : undefined); };

describe('RDKit WASM components notice', () => {
  it('prepare-assets.mjs puts it into /THIRD_PARTY_NOTICES.txt after the RDKit and Telex notices', () => {
    expect(read('scripts', 'prepare-assets.mjs')).toContain("['RDKit.txt','Telex-Regular-OFL-1.1.txt','RDKit-WASM-components.txt',");
  });
  it('FreeType: the FreeType License is the one chosen; the FTL credit sentence with the years of 2.13.3; the source of the sentence', () => {
    const s = section('FreeType 2.13.3 (confirmed) - used under the FreeType License (FTL)');
    expect(s).toContain('uses\nFreeType under the FreeType License (FTL)');
    expect(s).toContain('    Portions of this software are copyright © 1996-2024 The FreeType\n    Project (www.freetype.org).  All rights reserved.');
    expect(s).toContain('https://github.com/freetype/freetype/blob/VER-2-13-3/docs/FTL.TXT');
    // the FTL itself, unchanged, with its own wording of the sentence
    expect(s).toContain('Portions of this software are copyright © <year> The FreeType');
    expect(s).toContain('Please replace <year> with the value from the FreeType version you');
  });
  it('zlib 1.3.2 is in the deployed notice with its license text', () => {
    const s = section('zlib 1.3.2 (confirmed, statically linked) - zlib License');
    expect(s).toContain('(C) 1995-2026 Jean-loup Gailly and Mark Adler');
    expect(s).toContain('https://github.com/madler/zlib/blob/v1.3.2/LICENSE');
  });
  it('Emscripten: "version not confirmed", MIT / NCSA text', () => {
    const s = section('Emscripten runtime and JavaScript loader (version not confirmed)');
    expect(s).toContain('Emscripten is available under 2 licenses, the MIT license and the\nUniversity of Illinois/NCSA Open Source License.');
    expect(s).toContain('Copyright (c) 2010-2014 Emscripten authors, see AUTHORS file.');
  });
  it('libc++ / compiler-rt and musl are "possibly linked", each with its license text', () => {
    const llvm = section('LLVM libc++abi (present), libc++ and compiler-rt (possibly linked)');
    for (const lib of ['The libc++abi library is dual licensed', 'The libc++ library is dual licensed', 'The compiler_rt library is dual licensed']) expect(llvm, lib).toContain(lib);
    expect(llvm).toContain('Apache License v2.0 with LLVM Exceptions');
    const musl = section('musl libc, as shipped with Emscripten (possibly linked) - MIT License');
    expect(musl).toContain('Copyright © 2005-2020 Rich Felker, et al.');
  });
  it('InChI, coordgenlibs, RingDecomposerLib and Boost carry their copyright lines', () => {
    for (const s of ['Copyright (c) 2024 InChI Project', 'Copyright (c) 2017, Schrödinger, Inc.', 'University of Hamburg, ZBH - Center for Bioinformatics', 'Boost Software License - Version 1.0']) expect(t, s).toContain(s);
  });
});
