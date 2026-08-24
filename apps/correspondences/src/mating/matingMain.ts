// Entry for the mating explorer page (mating.html). M3: three synchronized panels. M4: interactivity —
// hover any panel to sync the equator angle θ across all three; click to trace the shared doubling orbit
// θ ↦ −2θ (the degree-2 equator map that both z̄² and the group's Nielsen map realise on the circle).
// Each panel's static base is drawn once to an offscreen canvas; pointer events only blit + overlay.
import { runWithFatalBoundary, attachCanvasA11y } from "@cas/ui";
import {
  drawFold,
  drawPanel,
  type MatingState,
  overlay,
  pixelToWorld,
  pointerToTheta,
  type Space,
} from "./matingView.js";

const SIZE = 380;
const FOLD_SIZE = 460;
const TAU = 2 * Math.PI;
const THETA_STEP = TAU / 180; // ~2° per arrow-key press (keyboard equivalent of dragging the equator angle)
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
let kbTheta = 0; // the keyboard's current angle, kept across an orbit (which clears state.theta)

// M5 — the unmating/folding viewer (a 4th, independent canvas with a scrub slider + play/pause)
let foldT = 0;
let foldDir = 1;
let foldToken = 0; // bumping this cancels the fold animation (pause / scrub)
let foldPlaying = false;
let foldCtx: CanvasRenderingContext2D | null = null;
let foldSlider: HTMLInputElement | null = null;
let foldBtn: HTMLButtonElement | null = null;
let foldLabel: HTMLElement | null = null;

