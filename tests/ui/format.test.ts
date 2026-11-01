import {describe, expect, it} from 'vitest';
import {fmtCompat, fmtIntegral, fmtMz, fmtScore, fmtScoreOf100, fmtShift13C, fmtShift1H, fmtWavenumber, shortenNumbers} from '../../src/ui/format';

// Display-layer rounding (v1.2.2 DESIGN_REPORT B1.6). The numbers are synthetic.
describe('format', () => {
  it('scores are whole numbers (the engine prints 69.72911737907232)', () => {
    expect(fmtScore(69.72911737907232)).toBe('70');
    expect(fmtScoreOf100(78)).toBe('78/100');
    expect(fmtScoreOf100(77.5)).toBe('78/100');
  });
  it('single compatibility values keep two decimals', () => {
    expect(fmtCompat(0.9794354838709677)).toBe('0.98');
    expect(fmtCompat(0)).toBe('0.00');
  });
  it('¹H shifts have two decimals, ¹³C shifts one (a whole number stays whole)', () => {
    expect(fmtShift1H(7.1)).toBe('7.10');
    expect(fmtShift1H(6.7312)).toBe('6.73');
    expect(fmtShift13C(65)).toBe('65');
    expect(fmtShift13C(128.456)).toBe('128.5');
  });
  it('IR wavenumbers and widths are whole numbers', () => {
    expect(fmtWavenumber(540.2727272727275)).toBe('540');
    expect(fmtWavenumber(3350.0)).toBe('3350');
  });
  it('integrals have one decimal; m/z keeps four decimals only in high resolution', () => {
    expect(fmtIntegral(2.04)).toBe('2');
    expect(fmtIntegral(2.5)).toBe('2.5');
    expect(fmtMz(105.0334, true)).toBe('105.0334');
    expect(fmtMz(105.0334)).toBe('105.03');
  });
  it('missing and non-finite values print a dash', () => {
    for (const f of [fmtScore, fmtCompat, fmtShift1H, fmtShift13C, fmtWavenumber, fmtIntegral]) {
      expect(f(null)).toBe('—');
      expect(f(undefined)).toBe('—');
      expect(f(Number.NaN)).toBe('—');
    }
  });
  it('shortenNumbers rounds long decimals inside free text and leaves masses alone', () => {
    expect(shortenNumbers('SUPPORTED (69.72911737907232/100)')).toBe('SUPPORTED (69.73/100)');
    expect(shortenNumbers('寬度 540.2727272727275')).toBe('寬度 540');
    expect(shortenNumbers('m/z 105.03341 與 0.9794354838709677')).toBe('m/z 105.03341 與 0.98');
    expect(shortenNumbers('誤差 0.00123 Da')).toBe('誤差 0.00123 Da');
    expect(shortenNumbers('3350.0 cm⁻¹、7.26 ppm')).toBe('3350.0 cm⁻¹、7.26 ppm');
    expect(shortenNumbers('SMILES CC(C)(c1ccc(O)cc1)')).toBe('SMILES CC(C)(c1ccc(O)cc1)');
  });
});
