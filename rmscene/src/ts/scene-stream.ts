/**
 * Read structure of reMarkable tablet lines format v6
 * 
 * TypeScript port of rmscene/src/rmscene/scene_stream.py
 * @module scene-stream
 */

import { CrdtId, LwwValue, createCrdtId, createLwwValue, crdtIdEquals, crdtIdToString } from './tagged-block-common';
import { TaggedBlockReader, MainBlockInfo } from './tagged-block-reader';
import { TaggedBlockWriter } from './tagged-block-writer';
import { CrdtSequence, CrdtSequenceItem, createCrdtSequenceItem } from './crdt-sequence';
import {
    Group, Line, Point, Text, GlyphRange, SceneItem,
    PenColor, Pen, ParagraphStyle, Rectangle,
    createGroup, createLine, createPoint, createText, createGlyphRange, createRectangle,
    isGroup, isLine,
} from './scene-items';

// ============================================================
// Block types
// ============================================================

export const BlockType = {
    MigrationInfo: 0x00,
    SceneTree: 0x01,
    TreeNode: 0x02,
    SceneGlyphItem: 0x03,
    SceneGroupItem: 0x04,
    SceneLineItem: 0x05,
    SceneTextItem: 0x06,
    RootText: 0x07,
    SceneTombstoneItem: 0x08,
    AuthorIds: 0x09,
    PageInfo: 0x0A,
    SceneInfo: 0x0D,
} as const;

/** Base block interface */
export interface Block {
    readonly blockType: number;
    extraData: Uint8Array;
}

/** Unreadable block for error handling */
export interface UnreadableBlock extends Block {
    readonly blockType: number;
    error: string;
    data: Uint8Array;
    info: MainBlockInfo;
}

export function createUnreadableBlock(error: string, data: Uint8Array, info: MainBlockInfo): UnreadableBlock {
    return {
        blockType: info.blockType,
        extraData: new Uint8Array(0),
        error,
        data,
        info,
    };
}

/** Author IDs block */
export interface AuthorIdsBlock extends Block {
    readonly blockType: typeof BlockType.AuthorIds;
    authorUuids: Map<number, string>;
}

export function createAuthorIdsBlock(authorUuids: Map<number, string>): AuthorIdsBlock {
    return {
        blockType: BlockType.AuthorIds,
        extraData: new Uint8Array(0),
        authorUuids,
    };
}

/** Migration info block */
export interface MigrationInfoBlock extends Block {
    readonly blockType: typeof BlockType.MigrationInfo;
    migrationId: CrdtId;
    isDevice: boolean;
    unknown: boolean;
}

export function createMigrationInfoBlock(migrationId: CrdtId, isDevice: boolean, unknown = false): MigrationInfoBlock {
    return {
        blockType: BlockType.MigrationInfo,
        extraData: new Uint8Array(0),
        migrationId,
        isDevice,
        unknown,
    };
}

/** Page info block */
export interface PageInfoBlock extends Block {
    readonly blockType: typeof BlockType.PageInfo;
    loadsCount: number;
    mergesCount: number;
    textCharsCount: number;
    textLinesCount: number;
    typeFolioUseCount: number;
}

export function createPageInfoBlock(
    loadsCount: number,
    mergesCount: number,
    textCharsCount: number,
    textLinesCount: number,
    typeFolioUseCount = 0
): PageInfoBlock {
    return {
        blockType: BlockType.PageInfo,
        extraData: new Uint8Array(0),
        loadsCount,
        mergesCount,
        textCharsCount,
        textLinesCount,
        typeFolioUseCount,
    };
}

/** Scene tree block */
export interface SceneTreeBlock extends Block {
    readonly blockType: typeof BlockType.SceneTree;
    treeId: CrdtId;
    nodeId: CrdtId;
    isUpdate: boolean;
    parentId: CrdtId;
}

