import { describe, it, expect } from "vitest";
import { encodeState, applyStateFromHash } from "../src/persist.js";
import { initialState, type Placed } from "../src/state.js";
import { encodeViewState } from "@cas/interchange";

const shape = (s: Placed): unknown =>
  s.kind === "monopole"
    ? { kind: "monopole", at: s.at, c: s.c }
    : { kind: "doublet", at: s.at, mu: s.mu };

describe("permalink round-trip", () => {
  it("restores uniform, singularities, view, sensor, and probe", () => {
    const a = initialState();
    a.uniform = [0.3, -0.2];
    a.view = { center: [1, 2], halfSpan: 5 };
    a.sensor = [0.75, -0.4];
    a.probe = { x0: -1, y0: -1, x1: 1.5, y1: 0.5 };
    a.singularities = [
      { id: 1, kind: "monopole", at: [0.5, 0.5], c: [2, -1] },
      { id: 2, kind: "doublet", at: [-1, 0], mu: [0.4, 0.3] },
    ];
    const hash = encodeState(a);

    const b = initialState();
    expect(applyStateFromHash(b, hash)).toBe(true);
    expect(b.uniform).toEqual([0.3, -0.2]);
    expect(b.view).toEqual({ center: [1, 2], halfSpan: 5 });
    expect(b.sensor).toEqual([0.75, -0.4]);
    expect(b.probe).toEqual({ x0: -1, y0: -1, x1: 1.5, y1: 0.5 });
    expect(b.singularities.map(shape)).toEqual(a.singularities.map(shape));
    // ids are freshly assigned, not carried across the wire
    expect(b.singularities.every((s) => typeof s.id === "number")).toBe(true);
  });

  it("leaves sensor/probe untouched when the link omits them", () => {
    const a = initialState();
    a.singularities = [{ id: 1, kind: "monopole", at: [0, 0], c: [1, 0] }];
    // encodeState omits sensor/probe when null, so a decoded default state keeps its null annotations.
    const b = initialState();
    expect(applyStateFromHash(b, encodeState(a))).toBe(true);
    expect(b.sensor).toBeNull();
    expect(b.probe).toBeNull();
  });

  it("ignores a legacy `lens` field from links shared before the app went electrostatic-only", () => {
    // Old permalinks encoded a `lens` reading; the field no longer exists. Decoding must restore the
    // rest of the state and simply drop the unknown key (defensive decode), never throw.
    const legacy = encodeViewState("2de", {
      uniform: [0.5, 0],
      sings: [{ k: "m", at: [0, 0], c: [1, 0] }],
      view: { center: [0, 0], halfSpan: 3 },
      lens: "hydrodynamic",
    });
    const s = initialState();
    expect(applyStateFromHash(s, legacy)).toBe(true);
    expect(s.uniform).toEqual([0.5, 0]);
    expect(s.singularities).toHaveLength(1);
    expect("lens" in s).toBe(false);
  });

  it("rejects a foreign app namespace and malformed input", () => {
    const foreign = encodeViewState("qd", { anything: true });
    expect(applyStateFromHash(initialState(), foreign)).toBe(false);
    expect(applyStateFromHash(initialState(), "#vs=not-base64!!")).toBe(false);
    expect(applyStateFromHash(initialState(), "")).toBe(false);
  });
});
