import { describe, expect, it } from "vitest";
import { makeBoundedSchwarz, makeUnboundedLaurentSchwarz } from "@cas/schwarz";
import {
  pixelToPlot,
  renderSchwarzField,
  SCHWARZ_OFF_DISK_RGB,
  schwarzBoundaryPoly,
  schwarzEscapeAt,
  uvToPlotFrac,
  panSchwarzView,
  zoomSchwarzView,
  parseSchwarzViewInput,
  formatSchwarzViewFields,
  SCHWARZ_ZOOM_MIN,
  SCHWARZ_ZOOM_MAX,
  type SchwarzView,
} from "../src/render/schwarzView";

// The deltoid σ engine — ground truth φ(z) = z + 1/(2z²) (c = 1, F = [0,0,½]); Ω is the exterior of K.
const engine = makeUnboundedLaurentSchwarz(1, [
  [0, 0],
  [0, 0],
  [0.5, 0],
]);
const poly = schwarzBoundaryPoly(engine);

describe("Schwarz σ CPU render (S4a-2)", () => {
  it("classifies the origin (∈ K, not in Ω) as fundamental n=0 and a far point as escaped", () => {
    const atOrigin = schwarzEscapeAt(engine, poly, [0, 0]);
    expect(atOrigin.kind).toBe("fundamental");
    expect(atOrigin.n).toBe(0);
    expect(schwarzEscapeAt(engine, poly, [100, 0], { escapeR: 50 }).kind).toBe("escaped");
  });

  it("pixelToPlot matches the view window (center at mid-pixel, half-width 1/zoom)", () => {
    const view = { center: [0, 0] as [number, number], zoom: 0.4 }; // [-2.5, 2.5]²
    const mid = pixelToPlot(50, 50, 100, view);
    expect(mid[0]).toBeCloseTo(0, 1);
    expect(mid[1]).toBeCloseTo(0, 1);
    expect(pixelToPlot(0, 50, 100, view)[0]).toBeCloseTo(-2.5, 1); // left edge
    expect(pixelToPlot(99, 50, 100, view)[0]).toBeCloseTo(2.5, 1); // right edge
  });

  it("renderSchwarzField fills an opaque RGBA buffer with dynamical structure", () => {
    const view = { center: [0, 0] as [number, number], zoom: 0.4 };
    const size = 24;
    const buf = renderSchwarzField(engine, poly, view, size, { maxIter: 48, escapeR: 1e4 });
    expect(buf.length).toBe(size * size * 4);
    for (let i = 3; i < buf.length; i += 4) expect(buf[i]).toBe(255); // fully opaque
    const colors = new Set<string>();
    for (let i = 0; i < buf.length; i += 4) colors.add(`${buf[i]},${buf[i + 1]},${buf[i + 2]}`);
    expect(colors.size).toBeGreaterThan(1); // K vs Ω regions ⇒ not a flat fill
    expect(colors.has("30,60,140")).toBe(true); // the K interior (fundamental n=0) deep-blue base
  });

  it("renderSchwarzField z-disk (F2b): off-disk centre, structured, differs from the plane view", () => {
    const view = { center: [0, 0] as [number, number], zoom: 0.5 }; // shows |z| ≤ 2, incl the unit disk
    const size = 32;
    const zbuf = renderSchwarzField(engine, poly, view, size, { maxIter: 48, escapeR: 1e4, viewMode: "z" });
    const plane = renderSchwarzField(engine, poly, view, size, { maxIter: 48, escapeR: 1e4 });
    // The centre pixel maps to z ≈ 0 (|z| < 1) ⇒ off the uniformizing domain (unbounded φ lives on 𝔻*).
    const mid = ((size / 2) * size + size / 2) * 4;
    expect([zbuf[mid], zbuf[mid + 1], zbuf[mid + 2]]).toEqual([...SCHWARZ_OFF_DISK_RGB]);
    // Both regions present (off-disk background + the in-disk φ field), and it differs from the plane view.
    const colors = new Set<string>();
    for (let i = 0; i < zbuf.length; i += 4) colors.add(`${zbuf[i]},${zbuf[i + 1]},${zbuf[i + 2]}`);
    expect(colors.size).toBeGreaterThan(1);
    let diff = 0;
    for (let i = 0; i < zbuf.length; i += 4)
      if (zbuf[i] !== plane[i] || zbuf[i + 1] !== plane[i + 1] || zbuf[i + 2] !== plane[i + 2]) diff++;
    expect(diff).toBeGreaterThan(size);
  });
});