export function createSceneTreeBlock(
    treeId: CrdtId,
    nodeId: CrdtId,
    isUpdate: boolean,
    parentId: CrdtId
): SceneTreeBlock {
    return {
        blockType: BlockType.SceneTree,
        extraData: new Uint8Array(0),
        treeId,
        nodeId,
        isUpdate,
        parentId,
    };
}

/** Tree node block */
export interface TreeNodeBlock extends Block {
    readonly blockType: typeof BlockType.TreeNode;
    group: Group;
}

export function createTreeNodeBlock(group: Group): TreeNodeBlock {
    return {
        blockType: BlockType.TreeNode,
        extraData: new Uint8Array(0),
        group,
    };
}

/** Scene info block */
export interface SceneInfoBlock extends Block {
    readonly blockType: typeof BlockType.SceneInfo;
    currentLayer: LwwValue<CrdtId>;
    backgroundVisible: LwwValue<boolean> | null;
    rootDocumentVisible: LwwValue<boolean> | null;
    paperSize: [number, number] | null;
}

export function createSceneInfoBlock(
    currentLayer: LwwValue<CrdtId>,
    backgroundVisible: LwwValue<boolean> | null = null,
    rootDocumentVisible: LwwValue<boolean> | null = null,
    paperSize: [number, number] | null = null
): SceneInfoBlock {
    return {
        blockType: BlockType.SceneInfo,
        extraData: new Uint8Array(0),
        currentLayer,
        backgroundVisible,
        rootDocumentVisible,
        paperSize,
    };
}

/** Base scene item block */
export interface SceneItemBlock extends Block {
    parentId: CrdtId;
    item: CrdtSequenceItem<any>;
    extraValueData: Uint8Array;
}

/** Scene line item block */
export interface SceneLineItemBlock extends SceneItemBlock {
    readonly blockType: typeof BlockType.SceneLineItem;
    item: CrdtSequenceItem<Line>;
}

export function createSceneLineItemBlock(parentId: CrdtId, item: CrdtSequenceItem<Line>): SceneLineItemBlock {
    return {
        blockType: BlockType.SceneLineItem,
        extraData: new Uint8Array(0),
        parentId,
        item,
        extraValueData: new Uint8Array(0),
    };
}

/** Scene group item block */
export interface SceneGroupItemBlock extends SceneItemBlock {
    readonly blockType: typeof BlockType.SceneGroupItem;
    item: CrdtSequenceItem<CrdtId>;
}

export function createSceneGroupItemBlock(parentId: CrdtId, item: CrdtSequenceItem<CrdtId>): SceneGroupItemBlock {
    return {
        blockType: BlockType.SceneGroupItem,
        extraData: new Uint8Array(0),
        parentId,
        item,
        extraValueData: new Uint8Array(0),
    };
}

/** Scene glyph item block (highlights) */
export interface SceneGlyphItemBlock extends SceneItemBlock {
    readonly blockType: typeof BlockType.SceneGlyphItem;
    item: CrdtSequenceItem<GlyphRange>;
}

export function createSceneGlyphItemBlock(parentId: CrdtId, item: CrdtSequenceItem<GlyphRange>): SceneGlyphItemBlock {
    return {
        blockType: BlockType.SceneGlyphItem,
        extraData: new Uint8Array(0),
        parentId,
        item,
        extraValueData: new Uint8Array(0),
    };
}

/** Root text block */
export interface RootTextBlock extends Block {
    readonly blockType: typeof BlockType.RootText;
    blockId: CrdtId;
    value: Text;
}

export function createRootTextBlock(blockId: CrdtId, value: Text): RootTextBlock {
    return {
        blockType: BlockType.RootText,
        extraData: new Uint8Array(0),
        blockId,
        value,
    };
}

// ============================================================
// Point/Line reading helpers
// ============================================================

function pointSerializedSize(version: number): number {
    return version === 1 ? 0x18 : 0x0E;
}

