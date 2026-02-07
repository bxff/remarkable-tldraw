/**
 * RmDrawShapeUtil - Custom shape that renders strokes with reMarkable brush rendering.
 *
 * Uses tldraw's freehand engine (getStrokePoints) for smooth input/streamlining,
 * but renders using rm-style segmented polylines with per-segment color/width/opacity.
 *
 * The rendering formulas are ported from rmc's SVG exporter (writing-tools.ts).
 * These match the SVG exporter output but NOT the actual reMarkable tablet display.
 * See the accuracy note in rm-rendering.ts for details.
 */

import {
  SVGContainer,
  ShapeUtil,
  Polyline2d,
  Circle2d,
  Box,
  Vec,
  b64Vecs,
  type TLResizeInfo,
  type VecLike,
} from 'tldraw'
import { RmDrawShape, rmDrawShapeProps, RmBrush } from './rm-types'
import {
  renderRmSegments,
  deriveRmParams,
  decodeRmPointData,
  getBaseColor,
  getBrushConfig,
  getEffectiveBaseWidth,
  type DerivedRmParams,
  type RenderedSegment,
} from './rm-rendering'

export class RmDrawShapeUtil extends ShapeUtil<RmDrawShape> {
  static override type = 'rm-draw' as const
  static override props = rmDrawShapeProps

  override getDefaultProps(): RmDrawShape['props'] {
    return {
      segments: [],
      rmBrush: RmBrush.Ballpoint,
      color: 'black',
      thicknessScale: 2,
      isComplete: false,
      isPen: false,
      scale: 1,
      scaleX: 1,
      scaleY: 1,
      rmPointData: '',
    }
  }

  getGeometry(shape: RmDrawShape) {
    const points = this.getDecodedPoints(shape)

    const sw = getEffectiveBaseWidth(shape.props.rmBrush, shape.props.thicknessScale) * shape.props.scale

    // Dot detection
    if (shape.props.segments.length === 1) {
      const box = Box.FromPoints(points)
      if (box.width < sw * 2 && box.height < sw * 2) {
        return new Circle2d({
          x: -sw,
          y: -sw,
          radius: sw,
          isFilled: true,
        })
      }
    }

    if (points.length < 2) {
      return new Circle2d({
        x: -sw,
        y: -sw,
        radius: sw,
        isFilled: true,
      })
    }

    return new Polyline2d({ points: points.map((p) => new Vec(p.x, p.y, p.z)) })
  }

  component(shape: RmDrawShape) {
    return (
      <SVGContainer>
        <RmDrawSvg shape={shape} />
      </SVGContainer>
    )
  }

  indicator(shape: RmDrawShape) {
    const points = this.getDecodedPoints(shape)
    const sw = getEffectiveBaseWidth(shape.props.rmBrush, shape.props.thicknessScale) * shape.props.scale

    if (points.length < 2) {
      const r = (sw + 1) * 0.5
      const p = points[0] ?? { x: 0, y: 0 }
      return (
        <circle cx={p.x} cy={p.y} r={r} />
      )
    }

    // Simple polyline path for indicator
    const d = points.reduce(
      (acc, p, i) => acc + `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`,
      ''
    )
    return <path d={d} />
  }

  override onResize(shape: RmDrawShape, info: TLResizeInfo<RmDrawShape>) {
    const { scaleX, scaleY } = info
    return {
      props: {
        scaleX: scaleX * shape.props.scaleX,
        scaleY: scaleY * shape.props.scaleY,
      },
    }
  }

  expandSelectionOutlinePx(shape: RmDrawShape): number {
    const baseWidth = getEffectiveBaseWidth(shape.props.rmBrush, shape.props.thicknessScale)
    return (baseWidth / 2) * shape.props.scale
  }

  /** Decode points from the base64-encoded segments */
  private getDecodedPoints(shape: RmDrawShape): VecLike[] {
    const allPoints: VecLike[] = []
    for (const seg of shape.props.segments) {
      if (!seg.points) continue
      const decoded = b64Vecs.decodePoints(seg.points)
      for (const p of decoded) {
        allPoints.push({
          x: p.x * (shape.props.scaleX ?? 1),
          y: p.y * (shape.props.scaleY ?? 1),
          z: p.z,
        })
      }
    }
    return allPoints
  }
}

// ============================================================
// Internal SVG rendering component
// ============================================================

function RmDrawSvg({ shape }: { shape: RmDrawShape }) {
  const allPoints: { x: number; y: number; z: number }[] = []
  for (const seg of shape.props.segments) {
    if (!seg.points) continue
    const decoded = b64Vecs.decodePoints(seg.points)
    for (const p of decoded) {
      allPoints.push({
        x: p.x * (shape.props.scaleX ?? 1),
        y: p.y * (shape.props.scaleY ?? 1),
        z: p.z ?? 0.5,
      })
    }
  }

  if (allPoints.length === 0) return null

  // Get rm parameters: either from stored extended data, or derived from points
  let rmParams: DerivedRmParams[]

  if (shape.props.rmPointData) {
    // Imported stroke: use stored rm parameters
    rmParams = decodeRmPointData(shape.props.rmPointData)
    // Ensure we have the right number of params
    while (rmParams.length < allPoints.length) {
      rmParams.push({ speed: 0, direction: 0, width: 2, pressure: 128 })
    }
  } else {
    // Live-drawn stroke: derive parameters from point data
    rmParams = allPoints.map((_, i) =>
      deriveRmParams(allPoints, i, shape.props.thicknessScale)
    )
  }

  const baseColor = getBaseColor(shape.props.color)

  // Render the segments
  const segments = renderRmSegments(
    allPoints,
    rmParams,
    shape.props.rmBrush as RmBrush,
    baseColor,
    shape.props.thicknessScale,
    shape.props.scale
  )

  // If no segments produced (e.g., single point), render a dot
  if (segments.length === 0 || (segments.length === 1 && segments[0].points.length < 2)) {
    const config = getBrushConfig(shape.props.rmBrush as RmBrush)
    const baseWidth = getEffectiveBaseWidth(shape.props.rmBrush as RmBrush, shape.props.thicknessScale)
    const r = (baseWidth * shape.props.scale) / 2
    const p = allPoints[0]
    return (
      <circle
        cx={p.x}
        cy={p.y}
        r={Math.max(r, 1)}
        fill={`rgb(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]})`}
        opacity={config.baseOpacity}
      />
    )
  }

  return (
    <g>
      {segments.map((seg, i) => (
        <RmSegmentPolyline key={i} segment={seg} />
      ))}
    </g>
  )
}

function RmSegmentPolyline({ segment }: { segment: RenderedSegment }) {
  if (segment.points.length < 2) return null

  const pointsStr = segment.points
    .map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(' ')

  return (
    <polyline
      points={pointsStr}
      fill="none"
      stroke={segment.strokeColor}
      strokeWidth={Math.max(segment.strokeWidth, 0.5)}
      strokeLinecap={segment.linecap}
      strokeLinejoin="round"
      opacity={segment.opacity}
    />
  )
}
