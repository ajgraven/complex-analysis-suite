// Entry for the mating explorer page (mating.html) — M3. Builds three canvases and draws the three
// synchronized static panels (matingView.ts). Static for now; interactivity (cross-highlighting, orbit
// tracer) is M4.
import { drawGroupPanel, drawMapPanel, drawSigmaPanel } from "./matingView.js";

const SIZE = 380;

function panel(id: string, title: string, sub: string): string {
  const cs = "width:100%;max-width:380px;height:auto;display:block;border-radius:10px;border:1px solid #262b36;background:#0c0e12";
  return `<figure style="margin:0">
      <canvas id="${id}" width="${SIZE}" height="${SIZE}" style="${cs}"></canvas>
      <figcaption class="status"><b style="color:var(--text)">${title}</b> — ${sub}</figcaption>
    </figure>`;
}

function draw(id: string, fn: (ctx: CanvasRenderingContext2D, size: number) => void): void {
  const cv = document.getElementById(id) as HTMLCanvasElement | null;
  const ctx = cv ? cv.getContext("2d") : null;
  if (ctx) fn(ctx, SIZE);
}

function mount(): void {
  const app = document.getElementById("app");
  if (!app) return;
  app.innerHTML = `
    <main>
      <h1>Mating explorer</h1>
      <p class="tag">
        The deltoid Schwarz reflection &sigma; as the mating of z&#772;&sup2; and the ideal triangle group
        (Lee&ndash;Lyubich&ndash;Makarov&ndash;Mukherjee). The <b style="color:#e8c07a">equator</b> is one
        curve in three coordinates; the three dots are the cusps = ideal vertices = z&#772;&sup2; fixed
        points (cube roots of&nbsp;1). <a href="./index.html" style="color:var(--accent)">&larr; the four dynamical views</a>
      </p>
      <div style="display:grid;gap:1.25rem;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))">
        ${panel("mate-map", "z̄²", "map side — 0-basin, Julia circle, rays")}
        ${panel("mate-group", "ideal △ group", "group side — Γ tessellation of 𝔻")}
        ${panel("mate-sigma", "σ · deltoid", "the mating — Γ tiles via φ∘η")}
      </div>
    </main>`;
  draw("mate-map", drawMapPanel);
  draw("mate-group", drawGroupPanel);
  draw("mate-sigma", drawSigmaPanel);
}

mount();
