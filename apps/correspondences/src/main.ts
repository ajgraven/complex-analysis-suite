// apps/correspondences — the anti-holomorphic correspondence / Schwarz-reflection mating tool
// (Phase 6, MIGRATION.md). Four views: the deltoid Schwarz reflection σ (Milestone A — GPU fragment
// shader, CPU fallback), its deleted correspondence's orbit-tree density (Milestone B — CPU, chunked),
// the family PARAMETER plane φ_a = z + a/(2z²) coloured by critical-orbit escape (Milestone C — GPU, CPU
// fallback), and the model space (the Tricorn z̄² + c, via @cas/expr). All rest on the verified
// src/deltoid.ts / src/correspondence.ts / src/family.ts / src/tricorn.ts math.
import { DEFAULT_VIEW, renderBand } from "./render.js";
import { createDeltoidRenderer } from "./gpu.js";
import { accumulateBand, densityToImage, DEFAULT_DENSITY } from "./correspondenceRender.js";
import { DEFAULT_PARAM_OPTIONS, DEFAULT_PARAM_VIEW, renderParamBand } from "./paramPlane.js";
import { createParamRenderer } from "./paramGpu.js";
import { DEFAULT_TRICORN_OPTIONS, DEFAULT_TRICORN_VIEW, renderTricornBand } from "./tricorn.js";
import {
  DELTOID_CUSP_LOCUS_TEXT,
  DELTOID_EXACT_CURVE,
  deltoidBranchPoints,
  prettyCurve,
} from "./exact/deltoidExact.js";

const SIGMA_GPU = 560;
const SIGMA_CPU = 240;
const CORR = 380;
const PARAM_GPU = 560;
const PARAM_CPU = 300;
const TRICORN = 320;

