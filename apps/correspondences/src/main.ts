// apps/correspondences — the anti-holomorphic correspondence / Schwarz-reflection mating tool
// (Phase 6, MIGRATION.md). Milestone A: render the deltoid Schwarz reflection's dynamical plane and
// check it against the published picture. The σ engine is the verified src/deltoid.ts; the render is
// a CPU escape-time pass (src/render.ts), chunked across timer ticks so the page stays responsive.
import { DEFAULT_VIEW, renderBand } from "./render.js";

const SIZE = 240;
const BAND = 6; // rows rendered per tick — short enough to keep the tab responsive

function mount(): void {
  const app = document.getElementById("app");
  if (!app) return;
  app.innerHTML = `
    <main>
      <h1>Correspondences</h1>
      <p class="tag">
        Deltoid Schwarz reflection &sigma;(w) = conj(F(&phi;&#8315;&sup1;(w))), &phi;(&zeta;) =
        &zeta; + 1/(2&zeta;&sup2;) — Milestone&nbsp;A.
      </p>
      <canvas id="plane" width="${SIZE}" height="${SIZE}"
        style="width:${SIZE}px;max-width:100%;display:block;border-radius:10px;border:1px solid #262b36"></canvas>
      <p class="status" id="cap">Rendering the dynamical plane…</p>
    </main>`;

  const canvas = document.getElementById("plane") as HTMLCanvasElement | null;
  const ctx = canvas?.getContext("2d");
  const cap = document.getElementById("cap");
  if (!canvas || !ctx) return;

  const image = ctx.createImageData(SIZE, SIZE);
  const t0 = performance.now();
  let y = 0;

  // setTimeout, not requestAnimationFrame: rAF is suspended in hidden/background tabs. Chunking by
  // row-band keeps each tick short so the page never freezes on the multi-second pass.
  const step = (): void => {
    const y1 = Math.min(SIZE, y + BAND);
    renderBand(image, DEFAULT_VIEW, y, y1);
    ctx.putImageData(image, 0, 0);
    y = y1;
    if (y < SIZE) {
      if (cap) cap.textContent = `Rendering the dynamical plane… ${Math.round((100 * y) / SIZE)}%`;
      setTimeout(step, 0);
    } else if (cap) {
      cap.textContent =
        `Deltoid dynamical plane — CPU escape-time render (${SIZE}×${SIZE}, ` +
        `${Math.round(performance.now() - t0)} ms). Central region is K; the tiling set is coloured by ` +
        `escape time, fading into the limit set. A GPU render comes next.`;
    }
  };
  setTimeout(step, 0);
}

mount();