function readPoint(reader: TaggedBlockReader, version: number = 2): Point {
    const x = reader.data.readFloat32();
    const y = reader.data.readFloat32();

    let speed: number, direction: number, width: number, pressure: number;

    if (version === 1) {
        speed = reader.data.readFloat32() * 4;
        direction = 255 * reader.data.readFloat32() / (Math.PI * 2);
        width = Math.round(reader.data.readFloat32() * 4);
        pressure = reader.data.readFloat32() * 255;
    } else {
        speed = reader.data.readUint16();
        width = reader.data.readUint16();
        direction = reader.data.readUint8();
        pressure = reader.data.readUint8();
    }

    return createPoint(x, y, speed, direction, width, pressure);
}

function writePoint(writer: TaggedBlockWriter, point: Point, version: number = 2): void {
    writer.data.writeFloat32(point.x);
    writer.data.writeFloat32(point.y);

    if (version === 1) {
        writer.data.writeFloat32(point.speed / 4);
        writer.data.writeFloat32(point.direction * (2 * Math.PI) / 255);
        writer.data.writeFloat32(point.width / 4);
        writer.data.writeFloat32(point.pressure / 255);
    } else {
        writer.data.writeUint16(point.speed);
        writer.data.writeUint16(point.width);
        writer.data.writeUint8(point.direction);
        writer.data.writeUint8(point.pressure);
    }
}

function readLine(reader: TaggedBlockReader, version: number = 2): Line {
    const toolId = reader.readInt(1);
    const colorId = reader.readInt(2);
    const thicknessScale = reader.readDouble(3);
    const startingLength = reader.readFloat(4);

    const subblock = reader.readSubblock(5);
    const pointSize = pointSerializedSize(version);
    const numPoints = Math.floor(subblock.size / pointSize);
    const points: Point[] = [];
    for (let i = 0; i < numPoints; i++) {
        points.push(readPoint(reader, version));
    }
    reader.endSubblock(subblock);

    // Timestamp (unused)
    reader.readId(6);

    // Move ID (optional)
    let moveId: CrdtId | null = null;
    if (reader.bytesRemainingInBlock() >= 3) {
        moveId = reader.readIdOptional(7);
    }

    return createLine(colorId as PenColor, toolId as Pen, points, thicknessScale, startingLength, moveId);
}

function writeLine(writer: TaggedBlockWriter, line: Line, version: number = 2): void {
    writer.writeInt(1, line.tool);
    writer.writeInt(2, line.color);
    writer.writeDouble(3, line.thicknessScale);
    writer.writeFloat(4, line.startingLength);

    const endSubblock = writer.startSubblock(5);
    for (const point of line.points) {
        writePoint(writer, point, version);
    }
    endSubblock();

    // Timestamp
    writer.writeId(6, createCrdtId(0, 1));

    if (line.moveId !== null) {
        writer.writeId(7, line.moveId);
    }
}

// ============================================================
// GlyphRange reading helpers
// ============================================================

function readGlyphRange(reader: TaggedBlockReader): GlyphRange {
    const start = reader.readIntOptional(2);
    const length = reader.readIntOptional(3) ?? 0;
    const colorId = reader.readInt(4);
    const text = reader.readString(5);

    const subblock = reader.readSubblock(6);
    const numRects = reader.data.readVaruint();
    const rectangles: Rectangle[] = [];
    for (let i = 0; i < numRects; i++) {
        const x = reader.data.readFloat64();
        const y = reader.data.readFloat64();
        const w = reader.data.readFloat64();
        const h = reader.data.readFloat64();
        rectangles.push(createRectangle(x, y, w, h));
    }
    reader.endSubblock(subblock);

    return createGlyphRange(start, length || text.length, text, colorId as PenColor, rectangles);
}

function writeGlyphRange(writer: TaggedBlockWriter, glyph: GlyphRange): void {
    if (glyph.start !== null) {
        writer.writeInt(2, glyph.start);
        writer.writeInt(3, glyph.length);
    }
    writer.writeInt(4, glyph.color);
    writer.writeString(5, glyph.text);

    const endSubblock = writer.startSubblock(6);
    writer.data.writeVaruint(glyph.rectangles.length);
    for (const rect of glyph.rectangles) {
        writer.data.writeFloat64(rect.x);
        writer.data.writeFloat64(rect.y);
        writer.data.writeFloat64(rect.w);
        writer.data.writeFloat64(rect.h);
    }
    endSubblock();
}

