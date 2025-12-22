/**
 * Data structure representing CRDT sequence.
 * 
 * TypeScript port of rmscene/src/rmscene/crdt_sequence.py
 * @module crdt-sequence
 */

import { CrdtId, crdtIdEquals, crdtIdToString } from './tagged-block-common';

/** End marker for CRDT sequences */
export const END_MARKER: CrdtId = { part1: 0, part2: 0 };

/** An item in a CRDT sequence */
export interface CrdtSequenceItem<T> {
    itemId: CrdtId;
    leftId: CrdtId;
    rightId: CrdtId;
    deletedLength: number;
    value: T;
}

/** Create a CrdtSequenceItem */
export function createCrdtSequenceItem<T>(
    itemId: CrdtId,
    leftId: CrdtId,
    rightId: CrdtId,
    deletedLength: number,
    value: T
): CrdtSequenceItem<T> {
    return { itemId, leftId, rightId, deletedLength, value };
}

/**
 * Ordered CRDT Sequence container.
 * 
 * The Sequence contains CrdtSequenceItems, each of which has an ID and
 * left/right IDs establishing a partial order.
 * 
 * Iterating through the CrdtSequence yields IDs following this order.
 */
export class CrdtSequence<T> {
    private _items: Map<string, CrdtSequenceItem<T>>;

    constructor(items?: CrdtSequenceItem<T>[]) {
        this._items = new Map();
        if (items) {
            for (const item of items) {
                this._items.set(crdtIdToString(item.itemId), item);
            }
        }
    }

    /** Check equality */
    equals(other: CrdtSequence<T>): boolean {
        if (this._items.size !== other._items.size) return false;
        for (const [key, item] of this._items) {
            const otherItem = other._items.get(key);
            if (!otherItem) return false;
            // Simple comparison - assumes values are comparable
            if (JSON.stringify(item) !== JSON.stringify(otherItem)) return false;
        }
        return true;
    }

    /** Return CrdtIds in order */
    *[Symbol.iterator](): Iterator<CrdtId> {
        yield* this.keys();
    }

    /** Return CrdtIds in order */
    keys(): CrdtId[] {
        return toposortItems(Array.from(this._items.values()));
    }

    /** Return list of sorted values */
    values(): T[] {
        return this.keys().map((id) => this.get(id)!);
    }

    /** Return list of sorted key, value pairs */
    entries(): [CrdtId, T][] {
        return this.keys().map((id) => [id, this.get(id)!]);
    }

    /** Return value with key */
    get(key: CrdtId): T | undefined {
        const item = this._items.get(crdtIdToString(key));
        return item?.value;
    }

    /** Check if key exists */
    has(key: CrdtId): boolean {
        return this._items.has(crdtIdToString(key));
    }

    /** Return size */
    get size(): number {
        return this._items.size;
    }

    /** Iterate through CrdtSequenceItems (unsorted) */
    sequenceItems(): CrdtSequenceItem<T>[] {
        return Array.from(this._items.values());
    }

    /** Add an item to the sequence */
    add(item: CrdtSequenceItem<T>): void {
        const key = crdtIdToString(item.itemId);
        if (this._items.has(key)) {
            throw new Error(`Already have item ${key}`);
        }
        this._items.set(key, item);
    }

    /** Get item by CrdtId (returns the full CrdtSequenceItem) */
    getItem(key: CrdtId): CrdtSequenceItem<T> | undefined {
        return this._items.get(crdtIdToString(key));
    }
}

/**
 * Sort SequenceItems based on left and right ids.
 * Returns CrdtIds in the sorted order.
 */
export function toposortItems<T>(items: CrdtSequenceItem<T>[]): CrdtId[] {
    if (items.length === 0) return [];

    const itemDict = new Map<string, CrdtSequenceItem<T>>();
    for (const item of items) {
        itemDict.set(crdtIdToString(item.itemId), item);
    }

    function getSideId(item: CrdtSequenceItem<T>, side: 'left' | 'right'): string {
        const sideId = side === 'left' ? item.leftId : item.rightId;
        if (crdtIdEquals(sideId, END_MARKER) || !itemDict.has(crdtIdToString(sideId))) {
            return side === 'left' ? '__start' : '__end';
        }
        return crdtIdToString(sideId);
    }

    // Build dictionary: key "comes after" values
    const data = new Map<string, Set<string>>();

    for (const item of items) {
        const itemKey = crdtIdToString(item.itemId);
        const leftId = getSideId(item, 'left');
        const rightId = getSideId(item, 'right');

        if (!data.has(itemKey)) {
            data.set(itemKey, new Set());
        }
        data.get(itemKey)!.add(leftId);

        if (!data.has(rightId)) {
            data.set(rightId, new Set());
        }
        data.get(rightId)!.add(itemKey);
    }

    // Fill in sources not explicitly included
    const allDeps = new Set<string>();
    for (const deps of data.values()) {
        for (const dep of deps) {
            allDeps.add(dep);
        }
    }
    for (const dep of allDeps) {
        if (!data.has(dep)) {
            data.set(dep, new Set());
        }
    }

    const result: CrdtId[] = [];

    while (true) {
        const nextItems = new Set<string>();
        for (const [item, deps] of data) {
            if (deps.size === 0) {
                nextItems.add(item);
            }
        }

        if (nextItems.size === 1 && nextItems.has('__end')) {
            break;
        }

        if (nextItems.size === 0) {
            throw new Error('cyclic dependency');
        }

        // Sort and yield items that are in itemDict
        const sortedItems = Array.from(nextItems).filter((k) => itemDict.has(k)).sort();
        for (const key of sortedItems) {
            const item = itemDict.get(key)!;
            result.push(item.itemId);
        }

        // Remove processed items from dependencies
        const newData = new Map<string, Set<string>>();
        for (const [item, deps] of data) {
            if (!nextItems.has(item)) {
                const newDeps = new Set<string>();
                for (const dep of deps) {
                    if (!nextItems.has(dep)) {
                        newDeps.add(dep);
                    }
                }
                newData.set(item, newDeps);
            }
        }
        data.clear();
        for (const [k, v] of newData) {
            data.set(k, v);
        }
    }

    return result;
}
