/**
 * Read structure of remarkable .rm files version 6.
 * 
 * TypeScript port of rmscene/src/rmscene/tagged_block_reader.py
 * @module tagged-block-reader
 */

import {
    DataStream,
    TagType,
    CrdtId,
    LwwValue,
    UnexpectedBlockError,
    createLwwValue,
} from './tagged-block-common';

/** Base class for block/subblock info */
export interface BlockInfo {
    offset: number;
    size: number;
    extraData: Uint8Array;
}

/** Top-level block info */
export interface MainBlockInfo extends BlockInfo {
    blockType: number;
    minVersion: number;
    currentVersion: number;
}

/** Sub-block info */
export interface SubBlockInfo extends BlockInfo { }

/** Read past end of block error */
export class BlockOverflowError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'BlockOverflowError';
    }
}

/**
 * Read blocks and values from a remarkable v6 file stream.
 */
export class TaggedBlockReader {
    data: DataStream;
    currentBlock: MainBlockInfo | null = null;
    private _warnedAboutExtraData = false;

    constructor(data: ArrayBuffer | Uint8Array) {
        this.data = new DataStream(data);
    }

    /** Read the file header */
    readHeader(): void {
        this.data.readHeader();
    }

    // === Read simple values ===

    /** Read a tagged CRDT ID */
    readId(index: number): CrdtId {
        this.data.readTag(index, TagType.ID);
        return this.data.readCrdtId();
    }

    /** Read a tagged bool */
    readBool(index: number): boolean {
        this.data.readTag(index, TagType.Byte1);
        return this.data.readBool();
    }

    /** Read a tagged byte as unsigned integer */
    readByte(index: number): number {
        this.data.readTag(index, TagType.Byte1);
        return this.data.readUint8();
    }

    /** Read a tagged 4-byte unsigned integer */
    readInt(index: number): number {
        this.data.readTag(index, TagType.Byte4);
        return this.data.readUint32();
    }

    /** Read a tagged 4-byte float */
    readFloat(index: number): number {
        this.data.readTag(index, TagType.Byte4);
        return this.data.readFloat32();
    }

    /** Read a tagged 8-byte double */
    readDouble(index: number): number {
        this.data.readTag(index, TagType.Byte8);
        return this.data.readFloat64();
    }

    // === Read simple values -- optional variants ===

    private _readOptional<T>(
        func: (index: number) => T,
        index: number,
        defaultValue: T | null
    ): T | null {
        try {
            return func.call(this, index);
        } catch (e) {
            if (e instanceof UnexpectedBlockError || (e instanceof Error && e.message === 'EOF')) {
                return defaultValue;
            }
            throw e;
        }
    }

    /** Read a tagged CRDT ID, return default if not present */
    readIdOptional(index: number, defaultValue: CrdtId | null = null): CrdtId | null {
        return this._readOptional(this.readId, index, defaultValue);
    }

    /** Read a tagged bool, return default if not present */
    readBoolOptional(index: number, defaultValue: boolean | null = null): boolean | null {
        return this._readOptional(this.readBool, index, defaultValue);
    }

    /** Read a tagged byte, return default if not present */
    readByteOptional(index: number, defaultValue: number | null = null): number | null {
        return this._readOptional(this.readByte, index, defaultValue);
    }

    /** Read a tagged int, return default if not present */
    readIntOptional(index: number, defaultValue: number | null = null): number | null {
        return this._readOptional(this.readInt, index, defaultValue);
    }

    /** Read a tagged float, return default if not present */
    readFloatOptional(index: number, defaultValue: number | null = null): number | null {
        return this._readOptional(this.readFloat, index, defaultValue);
    }

    /** Read a tagged double, return default if not present */
    readDoubleOptional(index: number, defaultValue: number | null = null): number | null {
        return this._readOptional(this.readDouble, index, defaultValue);
    }

    // === Blocks ===

    /**
     * Read a top-level block header.
     * Returns null if no more blocks to read.
     */
    readBlock(): MainBlockInfo | null {
        if (this.currentBlock !== null) {
            throw new UnexpectedBlockError('Already in a block');
        }

        try {
            const blockLength = this.data.readUint32();
            const unknown = this.data.readUint8();
            const minVersion = this.data.readUint8();
            const currentVersion = this.data.readUint8();
            const blockType = this.data.readUint8();

            if (unknown !== 0) {
                throw new Error(`Expected unknown byte to be 0, got ${unknown}`);
            }

            const offset = this.data.tell();
            this.currentBlock = {
                offset,
                size: blockLength,
                blockType,
                minVersion,
                currentVersion,
                extraData: new Uint8Array(0),
            };

            return this.currentBlock;
        } catch (e) {
            if (e instanceof Error && e.message === 'EOF') {
                return null;
            }
            throw e;
        }
    }

