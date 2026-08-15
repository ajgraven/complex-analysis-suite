// crossing.ts — boundary-crossing detection (§11 C6): when the contour γ is dragged across a root, the
// enclosed count jumps by ±1 and the winding with it. Diffing the enclosed-root set between frames turns
// that discrete event into a signal we can announce ("a zero entered γ") and pulse.
//
// Only meaningful when the root SET is stable between frames (the caller gates this to the rational-exact
// path, whose roots don't move unless f changes); for a transcendental f the grid finder's roots drift as
// the search window moves, which would masquerade as crossings.

import type { Vec2 } from "./render/plane.js";

export type CrossKind = "zero" | "pole";

/** An enclosed root, keyed by kind + rounded position so it has a stable identity across frames. */
export interface EnclosedRoot {
  readonly key: string;
  readonly kind: CrossKind;
  readonly z: Vec2;
  readonly order: number;
}

export interface CrossEvent {
  readonly kind: CrossKind;
  readonly z: Vec2;
  readonly order: number;
  /** true = the root just moved INSIDE γ; false = it just moved OUTSIDE. */
  readonly entered: boolean;
}

/** A stable identity for a located root (positions are rounded — rational roots don't move). */
export function rootKey(kind: CrossKind, z: Vec2): string {
  return `${kind}:${z[0].toFixed(4)},${z[1].toFixed(4)}`;
}

/**
 * Diff the previously-enclosed roots (keyed) against the currently-enclosed roots into entered/left
 * crossing events. A key present now but not before ENTERED; present before but not now LEFT.
 */
export function diffEnclosure(
  prev: ReadonlyMap<string, EnclosedRoot>,
  curr: readonly EnclosedRoot[],
): CrossEvent[] {
  const currKeys = new Set(curr.map((r) => r.key));
  const events: CrossEvent[] = [];
  for (const r of curr) {
    if (!prev.has(r.key)) events.push({ kind: r.kind, z: r.z, order: r.order, entered: true });
  }
  for (const [key, r] of prev) {
    if (!currKeys.has(key)) events.push({ kind: r.kind, z: r.z, order: r.order, entered: false });
  }
  return events;
}
