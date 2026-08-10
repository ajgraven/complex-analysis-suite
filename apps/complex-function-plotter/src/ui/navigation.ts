/**
 * Pure navigation helpers for accessibility (catalog L7). `keyToNav` maps a keyboard key to a
 * MODE-AGNOSTIC navigation intent — `main.ts` turns it into pan / zoom in 2D, orbit / dolly in 3D, or
 * arcball / dolly on the Riemann sphere — and the pinch helpers give the two-finger touch-zoom its math.
 * No DOM, so both are unit-tested directly (the end-to-end key/touch handling is the headless check).
 */

/** A mode-agnostic navigation intent from a key press: a direction, a zoom in/out, or a view reset. */
export type NavIntent = "left" | "right" | "up" | "down" | "in" | "out" | "reset";

/**
 * Map a `KeyboardEvent.key` to a {@link NavIntent}, or `null` when the key isn't a navigation key (so the
 * caller can ignore it and not `preventDefault`). Arrows move; `+` / `-` zoom (with `=` as the unshifted
 * `+` key); `0` or `Home` resets the view.
 */
export function keyToNav(key: string): NavIntent | null {
  switch (key) {
    case "ArrowLeft":
      return "left";
    case "ArrowRight":
      return "right";
    case "ArrowUp":
      return "up";
    case "ArrowDown":
      return "down";
    case "+":
    case "=":
      return "in";
    case "-":
    case "_":
      return "out";
    case "0":
    case "Home":
      return "reset";
    default:
      return null;
  }
}

/** A pointer position in client pixels. */
export interface Pt {
  x: number;
  y: number;
}

/** A CSS-pixel rect (a `getBoundingClientRect`-compatible subset), used to split the linked view (I7). */
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The left sub-rect of a horizontal split — the flat (2D) pane of the linked view. */
export function leftHalf(r: Rect): Rect {
  return { left: r.left, top: r.top, width: r.width / 2, height: r.height };
}

/** Whether a client-x falls in the left (flat) half of `r`; the right half is the 3D surface. */
export function isLeftHalf(clientX: number, r: Rect): boolean {
  return clientX < r.left + r.width / 2;
}

/** Euclidean distance between two pointers (the pinch span). */
export function pointerDistance(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Midpoint of two pointers (the pinch focus — the point to zoom about). */
export function pointerMidpoint(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * The view-scale factor for a pinch from `prevDist` to `dist`, in the plotter's convention where a factor
 * `< 1` zooms **in** (shrinks the world span / dollies closer): fingers spreading apart (`dist > prevDist`)
 * gives `prevDist / dist < 1`, i.e. zoom in — the same sense as the scroll wheel. Guards a zero /
 * non-finite previous span (returns 1, a no-op) and clamps each step to `[0.25, 4]` so a jittery touch
 * can't teleport the view.
 */
export function pinchFactor(prevDist: number, dist: number): number {
  if (!(prevDist > 0) || !(dist > 0)) return 1;
  return Math.min(4, Math.max(0.25, prevDist / dist));
}
