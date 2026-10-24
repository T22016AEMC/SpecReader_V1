import type {FragmentSpec} from '../../src/engines/enumeration';

/** Generic synthetic fragments used by the enumeration tests (not taken from any measured compound). */
export const phenyl = (count = 1, id = 'phenyl'): FragmentSpec => ({
  id, count,
  atoms: [{element: 'C', open: true}, ...Array.from({length: 5}, () => ({element: 'C', fixedH: 1}))],
  bonds: [[0, 1, 2], [1, 2, 1], [2, 3, 2], [3, 4, 1], [4, 5, 2], [5, 0, 1]].map(([a, b, order]) => ({a, b, order: order as 1 | 2, aromatic: true})),
});
/** C6H4 ring with two open positions para to each other. */
export const paraPhenylene = (id = 'para'): FragmentSpec => ({
  id,
  atoms: Array.from({length: 6}, (_, i) => (i === 0 || i === 3 ? {element: 'C', open: true} : {element: 'C', fixedH: 1})),
  bonds: [[0, 1, 2], [1, 2, 1], [2, 3, 2], [3, 4, 1], [4, 5, 2], [5, 0, 1]].map(([a, b, order]) => ({a, b, order: order as 1 | 2, aromatic: true})),
});
export const methyl = (count = 1, id = 'methyl'): FragmentSpec => ({id, count, atoms: [{element: 'C', fixedH: 3, open: true}], bonds: []});
/** Nitro group attached through N+ (open, charged); the two oxygens are closed. */
export const nitro = (id = 'nitro'): FragmentSpec => ({
  id,
  atoms: [{element: 'N', charge: 1, open: true}, {element: 'O'}, {element: 'O', charge: -1}],
  bonds: [{a: 0, b: 1, order: 2}, {a: 0, b: 2, order: 1}],
});
