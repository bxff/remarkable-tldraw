/**
 * Test that generates artifacts - converts all .rm files to tldraw and SVG
 * 
 * This creates test artifacts for visual inspection
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { rmToTldrawJson, resetIndexCounter } from '../../src/ts/exporters/tldraw.ts';
import { treeToSvg } from '../../src/ts/exporters/svg.ts';
import { readTree } from '../../../rmscene/src/ts/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const rmTestDir = join(__dirname, '../rm');
const artifactsDir = join(__dirname, '../artifacts');
const tldrawDir = join(artifactsDir, 'tldraw');
const svgDir = join(artifactsDir, 'svg');

// Get all .rm files
const rmFiles = existsSync(rmTestDir)
    ? readdirSync(rmTestDir).filter(f => f.endsWith('.rm'))
    : [];

describe('Generate Test Artifacts', () => {
    beforeAll(() => {
        // Create directories
        if (!existsSync(artifactsDir)) mkdirSync(artifactsDir);
        if (!existsSync(tldrawDir)) mkdirSync(tldrawDir);
        if (!existsSync(svgDir)) mkdirSync(svgDir);
    });

    describe('Generate tldraw files', () => {
        for (const fileName of rmFiles) {
            const baseName = basename(fileName, '.rm');

            it(`should convert ${baseName} to tldraw`, () => {
                resetIndexCounter();
                const rmPath = join(rmTestDir, fileName);
                const data = readFileSync(rmPath);

                const tldrawJson = rmToTldrawJson(data);
                const outputPath = join(tldrawDir, `${baseName}.tldr`);
                writeFileSync(outputPath, tldrawJson);

                // Verify file was created
                expect(existsSync(outputPath)).toBe(true);

                // Verify valid JSON
                const parsed = JSON.parse(tldrawJson);
                expect(parsed.tldrawFileFormatVersion).toBe(1);
            });
        }
    });

    describe('Generate SVG files', () => {
        for (const fileName of rmFiles) {
            const baseName = basename(fileName, '.rm');

            it(`should convert ${baseName} to SVG`, () => {
                const rmPath = join(rmTestDir, fileName);
                const data = readFileSync(rmPath);

                const tree = readTree(data);
                const svg = treeToSvg(tree);
                const outputPath = join(svgDir, `${baseName}.svg`);
                writeFileSync(outputPath, svg);

                // Verify file was created
                expect(existsSync(outputPath)).toBe(true);

                // Verify valid SVG
                expect(svg).toContain('<?xml');
                expect(svg).toContain('<svg');
                expect(svg).toContain('</svg>');
            });
        }
    });
});
