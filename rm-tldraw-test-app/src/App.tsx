/**
 * RM Brush Test App
 * 
 * Side-by-side comparison of rm brush rendering in tldraw.
 * - Left: tldraw canvas with rm-draw custom shapes
 * - Right: SVG reference panel showing expected output
 */

import { useState, useCallback, useRef } from 'react'
import { Tldraw, type Editor } from 'tldraw'
import 'tldraw/tldraw.css'

import { RmDrawShapeUtil } from './shapes/RmDrawShapeUtil'
import { RmDrawTool } from './tools/RmDrawTool'
import { RmBrush } from './shapes/rm-types'
import { importRmFile } from './import/rm-import'

const customShapeUtils = [RmDrawShapeUtil]
const customTools = [RmDrawTool]

const BRUSHES: { label: string; value: RmBrush }[] = [
  { label: 'Ballpoint', value: RmBrush.Ballpoint },
  { label: 'Fineliner', value: RmBrush.Fineliner },
  { label: 'Marker', value: RmBrush.Marker },
  { label: 'Pencil', value: RmBrush.Pencil },
  { label: 'Mech. Pencil', value: RmBrush.MechanicalPencil },
  { label: 'Brush', value: RmBrush.Brush },
  { label: 'Calligraphy', value: RmBrush.Calligraphy },
  { label: 'Highlighter', value: RmBrush.Highlighter },
  { label: 'Shader', value: RmBrush.Shader },
]

const THICKNESSES = [
  { label: 'Fine', value: 1 },
  { label: 'Medium', value: 2 },
  { label: 'Thick', value: 3.5 },
  { label: 'Extra', value: 5 },
]

const COLORS = [
  { label: 'Black', value: 'black' },
  { label: 'Grey', value: 'grey' },
  { label: 'Blue', value: 'blue' },
  { label: 'Red', value: 'red' },
  { label: 'Green', value: 'green' },
  { label: 'Yellow', value: 'yellow' },
]

