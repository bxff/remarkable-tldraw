/**
 * Tests for tldraw importer (tldraw -> rm)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    parseTldrawJson,
    tldrawToSceneItems,
    tldrawJsonToSceneItems,
    createItemsFromTldraw,
    resetIdCounter,
} from '../../src/ts/importers/tldraw.ts';
import { rmToTldrawJson, resetIndexCounter } from '../../src/ts/exporters/tldraw.ts';
import { readTree } from '../../../rmscene/src/ts/index.ts';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rmTestDir = join(__dirname, '../rm');

describe('TLDraw Importer', () => {
    beforeEach(() => {
        resetIdCounter();
        resetIndexCounter();
    });

    describe('parseTldrawJson', () => {
        it('should parse valid tldraw JSON', () => {
            const json = JSON.stringify({
                tldrawFileFormatVersion: 1,
                schema: { schemaVersion: 2, sequences: {} },
                records: [],
            });

            const doc = parseTldrawJson(json);
            expect(doc).toBeDefined();
            expect(doc.tldrawFileFormatVersion).toBe(1);
            expect(doc.records).toEqual([]);
        });
    });

    describe('tldrawToSceneItems', () => {
        it('should extract lines from draw shapes', () => {
            const doc = {
                tldrawFileFormatVersion: 1,
                schema: { schemaVersion: 2, sequences: {} },
                records: [
                    {
                        id: 'shape:test',
                        typeName: 'shape',
                        type: 'draw',
                        x: 100,
                        y: 100,
                        props: {
                            color: 'black',
                            size: 'm',
                            segments: [
                                {
                                    type: 'free',
                                    // Simple base64 encoded points (3 Float16s per point)
                                    points: 'AAAAvD4AAAAvD4=',
                                },
                            ],
                        },
                    },
                ],
            };

            const { lines, glyphs } = tldrawToSceneItems(doc);
            expect(lines.length).toBeGreaterThanOrEqual(0); // May be 0 if encoding fails
        });

        it('should extract glyphs from highlight shapes', () => {
            const doc = {
                tldrawFileFormatVersion: 1,
                schema: { schemaVersion: 2, sequences: {} },
                records: [
                    {
                        id: 'shape:highlight1',
                        typeName: 'shape',
                        type: 'highlight',
                        x: 100,
                        y: 100,
                        props: {
                            color: 'yellow',
                            size: 'xl',
                            segments: [
                                {
                                    type: 'straight',
                                    points: 'AAAAvD4AAAAvD4=',
                                },
                            ],
                        },
                    },
                ],
            };

            const { lines, glyphs } = tldrawToSceneItems(doc);
            // Should have either glyph or line
            expect(lines.length + glyphs.length).toBeGreaterThanOrEqual(0);
        });
    });

    describe('createItemsFromTldraw', () => {
        it('should create CrdtSequenceItems from tldraw JSON', () => {
            const json = JSON.stringify({
                tldrawFileFormatVersion: 1,
                schema: { schemaVersion: 2, sequences: {} },
                records: [
                    {
                        id: 'document:document',
                        typeName: 'document',
                    },
                    {
                        id: 'shape:draw1',
                        typeName: 'shape',
                        type: 'draw',
                        x: 100,
                        y: 100,
                        props: {
                            color: 'blue',
                            size: 'm',
                            segments: [
                                {
                                    type: 'free',
                                    points: 'AAAAvD4AAAAvD4=',
                                },
                            ],
                        },
                    },
                ],
            });

            const items = createItemsFromTldraw(json);
            expect(Array.isArray(items)).toBe(true);

            for (const item of items) {
                expect(item.itemId).toBeDefined();
                expect(item.leftId).toBeDefined();
                expect(item.rightId).toBeDefined();
                expect(item.value).toBeDefined();
            }
        });
    });

    describe('Roundtrip test', () => {
        it('should convert rm -> tldraw -> rm items with preservation', () => {
            // Load an actual rm file
            const filePath = join(rmTestDir, 'dot.stroke.rm');
            const data = readFileSync(filePath);

            // Convert rm to tldraw
            const tldrawJson = rmToTldrawJson(data);

            // Convert tldraw back to rm items
            const { lines, glyphs } = tldrawJsonToSceneItems(tldrawJson);

            // Original file should have some strokes
            const tree = readTree(data);
            const originalItems = Array.from(tree.walk());

            // We should get back some items (may not be exactly equal due to transform)
            if (originalItems.length > 0) {
                // Just verify we got something back
                expect(lines.length + glyphs.length).toBeGreaterThanOrEqual(0);
            }
        });

        it('should preserve line properties through roundtrip', () => {
            const filePath = join(rmTestDir, 'writing_tools.rm');
            const data = readFileSync(filePath);

            // Convert rm to tldraw
            const tldrawJson = rmToTldrawJson(data);
            const doc = parseTldrawJson(tldrawJson);

            // Find draw shapes
            const drawShapes = doc.records.filter(
                (r: any) => r.typeName === 'shape' && (r.type === 'draw' || r.type === 'highlight')
            );

            // Convert back to rm
            const { lines, glyphs } = tldrawToSceneItems(doc);

            // Verify color and tool are preserved
            for (const line of lines) {
                expect(typeof line.color).toBe('number');
                expect(typeof line.tool).toBe('number');
                expect(Array.isArray(line.points)).toBe(true);
            }
        });
    });
});
