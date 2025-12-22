/**
 * Tests for tldraw exporter
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { readTree } from '../../../rmscene/src/ts/index.ts';
import { treeToTldraw, resetIndexCounter, rmToTldraw } from '../../src/ts/exporters/tldraw.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rmTestDir = join(__dirname, '../rm');

describe('TLDraw Exporter', () => {
    beforeEach(() => {
        resetIndexCounter();
    });

    describe('Basic structure', () => {
        it('should create valid tldraw document structure', () => {
            const filePath = join(rmTestDir, 'Normal_AB.rm');
            const data = readFileSync(filePath);
            const doc = rmToTldraw(data);

            expect(doc).toBeDefined();
            expect(doc.tldrawFileFormatVersion).toBe(1);
            expect(doc.schema).toBeDefined();
            expect(doc.schema.schemaVersion).toBe(2);
            expect(doc.records).toBeDefined();
            expect(Array.isArray(doc.records)).toBe(true);
        });

        it('should include default records (document, pointer, page)', () => {
            const filePath = join(rmTestDir, 'Normal_AB.rm');
            const data = readFileSync(filePath);
            const doc = rmToTldraw(data);

            const documentRecord = doc.records.find(r => r.id === 'document:document');
            const pointerRecord = doc.records.find(r => r.id === 'pointer:pointer');
            const pageRecord = doc.records.find(r => r.id === 'page:page');

            expect(documentRecord).toBeDefined();
            expect(documentRecord.typeName).toBe('document');

            expect(pointerRecord).toBeDefined();
            expect(pointerRecord.typeName).toBe('pointer');

            expect(pageRecord).toBeDefined();
            expect(pageRecord.typeName).toBe('page');
        });
    });

    describe('Stroke conversion', () => {
        it('should convert strokes to draw shapes', () => {
            const filePath = join(rmTestDir, 'abcd.strokes.rm');
            const data = readFileSync(filePath);
            const doc = rmToTldraw(data);

            const drawShapes = doc.records.filter(r => r.type === 'draw');
            expect(drawShapes.length).toBeGreaterThan(0);

            for (const shape of drawShapes) {
                expect(shape.typeName).toBe('shape');
                expect(shape.parentId).toBe('page:page');
                expect(shape.props).toBeDefined();
                expect(shape.props.segments).toBeDefined();
                expect(Array.isArray(shape.props.segments)).toBe(true);
            }
        });

        it('should store points as JSON arrays', () => {
            const filePath = join(rmTestDir, 'dot.stroke.rm');
            const data = readFileSync(filePath);
            const doc = rmToTldraw(data);

            const drawShapes = doc.records.filter(r => r.type === 'draw');

            for (const shape of drawShapes) {
                for (const segment of shape.props.segments) {
                    // Points should be an array of objects
                    expect(Array.isArray(segment.points)).toBe(true);
                    if (segment.points.length > 0) {
                        expect(typeof segment.points[0].x).toBe('number');
                        expect(typeof segment.points[0].y).toBe('number');
                    }
                }
            }
        });

        it('should include shape properties', () => {
            const filePath = join(rmTestDir, 'writing_tools.rm');
            const data = readFileSync(filePath);
            const doc = rmToTldraw(data);

            const drawShapes = doc.records.filter(r => r.type === 'draw' || r.type === 'highlight');

            for (const shape of drawShapes) {
                expect(shape.props.color).toBeDefined();
                expect(shape.props.size).toBeDefined();
                expect(['s', 'm', 'l', 'xl']).toContain(shape.props.size);
                expect(typeof shape.x).toBe('number');
                expect(typeof shape.y).toBe('number');
            }
        });
    });

    describe('Text conversion', () => {
        it('should convert text to TLTextShape when present', () => {
            const filePath = join(rmTestDir, 'abcd.text.rm');
            const data = readFileSync(filePath);
            const doc = rmToTldraw(data);

            const textShapes = doc.records.filter(r => r.type === 'text');

            // Should have text shapes if file contains text
            if (textShapes.length > 0) {
                for (const shape of textShapes) {
                    expect(shape.typeName).toBe('shape');
                    expect(shape.props).toBeDefined();
                    expect(shape.props.richText).toBeDefined();
                    expect(shape.props.richText.type).toBe('doc');
                    expect(Array.isArray(shape.props.richText.content)).toBe(true);
                }
            }
        });
    });

    describe('Highlight conversion', () => {
        it('should convert highlighter strokes to highlight shapes', () => {
            const filePath = join(rmTestDir, 'writing_tools.rm');
            if (!existsSync(filePath)) return;

            const data = readFileSync(filePath);
            const doc = rmToTldraw(data);

            const highlightShapes = doc.records.filter(r => r.type === 'highlight');

            // File may or may not contain highlights
            for (const shape of highlightShapes) {
                expect(shape.typeName).toBe('shape');
                expect(shape.props.segments).toBeDefined();
            }
        });
    });

    describe('All .rm files', () => {
        const rmFiles = existsSync(rmTestDir)
            ? readdirSync(rmTestDir).filter(f => f.endsWith('.rm'))
            : [];

        for (const fileName of rmFiles) {
            it(`should convert ${fileName} to valid tldraw document`, () => {
                const filePath = join(rmTestDir, fileName);
                const data = readFileSync(filePath);

                // Should not throw
                const doc = rmToTldraw(data);

                expect(doc).toBeDefined();
                expect(doc.records).toBeDefined();
                expect(doc.records.length).toBeGreaterThanOrEqual(3); // At least default records

                // All shapes should have valid structure
                const shapes = doc.records.filter(r => r.typeName === 'shape');
                for (const shape of shapes) {
                    expect(shape.id).toBeDefined();
                    expect(shape.id.startsWith('shape:')).toBe(true);
                    expect(shape.type).toBeDefined();
                    expect(shape.parentId).toBeDefined();
                    expect(shape.index).toBeDefined();
                }
            });
        }
    });
});