export default function App() {
  const [currentBrush, setCurrentBrush] = useState<RmBrush>(RmBrush.Ballpoint)
  const [currentColor, setCurrentColor] = useState('black')
  const [currentThickness, setCurrentThickness] = useState(2)
  const [svgContent, setSvgContent] = useState<string | null>(null)
  const [svgFileName, setSvgFileName] = useState<string>('')
  const [importStatus, setImportStatus] = useState<string>('')
  const editorRef = useRef<Editor | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const rmFileInputRef = useRef<HTMLInputElement | null>(null)

  const handleBrushChange = useCallback((brush: RmBrush) => {
    setCurrentBrush(brush)
    const editor = editorRef.current
    if (editor) {
      const tool = editor.getStateDescendant('rm-draw') as RmDrawTool | undefined
      if (tool) {
        tool.currentBrush = brush
      }
    }
  }, [])

  const handleColorChange = useCallback((color: string) => {
    setCurrentColor(color)
    const editor = editorRef.current
    if (editor) {
      const tool = editor.getStateDescendant('rm-draw') as RmDrawTool | undefined
      if (tool) {
        tool.currentColor = color
      }
    }
  }, [])

  const handleThicknessChange = useCallback((thickness: number) => {
    setCurrentThickness(thickness)
    const editor = editorRef.current
    if (editor) {
      const tool = editor.getStateDescendant('rm-draw') as RmDrawTool | undefined
      if (tool) {
        tool.currentThickness = thickness
      }
    }
  }, [])

  const activateRmDrawTool = useCallback(() => {
    const editor = editorRef.current
    if (editor) {
      const tool = editor.getStateDescendant('rm-draw') as RmDrawTool | undefined
      if (tool) {
        tool.currentBrush = currentBrush
        tool.currentColor = currentColor
        tool.currentThickness = currentThickness
      }
      editor.setCurrentTool('rm-draw')
    }
  }, [currentBrush, currentColor, currentThickness])

  const handleSvgLoad = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleSvgFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      const content = ev.target?.result as string
      setSvgContent(content)
      setSvgFileName(file.name)
    }
    reader.readAsText(file)
  }, [])

  const handleRmImport = useCallback(() => {
    rmFileInputRef.current?.click()
  }, [])

  const handleRmFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const editor = editorRef.current
    if (!editor) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      const data = ev.target?.result as ArrayBuffer
      try {
        const result = importRmFile(data)

        // Create all shapes on the canvas
        for (const shapeData of result.shapes) {
          editor.createShape(shapeData as any)
        }

        // Show reference SVG
        setSvgContent(result.referenceSvg)
        setSvgFileName(`${file.name} (generated)`)

        // Zoom to fit the imported shapes
        const shapeIds = result.shapes.map((s) => s.id as any)
        if (shapeIds.length > 0) {
          editor.select(...shapeIds)
          editor.zoomToSelection()
          editor.deselect(...shapeIds)
        }

        setImportStatus(
          `Imported ${result.strokeCount} strokes` +
          (result.skippedErasers > 0 ? ` (${result.skippedErasers} erasers skipped)` : '')
        )

        // Clear status after 5 seconds
        setTimeout(() => setImportStatus(''), 5000)
      } catch (err: any) {
        setImportStatus(`Import failed: ${err.message}`)
        console.error('RM import error:', err)
      }
    }
    reader.readAsArrayBuffer(file)

    // Reset input so the same file can be re-imported
    e.target.value = ''
  }, [])

  const handleMount = useCallback((editor: Editor) => {
    editorRef.current = editor
    const tool = editor.getStateDescendant('rm-draw') as RmDrawTool | undefined
    if (tool) {
      tool.currentBrush = currentBrush
      tool.currentColor = currentColor
      tool.currentThickness = currentThickness
    }
  }, [])

  const handleClearCanvas = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    const ids = editor.getCurrentPageShapeIds()
    if (ids.size > 0) {
      editor.deleteShapes([...ids])
    }
  }, [])

  return (
    <div className="app-container">
      <div className="toolbar">
        <label>Brush:</label>
        <select
          value={currentBrush}
          onChange={(e) => handleBrushChange(e.target.value as RmBrush)}
        >
          {BRUSHES.map((b) => (
            <option key={b.value} value={b.value}>{b.label}</option>
          ))}
        </select>

        <div className="separator" />

        <label>Color:</label>
        <select
          value={currentColor}
          onChange={(e) => handleColorChange(e.target.value)}
        >
          {COLORS.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>

        <div className="separator" />

        <label>Thickness:</label>
        <select
          value={currentThickness}
          onChange={(e) => handleThicknessChange(Number(e.target.value))}
        >
          {THICKNESSES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>

        <div className="separator" />

        <button onClick={activateRmDrawTool} className="active">
          RM Draw
        </button>

        <div className="separator" />

        <button onClick={handleRmImport}>Import .rm File</button>
        <input
          ref={rmFileInputRef}
          type="file"
          accept=".rm"
          onChange={handleRmFileChange}
          style={{ display: 'none' }}
        />

        <button onClick={handleSvgLoad}>Load SVG Ref</button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".svg"
          onChange={handleSvgFileChange}
          style={{ display: 'none' }}
        />

        <button onClick={handleClearCanvas}>Clear</button>

        {importStatus && (
          <span className="import-status">{importStatus}</span>
        )}
      </div>

      <div className="editor-container">
        <Tldraw
          shapeUtils={customShapeUtils}
          tools={customTools}
          onMount={handleMount}
          persistenceKey="rm-brush-test"
        />

        {svgContent && (
          <div className="svg-reference-panel">
            <h3>
              SVG Reference: {svgFileName}
              <button
                onClick={() => setSvgContent(null)}
                style={{ float: 'right', border: 'none', background: 'none', cursor: 'pointer' }}
              >
                x
              </button>
            </h3>
            <div
              className="svg-content"
              dangerouslySetInnerHTML={{ __html: svgContent }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
