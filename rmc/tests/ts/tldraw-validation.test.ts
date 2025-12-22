/**
 * TLDraw Schema Validation Tests
 * 
 * These tests validate that the TLDraw exporter produces output that passes
 * tldraw's schema validation. This catches issues like missing required fields
 * (e.g., richText vs text) before they cause runtime errors in tldraw.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { rmToTldraw, resetIndexCounter } from '../../src/ts/exporters/tldraw.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rmTestDir = join(__dirname, '../rm');
const artifactsDir = join(__dirname, '../artifacts/tldraw');

// ============================================================
// Simple validators that match tldraw's schema requirements
// ============================================================

/** Validate richText structure */
function validateRichText(richText: unknown): { valid: boolean; error?: string } {
    if (!richText || typeof richText !== 'object') {
        return { valid: false, error: 'richText must be an object' };
    }
    const rt = richText as Record<string, unknown>;
    if (rt.type !== 'doc') {
        return { valid: false, error: `richText.type must be 'doc', got '${rt.type}'` };
    }
    if (!Array.isArray(rt.content)) {
        return { valid: false, error: 'richText.content must be an array' };
    }
    return { valid: true };
}

/** Validate draw/highlight shape segments */
function validateSegments(segments: unknown): { valid: boolean; error?: string } {
    if (!Array.isArray(segments)) {
        return { valid: false, error: 'segments must be an array' };
    }
    for (const segment of segments) {
        if (typeof segment !== 'object' || segment === null) {
            return { valid: false, error: 'each segment must be an object' };
        }
        const seg = segment as Record<string, unknown>;
        if (seg.type !== 'free' && seg.type !== 'straight') {
            return { valid: false, error: `segment.type must be 'free' or 'straight'` };
        }
        // Points can be either a base64 string or an array of point objects
        if (typeof seg.points !== 'string' && !Array.isArray(seg.points)) {
            return { valid: false, error: 'segment.points must be a string (base64) or array' };
        }
        if (Array.isArray(seg.points)) {
            for (const point of seg.points) {
                if (typeof point !== 'object' || point === null) {
                    return { valid: false, error: 'each point must be an object' };
                }
                const p = point as Record<string, unknown>;
                if (typeof p.x !== 'number' || typeof p.y !== 'number') {
                    return { valid: false, error: 'point must have numeric x and y' };
                }
            }
        }
    }
    return { valid: true };
}

/** Validate text shape props */
function validateTextShapeProps(props: Record<string, unknown>): { valid: boolean; error?: string } {
    // Required fields for text shape (modern tldraw)
    const richTextResult = validateRichText(props.richText);
    if (!richTextResult.valid) {
        return richTextResult;
    }

    if (typeof props.w !== 'number' || props.w <= 0) {
        return { valid: false, error: 'text shape props.w must be a positive number' };
    }
    if (typeof props.scale !== 'number' || props.scale === 0) {
        return { valid: false, error: 'text shape props.scale must be a non-zero number' };
    }
    if (typeof props.autoSize !== 'boolean') {
        return { valid: false, error: 'text shape props.autoSize must be a boolean' };
    }

    // Check that old 'text' field is NOT present (replaced by richText)
    if ('text' in props) {
        return { valid: false, error: 'text shape should use richText, not text property' };
    }

    return { valid: true };
}

/** Validate draw shape props */
function validateDrawShapeProps(props: Record<string, unknown>): { valid: boolean; error?: string } {
    const segmentsResult = validateSegments(props.segments);
    if (!segmentsResult.valid) {
        return segmentsResult;
    }

    if (typeof props.isComplete !== 'boolean') {
        return { valid: false, error: 'draw shape props.isComplete must be a boolean' };
    }
    if (typeof props.isClosed !== 'boolean') {
        return { valid: false, error: 'draw shape props.isClosed must be a boolean' };
    }
    if (typeof props.isPen !== 'boolean') {
        return { valid: false, error: 'draw shape props.isPen must be a boolean' };
    }

    return { valid: true };
}

