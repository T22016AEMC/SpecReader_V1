import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {packageOfModuleId} from '../../scripts/bundled-packages-plugin.mjs';
import {appendNotices, collectNotices, GENERATED_MARK, renderNotices} from '../../scripts/append-npm-notices.mjs';

// v1.4.1 stop 21 (B): the npm part of the deployed THIRD_PARTY_NOTICES.txt is generated from the packages that the build really bundled (module ids of the output chunks), with the license text copied from each package.
// These tests use a small fake node_modules in a temp folder; nothing is taken from the real packages and nothing is invented for a package without a license file.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notices-'));
const mkpkg = (name: string, pkg: object, files: Record<string, string> = {}) => {
  const root = path.join(tmp, 'node_modules', '.pnpm', `${name.replace('/', '+')}@1.0.0`, 'node_modules', name);
  fs.mkdirSync(root, {recursive: true}); fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({name, version: '1.0.0', ...pkg}));
  for (const [f, t] of Object.entries(files)) fs.writeFileSync(path.join(root, f), t);
  return root.split(path.sep).join("/");
};

describe('which package owns a bundled module', () => {
  it('pnpm layout, scoped packages, query strings, virtual helpers; project source and tests own nothing', () => {
    expect(packageOfModuleId('/p/node_modules/.pnpm/react@19.3.0/node_modules/react/index.js')).toEqual({name: 'react', root: '/p/node_modules/.pnpm/react@19.3.0/node_modules/react'});
    expect(packageOfModuleId(["C:","p","node_modules",".pnpm","@rdkit+rdkit@1","node_modules","@rdkit","rdkit","dist","x.js?import"].join("\\"))?.name).toBe("@rdkit/rdkit");
    expect(packageOfModuleId('/p/node_modules/lucide-react/dist/esm/icons/a.js')?.name).toBe('lucide-react');
    expect(packageOfModuleId('\0vite/preload-helper.js')).toMatchObject({name: 'vite'});
    expect(packageOfModuleId('\0rolldown/runtime.js')).toMatchObject({name: 'rolldown'});
    expect(packageOfModuleId('/p/src/engines/chemistryEngine.ts')).toBeNull();
    expect(packageOfModuleId('/p/tests/fixtures/x.json')).toBeNull();
  });
});

describe('the generated license list', () => {
  const withText = mkpkg('has-license', {license: 'MIT', author: {name: 'A. Author'}}, {LICENSE: 'MIT License\n\nCopyright (c) 2020 A. Author\n\nPermission is hereby granted ...'});
  const without = mkpkg('no-license-file', {license: 'ISC'});
  const manifest = path.join(tmp, 'manifest.json');
  fs.writeFileSync(manifest, JSON.stringify({packages: {[withText]: {name: 'has-license', root: withText, chunks: ['a.js'], files: 1}, [without]: {name: 'no-license-file', root: without, chunks: ['b.js'], files: 1}}}));
  it('copies name, version, license, copyright lines and the full text from the package; a package without a license file is listed as MISSING and no text is made up', () => {
    const rows = collectNotices(manifest, tmp);
    const a = rows.find((r: {name: string}) => r.name === 'has-license')!, b = rows.find((r: {name: string}) => r.name === 'no-license-file')!;
    expect(a.version).toBe('1.0.0'); expect(a.license).toBe('MIT'); expect(a.copyright).toEqual(['Copyright (c) 2020 A. Author']); expect((a.files[0] as {text: string}).text).toContain('Permission is hereby granted ...'); expect(a.missing).toEqual([]);
    expect(b.files).toEqual([]); expect(b.missing.join(' ')).toContain('no license file'); expect(b.copyright).toEqual([]);
    const text = renderNotices(rows);
    expect(text).toContain('MISSING'); expect(text).toContain('no-license-file 1.0.0'); expect(text).toContain('Copyright (c) 2020 A. Author');
    expect(text.split('no-license-file')[2] ?? '').not.toMatch(/Permission is hereby granted/);   // nothing from another package under the missing one
  });
  // v1.4.2 stop 34: the stop-22 search note for median-quickselect was removed from scripts/append-npm-notices.mjs (the package was replaced by vendor/median-select in stop 33).
  // The test that pinned the note now pins its absence: a package without a license file is MISSING, with no search note and no made-up text, whatever its name.
  it('stop 34: no package carries a search note any more (median-quickselect included); a package without a license file stays MISSING and no text is made up', () => {
    const mq = mkpkg('median-quickselect', {license: 'ISC', author: 'https://github.com/mad-gooze'});
    const m2 = path.join(tmp, 'manifest-mq.json');
    fs.writeFileSync(m2, JSON.stringify({packages: {[mq]: {name: 'median-quickselect', root: mq, chunks: ['a.js'], files: 1}, [without]: {name: 'no-license-file', root: without, chunks: ['b.js'], files: 1}}}));
    const rows = collectNotices(m2, tmp) as {name: string; missing: string[]; searched?: string; files: unknown[]}[];
    const a = rows.find(r => r.name === 'median-quickselect')!, b = rows.find(r => r.name === 'no-license-file')!;
    expect(a.missing.join(' ')).toContain('no license file'); expect(a.files).toEqual([]);
    expect(a.searched).toBeUndefined(); expect(b.searched).toBeUndefined();
    const text = renderNotices(rows as never);
    expect(text).not.toContain('Search for a license text:'); expect(text).not.toContain('registry.npmjs.org/median-quickselect');
    expect(text).not.toContain('Permission to use, copy, modify');   // no ISC text was written for the package that has none
    expect(fs.readFileSync(path.resolve(__dirname, '../../scripts/append-npm-notices.mjs'), 'utf8')).not.toMatch(/'median-quickselect'\s*:/);
  });
  it('is appended after the hand-written notices, and a second run replaces the generated part instead of adding another', () => {
    const f = path.join(tmp, 'THIRD_PARTY_NOTICES.txt'); fs.writeFileSync(f, 'RDKit notice\n\n---\n\nAmbit notice\n');
    appendNotices(f, manifest, tmp); appendNotices(f, manifest, tmp);
    const t = fs.readFileSync(f, 'utf8');
    expect(t.startsWith('RDKit notice\n\n---\n\nAmbit notice')).toBe(true);
    expect(t.split(GENERATED_MARK)).toHaveLength(2); expect(t.match(/has-license 1\.0\.0\n-{10,}/g)).toHaveLength(1);
  });
});
