/**
 * Common code for writing tools.
 * 
 * TypeScript port of rmc/src/rmc/exporters/writing_tools.py
 * @module writing-tools
 */

import { PenColor, Pen as PenType } from '../../../rmscene/src/ts/scene-items.ts';

/** Color palette mapping PenColor to RGB values */
export const RM_PALETTE: Record<PenColor, [number, number, number]> = {
    [PenColor.BLACK]: [0, 0, 0],
    [PenColor.GRAY]: [144, 144, 144],
    [PenColor.WHITE]: [255, 255, 255],
    [PenColor.YELLOW]: [251, 247, 25],
    [PenColor.GREEN]: [0, 255, 0],
    [PenColor.PINK]: [255, 192, 203],
    [PenColor.BLUE]: [78, 105, 201],
    [PenColor.RED]: [179, 62, 57],
    [PenColor.GRAY_OVERLAP]: [125, 125, 125],
    [PenColor.HIGHLIGHT]: [255, 255, 0], // Default highlight
    [PenColor.GREEN_2]: [161, 216, 125],
    [PenColor.CYAN]: [139, 208, 229],
    [PenColor.MAGENTA]: [183, 130, 205],
    [PenColor.YELLOW_2]: [247, 232, 81],
};

/** Highlight colors for different colors */
export const HIGHLIGHT_COLORS: Record<number, [number, number, number]> = {
    [PenColor.YELLOW]: [255, 235, 0],
    [PenColor.GREEN]: [0, 255, 0],
    [PenColor.PINK]: [255, 105, 180],
    [PenColor.HIGHLIGHT]: [255, 255, 0],
    [PenColor.GREEN_2]: [161, 216, 125],
    [PenColor.CYAN]: [139, 208, 229],
    [PenColor.MAGENTA]: [183, 130, 205],
    [PenColor.YELLOW_2]: [247, 232, 81],
};

/** Clamp value between 0 and 1 */
export function clamp(value: number): number {
    return Math.min(Math.max(value, 0), 1);
}

/** Base pen class */
export class WritingPen {
    name: string;
    baseWidth: number;
    baseColor: [number, number, number];
    segmentLength: number = 1000;
    baseOpacity: number = 1;
    strokeLinecap: 'round' | 'square' = 'round';
    strokeOpacity: number = 1;
    strokeWidth: number;
    strokeColor: PenColor;

    constructor(name: string, baseWidth: number, baseColorId: PenColor) {
        this.name = name;
        this.baseWidth = baseWidth;
        this.baseColor = RM_PALETTE[baseColorId] ?? [0, 0, 0];
        this.strokeWidth = baseWidth;
        this.strokeColor = baseColorId;
    }

    /** Convert direction value to tilt in radians */
    static directionToTilt(direction: number): number {
        return direction * (Math.PI * 2) / 255;
    }

    /** Get segment width based on point properties */
    getSegmentWidth(speed: number, direction: number, width: number, pressure: number, lastWidth: number): number {
        return this.baseWidth;
    }

    /** Get segment color as RGB string */
    getSegmentColor(speed: number, direction: number, width: number, pressure: number, lastWidth: number): string {
        return `rgb(${this.baseColor[0]}, ${this.baseColor[1]}, ${this.baseColor[2]})`;
    }

    /** Get segment opacity */
    getSegmentOpacity(speed: number, direction: number, width: number, pressure: number, lastWidth: number): number {
        return this.baseOpacity;
    }

    /** Create a pen based on pen type */
    static create(penNr: PenType, colorId: PenColor, width: number): WritingPen {
        switch (penNr) {
            case PenType.PAINTBRUSH_1:
            case PenType.PAINTBRUSH_2:
                return new Brush(width, colorId);
            case PenType.CALIGRAPHY:
                return new Calligraphy(width, colorId);
            case PenType.MARKER_1:
            case PenType.MARKER_2:
                return new Marker(width, colorId);
            case PenType.BALLPOINT_1:
            case PenType.BALLPOINT_2:
                return new Ballpoint(width, colorId);
            case PenType.FINELINER_1:
            case PenType.FINELINER_2:
                return new Fineliner(width, colorId);
            case PenType.PENCIL_1:
            case PenType.PENCIL_2:
                return new Pencil(width, colorId);
            case PenType.MECHANICAL_PENCIL_1:
            case PenType.MECHANICAL_PENCIL_2:
                return new MechanicalPencil(width, colorId);
            case PenType.HIGHLIGHTER_1:
            case PenType.HIGHLIGHTER_2:
                return new Highlighter(15, colorId);
            case PenType.SHADER:
                return new Shader(12, colorId);
            case PenType.ERASER_AREA:
                return new EraseArea(width, colorId);
            case PenType.ERASER:
                return new Eraser(width, PenColor.WHITE);
            default:
                throw new Error(`Unknown pen type: ${penNr}`);
        }
    }
}

class Fineliner extends WritingPen {
    constructor(baseWidth: number, baseColorId: PenColor) {
        super('Fineliner', baseWidth * 1.8, baseColorId);
    }
}

class Ballpoint extends WritingPen {
    constructor(baseWidth: number, baseColorId: PenColor) {
        super('Ballpoint', baseWidth, baseColorId);
        this.segmentLength = 5;
    }

