import { describe, it, expect } from "vitest";
import {
  encodeSigmaState,
  parseSigmaState,
  schwarzStampParams,
  SIGMA_TONE_DEFAULTS,
  SIGMA_RENDER_DEFAULTS,
  SIGMA_LIGHT_DEFAULTS,
  SIGMA_OVERLAY_DEFAULTS,
  SIGMA_VIEW_DEFAULTS,
  SIGMA_TILING_DEFAULTS,
  type SigmaViewState,
} from "../src/state/schwarzState";
import { SCHWARZ_ZOOM_MIN, SCHWARZ_ZOOM_MAX } from "../src/render/schwarzView";
import { DEFAULT_SCHWARZ_COLORMAP, DEFAULT_SCHWARZ_SCALE } from "../src/render/schwarzColormaps";

// σ-view serialization (ADR-0009 item 2 + S5-A3 tone): the `_sigma` codec that layers the σ view onto a
// permalink / saved view / PNG. encode→parse must round-trip; parse is hostile-link hard (a corrupt or
// dangerous payload → null, never a NaN engine input; a bad cosmetic tone → its identity default).

const DELTOID: SigmaViewState = {
  phi: { c: [1, 0], F: [[0, 0], [0, 0], [0.5, 0]], branches: [] },
  center: [0, 0],
  zoom: 0.4,
  colormap: "viridis",
  scale: "linear",
  colorMode: "escape",
  trapShape: "cross",
  ...SIGMA_TONE_DEFAULTS,
  ...SIGMA_RENDER_DEFAULTS,
  ...SIGMA_LIGHT_DEFAULTS,
  ...SIGMA_OVERLAY_DEFAULTS,
  ...SIGMA_VIEW_DEFAULTS,
  ...SIGMA_TILING_DEFAULTS,
};
const POLE: SigmaViewState = {
  phi: { c: [1, 0], F: [], branches: [{ z: [0.2, -0.1], A: [[0.3, 0], [0.05, 0.1]] }] },
  center: [0.6, -0.3],
  zoom: 12.5,
  colormap: "turbo",
  scale: "sqrt",
  colorMode: "trap",
  trapShape: "circle",
  rotation: 0.25,
  gamma: 1.8,
  vignette: 0.4,
  aa: 2, // non-default render knobs, to prove they round-trip (B2)
  maxIter: 128,
  escapeR: 1000,
  light: true, // non-default relief lighting, to prove it round-trips (C2)
  lightAz: 200,
  lightEl: 30,
  lightHeight: 3.5,
  showBoundary: true, // non-default F1 ∂Ω overlay, to prove it round-trips
  viewMode: "z", // non-default F2b z-disk view, to prove it round-trips
  tilingDepth: 6, // non-default F3c tiling params, to prove they round-trip
  tilingBudget: 1024,
};

