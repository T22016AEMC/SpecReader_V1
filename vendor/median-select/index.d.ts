/** Reorders `values` in place and returns the element of rank floor((n - 1) / 2) (lower median; undefined for an empty array). See index.js. */
declare function selectLowerMedian<T>(values: T[] | ArrayLike<T>): T | undefined;
export = selectLowerMedian;
