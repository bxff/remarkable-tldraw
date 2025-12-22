# rmscene - Python Reference Implementation

> ⚠️ **DEPRECATED - REFERENCE ONLY**
> 
> This Python implementation is preserved for reference purposes only.
> Do NOT modify this code for new development.
> 
> **All new development should use the TypeScript implementation at:**
> `rmscene/src/ts/`

## TypeScript Implementation

The active TypeScript implementation lives in `rmscene/src/ts/`:

```
rmscene/src/ts/
├── tagged-block-common.ts  # CrdtId, DataStream, LwwValue
├── tagged-block-reader.ts  # Read tagged blocks from .rm files
├── tagged-block-writer.ts  # Write tagged blocks to .rm files
├── crdt-sequence.ts        # CRDT sequence with topological sorting
├── scene-items.ts          # Line, Group, Text, GlyphRange types
├── scene-stream.ts         # Block types and parsing
├── scene-tree.ts           # SceneTree structure
└── index.ts                # Main exports
```

## Usage

```typescript
import { readTree, readBlocks } from './rmscene/src/ts/index.ts';
import { readFileSync } from 'fs';

// Read and parse an .rm file
const data = readFileSync('file.rm');
const tree = readTree(data);

// Walk through all items
for (const [id, item] of tree.walk()) {
  console.log(id, item);
}
```