// ============================================================
// Block reading
// ============================================================

export function readBlock(reader: TaggedBlockReader): Block | null {
    const blockInfo = reader.readBlock();
    if (!blockInfo) return null;

    try {
        let block: Block;

        switch (blockInfo.blockType) {
            case BlockType.AuthorIds:
                block = readAuthorIdsBlock(reader);
                break;
            case BlockType.MigrationInfo:
                block = readMigrationInfoBlock(reader);
                break;
            case BlockType.PageInfo:
                block = readPageInfoBlock(reader);
                break;
            case BlockType.SceneTree:
                block = readSceneTreeBlock(reader);
                break;
            case BlockType.TreeNode:
                block = readTreeNodeBlock(reader);
                break;
            case BlockType.SceneInfo:
                block = readSceneInfoBlock(reader);
                break;
            case BlockType.SceneLineItem:
                block = readSceneLineItemBlock(reader, blockInfo.currentVersion);
                break;
            case BlockType.SceneGroupItem:
                block = readSceneGroupItemBlock(reader);
                break;
            case BlockType.SceneGlyphItem:
                block = readSceneGlyphItemBlock(reader);
                break;
            case BlockType.SceneTombstoneItem:
                block = readSceneTombstoneItemBlock(reader);
                break;
            case BlockType.SceneTextItem:
                block = readSceneTextItemBlock(reader);
                break;
            case BlockType.RootText:
                block = readRootTextBlock(reader);
                break;
            default:
                // Unknown block type
                const remaining = reader.bytesRemainingInBlock();
                const data = reader.data.readBytes(remaining);
                reader.endBlock();
                return createUnreadableBlock(`Unknown block type ${blockInfo.blockType}`, data, blockInfo);
        }

        reader.endBlock();
        return block;
    } catch (e) {
        reader.data.seek(blockInfo.offset);
        const data = reader.data.readBytes(blockInfo.size);
        reader.endBlock();
        return createUnreadableBlock(String(e), data, blockInfo);
    }
}

function readAuthorIdsBlock(reader: TaggedBlockReader): AuthorIdsBlock {
    const numSubblocks = reader.data.readVaruint();
    const authorUuids = new Map<number, string>();

    for (let i = 0; i < numSubblocks; i++) {
        const subblock = reader.readSubblock(0);
        const uuidLength = reader.data.readVaruint();
        const uuidBytes = reader.data.readBytes(uuidLength);
        const authorId = reader.data.readUint16();

        // Convert bytes to UUID string (little-endian)
        const uuid = bytesToUuidLE(uuidBytes);
        authorUuids.set(authorId, uuid);
        reader.endSubblock(subblock);
    }

    return createAuthorIdsBlock(authorUuids);
}

function readMigrationInfoBlock(reader: TaggedBlockReader): MigrationInfoBlock {
    const migrationId = reader.readId(1);
    const isDevice = reader.readBool(2);
    let unknown = false;
    if (reader.bytesRemainingInBlock() > 0) {
        unknown = reader.readBoolOptional(3) ?? false;
    }
    return createMigrationInfoBlock(migrationId, isDevice, unknown);
}

function readPageInfoBlock(reader: TaggedBlockReader): PageInfoBlock {
    const loadsCount = reader.readInt(1);
    const mergesCount = reader.readInt(2);
    const textCharsCount = reader.readInt(3);
    const textLinesCount = reader.readInt(4);
    let typeFolioUseCount = 0;
    if (reader.bytesRemainingInBlock() > 0) {
        typeFolioUseCount = reader.readIntOptional(5) ?? 0;
    }
    return createPageInfoBlock(loadsCount, mergesCount, textCharsCount, textLinesCount, typeFolioUseCount);
}

