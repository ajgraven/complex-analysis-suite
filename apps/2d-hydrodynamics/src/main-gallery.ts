// apps/2d-hydrodynamics — the closed-form transplant gallery (HD-2, polished in HD-3). Flow past a body B
// is flow past the unit disk 𝔻* carried through a closed-form conformal map ψ: 𝔻* → ext(B), shown as two
// linked panes: the disk plane (left) and the body plane (right). The reference flow net (uniform +
// circulation) is built exactly in the ζ-plane by @cas/flow's `flowNet`, and `pushforward` carries every
// streamline / equipotential FORWARD through ψ onto the body — the same map that shapes the body carries
// the flow, so a streamline reads the same colour in both panes. Everything is closed-form, so the
// transplant is exact (=). The bodies are @cas/flow's EXTERIOR_MAP_PRESETS (the second-consumer
// extraction, ADR-0037), minus the Joukowski wing, which has its own thickness/camber/Kutta page. HD-3
// adds `#vs=` permalinks, PNG export, and stagnation-point markers.
import "./styles/panes.css";
import "@cas/ui/nav.css";
import { runWithFatalBoundary, attachCanvasA11y, mountNavHeader } from "@cas/ui";
import {
  flowNet,
  unitCircle,
  pushforward,
  Net2D,
  boundsOf,
  EXTERIOR_MAP_PRESETS,
  type RefFlow,
  type Pt,
  type ExteriorMapPreset,
} from "@cas/flow";
import { encodeGallery, decodeGallery } from "./viewState.js";
import { saveCompositePng } from "./pngExport.js";

// The gallery is the closed-form exterior maps EXCEPT the Joukowski segment — the airfoil page is the
// Joukowski family (with thickness, camber, and the Kutta condition), so it would only duplicate here.
const GALLERY: readonly ExteriorMapPreset[] = EXTERIOR_MAP_PRESETS.filter((p) => p.id !== "joukowski-ext");

const STAGNATION_COLOR = "#ffd24a";

