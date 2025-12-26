# tldraw-rm-converter

Convert between reMarkable (.rm) files and tldraw format.

## Overview

This project provides tools to convert reMarkable notebook files into tldraw JSON format and vice versa. It currently supports:
- Strokes and lines
- Text elements
- High-fidelity conversion with proper scaling and color mapping

## Project Structure

- `rmc/`: Core converter logic (TypeScript)
- `rmscene/`: Scene parsing and generation logic (TypeScript)
- `tldraw/`: tldraw related utilities

## Getting Started

### Installation

```bash
npm install
```

### Testing

```bash
npm test
```

## License

MIT