/** Validate highlight shape props */
function validateHighlightShapeProps(props: Record<string, unknown>): { valid: boolean; error?: string } {
    const segmentsResult = validateSegments(props.segments);
    if (!segmentsResult.valid) {
        return segmentsResult;
    }

    if (typeof props.isComplete !== 'boolean') {
        return { valid: false, error: 'highlight shape props.isComplete must be a boolean' };
    }
    if (typeof props.isPen !== 'boolean') {
        return { valid: false, error: 'highlight shape props.isPen must be a boolean' };
    }

    return { valid: true };
}

/** Validate a shape record */
function validateShape(shape: Record<string, unknown>): { valid: boolean; error?: string } {
    // Check base shape properties
    if (typeof shape.id !== 'string' || !shape.id.startsWith('shape:')) {
        return { valid: false, error: 'shape.id must start with "shape:"' };
    }
    if (shape.typeName !== 'shape') {
        return { valid: false, error: 'shape.typeName must be "shape"' };
    }
    if (typeof shape.type !== 'string') {
        return { valid: false, error: 'shape.type must be a string' };
    }
    if (typeof shape.x !== 'number') {
        return { valid: false, error: 'shape.x must be a number' };
    }
    if (typeof shape.y !== 'number') {
        return { valid: false, error: 'shape.y must be a number' };
    }
    if (typeof shape.rotation !== 'number') {
        return { valid: false, error: 'shape.rotation must be a number' };
    }
    if (typeof shape.isLocked !== 'boolean') {
        return { valid: false, error: 'shape.isLocked must be a boolean' };
    }
    if (typeof shape.opacity !== 'number') {
        return { valid: false, error: 'shape.opacity must be a number' };
    }
    if (typeof shape.props !== 'object' || shape.props === null) {
        return { valid: false, error: 'shape.props must be an object' };
    }

    const props = shape.props as Record<string, unknown>;

    // Validate type-specific props
    switch (shape.type) {
        case 'text':
            return validateTextShapeProps(props);
        case 'draw':
            return validateDrawShapeProps(props);
        case 'highlight':
            return validateHighlightShapeProps(props);
        default:
            // Unknown shape type - skip specific validation
            return { valid: true };
    }
}

/** Validate a TLDraw document */
function validateTldrawDocument(doc: Record<string, unknown>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check document structure
    if (doc.tldrawFileFormatVersion !== 1) {
        errors.push(`tldrawFileFormatVersion should be 1, got ${doc.tldrawFileFormatVersion}`);
    }

    if (!doc.schema || typeof doc.schema !== 'object') {
        errors.push('document must have a schema object');
    }

    if (!Array.isArray(doc.records)) {
        errors.push('document must have a records array');
        return { valid: false, errors };
    }

    // Check required records
    const documentRecord = doc.records.find((r: any) => r.id === 'document:document');
    const pointerRecord = doc.records.find((r: any) => r.id === 'pointer:pointer');
    const pageRecord = doc.records.find((r: any) => r.id === 'page:page');

    if (!documentRecord) {
        errors.push('missing required document:document record');
    }
    if (!pointerRecord) {
        errors.push('missing required pointer:pointer record');
    }
    if (!pageRecord) {
        errors.push('missing required page:page record');
    }

    // Validate all shape records
    for (const record of doc.records as Record<string, unknown>[]) {
        if (record.typeName === 'shape') {
            const result = validateShape(record);
            if (!result.valid && result.error) {
                errors.push(`Shape ${record.id}: ${result.error}`);
            }
        }
    }

    return { valid: errors.length === 0, errors };
}

// ============================================================
// Tests
// ============================================================