function readSceneTreeBlock(reader: TaggedBlockReader): SceneTreeBlock {
    const treeId = reader.readId(1);
    const nodeId = reader.readId(2);
    const isUpdate = reader.readBool(3);
    const subblock = reader.readSubblock(4);
    const parentId = reader.readId(1);
    reader.endSubblock(subblock);
    return createSceneTreeBlock(treeId, nodeId, isUpdate, parentId);
}

function readTreeNodeBlock(reader: TaggedBlockReader): TreeNodeBlock {
    const nodeId = reader.readId(1);
    const label = reader.readLwwString(2);
    const visible = reader.readLwwBool(3);

    let anchorId: LwwValue<CrdtId> | null = null;
    let anchorType: LwwValue<number> | null = null;
    let anchorThreshold: LwwValue<number> | null = null;
    let anchorOriginX: LwwValue<number> | null = null;

    if (reader.bytesRemainingInBlock() > 0) {
        anchorId = reader.readLwwId(7);
        anchorType = reader.readLwwByte(8);
        anchorThreshold = reader.readLwwFloat(9);
        anchorOriginX = reader.readLwwFloat(10);
    }

    return createTreeNodeBlock(createGroup(nodeId, {
        label,
        visible,
        anchorId,
        anchorType,
        anchorThreshold,
        anchorOriginX,
    }));
}

function readSceneInfoBlock(reader: TaggedBlockReader): SceneInfoBlock {
    const currentLayer = reader.readLwwId(1);
    let backgroundVisible: LwwValue<boolean> | null = null;
    let rootDocumentVisible: LwwValue<boolean> | null = null;
    let paperSize: [number, number] | null = null;

    if (reader.bytesRemainingInBlock() > 0) {
        backgroundVisible = reader.readLwwBool(2);
    }
    if (reader.bytesRemainingInBlock() > 0) {
        rootDocumentVisible = reader.readLwwBool(3);
    }
    if (reader.bytesRemainingInBlock() > 0) {
        paperSize = reader.readIntPair(5);
    }

    return createSceneInfoBlock(currentLayer, backgroundVisible, rootDocumentVisible, paperSize);
}

function readSceneItemBlockCommon(reader: TaggedBlockReader): { parentId: CrdtId; itemId: CrdtId; leftId: CrdtId; rightId: CrdtId; deletedLength: number } {
    const parentId = reader.readId(1);
    const itemId = reader.readId(2);
    const leftId = reader.readId(3);
    const rightId = reader.readId(4);
    const deletedLength = reader.readInt(5);
    return { parentId, itemId, leftId, rightId, deletedLength };
}

function readSceneLineItemBlock(reader: TaggedBlockReader, version: number): SceneLineItemBlock {
    const { parentId, itemId, leftId, rightId, deletedLength } = readSceneItemBlockCommon(reader);

    let line: Line | null = null;
    if (reader.hasSubblock(6)) {
        const subblock = reader.readSubblock(6);
        const itemType = reader.data.readUint8();
        line = readLine(reader, version);
        reader.endSubblock(subblock);
    }

    return createSceneLineItemBlock(parentId, createCrdtSequenceItem(itemId, leftId, rightId, deletedLength, line!));
}

function readSceneGroupItemBlock(reader: TaggedBlockReader): SceneGroupItemBlock {
    const { parentId, itemId, leftId, rightId, deletedLength } = readSceneItemBlockCommon(reader);

    let value: CrdtId | null = null;
    if (reader.hasSubblock(6)) {
        const subblock = reader.readSubblock(6);
        const itemType = reader.data.readUint8();
        value = reader.readId(2);
        reader.endSubblock(subblock);
    }

    return createSceneGroupItemBlock(parentId, createCrdtSequenceItem(itemId, leftId, rightId, deletedLength, value!));
}

