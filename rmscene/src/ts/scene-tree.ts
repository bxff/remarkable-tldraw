/**
 * Scene tree structure for reMarkable documents.
 * 
 * TypeScript port of rmscene/src/rmscene/scene_tree.py
 * @module scene-tree
 */

import { CrdtId, crdtIdEquals, crdtIdToString, LwwValue, createCrdtId, createLwwValue } from './tagged-block-common';
import { CrdtSequence, CrdtSequenceItem } from './crdt-sequence';
import {
    Group, Text, SceneItem, Line, GlyphRange,
    createGroup, isGroup, isLine,
} from './scene-items';
import {
    Block, readBlocks,
    isSceneTreeBlock, isTreeNodeBlock, isSceneGroupItemBlock,
    isSceneLineItemBlock, isSceneGlyphItemBlock, isRootTextBlock,
} from './scene-stream';

const ROOT_ID = createCrdtId(0, 1);

/**
 * Scene tree representing the structure of a reMarkable document.
 */
export class SceneTree {
    private _nodes: Map<string, Group> = new Map();
    rootText: Text | null = null;

    constructor() {
        // Create root node
        this._nodes.set(crdtIdToString(ROOT_ID), createGroup(ROOT_ID));
    }

    /** Get the root group */
    get root(): Group {
        return this._nodes.get(crdtIdToString(ROOT_ID))!;
    }

    /** Check if a node exists */
    has(nodeId: CrdtId): boolean {
        return this._nodes.has(crdtIdToString(nodeId));
    }

    /** Get a node by ID */
    get(nodeId: CrdtId): Group | undefined {
        return this._nodes.get(crdtIdToString(nodeId));
    }

    /** Add a new node with given parent */
    addNode(nodeId: CrdtId, parentId: CrdtId): void {
        const key = crdtIdToString(nodeId);
        if (!this._nodes.has(key)) {
            this._nodes.set(key, createGroup(nodeId));
        }
    }

    /** Add an item to a parent's children */
    addItem(item: CrdtSequenceItem<SceneItem>, parentId: CrdtId): void {
        const parent = this.get(parentId);
        if (!parent) {
            throw new Error(`Parent node ${crdtIdToString(parentId)} does not exist`);
        }
        parent.children.add(item);
    }

    /** Walk through all items in the tree */
    *walk(group: Group = this.root): Generator<[CrdtId, SceneItem]> {
        for (const id of group.children) {
            const item = group.children.get(id);
            if (item) {
                yield [id, item];
                if (isGroup(item)) {
                    yield* this.walk(item);
                }
            }
        }
    }
}

/**
 * Build a SceneTree from blocks.
 */
export function buildTree(tree: SceneTree, blocks: Iterable<Block>): void {
    for (const block of blocks) {
        if (isSceneTreeBlock(block)) {
            tree.addNode(block.treeId, block.parentId);
        } else if (isTreeNodeBlock(block)) {
            const node = tree.get(block.group.nodeId);
            if (!node) {
                throw new Error(`Node does not exist for TreeNodeBlock: ${crdtIdToString(block.group.nodeId)}`);
            }
            node.label = block.group.label;
            node.visible = block.group.visible;
            node.anchorId = block.group.anchorId;
            node.anchorType = block.group.anchorType;
            node.anchorThreshold = block.group.anchorThreshold;
            node.anchorOriginX = block.group.anchorOriginX;
        } else if (isSceneGroupItemBlock(block)) {
            const nodeId = block.item.value;
            if (nodeId === null) continue;

            const node = tree.get(nodeId);
            if (!node) {
                throw new Error(`Node does not exist for SceneGroupItemBlock: ${crdtIdToString(nodeId)}`);
            }

            // Create item with the group as value
            const item: CrdtSequenceItem<SceneItem> = {
                itemId: block.item.itemId,
                leftId: block.item.leftId,
                rightId: block.item.rightId,
                deletedLength: block.item.deletedLength,
                value: node,
            };
            tree.addItem(item, block.parentId);
        } else if (isSceneLineItemBlock(block) || isSceneGlyphItemBlock(block)) {
            tree.addItem(block.item as CrdtSequenceItem<SceneItem>, block.parentId);
        } else if (isRootTextBlock(block)) {
            tree.rootText = block.value;
        }
    }
}

/**
 * Read a reMarkable file and return a SceneTree.
 */
export function readTree(data: ArrayBuffer | Uint8Array): SceneTree {
    const tree = new SceneTree();
    buildTree(tree, readBlocks(data));
    return tree;
}