// S5-C2d: a BOUNDED QD uniformizes 𝔻 → Ω, so Ω is the INTERIOR of ∂Ω — the CPU field/orbit tracer must
// flip their in-Ω test (boundedOmega). Disk ground truth: w₀=0, one branch z_j=0 A=[1] ⇒ φ(z)=z, so ∂Ω is
// the unit circle and Ω is the open unit disk; σ(w)=1/conj(w) maps the interior to the exterior.
describe("Schwarz σ CPU render — bounded interior-Ω orientation (S5-C2d)", () => {
  const disk = makeBoundedSchwarz([0, 0], [{ z: [0, 0], A: [[1, 0]] }]);
  const diskPoly = schwarzBoundaryPoly(disk); // φ(unit circle) = the unit circle

  it("boundedOmega flips which side of ∂Ω is Ω (interior) vs K (exterior)", () => {
    const inside: [number, number] = [0.3, 0]; // ∈ 𝔻 = Ω for a bounded QD
    // Bounded orientation: the interior point is IN Ω, so its σ-orbit is iterated (leaves after ≥1 step —
    // σ(0.3)=1/0.3 exits 𝔻 → fundamental n=1), NOT the n=0 of a K point.
    expect(schwarzEscapeAt(disk, diskPoly, inside, { boundedOmega: true }).n).toBeGreaterThanOrEqual(1);
    // Flip the flag off (the default exterior orientation) and the SAME interior point now reads as K ⇒
    // fundamental n=0, never iterated — proof the flag is load-bearing, not cosmetic.
    expect(schwarzEscapeAt(disk, diskPoly, inside, { boundedOmega: false })).toMatchObject({
      kind: "fundamental",
      n: 0,
    });
    // And an EXTERIOR point is K under the bounded orientation — outside the bounded Ω, fundamental at n=0.
    expect(schwarzEscapeAt(disk, diskPoly, [2, 0], { boundedOmega: true })).toMatchObject({
      kind: "fundamental",
      n: 0,
    });
  });

  it("renderSchwarzField respects boundedOmega — the interior-Ω field differs from the exterior one", () => {
    const view = { center: [0, 0] as [number, number], zoom: 0.4 };
    const size = 24;
    const bounded = renderSchwarzField(disk, diskPoly, view, size, { maxIter: 48, escapeR: 1e4, boundedOmega: true });
    const exterior = renderSchwarzField(disk, diskPoly, view, size, { maxIter: 48, escapeR: 1e4, boundedOmega: false });
    let differ = 0;
    for (let i = 0; i < bounded.length; i++) if (bounded[i] !== exterior[i]) differ++;
    expect(differ).toBeGreaterThan(0); // the orientation genuinely repaints the K/Ω split
  });
});

// Phase 2: the CPU render path is generic over the engine, so a POLE-BEARING engine (finite-pole
// branches) feeds the SAME schwarzBoundaryPoly (φ of the unit circle, now branch-aware) and
// renderSchwarzField (escape under the branch-aware σ) with no special-casing. Smoke test that a
// single-exterior-pole engine yields a finite boundary + a structured, opaque field, so a pole-bearing σ
// hand-off paints in CD exactly like the deltoid.
// Precise navigation (ADR-0009 item 3): the parse/format pair the σ pane's centre/zoom fields use.
describe("parseSchwarzViewInput / formatSchwarzViewFields", () => {
  const FALLBACK: SchwarzView = { center: [0, 0], zoom: 0.4 };

  it("parses well-formed fields into a view", () => {
    expect(parseSchwarzViewInput("1.5", "-2", "3", FALLBACK)).toEqual({ center: [1.5, -2], zoom: 3 });
  });

  it("keeps the fallback component for an unparseable field (never NaN)", () => {
    const v = parseSchwarzViewInput("abc", "", "xyz", { center: [7, 8], zoom: 0.9 });
    expect(v).toEqual({ center: [7, 8], zoom: 0.9 });
  });

  it("clamps zoom to [SCHWARZ_ZOOM_MIN, SCHWARZ_ZOOM_MAX]", () => {
    expect(parseSchwarzViewInput("0", "0", "0", FALLBACK).zoom).toBe(SCHWARZ_ZOOM_MIN); // 0 → min
    expect(parseSchwarzViewInput("0", "0", "1e12", FALLBACK).zoom).toBe(SCHWARZ_ZOOM_MAX); // huge → max
    expect(parseSchwarzViewInput("0", "0", "-5", FALLBACK).zoom).toBe(SCHWARZ_ZOOM_MIN); // negative → min
  });

  it("round-trips a view through format → parse (to display precision)", () => {
    const view: SchwarzView = { center: [-0.734921, 1.208143], zoom: 12.5 };
    const f = formatSchwarzViewFields(view);
    const back = parseSchwarzViewInput(f.re, f.im, f.zoom, FALLBACK);
    expect(back.center[0]).toBeCloseTo(view.center[0], 4);
    expect(back.center[1]).toBeCloseTo(view.center[1], 4);
    expect(back.zoom).toBeCloseTo(view.zoom, 4);
  });

  it("formats to compact 6-significant-figure strings (no float noise)", () => {
    const f = formatSchwarzViewFields({ center: [0.1 + 0.2, 0], zoom: 0.4 });
    expect(f.re).toBe("0.3"); // 0.30000000000000004 → "0.3"
    expect(f.im).toBe("0");
    expect(f.zoom).toBe("0.4");
  });
});

