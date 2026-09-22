import { describe, it, expect } from "vitest";
import {
  centreDd,
  centreNumbers,
  clampState,
  DEFAULT_STATE,
  MIN_HALF_HEIGHT,
  offsetAtPixel,
  shiftCentre,
  zoomAbout,
} from "../src/state";
import { dd, ddFromString, ddSub, ddToNumber, ddToString } from "../src/engine/deep/dd";
import type { AppState } from "../src/state";

// **The camera is the milestone's own claim, and it had no tests at all until the sweep said so.**
// Every move is `centre + a small increment` in double-double, because at a half-height of 1e-30 the
// increment is thirty orders below the centre and a float64 camera loses it entirely. `@cas/flow`'s
// `panView`/`zoomView` return an absolute `{cx, cy}` as doubles, which is why this app stopped using
// them; these tests are what that decision rests on.

const DEEP_CX = "4.206512041286740015298812143756041e-1";
const DEEP_CY = "4.8372964222232227103378339664795e-1";
const deep = (halfHeight: number): AppState => clampState({ ...DEFAULT_STATE, cx: DEEP_CX, cy: DEEP_CY, halfHeight });

describe("the double-double camera", () => {
  it("carries a pan a float64 camera loses completely", () => {
    // A twentieth of a 1e-30 view. Added to a centre of 0.42 in doubles it is nothing at all; in
    // double-double it is itself. (A single TEXEL at that view is 2e-33, which is below the
    // double-double's own ulp of 5.2e-33 there — which is why `MIN_HALF_HEIGHT` is where it is.)
    const state = deep(1e-30);
    const step = 1e-31;
    const moved = shiftCentre(state, step, 0);
    expect(Number(moved.cx) + 0).toBe(Number(state.cx)); // the DOUBLES are identical…
    const delta = ddSub(ddFromString(moved.cx) ?? [0, 0], ddFromString(state.cx) ?? [0, 0]);
    // Within one ulp of the arithmetic itself: `|z|·2⁻¹⁰⁶ ≈ 5.2e-33` at this centre, so a 1e-31 step
    // is about nineteen ulps and lands within one of them. A double would have moved it by zero.
    const ulp = Math.abs(Number(state.cx)) * Math.pow(2, -106);
    expect(Math.abs(ddToNumber(delta) - step)).toBeLessThan(2 * ulp);
    expect(ddToNumber(delta)).toBeGreaterThan(0.9 * step); // …and the value moved by exactly one step
    // A float64 camera would have moved it by zero, which is the whole point.
    expect(Number(state.cx) + step - Number(state.cx)).toBe(0);
  });

  it("pans in both coordinates, and back again exactly", () => {
    const state = deep(1e-24);
    const there = shiftCentre(shiftCentre(state, 3e-27, -5e-27), -3e-27, 5e-27);
    expect(ddToNumber(ddSub(ddFromString(there.cx) ?? [0, 0], ddFromString(state.cx) ?? [0, 0]))).toBe(0);
    expect(ddToNumber(ddSub(ddFromString(there.cy) ?? [0, 0], ddFromString(state.cy) ?? [0, 0]))).toBe(0);
  });

  it("zooms about a point, holding that point still", () => {
    // The property a wheel zoom has to have: whatever is under the cursor stays under the cursor. In
    // offsets that is `offset' = offset/k` about the new centre, which is what `c + offset·(1 − 1/k)`
    // gives — and `t = 1` (the centre jumping to the cursor) or `halfHeight · k` (zooming out) both
    // break it.
    const state = deep(1e-20);
    const dx = 3e-21;
    const dy = -1.5e-21;
    for (const k of [2, 1.4, 0.5]) {
      const zoomed = zoomAbout(state, dx, dy, k);
      expect(zoomed.halfHeight).toBeCloseTo(state.halfHeight / k, 40);
      // The cursor's world point, re-expressed as an offset from the new centre.
      const moved = ddSub(ddFromString(zoomed.cx) ?? [0, 0], ddFromString(state.cx) ?? [0, 0]);
      const newOffset = dx - ddToNumber(moved);
      expect(newOffset / dx).toBeCloseTo(1 / k, 12);
    }
  });

  it("refuses a factor it cannot use rather than producing a NaN view", () => {
    const state = deep(1e-20);
    for (const bad of [0, -2, Number.NaN, Number.POSITIVE_INFINITY]) {
      const z = zoomAbout(state, 1e-21, 0, bad);
      expect(Number.isFinite(z.halfHeight), String(bad)).toBe(true);
      expect(z.halfHeight, String(bad)).toBe(state.halfHeight);
    }
  });

  it("the pixel offset has the plane's y, not the screen's", () => {
    // Screen `y` grows downward and the plane's grows upward. Getting this backwards inverts every
    // drag and every zoom-about-the-cursor, and no other test in the app looks at it.
    const top = offsetAtPixel(500, 0, 1000, 800, 2);
    const bottom = offsetAtPixel(500, 800, 1000, 800, 2);
    expect(top.dy).toBeCloseTo(2, 12);
    expect(bottom.dy).toBeCloseTo(-2, 12);
    expect(top.dx).toBeCloseTo(0, 12);
    // And `x` carries the aspect: a 1000×800 canvas is 1.25 as wide as it is tall.
    expect(offsetAtPixel(1000, 400, 1000, 800, 2).dx).toBeCloseTo(2.5, 12);
    expect(offsetAtPixel(0, 400, 1000, 800, 2).dx).toBeCloseTo(-2.5, 12);
  });

  it("reads the centre back as doubles for the engines that can only use doubles", () => {
    const state = deep(1e-30);
    const n = centreNumbers(state);
    expect(n.cx).toBeCloseTo(0.4206512041286740, 15);
    // The double is NOT the centre: the difference is 1e-17, which is 1e13 view heights.
    const exact = centreDd(state);
    expect(ddToNumber(ddSub(exact.cx, dd(n.cx)))).not.toBe(0);
    expect(Math.abs(ddToNumber(ddSub(exact.cx, dd(n.cx))))).toBeLessThan(1e-16);
  });

  it("clamps a coordinate it cannot read, and keeps one it can to the last digit", () => {
    expect(clampState({ ...DEFAULT_STATE, cx: "nonsense" }).cx).toBe("0");
    expect(clampState({ ...DEFAULT_STATE, cx: "1e9" }).cx).toBe("0"); // outside the plane the app draws
    expect(clampState({ ...DEFAULT_STATE, cx: DEEP_CX }).cx).toBe(DEEP_CX);
    expect(clampState({ ...DEFAULT_STATE, halfHeight: 1e-40 }).halfHeight).toBe(MIN_HALF_HEIGHT);
  });

  it("a thousand wheel steps do not drift the centre", () => {
    // The camera is only ever `centre + increment`, so the error is one rounding per step rather than
    // an accumulating subtraction of two large numbers. Zooming in and back out must land where it
    // started, to the arithmetic's own floor.
    let state = deep(1e-6);
    const start = ddToString(centreDd(state).cx);
    for (let i = 0; i < 500; i++) state = zoomAbout(state, state.halfHeight * 0.3, state.halfHeight * 0.1, 1.05);
    for (let i = 0; i < 500; i++) state = zoomAbout(state, state.halfHeight * 0.3, state.halfHeight * 0.1, 1 / 1.05);
    expect(state.halfHeight).toBeCloseTo(1e-6, 18);
    const drift = Math.abs(ddToNumber(ddSub(centreDd(state).cx, ddFromString(start) ?? [0, 0])));
    // The deepest view reached is 1e-6/1.05^500 ≈ 2e-17, where a texel is 4e-20. Measured drift:
    // 1.3e-21, three per cent of a texel at the deepest point of the journey.
    expect(drift).toBeLessThan(1e-20);
  });
});
