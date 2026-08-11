import { describe, expect, it } from "vitest";
import {
  keyToNav,
  pointerDistance,
  pointerMidpoint,
  pinchFactor,
  leftHalf,
  rightHalf,
  isLeftHalf,
} from "../src/ui/navigation.js";

// Phase 6 / 6C (L7): the pure navigation helpers behind keyboard + touch. The key→intent map and the
// pinch math are pinned here; the mode-aware application (pan / orbit / arcball) and focus handling are
// proven by the headless a11y check.

describe("keyToNav — key → navigation intent", () => {
  it("maps the arrow keys to directions", () => {
    expect(keyToNav("ArrowLeft")).toBe("left");
    expect(keyToNav("ArrowRight")).toBe("right");
    expect(keyToNav("ArrowUp")).toBe("up");
    expect(keyToNav("ArrowDown")).toBe("down");
  });

  it("maps +/- (and the unshifted =) to zoom, 0 / Home to reset", () => {
    expect(keyToNav("+")).toBe("in");
    expect(keyToNav("=")).toBe("in");
    expect(keyToNav("-")).toBe("out");
    expect(keyToNav("_")).toBe("out");
    expect(keyToNav("0")).toBe("reset");
    expect(keyToNav("Home")).toBe("reset");
  });

  it("returns null for a non-navigation key (so the handler leaves it alone)", () => {
    for (const k of ["a", "Enter", "Escape", "Shift", "1", "ArrowUpLeft", " "]) {
      expect(keyToNav(k)).toBeNull();
    }
  });
});

describe("pinch math", () => {
  it("pointerDistance / pointerMidpoint", () => {
    expect(pointerDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(pointerMidpoint({ x: 0, y: 0 }, { x: 4, y: 2 })).toEqual({ x: 2, y: 1 });
  });

  it("fingers apart zoom in (factor < 1), together zoom out (factor > 1)", () => {
    expect(pinchFactor(100, 200)).toBe(0.5); // spread → zoom in
    expect(pinchFactor(200, 100)).toBe(2); // pinch → zoom out
    expect(pinchFactor(150, 150)).toBe(1); // no change
  });

  it("clamps each step to [0.25, 4]", () => {
    expect(pinchFactor(100, 10)).toBe(4); // ratio 10 → clamped
    expect(pinchFactor(10, 100)).toBe(0.25); // ratio 0.1 → clamped
  });

  it("guards a zero / non-finite span as a no-op", () => {
    expect(pinchFactor(0, 100)).toBe(1);
    expect(pinchFactor(100, 0)).toBe(1);
    expect(pinchFactor(Number.NaN, 100)).toBe(1);
  });
});

describe("linked-view split (I7)", () => {
  const rect = { left: 100, top: 20, width: 800, height: 600 };

  it("leftHalf takes the left pane, same top/height, half the width", () => {
    expect(leftHalf(rect)).toEqual({ left: 100, top: 20, width: 400, height: 600 });
  });

  it("rightHalf takes the surface pane (offset to the midpoint), half the width", () => {
    expect(rightHalf(rect)).toEqual({ left: 500, top: 20, width: 400, height: 600 });
  });

  it("isLeftHalf splits at the horizontal midpoint (left = 2D pane, right = surface)", () => {
    expect(isLeftHalf(100, rect)).toBe(true); // left edge
    expect(isLeftHalf(499, rect)).toBe(true); // just left of centre (100 + 800/2 = 500)
    expect(isLeftHalf(500, rect)).toBe(false); // the centre line → right pane
    expect(isLeftHalf(880, rect)).toBe(false); // right edge
  });
});
