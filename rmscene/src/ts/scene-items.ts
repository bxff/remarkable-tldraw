/**
 * Data structures for the contents of a scene.
 * 
 * TypeScript port of rmscene/src/rmscene/scene_items.py
 * @module scene-items
 */

import { CrdtId, LwwValue } from './tagged-block-common';
import { CrdtSequence } from './crdt-sequence';

/** Color index value for pens */
export enum PenColor {
    BLACK = 0,
    GRAY = 1,
    WHITE = 2,
    YELLOW = 3,
    GREEN = 4,
    PINK = 5,
    BLUE = 6,
    RED = 7,
    GRAY_OVERLAP = 8,
    /** All highlight colors share the same value */
    HIGHLIGHT = 9,
    GREEN_2 = 10,
    CYAN = 11,
    MAGENTA = 12,
    YELLOW_2 = 13,
}

/** Stroke pen id representing reMarkable tablet tools */
export enum Pen {
    PAINTBRUSH_1 = 0,
    PENCIL_1 = 1,
    BALLPOINT_1 = 2,
    MARKER_1 = 3,
    FINELINER_1 = 4,
    HIGHLIGHTER_1 = 5,
    ERASER = 6,
    MECHANICAL_PENCIL_1 = 7,
    ERASER_AREA = 8,
    PAINTBRUSH_2 = 12,
    MECHANICAL_PENCIL_2 = 13,
    PENCIL_2 = 14,
    BALLPOINT_2 = 15,
    MARKER_2 = 16,
    FINELINER_2 = 17,
    HIGHLIGHTER_2 = 18,
    CALIGRAPHY = 21,
    SHADER = 23,
}

/** Check if a pen value is a highlighter */
export function isHighlighter(penValue: number): boolean {
    return penValue === Pen.HIGHLIGHTER_1 || penValue === Pen.HIGHLIGHTER_2;
}

/** Text paragraph style */
export enum ParagraphStyle {
    BASIC = 0,
    PLAIN = 1,
    HEADING = 2,
    BOLD = 3,
    BULLET = 4,
    BULLET2 = 5,
    CHECKBOX = 6,
    CHECKBOX_CHECKED = 7,
}

/** A point in a stroke */
export interface Point {
    x: number;
    y: number;
    speed: number;
    direction: number;
    width: number;
    pressure: number;
}

/** Create a Point */
export function createPoint(
    x: number,
    y: number,
    speed: number,
    direction: number,
    width: number,
    pressure: number
): Point {
    return { x, y, speed, direction, width, pressure };
}

/** A rectangle */
export interface Rectangle {
    x: number;
    y: number;
    w: number;
    h: number;
}

/** Create a Rectangle */
export function createRectangle(x: number, y: number, w: number, h: number): Rectangle {
    return { x, y, w, h };
}

/** Base interface for items stored in scene tree */
export interface SceneItem {
    readonly _type: string;
}

/** A stroke line */
export interface Line extends SceneItem {
    readonly _type: 'Line';
    color: PenColor;
    tool: Pen;
    points: Point[];
    thicknessScale: number;
    startingLength: number;
    moveId: CrdtId | null;
}

/** Create a Line */
export function createLine(
    color: PenColor,
    tool: Pen,
    points: Point[],
    thicknessScale: number,
    startingLength: number,
    moveId: CrdtId | null = null
): Line {
    return {
        _type: 'Line',
        color,
        tool,
        points,
        thicknessScale,
        startingLength,
        moveId,
    };
}

/**
 * A Group represents a group of nested items.
 * Groups are used to represent layers.
 * 
 * anchor_id refers to a text character which provides the anchor y-position
 * for this group.
 */
export interface Group extends SceneItem {
    readonly _type: 'Group';
    nodeId: CrdtId;
    children: CrdtSequence<SceneItem>;
    label: LwwValue<string>;
    visible: LwwValue<boolean>;
    anchorId: LwwValue<CrdtId> | null;
    anchorType: LwwValue<number> | null;
    anchorThreshold: LwwValue<number> | null;
    anchorOriginX: LwwValue<number> | null;
}

/** Create a Group */
export function createGroup(
    nodeId: CrdtId,
    options: {
        children?: CrdtSequence<SceneItem>;
        label?: LwwValue<string>;
        visible?: LwwValue<boolean>;
        anchorId?: LwwValue<CrdtId> | null;
        anchorType?: LwwValue<number> | null;
        anchorThreshold?: LwwValue<number> | null;
        anchorOriginX?: LwwValue<number> | null;
    } = {}
): Group {
    return {
        _type: 'Group',
        nodeId,
        children: options.children ?? new CrdtSequence(),
        label: options.label ?? { timestamp: { part1: 0, part2: 0 }, value: '' },
        visible: options.visible ?? { timestamp: { part1: 0, part2: 0 }, value: true },
        anchorId: options.anchorId ?? null,
        anchorType: options.anchorType ?? null,
        anchorThreshold: options.anchorThreshold ?? null,
        anchorOriginX: options.anchorOriginX ?? null,
    };
}

/** The end marker for CRDT sequences */
export const END_MARKER: CrdtId = { part1: 0, part2: 0 };

/**
 * Block of text.
 * 
 * items are a CRDT sequence of strings. The item_id for each string refers
 * to its first character; subsequent characters implicitly have sequential ids.
 * 
 * When formatting is present, some of items have a value of an integer
 * formatting code instead of a string.
 * 
 * styles are LWW values representing a mapping of character IDs to
 * ParagraphStyle values.
 */
export interface Text extends SceneItem {
    readonly _type: 'Text';
    items: CrdtSequence<string | number>;
    styles: Map<string, LwwValue<ParagraphStyle>>; // Key is CrdtId stringified
    posX: number;
    posY: number;
    width: number;
}

/** Create a Text */
export function createText(
    items: CrdtSequence<string | number>,
    styles: Map<string, LwwValue<ParagraphStyle>>,
    posX: number,
    posY: number,
    width: number
): Text {
    return {
        _type: 'Text',
        items,
        styles,
        posX,
        posY,
        width,
    };
}

/**
 * Highlighted text (glyph range)
 * 
 * start is only available in SceneGlyphItemBlock version=0, prior to ReMarkable v3.6
 * length is the length of the text
 * text is the highlighted text itself
 * color represents the highlight color
 * rectangles represent the locations of the highlight.
 */
export interface GlyphRange extends SceneItem {
    readonly _type: 'GlyphRange';
    start: number | null;
    length: number;
    text: string;
    color: PenColor;
    rectangles: Rectangle[];
}

/** Create a GlyphRange */
export function createGlyphRange(
    start: number | null,
    length: number,
    text: string,
    color: PenColor,
    rectangles: Rectangle[]
): GlyphRange {
    return {
        _type: 'GlyphRange',
        start,
        length,
        text,
        color,
        rectangles,
    };
}

/** Type guard for Line */
export function isLine(item: SceneItem | null | undefined): item is Line {
    return item != null && '_type' in item && item._type === 'Line';
}

/** Type guard for Group */
export function isGroup(item: SceneItem | null | undefined): item is Group {
    return item != null && '_type' in item && item._type === 'Group';
}

/** Type guard for Text */
export function isText(item: SceneItem | null | undefined): item is Text {
    return item != null && '_type' in item && item._type === 'Text';
}

/** Type guard for GlyphRange */
export function isGlyphRange(item: SceneItem | null | undefined): item is GlyphRange {
    return item != null && '_type' in item && item._type === 'GlyphRange';
}
