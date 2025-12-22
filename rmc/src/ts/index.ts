/**
 * rmc - TypeScript library for converting reMarkable files
 * 
 * @module rmc
 */

// Writing tools
export { WritingPen, RM_PALETTE, HIGHLIGHT_COLORS, clamp } from './exporters/writing-tools.ts';

// SVG exporter
export { treeToSvg, rmToSvg, buildAnchorPos, getBoundingBox } from './exporters/svg.ts';

// TLDraw exporter
export {
    treeToTldraw,
    treeToTldrawJson,
    rmToTldraw,
    rmToTldrawJson,
    resetIndexCounter,
} from './exporters/tldraw.ts';
