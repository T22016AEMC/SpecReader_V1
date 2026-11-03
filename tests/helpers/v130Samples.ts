import {measureSample} from './v123Samples';
import type {SampleMeasure} from './v123Samples';

// v1.3.0 synthetic samples (tests/fixtures/v130, all hand-written, CDCl3 400 MHz declared; IR bands as %T of a peak table, a weak band has a high y) plus the v1.2.3 p-cresol / BPA / PMA samples reused as they are.
// `typed` = the molecular formula is typed in (extraInput.molecularFormula), the other rows use the no-formula route. Step budget only, dense IR baseline.
export interface V130Case {sample: string; typed: boolean; note: string}
export const V130_CASES: V130Case[] = [
  {sample: 'v130/CR1', typed: false, note: 'p-cresol type, user peak positions, manual broad 3335, no C=O band (1873 and 1618 only)'},
  {sample: 'v130/CR0', typed: false, note: 'same without the 3335 mark'},
  {sample: 'v130/NITROX', typed: false, note: 'control: ring bands 1518 / 1357 / 1299 in the nitro windows'},
  {sample: 'v130/EST1', typed: false, note: 'ethyl benzoate (conjugated ester 1720)'},
  {sample: 'v130/AMD1', typed: false, note: 'acetanilide (amide I 1665, II 1550, N–H 3300)'},
  {sample: 'v130/HCA', typed: true, note: '3-phenylpropanoic acid (broad O–H, C=O 1700), formula typed'},
  {sample: 'v130/ALK1', typed: true, note: '1-octene with C=C 1641, formula typed'},
  {sample: 'v130/ALK0', typed: true, note: '1-octene 1H, IR without any C=C band, formula typed'},
  {sample: 'M1', typed: false, note: 'PMA type (strong 1740), v1.2.3 sample'},
  {sample: 'P1', typed: false, note: 'p-cresol, v1.2.3 sample (broad 3338)'},
  {sample: 'P2', typed: false, note: 'p-cresol, v1.2.3 sample'},
  {sample: 'P3', typed: false, note: 'p-cresol, v1.2.3 sample'},
  {sample: 'P4', typed: false, note: 'p-cresol, v1.2.3 sample'},
  {sample: 'B1', typed: false, note: 'bisphenol A type, v1.2.3 sample'},
];
export interface V130Measure extends SampleMeasure {typed: boolean; sample: string}
export async function measureV130(c: V130Case): Promise<V130Measure> {
  const m = await measureSample(c.sample, 'dense', {});
  if (!c.typed) return {...m, typed: false, sample: c.sample};
  const f = (await import('./v123Samples')).loadV123(c.sample);
  const typed = await measureSample(c.sample, 'dense', {extraInput: {molecularFormula: f.formula}});
  return {...typed, typed: true, sample: c.sample};
}
