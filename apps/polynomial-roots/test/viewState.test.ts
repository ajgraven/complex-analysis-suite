import { describe, it, expect } from "vitest";
import { encodeViewState } from "@cas/interchange";
import { decodeState, encodeState } from "../src/viewState";
import { clampState, DEFAULT_STATE, MAX_DEGREE } from "../src/state";
import type { AppState } from "../src/state";
import { PLACES } from "../src/places";

const settled = (s: AppState): DecodeOk => {
  const r = decodeState(encodeState(s));
  expect(r).not.toBeNull();
  if (r === null || "refused" in r) throw new Error(`refused: ${r === null ? "null" : r.refused}`);
  return r;
};
type DecodeOk = { state: AppState };

/** Two states as unlike as this app gets — the round trip is checked in BOTH directions between them. */
const A: AppState = clampState({
  alphabet: { preset: "littlewood" },
  minDegree: 1,
  maxDegree: 16,
  colour: "density",
  exposure: 1,
  gamma: 1,
  cx: 0,
  cy: 0,
  halfHeight: 1.45,
  circleDelta: 0.02,
});
const B: AppState = clampState({
  alphabet: { preset: "custom", custom: "1, -1, i, -i" },
  minDegree: 7,
  maxDegree: 13,
  colour: "degree",
  exposure: 6.25,
  gamma: 0.62,
  cx: -0.372368,
  cy: 0.517839,
  halfHeight: 0.00025,
  circleDelta: 0.004,
});

describe("the permalink round trip", () => {
  it("restores a state the app is NOT in — every field differs, in both directions", () => {
    // A fixed-point test would pass on a codec that silently drops a field, since a `currentState` that
    // forgets it and an `applyState` that never reads it agree perfectly. Two maximally-unlike states,
    // applied each way, is the property a permalink actually needs (the M6.1 lesson).
    for (const [from, to] of [
      [A, B],
      [B, A],
    ] as const) {
      expect(from).not.toEqual(to);
      expect(settled(to).state).toEqual(to);
      // And the encode does not depend on what the app was showing before.
      expect(encodeState(to)).toBe(encodeState(clampState({ ...from, ...to })));
    }
  });

  it("every field survives — dropped fields are what a round trip hides", () => {
    const s = settled(B).state;
    expect(s.alphabet).toEqual(B.alphabet);
    expect(s.minDegree).toBe(B.minDegree);
    expect(s.maxDegree).toBe(B.maxDegree);
    expect(s.colour).toBe(B.colour);
    expect(s.exposure).toBeCloseTo(B.exposure, 6);
    expect(s.gamma).toBeCloseTo(B.gamma, 6);
    expect(s.cx).toBeCloseTo(B.cx, 9);
    expect(s.cy).toBeCloseTo(B.cy, 9);
    expect(s.halfHeight).toBeCloseTo(B.halfHeight, 12);
    expect(s.circleDelta).toBeCloseTo(B.circleDelta, 9);
  });

  it("carries a deep view without losing it to rounding", () => {
    const deep = clampState({ ...A, cx: 0.42065, cy: 0.48354, halfHeight: 2.4456e-3 });
    const s = settled(deep).state;
    expect(s.halfHeight).toBeCloseTo(deep.halfHeight, 12);
    // Nine significant figures: the view's own precision, far beyond a 1024-pixel stage.
    expect(Math.abs(s.cx - deep.cx)).toBeLessThan(1e-9);
  });

  it("every named place reopens where it points, and its link is stable", () => {
    // NOT bit-for-bit: the codec rounds coordinates to nine significant figures, which is deliberate and
    // far finer than a 1024-pixel stage can show — `½·e^{i/5}` is 0.4900332889206208 and comes back as
    // 0.490033289. What must hold is that the place reopens within that precision, and that encoding the
    // decoded state gives the IDENTICAL link, so the same place shared twice is the same URL.
    for (const place of PLACES) {
      const reopened = settled(place.state).state;
      const wanted = clampState(place.state);
      expect(reopened.alphabet, place.id).toEqual(wanted.alphabet);
      expect(reopened.minDegree, place.id).toBe(wanted.minDegree);
      expect(reopened.maxDegree, place.id).toBe(wanted.maxDegree);
      expect(reopened.colour, place.id).toBe(wanted.colour);
      for (const key of ["cx", "cy", "halfHeight", "exposure", "gamma", "circleDelta"] as const) {
        const scale = Math.max(1e-12, Math.abs(wanted[key]));
        expect(Math.abs(reopened[key] - wanted[key]) / scale, `${place.id}.${key}`).toBeLessThan(1e-8);
      }
      expect(encodeState(reopened), place.id).toBe(encodeState(wanted));
    }
  });

  it("the default state encodes to almost nothing, because the payload is a diff", () => {
    const link = encodeState(DEFAULT_STATE);
    expect(link.length).toBeLessThan(80);
    expect(settled(DEFAULT_STATE).state).toEqual(DEFAULT_STATE);
  });
});

