// apps/2d-electrostatics — an interactive realization of the complex potential W(z) = φ + iψ as a
// field of charges, sources, sinks, vortices, and doublets (the author's "Complex Analysis as
// Electrostatics and Hydrodynamics"). M0 (this slice) de-risks the render path: it boots inside the
// shared @cas/ui shell, acquires a WebGL2 context, and proves the accessible-canvas mount. The
// closed-form field math lives in `./field` (node-tested); the WebGL domain-coloring of E and the
// adaptive φ/ψ contours land in the next M0 slices, then the drop-and-drag sandbox in M1.
import "./styles/main.css";
import { runWithFatalBoundary, mountCanvas } from "@cas/ui";

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

  const draw = (): void => {
    resizeToDisplay(canvas.render, gl);
    gl.clearColor(0.06, 0.07, 0.09, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  };
  draw();
  window.addEventListener("resize", draw);
}

runWithFatalBoundary(main);
