/**
 * Helpers for reading/writing tagged block files.
 * 
 * TypeScript port of rmscene/src/rmscene/tagged_block_common.py
 * @module tagged-block-common
 */

/** The header for reMarkable v6 .lines files (43 bytes) */
export const HEADER_V6 = new TextEncoder().encode('reMarkable .lines file, version=6          ');

/** Tag type representing the type of following data */
export enum TagType {
    ID = 0xF,
    Length4 = 0xC,
    Byte8 = 0x8,
    Byte4 = 0x4,
    Byte1 = 0x1,
}

/** Unexpected tag or index in block stream */
export class UnexpectedBlockError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'UnexpectedBlockError';
    }
}

/** An identifier or timestamp in the CRDT system */
export interface CrdtId {
    readonly part1: number;
    readonly part2: number;
}

/** Create a CrdtId */
export function createCrdtId(part1: number, part2: number): CrdtId {
    return { part1, part2 };
}

/** Compare two CrdtIds for equality */
export function crdtIdEquals(a: CrdtId, b: CrdtId): boolean {
    return a.part1 === b.part1 && a.part2 === b.part2;
}

/** Compare two CrdtIds for ordering (returns -1, 0, or 1) */
export function crdtIdCompare(a: CrdtId, b: CrdtId): number {
    if (a.part1 !== b.part1) return a.part1 < b.part1 ? -1 : 1;
    if (a.part2 !== b.part2) return a.part2 < b.part2 ? -1 : 1;
    return 0;
}

/** Format CrdtId as string */
export function crdtIdToString(id: CrdtId): string {
    return `CrdtId(${id.part1}, ${id.part2})`;
}

/** Container for a last-write-wins value */
export interface LwwValue<T> {
    readonly timestamp: CrdtId;
    readonly value: T;
}

/** Create an LwwValue */
export function createLwwValue<T>(timestamp: CrdtId, value: T): LwwValue<T> {
    return { timestamp, value };
}

/**
 * A wrapper around a DataView for reading/writing binary data.
 * Provides methods for parsing reMarkable v6 file formats.
 */
export class DataStream {
    private buffer: ArrayBuffer;
    private view: DataView;
    private _position: number = 0;

    constructor(data: ArrayBuffer | Uint8Array) {
        if (data instanceof Uint8Array) {
            // Create a new ArrayBuffer and copy the data
            this.buffer = new ArrayBuffer(data.byteLength);
            new Uint8Array(this.buffer).set(data);
        } else {
            this.buffer = data;
        }
        this.view = new DataView(this.buffer);
    }

    /** Create a DataStream for writing with initial capacity */
    static forWriting(initialCapacity: number = 1024): DataStream {
        return new DataStream(new ArrayBuffer(initialCapacity));
    }

    /** Get current position in stream */
    tell(): number {
        return this._position;
    }

    /** Seek to position in stream */
    seek(position: number): void {
        if (position < 0 || position > this.buffer.byteLength) {
            throw new Error(`Seek position ${position} out of bounds [0, ${this.buffer.byteLength}]`);
        }
        this._position = position;
    }

    /** Get remaining bytes in stream */
    remaining(): number {
        return this.buffer.byteLength - this._position;
    }

    /** Get the underlying buffer as Uint8Array */
    getBytes(): Uint8Array {
        return new Uint8Array(this.buffer, 0, this._position);
    }

    /** Read the file header */
    readHeader(): void {
        const header = this.readBytes(HEADER_V6.length);
        for (let i = 0; i < HEADER_V6.length; i++) {
            if (header[i] !== HEADER_V6[i]) {
                throw new Error(`Wrong header at byte ${i}`);
            }
        }
    }

    /** Write the file header */
    writeHeader(): void {
        this.writeBytes(HEADER_V6);
    }

    /** Check that INDEX and TAG_TYPE are next (without advancing) */
    checkTag(expectedIndex: number, expectedType: TagType): boolean {
        const pos = this._position;
        try {
            const [index, tagType] = this._readTagValues();
            return index === expectedIndex && tagType === expectedType;
        } catch {
            return false;
        } finally {
            this._position = pos;
        }
    }

    /** Read a tag from the stream, raising error if not expected */
    readTag(expectedIndex: number, expectedType: TagType): [number, TagType] {
        const pos = this._position;
        const [index, tagType] = this._readTagValues();

        if (index !== expectedIndex) {
            this._position = pos;
            throw new UnexpectedBlockError(
                `Expected index ${expectedIndex}, got ${index}, at position ${this._position}`
            );
        }

        if (tagType !== expectedType) {
            this._position = pos;
            throw new UnexpectedBlockError(
                `Expected tag type ${TagType[expectedType]} (0x${expectedType.toString(16)}), got 0x${tagType.toString(16)} at position ${this._position}`
            );
        }

        return [index, tagType];
    }

    /** Read tag values from stream */
    private _readTagValues(): [number, TagType] {
        const x = this.readVaruint();
        const index = x >> 4;
        const tagTypeValue = x & 0xF;

        if (!Object.values(TagType).includes(tagTypeValue)) {
            throw new Error(`Bad tag type 0x${tagTypeValue.toString(16)} at position ${this._position}`);
        }

        return [index, tagTypeValue as TagType];
    }