describe("encodeSigmaState / parseSigmaState round-trip", () => {
  it("round-trips a pole-free deltoid state", () => {
    expect(parseSigmaState(encodeSigmaState(DELTOID))).toEqual(DELTOID);
  });

  it("round-trips a pole-bearing state (branches, non-default view + coloring)", () => {
    expect(parseSigmaState(encodeSigmaState(POLE))).toEqual(POLE);
  });

  it("carries the F3c tiling params only when non-default (byte-identical to pre-F3c at the defaults)", () => {
    // POLE has non-default tiling (depth 6, budget 1024) → both keys present + they round-trip.
    expect(encodeSigmaState(POLE)).toContain('"td":6');
    expect(encodeSigmaState(POLE)).toContain('"tb":1024');
    // DELTOID holds the defaults (depth 4, budget 4096) → neither key is emitted.
    expect(encodeSigmaState(DELTOID)).not.toContain('"td"');
    expect(encodeSigmaState(DELTOID)).not.toContain('"tb"');
    // A pre-F3c link (no td/tb) restores the defaults.
    const restored = parseSigmaState(encodeSigmaState(DELTOID));
    expect(restored?.tilingDepth).toBe(SIGMA_TILING_DEFAULTS.tilingDepth);
    expect(restored?.tilingBudget).toBe(SIGMA_TILING_DEFAULTS.tilingBudget);
  });

  it("round-trips a complex leading coefficient c (S5-C1)", () => {
    const CPLX: SigmaViewState = { ...DELTOID, phi: { ...DELTOID.phi, c: [1, 0.5] } };
    expect(parseSigmaState(encodeSigmaState(CPLX))).toEqual(CPLX);
    // A real c still serializes as a bare number (compact, unchanged from pre-C1 links).
    expect(encodeSigmaState(DELTOID)).toMatch(/"c":1(,|})/);
    expect(encodeSigmaState(CPLX)).toContain('"c":[1,0.5]');
  });

  // S5-C2d: a bounded σ view carries family:"bounded" + centre w₀ so an imported bounded reflection can be
  // permalinked / saved / stamped and restored on the interior branch (single-lobe fixture: w₀=0, z_j=0.3).
  const BOUNDED: SigmaViewState = {
    phi: { family: "bounded", c: [0, 0], F: [], w0: [0, 0], branches: [{ z: [0.3, 0], A: [[0.5, 0]] }] },
    center: [0, 0],
    zoom: 1.5,
    colormap: "magma",
    scale: "log",
    colorMode: "escape",
    trapShape: "cross",
    ...SIGMA_TONE_DEFAULTS,
    ...SIGMA_RENDER_DEFAULTS,
    ...SIGMA_LIGHT_DEFAULTS,
    ...SIGMA_OVERLAY_DEFAULTS,
    ...SIGMA_VIEW_DEFAULTS,
    ...SIGMA_TILING_DEFAULTS,
  };

  it("round-trips a bounded state (family + w₀) — S5-C2d", () => {
    expect(parseSigmaState(encodeSigmaState(BOUNDED))).toEqual(BOUNDED);
    // The bounded link carries fam + w0; an unbounded link carries neither (byte-identical to pre-C2).
    expect(encodeSigmaState(BOUNDED)).toContain('"fam":"bounded"');
    expect(encodeSigmaState(BOUNDED)).toContain('"w0":[0,0]');
    expect(encodeSigmaState(DELTOID)).not.toContain('"fam"');
  });

  it("a bounded state does NOT require a non-zero c (its c is the unused [0,0] slot) — S5-C2d", () => {
    // The unbounded guard 'c must be non-zero' would reject c=[0,0]; the bounded branch must skip it.
    const restored = parseSigmaState(encodeSigmaState(BOUNDED));
    expect(restored?.phi.family).toBe("bounded");
    expect(restored?.phi.w0).toEqual([0, 0]);
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
    expect(parseSigmaState(enc({ ...base, c: [0, 0] }))).toBeNull(); // complex zero (S5-C1) also rejected
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

  it("clamps the F3c tiling params to sane integer bounds (never a runaway tree from a hostile link)", () => {
    expect(parseSigmaState(enc({ ...base, td: 999, tb: 1e9 }))?.tilingDepth).toBe(8); // depth capped at 8
    expect(parseSigmaState(enc({ ...base, td: 999, tb: 1e9 }))?.tilingBudget).toBe(65536); // budget capped
    expect(parseSigmaState(enc({ ...base, td: -5 }))?.tilingDepth).toBe(0); // depth floored at 0
    expect(parseSigmaState(enc({ ...base, td: 3.7 }))?.tilingDepth).toBe(4); // rounded to an integer
    expect(parseSigmaState(enc({ ...base, td: "x", tb: null }))?.tilingDepth).toBe(SIGMA_TILING_DEFAULTS.tilingDepth); // bad ⇒ default
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

describe("parseSigmaState — field color mode (S5-B1)", () => {
  const enc = (o: unknown): string => JSON.stringify(o);
  const base = { c: 1, F: [[0, 0], [0, 0], [0.5, 0]], b: [], ctr: [0, 0], z: 0.4, cm: "viridis", sc: "linear" };

  it("defaults to escape-time / cross when the keys are absent (old links pre-B1)", () => {
    const s = parseSigmaState(enc(base));
    expect(s?.colorMode).toBe("escape");
    expect(s?.trapShape).toBe("cross");
  });

  it("round-trips a non-default mode + trap shape and omits the default keys from the encoding", () => {
    const plain = encodeSigmaState({ ...DELTOID }); // escape + cross ⇒ no md/tp keys (link unchanged from pre-B1)
    expect(plain).not.toMatch(/"(md|tp)"/);
    const s = parseSigmaState(encodeSigmaState({ ...DELTOID, colorMode: "trap", trapShape: "lattice" }));
    expect(s?.colorMode).toBe("trap");
    expect(s?.trapShape).toBe("lattice");
  });

  it("normalises an unknown mode / trap shape to the defaults (a stale name never blanks the picker)", () => {
    const s = parseSigmaState(enc({ ...base, md: "no-such-mode", tp: "no-such-shape" }));
    expect(s?.colorMode).toBe("escape");
    expect(s?.trapShape).toBe("cross");
  });

  it("round-trips the derivative modes (smooth / distance, S5-B2)", () => {
    for (const md of ["smooth", "distance"]) {
      const s = parseSigmaState(encodeSigmaState({ ...DELTOID, colorMode: md }));
      expect(s?.colorMode).toBe(md);
    }
  });
});

describe("parseSigmaState — render knobs (B2)", () => {
  const enc = (o: unknown): string => JSON.stringify(o);
  const base = { c: 1, F: [[0, 0], [0, 0], [0.5, 0]], b: [], ctr: [0, 0], z: 0.4, cm: "viridis", sc: "linear" };

  it("defaults aa / maxIter / escapeR when absent (old links pre-B2)", () => {
    const s = parseSigmaState(enc(base));
    expect(s?.aa).toBe(SIGMA_RENDER_DEFAULTS.aa);
    expect(s?.maxIter).toBe(SIGMA_RENDER_DEFAULTS.maxIter);
    expect(s?.escapeR).toBe(SIGMA_RENDER_DEFAULTS.escapeR);
  });

  it("round-trips non-default render knobs and omits identity-default keys from the encoding", () => {
    // A default-quality view encodes without any render keys (link stays as small as pre-B2).
    const plain = encodeSigmaState({ ...DELTOID });
    expect(plain).not.toMatch(/"(aa|it|er)"/);
    const s = parseSigmaState(encodeSigmaState({ ...DELTOID, aa: 3, maxIter: 200, escapeR: 500 }));
    expect(s?.aa).toBe(3);
    expect(s?.maxIter).toBe(200);
    expect(s?.escapeR).toBe(500);
  });

  it("clamps out-of-range render knobs (aa 1..4, maxIter 1..4096) and defaults a bad value", () => {
    expect(parseSigmaState(enc({ ...base, aa: 9 }))?.aa).toBe(4);
    expect(parseSigmaState(enc({ ...base, aa: 0 }))?.aa).toBe(1);
    expect(parseSigmaState(enc({ ...base, it: 99999 }))?.maxIter).toBe(4096);
    expect(parseSigmaState(enc({ ...base, it: 0 }))?.maxIter).toBe(1);
    expect(parseSigmaState(enc({ ...base, aa: "x", it: null }))?.aa).toBe(SIGMA_RENDER_DEFAULTS.aa);
  });
});

describe("parseSigmaState — ∂Ω boundary overlay (F1)", () => {
  const enc = (o: unknown): string => JSON.stringify(o);
  const base = { c: 1, F: [[0, 0], [0, 0], [0.5, 0]], b: [], ctr: [0, 0], z: 0.4, cm: "viridis", sc: "linear" };

  it("defaults the boundary off when the key is absent (old links pre-F1)", () => {
    expect(parseSigmaState(enc(base))?.showBoundary).toBe(SIGMA_OVERLAY_DEFAULTS.showBoundary);
  });

  it("round-trips the boundary toggle and omits it at the default (link unchanged from pre-F1)", () => {
    expect(encodeSigmaState({ ...DELTOID })).not.toMatch(/"bd"/);
    expect(parseSigmaState(encodeSigmaState({ ...DELTOID, showBoundary: true }))?.showBoundary).toBe(true);
    expect(encodeSigmaState({ ...DELTOID, showBoundary: true })).toContain('"bd":true');
  });

  it("defaults a non-boolean boundary value rather than rejecting the (valid) view", () => {
    const s = parseSigmaState(enc({ ...base, bd: "yes" }));
    expect(s).not.toBeNull(); // a display toggle ⇒ never fatal
    expect(s?.showBoundary).toBe(false);
  });
});

describe("parseSigmaState — coordinate view (F2b + F2d)", () => {
  const enc = (o: unknown): string => JSON.stringify(o);
  const base = { c: 1, F: [[0, 0], [0, 0], [0.5, 0]], b: [], ctr: [0, 0], z: 0.4, cm: "viridis", sc: "linear" };

  it("defaults to the w-plane when the key is absent (old links pre-F2b)", () => {
    expect(parseSigmaState(enc(base))?.viewMode).toBe("plane");
  });

  it("round-trips the z-disk view and omits the key on the plane (link unchanged from pre-F2b)", () => {
    expect(encodeSigmaState({ ...DELTOID })).not.toMatch(/"vm"/);
    expect(parseSigmaState(encodeSigmaState({ ...DELTOID, viewMode: "z" }))?.viewMode).toBe("z");
    expect(encodeSigmaState({ ...DELTOID, viewMode: "z" })).toContain('"vm":"z"');
  });

  it("falls back to the plane for a corrupt view value", () => {
    expect(parseSigmaState(enc({ ...base, vm: 3 }))?.viewMode).toBe("plane");
    expect(parseSigmaState(enc({ ...base, vm: "bogus" }))?.viewMode).toBe("plane");
  });

  it("round-trips the sphere view + its camera (F2d-ii), and never emits the camera off the sphere", () => {
    const q: [number, number, number, number] = [0.1, 0.2, 0.3, 0.927361]; // ~unit quaternion
    const encSphere = encodeSigmaState({ ...DELTOID, viewMode: "sphere", sphereRot: q, sphereZoom: 2.5 });
    expect(encSphere).toContain('"vm":"sphere"');
    expect(encSphere).toContain('"sq"');
    expect(encSphere).toContain('"sz":2.5');
    const back = parseSigmaState(encSphere);
    expect(back?.viewMode).toBe("sphere");
    expect(back?.sphereRot).toEqual(q);
    expect(back?.sphereZoom).toBe(2.5);
    // The camera keys never leak onto a plane / z link.
    expect(encodeSigmaState({ ...DELTOID, viewMode: "z" })).not.toMatch(/"s[qz]"/);
  });

  it("a sphere link with a corrupt/absent camera parses with no rotation + default zoom", () => {
    const back = parseSigmaState(enc({ ...base, vm: "sphere", sq: [1, 2, 3], sz: "x" }));
    expect(back?.viewMode).toBe("sphere");
    expect(back?.sphereRot).toBeUndefined(); // a 3-element array is rejected
    expect(back?.sphereZoom).toBe(1); // a non-finite zoom falls back to the default
  });
});

describe("parseSigmaState — custom gradient (C1)", () => {
  const CUSTOM: SigmaViewState = {
    ...DELTOID,
    colormap: "custom",
    customStops: [
      { t: 0, color: [10, 20, 30] },
      { t: 0.5, color: [200, 100, 50] },
      { t: 1, color: [255, 255, 0] },
    ],
  };

  it("round-trips the custom stops when the palette is custom", () => {
    expect(parseSigmaState(encodeSigmaState(CUSTOM))).toEqual(CUSTOM);
    expect(encodeSigmaState(CUSTOM)).toContain('"grad"');
  });

  it("omits the gradient for a named palette (link unchanged from pre-C1)", () => {
    expect(encodeSigmaState(DELTOID)).not.toContain('"grad"');
    // Stops present but a NAMED palette selected ⇒ not serialized (they'd be ignored on restore anyway).
    expect(encodeSigmaState({ ...DELTOID, customStops: CUSTOM.customStops })).not.toContain('"grad"');
  });

  it("drops malformed custom stops (hostile link) — no custom stops, not a rejected view", () => {
    const bad = JSON.stringify({ c: 1, F: [[0, 0], [0, 0], [0.5, 0]], ctr: [0, 0], z: 0.4, grad: [{ t: 0 }] });
    const s = parseSigmaState(bad);
    expect(s).not.toBeNull();
    expect(s?.customStops).toBeUndefined();
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
    expect(s).toContain("colormode=escape");
    expect(s).toContain("rotation=0");
    expect(s).toContain("gamma=1");
    expect(s).toContain("vignette=0");
    expect(s).toContain("aa=1");
    expect(s).toContain("iters=48");
    expect(s).toContain("escapeR=10000");
    expect(s).toContain("light=off");
    expect(s).toContain("boundary=off");
    expect(s).toContain("view=plane");
    expect(s).not.toMatch(/[σ≈−]/); // PNG tEXt is Latin-1
  });

  it("reports the pole count and non-default coloring + tone", () => {
    const s = schwarzStampParams(POLE);
    expect(s).toContain("poles=1");
    expect(s).toContain("colormap=turbo");
    expect(s).toContain("scale=sqrt");
    expect(s).toContain("colormode=trap (circle)");
    expect(s).toContain("center=0.6-0.3i");
    expect(s).toContain("rotation=0.25");
    expect(s).toContain("gamma=1.8");
    expect(s).toContain("vignette=0.4");
    expect(s).toContain("aa=2");
    expect(s).toContain("iters=128");
    expect(s).toContain("escapeR=1000");
    expect(s).toContain("light=on(az200,el30,depth3.5)");
    expect(s).toContain("boundary=on");
    expect(s).toContain("view=z-disk");
  });
});
