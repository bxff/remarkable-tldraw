/**
 * RmDrawTool - Drawing tool for rm-draw shapes.
 * 
 * Extends tldraw's state machine pattern with Idle and Drawing states.
 * Captures pen input and creates rm-draw shapes with the current brush type.
 */

import {
  StateNode,
  type TLStateNodeConstructor,
  Vec,
  b64Vecs,
  createShapeId,
  type TLPointerEventInfo,
  type TLKeyboardEventInfo,
  type VecModel,
} from 'tldraw'
import { RmBrush, type RmDrawShape } from '../shapes/rm-types'
import { deriveRmParams, encodeRmPointData } from '../shapes/rm-rendering'

// ============================================================
// Idle state
// ============================================================

class RmDrawIdle extends StateNode {
  static override id = 'idle'

  override onPointerDown(info: TLPointerEventInfo) {
    this.parent.transition('drawing', info)
  }

  override onEnter() {
    this.editor.setCursor({ type: 'cross', rotation: 0 })
  }

  override onCancel() {
    this.editor.setCurrentTool('select')
  }
}

// ============================================================
// Drawing state
// ============================================================

class RmDrawDrawing extends StateNode {
  static override id = 'drawing'

  private shapeId = '' as any
  private points: VecModel[] = []
  private isPen = false

  override onEnter(info: TLPointerEventInfo) {
    const { currentPagePoint } = this.editor.inputs
    const isPenEvent = info?.isPen ?? false
    this.isPen = isPenEvent

    const pressure = isPenEvent ? Math.min(1, (currentPagePoint.z ?? 0.5) * 1.25) : 0.5

    this.shapeId = createShapeId()
    this.points = [{ x: 0, y: 0, z: pressure }]

    // Get current brush from the tool's shared state
    const tool = this.parent as RmDrawTool
    const brush = tool.currentBrush

    this.editor.createShape<RmDrawShape>({
      id: this.shapeId,
      type: 'rm-draw',
      x: currentPagePoint.x,
      y: currentPagePoint.y,
      props: {
        segments: [
          {
            type: 'free',
            points: b64Vecs.encodePoints(this.points),
          },
        ],
        rmBrush: brush,
        color: tool.currentColor,
        thicknessScale: tool.currentThickness,
        isComplete: false,
        isPen: this.isPen,
        scale: 1,
        scaleX: 1,
        scaleY: 1,
        rmPointData: '',
      },
    })
  }

  override onPointerMove(info: TLPointerEventInfo) {
    const { currentPagePoint } = this.editor.inputs
    const shape = this.editor.getShape<RmDrawShape>(this.shapeId)
    if (!shape) return

    const pressure = this.isPen ? Math.min(1, (currentPagePoint.z ?? 0.5) * 1.25) : 0.5

    // Point relative to shape origin
    const newPoint: VecModel = {
      x: currentPagePoint.x - shape.x,
      y: currentPagePoint.y - shape.y,
      z: pressure,
    }

    // Skip if point is too close to previous
    const last = this.points[this.points.length - 1]
    if (last) {
      const dx = newPoint.x - last.x
      const dy = newPoint.y - last.y
      if (dx * dx + dy * dy < 1) return // Skip jitter
    }

    this.points.push(newPoint)

    this.editor.updateShape<RmDrawShape>({
      id: this.shapeId,
      type: 'rm-draw',
      props: {
        segments: [
          {
            type: 'free',
            points: b64Vecs.encodePoints(this.points),
          },
        ],
      },
    })
  }

  override onPointerUp() {
    this.complete()
  }

  override onCancel() {
    // Delete the shape if cancelled
    this.editor.deleteShape(this.shapeId)
    this.parent.transition('idle')
  }

  override onComplete() {
    this.complete()
  }

  private complete() {
    const shape = this.editor.getShape<RmDrawShape>(this.shapeId)
    if (!shape) {
      this.parent.transition('idle')
      return
    }

    // Derive and store rm parameters for the final stroke
    const allPoints = this.points.map((p) => ({
      x: p.x,
      y: p.y,
      z: p.z ?? 0.5,
    }))

    const rmParams = allPoints.map((_, i) =>
      deriveRmParams(allPoints, i, shape.props.thicknessScale)
    )

    this.editor.updateShape<RmDrawShape>({
      id: this.shapeId,
      type: 'rm-draw',
      props: {
        isComplete: true,
        rmPointData: encodeRmPointData(rmParams),
      },
    })

    this.points = []
    this.parent.transition('idle')
  }
}

// ============================================================
// Main tool
// ============================================================

export class RmDrawTool extends StateNode {
  static override id = 'rm-draw'
  static override initial = 'idle'
  static override isLockable = false
  static override useCoalescedEvents = true

  static override children(): TLStateNodeConstructor[] {
    return [RmDrawIdle, RmDrawDrawing]
  }

  /** Current brush type - set externally by the UI */
  currentBrush: RmBrush = RmBrush.Ballpoint

  /** Current color - set externally by the UI */
  currentColor: string = 'black'

  /** Current thickness scale */
  currentThickness: number = 2

  override onExit() {
    // nothing to clean up
  }
}
