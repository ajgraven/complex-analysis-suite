import { describe, expect, it } from "vitest";
import { Plot } from "../src/render/plot.js";

// COMMITTED RENDER-CONSISTENCY GOLDENS (Track B). Where shaderCompile.browser.test.ts proves the app's
// shaders BUILD, this proves they RENDER the right thing — a regression guard against a colormap /
// coordinate / colorAt drift that compiles fine but paints wrong. It renders through the real `Plot`
// (real WebGL2) and checks tolerant INVARIANTS rather than brittle committed pixel data, so it is
// stable across SwiftShader versions yet still fails loudly on a genuine render regression:
//   1. non-blank — the portrait has real structure (so 2 & 3 can't be satisfied by a blank canvas);
//   2. the z^2 portrait is invariant under a 180° rotation about the origin, since f(-z) = f(z);
//   3. the top-down orthographic 3D landscape equals the 2D portrait pixel-for-pixel — the Phase-5
//      gate, and the tightest cross-path check (the surface's colorAt ≡ the flat shader's colorAt).
// Verified on-device (SwiftShader) via the built app before committing: the residuals were 0.1 and
// 0.0, far under the tolerances here. Runs only under `pnpm test:browser` (needs a live WebGL2 context).
//
// Rendering uses Plot.renderThumbnail(dim), which sets the drawing-buffer size directly and paints —
// unlike draw(), it does NOT read canvas.clientWidth, so it works on a detached canvas (which has a
// zero client rect). aspect() falls back to 1 there, so the buffer is square.

const DIM = 128;
const N = 48; // downsample resolution — coarse enough to tolerate float32 / SwiftShader jitter

function fingerprint(src: HTMLCanvasElement, n: number): number[] {
  const g = document.createElement("canvas");
  g.width = n;
  g.height = n;
  const ctx = g.getContext("2d");
  if (!ctx) throw new Error("no 2D context to read back the render");
  ctx.drawImage(src, 0, 0, n, n);
  const d = ctx.getImageData(0, 0, n, n).data;
  const out: number[] = [];
  for (let i = 0; i < d.length; i += 4) out.push(d[i], d[i + 1], d[i + 2]);
  return out;
}
const meanAbs = (a: number[], b: number[]): number => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
};
const variance = (a: number[]): number => {
  const m = a.reduce((s, v) => s + v, 0) / a.length;
  return a.reduce((s, v) => s + (v - m) * (v - m), 0) / a.length;
};
/** Rotate an n×n RGB fingerprint 180° about its centre. */
const rot180 = (a: number[], n: number): number[] => {
  const o = new Array<number>(a.length);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const s = (y * n + x) * 3;
      const t = ((n - 1 - y) * n + (n - 1 - x)) * 3;
      o[t] = a[s];
      o[t + 1] = a[s + 1];
      o[t + 2] = a[s + 2];
    }
  return o;
};

/** A Plot centred on the origin (so the domain view is symmetric on both axes), rendered square. */
function render(src: string, mode: "2d" | "3d", topDown = false): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const plot = new Plot(canvas, src);
  plot.view = { cx: 0, cy: 0, span: 2 };
  plot.mode = mode;
  if (topDown) plot.topDown();
  plot.renderThumbnail(DIM); // sets a DIM×DIM square buffer (aspect 1 on a detached canvas) and paints
  return canvas;
}

/** Render a Riemann surface (ADR-0027) through the real Plot at a fixed charisma / sheet count. */
function renderRiemann(src: string, heightSource = 0, sheets?: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const plot = new Plot(canvas, src);
  if (!plot.riemannAvailable()) throw new Error(`not a Riemann form: ${src}`);
  plot.mode = "riemann";
  plot.riemannHeightSource = heightSource;
  if (sheets !== undefined) plot.riemannSheets = sheets;
  plot.reframeRiemann(); // frame the camera for the chosen charisma / sheets
  plot.renderThumbnail(DIM);
  return canvas;
}

/** Render an algebraic-curve Riemann surface (M2a, ADR-0028) through the real Plot. */
function renderCurve(src: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const plot = new Plot(canvas, src);
  if (plot.riemannModeKind() !== "curve") throw new Error(`not an algebraic curve: ${src}`);
  plot.mode = "riemann";
  plot.reframeRiemann(); // build the curve mesh over the default view + frame the camera
  plot.renderThumbnail(DIM);
  return canvas;
}

/** Render an implicit `F(w,z)=0` Riemann surface (M2c, ADR-0030) through the real Plot. */
function renderImplicit(src: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const plot = new Plot(canvas, "z"); // the f(z) box is unused in implicit mode
  plot.setImplicitSource(src);
  if (plot.riemannModeKind() !== "implicit") throw new Error(`not a valid implicit curve: ${src}`);
  plot.mode = "riemann";
  plot.view = { cx: 0, cy: 0, span: 2 };
  plot.reframeRiemann();
  plot.renderThumbnail(DIM);
  return canvas;
}

