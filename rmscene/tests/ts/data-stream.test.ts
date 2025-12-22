/**
 * Tests for data stream operations (tagged-block-common.ts)
 */
import { describe, it, expect } from 'vitest';
import {
    DataStream,
    CrdtId,
    createCrdtId,
    crdtIdEquals,
    crdtIdToString,
    TagType,
    HEADER_V6,
    createLwwValue,
} from '../../src/ts/tagged-block-common.ts';

describe('CrdtId', () => {
    it('should create CrdtId correctly', () => {
        const id = createCrdtId(1, 42);
        expect(id.part1).toBe(1);
        expect(id.part2).toBe(42);
    });

    it('should compare CrdtIds for equality', () => {
        const a = createCrdtId(1, 42);
        const b = createCrdtId(1, 42);
        const c = createCrdtId(2, 42);

        expect(crdtIdEquals(a, b)).toBe(true);
        expect(crdtIdEquals(a, c)).toBe(false);
    });

    it('should format CrdtId as string', () => {
        const id = createCrdtId(5, 100);
        expect(crdtIdToString(id)).toBe('CrdtId(5, 100)');
    });
});

describe('DataStream - Reading', () => {
    it('should read uint8', () => {
        const data = new Uint8Array([0x42]);
        const stream = new DataStream(data);
        expect(stream.readUint8()).toBe(0x42);
    });

    it('should read uint16 little endian', () => {
        const data = new Uint8Array([0x34, 0x12]);
        const stream = new DataStream(data);
        expect(stream.readUint16()).toBe(0x1234);
    });

    it('should read uint32 little endian', () => {
        const data = new Uint8Array([0x78, 0x56, 0x34, 0x12]);
        const stream = new DataStream(data);
        expect(stream.readUint32()).toBe(0x12345678);
    });

    it('should read varuint', () => {
        // Single byte
        const data1 = new Uint8Array([0x42]);
        const stream1 = new DataStream(data1);
        expect(stream1.readVaruint()).toBe(0x42);

        // Multi-byte: 300 = 0b100101100 = [0xAC, 0x02]
        const data2 = new Uint8Array([0xAC, 0x02]);
        const stream2 = new DataStream(data2);
        expect(stream2.readVaruint()).toBe(300);
    });

    it('should read CrdtId', () => {
        // part1 = 1, part2 = 42
        const data = new Uint8Array([0x01, 0x2A]);
        const stream = new DataStream(data);
        const id = stream.readCrdtId();
        expect(id.part1).toBe(1);
        expect(id.part2).toBe(42);
    });

    it('should read float32', () => {
        const buffer = new ArrayBuffer(4);
        const view = new DataView(buffer);
        view.setFloat32(0, 3.14, true); // little endian

        const stream = new DataStream(buffer);
        expect(stream.readFloat32()).toBeCloseTo(3.14, 2);
    });

    it('should read bool', () => {
        const stream1 = new DataStream(new Uint8Array([0x00]));
        expect(stream1.readBool()).toBe(false);

        const stream2 = new DataStream(new Uint8Array([0x01]));
        expect(stream2.readBool()).toBe(true);
    });
});

describe('DataStream - Writing', () => {
    it('should write and read uint8', () => {
        const stream = DataStream.forWriting();
        stream.writeUint8(0x42);

        const bytes = stream.getBytes();
        expect(bytes[0]).toBe(0x42);
    });

    it('should write and read uint16', () => {
        const stream = DataStream.forWriting();
        stream.writeUint16(0x1234);

        const bytes = stream.getBytes();
        expect(bytes[0]).toBe(0x34);
        expect(bytes[1]).toBe(0x12);
    });

    it('should write and read varuint', () => {
        const stream = DataStream.forWriting();
        stream.writeVaruint(300);

        const bytes = stream.getBytes();
        expect(bytes[0]).toBe(0xAC);
        expect(bytes[1]).toBe(0x02);

        // Read back
        const readStream = new DataStream(bytes);
        expect(readStream.readVaruint()).toBe(300);
    });

    it('should write and read CrdtId', () => {
        const stream = DataStream.forWriting();
        const original = createCrdtId(5, 1000);
        stream.writeCrdtId(original);

        const readStream = new DataStream(stream.getBytes());
        const read = readStream.readCrdtId();

        expect(crdtIdEquals(original, read)).toBe(true);
    });
});

describe('DataStream - Tags', () => {
    it('should write and read tag', () => {
        const stream = DataStream.forWriting();
        stream.writeTag(3, TagType.Byte4);

        const readStream = new DataStream(stream.getBytes());
        const [index, tagType] = readStream.readTag(3, TagType.Byte4);

        expect(index).toBe(3);
        expect(tagType).toBe(TagType.Byte4);
    });

    it('should check tag without advancing', () => {
        const stream = DataStream.forWriting();
        stream.writeTag(5, TagType.ID);

        const readStream = new DataStream(stream.getBytes());
        expect(readStream.checkTag(5, TagType.ID)).toBe(true);
        expect(readStream.checkTag(3, TagType.ID)).toBe(false);
        expect(readStream.tell()).toBe(0); // Should not have advanced
    });
});

describe('LwwValue', () => {
    it('should create LwwValue correctly', () => {
        const timestamp = createCrdtId(1, 100);
        const lww = createLwwValue(timestamp, 'hello');

        expect(lww.timestamp).toBe(timestamp);
        expect(lww.value).toBe('hello');
    });
});
