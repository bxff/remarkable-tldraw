/**
 * reMarkable brush rendering engine.
 * Port of rmc/src/ts/exporters/writing-tools.ts - standalone, no rmscene deps.
 *
 * Each brush has formulas for computing per-segment:
 *   - stroke width
 *   - stroke color (RGB string)
 *   - stroke opacity
 *
 * These are applied to short polyline segments (2-5 points each) to create
 * the distinctive look of each rm brush type.
 *
 * ============================================================
 * IMPORTANT — RENDERING ACCURACY NOTE FOR FUTURE AGENTS
 * ============================================================
 *
 * This module is a FAITHFUL PORT of rmc/src/ts/exporters/writing-tools.ts,
 * which is the rendering engine behind rmc's SVG exporter (svg.ts). Our
 * rm-draw shapes render identically to what the SVG exporter produces —
 * this has been visually verified.
 *
 * HOWEVER: the SVG exporter itself does NOT accurately reproduce how the
 * reMarkable tablet actually displays strokes on its own screen. The
 * formulas in writing-tools.ts are approximations that were reverse-
 * engineered, and they diverge from the tablet's real rendering in
 * noticeable ways (color intensity, stroke width variation, opacity
 * curves, etc.). The actual rm rendering engine is proprietary and
 * undocumented.
 *
 * This means:
 *   - rm-draw rendering == SVG exporter output  (verified, correct)
 *   - SVG exporter output != actual rm tablet display  (known gap)
 *   - Therefore: rm-draw rendering != actual rm tablet display
 *
 * To make rm-draw shapes look like the REAL tablet output, the brush
 * formulas in this file will need to be adjusted based on visual
 * comparison against actual tablet screenshots — NOT against the SVG
 * exporter output. The SVG exporter is useful as a baseline but should
 * not be treated as ground truth for visual fidelity.
 * ============================================================
 */

import { RmBrush } from './rm-types'

/** Clamp value between 0 and 1 */
function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1)
}

/** Convert direction value (0-255) to tilt in radians */
function directionToTilt(direction: number): number {
  return direction * (Math.PI * 2) / 255
}

// ============================================================
// Brush parameter interfaces
// ============================================================

export interface BrushConfig {
  name: string
  segmentLength: number
  baseOpacity: number
  strokeLinecap: 'round' | 'square'
  getSegmentWidth(
    baseWidth: number,
    speed: number,
    direction: number,
    width: number,
    pressure: number,
    lastWidth: number
  ): number
  getSegmentColor(
    baseColor: [number, number, number],
    speed: number,
    direction: number,
    width: number,
    pressure: number,
    lastWidth: number
  ): string
  getSegmentOpacity(
    baseOpacity: number,
    speed: number,
    direction: number,
    width: number,
    pressure: number,
    lastWidth: number
  ): number
}

// ============================================================
// Default implementations (base class behavior)
// ============================================================

const defaultGetWidth = (
  baseWidth: number,
  _s: number, _d: number, _w: number, _p: number, _lw: number
) => baseWidth

const defaultGetColor = (
  baseColor: [number, number, number],
  _s: number, _d: number, _w: number, _p: number, _lw: number
) => `rgb(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]})`

const defaultGetOpacity = (
  baseOpacity: number,
  _s: number, _d: number, _w: number, _p: number, _lw: number
) => baseOpacity

// ============================================================
// Per-brush configurations (matching writing-tools.ts exactly)
// ============================================================

const FINELINER: BrushConfig = {
  name: 'Fineliner',
  segmentLength: 1000, // effectively one segment for entire stroke
  baseOpacity: 1,
  strokeLinecap: 'round',
  getSegmentWidth: defaultGetWidth, // uses baseWidth * 1.8 (applied at creation)
  getSegmentColor: defaultGetColor,
  getSegmentOpacity: defaultGetOpacity,
}

const BALLPOINT: BrushConfig = {
  name: 'Ballpoint',
  segmentLength: 5,
  baseOpacity: 1,
  strokeLinecap: 'round',
  getSegmentWidth: (_bw, speed, _dir, width, pressure, _lw) => {
    return (0.5 + pressure / 255) + (width / 4) - 0.5 * ((speed / 4) / 50)
  },
  getSegmentColor: (_bc, speed, _dir, _width, pressure, _lw) => {
    let intensity = (0.1 * -((speed / 4) / 35)) + (1.2 * pressure / 255) + 0.5
    intensity = clamp01(intensity)
    const colorVal = Math.min(Math.floor(Math.abs(intensity - 1) * 255), 60)
    return `rgb(${colorVal}, ${colorVal}, ${colorVal})`
  },
  getSegmentOpacity: defaultGetOpacity,
}

const MARKER: BrushConfig = {
  name: 'Marker',
  segmentLength: 3,
  baseOpacity: 1,
  strokeLinecap: 'round',
  getSegmentWidth: (_bw, _speed, direction, width, _pressure, lastWidth) => {
    return 0.9 * ((width / 4) - 0.4 * directionToTilt(direction)) + (0.1 * lastWidth)
  },
  getSegmentColor: defaultGetColor,
  getSegmentOpacity: defaultGetOpacity,
}

