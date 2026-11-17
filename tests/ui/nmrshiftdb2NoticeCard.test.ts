import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it} from 'vitest';
import {cardShowsH1Prediction, conclusionBullets} from '../../src/ui/conclusion';
import {CompactCandidateRow, ConclusionCard, type CandidateView} from '../../src/ui/ConclusionCard';
import type {TraceEvidenceLike} from '../../src/ui/evidenceMerge';
import {NMRSHIFTDB2_LICENSE_URL, NMRSHIFTDB2_NOTICE} from '../../src/ui/Nmrshiftdb2Notice';

// v1.4.2 stop 35 (D): a Mode A candidate card that shows a 1H prediction result (a 1H spectrum line or a 1H ledger entry) also shows the nmrshiftdb2 notice.
// The footer and the Mode B 1H block are pinned by tests/ui/nmrshiftdb2Notice.test.ts and are not touched.
const root = path.resolve(__dirname, '../..');
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const ev = (modality: string, status: TraceEvidenceLike['status'], id: string): TraceEvidenceLike => ({modality, status, observationIds: [id]});
const H1 = [ev('1H_NMR', 'SUPPORT', '1H_NMR:f:7.1'), ev('1H_NMR', 'UNKNOWN', '1H_NMR:f:1.2')];
const IR = [ev('IR', 'SUPPORT', 'IR:f:1715'), ev('IR', 'CONTRADICTION', 'IR:f:560')];
const view = (evidence: TraceEvidenceLike[], ledger: string[] = []): CandidateView => ({
  id: 'c1', rank: 1, name: 'x', formula: 'C2H6O', scoreText: '50/100', bullets: conclusionBullets({evidence, userFormula: null, candidateFormula: 'C2H6O'}), sourceLine: '來源：x',
  selected: false, onSelect: () => {}, onSendToModeB: () => {}, structure: () => null, reasoning: () => null, evidence: () => null, showsH1: cardShowsH1Prediction(evidence, ledger),
});

describe('nmrshiftdb2 notice on the Mode A candidate cards', () => {
  it('cardShowsH1Prediction: a 1H spectrum line or a 1H ledger entry, nothing else', () => {
    expect(cardShowsH1Prediction(H1)).toBe(true);
    expect(cardShowsH1Prediction([...IR, ...H1])).toBe(true);
    expect(cardShowsH1Prediction(IR)).toBe(false);
    expect(cardShowsH1Prediction([])).toBe(false);
    expect(cardShowsH1Prediction(IR, ['IR', '1H_NMR'])).toBe(true);
    expect(cardShowsH1Prediction([], ['IR', '13C_NMR', undefined])).toBe(false);
  });

  it('the top card prints the sentence and the license link when it shows a 1H line, and not otherwise', () => {
    const v = view([...IR, ...H1]);
    expect(v.bullets[0]).toMatch(/^¹H：/);
    const html = renderToStaticMarkup(React.createElement(ConclusionCard, {c: v}));
    expect(html).toContain('data-testid="card-nmrshiftdb2-notice"');
    expect(text(html)).toContain(NMRSHIFTDB2_NOTICE);
    expect(html).toContain(`href="${NMRSHIFTDB2_LICENSE_URL}"`);
    const irOnly = renderToStaticMarkup(React.createElement(ConclusionCard, {c: view(IR)}));
    expect(irOnly).not.toContain('card-nmrshiftdb2-notice');
    expect(text(irOnly)).not.toContain(NMRSHIFTDB2_NOTICE);
  });

  it('the compact row shows it where its 1H line is (inside the opened row; closed rows show no 1H line)', () => {
    const src = fs.readFileSync(path.join(root, 'src/ui/ConclusionCard.tsx'), 'utf8').replace(/\r\n/g, '\n');
    const compact = src.slice(src.indexOf('export function CompactCandidateRow'));
    const bulletsAt = compact.indexOf('{c.bullets.map('), noticeAt = compact.indexOf('{c.showsH1 && <Nmrshiftdb2Notice testId="card-nmrshiftdb2-notice"');
    expect(bulletsAt).toBeGreaterThan(0);
    expect(noticeAt).toBeGreaterThan(bulletsAt);
    expect(compact.slice(0, noticeAt)).toContain('{open && (');
    const closed = renderToStaticMarkup(React.createElement(CompactCandidateRow, {c: view(H1)}));
    expect(closed).not.toContain('¹H：');
  });

  it('App passes showsH1 from the candidate\'s trace evidence and its 1H ledger entries', () => {
    const app = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8');
    expect(app).toContain('showsH1: cardShowsH1Prediction(record?.evidence ?? [], (cand.scientificScoreLedger?.entries ?? []).filter((e) => e.compatibility !== null).map((e) => e.sourceModality)),');
  });
});