function render(): void {
  for (const p of panels) {
    p.ctx.clearRect(0, 0, SIZE, SIZE);
    p.ctx.drawImage(p.base, 0, 0);
    overlay(p.ctx, SIZE, p.space, state);
  }
  if (!readout) return;
  if (state.orbit && state.orbit.length) {
    const start = Math.round(((state.orbit[0] * 180) / Math.PI + 360) % 360);
    // NOT "same dynamics on all three". θ ↦ −2θ is the shared angle dynamics, realised by z̄² and by
    // the Nielsen map — but σ does NOT move the deltoid-curve points this panel marks: on |z| = 1,
    // F(z) = 1/z + z²/2 = conj(φ(z)), so σ(φ(e^{iθ})) = φ(e^{iθ}). Measured max deviation 2.3e-14
    // across 12 angles, i.e. σ fixes that curve POINTWISE while the marker moves along it.
    // The angle is what is synchronised across the panels; the dynamics is not.
    readout.textContent = `orbit  θ ↦ −2θ  ·  ${state.orbit.length} points  ·  from ${start}°  (angle synced across all three; σ fixes the deltoid curve pointwise)`;
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

function renderFold(): void {
  if (!foldCtx) return;
  foldCtx.clearRect(0, 0, FOLD_SIZE, FOLD_SIZE);
  drawFold(foldCtx, FOLD_SIZE, foldT);
  if (foldLabel) {
    foldLabel.textContent =
      foldT < 0.04 ? "unmated · two disks" : foldT > 0.96 ? "mated · σ (deltoid)" : `welding · ${Math.round(foldT * 100)}%`;
  }
}

function stopFold(): void {
  foldPlaying = false;
  foldToken++;
  if (foldBtn) foldBtn.textContent = "▶ Play";
}

function startFold(): void {
  foldPlaying = true;
  if (foldBtn) foldBtn.textContent = "❚❚ Pause";
  const token = ++foldToken;
  const tick = (): void => {
    if (token !== foldToken) return;
    foldT += foldDir * 0.012;
    if (foldT >= 1) { foldT = 1; foldDir = -1; } // ping-pong: fold, then unfold
    else if (foldT <= 0) { foldT = 0; foldDir = 1; }
    if (foldSlider) foldSlider.value = String(Math.round(foldT * 1000));
    renderFold();
    setTimeout(tick, 40); // setTimeout, not rAF (hidden-tab safe)
  };
  setTimeout(tick, 40);
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
      <section style="margin-top:1.8rem;border-top:1px solid #1c212b;padding-top:1.2rem">
        <h2 style="font-size:1.05rem;margin:0 0 0.35rem">Unmating &mdash; fold the two disks into &sigma;</h2>
        <p class="tag" style="margin:0 0 0.8rem">
          A schematic (&asymp; illustrative) homotopy of the mating: the map disk's external <b style="color:#8ea6d8">rays</b>
          and the group disk's <b style="color:#6fb7ad">tessellation</b>, sharing one <b style="color:#e8c07a">equator</b>,
          fold into the single &sigma;-plane. Watch the equator circle grow three cusps and the group interior turn
          inside-out to tile the exterior.
        </p>
        <div style="display:flex;gap:0.8rem;align-items:center;flex-wrap:wrap;margin-bottom:0.7rem">
          <button id="fold-play" style="background:#1a1f29;color:#e8c07a;border:1px solid #2a3140;border-radius:6px;padding:0.35rem 0.85rem;cursor:pointer;font:inherit">&#9654; Play</button>
          <input id="fold-slider" type="range" min="0" max="1000" value="0" style="flex:1;min-width:180px;accent-color:#e8c07a">
          <span id="fold-label" class="status" style="color:#e8c07a;min-width:13ch"></span>
        </div>
        <canvas id="mate-fold" width="${FOLD_SIZE}" height="${FOLD_SIZE}" style="width:100%;max-width:${FOLD_SIZE}px;height:auto;display:block;border-radius:10px;border:1px solid #262b36;background:#0c0e12;margin:0 auto"></canvas>
      </section>
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
    // Keyboard equivalent of the pointer interaction (ADR-0028, U3): ←/→ move the shared equator angle θ,
    // Enter/Space traces its θ ↦ −2θ orbit. The angle is synced across all three panels, so any panel drives it.
    attachCanvasA11y(p.canvas, {
      label: `Mating equator, ${LABELS[p.space][1]} (${LABELS[p.space][0]}) — left/right arrows move the angle θ, Enter traces its orbit`,
      onKey: (a) => {
        if (a.kind === "pan" && a.dx !== 0) {
          orbitToken++; // moving cancels any running orbit, matching the pointer path
          state.orbit = null;
          // Resume from the shared hover angle if one is set, else from the last keyboard angle (an orbit
          // clears state.theta, so without kbTheta the next nudge would jump back to 0°).
          kbTheta = ((((state.theta ?? kbTheta) + a.dx * THETA_STEP) % TAU) + TAU) % TAU;
          state.theta = kbTheta;
          render();
        } else if (a.kind === "commit") {
          startOrbit(state.theta ?? kbTheta);
        }
      },
    });
  }
  render();

  // M5 fold viewer
  const foldCanvas = document.getElementById("mate-fold");
  if (foldCanvas instanceof HTMLCanvasElement) {
    foldCtx = foldCanvas.getContext("2d");
    // Slider/button-driven animation, not pointer-interactive — name it for a screen reader (role="img").
    attachCanvasA11y(foldCanvas, {
      role: "img",
      label: "The conformal-mating fold animation — scrubbed by the slider below",
    });
  }
  const slider = document.getElementById("fold-slider");
  foldSlider = slider instanceof HTMLInputElement ? slider : null;
  const btn = document.getElementById("fold-play");
  foldBtn = btn instanceof HTMLButtonElement ? btn : null;
  foldLabel = document.getElementById("fold-label");
  foldSlider?.addEventListener("input", () => {
    stopFold(); // scrubbing pauses the animation
    foldT = Number(foldSlider?.value ?? 0) / 1000;
    renderFold();
  });
  foldBtn?.addEventListener("click", () => {
    if (foldPlaying) stopFold();
    else startFold();
  });
  renderFold();
}

// Run inside @cas/ui's fatal-error boundary (ADR-0028, U3): mating.html boots into a bare <div id="app">
// with no error element, so an uncaught build() throw white-screened; now it surfaces a role=alert banner.
runWithFatalBoundary(build, {
  onError: (e) => console.error("Failed to initialize the mating explorer:", e),
  genericMessage: "Something went wrong starting the mating explorer. See the browser console for details.",
});
