/**
 * RmDrawShapeUtil — Extends tldraw's built-in DrawShapeUtil.
 *
 * When shape.meta.rmBrush is set, renders using rmrl per-point-pair
 * SVG lines. Otherwise falls through to tldraw's default rendering.
 *
 * Uses v4.4.0 API: getPointsFromDrawSegments for decoding segment.path
 */

import { DrawShapeUtil, SVGContainer, getPointsFromDrawSegments } from 'tldraw'
import type { TLDrawShape } from 'tldraw'
import { renderRmLines, decodeRmPointData, RM_COLORS, RM_SCALE } from './rm-rendering'
import type { RmBrush, RmPointData } from './rm-rendering'

function hasRmBrush(shape: TLDrawShape): boolean {
    return !!(shape.meta as any)?.rmBrush
}

function getPoints(shape: TLDrawShape): { x: number; y: number; z?: number }[] {
    if (!shape.props.segments || shape.props.segments.length === 0) return []
    try {
        // v4.4.0: uses getPointsFromDrawSegments to decode path strings
        const vecs = getPointsFromDrawSegments(shape.props.segments)
        return vecs.map(v => ({ x: v.x, y: v.y, z: v.z }))
    } catch {
        return []
    }
}

export class RmDrawShapeUtil extends DrawShapeUtil {
    static override type = 'draw' as const

    override component(shape: TLDrawShape) {
        if (!hasRmBrush(shape)) {
            return super.component(shape)
        }

        const meta = shape.meta as {
            rmBrush: RmBrush
            rmPointData?: string
            rmColor?: string
        }

        const points = getPoints(shape)
        if (points.length < 2) {
            return super.component(shape)
        }

        const rmData: RmPointData[] | null = meta.rmPointData
            ? decodeRmPointData(meta.rmPointData)
            : null

        const baseColor = RM_COLORS[meta.rmColor ?? 'black'] ?? RM_COLORS.black

        const svgLines = renderRmLines(
            points,
            rmData,
            meta.rmBrush,
            baseColor,
            1,        // coordScale: points already in shape-local coords
            RM_SCALE, // widthScale: stroke widths need RM_SCALE to match coords
        )

        return (
            <SVGContainer style={{ overflow: 'visible' }}>
                <g dangerouslySetInnerHTML={{ __html: svgLines }} />
            </SVGContainer>
        )
    }
}
