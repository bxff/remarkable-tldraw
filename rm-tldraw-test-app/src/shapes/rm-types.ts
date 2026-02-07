/**
 * Type definitions for rm-draw custom shape.
 * Standalone - no dependency on rmscene or rmc.
 */

import { T, TLBaseShape } from 'tldraw'

/** reMarkable brush types */
export enum RmBrush {
  Fineliner = 'fineliner',
  Ballpoint = 'ballpoint',
  Marker = 'marker',
  Pencil = 'pencil',
  MechanicalPencil = 'mechanicalPencil',
  Brush = 'brush',
  Calligraphy = 'calligraphy',
  Highlighter = 'highlighter',
  Shader = 'shader',
}

/** Extended per-point data from reMarkable (beyond x,y,z) */
export interface RmPointExtended {
  speed: number
  direction: number
  width: number
  pressure: number
}

/** Props for the rm-draw shape */
export interface RmDrawShapeProps {
  segments: { type: 'free' | 'straight'; points: string }[]
  rmBrush: RmBrush
  color: string
  thicknessScale: number
  isComplete: boolean
  isPen: boolean
  scale: number
  scaleX: number
  scaleY: number
  /** Base64-encoded extended per-point data for imported rm strokes */
  rmPointData: string
}

/** The rm-draw shape type */
export type RmDrawShape = TLBaseShape<'rm-draw', RmDrawShapeProps>

/** Module augmentation to register rm-draw as a valid TLShape */
declare module '@tldraw/tlschema' {
  interface TLGlobalShapePropsMap {
    'rm-draw': RmDrawShapeProps
  }
}

/** Validators for the rm-draw shape props */
export const rmDrawShapeProps = {
  segments: T.arrayOf(
    T.object({
      type: T.literalEnum('free', 'straight'),
      points: T.string,
    })
  ),
  rmBrush: T.literalEnum(
    'fineliner',
    'ballpoint',
    'marker',
    'pencil',
    'mechanicalPencil',
    'brush',
    'calligraphy',
    'highlighter',
    'shader'
  ),
  color: T.string,
  thicknessScale: T.number,
  isComplete: T.boolean,
  isPen: T.boolean,
  scale: T.number,
  scaleX: T.number,
  scaleY: T.number,
  rmPointData: T.string,
}