describe("a link that cannot be honoured refuses BY NAME", () => {
  const forge = (payload: Record<string, unknown>, app = "pr"): string => encodeViewState(app, payload);

  it("distinguishes 'no link' from 'a link I cannot open'", () => {
    // null is an absence; a string is a refusal. They are different events and the shell shows them
    // differently — a refusal wiped by the next successful parse would be no refusal at all.
    expect(decodeState("")).toBeNull();
    expect(decodeState("#")).toBeNull();
    expect(decodeState("#something-else")).toBeNull();
    const r = decodeState("#vs=not-base64!!");
    expect(r).not.toBeNull();
    expect(r !== null && "refused" in r).toBe(true);
  });

  it("names the reason: a foreign app", () => {
    const r = decodeState(forge({ dmin: 3 }, "ci"));
    expect(r !== null && "refused" in r && r.refused).toContain("another app");
  });

  it("names the reason: an alphabet it cannot read", () => {
    const r = decodeState(forge({ preset: "custom", custom: "1, banana" }));
    expect(r !== null && "refused" in r && r.refused).toContain("banana");
    const bad = decodeState(forge({ preset: "not-a-preset" }));
    expect(bad !== null && "refused" in bad).toBe(true);
  });

  it("names the reason: a degree beyond what it computes", () => {
    const r = decodeState(forge({ dmax: 40 }));
    expect(r !== null && "refused" in r && r.refused).toContain(String(MAX_DEGREE));
    const low = decodeState(forge({ dmin: 0 }));
    expect(low !== null && "refused" in low).toBe(true);
  });

  it("names the reason: a colour mode it does not have", () => {
    const r = decodeState(forge({ colour: "rainbow" }));
    expect(r !== null && "refused" in r && r.refused).toContain("rainbow");
  });

  it("names the reason: a non-finite number", () => {
    for (const payload of [{ cx: "x" }, { h: null }, { exposure: "1e999" }, { delta: [] }]) {
      const r = decodeState(forge(payload));
      expect(r !== null && "refused" in r, JSON.stringify(payload)).toBe(true);
    }
  });

  it("REFUSES rather than clamping the things that have no nearest legal value", () => {
    // A degree of 40 has a nearest legal value (24) and is still refused, because opening a link at a
    // different degree than it names shows the reader something other than what they were sent while
    // letting them believe otherwise. A halfHeight of 1e-30 has no such ambiguity — it is a view, and the
    // app clamps it to its zoom floor rather than refusing.
    expect(decodeState(forge({ dmax: 40 }))).toMatchObject({ refused: expect.any(String) });
    const zoomed = decodeState(forge({ h: 1e-30 }));
    expect(zoomed).not.toBeNull();
    expect(zoomed !== null && "state" in zoomed && zoomed.state.halfHeight).toBeGreaterThan(0);
  });

  it("a field it has never heard of is ignored, not refused", () => {
    // Forward compatibility: a link minted by a later version must still open at this one.
    const r = decodeState(forge({ dmin: 4, dmax: 9, somethingNew: { deeply: [1, 2, 3] } }));
    expect(r).not.toBeNull();
    expect(r !== null && "state" in r && r.state.minDegree).toBe(4);
    expect(r !== null && "state" in r && r.state.maxDegree).toBe(9);
  });
});
