import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {executeSixStepAnalysis} from '../../src/engines/reasoning/sixStepAnalysis';
import {canonNoStereo, fixtureSpectra, SHAPE_BUDGET} from './v121Golden';
import {loadV123} from './v123Samples';

// v1.3.2 synthetic samples for the strong-C=O threshold (all hand-written, CDCl3 400 MHz declared, dense IR baseline, step budget only). No real spectrum.
// The 33 samples of v1.2.1 - v1.3.1 plus eight made for v1.3.2: M1 (PMA type) with its carbonyl mark shallower (v132/M1y575 .. M1y80: carbonyl band 0.49 / 0.44 / 0.35 / 0.22 of the strongest),
// two p-xylenes with weak aromatic overtone marks at 1800 and 1720 (0.10 / 0.18 of the strongest; the second also has a 1640 water-bend mark) and two cyclohexenes (C=C 1650 at 0.35 / 0.46).
export interface V132Case {sample: string; typed: boolean}
const S = (sample: string, typed = false): V132Case => ({sample, typed});
export const V132_CASES: V132Case[] = [
  S('M1'), S('M1b'), S('M4'), S('M5'), S('M5b'), S('M6'), S('M7'), S('Q1'), S('Q2'), S('Q3'), S('P1'), S('P2'), S('P3'), S('P4'), S('B1'),
  S('v121/S1'), S('v121/S2'), S('v121/S3'), S('v121/G1'), S('v121/G3'), S('v121/E1'), S('v121/D1'),
  S('v130/ALK0'), S('v130/ALK1'), S('v130/AMD1'), S('v130/CR0'), S('v130/CR1'), S('v130/EST1'), S('v130/NITROX'), S('v130/HCA', true),
  S('v131/ASY1'), S('v131/CR2'), S('v131/ETH1'),
  S('v132/M1y575'), S('v132/M1y625'), S('v132/M1y70'), S('v132/M1y80'), S('v132/XYL_weak'), S('v132/XYL_mod'), S('v132/CYHEX_A'), S('v132/CYHEX_B'),
  // stop 4: the two 1-octene samples with the formula typed in (C8H16): the terminal-vinyl 910 / 990 pair acts on the candidate ranking here
  S('v130/ALK1', true), S('v130/ALK0', true),
];
export interface V132Measure {sample: string; typed: boolean; floor: number | null; strongCarbonyl: boolean | null; targetRank: number | null; ranked: number; top: {smiles: string; score: number | null}[]}
export async function measureV132(c: V132Case, top = 6): Promise<V132Measure> {
  const f = loadV123(c.sample);
  const r = await executeSixStepAnalysis({spectra: fixtureSpectra(f, {denseBaseline: true}), extraInput: c.typed ? {molecularFormula: f.formula} : {}}, SHAPE_BUDGET);
  const tc = canonNoStereo(f.targetSmiles), ranked = r.rankedCandidates;
  const i = ranked.findIndex(x => canonNoStereo(x.smiles) === tc);
  const of = (r.compositionInference as unknown as {v121?: {oxygenFloor: {floor: number; strongCarbonyl: boolean} | null}} | undefined)?.v121?.oxygenFloor;
  return {sample: c.sample, typed: c.typed, floor: of?.floor ?? null, strongCarbonyl: of?.strongCarbonyl ?? null, targetRank: i < 0 ? null : i + 1, ranked: ranked.length,
    top: ranked.slice(0, top).map(x => ({smiles: x.smiles, score: x.finalScore ?? null}))};
}

/** The numbers recorded on the unchanged v1.3.1 engine (tests/goldens/v132.baseline.json). */
export const loadV132Baseline = (): V132Measure[] => JSON.parse(fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'goldens', 'v132.baseline.json'), 'utf8')).samples;
