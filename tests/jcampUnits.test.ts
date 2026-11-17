import {describe, expect, it} from 'vitest';
import {SpectrumParser} from '../src/engines/spectrumParser';
import {decodeJcamp} from '../src/engines/scientificEngines/jcampAdapter';
import {resolveIRScale} from '../src/engines/scientificEngines/irSignalProcessing';

// v1.4.2 stop 29 (B): JCAMP x-axis unit conversion (MICROMETERS: 10000 / x, NANOMETERS: 1e7 / x); 1/CM and every other unit stay as they were.
// The test files are SYNTHETIC: they copy only the FORMAT of the Coblentz digitised files NIST serves (a ##DELTAX / ##FIRSTX / ##LASTX header, XYDATA=(X++(Y..Y)) with five Y per line, XUNITS=MICROMETERS, YUNITS=TRANSMITTANCE, fractions
// 0-1) with made-up bands, so that no NIST spectrum is stored in the repository (the data are copyrighted; see notes/v1.4.2/IR_PANEL_REPORT.md section 0).
const BANDS: [number, number, number][] = [[2230, 0.55, 12], [1600, 0.35, 14], [1495, 0.30, 12], [760, 0.45, 12]]; // [cm-1, depth, sigma in cm-1]: a nitrile, two ring bands, a ring OOP band
const trans = (wn: number) => 0.985 - BANDS.reduce((s, [c, d, w]) => s + d * Math.exp(-0.5 * ((wn - c) / w) ** 2), 0);
/** A Coblentz-style file on a uniform x grid in `unit` (x = FIRSTX + i * DELTAX); wavenumber of x: micrometers 1e4 / x, nanometers 1e7 / x, otherwise x itself. */
function jdx(unit: 'MICROMETERS' | 'NANOMETERS' | '1/CM', first: number, delta: number, n: number, y: 'TRANSMITTANCE' | 'ABSORBANCE' = 'TRANSMITTANCE', title = 'SYNTHETIC'): string {
  const wn = (x: number) => unit === 'MICROMETERS' ? 1e4 / x : unit === 'NANOMETERS' ? 1e7 / x : x;
  const xs = Array.from({length: n}, (_, i) => first + i * delta), ys = xs.map(x => y === 'TRANSMITTANCE' ? trans(wn(x)) : -Math.log10(trans(wn(x))));
  const lines: string[] = [];
  for (let i = 0; i < n; i += 5) lines.push([xs[i].toFixed(6), ...ys.slice(i, i + 5).map(v => v.toFixed(4))].join(' '));
  return ['##TITLE=' + title, '##JCAMP-DX=4.24', '##DATA TYPE=INFRARED SPECTRUM', '##CLASS=COBLENTZ', '##STATE=LIQUID', `##XUNITS=${unit}`, `##YUNITS=${y}`, '##XFACTOR=1.000000', '##YFACTOR=1', `##DELTAX=${delta}`, `##FIRSTX=${first}`, `##LASTX=${xs[n - 1]}`, `##NPOINTS=${n}`, '##XYDATA=(X++(Y..Y))', ...lines, '##END='].join('\n');
}
const dipOf = (pts: {x: number; y: number}[], lo: number, hi: number, scale: 1 | -1 = 1) => pts.filter(p => p.x >= lo && p.x <= hi).reduce((best, p) => scale * p.y < scale * best.y ? p : best);

