// apps/2d-hydrodynamics — the one page (ADR-0038). Ideal (inviscid, irrotational) flow past a body B,
// shown as two linked, domain-coloured panes: the disk plane (left) and the body plane (right). EVERY
// body — the closed-form gallery AND the Joukowski / Kármán–Trefftz airfoil — is one forward conformal
// map ψ: 𝔻* → ext(B) driven by the SAME reference flow past the unit disk; a Body selector switches
// between them.
//
// The render is one idiom (HD-6.3): the LEFT pane is a per-pixel fragment shader over the closed-form
// reference flow W_ref past the unit disk (diskView.ts); the RIGHT pane is a forward-mapped coloured mesh
// — the CPU warps a tessellation of the disk exterior through ψ (bodyMesh.ts) and the GPU colours it by
// the exact physical velocity dW/dz = W_ref'/ψ' (bodyMeshView.ts), through the SAME colormap, so a
// velocity reads the same colour and the streamlines match across the two planes. No per-pixel inverse
// ψ⁻¹ is needed (the cusped bodies have none). A thin 2D overlay (overlay2d.ts) draws the obstacle
// outline + the stagnation markers on each pane; the airfoil folds in as ψ(w) = J(ζ₀ + R·w), so its rear
// stagnation lands on the trailing edge — the Kutta condition made visible.
import "./styles/panes.css";
import "@cas/ui/nav.css";
import { runWithFatalBoundary, attachCanvasA11y, mountNavHeader } from "@cas/ui";
import { unitCircle, boundsOf, EXTERIOR_MAP_PRESETS, type RefFlow, type Pt } from "@cas/flow";
import { BODIES, type BodyEntry } from "./bodies.js";
import { airfoilBody, galleryBody, physicalVelocity, type ResolvedBody } from "./bodyModel.js";
import { kuttaCirculation, cylinderRadius, nFromTrailingEdgeAngle, type AirfoilParams } from "./airfoil.js";
import { createDiskRenderer, type FieldView } from "./render/diskView.js";
import { createBodyMeshRenderer } from "./render/bodyMeshView.js";
import { buildBodyMesh } from "./render/bodyMesh.js";
import { Overlay2D } from "./render/overlay2d.js";
import { encodeHydro, decodeHydro, AIRFOIL_ID, type HydroVS } from "./viewState.js";
import { saveCompositePng } from "./pngExport.js";

const STAGNATION_COLOR = "#ffd24a";
const DISK_HALFSPAN = 3.6;
const DISK_VIEW: FieldView = { center: [0, 0], halfSpan: DISK_HALFSPAN };

interface HydroState {
  bodyId: string;
  alphaDeg: number; // shared angle of attack
  // airfoil-only
  thickness: number;
  camber: number;
  teAngleDeg: number;
  kutta: boolean;
  // closed-form-only
  gamma: number; // free circulation Γ
}

const DEFAULTS: HydroState = {
  bodyId: AIRFOIL_ID,
  alphaDeg: 8,
  thickness: 0.12,
  camber: 0.06,
  teAngleDeg: 10,
  kutta: true,
  gamma: 0,
};

const rad = (deg: number): number => (deg * Math.PI) / 180;
const knownBody = (id: string): boolean => BODIES.some((b) => b.id === id);
const bodyEntry = (id: string): BodyEntry => BODIES.find((b) => b.id === id) ?? BODIES[0];

/** The airfoil params for the current state (Kutta circulation imposed when the toggle is on). */
function airfoilParamsOf(s: HydroState): AirfoilParams {
  const base: AirfoilParams = {
    U: 1,
    alpha: rad(s.alphaDeg),
    b: 1,
    center: [-s.thickness, s.camber],
    circulation: 0,
    n: nFromTrailingEdgeAngle(rad(s.teAngleDeg)),
  };
  return { ...base, circulation: s.kutta ? kuttaCirculation(base) : 0 };
}

