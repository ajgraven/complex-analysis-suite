import { describe, expect, it } from "vitest";
import { makeBoundedSchwarz, makeUnboundedLaurentSchwarz, type Complex } from "@cas/schwarz";
import { schwarzBoundaryPoly, renderSchwarzField, SCHWARZ_OFF_DISK_RGB } from "../src/render/schwarzView";
import { createSchwarzGLRenderer } from "../src/render/schwarzGL";
import { schwarzColormap } from "../src/render/schwarzColormaps";
import { quatFromAxisAngle } from "../src/render/sphereView";

// BROWSER-MODE end-to-end test for the GPU σ render (S4b-ii + ADR-0009 item 3). The node/jsdom gate can't
// run WebGL2, so this joins CD's existing `pnpm test:browser` project (real headless-Chromium WebGL2,
// SwiftShader).
//
// I1 already proved GPU σ(w) = CPU σ(w) to float32 ε (@cas/schwarz browser harness). This proves the
// RENDER SHELL around it — CD's view→w mapping, the Ω mask, the escape loop, and the SELECTABLE COLORMAP
// (render/schwarzColormaps.ts) — assembles into a working image: the shader compiles, a frame renders,
// it's opaque, it has K-vs-Ω structure, the fundamental set paints through the chosen colormap, and
// switching the colormap / scale mode changes the pixels.

/** drawImage the renderer's offscreen GL canvas onto a 2D canvas and read the pixels back — the exact
 *  path renderSchwarzView uses to blit onto #JCSSchwarz. */
function readPixels(glCanvas: HTMLCanvasElement, size: number): Uint8ClampedArray {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("no 2D context for readback");
  ctx.drawImage(glCanvas, 0, 0);
  return ctx.getImageData(0, 0, size, size).data;
}

function distinctColors(d: Uint8ClampedArray): Set<string> {
  const s = new Set<string>();
  for (let i = 0; i < d.length; i += 4) s.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
  return s;
}

/** RGB of the pixel at the image center (the view center maps here). */
function centerRGB(d: Uint8ClampedArray, size: number): [number, number, number] {
  const mid = ((size / 2) * size + size / 2) * 4;
  return [d[mid], d[mid + 1], d[mid + 2]];
}

/** Count pixels whose RGB differs (by > tol on any channel) between two same-size frames. */
function pixelsDiffering(a: Uint8ClampedArray, b: Uint8ClampedArray, tol = 2): number {
  let n = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (
      Math.abs(a[i] - b[i]) > tol ||
      Math.abs(a[i + 1] - b[i + 1]) > tol ||
      Math.abs(a[i + 2] - b[i + 2]) > tol
    ) {
      n++;
    }
  }
  return n;
}

function expectCloseColor(
  actual: readonly number[],
  expected: readonly number[],
  tol: number,
  label: string,
): void {
  for (let ch = 0; ch < 3; ch++) {
    expect(Math.abs(actual[ch] - expected[ch]), `${label} ch${ch} (${actual} ≈ ${expected})`).toBeLessThanOrEqual(
      tol,
    );
  }
}

const DELTOID: { c: number; F: Complex[] } = { c: 1, F: [[0, 0], [0, 0], [0.5, 0]] };
const VIEW = { center: [0, 0] as [number, number], zoom: 0.4 };
const OPTS = { maxIter: 48, escapeR: 1e4 };

