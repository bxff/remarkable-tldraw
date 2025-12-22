/**
 * Process text from remarkable scene files.
 * 
 * TypeScript port of rmscene/src/rmscene/text.py
 * @module text
 */

import {
    CrdtId,
    LwwValue,
    Text,
    ParagraphStyle,
    crdtIdToString,
    createCrdtId,
} from '../../../rmscene/src/ts/index.ts';
import { CrdtSequence, CrdtSequenceItem } from '../../../rmscene/src/ts/crdt-sequence.ts';

const END_MARKER = createCrdtId(0, 0);

/**
 * Expand a TextItem into single-character TextItems.
 */
function* expandTextItem(
    item: CrdtSequenceItem<string | number>
): Generator<CrdtSequenceItem<string | number>> {
    if (item.deletedLength > 0) {
        // Deleted items
        const chars = new Array(item.deletedLength).fill('');
        let itemId = item.itemId;
        let leftId = item.leftId;
        for (let i = 0; i < chars.length - 1; i++) {
            const rightId = createCrdtId(itemId.part1, itemId.part2 + 1);
            yield { itemId, leftId, rightId, deletedLength: 1, value: '' };
            leftId = itemId;
            itemId = rightId;
        }
        yield { itemId, leftId, rightId: item.rightId, deletedLength: 1, value: '' };
        return;
    }

    if (typeof item.value === 'number') {
        // Formatting code
        yield item;
        return;
    }

    const chars = item.value;
    if (!chars || chars.length === 0) {
        return;
    }

    let itemId = item.itemId;
    let leftId = item.leftId;
    for (let i = 0; i < chars.length - 1; i++) {
        const rightId = createCrdtId(itemId.part1, itemId.part2 + 1);
        yield { itemId, leftId, rightId, deletedLength: 0, value: chars[i] };
        leftId = itemId;
        itemId = rightId;
    }
    yield { itemId, leftId, rightId: item.rightId, deletedLength: 0, value: chars[chars.length - 1] };
}

/**
 * Expand a sequence of TextItems into single-character TextItems.
 */
function* expandTextItems(
    items: Iterable<CrdtSequenceItem<string | number>>
): Generator<CrdtSequenceItem<string | number>> {
    for (const item of items) {
        yield* expandTextItem(item);
    }
}

/**
 * String with CrdtIds for chars and optional properties.
 */
export interface CrdtStr {
    s: string;
    i: CrdtId[];
    properties: Record<string, string>;
}

/**
 * Paragraph of text.
 */
export interface Paragraph {
    contents: CrdtStr[];
    startId: CrdtId;
    style: LwwValue<ParagraphStyle>;
}

/**
 * Text document parsed from scene items.
 */
export interface TextDocument {
    contents: Paragraph[];
}

/**
 * Parse a Text scene item into a TextDocument.
 * 
 * This matches the Python TextDocument.from_scene_item() exactly.
 */
export function parseTextDocument(text: Text): TextDocument {
    // Build char_formats from text.styles
    const charFormats = new Map<string, ParagraphStyle>();
    for (const [keyStr, lww] of text.styles.entries()) {
        charFormats.set(keyStr, lww.value);
    }

    // Add END_MARKER if not present
    const endMarkerStr = crdtIdToString(END_MARKER);
    if (!charFormats.has(endMarkerStr)) {
        charFormats.set(endMarkerStr, ParagraphStyle.PLAIN);
    }

    // Expand from strings to characters
    const charItems = new CrdtSequence<string | number>();
    for (const item of expandTextItems(text.items.sequenceItems())) {
        charItems.add(item);
    }

    // Get ordered keys
    const keys: CrdtId[] = [];
    for (const k of charItems) {
        keys.push(k);
    }

    let properties: Record<string, string> = { 'font-weight': 'normal', 'font-style': 'normal' };

    function handleFormattingCode(code: number): Record<string, string> {
        if (code === 1) {
            properties['font-weight'] = 'bold';
        } else if (code === 2) {
            properties['font-weight'] = 'normal';
        }
        if (code === 3) {
            properties['font-style'] = 'italic';
        } else if (code === 4) {
            properties['font-style'] = 'normal';
        }
        return properties;
    }

    function parseParagraphContents(): [CrdtId, CrdtStr[]] {
        let startId: CrdtId;

        // Check if starts with newline
        if (keys.length > 0) {
            const firstKey = keys[0];
            const firstChar = charItems.get(firstKey);
            if (firstChar === '\n') {
                startId = keys.shift()!;
            } else {
                startId = END_MARKER;
            }
        } else {
            startId = END_MARKER;
        }

        const contents: CrdtStr[] = [];

        while (keys.length > 0) {
            const key = keys[0];
            const char = charItems.get(key);

            if (typeof char === 'number') {
                // Formatting code
                handleFormattingCode(char);
                keys.shift();
            } else if (char === '\n') {
                // End of paragraph
                break;
            } else if (typeof char === 'string' && char.length <= 1) {
                // Regular character
                // Start new string if properties changed
                if (contents.length === 0 ||
                    JSON.stringify(contents[contents.length - 1].properties) !== JSON.stringify(properties)) {
                    contents.push({ s: '', i: [], properties: { ...properties } });
                }
                contents[contents.length - 1].s += char;
                contents[contents.length - 1].i.push(key);
                keys.shift();
            } else {
                keys.shift();
            }
        }

        return [startId, contents];
    }

    const paragraphs: Paragraph[] = [];

    while (keys.length > 0) {
        const [startId, contents] = parseParagraphContents();

        const startIdStr = crdtIdToString(startId);
        let style: LwwValue<ParagraphStyle>;

        if (text.styles.has(startIdStr)) {
            style = text.styles.get(startIdStr)!;
        } else {
            style = { timestamp: createCrdtId(0, 0), value: ParagraphStyle.PLAIN };
        }

        paragraphs.push({ contents, startId, style });
    }

    return { contents: paragraphs };
}

/**
 * Get the string content of a paragraph.
 */
export function paragraphToString(p: Paragraph): string {
    return p.contents.map(s => s.s).join('');
}
