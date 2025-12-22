# rmc - Python Reference Implementation

> ⚠️ **DEPRECATED - REFERENCE ONLY**
> 
> This Python implementation is preserved for reference purposes only.
> Do NOT modify this code for new development.
> 
> **All new development should use the TypeScript implementation at:**
> `rmc/src/ts/`

## TypeScript Implementation

The active TypeScript implementation lives in `rmc/src/ts/`:

```
rmc/src/ts/
├── exporters/
│   ├── writing-tools.ts   # Pen classes for stroke rendering
│   ├── svg.ts             # SVG exporter (treeToSvg)
│   └── tldraw.ts          # TLDraw exporter (treeToTldraw)
└── index.ts               # Main exports
```

## Usage

```typescript
import { rmToTldraw, treeToSvg } from './rmc/src/ts/index.ts';
import { readTree } from './rmscene/src/ts/index.ts';
import { readFileSync, writeFileSync } from 'fs';

// Convert .rm to tldraw JSON
const rmData = readFileSync('document.rm');
const tldrawDoc = rmToTldraw(rmData);
writeFileSync('document.tldr', JSON.stringify(tldrawDoc));

// Convert .rm to SVG
const tree = readTree(rmData);
const svg = treeToSvg(tree);
writeFileSync('document.svg', svg);
```
