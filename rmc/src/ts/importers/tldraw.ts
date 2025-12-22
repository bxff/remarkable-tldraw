/**
 * TLDraw importer - converts tldraw JSON to reMarkable .rm format.
 * 
 * This module provides functions to parse tldraw documents and convert
 * draw shapes, highlight shapes, and text shapes to rm format.
 * 
 * @module tldraw-importer
 */

import {
    SceneTree,
    CrdtId,
    Line,
    Group,
    Text,
    GlyphRange,
    Point,
    PenColor,
    Pen,
    createLine,
    createPoint,
    createGlyphRange,
    createRectangle,
    createCrdtId,
    crdtIdToString,
} from '../../../../rmscene/src/ts/index.ts';
import { CrdtSequenceItem } from '../../../../rmscene/src/ts/crdt-sequence.ts';

// ============================================================
// b64Vecs decoding (from tlschema/src/misc/b64Vecs.ts)
// ============================================================

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = new Uint8Array(128);
for (let i = 0; i < 64; i++) {
    B64_LOOKUP[BASE64_CHARS.charCodeAt(i)] = i;
}

// Precomputed powers of 2 for Float16 exponents
const POW2 = new Float64Array(31);
for (let i = 0; i < 31; i++) {
    POW2[i] = Math.pow(2, i - 15);
}
const POW2_SUBNORMAL = Math.pow(2, -14) / 1024;

// Precomputed mantissa values
const MANTISSA = new Float64Array(1024);
for (let i = 0; i < 1024; i++) {
    MANTISSA[i] = 1 + i / 1024;
}

/** Convert Float16 bits to number */
function float16BitsToNumber(bits: number): number {
    const sign = bits >> 15;
    const exp = (bits >> 10) & 0x1f;
    const frac = bits & 0x3ff;

    if (exp === 0) {
        return sign ? -frac * POW2_SUBNORMAL : frac * POW2_SUBNORMAL;
    }
    if (exp === 31) {
        return frac ? NaN : sign ? -Infinity : Infinity;
    }
    const magnitude = POW2[exp] * MANTISSA[frac];
    return sign ? -magnitude : magnitude;
}

/** Convert base64 to Uint16Array */
function base64ToUint16Array(base64: string): Uint16Array {
    const numBytes = Math.floor((base64.length * 3) / 4);
    const bytes = new Uint8Array(numBytes);
    let byteIndex = 0;

    for (let i = 0; i < base64.length; i += 4) {
        const c0 = B64_LOOKUP[base64.charCodeAt(i)];
        const c1 = B64_LOOKUP[base64.charCodeAt(i + 1)];
        const c2 = B64_LOOKUP[base64.charCodeAt(i + 2)];
        const c3 = B64_LOOKUP[base64.charCodeAt(i + 3)];

        const bitmap = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;

        bytes[byteIndex++] = (bitmap >> 16) & 255;
        bytes[byteIndex++] = (bitmap >> 8) & 255;
        bytes[byteIndex++] = bitmap & 255;
    }

    return new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
}

interface VecModel {
    x: number;
    y: number;
    z?: number;
}

/** Decode base64-encoded points to VecModel array */
function decodePoints(base64: string): VecModel[] {
    const uint16s = base64ToUint16Array(base64);
    const result: VecModel[] = [];
    for (let i = 0; i < uint16s.length; i += 3) {
        result.push({
            x: float16BitsToNumber(uint16s[i]),
            y: float16BitsToNumber(uint16s[i + 1]),
            z: float16BitsToNumber(uint16s[i + 2]),
        });
    }
    return result;
}

// ============================================================
// Coordinate transformation (inverse of exporter)
// ============================================================

const SCALE_FACTOR = 2.0;
const X_OFFSET = 100;
const Y_OFFSET = 100;

/** Transform tldraw coordinates to rm coordinates */
function transformToRm(x: number, y: number): [number, number] {
    return [
        (x - X_OFFSET) / SCALE_FACTOR,
        (y - Y_OFFSET) / SCALE_FACTOR,
    ];
}

// ============================================================
// Color mapping (inverse of exporter)
// ============================================================

const TLDRAW_COLOR_TO_PEN_COLOR: Record<string, PenColor> = {
    'black': PenColor.BLACK,
    'grey': PenColor.GRAY,
    'white': PenColor.WHITE,
    'yellow': PenColor.YELLOW,
    'green': PenColor.GREEN,
    'red': PenColor.RED,
    'blue': PenColor.BLUE,
    'violet': PenColor.MAGENTA,
    'light-green': PenColor.GREEN_2,
    'light-blue': PenColor.CYAN,
};

/** Convert tldraw color to rm PenColor */
function tldrawColorToPenColor(color: string): PenColor {
    return TLDRAW_COLOR_TO_PEN_COLOR[color] ?? PenColor.BLACK;
}

/** Convert tldraw size to rm thickness */
function tldrawSizeToThickness(size: string): number {
    switch (size) {
        case 's': return 1.0;
        case 'm': return 2.0;
        case 'l': return 3.0;
        case 'xl': return 4.0;
        default: return 2.0;
    }
}

// ============================================================
// TLDraw document types
// ============================================================

interface TLDrawDocument {
    tldrawFileFormatVersion: number;
    schema: {
        schemaVersion: number;
        sequences: Record<string, number>;
    };
    records: TLRecord[];
}

interface TLRecord {
    id: string;
    typeName: string;
    [key: string]: any;
}

