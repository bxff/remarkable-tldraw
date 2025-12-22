/**
 * SVG exporter for reMarkable scene data.
 * 
 * TypeScript port of rmc/src/rmc/exporters/svg.py
 * Matches Python implementation exactly for identical output.
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
import { parseTextDocument, paragraphToString, Paragraph } from '../text.ts';

// Screen constants from Python
const SCREEN_WIDTH = 1404;
const SCREEN_HEIGHT = 1872;
const SCREEN_DPI = 226;

// Scale factor to convert screen units to points (72 DPI)
const SCALE = 72.0 / SCREEN_DPI;

const PAGE_WIDTH_PT = SCREEN_WIDTH * SCALE;
const PAGE_HEIGHT_PT = SCREEN_HEIGHT * SCALE;
const X_SHIFT = PAGE_WIDTH_PT / 2;

/** Scale screen units to points */
function scale(screenUnit: number): number {
    return screenUnit * SCALE;
}

// For now xx and yy are identical to scale (matching Python)
const xx = scale;
const yy = scale;

// Text layout constants from Python
const TEXT_TOP_Y = -88;
const LINE_HEIGHTS: Record<number, number> = {
    [ParagraphStyle.PLAIN]: 70,
    [ParagraphStyle.BULLET]: 35,
    [ParagraphStyle.BULLET2]: 35,
    [ParagraphStyle.BOLD]: 70,
    [ParagraphStyle.HEADING]: 150,
    [ParagraphStyle.CHECKBOX]: 35,
    [ParagraphStyle.CHECKBOX_CHECKED]: 35,
};

/** Get paragraph style name (matching Python) */
function getStyleName(style: ParagraphStyle): string {
    const names: Record<number, string> = {
        [ParagraphStyle.PLAIN]: 'plain',
        [ParagraphStyle.HEADING]: 'heading',
        [ParagraphStyle.BOLD]: 'bold',
        [ParagraphStyle.BULLET]: 'bullet',
        [ParagraphStyle.BULLET2]: 'bullet2',
        [ParagraphStyle.CHECKBOX]: 'checkbox',
        [ParagraphStyle.CHECKBOX_CHECKED]: 'checkbox_checked',
        [ParagraphStyle.BASIC]: 'basic',
    };
    return names[style] ?? 'plain';
}

/** Special anchors from Python */
const SPECIAL_ANCHORS: Map<string, number> = new Map([
    [crdtIdToString(createCrdtId(0, 281474976710654)), 100],
    [crdtIdToString(createCrdtId(0, 281474976710655)), 100],
]);

/** Build anchor position map from root text (matching Python exactly) */
export function buildAnchorPos(rootText: Text | null): Map<string, number> {
    const anchorPos = new Map<string, number>();

    // Add special anchors
    for (const [key, value] of SPECIAL_ANCHORS) {
        anchorPos.set(key, value);
    }

    if (!rootText) {
        return anchorPos;
    }

    // Use TextDocument to parse paragraphs (matching Python)
    const doc = parseTextDocument(rootText);
    let ypos = rootText.posY + TEXT_TOP_Y;

    for (const p of doc.contents) {
        // Add anchor for paragraph start
        anchorPos.set(crdtIdToString(p.startId), ypos);

        // Add anchors for all characters in paragraph
        for (const subp of p.contents) {
            for (const k of subp.i) {
                anchorPos.set(crdtIdToString(k), ypos);
            }
        }

        // Advance y by line height for this style
        ypos += LINE_HEIGHTS[p.style.value] ?? 70;
    }

    return anchorPos;
}

/** Get anchor position for a group */
function getAnchor(item: Group, anchorPos: Map<string, number>): [number, number] {
    let anchorX = 0;
    let anchorY = 0;

    if (item.anchorId?.value) {
        if (item.anchorOriginX?.value !== undefined) {
            anchorX = item.anchorOriginX.value;
        }
        const anchorIdStr = crdtIdToString(item.anchorId.value);
        const pos = anchorPos.get(anchorIdStr);
        if (pos !== undefined) {
            anchorY = pos;
        }
    }

    return [anchorX, anchorY];
}

/** Get bounding box of scene items */
export function getBoundingBox(
    item: Group,
    anchorPos: Map<string, number>,
    defaultBox: [number, number, number, number] = [-SCREEN_WIDTH / 2, SCREEN_WIDTH / 2, 0, SCREEN_HEIGHT]
): [number, number, number, number] {
    let [xMin, xMax, yMin, yMax] = defaultBox;

    for (const childId of item.children) {
        const child = item.children.get(childId);
        if (!child) continue;

        if (isGroup(child)) {
            const [anchorX, anchorY] = getAnchor(child, anchorPos);
            const [xMinT, xMaxT, yMinT, yMaxT] = getBoundingBox(child, anchorPos, [0, 0, 0, 0]);
            xMin = Math.min(xMin, xMinT + anchorX);
            xMax = Math.max(xMax, xMaxT + anchorX);
            yMin = Math.min(yMin, yMinT + anchorY);
            yMax = Math.max(yMax, yMaxT + anchorY);
        } else if (isLine(child)) {
            for (const p of child.points) {
                xMin = Math.min(xMin, p.x);
                xMax = Math.max(xMax, p.x);
                yMin = Math.min(yMin, p.y);
                yMax = Math.max(yMax, p.y);
            }
        }
    }

    return [xMin, xMax, yMin, yMax];
}

