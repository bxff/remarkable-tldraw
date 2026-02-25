/**
 * Import .rm files → native tldraw draw shapes with RM metadata.
 *
 * Creates standard TLDrawShape with RM per-point data stored in
 * shape.meta for rendering by RmDrawShapeUtil.
 *
 * Uses tldraw v4.4.0 format: segment.path = delta-encoded base64 string.
 * Uses compressLegacySegments to convert VecModel[] → path string.
 */

import { readTree } from '@rmscene/scene-tree'
import type { SceneTree } from '@rmscene/scene-tree'
import { isLine, isGroup, Pen, PenColor } from '@rmscene/scene-items'
import type { Line, Point, Group } from '@rmscene/scene-items'
import { treeToSvg } from '@rmc/exporters/svg'
import { createShapeId, compressLegacySegments } from 'tldraw'
import type { VecModel } from 'tldraw'
import { encodeRmPointData } from './rm-rendering'
import type { RmBrush, RmPointData } from './rm-rendering'

const RM_SCALE = 72 / 226

function penToRmBrush(pen: Pen): RmBrush | null {
    switch (pen) {
        case Pen.PAINTBRUSH_1: case Pen.PAINTBRUSH_2: return 'brush'
        case Pen.PENCIL_1: case Pen.PENCIL_2: return 'pencil'
        case Pen.BALLPOINT_1: case Pen.BALLPOINT_2: return 'ballpoint'
        case Pen.MARKER_1: case Pen.MARKER_2: return 'marker'
        case Pen.FINELINER_1: case Pen.FINELINER_2: return 'fineliner'
        case Pen.HIGHLIGHTER_1: case Pen.HIGHLIGHTER_2: return 'highlighter'
        case Pen.MECHANICAL_PENCIL_1: case Pen.MECHANICAL_PENCIL_2: return 'mechanicalPencil'
        case Pen.CALIGRAPHY: return 'calligraphy'
        case Pen.SHADER: return 'shader'
        case Pen.ERASER: case Pen.ERASER_AREA: return null
        default: return 'ballpoint'
    }
}

function penColorToName(color: PenColor): string {
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

function lineToShape(line: Line, offsetX: number, offsetY: number) {
    const brush = penToRmBrush(line.tool)
    if (!brush) return null
    if (line.points.length === 0) return null

    const scaled = line.points.map((p) => ({
        x: (p.x + offsetX) * RM_SCALE,
        y: (p.y + offsetY) * RM_SCALE,
    }))

    let minX = Infinity, minY = Infinity
    for (const p of scaled) {
        if (p.x < minX) minX = p.x
        if (p.y < minY) minY = p.y
    }

    const relPoints: VecModel[] = scaled.map((p) => ({
        x: p.x - minX,
        y: p.y - minY,
        z: 0.5,
    }))

    // Convert VecModel[] → v4.4.0 path format using compressLegacySegments
    const legacySegments = [{ type: 'free' as const, points: relPoints }]
    const segments = compressLegacySegments(legacySegments)

    const rmParams: RmPointData[] = line.points.map((p: Point) => ({
        speed: p.speed,
        direction: p.direction,
        width: p.width,
        pressure: p.pressure,
    }))

    return {
        id: createShapeId(),
        type: 'draw' as const,
        x: minX,
        y: minY,
        props: {
            segments,
            color: 'black' as const,
            fill: 'none' as const,
            dash: 'draw' as const,
            size: 'm' as const,
            isComplete: true,
            isClosed: false,
            isPen: true,
            scale: 1, // coordinates already scaled during import
        },
        meta: {
            rmBrush: brush,
            rmPointData: encodeRmPointData(rmParams),
            rmColor: penColorToName(line.color),
            rmThicknessScale: line.thicknessScale,
        },
    }
}

function collectLines(group: Group, ox: number, oy: number) {
    const shapes: ReturnType<typeof lineToShape>[] = []
    for (const [, item] of group.children.entries()) {
        if (isLine(item)) {
            const s = lineToShape(item, ox, oy)
            if (s) shapes.push(s)
        } else if (isGroup(item)) {
            shapes.push(...collectLines(item, ox, oy))
        }
    }
    return shapes.filter(Boolean) as NonNullable<typeof shapes[number]>[]
}

export interface RmImportResult {
    shapes: ReturnType<typeof lineToShape>[]
    referenceSvg: string
    strokeCount: number
    skippedErasers: number
}

export function importRmFile(data: ArrayBuffer | Uint8Array): RmImportResult {
    const tree: SceneTree = readTree(data)
    const referenceSvg = treeToSvg(tree)
    const shapes = collectLines(tree.root, 0, 0)

    let eraserCount = 0
    const count = (g: Group) => {
        for (const [, item] of g.children.entries()) {
            if (isLine(item)) {
                if (item.tool === Pen.ERASER || item.tool === Pen.ERASER_AREA) eraserCount++
            } else if (isGroup(item)) count(item)
        }
    }
    count(tree.root)

    return { shapes, referenceSvg, strokeCount: shapes.length, skippedErasers: eraserCount }
}
