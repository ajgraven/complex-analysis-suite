// apps/2d-electrostatics — an interactive realization of the complex potential W(z) = φ + iψ as a
// field of charges, sources, sinks, vortices, and doublets (the author's "Complex Analysis as
// Electrostatics and Hydrodynamics"). M0 de-risks the render path: it boots inside the shared @cas/ui
// shell, acquires a WebGL2 context, and domain-colours the analytic field E(z) = W'(z) — hue = field
// direction, lightness = a bounded transfer of |E|. The closed-form field math lives in `./field`
// (node-tested) and is evaluated per-pixel in the shader (`./render/fieldShader`); the adaptive φ/ψ
// contours are the next M0 slice, then the drop-and-drag sandbox + pan/zoom in M1.
import "./styles/main.css";
import { runWithFatalBoundary, mountCanvas } from "@cas/ui";
import { DEMO_FIELD } from "./field.js";
import { createFieldRenderer, type View } from "./render/glView.js";

// A fixed opening view for M0 (interactive pan/zoom arrives in M1).
const INITIAL_VIEW: View = { center: [0, 0], halfSpan: 3 };

function resizeToDisplay(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext): void {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width * dpr));
  const h = Math.max(1, Math.floor(rect.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  gl.viewport(0, 0, canvas.width, canvas.height);
}

function main(): void {
  const app = document.getElementById("app");
  if (!app) return;
  app.textContent = "";

  const canvas = mountCanvas(app, {
    label:
      "The complex potential as a 2D field: charges, sources, sinks, and vortices, shown as field " +
      "lines, equipotentials, streamlines, and a domain-colored field",
    className: "field-view",
  });

  const gl = canvas.render.getContext("webgl2");
  if (!gl) throw new Error("WebGL2 is required for the 2D Electrostatics field renderer.");

  const renderer = createFieldRenderer(gl);
  const draw = (): void => {
    resizeToDisplay(canvas.render, gl);
    renderer.render(DEMO_FIELD, INITIAL_VIEW);
  };
  draw();
  window.addEventListener("resize", draw);
}

runWithFatalBoundary(main);