/** Render the linked Riemann view (M3.2, ADR-0029): the flat base plane beside the surface. */
function renderRiemannLinked(src: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const plot = new Plot(canvas, src);
  if (!plot.riemannAvailable()) throw new Error(`not a Riemann form: ${src}`);
  plot.mode = "riemann";
  plot.riemannLinked = true;
  plot.view = { cx: 0, cy: 0, span: 2 };
  plot.reframeRiemann();
  plot.frameRiemannBaseView();
  plot.renderThumbnail(DIM);
  return canvas;
}

/** The mean colour variance of the LEFT half of a square render (the base-plane pane in the linked view). */
function leftHalfVariance(src: HTMLCanvasElement): number {
  const g = document.createElement("canvas");
  g.width = N;
  g.height = N;
  const ctx = g.getContext("2d");
  if (!ctx) throw new Error("no 2D context to read back the render");
  ctx.drawImage(src, 0, 0, N, N);
  const d = ctx.getImageData(0, 0, N, N).data;
  const out: number[] = [];
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N / 2; x++) {
      const i = (y * N + x) * 4;
      out.push(d[i], d[i + 1], d[i + 2]);
    }
  return variance(out);
}

describe("plotter render-consistency goldens (Track B)", () => {
  it("renders a non-blank z^2 portrait (guards the invariants below against a blank canvas)", () => {
    expect(variance(fingerprint(render("z^2", "2d"), N))).toBeGreaterThan(200);
  });

  it("the z^2 portrait is invariant under a 180° rotation (f(-z) = f(z))", () => {
    const fp = fingerprint(render("z^2", "2d"), N);
    expect(meanAbs(fp, rot180(fp, N))).toBeLessThan(6);
  });

  it("the top-down 3D landscape equals the 2D portrait (the Phase-5 gate)", () => {
    const portrait = fingerprint(render("z^2", "2d"), N);
    const landscape = fingerprint(render("z^2", "3d", true), N);
    expect(meanAbs(portrait, landscape)).toBeLessThan(6);
  });

  // The Riemann-surface mode (ADR-0027): the parametrize-by-w surface renders real, phase-coloured
  // structure (not a blank clear), and the charisma axis actually changes the surface.
  it("renders a non-blank √z Riemann surface", () => {
    expect(variance(fingerprint(renderRiemann("sqrt(z)"), N))).toBeGreaterThan(50);
  });

  it("renders a non-blank log-z helicoid (Im-w charisma)", () => {
    expect(variance(fingerprint(renderRiemann("log(z)", 1), N))).toBeGreaterThan(50);
  });

  it("the charisma axis changes the surface (Re w vs Im w on √z differ)", () => {
    const reW = fingerprint(renderRiemann("sqrt(z)", 0), N);
    const imW = fingerprint(renderRiemann("sqrt(z)", 1), N);
    expect(meanAbs(reW, imW)).toBeGreaterThan(3);
  });

  // The algebraic-curve mode (M2a, ADR-0028): baked NPP meshes render real structure through the real Plot.
  it("renders a non-blank √(z²−1) algebraic-curve surface", () => {
    expect(variance(fingerprint(renderCurve("sqrt(z^2 - 1)"), N))).toBeGreaterThan(50);
  });

  it("renders a non-blank √(z³−z) (elliptic) surface", () => {
    expect(variance(fingerprint(renderCurve("sqrt(z^3 - z)"), N))).toBeGreaterThan(50);
  });

  // The implicit F(w,z)=0 mode (M2c, ADR-0030): a per-vertex root-solve surface renders real structure.
  it("renders a non-blank implicit w³ − w − z surface", () => {
    expect(variance(fingerprint(renderImplicit("w^3 - w - z"), N))).toBeGreaterThan(50);
  });

  // The linked base-plane pane (M3.2, ADR-0029): the split renders real structure in BOTH panes, and the
  // base-plane pane makes the image differ from the surface-only render.
  it("the linked Riemann view renders a non-blank base-plane pane beside the surface", () => {
    const linked = renderRiemannLinked("sqrt(z)");
    expect(variance(fingerprint(linked, N))).toBeGreaterThan(50); // non-blank overall
    expect(leftHalfVariance(linked)).toBeGreaterThan(50); // the base-plane (left) pane has real structure
    const surfaceOnly = fingerprint(renderRiemann("sqrt(z)"), N);
    expect(meanAbs(fingerprint(linked, N), surfaceOnly)).toBeGreaterThan(3); // the split changed the image
  });
});
