// apps/2d-electrostatics — an interactive realization of the complex potential W(z) = φ + iψ as a
// field of charges, sources, sinks, vortices, and doublets (the author's "Complex Analysis as
// Electrostatics and Hydrodynamics"). M1 grows the M0 render spike into a sandbox: the field is drawn
// on the GPU (domain-colour of E + the φ/ψ contour net) with a 2D overlay of grabbable handles, and
// the view pans/zooms while singularities drag with live recompute. The palette + edit panel, the
// two-lens toggle, the sensor puck / probes, presets, persistence, and the theorem gallery follow in
// later M1 slices.
import "./styles/main.css";
import { runWithFatalBoundary, mountCanvas } from "@cas/ui";
import { fieldOf, initialState } from "./state.js";
import { createFieldRenderer } from "./render/glView.js";
import { drawOverlay } from "./render/overlay.js";
import { attachInteraction } from "./interaction.js";

function sizeCanvas(canvas: HTMLCanvasElement, cssW: number, cssH: number, dpr: number): void {
  const w = Math.max(1, Math.floor(cssW * dpr));
  const h = Math.max(1, Math.floor(cssH * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

function main(): void {
  const app = document.getElementById("app");
  if (!app) return;
  app.textContent = "";

  const canvas = mountCanvas(app, {
    label:
      "The complex potential as a 2D field: drag charges, sources, sinks, and vortices; the field " +
      "lines, equipotentials, streamlines, and domain-colored field update live. Arrow keys pan, +/− zoom.",
    className: "field-view",
  });

  const gl = canvas.render.getContext("webgl2");
  if (!gl) throw new Error("WebGL2 is required for the 2D Electrostatics field renderer.");
  const octx = canvas.overlay.getContext("2d");
  if (!octx) throw new Error("A 2D canvas context is required for the interaction overlay.");

  const renderer = createFieldRenderer(gl);
  const state = initialState();

  let frame = 0;
  const paint = (): void => {
    frame = 0;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.render.getBoundingClientRect();
    const cssW = Math.max(1, Math.floor(rect.width));
    const cssH = Math.max(1, Math.floor(rect.height));

    sizeCanvas(canvas.render, cssW, cssH, dpr);
    gl.viewport(0, 0, canvas.render.width, canvas.render.height);
    renderer.render(fieldOf(state), state.view);

    sizeCanvas(canvas.overlay, cssW, cssH, dpr);
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawOverlay(octx, state, { width: cssW, height: cssH });
  };
  const requestRender = (): void => {
    if (!frame) frame = requestAnimationFrame(paint);
  };

  attachInteraction(canvas.overlay, state, requestRender);
  window.addEventListener("resize", requestRender);
  requestRender();
}

runWithFatalBoundary(main);
