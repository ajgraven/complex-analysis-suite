// apps/correspondences — the anti-holomorphic correspondence / Schwarz-reflection mating tool
// (Phase 6, MIGRATION.md). Milestone A: render the deltoid Schwarz reflection's dynamical plane. The σ
// engine is the verified src/deltoid.ts; rendering prefers the GPU fragment-shader path (src/gpu.ts,
// interactive) and falls back to the CPU escape-time pass (src/render.ts) where WebGL2 is unavailable.
import { DEFAULT_VIEW, renderBand } from "./render.js";
import { createDeltoidRenderer } from "./gpu.js";

const GPU_SIZE = 640;
const CPU_SIZE = 240;
const BAND = 6; // CPU-fallback rows per tick

function shell(): HTMLCanvasElement | null {
  const app = document.getElementById("app");
  if (!app) return null;
  app.innerHTML = `
    <main>
      <h1>Correspondences</h1>
      <p class="tag">
        Deltoid Schwarz reflection &sigma;(w) = conj(F(&phi;&#8315;&sup1;(w))), &phi;(&zeta;) =
        &zeta; + 1/(2&zeta;&sup2;) — Milestone&nbsp;A.
      </p>
      <canvas id="plane"
        style="width:500px;max-width:100%;display:block;border-radius:10px;border:1px solid #262b36"></canvas>
      <p class="status" id="cap">Rendering the dynamical plane…</p>
    </main>`;
  return document.getElementById("plane") as HTMLCanvasElement | null;
}

function caption(text: string): void {
  const cap = document.getElementById("cap");
  if (cap) cap.textContent = text;
}

// CPU fallback: the GPU attempt bound `oldCanvas` to WebGL2, so render into a fresh 2D canvas. Chunked
// across setTimeout ticks (rAF is suspended in hidden tabs) so the page stays responsive.
function cpuFallback(oldCanvas: HTMLCanvasElement): void {
  const canvas = document.createElement("canvas");
  canvas.id = "plane";
  canvas.width = CPU_SIZE;
  canvas.height = CPU_SIZE;
  canvas.style.cssText = oldCanvas.style.cssText;
  oldCanvas.replaceWith(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const image = ctx.createImageData(CPU_SIZE, CPU_SIZE);
  const t0 = performance.now();
  let y = 0;
  const step = (): void => {
    const y1 = Math.min(CPU_SIZE, y + BAND);
    renderBand(image, DEFAULT_VIEW, y, y1);
    ctx.putImageData(image, 0, 0);
    y = y1;
    if (y < CPU_SIZE) {
      caption(`Rendering the dynamical plane (CPU fallback)… ${Math.round((100 * y) / CPU_SIZE)}%`);
      setTimeout(step, 0);
    } else {
      caption(
        `Deltoid dynamical plane — CPU escape-time fallback (${CPU_SIZE}×${CPU_SIZE}, ` +
          `${Math.round(performance.now() - t0)} ms). WebGL2 unavailable in this browser.`,
      );
    }
  };
  setTimeout(step, 0);
}

function mount(): void {
  const canvas = shell();
  if (!canvas) return;

  // Prefer the GPU fragment-shader render (interactive, high-res); fall back to the CPU pass.
  canvas.width = GPU_SIZE;
  canvas.height = GPU_SIZE;
  const gpu = createDeltoidRenderer(canvas);
  if (gpu) {
    const t0 = performance.now();
    gpu.render(DEFAULT_VIEW);
    caption(
      `Deltoid dynamical plane — GPU (WebGL2) escape-time render (${GPU_SIZE}×${GPU_SIZE}, ` +
        `${Math.round(performance.now() - t0)} ms). φ⁻¹ is inverted per pixel by Newton in a fragment ` +
        `shader (@cas/gpu). Central region is K; the tiling set is coloured by escape time, fading into ` +
        `the limit set.`,
    );
    return;
  }
  cpuFallback(canvas);
}

mount();
