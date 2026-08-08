import { describe, it, expect } from "vitest";
import {
  encodeSigmaState,
  parseSigmaState,
  schwarzStampParams,
  SIGMA_TONE_DEFAULTS,
  type SigmaViewState,
} from "../src/state/schwarzState";
import { SCHWARZ_ZOOM_MIN, SCHWARZ_ZOOM_MAX } from "../src/render/schwarzView";
import { DEFAULT_SCHWARZ_COLORMAP, DEFAULT_SCHWARZ_SCALE } from "../src/render/schwarzColormaps";

// σ-view serialization (ADR-0009 item 2 + S5-A3 tone): the `_sigma` codec that layers the σ view onto a
// permalink / saved view / PNG. encode→parse must round-trip; parse is hostile-link hard (a corrupt or
// dangerous payload → null, never a NaN engine input; a bad cosmetic tone → its identity default).

const DELTOID: SigmaViewState = {
  phi: { c: 1, F: [[0, 0], [0, 0], [0.5, 0]], branches: [] },
  center: [0, 0],
  zoom: 0.4,
  colormap: "viridis",
  scale: "linear",
  ...SIGMA_TONE_DEFAULTS,
};
const POLE: SigmaViewState = {
  phi: { c: 1, F: [], branches: [{ z: [0.2, -0.1], A: [[0.3, 0], [0.05, 0.1]] }] },
  center: [0.6, -0.3],
  zoom: 12.5,
  colormap: "turbo",
  scale: "sqrt",
  rotation: 0.25,
  gamma: 1.8,
  vignette: 0.4,
};

describe("encodeSigmaState / parseSigmaState round-trip", () => {
  it("round-trips a pole-free deltoid state", () => {
    expect(parseSigmaState(encodeSigmaState(DELTOID))).toEqual(DELTOID);
  });

  it("round-trips a pole-bearing state (branches, non-default view + coloring)", () => {
    expect(parseSigmaState(encodeSigmaState(POLE))).toEqual(POLE);
  });
});

describe("parseSigmaState — hostile-link hardening", () => {
  const enc = (o: unknown): string => JSON.stringify(o);
  const base = { c: 1, F: [[0, 0], [0, 0], [0.5, 0]], b: [], ctr: [0, 0], z: 0.4, cm: "viridis", sc: "linear" };

  it("rejects non-JSON / non-object", () => {
    expect(parseSigmaState("not json")).toBeNull();
    expect(parseSigmaState("42")).toBeNull();
    expect(parseSigmaState("null")).toBeNull();
  });

  it("rejects a zero or non-finite leading coefficient", () => {
    expect(parseSigmaState(enc({ ...base, c: 0 }))).toBeNull();
    expect(parseSigmaState(enc({ ...base, c: "x" }))).toBeNull();
    expect(parseSigmaState(enc({ ...base, c: null }))).toBeNull();
  });

  it("rejects a non-finite coefficient anywhere in F", () => {
    expect(parseSigmaState(enc({ ...base, F: [[0, 0], [Number.POSITIVE_INFINITY, 0]] }))).toBeNull();
    expect(parseSigmaState(enc({ ...base, F: [[0]] }))).toBeNull(); // wrong tuple shape
  });

  it("enforces the engine's |z_j| < 1 pole invariant and a non-empty A", () => {
    expect(parseSigmaState(enc({ ...base, b: [{ z: [1, 0], A: [[0.3, 0]] }] }))).toBeNull(); // |z| = 1
    expect(parseSigmaState(enc({ ...base, b: [{ z: [0.9, 0.9], A: [[0.3, 0]] }] }))).toBeNull(); // |z| > 1
    expect(parseSigmaState(enc({ ...base, b: [{ z: [0.2, 0], A: [] }] }))).toBeNull(); // empty A
  });

  it("rejects a missing/invalid centre or non-finite zoom", () => {
    expect(parseSigmaState(enc({ ...base, ctr: [0] }))).toBeNull();
    expect(parseSigmaState(enc({ ...base, z: "big" }))).toBeNull();
    expect(parseSigmaState(enc({ ...base, z: Number.NaN }))).toBeNull();
  });

  it("caps oversized coefficient lists (no giant engine input from a hostile link)", () => {
    const huge = Array.from({ length: 65 }, () => [0, 0]);
    expect(parseSigmaState(enc({ ...base, F: huge }))).toBeNull();
    expect(parseSigmaState(enc({ ...base, b: Array.from({ length: 65 }, () => ({ z: [0.1, 0], A: [[1, 0]] })) }))).toBeNull();
  });

  it("clamps zoom into [MIN, MAX]", () => {
    expect(parseSigmaState(enc({ ...base, z: 0 }))?.zoom).toBe(SCHWARZ_ZOOM_MIN);
    expect(parseSigmaState(enc({ ...base, z: 1e12 }))?.zoom).toBe(SCHWARZ_ZOOM_MAX);
  });

  it("normalises an unknown colormap / scale to the defaults (a stale name never blanks the picker)", () => {
    const s = parseSigmaState(enc({ ...base, cm: "no-such-map", sc: "no-such-scale" }));
    expect(s?.colormap).toBe(DEFAULT_SCHWARZ_COLORMAP);
    expect(s?.scale).toBe(DEFAULT_SCHWARZ_SCALE);
  });

  it("treats absent branches as no poles (not an error)", () => {
    const s = parseSigmaState(enc({ c: 1, F: [[0, 0], [0, 0], [0.5, 0]], ctr: [0, 0], z: 0.4 }));
    expect(s?.phi.branches).toEqual([]);
  });
});

