/**
 * TLDraw exporter for reMarkable scene data.
 * 
 * Full TypeScript implementation with proper tlschema integration.
 * @module tldraw
 */

import {
    SceneTree,
    CrdtId,
    Line,
    Group,
    Text,
    GlyphRange,
    SceneItem,
    Point,
    isLine,
    isGroup,
    isGlyphRange,
    PenColor,
    Pen,
    ParagraphStyle,
    crdtIdToString,
    readTree,
} from '../../../../rmscene/src/ts/index.ts';
import { buildAnchorPos } from './svg.ts';
import { RM_PALETTE, HIGHLIGHT_COLORS } from './writing-tools.ts';

// ============================================================
// Types from tldraw (using local definitions for now)
// These match the types from @tldraw/tlschema
// ============================================================

/** Vector model for point coordinates */
interface VecModel {
    x: number;
    y: number;
    z?: number;
}

/** Draw shape segment */
interface TLDrawShapeSegment {
    type: 'free' | 'straight';
    points: string; // base64 encoded points
}

// ============================================================
// b64Vecs implementation (from tlschema/src/misc/b64Vecs.ts)
// ============================================================

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function numberToFloat16Bits(value: number): number {
    if (value === 0) return Object.is(value, -0) ? 0x8000 : 0;
    if (!Number.isFinite(value)) {
        if (Number.isNaN(value)) return 0x7e00;
        return value > 0 ? 0x7c00 : 0xfc00;
    }

    const sign = value < 0 ? 1 : 0;
    value = Math.abs(value);

    const exp = Math.floor(Math.log2(value));
    let expBiased = exp + 15;

    if (expBiased >= 31) return (sign << 15) | 0x7c00;
    if (expBiased <= 0) {
        const frac = Math.round(value * Math.pow(2, 14) * 1024);
        return (sign << 15) | (frac & 0x3ff);
    }

    const mantissa = value / Math.pow(2, exp) - 1;
    let frac = Math.round(mantissa * 1024);

    if (frac >= 1024) {
        frac = 0;
        expBiased++;
        if (expBiased >= 31) return (sign << 15) | 0x7c00;
    }

    return (sign << 15) | (expBiased << 10) | frac;
}

function uint16ArrayToBase64(uint16Array: Uint16Array): string {
    const uint8Array = new Uint8Array(uint16Array.buffer, uint16Array.byteOffset, uint16Array.byteLength);
    let result = '';

    for (let i = 0; i < uint8Array.length; i += 3) {
        const byte1 = uint8Array[i];
        const byte2 = uint8Array[i + 1] ?? 0;
        const byte3 = uint8Array[i + 2] ?? 0;

        const bitmap = (byte1 << 16) | (byte2 << 8) | byte3;
        result +=
            BASE64_CHARS[(bitmap >> 18) & 63] +
            BASE64_CHARS[(bitmap >> 12) & 63] +
            BASE64_CHARS[(bitmap >> 6) & 63] +
            BASE64_CHARS[bitmap & 63];
    }

    return result;
}

/** Encode points to base64 format */
function encodePoints(points: VecModel[]): string {
    const uint16s = new Uint16Array(points.length * 3);
    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        uint16s[i * 3] = numberToFloat16Bits(p.x);
        uint16s[i * 3 + 1] = numberToFloat16Bits(p.y);
        uint16s[i * 3 + 2] = numberToFloat16Bits(p.z ?? 0.5);
    }
    return uint16ArrayToBase64(uint16s);
}

// ============================================================
// IndexKey generation - using proper fractional indexing
// ============================================================

import {
    IndexKey,
    ZERO_INDEX_KEY,
    getIndexAbove,
    getIndicesAbove,
} from '../utils/reordering.ts';

export { IndexKey, ZERO_INDEX_KEY };

let lastIndex: IndexKey | null = null;

/** Get the next index key */
function getNextIndex(): IndexKey {
    lastIndex = getIndexAbove(lastIndex);
    return lastIndex;
}

/** Reset index counter */
export function resetIndexCounter(): void {
    lastIndex = null;
}

/** Get multiple indices at once */
function getIndices(count: number): IndexKey[] {
    return getIndicesAbove(lastIndex, count);
}

// ============================================================
// Coordinate transformation
// ============================================================

/** Scale factor for coordinates */
const SCALE_FACTOR = 2.0;

/** X offset for centering content */
const X_OFFSET = 100;

/** Y offset for centering content */
const Y_OFFSET = 100;