const PENCIL: BrushConfig = {
  name: 'Pencil',
  segmentLength: 2,
  baseOpacity: 1,
  strokeLinecap: 'round',
  getSegmentWidth: (baseWidth, speed, direction, width, pressure, _lw) => {
    const segmentWidth = 0.7 * ((((0.8 * baseWidth) + (0.5 * pressure / 255)) * (width / 4))
      - (0.25 * Math.pow(directionToTilt(direction), 1.8)) - (0.6 * (speed / 4) / 50))
    const maxWidth = baseWidth * 10
    return Math.min(segmentWidth, maxWidth)
  },
  getSegmentColor: defaultGetColor,
  getSegmentOpacity: (_bo, speed, _dir, _width, pressure, _lw) => {
    const segmentOpacity = (0.1 * -((speed / 4) / 35)) + (1 * pressure / 255)
    return clamp01(segmentOpacity) - 0.1
  },
}

const MECHANICAL_PENCIL: BrushConfig = {
  name: 'Mechanical Pencil',
  segmentLength: 1000,
  baseOpacity: 0.7,
  strokeLinecap: 'round',
  getSegmentWidth: defaultGetWidth, // uses baseWidth ** 2 (applied at creation)
  getSegmentColor: defaultGetColor,
  getSegmentOpacity: defaultGetOpacity,
}

const BRUSH: BrushConfig = {
  name: 'Brush',
  segmentLength: 2,
  baseOpacity: 1,
  strokeLinecap: 'round',
  getSegmentWidth: (_bw, speed, direction, width, pressure, _lw) => {
    return 0.7 * (((1 + (1.4 * pressure / 255)) * (width / 4))
      - (0.5 * directionToTilt(direction)) - ((speed / 4) / 50))
  },
  getSegmentColor: (baseColor, speed, _dir, _width, pressure, _lw) => {
    let intensity = (Math.pow(pressure / 255, 1.5) - 0.2 * ((speed / 4) / 50)) * 1.5
    intensity = clamp01(intensity)
    const revIntensity = Math.abs(intensity - 1)
    const r = Math.floor(revIntensity * (255 - baseColor[0]))
    const g = Math.floor(revIntensity * (255 - baseColor[1]))
    const b = Math.floor(revIntensity * (255 - baseColor[2]))
    return `rgb(${r}, ${g}, ${b})`
  },
  getSegmentOpacity: defaultGetOpacity,
}

const CALLIGRAPHY: BrushConfig = {
  name: 'Calligraphy',
  segmentLength: 2,
  baseOpacity: 1,
  strokeLinecap: 'round',
  getSegmentWidth: (_bw, _speed, direction, width, pressure, lastWidth) => {
    return 0.9 * (((1 + pressure / 255) * (width / 4))
      - 0.3 * directionToTilt(direction)) + (0.1 * lastWidth)
  },
  getSegmentColor: defaultGetColor,
  getSegmentOpacity: defaultGetOpacity,
}

const HIGHLIGHTER: BrushConfig = {
  name: 'Highlighter',
  segmentLength: 1000,
  baseOpacity: 0.3,
  strokeLinecap: 'square',
  getSegmentWidth: defaultGetWidth, // fixed width 15
  getSegmentColor: defaultGetColor,
  getSegmentOpacity: defaultGetOpacity,
}

const SHADER: BrushConfig = {
  name: 'Shader',
  segmentLength: 1000,
  baseOpacity: 0.1,
  strokeLinecap: 'round',
  getSegmentWidth: defaultGetWidth,
  getSegmentColor: defaultGetColor,
  getSegmentOpacity: defaultGetOpacity,
}

/** Get brush config by type */
export function getBrushConfig(brush: RmBrush): BrushConfig {
  switch (brush) {
    case RmBrush.Fineliner: return FINELINER
    case RmBrush.Ballpoint: return BALLPOINT
    case RmBrush.Marker: return MARKER
    case RmBrush.Pencil: return PENCIL
    case RmBrush.MechanicalPencil: return MECHANICAL_PENCIL
    case RmBrush.Brush: return BRUSH
    case RmBrush.Calligraphy: return CALLIGRAPHY
    case RmBrush.Highlighter: return HIGHLIGHTER
    case RmBrush.Shader: return SHADER
  }
}

/** Get the effective base width for a brush (some brushes transform the raw width) */
export function getEffectiveBaseWidth(brush: RmBrush, rawWidth: number): number {
  switch (brush) {
    case RmBrush.Fineliner: return rawWidth * 1.8
    case RmBrush.MechanicalPencil: return rawWidth ** 2
    case RmBrush.Highlighter: return 15
    case RmBrush.Shader: return 12
    default: return rawWidth
  }
}

// ============================================================
// Color definitions
// ============================================================

/** tldraw color name to RGB mapping for rm rendering */
export const RM_COLOR_MAP: Record<string, [number, number, number]> = {
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
  // Additional rm palette colors not in the original 10
  pink: [255, 192, 203],
  'grey-overlap': [125, 125, 125],
  highlight: [255, 255, 0],
  'yellow-2': [247, 232, 81],
}

