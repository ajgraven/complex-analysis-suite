// An animated tracer-particle layer: hundreds of massless tracers advected along the velocity
// v = conj(E) of the closed-form field, drawn as fading streaks so the flow reads as motion. It runs
// on its own transparent canvas between the GPU field and the interaction overlay, and reuses the JS
// field evaluator (no extra WebGL). Trails fade to TRANSPARENT (destination-out) so the field stays
// visible underneath; the per-frame step is magnitude-capped so a tracer near a singularity streaks
// fast without teleporting across the plane.
import type { AppState } from "./state.js";
import { fieldOf } from "./state.js";
import { velocity } from "./field.js";
import { worldToScreen, screenToWorld, type Size, type View } from "./view.js";

const N = 700;
const DT = 0.02; // world units per unit speed per frame
const MAX_STEP = 0.05; // cap the per-frame displacement (world units) near singularities
const RESPAWN_RATE = 0.004; // fraction of tracers randomly reseeded each frame (avoids clumping)

export interface ParticleLayer {
  /** Advance and draw one animation frame. */
  frame(): void;
  /** Wipe the trail canvas (e.g. when motion is turned off). */
  clear(): void;
}

export function createParticleLayer(canvas: HTMLCanvasElement, state: AppState): ParticleLayer {
  const ctx = canvas.getContext("2d");
  const xs = new Float32Array(N);
  const ys = new Float32Array(N);
  const age = new Float32Array(N);
  const life = new Float32Array(N);
  let seeded = false;
  let lastView: View | null = null;

  const cssSize = (): Size => {
    const r = canvas.getBoundingClientRect();
    return { width: Math.max(1, Math.floor(r.width)), height: Math.max(1, Math.floor(r.height)) };
  };
  const resizeToDisplay = (sz: Size, dpr: number): void => {
    const w = Math.max(1, Math.floor(sz.width * dpr));
    const h = Math.max(1, Math.floor(sz.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  };
  const spawn = (i: number, sz: Size): void => {
    const w = screenToWorld(state.view, sz, [Math.random() * sz.width, Math.random() * sz.height]);
    xs[i] = w[0];
    ys[i] = w[1];
    age[i] = 0;
    life[i] = 40 + Math.random() * 70;
  };

  const clear = (): void => {
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const frame = (): void => {
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const sz = cssSize();
    resizeToDisplay(sz, dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (!seeded) {
      for (let i = 0; i < N; i++) spawn(i, sz);
      seeded = true;
    }

    // Fade existing trails toward transparent; a view change wipes fully (old trails are in stale coords).
    const viewChanged =
      !lastView ||
      lastView.center[0] !== state.view.center[0] ||
      lastView.center[1] !== state.view.center[1] ||
      lastView.halfSpan !== state.view.halfSpan;
    if (viewChanged) {
      ctx.clearRect(0, 0, sz.width, sz.height);
    } else {
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,0.10)";
      ctx.fillRect(0, 0, sz.width, sz.height);
      ctx.globalCompositeOperation = "source-over";
    }
    lastView = state.view;

    const field = fieldOf(state);
    ctx.lineWidth = 1.2;
    ctx.lineCap = "round";
    for (let i = 0; i < N; i++) {
      const v = velocity(field, [xs[i], ys[i]]);
      let sx = v[0] * DT;
      let sy = v[1] * DT;
      const step = Math.hypot(sx, sy);
      if (step > MAX_STEP) {
        sx *= MAX_STEP / step;
        sy *= MAX_STEP / step;
      }
      const nx = xs[i] + sx;
      const ny = ys[i] + sy;

      const [ax, ay] = worldToScreen(state.view, sz, [xs[i], ys[i]]);
      const [bx, by] = worldToScreen(state.view, sz, [nx, ny]);
      const fade = 1 - age[i] / life[i];
      ctx.strokeStyle = `rgba(233,237,245,${(0.5 * Math.max(0, fade)).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();

      xs[i] = nx;
      ys[i] = ny;
      age[i] += 1;

      const outOfView = bx < -20 || by < -20 || bx > sz.width + 20 || by > sz.height + 20;
      if (age[i] > life[i] || outOfView || step < 1e-4 || Math.random() < RESPAWN_RATE) spawn(i, sz);
    }
  };

  return { frame, clear };
}