function setCap(id: string, text: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function shell(): {
  sigma: HTMLCanvasElement;
  corr: HTMLCanvasElement;
  param: HTMLCanvasElement;
  tric: HTMLCanvasElement;
} | null {
  const app = document.getElementById("app");
  if (!app) return null;
  const cs = "width:100%;max-width:420px;display:block;border-radius:10px;border:1px solid #262b36";
  app.innerHTML = `
    <main>
      <h1>Correspondences</h1>
      <p class="tag">
        The deltoid Schwarz reflection &sigma;(w) = conj(F(&phi;&#8315;&sup1;(w))), its deleted
        correspondence, the family parameter plane &phi;<sub>a</sub>(z) = z + a/(2z&sup2;), and the
        model space (the Tricorn z&#772;&sup2; + c) — Milestone&nbsp;A + B + C.
        <a href="./mating.html" style="color:var(--accent)">&rarr; Mating explorer</a>
      </p>
      <div style="display:grid;gap:1.25rem;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))">
        <figure style="margin:0">
          <canvas id="sigma" style="${cs}"></canvas>
          <figcaption id="capS" class="status">Rendering &sigma;…</figcaption>
        </figure>
        <figure style="margin:0">
          <canvas id="corr" style="${cs}"></canvas>
          <figcaption id="capC" class="status">Rendering the correspondence…</figcaption>
          <figcaption id="capCExact" class="status" style="margin-top:.35rem;opacity:.85"></figcaption>
        </figure>
        <figure style="margin:0">
          <canvas id="param" style="${cs}"></canvas>
          <figcaption id="capP" class="status">Rendering the parameter plane…</figcaption>
        </figure>
        <figure style="margin:0">
          <canvas id="tric" style="${cs}"></canvas>
          <figcaption id="capT" class="status">Rendering the model space…</figcaption>
        </figure>
      </div>
    </main>`;
  const sigma = document.getElementById("sigma") as HTMLCanvasElement | null;
  const corr = document.getElementById("corr") as HTMLCanvasElement | null;
  const param = document.getElementById("param") as HTMLCanvasElement | null;
  const tric = document.getElementById("tric") as HTMLCanvasElement | null;
  return sigma && corr && param && tric ? { sigma, corr, param, tric } : null;
}

// setTimeout (not requestAnimationFrame — suspended in hidden tabs) chunked loop.
function chunk(step: (done: () => void) => void): void {
  const tick = (): void => step(() => setTimeout(tick, 0));
  setTimeout(tick, 0);
}

// Shared chunked CPU renderer: fills the canvas in row-bands of `rowsPerTick`, yielding between bands
// (setTimeout) so the page stays responsive, updating `capId` with progress then the final caption. Used
// by the σ / parameter CPU fallbacks and the Tricorn — all pure image-band renders.
function chunkImageBands(
  ctx: CanvasRenderingContext2D,
  size: number,
  rowsPerTick: number,
  renderRows: (image: ImageData, y0: number, y1: number) => void,
  capId: string,
  progress: (pct: number) => string,
  done: (ms: number) => string,
): void {
  const image = ctx.createImageData(size, size);
  const t0 = performance.now();
  let y = 0;
  chunk((next) => {
    const y1 = Math.min(size, y + rowsPerTick);
    renderRows(image, y, y1);
    ctx.putImageData(image, 0, 0);
    y = y1;
    if (y < size) {
      setCap(capId, progress(Math.round((100 * y) / size)));
      next();
    } else {
      setCap(capId, done(Math.round(performance.now() - t0)));
    }
  });
}

// Swap the WebGL-bound canvas for a fresh 2D one (a canvas can't change context type) for a CPU fallback.
function freshCanvas(old: HTMLCanvasElement, id: string, size: number): CanvasRenderingContext2D | null {
  const fresh = document.createElement("canvas");
  fresh.id = id;
  fresh.width = size;
  fresh.height = size;
  fresh.style.cssText = old.style.cssText;
  old.replaceWith(fresh);
  return fresh.getContext("2d");
}

function renderSigma(canvas: HTMLCanvasElement): void {
  canvas.width = SIGMA_GPU;
  canvas.height = SIGMA_GPU;
  const gpu = createDeltoidRenderer(canvas);
  if (gpu) {
    const t0 = performance.now();
    gpu.render(DEFAULT_VIEW);
    setCap(
      "capS",
      `σ dynamical plane — GPU render (${SIGMA_GPU}², ${Math.round(performance.now() - t0)} ms). ` +
        `K at the centre; tiling set coloured by escape time; the non-escaping set (≈ the limit set) in black.`,
    );
    return;
  }
  const ctx = freshCanvas(canvas, "sigma", SIGMA_CPU);
  if (!ctx) return;
  chunkImageBands(
    ctx,
    SIGMA_CPU,
    6,
    (image, y0, y1) => renderBand(image, DEFAULT_VIEW, y0, y1),
    "capS",
    (pct) => `σ dynamical plane (CPU fallback)… ${pct}%`,
    (ms) => `σ dynamical plane — CPU fallback (${SIGMA_CPU}², ${ms} ms).`,
  );
}

// World (complex) → canvas pixel — the inverse of render.ts's renderBand mapping (DEFAULT_VIEW = centre +
// halfSpan, x scaled by the pixel aspect ratio).
function worldToPixel(w: number, h: number, z: readonly [number, number]): [number, number] {
  const v = DEFAULT_VIEW;
  const aspect = w / h;
  return [w * (0.5 + (z[0] - v.centerX) / (2 * v.halfSpan * aspect)), h * (0.5 - (z[1] - v.centerY) / (2 * v.halfSpan))];
}

// Overlay the EXACT correspondence branch points (roadmap #16): the z where disc_w C = 0, i.e. the two
// w-branches collide (the "cusps" of the correspondence dynamics). Computed exactly in ℚ(i) via @cas/exact
// (deltoidBranchPoints); a point p of the dynamical plane is a branch point ⟺ conj(p) is a cusp-locus root.
function drawCuspMarkers(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.save();
  ctx.lineWidth = 1.5;
  for (const b of deltoidBranchPoints().filter((p) => !p.degenerate)) {
    const [px, py] = worldToPixel(w, h, b.z);
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, 2 * Math.PI);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fill();
    ctx.strokeStyle = "rgba(10,12,20,0.9)";
    ctx.stroke();
  }
  ctx.restore();
}

function renderCorrespondence(canvas: HTMLCanvasElement): void {
  canvas.width = CORR;
  canvas.height = CORR;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const image = ctx.createImageData(CORR, CORR);
  const density = new Float32Array(CORR * CORR);
  const opts = DEFAULT_DENSITY;
  const t0 = performance.now();
  let sy = 0;
  chunk((next) => {
    const sy1 = Math.min(opts.seedGrid, sy + 3);
    accumulateBand(density, CORR, CORR, DEFAULT_VIEW, opts, sy, sy1);
    sy = sy1;
    const isFinal = sy >= opts.seedGrid;
    densityToImage(density, image, DEFAULT_VIEW, isFinal); // blur only the final frame
    ctx.putImageData(image, 0, 0);
    if (!isFinal) {
      setCap("capC", `Deleted-correspondence orbit-tree density… ${Math.round((100 * sy) / opts.seedGrid)}%`);
      next();
    } else {
      setCap(
        "capC",
        `Deleted correspondence — orbit-tree density (${CORR}², ${Math.round(performance.now() - t0)} ms). ` +
          `Forward dynamics of the 2:2 correspondence, log-scaled; K shaded. ` +
          `○ = the 3 exact branch points (cusps, |z| = 2) where the two branches collide.`,
      );
      drawCuspMarkers(ctx, CORR, CORR); // draw on top of the final density frame (roadmap #16)
    }
  });
}

