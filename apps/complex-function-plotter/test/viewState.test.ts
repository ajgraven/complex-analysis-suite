import { describe, expect, it } from "vitest";
import { encodeViewState } from "@cas/interchange";
import { APP_NS, decodeState, encodeState, type PlotterState } from "../src/state/viewState.js";

const S: PlotterState = { expr: "sin(z)+c", cx: 0.5, cy: -0.25, span: 3, colormap: 1, modulus: 3 };

describe("share-link view state", () => {
  it("round-trips through encode/decode", () => {
    const hash = encodeState(S);
    expect(hash.startsWith("#vs=")).toBe(true);
    expect(decodeState(hash)).toEqual(S);
  });

  it("rejects a foreign app namespace", () => {
    expect(decodeState(encodeViewState("cd", { expr: "z^2" }))).toBeNull();
  });

  it("returns null for an absent or malformed hash", () => {
    expect(decodeState("")).toBeNull();
    expect(decodeState("#other=1")).toBeNull();
  });

  it("fills defaults for missing numeric fields but keeps expr", () => {
    expect(decodeState(encodeViewState(APP_NS, { expr: "1/z" }))).toEqual({
      expr: "1/z",
      cx: 0,
      cy: 0,
      span: 2,
      colormap: 0,
      modulus: 2,
    });
  });

  it("drops a payload with no expression", () => {
    expect(decodeState(encodeViewState(APP_NS, { cx: 1 }))).toBeNull();
  });
});