describe('JCAMP reader: x-axis units (stop 29 B)', () => {
  it('MICROMETERS: x -> 10000 / x, ascending cm-1, unit reported as 1/CM, the original unit returned; y untouched', () => {
    const text = jdx('MICROMETERS', 2.5, 0.01, 1251), d = decodeJcamp(text);
    expect(d.xUnit).toBe('1/CM'); expect(d.xUnitOriginal).toBe('MICROMETERS'); expect(d.yUnit).toBe('TRANSMITTANCE');
    expect(d.points).toHaveLength(1251);
    expect(d.points[0].x).toBeCloseTo(10000 / 15, 6); expect(d.points[1250].x).toBeCloseTo(4000, 6); // 2.5 um = 4000 cm-1, 15 um = 666.67 cm-1
    for (let i = 1; i < d.points.length; i++) expect(d.points[i].x).toBeGreaterThan(d.points[i - 1].x);
    expect(Math.abs(dipOf(d.points, 2100, 2350).x - 2230)).toBeLessThan(6); // the nitrile-like band sits where it was built (grid step there ~2 cm-1)
    expect(Math.abs(dipOf(d.points, 700, 820).x - 760)).toBeLessThan(2);
    expect(Math.min(...d.points.map(p => p.y))).toBeLessThan(0.5); expect(Math.max(...d.points.map(p => p.y))).toBeLessThanOrEqual(0.985 + 1e-9);
  });
  it('MICROMETERS through the IR parser: peaks at the built wavenumbers (not at 2-15), TRANSMITTANCE scale, a warning that names the conversion', () => {
    const s = SpectrumParser.parseTextSpectrum('IR', 'synthetic_um.jdx', jdx('MICROMETERS', 2.5, 0.01, 1251));
    expect(s.xUnit).toBe('1/CM'); expect(s.irIntensityScale).toBe('TRANSMITTANCE'); expect(s.sourceFormat).toBe('JCAMP-DX');
    const xs = s.peaks.map(p => p.x);
    expect(Math.min(...xs)).toBeGreaterThan(600); // without the conversion every peak would be 2-15
    for (const c of [2230, 1600, 760]) expect(xs.some(x => Math.abs(x - c) < 8), String(c)).toBe(true);
    expect(s.rawExperimentalSnapshot!.rawX![0]).toBeCloseTo(10000 / 15, 6); // the snapshot (and so everything downstream) is in cm-1
    expect(s.irProcessingWarnings?.some(w => w.includes('MICROMETERS') && w.includes('10000'))).toBe(true);
  });
  it('NANOMETERS: x -> 1e7 / x', () => {
    const d = decodeJcamp(jdx('NANOMETERS', 2500, 10, 1251));
    expect(d.xUnit).toBe('1/CM'); expect(d.xUnitOriginal).toBe('NANOMETERS');
    expect(d.points[0].x).toBeCloseTo(1e7 / 15000, 6); expect(d.points[1250].x).toBeCloseTo(4000, 6);
    expect(Math.abs(dipOf(d.points, 2100, 2350).x - 2230)).toBeLessThan(6);
    const s = SpectrumParser.parseTextSpectrum('IR', 'synthetic_nm.jdx', jdx('NANOMETERS', 2500, 10, 1251));
    expect(s.peaks.some(p => Math.abs(p.x - 1600) < 10)).toBe(true); expect(s.irProcessingWarnings?.some(w => w.includes('NANOMETERS') && w.includes('1e7'))).toBe(true);
  });
  it('a conversion that meets x <= 0 is refused with a message, not turned into Infinity', () => {
    expect(() => decodeJcamp(jdx('MICROMETERS', 0, 0.01, 50))).toThrow(/換算/);
  });
});

// v1.4.2 stop 30 (C): YUNITS checks with synthetic files (made-up bands). (1) TRANSMITTANCE with 0-100 values and (2) TRANSMITTANCE fractions slightly above 1 give the same peaks as the correctly labelled file
// (the direction is fixed DOWN, the baseline is fitted) and only switch the coverage check off (conservative: no absence is read); they are NOT changed. (3) "ABSORPTION" was UNKNOWN -> the median-based direction guess,
// which turns a spectrum with a high plateau upside down; it is now read as ABSORBANCE (direction UP), the same as "ABSORBANCE".
describe('JCAMP reader: YUNITS (stop 30 C)', () => {
  const W: [number, number, number][] = [[3065, 0.10, 10], [2230, 0.55, 12], [1600, 0.35, 14], [1495, 0.30, 12], [760, 0.45, 12], [690, 0.40, 10]];
  const plateau = (w: number) => 1.5 / (1 + Math.exp(-(w - 600) / 15)) / (1 + Math.exp((w - 3900) / 15)); // a high plateau over most of the range, near zero at the two ends: the median point sits near the top
  const absorb = (w: number, bg = false) => 0.0066 + (bg ? plateau(w) : 0) + W.reduce((s, [c, d, s2]) => s + d * Math.exp(-0.5 * ((w - c) / s2) ** 2), 0);
  const file = (yunits: string, f: (w: number) => number) => {
    const xs = Array.from({length: 1751}, (_, i) => 500 + 2 * i), v = xs.map(f), lines: string[] = [];
    for (let i = 0; i < xs.length; i += 5) lines.push([xs[i].toFixed(1), ...v.slice(i, i + 5).map(y => y.toFixed(5))].join(' '));
    return ['##TITLE=SYNTHETIC', '##JCAMP-DX=4.24', '##DATA TYPE=INFRARED SPECTRUM', '##XUNITS=1/CM', `##YUNITS=${yunits}`, '##XFACTOR=1', '##YFACTOR=1', '##DELTAX=2', '##FIRSTX=500', '##LASTX=4000', '##NPOINTS=1751', '##XYDATA=(X++(Y..Y))', ...lines, '##END='].join('\n');
  };
  const peaksOf = (text: string) => SpectrumParser.parseTextSpectrum('IR', 'y.jdx', text).peaks.map(p => p.x);
  it('"ABSORPTION" / "absorptance" / "% absorption" are read as ABSORBANCE (were UNKNOWN); other strings unchanged', () => {
    for (const u of ['ABSORPTION', 'absorption', 'ABSORPTANCE', '% ABSORPTION']) expect(resolveIRScale(u), u).toBe('ABSORBANCE');
    expect(resolveIRScale('ARBITRARY UNITS')).toBe('UNKNOWN'); expect(resolveIRScale('TRANSMITTANCE')).toBe('TRANSMITTANCE'); expect(resolveIRScale('ABSORBANCE')).toBe('ABSORBANCE');
  });
  it('a high-plateau spectrum labelled ABSORPTION gives the same peaks as the ABSORBANCE file (before the fix: the direction guess flipped it and every peak was between the real bands)', () => {
    const a = peaksOf(file('ABSORPTION', w => absorb(w, true))), b = peaksOf(file('ABSORBANCE', w => absorb(w, true)));
    expect(a).toEqual(b);
    for (const c of [2230, 1600, 760]) expect(a.some(x => Math.abs(x - c) < 6), String(c)).toBe(true);
  });
  it('TRANSMITTANCE with 0-100 values and TRANSMITTANCE slightly above 1: same peaks as the 0-1 file (kept conservative: coverage is off, not changed)', () => {
    const ref = peaksOf(file('TRANSMITTANCE', w => 10 ** -absorb(w)));
    expect(peaksOf(file('TRANSMITTANCE', w => 100 * 10 ** -absorb(w)))).toEqual(ref);
    expect(peaksOf(file('TRANSMITTANCE', w => 10 ** -absorb(w) + 0.05))).toEqual(ref);
  });
});