/** Get base RGB color for a tldraw color name */
export function getBaseColor(colorName: string): [number, number, number] {
  return RM_COLOR_MAP[colorName] ?? [0, 0, 0]
}

// ============================================================
// Per-point parameter derivation (for live drawing)
// ============================================================

export interface DerivedRmParams {
  speed: number
  direction: number
  width: number
  pressure: number
}

/**
 * Derive rm-style parameters from tldraw points.
 * When drawing live, we only have {x, y, z} from tldraw.
 * We derive speed from inter-point distance and direction from angle.
 * Width is derived from pressure, and pressure comes from z.
 */
export function deriveRmParams(
  points: { x: number; y: number; z: number }[],
  index: number,
  thicknessScale: number
): DerivedRmParams {
  const p = points[index]
  const pressure = (p.z ?? 0.5) * 255

  let speed = 0
  let direction = 0

  if (index > 0) {
    const prev = points[index - 1]
    const dx = p.x - prev.x
    const dy = p.y - prev.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    // Speed: approximate from distance (assume ~60fps, so distance per frame)
    // The rm speed values typically range 0-200+, distance in screen units
    speed = dist * 4 // Scale to approximate rm speed range
    // Direction: angle mapped to 0-255 range
    const angle = Math.atan2(dy, dx)
    direction = ((angle + Math.PI) / (Math.PI * 2)) * 255
  }

  // Width: in rm, this comes from the pen tilt sensor (0-~8 range)
  // We approximate from pressure
  const width = 2 + (pressure / 255) * thicknessScale * 2

  return { speed, direction, width, pressure }
}

// ============================================================
// Extended point data encoding/decoding
// ============================================================

/**
 * Encode extended rm point data to base64 string.
 * Each point stores 4 float32 values: speed, direction, width, pressure
 */
export function encodeRmPointData(data: DerivedRmParams[]): string {
  const buffer = new Float32Array(data.length * 4)
  for (let i = 0; i < data.length; i++) {
    buffer[i * 4] = data[i].speed
    buffer[i * 4 + 1] = data[i].direction
    buffer[i * 4 + 2] = data[i].width
    buffer[i * 4 + 3] = data[i].pressure
  }
  const bytes = new Uint8Array(buffer.buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * Decode extended rm point data from base64 string.
 */
export function decodeRmPointData(encoded: string): DerivedRmParams[] {
  if (!encoded) return []
  const binary = atob(encoded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  const buffer = new Float32Array(bytes.buffer)
  const result: DerivedRmParams[] = []
  for (let i = 0; i < buffer.length; i += 4) {
    result.push({
      speed: buffer[i],
      direction: buffer[i + 1],
      width: buffer[i + 2],
      pressure: buffer[i + 3],
    })
  }
  return result
}

// ============================================================
// SVG segment generation
// ============================================================

export interface RenderedSegment {
  points: { x: number; y: number }[]
  strokeWidth: number
  strokeColor: string
  opacity: number
  linecap: 'round' | 'square'
}

/**
 * Render a stroke as an array of segments, exactly matching the SVG exporter logic.
 * This is the core rendering function that produces the rm visual appearance.
 */
export function renderRmSegments(
  allPoints: { x: number; y: number }[],
  rmParams: DerivedRmParams[],
  brush: RmBrush,
  baseColor: [number, number, number],
  thicknessScale: number,
  /** Scale factor (from rm screen units to display pixels) */
  scaleFactor: number = 1
): RenderedSegment[] {
  const config = getBrushConfig(brush)
  const baseWidth = getEffectiveBaseWidth(brush, thicknessScale)
  const segments: RenderedSegment[] = []

  let lastSegmentWidth = 0
  let currentSegment: RenderedSegment | null = null

  for (let i = 0; i < allPoints.length; i++) {
    const params = rmParams[i] ?? { speed: 0, direction: 0, width: 2, pressure: 128 }
    const { speed, direction, width, pressure } = params

    if (i % config.segmentLength === 0) {
      // Start a new segment
      const strokeColor = config.getSegmentColor(baseColor, speed, direction, width, pressure, lastSegmentWidth)
      const segmentWidth = config.getSegmentWidth(baseWidth, speed, direction, width, pressure, lastSegmentWidth)
      const opacity = config.getSegmentOpacity(config.baseOpacity, speed, direction, width, pressure, lastSegmentWidth)

      currentSegment = {
        points: [],
        strokeWidth: Math.max(0.1, segmentWidth * scaleFactor),
        strokeColor,
        opacity,
        linecap: config.strokeLinecap,
      }

      // Join from previous segment's last point
      if (segments.length > 0 && i > 0) {
        const lastSeg = segments[segments.length - 1]
        const lastPoint = lastSeg.points[lastSeg.points.length - 1]
        if (lastPoint) {
          currentSegment.points.push({ ...lastPoint })
        }
      }

      segments.push(currentSegment)
      lastSegmentWidth = segmentWidth
    }

    if (currentSegment) {
      currentSegment.points.push({ x: allPoints[i].x, y: allPoints[i].y })
    }
  }

  return segments
}
