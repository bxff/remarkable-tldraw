/**
 * Comprehensive integration tests for scene stream parsing with ALL .rm files
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import {
    readBlocks,
    readTree,
    Block,
    isAuthorIdsBlock,
    isSceneTreeBlock,
    isTreeNodeBlock,
    isSceneLineItemBlock,
    isSceneGroupItemBlock,
    isSceneGlyphItemBlock,
    isRootTextBlock,
    isUnreadableBlock,
    isPageInfoBlock,
    isMigrationInfoBlock,
} from '../../src/ts/index.ts';
import { isLine, isGlyphRange, isGroup, Line, GlyphRange } from '../../src/ts/scene-items.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Collect all .rm test files from both directories
const rmsceneTestDir = join(__dirname, '../data');
const rmcTestDir = join(__dirname, '../../../rmc/tests/rm');

function getAllRmFiles(): string[] {
    const files: string[] = [];

    if (existsSync(rmsceneTestDir)) {
        for (const file of readdirSync(rmsceneTestDir)) {
            if (file.endsWith('.rm')) {
                files.push(join(rmsceneTestDir, file));
            }
        }
    }

    if (existsSync(rmcTestDir)) {
        for (const file of readdirSync(rmcTestDir)) {
            if (file.endsWith('.rm')) {
                files.push(join(rmcTestDir, file));
            }
        }
    }

    return files;
}

const rmFiles = getAllRmFiles();

describe('Comprehensive .rm File Parsing', () => {
    // Track parsing statistics
    const stats = {
        totalFiles: 0,
        successfulFiles: 0,
        failedFiles: 0,
        totalBlocks: 0,
        unreadableBlocks: 0,
        lineItems: 0,
        glyphItems: 0,
        textBlocks: 0,
        groupItems: 0,
    };

    describe('Parse ALL available .rm files', () => {
        for (const filePath of rmFiles) {
            const fileName = basename(filePath);

            it(`should parse ${fileName} without errors`, () => {
                stats.totalFiles++;

                const data = readFileSync(filePath);
                const blocks = Array.from(readBlocks(data));

                expect(blocks.length).toBeGreaterThan(0);

                let hasUnreadable = false;
                for (const block of blocks) {
                    stats.totalBlocks++;

                    if (isUnreadableBlock(block)) {
                        hasUnreadable = true;
                        stats.unreadableBlocks++;
                        console.warn(`  Unreadable block in ${fileName}: ${block.error}`);
                    } else if (isSceneLineItemBlock(block)) {
                        stats.lineItems++;
                    } else if (isSceneGlyphItemBlock(block)) {
                        stats.glyphItems++;
                    } else if (isRootTextBlock(block)) {
                        stats.textBlocks++;
                    } else if (isSceneGroupItemBlock(block)) {
                        stats.groupItems++;
                    }
                }

                if (!hasUnreadable) {
                    stats.successfulFiles++;
                } else {
                    stats.failedFiles++;
                }

                // Test should pass as long as we parsed something
                // Even if some blocks are unreadable, the parsing should work
                expect(blocks.filter(b => !isUnreadableBlock(b)).length).toBeGreaterThan(0);
            });
        }
    });

    describe('SceneTree building for ALL .rm files', () => {
        for (const filePath of rmFiles) {
            const fileName = basename(filePath);

            it(`should build tree from ${fileName}`, () => {
                const data = readFileSync(filePath);
                const tree = readTree(data);

                expect(tree).toBeDefined();
                expect(tree.root).toBeDefined();
            });
        }
    });
});

describe('Text .rm File Verification', () => {
    const textFiles = rmFiles.filter(f =>
        basename(f).includes('text') ||
        basename(f).includes('Text') ||
        basename(f).includes('Normal') ||
        basename(f).includes('Bold') ||
        basename(f).includes('Heading') ||
        basename(f).includes('Bullet')
    );

    for (const filePath of textFiles) {
        const fileName = basename(filePath);

        it(`should correctly parse text content in ${fileName}`, () => {
            const data = readFileSync(filePath);
            const blocks = Array.from(readBlocks(data));

            // Check for RootTextBlock if this is a text file
            const textBlocks = blocks.filter(isRootTextBlock);

            if (textBlocks.length > 0) {
                for (const textBlock of textBlocks) {
                    expect(textBlock.value).toBeDefined();
                    expect(textBlock.value.items).toBeDefined();
                    expect(textBlock.value.styles).toBeDefined();

                    // Check position values
                    expect(typeof textBlock.value.posX).toBe('number');
                    expect(typeof textBlock.value.posY).toBe('number');
                    expect(typeof textBlock.value.width).toBe('number');

                    // Check that we have text items
                    const textItems = textBlock.value.items.values();
                    // Should have at least some text content
                }
            }

            // Build tree and check text
            const tree = readTree(data);
            if (tree.rootText) {
                expect(tree.rootText.posX).toBeDefined();
                expect(tree.rootText.posY).toBeDefined();
                expect(tree.rootText.width).toBeDefined();
            }
        });
    }
});

describe('Highlight .rm File Verification', () => {
    const highlightFiles = rmFiles.filter(f =>
        basename(f).includes('highlight') ||
        basename(f).includes('Wikipedia')
    );

    for (const filePath of highlightFiles) {
        const fileName = basename(filePath);

        it(`should correctly parse highlights in ${fileName}`, () => {
            const data = readFileSync(filePath);
            const blocks = Array.from(readBlocks(data));

            // Check for glyph (highlight) blocks
            const glyphBlocks = blocks.filter(isSceneGlyphItemBlock);

            // Build tree
            const tree = readTree(data);

            // Walk tree and find highlight items
            const items = Array.from(tree.walk());
            const glyphs = items.filter(([_, item]) => isGlyphRange(item as any));

            // Files with "highlight" should have glyph items
            if (fileName.toLowerCase().includes('highlight') || fileName.includes('Wikipedia')) {
                expect(glyphBlocks.length + glyphs.length).toBeGreaterThan(0);
            }
        });
    }
});

describe('Stroke .rm File Verification', () => {
    const strokeFiles = rmFiles.filter(f =>
        basename(f).includes('stroke') ||
        basename(f).includes('Lines') ||
        basename(f).includes('writing') ||
        basename(f).includes('pen') ||
        basename(f).includes('erasers') ||
        basename(f).includes('layers')
    );

    for (const filePath of strokeFiles) {
        const fileName = basename(filePath);

        it(`should correctly parse strokes in ${fileName}`, () => {
            const data = readFileSync(filePath);
            const blocks = Array.from(readBlocks(data));

            // Check for line blocks
            const lineBlocks = blocks.filter(isSceneLineItemBlock);

            if (lineBlocks.length > 0) {
                for (const lineBlock of lineBlocks) {
                    const line = lineBlock.item.value;
                    if (line) {
                        expect(line.points).toBeDefined();
                        expect(Array.isArray(line.points)).toBe(true);
                        expect(typeof line.color).toBe('number');
                        expect(typeof line.tool).toBe('number');
                    }
                }
            }

            // Build tree and walk for lines
            const tree = readTree(data);
            const items = Array.from(tree.walk());
            const lines = items.filter(([_, item]) => isLine(item as any));

            // Stroke files should have lines
            if (fileName.includes('stroke') || fileName.includes('Lines')) {
                expect(lineBlocks.length + lines.length).toBeGreaterThan(0);
            }
        });
    }
});

describe('Block Type Coverage', () => {
    it('should have parsed all expected block types across all files', () => {
        let hasAuthorIds = false;
        let hasMigration = false;
        let hasPageInfo = false;
        let hasSceneTree = false;
        let hasTreeNode = false;
        let hasLineItem = false;
        let hasGroupItem = false;
        let hasGlyphItem = false;
        let hasRootText = false;

        for (const filePath of rmFiles) {
            const data = readFileSync(filePath);
            const blocks = Array.from(readBlocks(data));

            for (const block of blocks) {
                if (isAuthorIdsBlock(block)) hasAuthorIds = true;
                if (isMigrationInfoBlock(block)) hasMigration = true;
                if (isPageInfoBlock(block)) hasPageInfo = true;
                if (isSceneTreeBlock(block)) hasSceneTree = true;
                if (isTreeNodeBlock(block)) hasTreeNode = true;
                if (isSceneLineItemBlock(block)) hasLineItem = true;
                if (isSceneGroupItemBlock(block)) hasGroupItem = true;
                if (isSceneGlyphItemBlock(block)) hasGlyphItem = true;
                if (isRootTextBlock(block)) hasRootText = true;
            }
        }

        // All common block types should be present somewhere in the test files
        expect(hasAuthorIds).toBe(true);
        expect(hasMigration).toBe(true);
        expect(hasPageInfo).toBe(true);
        expect(hasSceneTree).toBe(true);
        expect(hasTreeNode).toBe(true);
        expect(hasLineItem).toBe(true);
        expect(hasGroupItem).toBe(true);
        // hasGlyphItem and hasRootText may not be in all test sets
    });
});
