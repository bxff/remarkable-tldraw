/**
 * Tests for CRDT sequence operations
 */
import { describe, it, expect } from 'vitest';
import {
    CrdtSequence,
    CrdtSequenceItem,
    createCrdtSequenceItem,
    toposortItems,
    END_MARKER,
} from '../../src/ts/crdt-sequence.ts';
import { createCrdtId, crdtIdEquals } from '../../src/ts/tagged-block-common.ts';

describe('CrdtSequenceItem', () => {
    it('should create CrdtSequenceItem correctly', () => {
        const itemId = createCrdtId(1, 10);
        const leftId = createCrdtId(0, 0);
        const rightId = createCrdtId(0, 0);

        const item = createCrdtSequenceItem(itemId, leftId, rightId, 0, 'hello');

        expect(crdtIdEquals(item.itemId, itemId)).toBe(true);
        expect(item.value).toBe('hello');
    });
});

describe('CrdtSequence', () => {
    it('should create empty sequence', () => {
        const seq = new CrdtSequence<string>();
        expect(seq.size).toBe(0);
    });

    it('should add items', () => {
        const seq = new CrdtSequence<string>();
        const item = createCrdtSequenceItem(
            createCrdtId(1, 10),
            END_MARKER,
            END_MARKER,
            0,
            'hello'
        );

        seq.add(item);
        expect(seq.size).toBe(1);
        expect(seq.get(createCrdtId(1, 10))).toBe('hello');
    });

    it('should return values in order', () => {
        const seq = new CrdtSequence<string>();

        // Add items with ordering: A -> B -> C
        const itemA = createCrdtSequenceItem(
            createCrdtId(1, 1),
            END_MARKER,  // A is first
            createCrdtId(1, 2),  // B comes after
            0,
            'A'
        );

        const itemB = createCrdtSequenceItem(
            createCrdtId(1, 2),
            createCrdtId(1, 1),  // A is to the left
            createCrdtId(1, 3),  // C comes after
            0,
            'B'
        );

        const itemC = createCrdtSequenceItem(
            createCrdtId(1, 3),
            createCrdtId(1, 2),  // B is to the left
            END_MARKER,  // C is last
            0,
            'C'
        );

        seq.add(itemB);  // Add out of order
        seq.add(itemC);
        seq.add(itemA);

        const values = seq.values();
        expect(values).toEqual(['A', 'B', 'C']);
    });
});

describe('toposortItems', () => {
    it('should sort single item', () => {
        const items = [
            createCrdtSequenceItem(createCrdtId(1, 1), END_MARKER, END_MARKER, 0, 'A'),
        ];

        const sorted = toposortItems(items);
        expect(sorted.length).toBe(1);
        expect(crdtIdEquals(sorted[0], createCrdtId(1, 1))).toBe(true);
    });

    it('should sort chain of items', () => {
        const items = [
            createCrdtSequenceItem(createCrdtId(1, 2), createCrdtId(1, 1), END_MARKER, 0, 'B'),
            createCrdtSequenceItem(createCrdtId(1, 1), END_MARKER, createCrdtId(1, 2), 0, 'A'),
        ];

        const sorted = toposortItems(items);
        expect(sorted.length).toBe(2);
        expect(crdtIdEquals(sorted[0], createCrdtId(1, 1))).toBe(true);
        expect(crdtIdEquals(sorted[1], createCrdtId(1, 2))).toBe(true);
    });
});
