"""
v1.4.2 stop 26: extraction of MEASURED 1H spectra from the nmrshiftdb2 SD file (nmrshiftdb2withsignals.sd).

Contains information from nmrshiftdb2 (www.nmrshiftdb.org), which is made available here under the nmrshiftdb2 Database License.
License: nmrshiftdb2 Database License, https://nmrshiftdb.nmr.uni-koeln.de/nmrshiftdbhtml/nmrshiftdb2datalicense.txt
(full text: tests/fixtures/v140/nmrshiftdb2/nmrshiftdb2datalicense.txt). The files this script writes carry the same notice (stop 33).

This script is the "method of making the alterations" (nmrshiftdb2 Database License, section 4.7 b) for the 1H truth values the
SpecReader repository keeps in tests/fixtures/v140/nmrshiftdb2/. The SD file itself is NOT in the repository.

Usage (Python 3, standard library only):
    python -I scripts/nmrshiftdb2/extract_h1.py <path to nmrshiftdb2withsignals.sd> <output directory>

Output (in the output directory):
    h1_records.jsonl   one line per kept 1H spectrum: nmrshiftdb2 ID, spectrum number, solvent, temperature, field, assignment
                       method, heavy-atom-only V2000 molblock, and per heavy atom (0-based index in that molblock) the list of shifts.
    extract_stats.json counts: records, 1H spectra, why spectra were excluded, solvent distribution of the measured 1H spectra.

Rules (written before any number was looked at):
  * A spectrum is COMPUTED (excluded) when its spectrum number appears in any of the per-spectrum fields that only computed spectra carry:
    Program, NMRProgram, NMRMethod, NMRBasisSet, NMRLocalis, NMRStandard, GeomMethod, GeomBasisSet. Those fields name a predictor
    (ACD/Labs, HOSE code, CSEARCH) or a quantum-chemistry method (Spartan, Gaussian, Quantum ESPRESSO ...).
  * A spectrum without a Solvent entry for its own number is excluded (no measured spectrum without a solvent is used).
  * Assignment method "nmrshiftdb2 auto assignment" is excluded (an algorithm, not the depositor, assigned the signals).
  * Explicit H atoms in the molblock are removed; a signal on an explicit H is moved to the heavy atom that H is bonded to.
  * No value is changed. Ambiguity (several values on one atom, shared values of non-equivalent atoms) is judged later, in the
    study (tests/helpers/v142Nmrshiftdb2Study.ts), against the predictor's equivalence classes.
"""
import json
import os
import re
import sys
from collections import Counter

COMPUTED_FIELDS = ['Program', 'NMRProgram', 'NMRMethod', 'NMRBasisSet', 'NMRLocalis', 'NMRStandard', 'GeomMethod', 'GeomBasisSet']
AUTO_ASSIGNMENT = 'nmrshiftdb2 auto assignment'
SEG = re.compile(r'(?:^|\s)(\d+):')


def per_spectrum(value):
    """'0:Chloroform-D1 (CDCl3) 1:Methanol-D4' -> {0: 'Chloroform-D1 (CDCl3)', 1: 'Methanol-D4'}"""
    out = {}
    marks = list(SEG.finditer(value))
    for k, m in enumerate(marks):
        end = marks[k + 1].start() if k + 1 < len(marks) else len(value)
        out[int(m.group(1))] = value[m.end():end].strip()
    return out


def records(path):
    with open(path, 'r', encoding='utf-8', errors='replace') as f:
        buf = []
        for line in f:
            if line.startswith('$$$$'):
                yield buf
                buf = []
            else:
                buf.append(line.rstrip('\r\n'))
        if any(x.strip() for x in buf):
            yield buf


def split_record(lines):
    end = next(i for i, l in enumerate(lines) if l.startswith('M  END'))
    mol = lines[:end + 1]
    fields, cur = {}, None
    for l in lines[end + 1:]:
        m = re.match(r'^>\s*<(.+?)>', l)
        if m:
            cur = m.group(1)
            fields[cur] = ''
        elif cur is not None and l.strip() != '':
            fields[cur] = (fields[cur] + ' ' + l.strip()).strip()
    return mol, fields


