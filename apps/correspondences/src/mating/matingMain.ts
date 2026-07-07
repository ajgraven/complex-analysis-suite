// Entry for the mating explorer page (mating.html). M3: three synchronized panels. M4: interactivity —
// hover any panel to sync the equator angle θ across all three; click to trace the shared doubling orbit
// θ ↦ −2θ (the degree-2 equator map that both z̄² and the group's Nielsen map realise on the circle).
// Each panel's static base is drawn once to an offscreen canvas; pointer events only blit + overlay.
import {
  drawPanel,
  type MatingState,
  overlay,
  pixelToWorld,
  pointerToTheta,
  type Space,
} from "./matingView.js";

const SIZE = 380;
const SPACES: Space[] = ["map", "group", "sigma"];
const LABELS: Record<Space, [string, string]> = {
  map: ["z̄²", "map side"],
  group: ["ideal △ group", "group side"],
  sigma: ["σ · deltoid", "the mating"],
};

interface PanelUI {
  space: Space;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  base: HTMLCanvasElement;
}

const state: MatingState = { theta: null, orbit: null };
let panels: PanelUI[] = [];
let readout: HTMLElement | null = null;
let orbitToken = 0; // bumping this cancels any in-flight orbit animation

function render(): void {
  for (const p of panels) {
    p.ctx.clearRect(0, 0, SIZE, SIZE);
    p.ctx.drawImage(p.base, 0, 0);
    overlay(p.ctx, SIZE, p.space, state);
  }
  if (!readout) return;
  if (state.orbit && state.orbit.length) {
    const start = Math.round(((state.orbit[0] * 180) / Math.PI + 360) % 360);
    readout.textContent = `orbit  θ ↦ −2θ  ·  ${state.orbit.length} points  ·  from ${start}°  (same dynamics on all three)`;
  } else if (state.theta !== null) {
    readout.textContent = `equator angle  θ = ${Math.round(((state.theta * 180) / Math.PI + 360) % 360)}°  ·  synced across all three panels`;
  } else {
    readout.textContent = "Hover a panel to sync the equator angle across all three · click to trace the doubling orbit θ ↦ −2θ";
  }
}

function pointerTheta(p: PanelUI, e: PointerEvent): number {
  const rect = p.canvas.getBoundingClientRect();
  const px = (e.clientX - rect.left) * (SIZE / rect.width);
  const py = (e.clientY - rect.top) * (SIZE / rect.height);
  return pointerToTheta(p.space, pixelToWorld(px, py, p.space, SIZE));
}

function startOrbit(theta0: number): void {
  const token = ++orbitToken;
  const orbit = [theta0];
  state.theta = null;
  state.orbit = orbit;
  render();
  const step = (): void => {
    if (token !== orbitToken) return;
    const last = orbit[orbit.length - 1];
    orbit.push((((-2 * last) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI));
    render();
    if (orbit.length < 12) setTimeout(step, 380); // setTimeout, not rAF (hidden-tab safe)
  };
  setTimeout(step, 380);
}

function build(): void {
  const app = document.getElementById("app");
  if (!app) return;
  const cs = "width:100%;max-width:380px;height:auto;display:block;border-radius:10px;border:1px solid #262b36;background:#0c0e12;cursor:crosshair;touch-action:none";
  const figs = SPACES.map(
    (s) =>
      `<figure style="margin:0"><canvas id="mate-${s}" width="${SIZE}" height="${SIZE}" style="${cs}"></canvas>` +
      `<figcaption class="status"><b style="color:var(--text)">${LABELS[s][0]}</b> — ${LABELS[s][1]}</figcaption></figure>`,
  ).join("");
  app.innerHTML = `
    <main>
      <h1>Mating explorer</h1>
      <p class="tag">
        The deltoid Schwarz reflection &sigma; as the mating of z&#772;&sup2; and the ideal triangle group
        (Lee&ndash;Lyubich&ndash;Makarov&ndash;Mukherjee). The <b style="color:#e8c07a">equator</b> is one
        curve in three coordinates; the three dots are the cusps = ideal vertices = z&#772;&sup2; fixed
        points. <a href="./index.html" style="color:var(--accent)">&larr; the four dynamical views</a>
      </p>
      <div id="readout" class="status" style="min-height:1.25em;margin:0 0 0.9rem;color:#e8c07a"></div>
      <div style="display:grid;gap:1.25rem;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))">${figs}</div>
    </main>`;
  readout = document.getElementById("readout");
  panels = SPACES.map((space): PanelUI | null => {
    const canvas = document.getElementById(`mate-${space}`);
    if (!(canvas instanceof HTMLCanvasElement)) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const base = document.createElement("canvas");
    base.width = SIZE;
    base.height = SIZE;
    const bctx = base.getContext("2d");
    if (bctx) drawPanel(bctx, SIZE, space); // the expensive static layer, drawn once
    return { space, canvas, ctx, base };
  }).filter((p): p is PanelUI => p !== null);

  for (const p of panels) {
    p.canvas.addEventListener("pointermove", (e) => {
      orbitToken++; // moving cancels any running orbit and resumes hover
      state.orbit = null;
      state.theta = pointerTheta(p, e);
      render();
    });
    p.canvas.addEventListener("pointerleave", () => {
      orbitToken++;
      state.orbit = null;
      state.theta = null;
      render();
    });
    p.canvas.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      startOrbit(pointerTheta(p, e));
    });
  }
  render();
}

build();
