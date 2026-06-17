/**
 * Pure tree model for the multi-pane terminal — SSOT for split/close/resize.
 *
 * A pane layout is a binary tree: leaves are terminals (keyed by a stable id),
 * splits divide a region into two children along a direction with a ratio. The
 * UI renders panes as a FLAT, absolutely-positioned list whose geometry is
 * computed from this tree (see computeLayout) — so splitting or resizing never
 * moves a pane in the React tree, which would remount its xterm and kill the
 * PTY. This module has no React/DOM deps and is unit-testable in isolation.
 */

export type SplitDir = "row" | "col"; // row = side-by-side, col = stacked

export type TermLeaf = { type: "leaf"; id: string };
export type TermSplit = {
  type: "split";
  id: string;
  dir: SplitDir;
  /** Fraction of the region given to child `a` (0..1). */
  ratio: number;
  a: TermNode;
  b: TermNode;
};
export type TermNode = TermLeaf | TermSplit;

export const RATIO_MIN = 0.12;
export const RATIO_MAX = 0.88;
const clampRatio = (r: number) => Math.max(RATIO_MIN, Math.min(RATIO_MAX, r));

export const leaf = (id: string): TermLeaf => ({ type: "leaf", id });

export function collectLeafIds(n: TermNode): string[] {
  return n.type === "leaf" ? [n.id] : [...collectLeafIds(n.a), ...collectLeafIds(n.b)];
}

export function firstLeafId(n: TermNode): string {
  return n.type === "leaf" ? n.id : firstLeafId(n.a);
}

/** Replace leaf `targetId` with a split holding the original leaf (a) plus a
 *  new leaf (b). Returns the tree unchanged if the target isn't present. */
export function splitLeaf(
  n: TermNode,
  targetId: string,
  splitId: string,
  newLeafId: string,
  dir: SplitDir,
): TermNode {
  if (n.type === "leaf") {
    if (n.id !== targetId) return n;
    return { type: "split", id: splitId, dir, ratio: 0.5, a: n, b: leaf(newLeafId) };
  }
  return {
    ...n,
    a: splitLeaf(n.a, targetId, splitId, newLeafId, dir),
    b: splitLeaf(n.b, targetId, splitId, newLeafId, dir),
  };
}

/** Remove leaf `targetId`, collapsing its parent split to the surviving
 *  sibling. Returns null when the whole tree is removed (last pane closed). */
export function closeLeaf(n: TermNode, targetId: string): TermNode | null {
  if (n.type === "leaf") return n.id === targetId ? null : n;
  const a = closeLeaf(n.a, targetId);
  const b = closeLeaf(n.b, targetId);
  if (a === null) return b;
  if (b === null) return a;
  return { ...n, a, b };
}

export function setRatio(n: TermNode, splitId: string, ratio: number): TermNode {
  if (n.type === "leaf") return n;
  if (n.id === splitId) return { ...n, ratio: clampRatio(ratio) };
  return { ...n, a: setRatio(n.a, splitId, ratio), b: setRatio(n.b, splitId, ratio) };
}

/** Rectangle in percentages of the container (0..100). */
export type Rect = { x: number; y: number; w: number; h: number };

export type LeafBox = { id: string; rect: Rect };
export type SplitBox = { id: string; dir: SplitDir; rect: Rect; ratio: number };

/** Flatten the tree into absolute leaf + divider rectangles for rendering. */
export function computeLayout(
  node: TermNode,
  rect: Rect = { x: 0, y: 0, w: 100, h: 100 },
): { leaves: LeafBox[]; splits: SplitBox[] } {
  if (node.type === "leaf") return { leaves: [{ id: node.id, rect }], splits: [] };

  const { dir, ratio } = node;
  const aRect: Rect =
    dir === "row"
      ? { x: rect.x, y: rect.y, w: rect.w * ratio, h: rect.h }
      : { x: rect.x, y: rect.y, w: rect.w, h: rect.h * ratio };
  const bRect: Rect =
    dir === "row"
      ? { x: rect.x + rect.w * ratio, y: rect.y, w: rect.w * (1 - ratio), h: rect.h }
      : { x: rect.x, y: rect.y + rect.h * ratio, w: rect.w, h: rect.h * (1 - ratio) };

  const a = computeLayout(node.a, aRect);
  const b = computeLayout(node.b, bRect);
  return {
    leaves: [...a.leaves, ...b.leaves],
    splits: [{ id: node.id, dir, rect, ratio }, ...a.splits, ...b.splits],
  };
}
