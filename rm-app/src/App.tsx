/**
 * RM Drawing App
 *
 * tldraw with reMarkable brush rendering integrated.
 * - RM brushes in TopPanel (above canvas, below menu bar)
 * - Import .rm files → native draw shapes with RM meta
 * - RmDrawShapeUtil overrides rendering for RM-tagged shapes
 */

import { useCallback, useRef, useState } from 'react'
import {
    Tldraw,
    type Editor,
    type TLComponents,
    useEditor,
} from 'tldraw'
import 'tldraw/tldraw.css'
import { RmDrawShapeUtil } from './rm/RmDrawShapeUtil'
import type { RmBrush } from './rm/rm-rendering'
import { importRmFile } from './rm/rm-import'

const customShapeUtils = [RmDrawShapeUtil]

const RM_BRUSHES: { label: string; value: RmBrush }[] = [
    { label: '🖊️ Ballpoint', value: 'ballpoint' },
    { label: '✒️ Fineliner', value: 'fineliner' },
    { label: '🖍️ Marker', value: 'marker' },
    { label: '✏️ Pencil', value: 'pencil' },
    { label: '🔧 Mech Pencil', value: 'mechanicalPencil' },
    { label: '🖌️ Paintbrush', value: 'brush' },
    { label: '🪶 Calligraphy', value: 'calligraphy' },
    { label: '🟡 Highlighter', value: 'highlighter' },
]

// Module-level ref for the current RM brush (accessible by the sideEffect)
let currentRmBrush: RmBrush | null = null

/** TopPanel: RM brush picker + import button */
function RmTopPanel() {
    const editor = useEditor()
    const [activeBrush, setActiveBrush] = useState<RmBrush | null>(currentRmBrush)
    const [status, setStatus] = useState('')
    const fileInputRef = useRef<HTMLInputElement>(null)

    const selectBrush = useCallback((brush: RmBrush) => {
        currentRmBrush = brush
        setActiveBrush(brush)
        editor.setCurrentTool('draw')
    }, [editor])

    const clearBrush = useCallback(() => {
        currentRmBrush = null
        setActiveBrush(null)
    }, [])

    const handleImport = useCallback(() => {
        fileInputRef.current?.click()
    }, [])

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        const reader = new FileReader()
        reader.onload = (ev) => {
            const data = ev.target?.result as ArrayBuffer
            try {
                const result = importRmFile(data)
                for (const s of result.shapes) {
                    editor.createShape(s as any)
                }
                const ids = result.shapes.map(s => s.id)
                if (ids.length > 0) {
                    editor.select(...ids)
                    editor.zoomToSelection()
                    editor.deselect(...ids)
                }
                setStatus(`✓ ${result.strokeCount} strokes imported`)
                setTimeout(() => setStatus(''), 4000)
            } catch (err: any) {
                setStatus(`✗ ${err.message}`)
                console.error('Import error:', err)
            }
        }
        reader.readAsArrayBuffer(file)
        e.target.value = ''
    }, [editor])

    return (
        <div style={{
            display: 'flex',
            gap: 3,
            padding: '4px 8px',
            alignItems: 'center',
            justifyContent: 'center',
            flexWrap: 'wrap',
            pointerEvents: 'all',
        }}>
            {RM_BRUSHES.map((b) => (
                <button
                    key={b.value}
                    onClick={() => selectBrush(b.value)}
                    className="rm-brush-btn"
                    data-active={activeBrush === b.value}
                >
                    {b.label}
                </button>
            ))}

            <span className="rm-sep" />

            <button
                onClick={clearBrush}
                className="rm-brush-btn"
                data-active={activeBrush === null}
            >
                ✏️ tldraw
            </button>

            <span className="rm-sep" />

            <button onClick={handleImport} className="rm-brush-btn">
                📥 Import .rm
            </button>
            <input
                ref={fileInputRef}
                type="file"
                accept=".rm"
                onChange={handleFileChange}
                style={{ display: 'none' }}
            />

            {status && <span style={{ fontSize: 11, color: '#666' }}>{status}</span>}
        </div>
    )
}

const components: TLComponents = {
    TopPanel: RmTopPanel,
}

export default function App() {
    const handleMount = useCallback((editor: Editor) => {
        // Inject rmBrush into newly created draw shapes
        editor.sideEffects.registerBeforeCreateHandler('shape', (shape) => {
            if (shape.type === 'draw' && currentRmBrush) {
                return {
                    ...shape,
                    meta: {
                        ...shape.meta,
                        rmBrush: currentRmBrush,
                    },
                }
            }
            return shape
        })

        // Auto-import writing_tools.rm if canvas is empty
        if (editor.getCurrentPageShapeIds().size === 0) {
            fetch('/writing_tools.rm')
                .then(r => r.arrayBuffer())
                .then(data => {
                    try {
                        const result = importRmFile(data)
                        for (const s of result.shapes) {
                            editor.createShape(s as any)
                        }
                        const ids = result.shapes.map(s => s.id)
                        if (ids.length > 0) {
                            editor.select(...ids)
                            editor.zoomToSelection()
                            editor.deselect(...ids)
                        }
                    } catch (err) {
                        console.warn('Could not auto-load writing_tools.rm:', err)
                    }
                })
                .catch(() => { }) // ignore if file not present
        }
    }, [])

    return (
        <div style={{ position: 'fixed', inset: 0 }}>
            <style>{`
        .rm-brush-btn {
          padding: 3px 8px;
          font-size: 11px;
          cursor: pointer;
          border: 1px solid transparent;
          border-radius: 6px;
          background: transparent;
          white-space: nowrap;
          transition: all 0.1s;
        }
        .rm-brush-btn:hover {
          background: #f0f0f0;
        }
        .rm-brush-btn[data-active="true"] {
          background: #e0e0e0;
          border-color: #999;
          font-weight: 600;
        }
        .rm-sep {
          width: 1px;
          height: 16px;
          background: #ddd;
          margin: 0 2px;
        }
        /* Override tldraw's pointer-events:none on top panel overlay */
        .tlui-top-panel,
        .tlui-top-panel__center {
          pointer-events: all !important;
        }
      `}</style>
            <Tldraw
                shapeUtils={customShapeUtils}
                components={components}
                onMount={handleMount}
                persistenceKey="rm-app-v2"
            />
        </div>
    )
}