/** Transform rm coordinates to tldraw coordinates */
function transformCoordinates(x: number, y: number): [number, number] {
    return [
        x * SCALE_FACTOR + X_OFFSET,
        y * SCALE_FACTOR + Y_OFFSET,
    ];
}

// ============================================================
// Color mapping (matches Python COLOR_MAP)
// ============================================================

function penColorToTldrawColor(color: PenColor): string {
    const colorMap: Record<number, string> = {
        [PenColor.BLACK]: 'black',
        [PenColor.GRAY]: 'grey',
        [PenColor.WHITE]: 'white',
        [PenColor.YELLOW]: 'yellow',
        [PenColor.GREEN]: 'green',
        [PenColor.PINK]: 'red',
        [PenColor.BLUE]: 'blue',
        [PenColor.RED]: 'red',
        [PenColor.GRAY_OVERLAP]: 'grey',
        [PenColor.HIGHLIGHT]: 'yellow',
        [PenColor.GREEN_2]: 'light-green',
        [PenColor.CYAN]: 'light-blue',
        [PenColor.MAGENTA]: 'violet',
        [PenColor.YELLOW_2]: 'yellow',
    };
    return colorMap[color] ?? 'black';
}

/** Map line thickness to tldraw size */
function thicknessToTldrawSize(thickness: number): 's' | 'm' | 'l' | 'xl' {
    if (thickness < 1.5) return 's';
    if (thickness < 2.5) return 'm';
    if (thickness < 3.5) return 'l';
    return 'xl';
}

// ============================================================
// ID generation
// ============================================================

function generateShapeId(): string {
    const randomPart = Math.random().toString(36).substring(2, 18);
    return `shape:${randomPart}`;
}

// ============================================================
// TLDraw document structure
// ============================================================

interface TLDrawDocument {
    tldrawFileFormatVersion: number;
    schema: {
        schemaVersion: number;
        sequences: Record<string, number>;
    };
    records: any[];
}

/** Create base tldraw document structure */
function createTldrawDocument(): TLDrawDocument {
    return {
        tldrawFileFormatVersion: 1,
        schema: {
            schemaVersion: 2,
            sequences: {
                'com.tldraw.store': 5,
                'com.tldraw.asset': 1,
                'com.tldraw.camera': 1,
                'com.tldraw.document': 2,
                'com.tldraw.instance': 25,
                'com.tldraw.instance_page_state': 5,
                'com.tldraw.page': 1,
                'com.tldraw.instance_presence': 6,
                'com.tldraw.pointer': 1,
                'com.tldraw.shape': 4,
                'com.tldraw.shape.group': 0,
                'com.tldraw.shape.text': 3,
                'com.tldraw.shape.draw': 2,
                'com.tldraw.shape.highlight': 1,
            },
        },
        records: [],
    };
}

/** Create default records for a tldraw document */
function createDefaultRecords(): any[] {
    return [
        {
            gridSize: 10,
            name: '',
            meta: {},
            id: 'document:document',
            typeName: 'document',
        },
        {
            id: 'pointer:pointer',
            typeName: 'pointer',
            x: 0,
            y: 0,
            lastActivityTimestamp: Date.now(),
            meta: {},
        },
        {
            meta: {},
            id: 'page:page',
            name: 'Page 1',
            index: ZERO_INDEX_KEY,
            typeName: 'page',
        },
    ];
}

// ============================================================
// Shape creation
// ============================================================

/** Convert rm Line to tldraw draw shape */
function lineToDrawShape(
    line: Line,
    parentId: string,
    index: IndexKey
): any {
    // Calculate bounding box
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const p of line.points) {
        const [x, y] = transformCoordinates(p.x, p.y);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
    }

    // Create normalized points with pressure as z
    const normalizedPoints: VecModel[] = [];
    for (const p of line.points) {
        const [x, y] = transformCoordinates(p.x, p.y);
        normalizedPoints.push({
            x: x - minX,
            y: y - minY,
            z: p.pressure / 255, // Normalize pressure to 0-1
        });
    }

    const isHighlighter = line.tool === Pen.HIGHLIGHTER_1 || line.tool === Pen.HIGHLIGHTER_2;
    const shapeType = isHighlighter ? 'highlight' : 'draw';

    return {
        x: minX,
        y: minY,
        rotation: 0,
        isLocked: false,
        opacity: 1,
        meta: {},
        id: generateShapeId(),
        type: shapeType,
        parentId,
        index,
        typeName: 'shape',
        props: {
            color: penColorToTldrawColor(line.color),
            fill: 'none',
            dash: 'solid',
            size: thicknessToTldrawSize(line.thicknessScale),
            segments: [
                {
                    type: 'free',
                    points: encodePoints(normalizedPoints),
                },
            ],
            isComplete: true,
            isClosed: false,
            isPen: true,
            scale: 1,
        },
    };
}