/** Draw a stroke with segment-based rendering (matching Python exactly) */
function drawStroke(item: Line, output: string[]): void {
    // Create the pen
    const pen = WritingPen.create(item.tool, item.color, item.thicknessScale);

    let lastXpos = -1;
    let lastYpos = -1;
    let lastSegmentWidth = 0;
    let segmentWidth = 0;

    // Iterate through points to form polylines
    for (let pointId = 0; pointId < item.points.length; pointId++) {
        const point = item.points[pointId];
        const xpos = point.x;
        const ypos = point.y;

        if (pointId % pen.segmentLength === 0) {
            // If there was a previous segment, end it
            if (lastXpos !== -1) {
                output.push('"/>');
            }

            const segmentColor = pen.getSegmentColor(
                point.speed, point.direction, point.width, point.pressure, lastSegmentWidth
            );
            segmentWidth = pen.getSegmentWidth(
                point.speed, point.direction, point.width, point.pressure, lastSegmentWidth
            );
            const segmentOpacity = pen.getSegmentOpacity(
                point.speed, point.direction, point.width, point.pressure, lastSegmentWidth
            );

            // Create the next segment of the stroke
            output.push(
                `\t\t\t<polyline style="fill:none; stroke:${segmentColor}; ` +
                `stroke-width:${scale(segmentWidth).toFixed(3)}; opacity:${segmentOpacity}" ` +
                `stroke-linecap="${pen.strokeLinecap}" ` +
                `points="`
            );

            if (lastXpos !== -1) {
                // Join to previous segment
                output.push(`${xx(lastXpos).toFixed(3)},${yy(lastYpos).toFixed(3)} `);
            }
        }

        // Store the last position
        lastXpos = xpos;
        lastYpos = ypos;
        lastSegmentWidth = segmentWidth;

        // Add current point
        output.push(`${xx(xpos).toFixed(3)},${yy(ypos).toFixed(3)} `);
    }

    // End stroke
    output.push('" />');
}

/** Draw a group and its children */
function drawGroup(item: Group, output: string[], anchorPos: Map<string, number>): void {
    const [anchorX, anchorY] = getAnchor(item, anchorPos);

    output.push(`\t\t<g id="${crdtIdToString(item.nodeId)}" transform="translate(${xx(anchorX)}, ${yy(anchorY)})">`);

    for (const childId of item.children) {
        const child = item.children.get(childId);
        if (!child) continue;

        if (isGroup(child)) {
            drawGroup(child, output, anchorPos);
        } else if (isLine(child)) {
            drawStroke(child, output);
        }
    }

    output.push(`\t\t</g>`);
}

/** Draw text elements (matching Python draw_text exactly) */
function drawText(text: Text, output: string[]): void {
    output.push('\t\t<g class="root-text" style="display:inline">');

    // Add CSS styles for text (matching Python exactly)
    output.push(`
            <style>
                text.heading {
                    font: 14pt serif;
                }
                text.bold {
                    font: 8pt sans-serif bold;
                }
                text, text.plain {
                    font: 7pt sans-serif;
                }
            </style>
`);

    let yOffset = TEXT_TOP_Y;

    // Parse text document (matching Python)
    const doc = parseTextDocument(text);

    for (const p of doc.contents) {
        // Advance y by line height BEFORE rendering (matching Python)
        yOffset += LINE_HEIGHTS[p.style.value] ?? 70;

        const xpos = text.posX;
        const ypos = text.posY + yOffset;
        const cls = getStyleName(p.style.value);
        const content = paragraphToString(p).trim();

        if (content) {
            output.push(`\t\t\t<text x="${xx(xpos)}" y="${yy(ypos)}" class="${cls}">${escapeXml(content)}</text>`);
        }
    }

    output.push('\t\t</g>');
}

/** Escape XML special characters */
function escapeXml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/** Convert scene tree to SVG string */
export function treeToSvg(tree: SceneTree): string {
    const anchorPos = buildAnchorPos(tree.rootText);

    // Get bounding box
    const [xMin, xMax, yMin, yMax] = getBoundingBox(tree.root, anchorPos);
    const widthPt = xx(xMax - xMin + 1);
    const heightPt = yy(yMax - yMin + 1);
    const viewBox = `${xx(xMin)} ${yy(yMin)} ${widthPt} ${heightPt}`;

    const output: string[] = [];

    // SVG header
    output.push(`<?xml version="1.0" encoding="UTF-8"?>`);
    output.push(`<svg xmlns="http://www.w3.org/2000/svg" height="${heightPt}" width="${widthPt}" viewBox="${viewBox}">`);

    // Page group
    output.push(`\t<g id="p1" style="display:inline">`);

    // Draw text if present
    if (tree.rootText) {
        drawText(tree.rootText, output);
    }

    // Draw groups
    drawGroup(tree.root, output, anchorPos);

    // Close page group
    output.push('\t</g>');
    output.push('</svg>');

    return output.join('\n');
}

/** Convert rm file data to SVG */
export function rmToSvg(data: ArrayBuffer | Uint8Array): string {
    const { readTree } = require('../../../../rmscene/src/ts/scene-tree.ts');
    const tree = readTree(data);
    return treeToSvg(tree);
}