describe("parseSigmaState — image-space tone (S5-A3)", () => {
  const enc = (o: unknown): string => JSON.stringify(o);
  const base = { c: 1, F: [[0, 0], [0, 0], [0.5, 0]], b: [], ctr: [0, 0], z: 0.4, cm: "viridis", sc: "linear" };

  it("defaults the tone when the keys are absent (old links pre-A3)", () => {
    const s = parseSigmaState(enc(base));
    expect(s?.rotation).toBe(SIGMA_TONE_DEFAULTS.rotation);
    expect(s?.gamma).toBe(SIGMA_TONE_DEFAULTS.gamma);
    expect(s?.vignette).toBe(SIGMA_TONE_DEFAULTS.vignette);
  });

  it("round-trips non-default tone and omits identity-default keys from the encoding", () => {
    // A plain view encodes without any tone keys (link stays as small as pre-A3).
    const plain = encodeSigmaState({ ...DELTOID });
    expect(plain).not.toMatch(/"(rot|gam|vig)"/);
    // A toned view carries them back.
    const s = parseSigmaState(encodeSigmaState({ ...DELTOID, rotation: 0.3, gamma: 1.5, vignette: 0.2 }));
    expect(s?.rotation).toBeCloseTo(0.3, 6);
    expect(s?.gamma).toBeCloseTo(1.5, 6);
    expect(s?.vignette).toBeCloseTo(0.2, 6);
  });

  it("clamps out-of-range tone into its band (rotation 0..1, gamma 0.2..5, vignette 0..1)", () => {
    expect(parseSigmaState(enc({ ...base, rot: 9 }))?.rotation).toBe(1);
    expect(parseSigmaState(enc({ ...base, rot: -3 }))?.rotation).toBe(0);
    expect(parseSigmaState(enc({ ...base, gam: 99 }))?.gamma).toBe(5);
    expect(parseSigmaState(enc({ ...base, gam: 0.01 }))?.gamma).toBe(0.2);
    expect(parseSigmaState(enc({ ...base, vig: 5 }))?.vignette).toBe(1);
  });

  it("defaults a non-finite tone value rather than rejecting the whole (valid) view", () => {
    const s = parseSigmaState(enc({ ...base, gam: "bright", vig: null }));
    expect(s).not.toBeNull(); // cosmetic ⇒ never fatal
    expect(s?.gamma).toBe(SIGMA_TONE_DEFAULTS.gamma);
    expect(s?.vignette).toBe(SIGMA_TONE_DEFAULTS.vignette);
  });
});

describe("schwarzStampParams (PNG metadata summary)", () => {
  it("summarises the σ view in one ASCII-safe line (no σ / ≈ / Unicode minus)", () => {
    const s = schwarzStampParams(DELTOID);
    expect(s).toContain("plane=Schwarz reflection sigma (approx)");
    expect(s).toContain("c=1");
    expect(s).toContain("poles=0");
    expect(s).toContain("center=0+0i");
    expect(s).toContain("colormap=viridis");
    expect(s).toContain("scale=linear");
    expect(s).toContain("rotation=0");
    expect(s).toContain("gamma=1");
    expect(s).toContain("vignette=0");
    expect(s).not.toMatch(/[σ≈−]/); // PNG tEXt is Latin-1
  });

  it("reports the pole count and non-default coloring + tone", () => {
    const s = schwarzStampParams(POLE);
    expect(s).toContain("poles=1");
    expect(s).toContain("colormap=turbo");
    expect(s).toContain("scale=sqrt");
    expect(s).toContain("center=0.6-0.3i");
    expect(s).toContain("rotation=0.25");
    expect(s).toContain("gamma=1.8");
    expect(s).toContain("vignette=0.4");
  });
});