    /** Finish reading a block and check position */
    endBlock(): void {
        if (this.currentBlock === null) {
            throw new Error('Not in a block');
        }
        this._checkPosition(this.currentBlock);
        this.currentBlock = null;
    }

    /** Return bytes remaining in current block */
    bytesRemainingInBlock(): number {
        if (this.currentBlock === null) {
            throw new Error('Not in a block');
        }
        return this.currentBlock.offset + this.currentBlock.size - this.data.tell();
    }

    /** Read a subblock length and return SubBlockInfo */
    readSubblock(index: number): SubBlockInfo {
        this.data.readTag(index, TagType.Length4);
        const subblockLength = this.data.readUint32();
        const offset = this.data.tell();

        return {
            offset,
            size: subblockLength,
            extraData: new Uint8Array(0),
        };
    }

    /** Finish reading a subblock and check position */
    endSubblock(subblock: SubBlockInfo): void {
        this._checkPosition(subblock);
    }

    /** Check if a subblock with the given index is next */
    hasSubblock(index: number): boolean {
        if (this.currentBlock) {
            if (this.bytesRemainingInBlock() <= 0) {
                return false;
            }
        }
        return this.data.checkTag(index, TagType.Length4);
    }

    private _checkPosition(blockInfo: BlockInfo): void {
        const { size, offset } = blockInfo;
        const currentPos = this.data.tell();

        if (currentPos > offset + size) {
            throw new BlockOverflowError(
                `Block starting at ${offset}, length ${size}, read up to ${currentPos} (overflow by ${currentPos - (offset + size)})`
            );
        }

        if (currentPos < offset + size) {
            if (!this._warnedAboutExtraData) {
                console.warn(
                    'Some data has not been read. The data may have been written using a newer format than this reader supports.'
                );
                this._warnedAboutExtraData = true;
            }
            const remaining = offset + size - currentPos;
            const excess = this.data.readBytes(remaining);
            (blockInfo as any).extraData = excess;
        }
    }

    // === Higher level constructs ===

    /** Read a LWW bool */
    readLwwBool(index: number): LwwValue<boolean> {
        const subblock = this.readSubblock(index);
        const timestamp = this.readId(1);
        const value = this.readBool(2);
        this.endSubblock(subblock);
        return createLwwValue(timestamp, value);
    }

    /** Read a LWW byte */
    readLwwByte(index: number): LwwValue<number> {
        const subblock = this.readSubblock(index);
        const timestamp = this.readId(1);
        const value = this.readByte(2);
        this.endSubblock(subblock);
        return createLwwValue(timestamp, value);
    }

    /** Read a LWW float */
    readLwwFloat(index: number): LwwValue<number> {
        const subblock = this.readSubblock(index);
        const timestamp = this.readId(1);
        const value = this.readFloat(2);
        this.endSubblock(subblock);
        return createLwwValue(timestamp, value);
    }

    /** Read a LWW ID */
    readLwwId(index: number): LwwValue<CrdtId> {
        const subblock = this.readSubblock(index);
        const timestamp = this.readId(1);
        const value = this.readId(2);
        this.endSubblock(subblock);
        return createLwwValue(timestamp, value);
    }

    /** Read a LWW string */
    readLwwString(index: number): LwwValue<string> {
        const subblock = this.readSubblock(index);
        const timestamp = this.readId(1);
        const value = this.readString(2);
        this.endSubblock(subblock);
        return createLwwValue(timestamp, value);
    }

    /** Read a standard string block */
    readString(index: number): string {
        const subblock = this.readSubblock(index);
        const stringLength = this.data.readVaruint();
        const isAscii = this.data.readBool();
        if (!isAscii) {
            throw new Error('Expected ASCII flag to be true');
        }

        const bytes = this.data.readBytes(stringLength);
        const decoder = new TextDecoder('utf-8');
        const str = decoder.decode(bytes);
        this.endSubblock(subblock);
        return str;
    }

    /** Read a string block with formatting */
    readStringWithFormat(index: number): [string, number | null] {
        const subblock = this.readSubblock(index);
        const stringLength = this.data.readVaruint();
        const isAscii = this.data.readBool();
        if (!isAscii) {
            throw new Error('Expected ASCII flag to be true');
        }

        const bytes = this.data.readBytes(stringLength);
        const decoder = new TextDecoder('utf-8');
        const str = decoder.decode(bytes);

        let fmt: number | null = null;
        if (this.data.checkTag(2, TagType.Byte4)) {
            fmt = this.readInt(2);
        }

        this.endSubblock(subblock);
        return [str, fmt];
    }

    /** Read a sub block containing two uint32 */
    readIntPair(index: number): [number, number] {
        const subblock = this.readSubblock(index);
        const first = this.data.readUint32();
        const second = this.data.readUint32();
        this.endSubblock(subblock);
        return [first, second];
    }
}