interface TLShape extends TLRecord {
    typeName: 'shape';
    type: string;
    x: number;
    y: number;
    props: Record<string, any>;
}

interface TLDrawShapeSegment {
    type: 'free' | 'straight';
    points: string; // base64 encoded
}

// ============================================================
// Shape conversion
// ============================================================

let idCounter = 0;

function generateItemId(): CrdtId {
    idCounter++;
    return createCrdtId(1, idCounter);
}

export function resetIdCounter(): void {
    idCounter = 0;
}

/** Convert tldraw draw shape to rm Line */
function drawShapeToLine(shape: TLShape): Line | null {
    const props = shape.props;
    if (!props.segments || !Array.isArray(props.segments)) {
        return null;
    }

    const allPoints: Point[] = [];

    for (const segment of props.segments as TLDrawShapeSegment[]) {
        if (!segment.points) continue;

        const vecPoints = decodePoints(segment.points);

        for (const vec of vecPoints) {
            // Transform from relative to absolute coordinates
            const [rmX, rmY] = transformToRm(shape.x + vec.x, shape.y + vec.y);
            const pressure = (vec.z ?? 0.5) * 255;

            allPoints.push(createPoint(
                rmX,
                rmY,
                100, // speed (default)
                0,   // direction (default)
                100, // width (default)
                pressure
            ));
        }
    }

    if (allPoints.length === 0) {
        return null;
    }

    const color = tldrawColorToPenColor(props.color ?? 'black');
    const thickness = tldrawSizeToThickness(props.size ?? 'm');
    const tool = shape.type === 'highlight' ? Pen.HIGHLIGHTER_1 : Pen.BALLPOINT_1;

    return createLine(color, tool, allPoints, thickness, 0, null);
}

/** Convert tldraw highlight shape to rm GlyphRange */
function highlightShapeToGlyphRange(shape: TLShape): GlyphRange | null {
    const props = shape.props;
    if (!props.segments || !Array.isArray(props.segments)) {
        return null;
    }

    const rectangles: { x: number; y: number; w: number; h: number }[] = [];

    for (const segment of props.segments as TLDrawShapeSegment[]) {
        if (!segment.points) continue;

        const vecPoints = decodePoints(segment.points);
        if (vecPoints.length < 2) continue;

        // Calculate bounding box for highlight rectangle
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        for (const vec of vecPoints) {
            const [rmX, rmY] = transformToRm(shape.x + vec.x, shape.y + vec.y);
            minX = Math.min(minX, rmX);
            minY = Math.min(minY, rmY);
            maxX = Math.max(maxX, rmX);
            maxY = Math.max(maxY, rmY);
        }

        if (minX !== Infinity) {
            rectangles.push(createRectangle(minX, minY, maxX - minX, maxY - minY));
        }
    }

    if (rectangles.length === 0) {
        return null;
    }

    const color = tldrawColorToPenColor(props.color ?? 'yellow');

    return createGlyphRange(null, 0, '', color, rectangles);
}

// ============================================================
// Public API
// ============================================================

/** Parse tldraw JSON string to document */
export function parseTldrawJson(json: string): TLDrawDocument {
    return JSON.parse(json);
}

/** Convert tldraw document to list of rm scene items */
export function tldrawToSceneItems(doc: TLDrawDocument): { lines: Line[]; glyphs: GlyphRange[] } {
    resetIdCounter();

    const lines: Line[] = [];
    const glyphs: GlyphRange[] = [];

    for (const record of doc.records) {
        if (record.typeName !== 'shape') continue;

        const shape = record as TLShape;

        if (shape.type === 'draw') {
            const line = drawShapeToLine(shape);
            if (line) {
                lines.push(line);
            }
        } else if (shape.type === 'highlight') {
            // Highlights could be strokes or glyph ranges depending on source
            // Try as glyph first
            const glyph = highlightShapeToGlyphRange(shape);
            if (glyph) {
                glyphs.push(glyph);
            } else {
                // Fall back to line
                const line = drawShapeToLine(shape);
                if (line) {
                    lines.push(line);
                }
            }
        }
    }

    return { lines, glyphs };
}

/** Convert tldraw JSON to CrdtSequenceItems for building scene tree */
export function tldrawJsonToSceneItems(json: string): { lines: Line[]; glyphs: GlyphRange[] } {
    const doc = parseTldrawJson(json);
    return tldrawToSceneItems(doc);
}

/**
 * Create CrdtSequenceItems from tldraw document for adding to a SceneTree.
 * 
 * Usage:
 * ```typescript
 * const items = createItemsFromTldraw(json);
 * const tree = new SceneTree();
 * for (const item of items) {
 *   tree.addItem(item, rootId);
 * }
 * ```
 */
export function createItemsFromTldraw(json: string): CrdtSequenceItem<Line | GlyphRange>[] {
    resetIdCounter();
    const { lines, glyphs } = tldrawJsonToSceneItems(json);

    const items: CrdtSequenceItem<Line | GlyphRange>[] = [];

    const END_MARKER = createCrdtId(0, 0);
    let prevId = END_MARKER;

    for (const line of lines) {
        const itemId = generateItemId();
        items.push({
            itemId,
            leftId: prevId,
            rightId: END_MARKER,
            deletedLength: 0,
            value: line,
        });
        prevId = itemId;
    }

    for (const glyph of glyphs) {
        const itemId = generateItemId();
        items.push({
            itemId,
            leftId: prevId,
            rightId: END_MARKER,
            deletedLength: 0,
            value: glyph,
        });
        prevId = itemId;
    }

    return items;
}
