/**
 * Fractional indexing utilities for tldraw-compatible ordering.
 * 
 * This is a TypeScript port of @tldraw/utils reordering module,
 * using jittered-fractional-indexing package for index generation.
 * 
 * @module reordering
 */

import { generateKeyBetween, generateNKeysBetween } from 'jittered-fractional-indexing';

// Use no jitter in tests for deterministic results
const generateNKeysBetweenWithNoJitter = (a: string | null, b: string | null, n: number) => {
    return generateNKeysBetween(a, b, n, { jitterBits: 0 });
};

// Use jittered version in production for better distribution
const generateKeysFn = generateNKeysBetween;

/**
 * A string made up of an integer part followed by a fraction part.
 * Based on fractional indexing algorithm.
 */
export type IndexKey = string & { __brand: 'indexKey' };

/**
 * The index key for the first index - 'a0'.
 */
export const ZERO_INDEX_KEY = 'a0' as IndexKey;

/**
 * Validates that a string is a valid IndexKey.
 */
export function validateIndexKey(index: string): asserts index is IndexKey {
    try {
        generateKeyBetween(index, null);
    } catch {
        throw new Error('invalid index: ' + index);
    }
}

/**
 * Get a number of indices between two indices.
 */
export function getIndicesBetween(
    below: IndexKey | null | undefined,
    above: IndexKey | null | undefined,
    n: number
): IndexKey[] {
    return generateKeysFn(below ?? null, above ?? null, n) as IndexKey[];
}

/**
 * Get a number of indices above an index.
 */
export function getIndicesAbove(below: IndexKey | null | undefined, n: number): IndexKey[] {
    return generateKeysFn(below ?? null, null, n) as IndexKey[];
}

/**
 * Get a number of indices below an index.
 */
export function getIndicesBelow(above: IndexKey | null | undefined, n: number): IndexKey[] {
    return generateKeysFn(null, above ?? null, n) as IndexKey[];
}

/**
 * Get the index between two indices.
 */
export function getIndexBetween(
    below: IndexKey | null | undefined,
    above: IndexKey | null | undefined
): IndexKey {
    return generateKeysFn(below ?? null, above ?? null, 1)[0] as IndexKey;
}

/**
 * Get the index above a given index.
 */
export function getIndexAbove(below: IndexKey | null | undefined = null): IndexKey {
    return generateKeysFn(below, null, 1)[0] as IndexKey;
}

/**
 * Get the index below a given index.
 */
export function getIndexBelow(above: IndexKey | null | undefined = null): IndexKey {
    return generateKeysFn(null, above, 1)[0] as IndexKey;
}

/**
 * Get n number of indices, starting at an index.
 */
export function getIndices(n: number, start: IndexKey = 'a1' as IndexKey): IndexKey[] {
    return [start, ...generateKeysFn(start, null, n)] as IndexKey[];
}

/**
 * Sort by index.
 */
export function sortByIndex<T extends { index: IndexKey }>(a: T, b: T): number {
    if (a.index < b.index) return -1;
    if (a.index > b.index) return 1;
    return 0;
}