function readSceneGlyphItemBlock(reader: TaggedBlockReader): SceneGlyphItemBlock {
    const { parentId, itemId, leftId, rightId, deletedLength } = readSceneItemBlockCommon(reader);

    let glyph: GlyphRange | null = null;
    if (reader.hasSubblock(6)) {
        const subblock = reader.readSubblock(6);
        const itemType = reader.data.readUint8();
        glyph = readGlyphRange(reader);
        reader.endSubblock(subblock);
    }

    return createSceneGlyphItemBlock(parentId, createCrdtSequenceItem(itemId, leftId, rightId, deletedLength, glyph!));
}

/** Scene tombstone item block (deleted items) */
export interface SceneTombstoneItemBlock extends SceneItemBlock {
    readonly blockType: typeof BlockType.SceneTombstoneItem;
    item: CrdtSequenceItem<null>;
}

export function createSceneTombstoneItemBlock(parentId: CrdtId, item: CrdtSequenceItem<null>): SceneTombstoneItemBlock {
    return {
        blockType: BlockType.SceneTombstoneItem,
        extraData: new Uint8Array(0),
        parentId,
        item,
        extraValueData: new Uint8Array(0),
    };
}

function readSceneTombstoneItemBlock(reader: TaggedBlockReader): SceneTombstoneItemBlock {
    const { parentId, itemId, leftId, rightId, deletedLength } = readSceneItemBlockCommon(reader);

    // Tombstone blocks have no value
    if (reader.hasSubblock(6)) {
        const subblock = reader.readSubblock(6);
        reader.data.readUint8(); // item type
        reader.endSubblock(subblock);
    }

    return createSceneTombstoneItemBlock(parentId, createCrdtSequenceItem(itemId, leftId, rightId, deletedLength, null));
}

/** Scene text item block */
export interface SceneTextItemBlock extends SceneItemBlock {
    readonly blockType: typeof BlockType.SceneTextItem;
    item: CrdtSequenceItem<null>;
}

export function createSceneTextItemBlock(parentId: CrdtId, item: CrdtSequenceItem<null>): SceneTextItemBlock {
    return {
        blockType: BlockType.SceneTextItem,
        extraData: new Uint8Array(0),
        parentId,
        item,
        extraValueData: new Uint8Array(0),
    };
}

function readSceneTextItemBlock(reader: TaggedBlockReader): SceneTextItemBlock {
    const { parentId, itemId, leftId, rightId, deletedLength } = readSceneItemBlockCommon(reader);

    // SceneTextItem blocks typically have no value content
    if (reader.hasSubblock(6)) {
        const subblock = reader.readSubblock(6);
        reader.data.readUint8(); // item type
        reader.endSubblock(subblock);
    }

    return createSceneTextItemBlock(parentId, createCrdtSequenceItem(itemId, leftId, rightId, deletedLength, null));
}

function readRootTextBlock(reader: TaggedBlockReader): RootTextBlock {
    const blockId = reader.readId(1);

    const subblock2 = reader.readSubblock(2);

    // Text items
    const subblock21 = reader.readSubblock(1);
    const subblock211 = reader.readSubblock(1);
    const numTextItems = reader.data.readVaruint();
    const textItems: CrdtSequenceItem<string | number>[] = [];
    for (let i = 0; i < numTextItems; i++) {
        textItems.push(readTextItem(reader));
    }
    reader.endSubblock(subblock211);
    reader.endSubblock(subblock21);

    // Formatting
    const subblock22 = reader.readSubblock(2);
    const subblock221 = reader.readSubblock(1);
    const numFormats = reader.data.readVaruint();
    const styles = new Map<string, LwwValue<ParagraphStyle>>();
    for (let i = 0; i < numFormats; i++) {
        const [charId, format] = readTextFormat(reader);
        styles.set(crdtIdToString(charId), format);
    }
    reader.endSubblock(subblock221);
    reader.endSubblock(subblock22);

    reader.endSubblock(subblock2);

    // Position
    const subblock3 = reader.readSubblock(3);
    const posX = reader.data.readFloat64();
    const posY = reader.data.readFloat64();
    reader.endSubblock(subblock3);

    const width = reader.readFloat(4);

    return createRootTextBlock(blockId, createText(
        new CrdtSequence(textItems),
        styles,
        posX,
        posY,
        width
    ));
}