describe("Schwarz σ CPU render — pole-bearing engine (Phase 2)", () => {
  const poleEngine = makeUnboundedLaurentSchwarz(1, [], [{ z: [0.2, 0], A: [[0.3, 0]] }]);
  const polePoly = schwarzBoundaryPoly(poleEngine);

  it("builds a finite, non-degenerate boundary polygon from the branch-bearing φ", () => {
    expect(polePoly.length).toBeGreaterThan(2);
    for (const p of polePoly) expect(Number.isFinite(p[0]) && Number.isFinite(p[1])).toBe(true);
    const xs = polePoly.map((p) => p[0]);
    const ys = polePoly.map((p) => p[1]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.1); // spans area, not collapsed to a point
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.1);
  });

  it("renders an opaque field with dynamical structure (K vs Ω)", () => {
    const view = { center: [0, 0] as [number, number], zoom: 0.3 };
    const size = 24;
    const buf = renderSchwarzField(poleEngine, polePoly, view, size, { maxIter: 48, escapeR: 1e4 });
    expect(buf.length).toBe(size * size * 4);
    for (let i = 3; i < buf.length; i += 4) expect(buf[i]).toBe(255); // opaque
    const colors = new Set<string>();
    for (let i = 0; i < buf.length; i += 4) colors.add(`${buf[i]},${buf[i + 1]},${buf[i + 2]}`);
    expect(colors.size).toBeGreaterThan(1); // structure, not a flat fill
  });
});

// Interactive pan/zoom view math (S4b-iii): the pure core of the σ view's drag-pan and wheel-zoom.
describe("Schwarz σ interactive view math", () => {
  const view = { center: [0, 0] as [number, number], zoom: 0.4 }; // [-2.5, 2.5]²

  it("uvToPlotFrac spans the window with +Im up (top-left = −2.5+2.5i, bottom-right = 2.5−2.5i)", () => {
    expect(uvToPlotFrac(view, 0.5, 0.5)).toEqual([0, 0]); // center
    const tl = uvToPlotFrac(view, 0, 0);
    expect(tl[0]).toBeCloseTo(-2.5, 9);
    expect(tl[1]).toBeCloseTo(2.5, 9); // top ⇒ +Im
    const br = uvToPlotFrac(view, 1, 1);
    expect(br[0]).toBeCloseTo(2.5, 9);
    expect(br[1]).toBeCloseTo(-2.5, 9);
  });

  it("zoom about the center only scales zoom; the center is unmoved", () => {
    const z = zoomSchwarzView(view, 2, [0.5, 0.5]);
    expect(z.zoom).toBeCloseTo(0.8, 9);
    expect(z.center[0]).toBeCloseTo(0, 9);
    expect(z.center[1]).toBeCloseTo(0, 9);
  });

  it("zoom about a corner keeps that corner's plot point pinned under the cursor", () => {
    const anchorUv: [number, number] = [0, 0]; // top-left
    const before = uvToPlotFrac(view, ...anchorUv);
    const z = zoomSchwarzView(view, 2, anchorUv);
    const after = uvToPlotFrac(z, ...anchorUv);
    expect(after[0]).toBeCloseTo(before[0], 9);
    expect(after[1]).toBeCloseTo(before[1], 9);
    expect(z.zoom).toBeCloseTo(0.8, 9); // still zoomed in
  });

  it("pan makes the plot point grabbed at fromUv follow to toUv (zoom unchanged)", () => {
    const from: [number, number] = [0.5, 0.5];
    const to: [number, number] = [0.6, 0.5];
    const grabbed = uvToPlotFrac(view, ...from);
    const p = panSchwarzView(view, from, to);
    expect(p.zoom).toBe(view.zoom);
    const nowUnderTo = uvToPlotFrac(p, ...to);
    expect(nowUnderTo[0]).toBeCloseTo(grabbed[0], 9);
    expect(nowUnderTo[1]).toBeCloseTo(grabbed[1], 9);
  });
});
