/**
 * Append a new stroke to an existing .rm v6 file.
 * Uses the EXISTING author (author 1) to avoid CRDT author issues.
 * 
 * Usage: npx tsx rm-research/append-stroke.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import {
    readBlocks,
    isAuthorIdsBlock,
    isSceneLineItemBlock,
    isSceneTreeBlock,
    isTreeNodeBlock,
    BlockType,
    TaggedBlockWriter,
    createCrdtId,
    createLwwValue,
    createPoint,
    Pen,
    PenColor,
} from '../rmscene/src/ts/index';

const INPUT_FILE = path.join(__dirname, 'tablet-files/syncthing-page-f994.rm');
const OUTPUT_FILE = path.join(__dirname, 'tablet-files/syncthing-page-f994-modified.rm');

// Read and analyze the existing file
const fileData = fs.readFileSync(INPUT_FILE);
console.log(`Read ${fileData.length} bytes from ${INPUT_FILE}`);

// Track CRDT state
let maxCounter = 0;  // max counter for author 1
let parentIdForLines: { part1: number; part2: number } | null = null;
let lastLineItemId: { part1: number; part2: number } | null = null;
let lineCount = 0;

for (const block of readBlocks(fileData)) {
    if (isSceneLineItemBlock(block)) {
        lineCount++;
        const item = block.item;
        const id = item.itemId;
        
        // Only track author 1's items (the existing author)
        if (id.part1 === 1 && id.part2 > maxCounter) {
            maxCounter = id.part2;
        }
        parentIdForLines = block.parentId;
        lastLineItemId = item.itemId;
    }
}

console.log(`Found ${lineCount} lines`);
console.log(`Max counter for author 1: ${maxCounter}`);
console.log(`Last line item: (${lastLineItemId?.part1}:${lastLineItemId?.part2})`);
console.log(`Parent ID: (${parentIdForLines?.part1}:${parentIdForLines?.part2})`);

// Use the EXISTING author (author 1) — no new AuthorIdsBlock needed!
const AUTHOR_ID = 1;
// Our new item counter = max existing + a gap for safety
const NEW_COUNTER = maxCounter + 10;

console.log(`New stroke will use ID: (${AUTHOR_ID}:${NEW_COUNTER})`);

// Create a diagonal line across the page
const newPoints = [];
for (let i = 0; i < 20; i++) {
    const t = i / 19;
    newPoints.push(createPoint(
        200 + t * 400,   // x: 200 to 600
        200 + t * 400,   // y: 200 to 600
        500,              // speed
        128,              // direction
        80,               // width
        200               // pressure
    ));
}

// Build the appended block
const writer = new TaggedBlockWriter();

const newItemId = createCrdtId(AUTHOR_ID, NEW_COUNTER);
const leftId = lastLineItemId ?? createCrdtId(0, 0);
const rightId = createCrdtId(0, 0); // END_MARKER

const endLineBlock = writer.startBlock(BlockType.SceneLineItem, 0, 2);

writer.writeId(1, parentIdForLines!);     // parentId
writer.writeId(2, newItemId);              // itemId  
writer.writeId(3, leftId);                 // leftId (last existing item)
writer.writeId(4, rightId);               // rightId (end marker)
writer.writeInt(5, 0);                     // deletedLength (0 = not deleted)

// Value subblock
const endValueSub = writer.startSubblock(6);
writer.data.writeUint8(3); // item type = line

writer.writeInt(1, Pen.FINELINER_1);         // tool
writer.writeInt(2, PenColor.BLACK);          // color
writer.writeDouble(3, 1.875);                // thicknessScale
writer.writeFloat(4, 0.0);                   // startingLength

// Points
const endPointsSub = writer.startSubblock(5);
for (const point of newPoints) {
    writer.data.writeFloat32(point.x);
    writer.data.writeFloat32(point.y);
    writer.data.writeUint16(point.speed);
    writer.data.writeUint16(point.width);
    writer.data.writeUint8(point.direction);
    writer.data.writeUint8(point.pressure);
}
endPointsSub();

// Timestamp
writer.writeId(6, createCrdtId(AUTHOR_ID, NEW_COUNTER));

endValueSub();
endLineBlock();

const appendedBytes = writer.getBytes();
console.log(`\nGenerated ${appendedBytes.length} bytes to append`);

// Combine original + new block
const combined = new Uint8Array(fileData.length + appendedBytes.length);
combined.set(fileData);
combined.set(appendedBytes, fileData.length);

fs.writeFileSync(OUTPUT_FILE, combined);
console.log(`Written: ${OUTPUT_FILE} (${combined.length} bytes)`);

// Verify
console.log('\n=== Verifying ===');
let verifyCount = 0;
for (const block of readBlocks(fs.readFileSync(OUTPUT_FILE))) {
    if (isSceneLineItemBlock(block)) {
        verifyCount++;
        const item = block.item;
        if (item.value && item.itemId.part2 === NEW_COUNTER) {
            console.log(`NEW Line: itemId=(${item.itemId.part1}:${item.itemId.part2}), tool=${item.value.tool}, points=${item.value.points.length}`);
        }
    }
}
console.log(`Total lines: ${verifyCount} (was ${lineCount})`);