/** Resolve the app state to a unified body ψ: 𝔻* → ext(B) + its reference flow (airfoil or gallery). */
function resolveBody(s: HydroState): ResolvedBody {
  if (s.bodyId === AIRFOIL_ID) return airfoilBody(airfoilParamsOf(s));
  const preset = EXTERIOR_MAP_PRESETS.find((p) => p.id === s.bodyId) ?? EXTERIOR_MAP_PRESETS[0];
  return galleryBody(preset, rad(s.alphaDeg), s.gamma);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

interface Slider {
  row: HTMLElement;
  input: HTMLInputElement;
  val: HTMLElement;
}
function slider(label: string, min: number, max: number, step: number, value: number, unit = ""): Slider {
  const row = el("label", "row");
  const head = el("span", "row-h");
  const val = el("span", "row-v", `${value}${unit}`);
  head.append(el("span", "row-l", label), val);
  const input = el("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  row.append(head, input);
  return { row, input, val };
}

// --- minimal complex arithmetic for the stagnation roots ---------------------------------------------
const cmul = (p: Pt, q: Pt): Pt => [p[0] * q[0] - p[1] * q[1], p[0] * q[1] + p[1] * q[0]];
const cdiv = (p: Pt, q: Pt): Pt => {
  const d = q[0] * q[0] + q[1] * q[1];
  return [(p[0] * q[0] + p[1] * q[1]) / d, (p[1] * q[0] - p[0] * q[1]) / d];
};
const csqrt = (p: Pt): Pt => {
  const r = Math.hypot(p[0], p[1]);
  const re = Math.sqrt(Math.max((r + p[0]) / 2, 0));
  const im = Math.sqrt(Math.max((r - p[0]) / 2, 0));
  return [re, p[1] < 0 ? -im : im];
};

/**
 * Reference-flow stagnation points in the disk plane that sit ON or OUTSIDE the unit disk (|w| ≥ 1): the
 * roots of W_ref'(w) = 0, i.e. a·w² + b·w + c = 0 with a = U·e^{−iα}, b = −iΓ/2π, c = −U·e^{iα}. Their
 * moduli multiply to 1, so for |Γ| below the critical value both lie on |w| = 1 (front + rear
 * stagnation); past that one detaches into the flow and its reciprocal (inside the body) is dropped.
 * Carried onto the body by ψ. For the airfoil (U' = U·R), the Kutta circulation places the rear root at
 * w = (b − ζ₀)/R on |w| = 1, whose image ψ(w) is the trailing edge — the Kutta condition made visible.
 */
function stagnationDiskPoints(flow: RefFlow): Pt[] {
  const { U, alpha, gamma } = flow;
  const a: Pt = [U * Math.cos(alpha), -U * Math.sin(alpha)];
  const b: Pt = [0, -gamma / (2 * Math.PI)];
  const c: Pt = [-U * Math.cos(alpha), -U * Math.sin(alpha)];
  const fourAC = cmul([4, 0], cmul(a, c));
  const disc = csqrt([b[0] * b[0] - b[1] * b[1] - fourAC[0], 2 * b[0] * b[1] - fourAC[1]]);
  const negB: Pt = [-b[0], -b[1]];
  const twoA: Pt = [2 * a[0], 2 * a[1]];
  const roots = [cdiv([negB[0] + disc[0], negB[1] + disc[1]], twoA), cdiv([negB[0] - disc[0], negB[1] - disc[1]], twoA)];
  return roots.filter((z) => Number.isFinite(z[0]) && Number.isFinite(z[1]) && Math.hypot(z[0], z[1]) >= 1 - 1e-6);
}

/** Match a GL canvas' drawing buffer to its CSS box × DPR and set the viewport. */
function sizeGl(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const r = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.floor(r.width * dpr));
  const h = Math.max(1, Math.floor(r.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.043, 0.059, 0.102, 1); // #0b0f1a — the body interior shows through where unmeshed
  gl.clear(gl.COLOR_BUFFER_BIT);
}

function main(): void {
  const app = document.getElementById("app");
  if (!app) return;
  app.textContent = "";

  // Initial state: an incoming `#vs=` permalink (unified, or a legacy airfoil / gallery / bare-#id link —
  // decodeHydro accepts them all), else the airfoil defaults. An unknown body id falls back to the airfoil.
  const incoming = decodeHydro(window.location.hash);
  const state: HydroState = incoming
    ? { ...DEFAULTS, ...incoming, bodyId: knownBody(incoming.bodyId) ? incoming.bodyId : DEFAULTS.bodyId }
    : { ...DEFAULTS };

  // ---- toolbar --------------------------------------------------------------
  const bar = el("header", "toolbar");
  const brand = el("div", "brand");
  brand.innerHTML = "<strong>2D Hydrodynamics</strong><span>ideal flow past a body</span>";

  const controls = el("div", "foil-controls");

  const bodyRow = el("label", "row");
  const bodyHead = el("span", "row-h");
  bodyHead.append(el("span", "row-l", "Body"));
  const bodySel = el("select", "tp-select");
  for (const b of BODIES) {
    const opt = el("option", undefined, b.label);
    opt.value = b.id;
    if (b.id === state.bodyId) opt.selected = true;
    bodySel.append(opt);
  }
  bodyRow.append(bodyHead, bodySel);

  // Shared: angle of attack. Range ±30° covers both legacy ranges (airfoil ±20, gallery ±30).
  const sAoA = slider("Angle of attack", -30, 30, 0.5, state.alphaDeg, "°");

  // Airfoil-only controls.
  const sThick = slider("Thickness", 0, 0.35, 0.005, state.thickness);
  const sCamber = slider("Camber", 0, 0.2, 0.005, state.camber);
  const sTE = slider("Trailing-edge angle", 0, 30, 0.5, state.teAngleDeg, "°");
  const kutta = el("label", "check");
  const kBox = el("input");
  kBox.type = "checkbox";
  kBox.checked = state.kutta;
  kutta.append(kBox, el("span", undefined, "Kutta condition"));
  const airfoilGroup = el("div", "ctl-group");
  airfoilGroup.append(sThick.row, sCamber.row, sTE.row, kutta);

  // Closed-form-only control: free circulation.
  const sGamma = slider("Circulation Γ", -4, 4, 0.1, state.gamma);
  const galleryGroup = el("div", "ctl-group");
  galleryGroup.append(sGamma.row);

  const copyBtn = el("button", "pal-btn", "Copy link ⧉");
  copyBtn.type = "button";
  const pngBtn = el("button", "pal-btn", "Save PNG");
  pngBtn.type = "button";
  controls.append(bodyRow, sAoA.row, airfoilGroup, galleryGroup, copyBtn, pngBtn);

  // Clamp the (possibly permalinked) values back through the sliders so an out-of-range hand-crafted link
  // agrees with the thumb, the label, and the rendered flow.
  state.alphaDeg = Number(sAoA.input.value);
  sAoA.val.textContent = `${state.alphaDeg}°`;
  state.thickness = Number(sThick.input.value);
  sThick.val.textContent = state.thickness.toFixed(3);
  state.camber = Number(sCamber.input.value);
  sCamber.val.textContent = state.camber.toFixed(3);
  state.teAngleDeg = Number(sTE.input.value);
  sTE.val.textContent = `${state.teAngleDeg}°`;
  state.gamma = Number(sGamma.input.value);
  sGamma.val.textContent = state.gamma.toFixed(1);

  const readout = el("div", "readout tp-readout");
  bar.append(brand, controls, readout);

  // ---- two-pane stage: each pane = a WebGL field canvas + a 2D overlay canvas -----------------------
  const stage = el("main", "foil-stage");
  const makePane = (label: string): { gl: HTMLCanvasElement; overlay: HTMLCanvasElement; caption: HTMLElement } => {
    const pane = el("figure", "foil-pane");
    const gl = el("canvas", "foil-gl");
    attachCanvasA11y(gl, { role: "img", label });
    const overlay = el("canvas", "foil-overlay");
    overlay.setAttribute("aria-hidden", "true");
    const caption = el("figcaption");
    pane.append(gl, overlay, caption);
    stage.append(pane);
    return { gl, overlay, caption };
  };
  const disk = makePane("The disk plane: the reference flow that is carried onto the body");
  const body = makePane("The body plane: the same flow carried through the conformal map onto the body");

  mountNavHeader(app, { current: "2d-hydrodynamics" });
  app.append(bar, stage);

  // preserveDrawingBuffer so "Save PNG" can read the rendered pixels back.
  const diskGl = disk.gl.getContext("webgl2", { preserveDrawingBuffer: true });
  const bodyGl = body.gl.getContext("webgl2", { preserveDrawingBuffer: true });
  if (!diskGl || !bodyGl) throw new Error("WebGL2 is required for the 2D Hydrodynamics field view.");
  const diskRenderer = createDiskRenderer(diskGl);
  const bodyRenderer = createBodyMeshRenderer(bodyGl);
  const diskOverlay = new Overlay2D(disk.overlay);
  const bodyOverlay = new Overlay2D(body.overlay);

  /** Show only the controls that apply to the selected body. */
  const syncControlsVisibility = (): void => {
    const isAirfoil = state.bodyId === AIRFOIL_ID;
    airfoilGroup.hidden = !isAirfoil;
    galleryGroup.hidden = isAirfoil;
  };
  syncControlsVisibility();

  let frame = 0;
  const paint = (): void => {
    frame = 0;
    const isAirfoil = state.bodyId === AIRFOIL_ID;
    const resolved = resolveBody(state);
    const flow = resolved.flow;
    const stag = stagnationDiskPoints(flow);
    // Colour value gauge = far-field speed (so the far field sits mid-brightness, the speed-up reads
    // brighter). Streamline spacing scales with U so both panes show the same ψ-levels (matched lines).
    const diskModScale = Math.max(0.25, flow.U);
    const farBody = physicalVelocity(resolved, [50, 0]);
    const bodyModScale = Math.max(0.25, Math.hypot(farBody[0], farBody[1]));
    const streamSpacing = 0.55 * Math.max(0.3, flow.U);

    // Disk pane — per-pixel reference flow past |w| = 1.
    sizeGl(disk.gl, diskGl);
    diskRenderer.render(flow, DISK_VIEW, diskModScale, streamSpacing);
    if (diskOverlay.resize()) {
      diskOverlay.setView(0, 0, DISK_HALFSPAN);
      diskOverlay.clear();
      diskOverlay.fillBody(unitCircle(200));
      for (const z of stag) diskOverlay.drawDot(z, STAGNATION_COLOR, 5);
    }

    // Body pane — forward-mapped coloured mesh, fit to ψ(∂𝔻).
    const mesh = buildBodyMesh(resolved);
    sizeGl(body.gl, bodyGl);
    let bodyView: FieldView = DISK_VIEW;
    const bb = boundsOf([{ color: "", pts: mesh.outline }]);
    if (bb) {
      const cx = (bb.minx + bb.maxx) / 2;
      const cy = (bb.miny + bb.maxy) / 2;
      const aspect = body.gl.height > 0 ? body.gl.width / body.gl.height : 1;
      const needY = (bb.maxy - bb.miny) / 2;
      const needX = (bb.maxx - bb.minx) / (2 * Math.max(aspect, 1e-6));
      const halfSpan = Math.max(needY, needX, 0.5) * 1.3;
      bodyView = { center: [cx, cy], halfSpan };
    }
    bodyRenderer.render(mesh, bodyView, bodyModScale, streamSpacing);
    if (bodyOverlay.resize()) {
      bodyOverlay.setView(bodyView.center[0], bodyView.center[1], bodyView.halfSpan);
      bodyOverlay.clear();
      bodyOverlay.fillBody(mesh.outline);
      for (const z of stag) bodyOverlay.drawDot(resolved.psi(z), STAGNATION_COLOR, 5);
    }

    const entry = bodyEntry(state.bodyId);
    disk.caption.innerHTML = "<b>Disk plane</b> — flow past the unit circle |w| = 1 (the reference flow)";
    body.caption.innerHTML = `<b>Body plane</b> — the same flow, carried by ψ: 𝔻* → ext(B) onto ${entry.body}`;

    const stagNote = stag.length === 2 ? " · 2 surface stagnation points" : stag.length === 1 ? " · 1 detached stagnation point" : "";
    if (isAirfoil) {
      const params = airfoilParamsOf(state);
      const R = cylinderRadius(params);
      const L = resolved.lift; // ρ = 1; Kutta–Joukowski L = −ρUΓ
      readout.innerHTML =
        `ψ = <b>${entry.psi}</b> · Γ = ${params.circulation.toFixed(3)} · R = ${R.toFixed(3)}<br>` +
        `lift L = −ρUΓ = <b>${L.toFixed(3)}</b> ${state.kutta ? "(Kutta)" : "(Γ = 0)"}${stagNote}`;
    } else {
      readout.innerHTML =
        `ψ = <b>${entry.psi}</b><br>` +
        `<span class="tp-exact">= exact closed-form transplant</span>${stagNote}`;
    }
  };
  const requestPaint = (): void => {
    if (!frame) frame = requestAnimationFrame(paint);
  };
  const toVS = (): HydroVS => ({
    bodyId: state.bodyId,
    alphaDeg: state.alphaDeg,
    thickness: state.thickness,
    camber: state.camber,
    teAngleDeg: state.teAngleDeg,
    kutta: state.kutta,
    gamma: state.gamma,
  });
  const permalink = (): string => location.origin + location.pathname + encodeHydro(toVS());
  const syncHash = (): void => history.replaceState(null, "", encodeHydro(toVS()));

  bodySel.addEventListener("change", () => {
    state.bodyId = bodySel.value;
    syncControlsVisibility();
    syncHash();
    requestPaint();
  });
  sAoA.input.addEventListener("input", () => {
    state.alphaDeg = Number(sAoA.input.value);
    sAoA.val.textContent = `${state.alphaDeg}°`;
    syncHash();
    requestPaint();
  });
  sThick.input.addEventListener("input", () => {
    state.thickness = Number(sThick.input.value);
    sThick.val.textContent = state.thickness.toFixed(3);
    syncHash();
    requestPaint();
  });
  sCamber.input.addEventListener("input", () => {
    state.camber = Number(sCamber.input.value);
    sCamber.val.textContent = state.camber.toFixed(3);
    syncHash();
    requestPaint();
  });
  sTE.input.addEventListener("input", () => {
    state.teAngleDeg = Number(sTE.input.value);
    sTE.val.textContent = `${state.teAngleDeg}°`;
    syncHash();
    requestPaint();
  });
  kBox.addEventListener("change", () => {
    state.kutta = kBox.checked;
    syncHash();
    requestPaint();
  });
  sGamma.input.addEventListener("input", () => {
    state.gamma = Number(sGamma.input.value);
    sGamma.val.textContent = state.gamma.toFixed(1);
    syncHash();
    requestPaint();
  });
  copyBtn.addEventListener("click", () => {
    void navigator.clipboard?.writeText(permalink()).then(
      () => {
        copyBtn.textContent = "Copied ✓";
        window.setTimeout(() => (copyBtn.textContent = "Copy link ⧉"), 1400);
      },
      () => {
        copyBtn.textContent = "Copy failed";
        window.setTimeout(() => (copyBtn.textContent = "Copy link ⧉"), 1400);
      },
    );
  });
  pngBtn.addEventListener("click", () => {
    paint(); // render the current view synchronously, then read the panes back
    saveCompositePng([[disk.gl, disk.overlay], [body.gl, body.overlay]], "2d-hydrodynamics.png", permalink());
  });
  window.addEventListener("resize", requestPaint);
  requestPaint();
}

runWithFatalBoundary(main);
