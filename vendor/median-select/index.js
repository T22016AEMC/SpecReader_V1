'use strict';
/**
 * SpecReader's own lower-median selection (v1.4.2 stop 33). Replaces the npm package median-quickselect 1.0.1, which ml-array-median (a dependency of jcampconverter) imports:
 * pnpm-workspace.yaml `overrides` points that import here, so the registry package is no longer installed or bundled.
 *
 * Contract (the one ml-array-median relies on, pinned by tests/vendor/medianSelect.test.ts against outputs recorded from median-quickselect 1.0.1 before it was removed):
 * - selectLowerMedian(values) reorders `values` IN PLACE and returns the element of rank floor((n - 1) / 2) (0-based, ascending), i.e. the lower of the two middle elements for an even n (no averaging);
 * - an empty array returns undefined; one element returns it; works on plain arrays and typed arrays;
 * - the comparisons, the pivot choice (median of first / middle / last) and the swap order are fixed, so the returned element and the final order of `values` are the same, bit for bit
 *   (including -0 vs 0, NaN, duplicates), as the replaced package.
 * Algorithm: iterative quickselect with a median-of-three pivot and a two-pointer (Hoare-style) partition, as described in Wirth, "Algorithms + Data Structures = Programs" and Press et al., "Numerical Recipes in C" (select / median),
 * written from that description for this project.
 */
function exchange(a, i, j) {
  const t = a[i];
  a[i] = a[j];
  a[j] = t;
}

function selectLowerMedian(values) {
  const a = values;
  const target = Math.trunc((a.length - 1) / 2) | 0;   // rank of the lower median; 0 for n = 0 (a[0] is then undefined)
  let lo = 0;
  let hi = a.length - 1;
  for (;;) {
    if (hi <= lo) return a[target];
    if (hi === lo + 1) {
      if (a[lo] > a[hi]) exchange(a, lo, hi);
      return a[target];
    }
    // pivot = median of a[lo], a[mid], a[hi]; afterwards a[mid] <= a[lo] <= a[hi] (for comparable values) and the pivot sits in a[lo]
    const mid = ((lo + hi) / 2) | 0;
    if (a[mid] > a[hi]) exchange(a, mid, hi);
    if (a[lo] > a[hi]) exchange(a, lo, hi);
    if (a[mid] > a[lo]) exchange(a, mid, lo);
    exchange(a, mid, lo + 1);   // the smallest of the three goes next to the pivot and acts as the left sentinel
    let i = lo + 1;
    let j = hi;
    for (;;) {
      do i++; while (a[lo] > a[i]);
      do j--; while (a[j] > a[lo]);
      if (j < i) break;
      exchange(a, i, j);
    }
    exchange(a, lo, j);   // pivot to its final place j
    if (j <= target) lo = i;
    if (j >= target) hi = j - 1;
  }
}

module.exports = selectLowerMedian;
module.exports.default = selectLowerMedian;
module.exports.selectLowerMedian = selectLowerMedian;
