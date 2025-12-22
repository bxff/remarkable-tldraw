/**
 * Script to generate test artifacts - converts all .rm files to tldraw and SVG
 * 
 * Run with: npx tsx rmc/tests/ts/generate-artifacts.ts
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { rmToTldrawJson } from '../../src/ts/exporters/tldraw.ts';
import { treeToSvg } from '../../src/ts/exporters/svg.ts';
import { readTree } from '../../../rmscene/src/ts/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const rmTestDir = join(__dirname, '../rm');
const artifactsDir = join(__dirname, '../artifacts');
const tldrawDir = join(artifactsDir, 'tldraw');
const svgDir = join(artifactsDir, 'svg');

// Create directories
if (!existsSync(artifactsDir)) mkdirSync(artifactsDir);
if (!existsSync(tldrawDir)) mkdirSync(tldrawDir);
if (!existsSync(svgDir)) mkdirSync(svgDir);

// Get all .rm files
const rmFiles = readdirSync(rmTestDir).filter(f => f.endsWith('.rm'));

console.log(`Converting ${rmFiles.length} .rm files to tldraw and SVG...`);

let successCount = 0;
let errorCount = 0;

for (const fileName of rmFiles) {
    const baseName = basename(fileName, '.rm');
    const rmPath = join(rmTestDir, fileName);

    try {
        const data = readFileSync(rmPath);

        // Convert to tldraw
        try {
            const tldrawJson = rmToTldrawJson(data);
            writeFileSync(join(tldrawDir, `${baseName}.tldr`), tldrawJson);
            console.log(`  ✓ ${baseName}.tldr`);
        } catch (e) {
            console.error(`  ✗ ${baseName}.tldr: ${e}`);
        }

        // Convert to SVG
        try {
            const tree = readTree(data);
            const svg = treeToSvg(tree);
            writeFileSync(join(svgDir, `${baseName}.svg`), svg);
            console.log(`  ✓ ${baseName}.svg`);
        } catch (e) {
            console.error(`  ✗ ${baseName}.svg: ${e}`);
        }

        successCount++;
    } catch (e) {
        console.error(`  ✗ ${fileName}: ${e}`);
        errorCount++;
    }
}

console.log(`\nDone! ${successCount} files converted, ${errorCount} errors`);
console.log(`\nArtifacts saved to:`);
console.log(`  - ${tldrawDir}`);
console.log(`  - ${svgDir}`);