describe('JCAMP reader: units that must not change (regression, stop 29 B)', () => {
  it('1/CM: no conversion, order and values as in the file, unit string as before, no xUnitOriginal, no warning', () => {
    const d = decodeJcamp(jdx('1/CM', 500, 2, 1751));
    expect(d.xUnit).toBe('1/CM'); expect(d.xUnitOriginal).toBeUndefined(); expect(d.points[0].x).toBe(500); expect(d.points[1750].x).toBe(4000); expect(d.points[1].x).toBe(502);
    const s = SpectrumParser.parseTextSpectrum('IR', 'synthetic_cm.jdx', jdx('1/CM', 500, 2, 1751));
    expect(s.irProcessingWarnings).toBeUndefined(); expect(s.peaks.some(p => Math.abs(p.x - 2230) < 6)).toBe(true);
  });
  it('the same band table read from a 1/CM file and from the MICROMETERS version of it: the peaks agree within the grid step', () => {
    const a = SpectrumParser.parseTextSpectrum('IR', 'a.jdx', jdx('1/CM', 666, 2, 1668)).peaks.map(p => p.x), b = SpectrumParser.parseTextSpectrum('IR', 'b.jdx', jdx('MICROMETERS', 2.5, 0.01, 1251)).peaks.map(p => p.x);
    for (const c of [2230, 1600, 1495, 760]) { expect(a.some(x => Math.abs(x - c) < 8), 'cm ' + c).toBe(true); expect(b.some(x => Math.abs(x - c) < 8), 'um ' + c).toBe(true); }
  });
  it('other x units (PPM, M/Z, HZ) and spellings of cm-1 are passed through untouched', () => {
    for (const u of ['PPM', 'M/Z', 'HZ', 'CM-1', '1/CM', 'cm^-1']) {
      const text = jdx('1/CM', 500, 2, 101).replace('##XUNITS=1/CM', `##XUNITS=${u}`), d = decodeJcamp(text);
      expect(d.xUnit, u).toBe(u); expect(d.xUnitOriginal, u).toBeUndefined(); expect(d.points[0].x, u).toBe(500); expect(d.points[100].x, u).toBe(700);
    }
  });
  it('YUNITS: TRANSMITTANCE (fraction) and ABSORBANCE keep their scale and direction; the band is found as a dip / a rise; the same wavenumber result either way', () => {
    expect(resolveIRScale('TRANSMITTANCE')).toBe('TRANSMITTANCE'); expect(resolveIRScale('ABSORBANCE')).toBe('ABSORBANCE'); expect(resolveIRScale('%TRANSMITTANCE')).toBe('PERCENT_TRANSMITTANCE');
    expect(resolveIRScale('ARBITRARY UNITS')).toBe('UNKNOWN'); // unknown stays unknown: the direction is then inferred and no absence is read from it
    const t = SpectrumParser.parseTextSpectrum('IR', 't.jdx', jdx('1/CM', 500, 2, 1751, 'TRANSMITTANCE')), a = SpectrumParser.parseTextSpectrum('IR', 'a.jdx', jdx('1/CM', 500, 2, 1751, 'ABSORBANCE'));
    expect(t.irIntensityScale).toBe('TRANSMITTANCE'); expect(a.irIntensityScale).toBe('ABSORBANCE');
    for (const c of [2230, 1600, 760]) { expect(t.peaks.some(p => Math.abs(p.x - c) < 6), 'T ' + c).toBe(true); expect(a.peaks.some(p => Math.abs(p.x - c) < 6), 'A ' + c).toBe(true); }
  });
});
