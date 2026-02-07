/**
 * rmscene - TypeScript library for parsing reMarkable v6 .rm files
 * 
 * @module rmscene
 */

// Core types
export type {
    CrdtId,
    LwwValue,
} from './tagged-block-common';
export {
    TagType,
    DataStream,
    UnexpectedBlockError,
    createCrdtId,
    createLwwValue,
    crdtIdEquals,
    crdtIdCompare,
    crdtIdToString,
    HEADER_V6,
} from './tagged-block-common';

// CRDT Sequence
export type {
    CrdtSequenceItem,
} from './crdt-sequence';
export {
    CrdtSequence,
    createCrdtSequenceItem,
    toposortItems,
    END_MARKER,
} from './crdt-sequence';

// Scene items
export type {
    SceneItem,
    Point,
    Line,
    Group,
    Text,
    GlyphRange,
    Rectangle,
} from './scene-items';
export {
    PenColor,
    Pen,
    ParagraphStyle,
    createPoint,
    createLine,
    createGroup,
    createText,
    createGlyphRange,
    createRectangle,
    isLine,
    isGroup,
    isText,
    isGlyphRange,
    isHighlighter,
} from './scene-items';

// Block reader/writer
export type { MainBlockInfo, SubBlockInfo, BlockInfo } from './tagged-block-reader';
export { TaggedBlockReader, BlockOverflowError } from './tagged-block-reader';
export { TaggedBlockWriter } from './tagged-block-writer';

// Scene stream (blocks)
export type {
    Block,
    AuthorIdsBlock,
    MigrationInfoBlock,
    PageInfoBlock,
    SceneTreeBlock,
    TreeNodeBlock,
    SceneInfoBlock,
    SceneLineItemBlock,
    SceneGroupItemBlock,
    SceneGlyphItemBlock,
    RootTextBlock,
    UnreadableBlock,
} from './scene-stream';
export {
    BlockType,
    readBlocks,
    readBlock,
    isAuthorIdsBlock,
    isMigrationInfoBlock,
    isPageInfoBlock,
    isSceneTreeBlock,
    isTreeNodeBlock,
    isSceneInfoBlock,
    isSceneLineItemBlock,
    isSceneGroupItemBlock,
    isSceneGlyphItemBlock,
    isRootTextBlock,
    isUnreadableBlock,
    createAuthorIdsBlock,
    createMigrationInfoBlock,
    createPageInfoBlock,
    createSceneTreeBlock,
    createTreeNodeBlock,
    createSceneInfoBlock,
    createSceneLineItemBlock,
    createSceneGroupItemBlock,
    createSceneGlyphItemBlock,
    createRootTextBlock,
} from './scene-stream';

// Scene tree
export { SceneTree, buildTree, readTree } from './scene-tree';