describe("CD σ GPU render (S4b-ii + ADR-0009 item 3) — full pipeline in real WebGL2", () => {
  it("createSchwarzGLRenderer builds — the composed σ shader compiles + links", () => {
    const r = createSchwarzGLRenderer();
    expect(r, "WebGL2 present but the σ shader failed to build (null renderer)").not.toBeNull();
    r?.destroy();
  });

  it("renders the deltoid σ field: opaque, structured (K vs Ω), K interior in the colormap's base color", () => {
    const r = createSchwarzGLRenderer();
    expect(r).not.toBeNull();
    if (!r) return;
    const engine = makeUnboundedLaurentSchwarz(DELTOID.c, DELTOID.F);
    r.setPhi(DELTOID, schwarzBoundaryPoly(engine));
    const size = 64;
    expect(r.render(VIEW, size, OPTS)).toBe(true);

    const d = readPixels(r.canvas, size);
    for (let i = 3; i < d.length; i += 4) expect(d[i]).toBe(255); // fully opaque
    expect(distinctColors(d).size).toBeGreaterThan(1); // K vs Ω ⇒ not a flat fill

    // The center pixel maps to w ≈ origin ∈ K ⇒ fundamental n=0 ⇒ computeT(0)=0 ⇒ the colormap's t=0 end.
    // With the default (viridis) that is the dark-purple base [68,1,84]. Comparing against the imported
    // palette datum keeps this robust to palette edits (it tracks the ramp, not a frozen literal).
    const base = schwarzColormap("viridis")[0];
    expectCloseColor(centerRGB(d, size), base, 8, "K-interior center = viridis base");
    r.destroy();
  });

  it("setColormap repaints the fundamental set through the chosen ramp (center tracks the ramp's t=0 end)", () => {
    const r = createSchwarzGLRenderer();
    expect(r).not.toBeNull();
    if (!r) return;
    const engine = makeUnboundedLaurentSchwarz(DELTOID.c, DELTOID.F);
    r.setPhi(DELTOID, schwarzBoundaryPoly(engine));
    const size = 64;

    r.render(VIEW, size, OPTS);
    const viridis = readPixels(r.canvas, size);
    expectCloseColor(centerRGB(viridis, size), schwarzColormap("viridis")[0], 8, "viridis center");

    r.setColormap("turbo");
    r.render(VIEW, size, OPTS);
    const turbo = readPixels(r.canvas, size);
    expectCloseColor(centerRGB(turbo, size), schwarzColormap("turbo")[0], 8, "turbo center");

    r.setColormap("grayscale");
    r.render(VIEW, size, OPTS);
    const gray = readPixels(r.canvas, size);
    expectCloseColor(centerRGB(gray, size), schwarzColormap("grayscale")[0], 8, "grayscale center");

    // The palettes are visibly different objects, so the whole frame must move — not just the center.
    expect(pixelsDiffering(viridis, turbo), "viridis vs turbo differ").toBeGreaterThan(size); // ≫ a handful
    expect(pixelsDiffering(viridis, gray), "viridis vs grayscale differ").toBeGreaterThan(size);
    r.destroy();
  });

  it("the scale mode changes the escape-time coloring (linear vs sqrt remap n→t differently)", () => {
    const r = createSchwarzGLRenderer();
    expect(r).not.toBeNull();
    if (!r) return;
    const engine = makeUnboundedLaurentSchwarz(DELTOID.c, DELTOID.F);
    r.setPhi(DELTOID, schwarzBoundaryPoly(engine));
    const size = 64;

    r.render(VIEW, size, { ...OPTS, scaleMode: "linear" });
    const linear = readPixels(r.canvas, size);
    r.render(VIEW, size, { ...OPTS, scaleMode: "sqrt" });
    const sqrt = readPixels(r.canvas, size);

    // sqrt pushes low escape counts toward the bright end, so the n≥1 fundamental band recolors while the
    // flat sets (escaped/interior/invalid) and the n=0 center hold — the frames must differ, but not wholly.
    const diff = pixelsDiffering(linear, sqrt);
    expect(diff, "some pixels recolor under sqrt").toBeGreaterThan(size);
    expect(diff, "flat + n=0 regions unchanged ⇒ not the whole frame").toBeLessThan(size * size);
    r.destroy();
  });

  it("renders a pole-bearing σ field (single exterior pole) with structure — parity with the CPU path", () => {
    const r = createSchwarzGLRenderer();
    expect(r).not.toBeNull();
    if (!r) return;
    const phi = { c: 1, F: [] as Complex[], branches: [{ z: [0.2, 0] as Complex, A: [[0.3, 0] as Complex] }] };
    const engine = makeUnboundedLaurentSchwarz(phi.c, phi.F, phi.branches);
    r.setPhi(phi, schwarzBoundaryPoly(engine));
    const size = 64;
    expect(r.render({ center: [0, 0], zoom: 0.3 }, size, OPTS)).toBe(true);

    const d = readPixels(r.canvas, size);
    for (let i = 3; i < d.length; i += 4) expect(d[i]).toBe(255); // opaque
    expect(distinctColors(d).size).toBeGreaterThan(1); // structure, not a flat fill
    r.destroy();
  });

  // F2b — the z-disk view: the fragment is the uniformizing coordinate z, lifted forward w = φ(z) (no Newton
  // inverse), then the SAME escape-time runs on w. So the z-disk is the plane's σ field re-coordinatized. This
  // proves the new u_viewMode shader path: it renders, it differs from the plane, and its off-disk mask (a
  // pure |z| vs 1 geometric test, so free of float-engine drift) matches the CPU renderSchwarzField mirror.
  it("renders the z-disk view (F2b): forward-φ field, off-disk mask matches the CPU, differs from the plane", () => {
    const r = createSchwarzGLRenderer();
    expect(r).not.toBeNull();
    if (!r) return;
    const engine = makeUnboundedLaurentSchwarz(DELTOID.c, DELTOID.F);
    const poly = schwarzBoundaryPoly(engine);
    r.setPhi(DELTOID, poly);
    const size = 64;
    // A window showing the unit disk (|z| ≤ 1 = off-domain for the unbounded family) plus the annulus 1<|z|<2.
    const zview = { center: [0, 0] as [number, number], zoom: 0.5 };

    expect(r.render(zview, size, { ...OPTS, viewMode: "z" })).toBe(true);
    const gpuZ = readPixels(r.canvas, size);
    for (let i = 3; i < gpuZ.length; i += 4) expect(gpuZ[i]).toBe(255); // opaque
    expect(distinctColors(gpuZ).size, "off-disk background + the in-disk φ field").toBeGreaterThan(1);

    // The z-disk lifts through φ, so the SAME window renders differently from the w-plane.
    r.render(zview, size, OPTS); // plane (viewMode defaults to plane)
    const gpuPlane = readPixels(r.canvas, size);
    expect(pixelsDiffering(gpuZ, gpuPlane), "z-disk differs from the plane").toBeGreaterThan(size);

    // Off-disk mask (|z| ≤ 1) must agree with the CPU mirror — a pure geometric test, so only a 1–2px boundary
    // ring can jitter between the float32 GPU and the float64 CPU.
    const cpuZ = renderSchwarzField(engine, poly, zview, size, { ...OPTS, boundedOmega: false, viewMode: "z" });
    const [O0, O1, O2] = SCHWARZ_OFF_DISK_RGB;
    const isOff = (px: Uint8ClampedArray, i: number): boolean =>
      Math.abs(px[i] - O0) <= 2 && Math.abs(px[i + 1] - O1) <= 2 && Math.abs(px[i + 2] - O2) <= 2;
    let gpuOff = 0;
    let agree = 0;
    for (let i = 0; i < gpuZ.length; i += 4) {
      const g = isOff(gpuZ, i);
      if (g) gpuOff++;
      if (g === isOff(cpuZ, i)) agree++;
    }
    expect(gpuOff, "there is an off-disk region (the unit-disk interior)").toBeGreaterThan(size);
    expect(agree / (size * size), "GPU + CPU agree on the off-disk mask").toBeGreaterThan(0.97);
    r.destroy();
  });

  // F2d — the Riemann sphere view: a fragment ray-casts the unit sphere, the front-facing hit stereographically
  // projects to w, and the SAME escape-time runs on w — the plane's σ field wrapped onto a ball (∞ at the north
  // pole). This proves the new u_viewMode==2 shader path: it compiles, renders an opaque σ ball with K-vs-Ω
  // structure and a silhouette void around it, differs from the plane, and the arcball camera rotation moves it.
  it("renders the sphere view (F2d): a σ ball with a silhouette void, differing from the plane + on camera rotation", () => {
    const r = createSchwarzGLRenderer();
    expect(r).not.toBeNull();
    if (!r) return;
    const engine = makeUnboundedLaurentSchwarz(DELTOID.c, DELTOID.F);
    r.setPhi(DELTOID, schwarzBoundaryPoly(engine));
    const size = 64;
    const view = { center: [0, 0] as [number, number], zoom: 0.4 }; // the sphere ignores center/zoom, but the API takes a view

    expect(r.render(view, size, { ...OPTS, viewMode: "sphere" })).toBe(true);
    const sphere = readPixels(r.canvas, size);
    for (let i = 3; i < sphere.length; i += 4) expect(sphere[i]).toBe(255); // opaque
    expect(distinctColors(sphere).size, "the σ ball + its background void").toBeGreaterThan(1);

    // The ball's silhouette (angular radius asin(1/3) ≈ 19.5°) sits inside the ~50° FOV, so the viewport corners
    // (~33° off-axis) fall in the void — the SCHWARZ_OFF_DISK_RGB background painted on a ray miss.
    const [O0, O1, O2] = SCHWARZ_OFF_DISK_RGB;
    const cornerVoid = (x: number, y: number): boolean => {
      const i = (y * size + x) * 4;
      return Math.abs(sphere[i] - O0) <= 2 && Math.abs(sphere[i + 1] - O1) <= 2 && Math.abs(sphere[i + 2] - O2) <= 2;
    };
    expect(
      cornerVoid(0, 0) || cornerVoid(size - 1, 0) || cornerVoid(0, size - 1) || cornerVoid(size - 1, size - 1),
      "the viewport corners fall in the silhouette void",
    ).toBe(true);

    // The sphere is a re-projection of the same σ field, so it differs from the w-plane at the same window.
    r.render(view, size, OPTS); // plane (viewMode defaults to plane)
    const plane = readPixels(r.canvas, size);
    expect(pixelsDiffering(sphere, plane), "the sphere differs from the plane").toBeGreaterThan(size);

    // Rotating the arcball camera turns the ball — a different orientation ⇒ a visibly different frame.
    r.render(view, size, { ...OPTS, viewMode: "sphere", sphereRot: quatFromAxisAngle([0, 1, 0], 0.8) });
    const rotated = readPixels(r.canvas, size);
    expect(pixelsDiffering(sphere, rotated), "rotating the sphere camera changes the frame").toBeGreaterThan(size);
    r.destroy();
  });

  // S5-C2d: a BOUNDED-QD σ field renders through the same shell — the σ evaluator switches family via the
  // shared @cas/schwarz/gpu uniforms (u_family / u_w0) and inOmega() flips to the INTERIOR orientation
  // (u_boundedOmega). Single-lobe fixture: w₀=0, one branch z_j=0.3 A=[0.5] (the cross-app golden's φ).
  //
  // This domain's σ-dynamics are deliberately TRIVIAL — a single simple pole, so σ maps Ω out of Ω in one
  // step almost everywhere (interior points are fundamental at n=1). With the linear escape scale
  // computeT(0)==computeT(1)==0, so the n=0 exterior K and the n=1 interior render the SAME base color and
  // the field is (correctly) near-flat. The interior-Ω orientation itself is proven at the CPU level
  // (schwarzView.test.ts); here we prove the GPU family path is LIVE — feeding the identical branch
  // coefficients WITHOUT the bounded tag (unbounded σ + exterior orientation) yields a genuinely different,
  // valid frame, so u_family / u_w0 / u_boundedOmega are wired end-to-end, not silently ignored.
  it("renders a bounded-QD σ field opaque, and the bounded family path differs from the unbounded one", () => {
    const r = createSchwarzGLRenderer();
    expect(r).not.toBeNull();
    if (!r) return;
    const branches = [{ z: [0.3, 0] as Complex, A: [[0.5, 0] as Complex] }];
    const bounded = { family: "bounded" as const, w0: [0, 0] as Complex, branches };
    const engine = makeBoundedSchwarz([0, 0], branches);
    const poly = schwarzBoundaryPoly(engine);
    const size = 64;
    const bview = { center: [0, 0] as [number, number], zoom: 0.8 };

    r.setPhi(bounded, poly);
    expect(r.render(bview, size, OPTS)).toBe(true);
    const boundedFrame = readPixels(r.canvas, size);
    for (let i = 3; i < boundedFrame.length; i += 4) expect(boundedFrame[i]).toBe(255); // opaque, fully rendered

    // Same branch coefficients, but read as an UNBOUNDED φ (no family tag ⇒ exterior σ + exterior Ω): the
    // frame must move — proof the family/w0/boundedOmega switch is live, not a no-op.
    r.setPhi({ c: [1, 0] as Complex, F: [] as Complex[], branches }, poly);
    r.render(bview, size, OPTS);
    const asUnbounded = readPixels(r.canvas, size);
    expect(pixelsDiffering(boundedFrame, asUnbounded), "bounded vs unbounded interpretation differ").toBeGreaterThan(
      size,
    );
    r.destroy();
  });
});
