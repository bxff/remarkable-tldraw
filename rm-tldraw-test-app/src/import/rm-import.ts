/**
 * Import .rm files and convert strokes to rm-draw shapes.
 *
 * Parses .rm binary data using rmscene, walks the tree to extract Line items,
 * and converts them to rm-draw shape creation data with original per-point
 * rm parameters preserved.
 *
 * NOTE: The reference SVG generated here (via treeToSvg) does NOT match
 * the reMarkable tablet's actual display. See the accuracy note in
 * rm-rendering.ts for details. The reference SVG is useful for verifying
 * that our rm-draw rendering matches the SVG exporter, but neither is
 * ground truth for the tablet's real appearance.
 */

import { readTree } from '@rmscene/scene-tree'
import type { SceneTree } from '@rmscene/scene-tree'
import { isLine, isGroup, Pen, PenColor } from '@rmscene/scene-items'
import type { Line, Point, Group } from '@rmscene/scene-items'
import { treeToSvg } from '@rmc/exporters/svg'
import { b64Vecs, createShapeId } from 'tldraw'
import type { VecModel } from 'tldraw'

import { RmBrush } from '../shapes/rm-types'
import type { RmDrawShapeProps } from '../shapes/rm-types'
import { encodeRmPointData, type DerivedRmParams } from '../shapes/rm-rendering'

// Same scale as SVG exporter: 72 DPI / 226 DPI
const RM_SCALE = 72 / 226

// ============================================================
// Pen -> RmBrush mapping
// ============================================================

function penToRmBrush(pen: Pen): RmBrush | null {
  switch (pen) {
    case Pen.PAINTBRUSH_1:
    case Pen.PAINTBRUSH_2:
      return RmBrush.Brush
    case Pen.PENCIL_1:
    case Pen.PENCIL_2:
      return RmBrush.Pencil
    case Pen.BALLPOINT_1:
    case Pen.BALLPOINT_2:
      return RmBrush.Ballpoint
    case Pen.MARKER_1:
    case Pen.MARKER_2:
      return RmBrush.Marker
    case Pen.FINELINER_1:
    case Pen.FINELINER_2:
      return RmBrush.Fineliner
    case Pen.HIGHLIGHTER_1:
    case Pen.HIGHLIGHTER_2:
      return RmBrush.Highlighter
    case Pen.MECHANICAL_PENCIL_1:
    case Pen.MECHANICAL_PENCIL_2:
      return RmBrush.MechanicalPencil
    case Pen.CALIGRAPHY:
      return RmBrush.Calligraphy
    case Pen.SHADER:
      return RmBrush.Shader
    case Pen.ERASER:
    case Pen.ERASER_AREA:
      return null // Skip erasers
    default:
      return RmBrush.Ballpoint // Fallback
  }
}

// ============================================================
// PenColor -> color name mapping
// Uses exact RGB values matching RM_COLOR_MAP in rm-rendering.ts
// ============================================================

function penColorToColorName(color: PenColor): string {
  switch (color) {
    case PenColor.BLACK: return 'black'
    case PenColor.GRAY: return 'grey'
    case PenColor.WHITE: return 'white'
    case PenColor.YELLOW: return 'yellow'
    case PenColor.GREEN: return 'green'
    case PenColor.PINK: return 'pink'
    case PenColor.BLUE: return 'blue'
    case PenColor.RED: return 'red'
    case PenColor.GRAY_OVERLAP: return 'grey-overlap'
    case PenColor.HIGHLIGHT: return 'highlight'
    case PenColor.GREEN_2: return 'light-green'
    case PenColor.CYAN: return 'light-blue'
    case PenColor.MAGENTA: return 'violet'
    case PenColor.YELLOW_2: return 'yellow-2'
    default: return 'black'
  }
}

// ============================================================
// Shape creation data
// ============================================================

export interface ImportedShapeData {
  id: string
  type: 'rm-draw'
  x: number
  y: number
  props: RmDrawShapeProps
}

/**
 * Convert a single rm Line to an rm-draw shape creation record.
 * Points are scaled by RM_SCALE to match SVG output dimensions.
 * Original rm per-point data (speed, direction, width, pressure) is preserved.
 */
function lineToShapeData(line: Line, offsetX: number, offsetY: number): ImportedShapeData | null {
  const brush = penToRmBrush(line.tool)
  if (!brush) return null // Skip erasers

  if (line.points.length === 0) return null

  // Scale points and compute bounding box
  const scaledPoints = line.points.map((p) => ({
    x: (p.x + offsetX) * RM_SCALE,
    y: (p.y + offsetY) * RM_SCALE,
  }))

  let minX = Infinity, minY = Infinity
  for (const p of scaledPoints) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
  }

  // Make points relative to shape origin (minX, minY)
  const relativePoints: VecModel[] = scaledPoints.map((p) => ({
    x: p.x - minX,
    y: p.y - minY,
    z: 0.5, // Placeholder; actual pressure is in rmPointData
  }))

  // Encode points as b64 for tldraw segment format
  const encodedPoints = b64Vecs.encodePoints(relativePoints)

  // Encode original rm per-point data
  const rmParams: DerivedRmParams[] = line.points.map((p: Point) => ({
    speed: p.speed,
    direction: p.direction,
    width: p.width,
    pressure: p.pressure,
  }))
  const rmPointData = encodeRmPointData(rmParams)

  const colorName = penColorToColorName(line.color)

  return {
    id: createShapeId(),
    type: 'rm-draw',
    x: minX,
    y: minY,
    props: {
      segments: [{ type: 'free', points: encodedPoints }],
      rmBrush: brush,
      color: colorName,
      thicknessScale: line.thicknessScale,
      isComplete: true,
      isPen: true,
      scale: RM_SCALE, // Scale factor for stroke widths
      scaleX: 1,
      scaleY: 1,
      rmPointData,
    },
  }
}

/**
 * Recursively collect all Lines from a Group and its children.
 */
function collectLines(group: Group, offsetX: number, offsetY: number): ImportedShapeData[] {
  const shapes: ImportedShapeData[] = []

  for (const [, item] of group.children.entries()) {
    if (isLine(item)) {
      const shape = lineToShapeData(item, offsetX, offsetY)
      if (shape) shapes.push(shape)
    } else if (isGroup(item)) {
      // Groups can have anchor offsets but for now we pass through
      shapes.push(...collectLines(item, offsetX, offsetY))
    }
  }

  return shapes
}

// ============================================================
// Public API
// ============================================================

export interface RmImportResult {
  shapes: ImportedShapeData[]
  referenceSvg: string
  strokeCount: number
  skippedErasers: number
}

/**
 * Parse an .rm file and return shape creation data + reference SVG.
 */
export function importRmFile(data: ArrayBuffer | Uint8Array): RmImportResult {
  const tree: SceneTree = readTree(data)

  // Generate reference SVG for comparison
  const referenceSvg = treeToSvg(tree)

  // Collect all strokes
  const shapes = collectLines(tree.root, 0, 0)

  // Count erasers that were skipped
  let totalLines = 0
  let eraserCount = 0
  const countLines = (group: Group) => {
    for (const [, item] of group.children.entries()) {
      if (isLine(item)) {
        totalLines++
        if (item.tool === Pen.ERASER || item.tool === Pen.ERASER_AREA) {
          eraserCount++
        }
      } else if (isGroup(item)) {
        countLines(item)
      }
    }
  }
  countLines(tree.root)

  return {
    shapes,
    referenceSvg,
    strokeCount: shapes.length,
    skippedErasers: eraserCount,
  }
}
