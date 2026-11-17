import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it} from 'vitest';
import {NMRSHIFTDB2_LICENSE_URL, NMRSHIFTDB2_NOTICE, Nmrshiftdb2Notice, SiteFooter} from '../../src/ui/Nmrshiftdb2Notice';

// v1.4.2 stop 34 (C): the nmrshiftdb2 attribution is shown in the site footer and with the 1H prediction result (Mode B, 1H NMR), with the same sentence as
// scripts/nmrshiftdb2/extract_h1.py (header) and tests/fixtures/v140/nmrshiftdb2/extraction_stats.json (notice).
const root = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

describe('nmrshiftdb2 notice', () => {
  it('is the sentence of extract_h1.py and of extraction_stats.json, word for word', () => {
    expect(read('scripts/nmrshiftdb2/extract_h1.py').split('\n').slice(0, 8)).toContain(NMRSHIFTDB2_NOTICE);
    expect(JSON.parse(read('tests/fixtures/v140/nmrshiftdb2/extraction_stats.json')).notice).toBe(NMRSHIFTDB2_NOTICE);
    expect(read('scripts/nmrshiftdb2/extract_h1.py')).toContain(NMRSHIFTDB2_LICENSE_URL);
  });

  it('the footer prints the sentence and links the license', () => {
    const html = renderToStaticMarkup(React.createElement(SiteFooter));
    expect(html).toContain('<footer');
    expect(html).toContain('data-testid="site-footer"');
    expect(text(html)).toContain(NMRSHIFTDB2_NOTICE);
    expect(html).toContain(`href="${NMRSHIFTDB2_LICENSE_URL}"`);
  });

  it('the notice component prints the sentence under its test id', () => {
    const html = renderToStaticMarkup(React.createElement(Nmrshiftdb2Notice, {testId: 'h1-nmrshiftdb2-notice'}));
    expect(html).toContain('data-testid="h1-nmrshiftdb2-notice"');
    expect(text(html)).toContain(NMRSHIFTDB2_NOTICE);
  });

  it('App renders the footer after <main>; the Mode B page renders the notice only for the 1H NMR modality', () => {
    const app = read('src/App.tsx');
    expect(app).toMatch(/import \{ SiteFooter \} from "\.\/ui\/Nmrshiftdb2Notice";/);
    const main = app.indexOf('</main>'), footer = app.indexOf('<SiteFooter />');
    expect(main).toBeGreaterThan(0);
    expect(footer).toBeGreaterThan(main);
    expect(app.split('<SiteFooter />').length).toBe(2);
    const modeB = read('src/components/StructureSpectrumValidationPage.tsx');
    expect(modeB).toContain('{activeModality === "1H_NMR" && <Nmrshiftdb2Notice testId="h1-nmrshiftdb2-notice" />}');
  });
});