    /** Write a tag to the stream */
    writeTag(index: number, tagType: TagType): void {
        const x = (index << 4) | tagType;
        this.writeVaruint(x);
    }

    /** Read n bytes from stream */
    readBytes(n: number): Uint8Array {
        if (this._position + n > this.buffer.byteLength) {
            throw new Error('EOF');
        }
        const result = new Uint8Array(this.buffer, this._position, n);
        this._position += n;
        return result.slice(); // Return copy
    }

    /** Write bytes to stream, expanding buffer if needed */
    writeBytes(bytes: Uint8Array): void {
        this._ensureCapacity(bytes.length);
        const target = new Uint8Array(this.buffer, this._position, bytes.length);
        target.set(bytes);
        this._position += bytes.length;
    }

    /** Ensure buffer has enough capacity */
    private _ensureCapacity(additionalBytes: number): void {
        const needed = this._position + additionalBytes;
        if (needed <= this.buffer.byteLength) return;

        // Double buffer size until sufficient
        let newSize = this.buffer.byteLength || 1024;
        while (newSize < needed) newSize *= 2;

        const newBuffer = new ArrayBuffer(newSize);
        new Uint8Array(newBuffer).set(new Uint8Array(this.buffer));
        this.buffer = newBuffer;
        this.view = new DataView(this.buffer);
    }

    /** Read a bool */
    readBool(): boolean {
        return this.readUint8() !== 0;
    }

    /** Read a uint8 */
    readUint8(): number {
        if (this._position + 1 > this.buffer.byteLength) throw new Error('EOF');
        const value = this.view.getUint8(this._position);
        this._position += 1;
        return value;
    }

    /** Read a uint16 (little endian) */
    readUint16(): number {
        if (this._position + 2 > this.buffer.byteLength) throw new Error('EOF');
        const value = this.view.getUint16(this._position, true);
        this._position += 2;
        return value;
    }

    /** Read a uint32 (little endian) */
    readUint32(): number {
        if (this._position + 4 > this.buffer.byteLength) throw new Error('EOF');
        const value = this.view.getUint32(this._position, true);
        this._position += 4;
        return value;
    }

    /** Read a float32 (little endian) */
    readFloat32(): number {
        if (this._position + 4 > this.buffer.byteLength) throw new Error('EOF');
        const value = this.view.getFloat32(this._position, true);
        this._position += 4;
        return value;
    }

    /** Read a float64 (little endian) */
    readFloat64(): number {
        if (this._position + 8 > this.buffer.byteLength) throw new Error('EOF');
        const value = this.view.getFloat64(this._position, true);
        this._position += 8;
        return value;
    }

    /** Read a variable-length unsigned integer */
    readVaruint(): number {
        let shift = 0;
        let result = 0;
        while (true) {
            const byte = this.readUint8();
            result |= (byte & 0x7F) << shift;
            shift += 7;
            if (!(byte & 0x80)) break;
        }
        return result;
    }

    /** Read a CrdtId */
    readCrdtId(): CrdtId {
        const part1 = this.readUint8();
        const part2 = this.readVaruint();
        return createCrdtId(part1, part2);
    }

    /** Write a bool */
    writeBool(value: boolean): void {
        this.writeUint8(value ? 1 : 0);
    }

    /** Write a uint8 */
    writeUint8(value: number): void {
        this._ensureCapacity(1);
        this.view.setUint8(this._position, value);
        this._position += 1;
    }

    /** Write a uint16 (little endian) */
    writeUint16(value: number): void {
        this._ensureCapacity(2);
        this.view.setUint16(this._position, value, true);
        this._position += 2;
    }

    /** Write a uint32 (little endian) */
    writeUint32(value: number): void {
        this._ensureCapacity(4);
        this.view.setUint32(this._position, value, true);
        this._position += 4;
    }

    /** Write a float32 (little endian) */
    writeFloat32(value: number): void {
        this._ensureCapacity(4);
        this.view.setFloat32(this._position, value, true);
        this._position += 4;
    }

    /** Write a float64 (little endian) */
    writeFloat64(value: number): void {
        this._ensureCapacity(8);
        this.view.setFloat64(this._position, value, true);
        this._position += 8;
    }

    /** Write a variable-length unsigned integer */
    writeVaruint(value: number): void {
        if (value < 0) throw new Error('value is negative');
        const bytes: number[] = [];
        while (true) {
            let toWrite = value & 0x7F;
            value >>>= 7;
            if (value) {
                bytes.push(toWrite | 0x80);
            } else {
                bytes.push(toWrite);
                break;
            }
        }
        this.writeBytes(new Uint8Array(bytes));
    }

    /** Write a CrdtId */
    writeCrdtId(value: CrdtId): void {
        if (value.part1 >= 2 ** 8 || value.part2 >= 2 ** 64) {
            throw new Error(`CrdtId too large: ${crdtIdToString(value)}`);
        }
        this.writeUint8(value.part1);
        this.writeVaruint(value.part2);
    }
}