def heavy_molblock(mol):
    """Removes explicit H (and D, T) atoms from a V2000 molblock. Returns (molblock, old index -> new index or None, H index -> heavy neighbour old index)."""
    counts = mol[3]
    na, nb = int(counts[0:3]), int(counts[3:6])
    atoms = mol[4:4 + na]
    bonds = mol[4 + na:4 + na + nb]
    props = mol[4 + na + nb:]
    sym = [a[31:34].strip() for a in atoms]
    isH = [s in ('H', 'D', 'T') for s in sym]
    newidx, k = [], 0
    for h in isH:
        newidx.append(None if h else k)
        if not h:
            k += 1
    h_parent = {}
    kept_bonds = []
    for b in bonds:
        a1, a2 = int(b[0:3]) - 1, int(b[3:6]) - 1
        if isH[a1] or isH[a2]:
            h, o = (a1, a2) if isH[a1] else (a2, a1)
            if not isH[o]:
                h_parent[h] = o
            continue
        kept_bonds.append('%3d%3d%s' % (newidx[a1] + 1, newidx[a2] + 1, b[6:]))
    kept_props = []
    for p in props:
        m = re.match(r'^M  (CHG|ISO|RAD)\s*(\d+)(.*)$', p)
        if not m:
            kept_props.append(p)
            continue
        nums = m.group(3).split()
        pairs = [(int(nums[2 * i]) - 1, nums[2 * i + 1]) for i in range(len(nums) // 2)]
        pairs = [(newidx[a], v) for a, v in pairs if newidx[a] is not None]
        if pairs:
            kept_props.append('M  %s%3d' % (m.group(1), len(pairs)) + ''.join('%4d%4s' % (a + 1, v) for a, v in pairs))
    heavy = [a for a, h in zip(atoms, isH) if not h]
    out = mol[:3] + ['%3d%3d' % (len(heavy), len(kept_bonds)) + counts[6:]] + heavy + kept_bonds + kept_props
    return '\n'.join(out) + '\n', newidx, h_parent, sym


def main():
    sd, outdir = sys.argv[1], sys.argv[2]
    os.makedirs(outdir, exist_ok=True)
    st = Counter()
    solvent_measured = Counter()
    solvent_computed = Counter()
    computed_program = Counter()
    assignment_kept = Counter()
    bad_values = []
    with open(os.path.join(outdir, 'h1_records.jsonl'), 'w', encoding='utf-8') as out:
        for lines in records(sd):
            if not any(l.startswith('M  END') for l in lines):
                st['record without molblock'] += 1
                continue
            st['records'] += 1
            mol, fields = split_record(lines)
            specs = {int(m.group(1)): v for k, v in fields.items() for m in [re.match(r'^Spectrum 1H (\d+)$', k)] if m}
            if not specs:
                continue
            st['records with a 1H spectrum'] += 1
            meta = {k: per_spectrum(fields.get(k, '')) for k in ['Solvent', 'Temperature [K]', 'Field Strength [MHz]', 'Assignment Method'] + COMPUTED_FIELDS}
            try:
                hb, newidx, h_parent, sym = heavy_molblock(mol)
            except Exception as e:  # malformed molblock
                st['1H spectra: molblock not readable'] += len(specs)
                continue
            for n, raw in specs.items():
                st['1H spectra'] += 1
                computed_by = [f for f in COMPUTED_FIELDS if n in meta[f]]
                solvent = meta['Solvent'].get(n)
                if computed_by:
                    st['1H spectra excluded: computed (spectrum number in ' + '/'.join(computed_by) + ')'] += 1
                    st['1H spectra excluded: computed (total)'] += 1
                    prog = (meta['Program'].get(n) or meta['NMRProgram'].get(n) or meta['NMRMethod'].get(n) or '(field present, empty)')
                    computed_program[prog] += 1
                    solvent_computed[solvent or '(no solvent entry)'] += 1
                    continue
                if not solvent:
                    st['1H spectra excluded: no solvent entry for the spectrum'] += 1
                    continue
                assign = meta['Assignment Method'].get(n, '')
                if assign == AUTO_ASSIGNMENT:
                    st['1H spectra excluded: nmrshiftdb2 auto assignment'] += 1
                    continue
                solvent_measured[solvent] += 1
                st['1H spectra kept as measured'] += 1
                assignment_kept[assign or '(none)'] += 1
                shifts = {}
                ok = True
                for item in raw.split('|'):
                    item = item.strip()
                    if not item:
                        continue
                    parts = item.split(';')
                    try:
                        v, a = float(parts[0]), int(parts[-1])
                    except ValueError:
                        bad_values.append([fields.get('nmrshiftdb2 ID'), n, item])
                        ok = False
                        continue
                    if a < 0 or a >= len(newidx):
                        bad_values.append([fields.get('nmrshiftdb2 ID'), n, item + ' (atom index out of range)'])
                        ok = False
                        continue
                    heavy = newidx[a] if newidx[a] is not None else (newidx[h_parent[a]] if a in h_parent else None)
                    if heavy is None:
                        bad_values.append([fields.get('nmrshiftdb2 ID'), n, item + ' (H without heavy neighbour)'])
                        ok = False
                        continue
                    if newidx[a] is None:
                        st['signals moved from an explicit H to its heavy atom'] += 1
                    shifts.setdefault(heavy, []).append(v)
                if not ok:
                    st['1H spectra with an unreadable signal (the readable ones kept, the spectrum flagged)'] += 1
                out.write(json.dumps({
                    'id': fields.get('nmrshiftdb2 ID', '').strip(), 'spectrum': n, 'solvent': solvent,
                    'temperatureK': meta['Temperature [K]'].get(n), 'fieldMHz': meta['Field Strength [MHz]'].get(n),
                    'assignment': assign, 'unreadableSignal': not ok, 'inchikey': fields.get('INChI key', '').strip(),
                    'molblock': hb, 'shifts': {str(k): v for k, v in sorted(shifts.items())},
                }, ensure_ascii=False) + '\n')
    stats = {
        'notice': 'Contains information from nmrshiftdb2 (www.nmrshiftdb.org), which is made available here under the nmrshiftdb2 Database License.',
        'license': 'nmrshiftdb2 Database License; URI https://nmrshiftdb.nmr.uni-koeln.de/nmrshiftdbhtml/nmrshiftdb2datalicense.txt',
        'counts': dict(st), 'solventOfMeasured1H': dict(solvent_measured.most_common()), 'solventOfComputed1H': dict(solvent_computed.most_common()),
        'programOfComputed1H': dict(computed_program.most_common()), 'assignmentMethodOfMeasured1H': dict(assignment_kept.most_common(30)),
        'unreadableSignals': bad_values[:200], 'unreadableSignalCount': len(bad_values),
    }
    # self-check: no kept spectrum is a computed one
    assert st['1H spectra kept as measured'] + st['1H spectra excluded: computed (total)'] + st['1H spectra excluded: no solvent entry for the spectrum'] + st['1H spectra excluded: nmrshiftdb2 auto assignment'] == st['1H spectra']
    with open(os.path.join(outdir, 'extract_stats.json'), 'w', encoding='utf-8') as f:
        json.dump(stats, f, ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