    getSegmentWidth(speed: number, direction: number, width: number, pressure: number, lastWidth: number): number {
        return (0.5 + pressure / 255) + (width / 4) - 0.5 * ((speed / 4) / 50);
    }

    getSegmentColor(speed: number, direction: number, width: number, pressure: number, lastWidth: number): string {
        let intensity = (0.1 * -((speed / 4) / 35)) + (1.2 * pressure / 255) + 0.5;
        intensity = clamp(intensity);
        const colorVal = Math.min(Math.floor(Math.abs(intensity - 1) * 255), 60);
        return `rgb(${colorVal}, ${colorVal}, ${colorVal})`;
    }
}

class Marker extends WritingPen {
    constructor(baseWidth: number, baseColorId: PenColor) {
        super('Marker', baseWidth, baseColorId);
        this.segmentLength = 3;
    }

    getSegmentWidth(speed: number, direction: number, width: number, pressure: number, lastWidth: number): number {
        return 0.9 * ((width / 4) - 0.4 * WritingPen.directionToTilt(direction)) + (0.1 * lastWidth);
    }
}

class Pencil extends WritingPen {
    constructor(baseWidth: number, baseColorId: PenColor) {
        super('Pencil', baseWidth, baseColorId);
        this.segmentLength = 2;
    }

    getSegmentWidth(speed: number, direction: number, width: number, pressure: number, lastWidth: number): number {
        let segmentWidth = 0.7 * ((((0.8 * this.baseWidth) + (0.5 * pressure / 255)) * (width / 4))
            - (0.25 * Math.pow(WritingPen.directionToTilt(direction), 1.8)) - (0.6 * (speed / 4) / 50));
        const maxWidth = this.baseWidth * 10;
        return Math.min(segmentWidth, maxWidth);
    }

    getSegmentOpacity(speed: number, direction: number, width: number, pressure: number, lastWidth: number): number {
        let segmentOpacity = (0.1 * -((speed / 4) / 35)) + (1 * pressure / 255);
        return clamp(segmentOpacity) - 0.1;
    }
}

class MechanicalPencil extends WritingPen {
    constructor(baseWidth: number, baseColorId: PenColor) {
        super('Mechanical Pencil', baseWidth ** 2, baseColorId);
        this.baseOpacity = 0.7;
    }
}

class Brush extends WritingPen {
    constructor(baseWidth: number, baseColorId: PenColor) {
        super('Brush', baseWidth, baseColorId);
        this.segmentLength = 2;
        this.strokeLinecap = 'round';
    }

    getSegmentWidth(speed: number, direction: number, width: number, pressure: number, lastWidth: number): number {
        return 0.7 * (((1 + (1.4 * pressure / 255)) * (width / 4))
            - (0.5 * WritingPen.directionToTilt(direction)) - ((speed / 4) / 50));
    }

    getSegmentColor(speed: number, direction: number, width: number, pressure: number, lastWidth: number): string {
        let intensity = (Math.pow(pressure / 255, 1.5) - 0.2 * ((speed / 4) / 50)) * 1.5;
        intensity = clamp(intensity);
        const revIntensity = Math.abs(intensity - 1);
        const r = Math.floor(revIntensity * (255 - this.baseColor[0]));
        const g = Math.floor(revIntensity * (255 - this.baseColor[1]));
        const b = Math.floor(revIntensity * (255 - this.baseColor[2]));
        return `rgb(${r}, ${g}, ${b})`;
    }
}

class Highlighter extends WritingPen {
    constructor(baseWidth: number, baseColorId: PenColor) {
        super('Highlighter', baseWidth, baseColorId);
        this.strokeLinecap = 'square';
        this.baseOpacity = 0.3;
        this.strokeOpacity = 0.2;
        // Use highlight color palette
        const hlColor = HIGHLIGHT_COLORS[baseColorId];
        if (hlColor) {
            this.baseColor = hlColor;
        }
    }
}

class Shader extends WritingPen {
    constructor(baseWidth: number, baseColorId: PenColor) {
        super('Shader', baseWidth, baseColorId);
        this.strokeLinecap = 'round';
        this.baseOpacity = 0.1;
    }
}

class Eraser extends WritingPen {
    constructor(baseWidth: number, baseColorId: PenColor) {
        super('Eraser', baseWidth * 2, baseColorId);
        this.strokeLinecap = 'square';
    }
}

class EraseArea extends WritingPen {
    constructor(baseWidth: number, baseColorId: PenColor) {
        super('Erase Area', baseWidth, baseColorId);
        this.strokeLinecap = 'square';
        this.baseOpacity = 0;
    }
}

class Calligraphy extends WritingPen {
    constructor(baseWidth: number, baseColorId: PenColor) {
        super('Calligraphy', baseWidth, baseColorId);
        this.segmentLength = 2;
    }

    getSegmentWidth(speed: number, direction: number, width: number, pressure: number, lastWidth: number): number {
        return 0.9 * (((1 + pressure / 255) * (width / 4))
            - 0.3 * WritingPen.directionToTilt(direction)) + (0.1 * lastWidth);
    }
}