describe('TLDraw Schema Validation', () => {
    beforeEach(() => {
        resetIndexCounter();
    });

    describe('Text shape validation', () => {
        it('should have richText property instead of text', () => {
            const textFiles = ['abcd.text.rm', 'text_multiple_lines.rm', 'Bold_Heading_Bullet_Normal.rm'];

            for (const fileName of textFiles) {
                const filePath = join(rmTestDir, fileName);
                if (!existsSync(filePath)) continue;

                const data = readFileSync(filePath);
                const doc = rmToTldraw(data);

                const textShapes = doc.records.filter((r: any) => r.type === 'text');

                for (const shape of textShapes as any[]) {
                    // Should have richText
                    expect(shape.props.richText).toBeDefined();
                    expect(shape.props.richText.type).toBe('doc');
                    expect(Array.isArray(shape.props.richText.content)).toBe(true);

                    // Should NOT have text property
                    expect(shape.props.text).toBeUndefined();
                }
            }
        });

        it('should produce valid richText structure', () => {
            const filePath = join(rmTestDir, 'text_multiple_lines.rm');
            if (!existsSync(filePath)) return;

            const data = readFileSync(filePath);
            const doc = rmToTldraw(data);

            const textShapes = doc.records.filter((r: any) => r.type === 'text');

            for (const shape of textShapes as any[]) {
                const richText = shape.props.richText;

                // Validate structure
                expect(richText.type).toBe('doc');
                expect(Array.isArray(richText.content)).toBe(true);

                // Each content item should be a paragraph
                for (const paragraph of richText.content) {
                    expect(paragraph.type).toBe('paragraph');
                    // Content is optional for empty paragraphs
                    if (paragraph.content) {
                        expect(Array.isArray(paragraph.content)).toBe(true);
                        for (const textNode of paragraph.content) {
                            expect(textNode.type).toBe('text');
                            expect(typeof textNode.text).toBe('string');
                        }
                    }
                }
            }
        });
    });

    describe('Draw shape validation', () => {
        it('should have valid segments with point arrays', () => {
            const filePath = join(rmTestDir, 'abcd.strokes.rm');
            if (!existsSync(filePath)) return;

            const data = readFileSync(filePath);
            const doc = rmToTldraw(data);

            const drawShapes = doc.records.filter((r: any) => r.type === 'draw');

            for (const shape of drawShapes as any[]) {
                expect(Array.isArray(shape.props.segments)).toBe(true);

                for (const segment of shape.props.segments) {
                    expect(['free', 'straight']).toContain(segment.type);

                    // Points should be an array (JSON format)
                    expect(Array.isArray(segment.points)).toBe(true);

                    for (const point of segment.points) {
                        expect(typeof point.x).toBe('number');
                        expect(typeof point.y).toBe('number');
                        expect(typeof point.z).toBe('number');
                    }
                }
            }
        });
    });

    describe('Full document validation', () => {
        const rmFiles = existsSync(rmTestDir)
            ? readdirSync(rmTestDir).filter(f => f.endsWith('.rm'))
            : [];

        for (const fileName of rmFiles) {
            it(`should produce valid tldraw document from ${fileName}`, () => {
                const filePath = join(rmTestDir, fileName);
                const data = readFileSync(filePath);
                const doc = rmToTldraw(data);

                const result = validateTldrawDocument(doc as unknown as Record<string, unknown>);

                if (!result.valid) {
                    console.error(`Validation errors for ${fileName}:`);
                    for (const error of result.errors) {
                        console.error(`  - ${error}`);
                    }
                }

                expect(result.valid).toBe(true);
            });
        }
    });

    describe('Artifact validation', () => {
        it('should validate all generated .tldr files', () => {
            if (!existsSync(artifactsDir)) return;

            const tldrFiles = readdirSync(artifactsDir).filter(f => f.endsWith('.tldr'));

            for (const fileName of tldrFiles) {
                const filePath = join(artifactsDir, fileName);
                const content = readFileSync(filePath, 'utf-8');
                const doc = JSON.parse(content);

                const result = validateTldrawDocument(doc);

                if (!result.valid) {
                    console.error(`Validation errors for ${fileName}:`);
                    for (const error of result.errors) {
                        console.error(`  - ${error}`);
                    }
                }

                expect(result.valid, `${fileName} should pass validation`).toBe(true);
            }
        });
    });
});
