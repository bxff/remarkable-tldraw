/**
 * SVG exporter for reMarkable scene data.
 * 
 * TypeScript port of rmc/src/rmc/exporters/svg.py
 * @module svg
 */

import {
    SceneTree,
    CrdtId,
    Line,
    Group,
    Text,
    GlyphRange,
    SceneItem,
    isLine,
    isGroup,
    isGlyphRange,
    ParagraphStyle,
    crdtIdToString,
    createCrdtId,
} from '../../../../rmscene/src/ts/index.ts';
import { WritingPen, RM_PALETTE, HIGHLIGHT_COLORS } from './writing-tools.ts';

// Coordinate transformation scale
const SCALE = 1.0;

/** Transform x coordinate */
function xx(val: number): number {
    return val * SCALE;
}

/** Transform y coordinate */
function yy(val: number): number {
    return val * SCALE;
}

// Text layout constants
const TEXT_TOP_Y = 116;
const LINE_HEIGHTS: Record<ParagraphStyle, [number, number]> = {
    [ParagraphStyle.BASIC]: [35.52, 48.16],
    [ParagraphStyle.PLAIN]: [35.52, 48.16],
    [ParagraphStyle.HEADING]: [59.65, 78.31],
    [ParagraphStyle.BOLD]: [35.52, 48.16],
    [ParagraphStyle.BULLET]: [35.52, 51.68],
    [ParagraphStyle.BULLET2]: [35.52, 51.68],
    [ParagraphStyle.CHECKBOX]: [35.52, 48.16],
    [ParagraphStyle.CHECKBOX_CHECKED]: [35.52, 48.16],
};

/** Build anchor position map from root text */
export function buildAnchorPos(rootText: Text | null): Map<string, [number, number]> {
    const anchorPos = new Map<string, [number, number]>();

    if (!rootText) {
        return anchorPos;
    }

    // Build character-to-position mapping
    let y = rootText.posY;
    let lineStyle = ParagraphStyle.PLAIN;
    let x = 0;

    for (const [charId, char] of rootText.items.entries()) {
        const charIdStr = crdtIdToString(charId);
        const charStyle = rootText.styles.get(charIdStr);
        if (charStyle) {
            lineStyle = charStyle.value;
        }

        // Handle newlines
        if (typeof char === 'string') {
            for (let i = 0; i < char.length; i++) {
                const c = char[i];
                const currentId = createCrdtId(charId.part1, charId.part2 + i);
                const idStr = crdtIdToString(currentId);
                anchorPos.set(idStr, [x, y]);

                if (c === '\n') {
                    const [fontHeight, lineHeight] = LINE_HEIGHTS[lineStyle] ?? [35.52, 48.16];
                    y += lineHeight;
                    x = 0;
                }
            }
        }
    }

    return anchorPos;
}

/** Get bounding box of scene items */
export function getBoundingBox(
    items: Iterable<[CrdtId, SceneItem]>,
    anchorPos: Map<string, [number, number]>,
    tree: SceneTree
): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const [id, item] of items) {
        if (isLine(item)) {
            for (const point of item.points) {
                const x = xx(point.x);
                const y = yy(point.y);
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
            }
        } else if (isGlyphRange(item)) {
            for (const rect of item.rectangles) {
                minX = Math.min(minX, xx(rect.x));
                maxX = Math.max(maxX, xx(rect.x + rect.w));
                minY = Math.min(minY, yy(rect.y));
                maxY = Math.max(maxY, yy(rect.y + rect.h));
            }
        } else if (isGroup(item)) {
            // Recursively get bounding box of group children
            const childItems = item.children.entries();
            const childBounds = getBoundingBox(childItems, anchorPos, tree);
            if (childBounds.minX !== Infinity) {
                minX = Math.min(minX, childBounds.minX);
                maxX = Math.max(maxX, childBounds.maxX);
                minY = Math.min(minY, childBounds.minY);
                maxY = Math.max(maxY, childBounds.maxY);
            }
        }
    }

    if (minX === Infinity) {
        return { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    }

    return { minX, minY, maxX, maxY };
}

