import { describe, it, expect } from "vitest";
import { encodeState, decodeState, type AppState } from "../src/state/appState";

describe("app-state permalink codec", () => {
  it("round-trips a state object", () => {
    const state: AppState = {
      inpf: "z^2+c",
      inpc: "-.7-.4*i",
      inpparamcenter: "-0.75,0",
      inpparamzoom: "0.75",
      mode: "smooth",
      aa: "2",
      light: true,
      perturbation: false,
      "param-a": "1.5",
    };
    expect(decodeState(encodeState(state))).toEqual(state);
  });

  it("handles unicode and expression characters", () => {
    const state: AppState = { inpf: "z²+c — café", inpme: "abs(z)>2" };
    expect(decodeState(encodeState(state))).toEqual(state);
  });

  it("returns null on corrupt or empty input", () => {
    expect(decodeState("")).toBeNull();
    expect(decodeState("@@@not-base64@@@")).toBeNull();
  });

  it("rejects valid base64 of non-object JSON (array / primitive / null)", () => {
    // typeof [] === "object", so an array must be explicitly rejected.
    expect(decodeState(encodeState([1, 2, 3] as unknown as AppState))).toBeNull();
    expect(decodeState(encodeState(42 as unknown as AppState))).toBeNull();
    expect(decodeState(encodeState("hi" as unknown as AppState))).toBeNull();
    expect(decodeState(encodeState(null as unknown as AppState))).toBeNull();
  });
});
