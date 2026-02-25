/**
 * rmrl-faithful rendering formulas for reMarkable brush strokes.
 *
 * Each pen function takes per-point data and returns stroke properties
 * for a single point-pair line segment. Matches rmrl's Python vector
 * rendering exactly.
 *
 * Values expected in rmrl/v5 ranges:
 *   - pressure: 0-1
 *   - width: ~1-10 (segment.width from rm file)
 *   - speed: ~0-20
 */

// Scale factor matching rmrl SVG exporter: 72 DPI / 226 DPI
export const RM_SCALE = 72 / 226

// ============================================================
// Per-point-pair style computation
// ============================================================

export interface LineStyle {
    width: number
    color: string
    opacity: number
}

function clamp01(v: number): number {
    return Math.min(Math.max(v, 0), 1)
}

// ----- Fineliner / Calligraphy: passthrough -----
export function finelinerStyle(
    baseColor: [number, number, number],
    width: number,
    _pressure: number,
    _speed: number,
): LineStyle {
    return {
        width,
        color: `rgb(${baseColor[0]},${baseColor[1]},${baseColor[2]})`,
        opacity: 1,
    }
}

// Calligraphy is the same as fineliner in rmrl vector mode
export const calligraphyStyle = finelinerStyle

// ----- Ballpoint: width + (pressure-1) * width/2 -----
export function ballpointStyle(
    baseColor: [number, number, number],
    width: number,
    pressure: number,
    _speed: number,
): LineStyle {
    const delta = (pressure - 1) * (width / 2)
    return {
        width: Math.max(0.5, width + delta),
        color: `rgb(${baseColor[0]},${baseColor[1]},${baseColor[2]})`,
        opacity: 1,
    }
}

// ----- Marker: width * 0.7 -----
export function markerStyle(
    baseColor: [number, number, number],
    width: number,
    _pressure: number,
    _speed: number,
): LineStyle {
    return {
        width: width * 0.7,
        color: `rgb(${baseColor[0]},${baseColor[1]},${baseColor[2]})`,
        opacity: 1,
    }
}

// ----- Pencil: width * 0.58, color = 1-(1-base)*pressure -----
export function pencilStyle(
    baseColor: [number, number, number],
    width: number,
    pressure: number,
    _speed: number,
): LineStyle {
    const r = Math.round((1 - (1 - baseColor[0] / 255) * pressure) * 255)
    const g = Math.round((1 - (1 - baseColor[1] / 255) * pressure) * 255)
    const b = Math.round((1 - (1 - baseColor[2] / 255) * pressure) * 255)
    return {
        width: width * 0.58,
        color: `rgb(${r},${g},${b})`,
        opacity: 1,
    }
}

// ----- Mechanical Pencil: passthrough width, pressure-blended color -----
export function mechPencilStyle(
    baseColor: [number, number, number],
    width: number,
    pressure: number,
    _speed: number,
): LineStyle {
    const r = Math.round((1 - (1 - baseColor[0] / 255) * pressure) * 255)
    const g = Math.round((1 - (1 - baseColor[1] / 255) * pressure) * 255)
    const b = Math.round((1 - (1 - baseColor[2] / 255) * pressure) * 255)
    return {
        width,
        color: `rgb(${r},${g},${b})`,
        opacity: 1,
    }
}

// ----- Paintbrush: complex width + press_mod color -----
export function brushStyle(
    baseColor: [number, number, number],
    width: number,
    pressure: number,
    speed: number,
): LineStyle {
    const modWidth = width * 0.75
    const maxDelta = modWidth * 0.75
    const delta = (pressure - 1) * maxDelta
    const newWidth = Math.max(0.5, modWidth + delta)

    // rmrl does NOT clamp press_mod — it can exceed 1.0 (up to ~2.0),
    // producing darker colors for high pressure + low speed
    const pressMod = pressure * (2 - speed / 75)
    const r = Math.round(Math.max(0, Math.min(255, (1 - (1 - baseColor[0] / 255) * pressMod / 2) * 255)))
    const g = Math.round(Math.max(0, Math.min(255, (1 - (1 - baseColor[1] / 255) * pressMod / 2) * 255)))
    const b = Math.round(Math.max(0, Math.min(255, (1 - (1 - baseColor[2] / 255) * pressMod / 2) * 255)))

    return { width: newWidth, color: `rgb(${r},${g},${b})`, opacity: 1 }
}

// ----- Highlighter: fixed yellow, alpha, square cap, single polyline -----
export function highlighterStyle(
    _baseColor: [number, number, number],
    width: number,
    _pressure: number,
    _speed: number,
): LineStyle {
    return {
        width,
        color: 'rgb(255,233,74)',
        opacity: 0.392,
    }
}

// ----- Shader: low opacity -----
export function shaderStyle(
    baseColor: [number, number, number],
    width: number,
    _pressure: number,
    _speed: number,
): LineStyle {
    return {
        width,
        color: `rgb(${baseColor[0]},${baseColor[1]},${baseColor[2]})`,
        opacity: 0.1,
    }
}

// ============================================================
// Brush type → style function mapping
// ============================================================

export type RmBrush =
    | 'fineliner'
    | 'ballpoint'
    | 'marker'
    | 'pencil'
    | 'mechanicalPencil'
    | 'brush'
    | 'calligraphy'
    | 'highlighter'
    | 'shader'

