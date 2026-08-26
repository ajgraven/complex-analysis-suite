import { describe, it, expect } from "vitest";
import { encodeState, applyStateFromHash } from "../src/persist.js";
import { initialState, type Placed } from "../src/state.js";
import { encodeViewState } from "@cas/interchange";

const shape = (s: Placed): unknown =>
  s.kind === "monopole"
    ? { kind: "monopole", at: s.at, c: s.c }
    : { kind: "doublet", at: s.at, mu: s.mu };

describe("permalink round-trip", () => {
  it("restores uniform, singularities, view, and lens", () => {
    const a = initialState();
    a.uniform = [0.3, -0.2];
    a.lens = "hydrodynamic";
    a.view = { center: [1, 2], halfSpan: 5 };
    a.singularities = [
      { id: 1, kind: "monopole", at: [0.5, 0.5], c: [2, -1] },
      { id: 2, kind: "doublet", at: [-1, 0], mu: [0.4, 0.3] },
    ];
    const hash = encodeState(a);

    const b = initialState();
    expect(applyStateFromHash(b, hash)).toBe(true);
    expect(b.uniform).toEqual([0.3, -0.2]);
    expect(b.lens).toBe("hydrodynamic");
    expect(b.view).toEqual({ center: [1, 2], halfSpan: 5 });
    expect(b.singularities.map(shape)).toEqual(a.singularities.map(shape));
    // ids are freshly assigned, not carried across the wire
    expect(b.singularities.every((s) => typeof s.id === "number")).toBe(true);
  });

  it("rejects a foreign app namespace and malformed input", () => {
    const foreign = encodeViewState("qd", { anything: true });
    expect(applyStateFromHash(initialState(), foreign)).toBe(false);
    expect(applyStateFromHash(initialState(), "#vs=not-base64!!")).toBe(false);
    expect(applyStateFromHash(initialState(), "")).toBe(false);
  });
});