/** Draw a stroke line */
function drawStroke(line: Line): string {
    if (line.points.length < 2) {
        return '';
    }

    const pen = WritingPen.create(line.tool, line.color, line.thicknessScale);
    const pathParts: string[] = [];

    // Move to first point
    const first = line.points[0];
    pathParts.push(`M${xx(first.x).toFixed(2)},${yy(first.y).toFixed(2)}`);

    // Draw segments
    let lastWidth = pen.baseWidth;
    for (let i = 1; i < line.points.length; i++) {
        const p = line.points[i];
        pathParts.push(`L${xx(p.x).toFixed(2)},${yy(p.y).toFixed(2)}`);
        lastWidth = pen.getSegmentWidth(p.speed, p.direction, p.width, p.pressure, lastWidth);
    }

    const pathD = pathParts.join('');
    const color = pen.getSegmentColor(first.speed, first.direction, first.width, first.pressure, pen.baseWidth);
    const opacity = pen.getSegmentOpacity(first.speed, first.direction, first.width, first.pressure, pen.baseWidth);
    const strokeWidth = pen.getSegmentWidth(first.speed, first.direction, first.width, first.pressure, pen.baseWidth);

    return `<path d="${pathD}" fill="none" stroke="${color}" stroke-width="${strokeWidth.toFixed(2)}" stroke-opacity="${opacity}" stroke-linecap="${pen.strokeLinecap}"/>`;
}

/** Draw a glyph range (highlight) */
function drawGlyphRange(glyph: GlyphRange): string {
    const color = HIGHLIGHT_COLORS[glyph.color] ?? [255, 255, 0];
    const rects: string[] = [];

    for (const rect of glyph.rectangles) {
        rects.push(
            `<rect x="${xx(rect.x).toFixed(2)}" y="${yy(rect.y).toFixed(2)}" ` +
            `width="${xx(rect.w).toFixed(2)}" height="${yy(rect.h).toFixed(2)}" ` +
            `fill="rgb(${color[0]}, ${color[1]}, ${color[2]})" fill-opacity="0.3"/>`
        );
    }

    return rects.join('\n');
}

/** Draw group and its children */
function drawGroup(
    group: Group,
    anchorPos: Map<string, [number, number]>,
    tree: SceneTree
): string {
    const parts: string[] = [];

    // Calculate anchor offset
    let offsetY = 0;
    if (group.anchorId?.value) {
        const anchorIdStr = crdtIdToString(group.anchorId.value);
        const pos = anchorPos.get(anchorIdStr);
        if (pos) {
            offsetY = pos[1];
        }
    }

    for (const [id, item] of group.children.entries()) {
        if (isLine(item)) {
            parts.push(drawStroke(item));
        } else if (isGlyphRange(item)) {
            parts.push(drawGlyphRange(item));
        } else if (isGroup(item)) {
            parts.push(drawGroup(item, anchorPos, tree));
        }
    }

    if (offsetY !== 0) {
        return `<g transform="translate(0, ${yy(offsetY).toFixed(2)})">\n${parts.join('\n')}\n</g>`;
    }
    return parts.join('\n');
}

/** Convert scene tree to SVG string */
export function treeToSvg(tree: SceneTree): string {
    const anchorPos = buildAnchorPos(tree.rootText);

    // Get bounding box
    const items = tree.walk();
    const bounds = getBoundingBox(items, anchorPos, tree);

    const margin = 10;
    const width = bounds.maxX - bounds.minX + margin * 2;
    const height = bounds.maxY - bounds.minY + margin * 2;
    const viewBox = `${bounds.minX - margin} ${bounds.minY - margin} ${width} ${height}`;

    const svgContent = drawGroup(tree.root, anchorPos, tree);

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${width}" height="${height}">
${svgContent}
</svg>`;
}

/** Convert rm file data to SVG */
export function rmToSvg(data: ArrayBuffer | Uint8Array): string {
    const { readTree } = require('../../../rmscene/src/ts/scene-tree.ts');
    const tree = readTree(data);
    return treeToSvg(tree);
}
