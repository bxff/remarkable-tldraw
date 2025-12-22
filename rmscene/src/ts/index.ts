/**
 * rmscene - TypeScript library for parsing reMarkable v6 .rm files
 * 
 * @module rmscene
 */

// Core types
export {
    CrdtId,
    LwwValue,
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
export {
    CrdtSequence,
    CrdtSequenceItem,
    createCrdtSequenceItem,
    toposortItems,
    END_MARKER,
} from './crdt-sequence';

// Scene items
export {
    SceneItem,
    Point,
    Line,
    Group,
    Text,
    GlyphRange,
    Rectangle,
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
export { TaggedBlockReader, MainBlockInfo, SubBlockInfo, BlockInfo, BlockOverflowError } from './tagged-block-reader';
export { TaggedBlockWriter } from './tagged-block-writer';

// Scene stream (blocks)
export {
    Block,
    BlockType,
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
