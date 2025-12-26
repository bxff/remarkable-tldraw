# reMarkable to tldraw Bridge

## 🚀 Hackathon Project: Cross-Platform Digital Ink Integration

**Problem:** Bridge reMarkable's e-ink experience with tldraw's collaborative drawing platform.

## Overview

Complete `.rm` to `.tldr` conversion system that transforms reMarkable files into tldraw-compatible JSON format.

![Comparison](Already%20existing%20SVG%20exporter%20vs%20TLDRaw.png)

## Key Features

- **Complete stroke conversion** with perfect fidelity
- **Color mapping** from reMarkable palette to tldraw colors
- **Size scaling** for proper stroke weights
- **Fractional indexing** for proper layer ordering
- **Text support** with richText format

## Technical Challenges

- **Coordinate transformation:** 2.0x scaling with (100, 100) offsets
- **Fractional indexing:** Built complete base62 indexing system
- **Anchor handling:** Recursive position processing for nested groups
- **Color translation:** Intelligent grayscale to color mapping

## Installation

```bash
cd rmc
# Install dependencies
pip install -r requirements.txt
```

## Usage

```bash
cd rmc
# Convert reMarkable file to tldraw format
PYTHONPATH=src python3 -m rmc.cli -t tldraw -o test.tldr tests/rm/writing_tools.rm
```

Then drag the `test.tldr` to tldraw.com editor.

## Future Implementation: Bidirectional Sync

**Phase 1: tldraw → reMarkable Conversion**
- Implement reverse conversion from `.tldr` to `.rm` format
- Handle tldraw's rich feature set back to reMarkable's simpler format
- Maintain stroke fidelity and metadata preservation

**Phase 2: Real-time Synchronization**
- WebSocket-based live sync between platforms
- Conflict resolution for concurrent edits
- Delta-based updates for efficient bandwidth usage

**Phase 3: Collaborative Editing and Mobile Support**
- Multi-user editing across reMarkable and web platforms
- Mobile app integration for on-the-go access
- Cloud storage integration for seamless workflow

## Impact

Enables educational institutions, design teams, and students to bridge their reMarkable workflow with collaborative web platforms.

---

**Hackathon project for digital ink collaboration**