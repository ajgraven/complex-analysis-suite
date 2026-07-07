// apps/correspondences — the anti-holomorphic correspondence / Schwarz-reflection mating tool
// (Phase 6, MIGRATION.md). Three views: the deltoid Schwarz reflection σ (Milestone A — GPU fragment
// shader, CPU fallback), its deleted correspondence's orbit-tree density (Milestone B — CPU, chunked),
// and the family PARAMETER plane φ_a = z + a/(2z²) coloured by critical-orbit escape (Milestone C —
// CPU, chunked). All rest on the verified src/deltoid.ts / src/correspondence.ts / src/family.ts math.
import { DEFAULT_VIEW, renderBand } from "./render.js";
import { createDeltoidRenderer } from "./gpu.js";
import { accumulateBand, densityToImage, DEFAULT_DENSITY } from "./correspondenceRender.js";
import { DEFAULT_PARAM_OPTIONS, DEFAULT_PARAM_VIEW, renderParamBand } from "./paramPlane.js";
import { createParamRenderer } from "./paramGpu.js";

const SIGMA_GPU = 560;
const SIGMA_CPU = 240;
const CORR = 380;
const PARAM_GPU = 560;
const PARAM_CPU = 300;

function setCap(id: string, text: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function shell(): {
  sigma: HTMLCanvasElement;
  corr: HTMLCanvasElement;
  param: HTMLCanvasElement;
} | null {
  const app = document.getElementById("app");
  if (!app) return null;
  const cs = "width:100%;max-width:420px;display:block;border-radius:10px;border:1px solid #262b36";
  app.innerHTML = `
    <main>
      <h1>Correspondences</h1>
      <p class="tag">
        The deltoid Schwarz reflection &sigma;(w) = conj(F(&phi;&#8315;&sup1;(w))), its deleted
        correspondence, and the family parameter plane &phi;<sub>a</sub>(z) = z + a/(2z&sup2;) —
        Milestone&nbsp;A + B + C.
      </p>
      <div style="display:grid;gap:1.25rem;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))">
        <figure style="margin:0">
          <canvas id="sigma" style="${cs}"></canvas>
          <figcaption id="capS" class="status">Rendering &sigma;…</figcaption>
        </figure>
        <figure style="margin:0">
          <canvas id="corr" style="${cs}"></canvas>
          <figcaption id="capC" class="status">Rendering the correspondence…</figcaption>
        </figure>
        <figure style="margin:0">
          <canvas id="param" style="${cs}"></canvas>
          <figcaption id="capP" class="status">Rendering the parameter plane…</figcaption>
        </figure>
      </div>
    </main>`;
  const sigma = document.getElementById("sigma") as HTMLCanvasElement | null;
  const corr = document.getElementById("corr") as HTMLCanvasElement | null;
  const param = document.getElementById("param") as HTMLCanvasElement | null;
  return sigma && corr && param ? { sigma, corr, param } : null;
}

// setTimeout (not requestAnimationFrame — suspended in hidden tabs) chunked loop.
function chunk(step: (done: () => void) => void): void {
  const tick = (): void => step(() => setTimeout(tick, 0));
  setTimeout(tick, 0);
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
        `K at the centre; tiling set coloured by escape time; limit set in black.`,
    );
    return;
  }
  // Fresh 2D canvas for the CPU fallback (the GPU attempt bound the canvas to WebGL2).
  const fresh = document.createElement("canvas");
  fresh.id = "sigma";
  fresh.width = SIGMA_CPU;
  fresh.height = SIGMA_CPU;
  fresh.style.cssText = canvas.style.cssText;
  canvas.replaceWith(fresh);
  const ctx = fresh.getContext("2d");
  if (!ctx) return;
  const image = ctx.createImageData(SIGMA_CPU, SIGMA_CPU);
  const t0 = performance.now();
  let y = 0;
  chunk((next) => {
    const y1 = Math.min(SIGMA_CPU, y + 6);
    renderBand(image, DEFAULT_VIEW, y, y1);
    ctx.putImageData(image, 0, 0);
    y = y1;
    if (y < SIGMA_CPU) {
      setCap("capS", `σ dynamical plane (CPU fallback)… ${Math.round((100 * y) / SIGMA_CPU)}%`);
      next();
    } else {
      setCap("capS", `σ dynamical plane — CPU fallback (${SIGMA_CPU}², ${Math.round(performance.now() - t0)} ms).`);
    }
  });
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
    densityToImage(density, image, DEFAULT_VIEW);
    ctx.putImageData(image, 0, 0);
    sy = sy1;
    if (sy < opts.seedGrid) {
      setCap("capC", `Deleted-correspondence orbit-tree density… ${Math.round((100 * sy) / opts.seedGrid)}%`);
      next();
    } else {
      setCap(
        "capC",
        `Deleted correspondence — orbit-tree density (${CORR}², ${Math.round(performance.now() - t0)} ms). ` +
          `Forward dynamics of the 2:2 correspondence, log-scaled; K shaded.`,
      );
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
        `≈ exploratory — not a certified connectedness locus.`,
    );
    return;
  }
  // Fresh 2D canvas for the CPU fallback (the GPU attempt bound the canvas to WebGL2).
  const fresh = document.createElement("canvas");
  fresh.id = "param";
  fresh.width = PARAM_CPU;
  fresh.height = PARAM_CPU;
  fresh.style.cssText = canvas.style.cssText;
  canvas.replaceWith(fresh);
  const ctx = fresh.getContext("2d");
  if (!ctx) return;
  const image = ctx.createImageData(PARAM_CPU, PARAM_CPU);
  const t0 = performance.now();
  let y = 0;
  chunk((next) => {
    const y1 = Math.min(PARAM_CPU, y + 4);
    renderParamBand(image, DEFAULT_PARAM_VIEW, opts, y, y1);
    ctx.putImageData(image, 0, 0);
    y = y1;
    if (y < PARAM_CPU) {
      setCap("capP", `Parameter plane — critical-orbit escape (CPU)… ${Math.round((100 * y) / PARAM_CPU)}%`);
      next();
    } else {
      setCap(
        "capP",
        `Family parameter plane φ_a = z + a/(2z²) — CPU fallback (${PARAM_CPU}², ${Math.round(performance.now() - t0)} ms). ` +
          `Dark body ≈ critical/cusp orbits bounded (a=1 deltoid, a=0 disk). ≈ exploratory — not certified.`,
      );
    }
  });
}

function mount(): void {
  const s = shell();
  if (!s) return;
  renderSigma(s.sigma);
  renderCorrespondence(s.corr);
  renderParamPlane(s.param);
}

mount();