type StyleFn = (
    baseColor: [number, number, number],
    width: number,
    pressure: number,
    speed: number,
) => LineStyle

const STYLE_FNS: Record<RmBrush, StyleFn> = {
    fineliner: finelinerStyle,
    ballpoint: ballpointStyle,
    marker: markerStyle,
    pencil: pencilStyle,
    mechanicalPencil: mechPencilStyle,
    brush: brushStyle,
    calligraphy: calligraphyStyle,
    highlighter: highlighterStyle,
    shader: shaderStyle,
}

export function getStyleFn(brush: RmBrush): StyleFn {
    return STYLE_FNS[brush] ?? finelinerStyle
}

// ============================================================
// Per-point RM data (stored in shape.meta.rmPointData)
// ============================================================

export interface RmPointData {
    speed: number
    direction: number
    width: number
    pressure: number
}

export function encodeRmPointData(data: RmPointData[]): string {
    const buf = new Float32Array(data.length * 4)
    for (let i = 0; i < data.length; i++) {
        buf[i * 4 + 0] = data[i].speed
        buf[i * 4 + 1] = data[i].direction
        buf[i * 4 + 2] = data[i].width
        buf[i * 4 + 3] = data[i].pressure
    }
    const bytes = new Uint8Array(buf.buffer)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    return btoa(binary)
}

export function decodeRmPointData(encoded: string): RmPointData[] {
    if (!encoded) return []
    const binary = atob(encoded)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const buf = new Float32Array(bytes.buffer)
    const result: RmPointData[] = []
    for (let i = 0; i < buf.length; i += 4) {
        result.push({
            speed: buf[i],
            direction: buf[i + 1],
            width: buf[i + 2],
            pressure: buf[i + 3],
        })
    }
    return result
}

// ============================================================
// Color map (RM color names → RGB)
// ============================================================

export const RM_COLORS: Record<string, [number, number, number]> = {
    black: [0, 0, 0],
    grey: [144, 144, 144],
    white: [255, 255, 255],
    yellow: [251, 247, 25],
    green: [0, 255, 0],
    red: [179, 62, 57],
    blue: [78, 105, 201],
    'light-green': [161, 216, 125],
    'light-blue': [139, 208, 229],
    violet: [183, 130, 205],
    pink: [255, 192, 203],
    'grey-overlap': [125, 125, 125],
    highlight: [255, 255, 0],
    'yellow-2': [247, 232, 81],
}

/**
 * Render RM-style SVG lines for a stroke.
 *
 * Produces one <line> per point pair with per-pair width/color,
 * matching rmrl's canvas.line(p1, p2) approach.
 *
 * @param points - Decoded points with x, y, z (pressure 0-1)
 * @param rmData - Per-point RM data (speed, direction, width, pressure).
 *                 If null, values are derived from points.
 * @param brush - RM brush type
 * @param baseColor - RGB color tuple
 * @param scaleFactor - Coordinate scale factor
 * @returns SVG string of <line> elements
 */
export function renderRmLines(
    points: { x: number; y: number; z?: number }[],
    rmData: RmPointData[] | null,
    brush: RmBrush,
    baseColor: [number, number, number],
    scaleFactor: number = 1,
    widthScale: number = scaleFactor,
): string {
    if (points.length < 2) return ''

    const styleFn = getStyleFn(brush)
    const isHighlighter = brush === 'highlighter'
    const lines: string[] = []

    // Highlighter: single polyline
    if (isHighlighter) {
        const rm = rmData?.[0]
        const width = rm ? rm.width / 4 : 4
        const pressure = rm ? rm.pressure / 255 : (points[0].z ?? 0.5)
        const style = styleFn(baseColor, width, pressure, 0)
        const pts = points.map(p => `${(p.x * scaleFactor).toFixed(2)},${(p.y * scaleFactor).toFixed(2)}`).join(' ')
        return `<polyline points="${pts}" fill="none" stroke="${style.color}" stroke-width="${Math.max(0.3, style.width * widthScale)}" stroke-linecap="square" stroke-linejoin="round" opacity="${style.opacity}"/>`
    }

    // Per-point-pair lines
    for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i]
        const p2 = points[i + 1]
        const rm = rmData?.[i]

        // Get values in rmrl/v5 ranges
        let width: number, pressure: number, speed: number
        if (rm) {
            // Imported RM data: v6 format, normalize to v5
            width = rm.width / 4
            pressure = rm.pressure / 255
            speed = rm.speed / 4
        } else {
            // Live drawing: derive from tldraw points
            pressure = p1.z ?? 0.5
            width = 2 + pressure * 4 // approximate: 2-6 range
            if (i > 0) {
                const prev = points[i - 1]
                const dx = p1.x - prev.x
                const dy = p1.y - prev.y
                speed = Math.sqrt(dx * dx + dy * dy)
            } else {
                speed = 0
            }
        }

        const style = styleFn(baseColor, width, pressure, speed)
        const x1 = (p1.x * scaleFactor).toFixed(2)
        const y1 = (p1.y * scaleFactor).toFixed(2)
        const x2 = (p2.x * scaleFactor).toFixed(2)
        const y2 = (p2.y * scaleFactor).toFixed(2)
        const sw = Math.max(0.1, style.width * widthScale).toFixed(2)

        lines.push(
            `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${style.color}" stroke-width="${sw}" stroke-linecap="round" opacity="${style.opacity}"/>`
        )
    }

    return lines.join('')
}
