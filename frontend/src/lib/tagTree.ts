import type { Tag } from '../types';

export interface TagTreeNode {
  segment: string;         // e.g., "clampOpen"
  path: string;            // e.g., "Moves.clampOpen"
  children: TagTreeNode[];
  tags: Tag[];             // leaf tags whose name ends at this level
}

export interface TagTree {
  children: TagTreeNode[];  // top-level group nodes
  tags: Tag[];              // root-level tags (no dots in name)
}

/**
 * Build a tree from a flat list of tags by splitting names on '.'.
 * Tags without dots stay at the root level.
 */
export function buildTagTree(tags: Tag[]): TagTree {
  const root: TagTree = { children: [], tags: [] };
  const nodeMap = new Map<string, TagTreeNode>();

  function getOrCreate(segments: string[]): TagTreeNode {
    const path = segments.join('.');
    let node = nodeMap.get(path);
    if (node) return node;

    node = { segment: segments[segments.length - 1], path, children: [], tags: [] };
    nodeMap.set(path, node);

    if (segments.length === 1) {
      root.children.push(node);
    } else {
      const parent = getOrCreate(segments.slice(0, -1));
      parent.children.push(node);
    }
    return node;
  }

  for (const tag of tags) {
    const parts = tag.name.split('.').filter(Boolean);
    if (parts.length <= 1) {
      root.tags.push(tag);
    } else {
      // Tag belongs under its parent path (all segments except the last)
      const parentNode = getOrCreate(parts.slice(0, -1));
      parentNode.tags.push(tag);
    }
  }

  sortTree(root);
  return root;
}

function sortTree(tree: { children: TagTreeNode[]; tags: Tag[] }) {
  tree.children.sort((a, b) => a.segment.localeCompare(b.segment));
  tree.tags.sort((a, b) => a.name.localeCompare(b.name));
  for (const child of tree.children) {
    sortTree(child);
  }
}

/** Recursively collect all leaf tags under a node. */
export function getDescendantTags(node: TagTreeNode): Tag[] {
  const result: Tag[] = [...node.tags];
  for (const child of node.children) {
    result.push(...getDescendantTags(child));
  }
  return result;
}

/** Count all leaf tags under a node. */
export function countDescendantTags(node: TagTreeNode): number {
  let count = node.tags.length;
  for (const child of node.children) {
    count += countDescendantTags(child);
  }
  return count;
}

/**
 * For each tag matching the query (name or display_name), add all ancestor
 * paths to the result set. Used for auto-expanding branches during search.
 */
export function getMatchingPaths(tree: TagTree, query: string): Set<string> {
  const paths = new Set<string>();
  const lowerQuery = query.toLowerCase();

  function walkNode(node: TagTreeNode) {
    let hasMatch = false;

    for (const tag of node.tags) {
      if (
        tag.name.toLowerCase().includes(lowerQuery) ||
        (tag.display_name || '').toLowerCase().includes(lowerQuery)
      ) {
        hasMatch = true;
      }
    }

    for (const child of node.children) {
      walkNode(child);
      if (paths.has(child.path)) hasMatch = true;
    }

    if (hasMatch) paths.add(node.path);
  }

  for (const child of tree.children) {
    walkNode(child);
  }

  return paths;
}
