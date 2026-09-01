// apps/2d-electrostatics — an interactive realization of the complex potential W(z) = φ + iψ as a
// field of charges, sources, sinks, vortices, and doublets (the author's "Complex Analysis as
// Electrostatics and Hydrodynamics"). The field is drawn on the GPU (domain-colour of E + the φ/ψ
// contour net) with a 2D overlay of grabbable handles + the flux/circulation probe; the view pans and
// zooms while singularities drag with live recompute. Presets, an Electrostatic ↔ Fluid lens, a
// `#vs=` permalink, and PNG export round out M1.
import "./styles/main.css";
import "@cas/ui/nav.css";
import { runWithFatalBoundary, mountCanvas, mountNavHeader } from "@cas/ui";
import { injectPngText } from "@cas/export";
import { fieldOf, initialState } from "./state.js";
import { createFieldRenderer } from "./render/glView.js";
import { drawOverlay } from "./render/overlay.js";
import { attachInteraction } from "./interaction.js";
import { createControls } from "./ui/controls.js";
import { createParticleLayer } from "./particles.js";
import { encodeState, applyStateFromHash } from "./persist.js";

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
  mountNavHeader(app, { current: "2d-electrostatics" });

  const canvas = mountCanvas(app, {
    label:
      "The complex potential as a 2D field: drag charges, sources, sinks, and vortices; the field " +
      "lines, equipotentials, streamlines, and domain-colored field update live. Arrow keys pan, +/− zoom.",
    className: "field-view",
  });

  // preserveDrawingBuffer lets PNG export read the WebGL canvas back via drawImage.
  const gl = canvas.render.getContext("webgl2", { preserveDrawingBuffer: true });
  if (!gl) throw new Error("WebGL2 is required for the 2D Electrostatics field renderer.");
  const octx = canvas.overlay.getContext("2d");
  if (!octx) throw new Error("A 2D canvas context is required for the interaction overlay.");

  const renderer = createFieldRenderer(gl);
  const state = initialState();
  applyStateFromHash(state, window.location.hash); // reopen a shared permalink

  // The animated tracer-particle layer sits on its own transparent canvas between the GPU field and the
  // interaction overlay; it never intercepts pointer events (the overlay does).
  const particleCanvas = document.createElement("canvas");
  particleCanvas.className = "particle-view";
  particleCanvas.setAttribute("aria-hidden", "true");
  canvas.root.insertBefore(particleCanvas, canvas.overlay);
  const particles = createParticleLayer(particleCanvas, state);

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
    canvas.overlay.style.cursor = state.tool === "probe" ? "crosshair" : "default";
    controls.refresh();
  };

  let persistTimer = 0;
  const schedulePersist = (): void => {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = window.setTimeout(() => {
      history.replaceState(null, "", encodeState(state));
    }, 350);
  };
  const requestRender = (): void => {
    if (!frame) frame = requestAnimationFrame(paint);
    schedulePersist();
  };

  // Composite the field + overlay into a PNG whose tEXt carries this view's permalink — a figure that
  // carries its own recipe (@cas/export).
  const savePng = (): void => {
    paint(); // make sure the drawing buffers are current
    const w = canvas.render.width;
    const h = canvas.render.height;
    if (w < 4 || h < 4) return;
    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    const ctx = off.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(canvas.render, 0, 0);
    ctx.drawImage(canvas.overlay, 0, 0);
    off.toBlob((blob) => {
      if (!blob) return;
      void blob.arrayBuffer().then((buf) => {
        const url = location.origin + location.pathname + encodeState(state);
        const stamped = injectPngText(new Uint8Array(buf), {
          Software: "2D Electrostatics — Complex Analysis Suite",
          "2de:url": url,
        });
        const ab = new ArrayBuffer(stamped.byteLength);
        new Uint8Array(ab).set(stamped);
        const dl = URL.createObjectURL(new Blob([ab], { type: "image/png" }));
        const a = document.createElement("a");
        a.href = dl;
        a.download = "2d-electrostatics.png";
        document.body.append(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(dl), 1000);
      });
    }, "image/png");
  };

  // The animated flow layer runs its own rAF loop while `state.motion` is on.
  let motionRaf = 0;
  const motionTick = (): void => {
    motionRaf = 0;
    if (!state.motion) return;
    particles.frame();
    motionRaf = requestAnimationFrame(motionTick);
  };
  const toggleMotion = (): void => {
    if (state.motion) {
      if (!motionRaf) motionRaf = requestAnimationFrame(motionTick);
    } else {
      if (motionRaf) cancelAnimationFrame(motionRaf);
      motionRaf = 0;
      particles.clear();
    }
  };

  const controls = createControls(app, state, requestRender, {
    onSavePng: savePng,
    onToggleMotion: toggleMotion,
  });
  attachInteraction(canvas.overlay, state, requestRender, () => controls.onSelectionChange());
  window.addEventListener("resize", requestRender);
  requestRender();
}

runWithFatalBoundary(main);