function readTextItem(reader: TaggedBlockReader): CrdtSequenceItem<string | number> {
    const subblock = reader.readSubblock(0);
    const itemId = reader.readId(2);
    const leftId = reader.readId(3);
    const rightId = reader.readId(4);
    const deletedLength = reader.readInt(5);

    let value: string | number = '';
    if (reader.hasSubblock(6)) {
        const [text, fmt] = reader.readStringWithFormat(6);
        value = fmt !== null ? fmt : text;
    }

    reader.endSubblock(subblock);
    return createCrdtSequenceItem(itemId, leftId, rightId, deletedLength, value);
}

function readTextFormat(reader: TaggedBlockReader): [CrdtId, LwwValue<ParagraphStyle>] {
    const charId = reader.data.readCrdtId();
    const timestamp = reader.readId(1);

    const subblock = reader.readSubblock(2);
    const c = reader.data.readUint8(); // Should be 17
    const formatCode = reader.data.readUint8();
    reader.endSubblock(subblock);

    return [charId, createLwwValue(timestamp, formatCode as ParagraphStyle)];
}

// ============================================================
// Utility functions
// ============================================================

function bytesToUuidLE(bytes: Uint8Array): string {
    const hex = (n: number) => n.toString(16).padStart(2, '0');
    // Little-endian format
    const parts = [
        hex(bytes[3]) + hex(bytes[2]) + hex(bytes[1]) + hex(bytes[0]),
        hex(bytes[5]) + hex(bytes[4]),
        hex(bytes[7]) + hex(bytes[6]),
        hex(bytes[8]) + hex(bytes[9]),
        hex(bytes[10]) + hex(bytes[11]) + hex(bytes[12]) + hex(bytes[13]) + hex(bytes[14]) + hex(bytes[15]),
    ];
    return parts.join('-');
}

// ============================================================
// High-level API
// ============================================================

/** Read all blocks from a binary buffer */
export function* readBlocks(data: ArrayBuffer | Uint8Array): Generator<Block> {
    const reader = new TaggedBlockReader(data);
    reader.readHeader();

    while (true) {
        const block = readBlock(reader);
        if (!block) break;
        yield block;
    }
}

/** Type guards */
export function isAuthorIdsBlock(block: Block): block is AuthorIdsBlock {
    return block.blockType === BlockType.AuthorIds;
}

export function isMigrationInfoBlock(block: Block): block is MigrationInfoBlock {
    return block.blockType === BlockType.MigrationInfo;
}

export function isPageInfoBlock(block: Block): block is PageInfoBlock {
    return block.blockType === BlockType.PageInfo;
}

export function isSceneTreeBlock(block: Block): block is SceneTreeBlock {
    return block.blockType === BlockType.SceneTree;
}

export function isTreeNodeBlock(block: Block): block is TreeNodeBlock {
    return block.blockType === BlockType.TreeNode;
}

export function isSceneInfoBlock(block: Block): block is SceneInfoBlock {
    return block.blockType === BlockType.SceneInfo;
}

export function isSceneLineItemBlock(block: Block): block is SceneLineItemBlock {
    return block.blockType === BlockType.SceneLineItem;
}

export function isSceneGroupItemBlock(block: Block): block is SceneGroupItemBlock {
    return block.blockType === BlockType.SceneGroupItem;
}

export function isSceneGlyphItemBlock(block: Block): block is SceneGlyphItemBlock {
    return block.blockType === BlockType.SceneGlyphItem;
}

export function isRootTextBlock(block: Block): block is RootTextBlock {
    return block.blockType === BlockType.RootText;
}

export function isUnreadableBlock(block: Block): block is UnreadableBlock {
    return 'error' in block;
}