interface GalleryState {
  id: string;
  alphaDeg: number;
  gamma: number;
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

/** The short body noun from a preset name ("Vertical slit  ½(z − 1/z)" → "Vertical slit"). */
const shortName = (p: ExteriorMapPreset): string => p.name.split("  ")[0];

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
 * Reference-flow stagnation points on 𝔻* that sit ON or OUTSIDE the body (|ζ| ≥ 1): the roots of
 * W_ref'(ζ) = 0, i.e. the complex quadratic a·ζ² + b·ζ + c = 0 with a = U·e^{−iα}, b = −iΓ/2π,
 * c = −U·e^{iα}. Their moduli multiply to 1, so for |Γ| ≤ 4πU both lie on |ζ| = 1 (front + rear
 * stagnation); past that one detaches into the flow and its reciprocal (inside the body) is dropped.
 */
function stagnationZetas(flow: RefFlow): Pt[] {
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

function main(): void {
  const app = document.getElementById("app");
  if (!app) return;
  app.textContent = "";

  // Accept a full `#vs=` permalink, or a bare `#<body-id>` (the hub deep-links), or nothing.
  const vs = decodeGallery(window.location.hash);
  const bareId = window.location.hash.replace(/^#/, "");
  const known = (id: string): boolean => GALLERY.some((p) => p.id === id);
  const state: GalleryState =
    vs && known(vs.id)
      ? { id: vs.id, alphaDeg: vs.alphaDeg, gamma: vs.gamma }
      : { id: known(bareId) ? bareId : GALLERY[0].id, alphaDeg: 0, gamma: 0 };

  // ---- toolbar --------------------------------------------------------------
  const bar = el("header", "toolbar");
  const brand = el("div", "brand");
  brand.innerHTML = "<strong>2D Hydrodynamics · Gallery</strong><span>flow past a closed-form body</span>";
  const back = el("a", "pal-btn", "← Overview");
  (back as HTMLAnchorElement).href = "./";

  const controls = el("div", "foil-controls");

  const bodyRow = el("label", "row");
  const bodyHead = el("span", "row-h");
  bodyHead.append(el("span", "row-l", "Body"));
  const bodySel = el("select", "tp-select");
  for (const p of GALLERY) {
    const opt = el("option", undefined, p.name);
    opt.value = p.id;
    if (p.id === state.id) opt.selected = true;
    bodySel.append(opt);
  }
  bodyRow.append(bodyHead, bodySel);

  const sAoA = slider("Angle of attack", -30, 30, 1, state.alphaDeg, "°");
  const sGamma = slider("Circulation Γ", -4, 4, 0.1, state.gamma);
  const copyBtn = el("button", "pal-btn", "Copy link ⧉");
  copyBtn.type = "button";
  const pngBtn = el("button", "pal-btn", "Save PNG");
  pngBtn.type = "button";
  controls.append(bodyRow, sAoA.row, sGamma.row, copyBtn, pngBtn);

  const readout = el("div", "readout tp-readout");
  bar.append(brand, back, controls, readout);

  // ---- two-pane stage -------------------------------------------------------
  const stage = el("div", "foil-stage");
  const makePane = (label: string): { net: Net2D; canvas: HTMLCanvasElement; caption: HTMLElement } => {
    const pane = el("figure", "foil-pane");
    const canvas = el("canvas", "foil-canvas");
    attachCanvasA11y(canvas, { role: "img", label });
    const caption = el("figcaption");
    pane.append(canvas, caption);
    stage.append(pane);
    return { net: new Net2D(canvas), canvas, caption };
  };
  const disk = makePane("The disk plane: the reference flow that is carried onto the body");
  const body = makePane("The body plane: the same flow carried through the conformal map onto the body");

  mountNavHeader(app, { current: "2d-hydrodynamics" });
  app.append(bar, stage);

  const presetOf = (id: string): ExteriorMapPreset => GALLERY.find((p) => p.id === id) ?? GALLERY[0];

  let frame = 0;
  const paint = (): void => {
    frame = 0;
    const preset = presetOf(state.id);
    const flow: RefFlow = { U: 1, alpha: (state.alphaDeg * Math.PI) / 180, gamma: state.gamma };
    const net = flowNet(flow, { streamlines: 9, equipotentials: 9, span: 6, samples: 220 });
    const stag = stagnationZetas(flow);
    const psi = (z: Pt): Pt => preset.psi(z);

    if (disk.net.resize()) {
      disk.net.fitBounds({ minx: -3.6, maxx: 3.6, miny: -3.6, maxy: 3.6 });
      disk.net.clear();
      disk.net.drawLines(net.equipotentials, 0.9);
      disk.net.drawLines(net.streamlines, 1.3);
      disk.net.fillBody(unitCircle(180));
      for (const z of stag) disk.net.drawDot(z, STAGNATION_COLOR, 4.5);
    }

    if (body.net.resize()) {
      body.net.clear();
      const streams = pushforward(net.streamlines, psi);
      const equis = pushforward(net.equipotentials, psi);
      const bdry = unitCircle(400).map(psi);
      const bb = boundsOf([{ color: "", pts: bdry }]);
      if (bb) {
        const pad = 0.5 * Math.max(bb.maxx - bb.minx, bb.maxy - bb.miny, 0.5);
        body.net.fitBounds({ minx: bb.minx - pad, maxx: bb.maxx + pad, miny: bb.miny - pad, maxy: bb.maxy + pad }, 1.05);
      }
      body.net.drawLines(equis, 0.9);
      body.net.drawLines(streams, 1.3);
      body.net.fillBody(bdry);
      for (const z of stag) body.net.drawDot(psi(z), STAGNATION_COLOR, 4.5);
    }

    disk.caption.innerHTML = "<b>Disk plane</b> — flow past the unit circle |ζ| = 1 (the reference flow)";
    body.caption.innerHTML = `<b>Body plane</b> — the same flow, carried by ψ: 𝔻* → ext(K) onto the ${shortName(preset).toLowerCase()}`;
    const stagNote = stag.length === 2 ? " · 2 surface stagnation points" : stag.length === 1 ? " · 1 detached stagnation point" : "";
    readout.innerHTML =
      `ψ = <b>${preset.expr}</b><br>` +
      `<span class="tp-exact">= exact closed-form transplant</span>${stagNote}`;
  };
  const requestPaint = (): void => {
    if (!frame) frame = requestAnimationFrame(paint);
  };
  const permalink = (): string => location.origin + location.pathname + encodeGallery(state);
  const syncHash = (): void => history.replaceState(null, "", encodeGallery(state));

  bodySel.addEventListener("change", () => {
    state.id = bodySel.value;
    syncHash();
    requestPaint();
  });
  sAoA.input.addEventListener("input", () => {
    state.alphaDeg = Number(sAoA.input.value);
    sAoA.val.textContent = `${state.alphaDeg}°`;
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
    saveCompositePng([disk.canvas, body.canvas], "2d-hydrodynamics-gallery.png", permalink());
  });
  window.addEventListener("resize", requestPaint);
  requestPaint();
}

runWithFatalBoundary(main);