function renderParamPlane(canvas: HTMLCanvasElement): void {
  const opts = DEFAULT_PARAM_OPTIONS;
  canvas.width = PARAM_GPU;
  canvas.height = PARAM_GPU;
  const gpu = createParamRenderer(canvas);
  if (gpu) {
    const t0 = performance.now();
    gpu.render(DEFAULT_PARAM_VIEW, opts.maxIter, opts.escapeR);
    setCap(
      "capP",
      `Family parameter plane φ_a = z + a/(2z²) — GPU render (${PARAM_GPU}², ${Math.round(performance.now() - t0)} ms). ` +
        `Dark body ≈ critical/cusp orbits bounded (a=1 deltoid, a=0 disk); exterior by escape speed. ` +
        `≈ exploratory — not a certified connectedness locus. φ_a is univalent on {|z|>1} only for ` +
        `|a| ≤ 1, and this window extends past that, so σ_a is not well defined over much of the ` +
        `picture: read |a| > 1 as an unclassified region, not as membership.`,
    );
    return;
  }
  const ctx = freshCanvas(canvas, "param", PARAM_CPU);
  if (!ctx) return;
  const field = new Float32Array(PARAM_CPU * PARAM_CPU);
  chunkImageBands(
    ctx,
    PARAM_CPU,
    4,
    (image, y0, y1) => renderParamBand(image, DEFAULT_PARAM_VIEW, opts, y0, y1, field),
    "capP",
    (pct) => `Parameter plane — critical-orbit escape (CPU)… ${pct}%`,
    (ms) =>
      `Family parameter plane φ_a = z + a/(2z²) — CPU fallback (${PARAM_CPU}², ${ms} ms). ` +
      `Dark body ≈ critical/cusp orbits bounded (a=1 deltoid, a=0 disk). ≈ exploratory — not certified. ` +
      `φ_a is univalent on {|z|>1} only for |a| ≤ 1, and this window extends past that, so σ_a is not ` +
      `well defined over much of the picture: read |a| > 1 as an unclassified region, not as membership.`,
  );
}

function renderTricorn(canvas: HTMLCanvasElement): void {
  canvas.width = TRICORN;
  canvas.height = TRICORN;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const field = new Float32Array(TRICORN * TRICORN);
  chunkImageBands(
    ctx,
    TRICORN,
    12,
    (image, y0, y1) => renderTricornBand(image, DEFAULT_TRICORN_VIEW, DEFAULT_TRICORN_OPTIONS, y0, y1, field),
    "capT",
    (pct) => `Model space — the Tricorn z̄² + c… ${pct}%`,
    (ms) =>
      `Model space — the Tricorn z̄² + c (${TRICORN}², ${ms} ms), via @cas/expr (= CD's tricorn preset). ` +
      `The family is conjectured to straighten INTO the parabolic Tricorn; ` +
      `the straightening map a→c is ≈ exploratory and not computed here.`,
  );
}

// The EXACT algebraic scaffold of the deltoid's deleted correspondence (roadmap #16), shown beneath the
// (numeric) correspondence render: the once-computed exact curve C(w, z̄) and its cusp locus, whose roots
// are the branch points where the two w-branches collide. Exact (=) — unlike the ≈ dynamics above it.
function setExactScaffold(): void {
  const el = document.getElementById("capCExact");
  if (!el) return;
  const finite = deltoidBranchPoints().filter((b) => !b.degenerate);
  el.textContent =
    `Exact 2:2 correspondence curve  ${prettyCurve(DELTOID_EXACT_CURVE.text)}  (= in ℚ(i)). ` +
    `Cusp locus disc_w = ${DELTOID_CUSP_LOCUS_TEXT} ⇒ ${finite.length} branch points on |z| = 2 ` +
    `(where the two branches collide), computed exactly and solved.`;
}

function mount(): void {
  const s = shell();
  if (!s) return;
  renderSigma(s.sigma);
  renderCorrespondence(s.corr);
  renderParamPlane(s.param);
  renderTricorn(s.tric);
  setExactScaffold();
}

mount();
