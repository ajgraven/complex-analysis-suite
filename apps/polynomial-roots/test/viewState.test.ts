import { describe, it, expect } from "vitest";
import { encodeViewState } from "@cas/interchange";
import { decodeState, encodeState } from "../src/viewState";
import { clampState, DEFAULT_STATE, MAX_DEGREE } from "../src/state";
import { dd, ddFromString, ddSub, ddToNumber, ddToString } from "../src/engine/deep/dd";
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
  cx: "0",
  cy: "0",
  halfHeight: 1.45,
  circleDelta: 0.02,
  engine: "auto",
  depth: 28,
  annulus: false,
});
const B: AppState = clampState({
  alphabet: { preset: "custom", custom: "1, -1, i, -i" },
  minDegree: 7,
  maxDegree: 13,
  colour: "degree",
  exposure: 6.25,
  gamma: 0.62,
  cx: "-0.372368",
  cy: "0.517839",
  halfHeight: 0.00025,
  circleDelta: 0.004,
  engine: "limit",
  depth: 41,
  annulus: true,
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
    expect(s.cx).toBe(B.cx);
    expect(s.cy).toBe(B.cy);
    expect(s.halfHeight).toBeCloseTo(B.halfHeight, 12);
    expect(s.circleDelta).toBeCloseTo(B.circleDelta, 9);
  });

  it("carries a deep centre EXACTLY, to the last digit it was given", () => {
    // The centre is the one field a permalink may not round. At a half-height of 1e-30 the view spans
    // thirty orders below the centre's own magnitude, so a coordinate rounded to nine — or to
    // seventeen — significant figures opens somewhere else entirely, and nothing on the page would say
    // so. It rides as a decimal STRING and comes back character for character.
    const deep = clampState({
      ...A,
      cx: "4.206512041286740015298812143756041e-1",
      cy: "4.8372964222232227103378339664795e-1",
      halfHeight: 1e-30,
      engine: "deep",
    });
    const s = settled(deep).state;
    expect(s.cx).toBe(deep.cx);
    expect(s.cy).toBe(deep.cy);
    expect(s.halfHeight).toBe(deep.halfHeight);
    expect(s.engine).toBe("deep");
    // And the number it stands for survives the round trip in double-double, not merely the text.
    const before = ddFromString(deep.cx);
    const after = ddFromString(s.cx);
    expect(after).toEqual(before);
    // A double could not have carried it: the nearest one differs from the string by more than a view.
    expect(Math.abs(ddToNumber(before ?? [0, 0]) - Number(deep.cx))).toBeLessThan(1e-16);
    expect(ddToString(ddSub(before ?? [0, 0], dd(Number(deep.cx))))).not.toBe("0");
  });

  it("still opens a link that carries its centre as a NUMBER", () => {
    // Every link minted before PR-3 does, and a double is a perfectly good centre for the views those
    // links can express. Refusing them would break every shared picture the app has published.
    const link = encodeViewState("pr", { cx: 0.42065, cy: 0.48354, h: 0.0244 });
    const r = decodeState(link);
    if (r === null || "refused" in r) throw new Error("refused a legacy link");
    expect(Number(r.state.cx)).toBeCloseTo(0.42065, 12);
    expect(Number(r.state.cy)).toBeCloseTo(0.48354, 12);
  });

  it("every named place reopens where it points, and its link is stable", () => {
    // The CENTRE is bit-for-bit, because it rides as a string; the scalars are still rounded to nine
    // significant figures, which is deliberate and far finer than a 1024-pixel stage can show. What must
    // hold is that the place reopens where it points, and that encoding the decoded state gives the
    // IDENTICAL link, so the same place shared twice is the same URL.
    for (const place of PLACES) {
      const reopened = settled(place.state).state;
      const wanted = clampState(place.state);
      expect(reopened.alphabet, place.id).toEqual(wanted.alphabet);
      expect(reopened.minDegree, place.id).toBe(wanted.minDegree);
      expect(reopened.maxDegree, place.id).toBe(wanted.maxDegree);
      expect(reopened.colour, place.id).toBe(wanted.colour);
      expect(reopened.cx, `${place.id}.cx`).toBe(wanted.cx);
      expect(reopened.cy, `${place.id}.cy`).toBe(wanted.cy);
      for (const key of ["halfHeight", "exposure", "gamma", "circleDelta"] as const) {
        const scale = Math.max(1e-32, Math.abs(wanted[key]));
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
