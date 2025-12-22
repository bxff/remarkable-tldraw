/**
 * Write structure of remarkable .rm files version 6.
 * 
 * TypeScript port of rmscene/src/rmscene/tagged_block_writer.py
 * @module tagged-block-writer
 */

import {
    DataStream,
    TagType,
    CrdtId,
    LwwValue,
    UnexpectedBlockError,
} from './tagged-block-common';

/**
 * Write blocks and values to a remarkable v6 file stream.
 */
export class TaggedBlockWriter {
    data: DataStream;
    options: Record<string, any>;
    private _inBlock = false;

    constructor(options: Record<string, any> = {}) {
        this.options = options;
        this.data = DataStream.forWriting();
    }

    /** Get the written bytes */
    getBytes(): Uint8Array {
        return this.data.getBytes();
    }

    /** Write the file header */
    writeHeader(): void {
        this.data.writeHeader();
    }

    // === Write simple values ===

    /** Write a tagged CRDT ID */
    writeId(index: number, value: CrdtId): void {
        this.data.writeTag(index, TagType.ID);
        this.data.writeCrdtId(value);
    }

    /** Write a tagged bool */
    writeBool(index: number, value: boolean): void {
        this.data.writeTag(index, TagType.Byte1);
        this.data.writeBool(value);
    }

    /** Write a tagged byte */
    writeByte(index: number, value: number): void {
        this.data.writeTag(index, TagType.Byte1);
        this.data.writeUint8(value);
    }

    /** Write a tagged 4-byte unsigned integer */
    writeInt(index: number, value: number): void {
        this.data.writeTag(index, TagType.Byte4);
        this.data.writeUint32(value);
    }

    /** Write a tagged 4-byte float */
    writeFloat(index: number, value: number): void {
        this.data.writeTag(index, TagType.Byte4);
        this.data.writeFloat32(value);
    }

    /** Write a tagged 8-byte double */
    writeDouble(index: number, value: number): void {
        this.data.writeTag(index, TagType.Byte8);
        this.data.writeFloat64(value);
    }

    // === Blocks ===

    /**
     * Write a top-level block.
     * Returns function to call when block writing is complete.
     */
    startBlock(blockType: number, minVersion: number, currentVersion: number): () => void {
        if (this._inBlock) {
            throw new UnexpectedBlockError('Already in a block');
        }

        this._inBlock = true;
        const previousData = this.data;
        const blockData = DataStream.forWriting();
        this.data = blockData;

        return () => {
            this.data = previousData;
            this._inBlock = false;

            const blockBytes = blockData.getBytes();
            this.data.writeUint32(blockBytes.length);
            this.data.writeUint8(0); // unknown
            this.data.writeUint8(minVersion);
            this.data.writeUint8(currentVersion);
            this.data.writeUint8(blockType);
            this.data.writeBytes(blockBytes);
        };
    }

    /**
     * Write a subblock.
     * Returns function to call when subblock writing is complete.
     */
    startSubblock(index: number): () => void {
        const previousData = this.data;
        const subblockData = DataStream.forWriting();
        this.data = subblockData;

        return () => {
            this.data = previousData;

            const subblockBytes = subblockData.getBytes();
            this.data.writeTag(index, TagType.Length4);
            this.data.writeUint32(subblockBytes.length);
            this.data.writeBytes(subblockBytes);
        };
    }

    // === Higher level constructs ===

    /** Write a LWW bool */
    writeLwwBool(index: number, value: LwwValue<boolean>): void {
        const end = this.startSubblock(index);
        this.writeId(1, value.timestamp);
        this.writeBool(2, value.value);
        end();
    }

    /** Write a LWW byte */
    writeLwwByte(index: number, value: LwwValue<number>): void {
        const end = this.startSubblock(index);
        this.writeId(1, value.timestamp);
        this.writeByte(2, value.value);
        end();
    }

    /** Write a LWW float */
    writeLwwFloat(index: number, value: LwwValue<number>): void {
        const end = this.startSubblock(index);
        this.writeId(1, value.timestamp);
        this.writeFloat(2, value.value);
        end();
    }

    /** Write a LWW ID */
    writeLwwId(index: number, value: LwwValue<CrdtId>): void {
        const end = this.startSubblock(index);
        this.writeId(1, value.timestamp);
        this.writeId(2, value.value);
        end();
    }

    /** Write a LWW string */
    writeLwwString(index: number, value: LwwValue<string>): void {
        const end = this.startSubblock(index);
        this.writeId(1, value.timestamp);
        this.writeString(2, value.value);
        end();
    }

    /** Write a standard string */
    writeString(index: number, value: string): void {
        const end = this.startSubblock(index);
        const encoder = new TextEncoder();
        const bytes = encoder.encode(value);
        this.data.writeVaruint(bytes.length);
        this.data.writeBool(true); // is_ascii
        this.data.writeBytes(bytes);
        end();
    }

    /** Write a string with format */
    writeStringWithFormat(index: number, text: string, fmt: number): void {
        const end = this.startSubblock(index);
        const encoder = new TextEncoder();
        const bytes = encoder.encode(text);
        this.data.writeVaruint(bytes.length);
        this.data.writeBool(true); // is_ascii
        this.data.writeBytes(bytes);
        this.writeInt(2, fmt);
        end();
    }

    /** Write int pair */
    writeIntPair(index: number, value: [number, number]): void {
        const end = this.startSubblock(index);
        this.data.writeUint32(value[0]);
        this.data.writeUint32(value[1]);
        end();
    }
}