/** Convert rm GlyphRange to tldraw highlight shapes */
function glyphRangeToHighlightShapes(
    glyph: GlyphRange,
    parentId: string,
    indices: IndexKey[]
): any[] {
    const shapes: any[] = [];

    for (let i = 0; i < glyph.rectangles.length; i++) {
        const rect = glyph.rectangles[i];
        const [x, y] = transformCoordinates(rect.x, rect.y);
        const w = rect.w * SCALE_FACTOR;
        const h = rect.h * SCALE_FACTOR;

        // Create a simple rectangular highlight as stroke
        const points: VecModel[] = [
            { x: 0, y: h / 2, z: 0.5 },
            { x: w, y: h / 2, z: 0.5 },
        ];

        shapes.push({
            x,
            y,
            rotation: 0,
            isLocked: false,
            opacity: 1,
            meta: {},
            id: generateShapeId(),
            type: 'highlight',
            parentId,
            index: indices[i] ?? getNextIndex(),
            typeName: 'shape',
            props: {
                color: penColorToTldrawColor(glyph.color),
                size: 'xl',
                segments: [
                    {
                        type: 'straight',
                        points: encodePoints(points),
                    },
                ],
                isComplete: true,
                isClosed: false,
                isPen: false,
                scale: 1,
            },
        });
    }

    return shapes;
}

/** Convert rm Text to tldraw text shape */
function textToTextShape(
    text: Text,
    parentId: string,
    index: IndexKey
): any {
    // Collect all text content
    let textContent = '';
    for (const value of text.items.values()) {
        if (typeof value === 'string') {
            textContent += value;
        }
    }

    if (!textContent.trim()) {
        return null;
    }

    const [x, y] = transformCoordinates(text.posX, text.posY);

    return {
        x,
        y,
        rotation: 0,
        isLocked: false,
        opacity: 1,
        meta: {},
        id: generateShapeId(),
        type: 'text',
        parentId,
        index,
        typeName: 'shape',
        props: {
            color: 'black',
            size: 'm',
            w: text.width * SCALE_FACTOR,
            text: textContent,
            font: 'draw',
            textAlign: 'start',
            autoSize: true,
            scale: 1,
        },
    };
}

// ============================================================
// Tree traversal
// ============================================================

/** Process group and add shapes to records */
function processGroup(
    group: Group,
    parentId: string,
    records: any[],
    tree: SceneTree
): void {
    // Calculate anchor offset
    let offsetY = 0;
    if (group.anchorId?.value) {
        // Could use anchor position from root text if needed
    }

    for (const [id, item] of group.children.entries()) {
        if (isLine(item)) {
            records.push(lineToDrawShape(item, parentId, getNextIndex()));
        } else if (isGlyphRange(item)) {
            const indices = getIndices(item.rectangles.length);
            records.push(...glyphRangeToHighlightShapes(item, parentId, indices));
        } else if (isGroup(item)) {
            processGroup(item, parentId, records, tree);
        }
    }
}

// ============================================================
// Public API
// ============================================================

/** Convert scene tree to tldraw JSON document */
export function treeToTldraw(tree: SceneTree): TLDrawDocument {
    resetIndexCounter();
    const doc = createTldrawDocument();
    doc.records = createDefaultRecords();

    const pageId = 'page:page';

    // Add root text as TLTextShape if present
    if (tree.rootText) {
        const textShape = textToTextShape(tree.rootText, pageId, getNextIndex());
        if (textShape) {
            doc.records.push(textShape);
        }
    }

    // Process strokes and highlights
    processGroup(tree.root, pageId, doc.records, tree);

    return doc;
}

/** Convert scene tree to tldraw JSON string */
export function treeToTldrawJson(tree: SceneTree): string {
    return JSON.stringify(treeToTldraw(tree), null, 2);
}

/** Convert rm file data to tldraw JSON */
export function rmToTldraw(data: ArrayBuffer | Uint8Array): TLDrawDocument {
    const tree = readTree(data);
    return treeToTldraw(tree);
}

/** Convert rm file data to tldraw JSON string */
export function rmToTldrawJson(data: ArrayBuffer | Uint8Array): string {
    return JSON.stringify(rmToTldraw(data), null, 2);
}
