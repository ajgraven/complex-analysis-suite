// apps/2d-electrostatics — the polygon transplant (M2.4). Flow past OR inside a polygon K is flow past
// OR inside the unit disk carried through a Schwarz–Christoffel map (@cas/conformal), shown as two linked
// panes: the disk plane (left) and the polygon plane (right).
//
//  • "Flow past K" (exterior): flow past the unit disk, carried by the EXTERIOR map Ψ: 𝔻* → ext(K). The
//    reference flow net is built exactly in the ζ-plane (transplant.ts) and pushed FORWARD through Ψ.
//  • "Flow inside K" (interior): a source→sink pair on the boundary drives flow INSIDE the unit disk
//    (∂𝔻 stays a streamline — impermeable walls), carried by the INTERIOR map f: 𝔻 → K.
//
// Either way each streamline keeps a colour key, so the same streamline reads the same colour in both
// panes: the map visibly carries the flow. Presets or an imported polygon choose K; sliders reshape the
// flow. Honest `≈`/`=` labels + converged/degraded/residual. The app is a producer AND consumer of the
// `@cas/interchange` `form:"conformal"` map (ADR-0034): import a `#s=` polygon, or "Copy link" to export.
import "./styles/main.css";
import { runWithFatalBoundary, attachCanvasA11y } from "@cas/ui";
import {
  flowNet,
  unitCircle,
  pushforward,
  inletPorts,
  sourceSinkNet,
  type RefFlow,
  type NetCurve,
  type Pt,
} from "./transplant.js";
import { fitPolygonFlow, fitPolygonInterior } from "./polygonMap.js";
import { POLYGON_PRESETS, DEFAULT_PRESET } from "./transplantPresets.js";
import { Net2D, boundsOf } from "./render/net2d.js";
import { conformalPolygonFromLink, buildConformalLink, type ConformalFit } from "./importConformalMap.js";

const CUSTOM_ID = "__imported__";
type Mode = "exterior" | "interior";
const SOURCE_COLOR = "#63d6a4";
const SINK_COLOR = "#ef6a6a";

interface TpState {
  presetId: string;
  alphaDeg: number;
  gamma: number;
  mode: Mode;
  /** A polygon imported from a `#s=` conformal link (overrides the preset when set). */
  custom: Pt[] | null;
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
  label: HTMLElement;
}
function slider(label: string, min: number, max: number, step: number, value: number, unit = ""): Slider {
  const row = el("label", "row");
  const head = el("span", "row-h");
  const val = el("span", "row-v", `${value}${unit}`);
  const labelEl = el("span", "row-l", label);
  head.append(labelEl, val);
  const input = el("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  row.append(head, input);
  return { row, input, val, label: labelEl };
}

/** A hue key for corner k of n — the same key colours a prevertex (ζ-pane) and its image (K-pane). */
function cornerColor(k: number, n: number): string {
  return `hsl(${((k / Math.max(1, n)) * 320).toFixed(0)}, 85%, 66%)`;
}

function main(): void {
  const app = document.getElementById("app");
  if (!app) return;
  app.textContent = "";

  const state: TpState = { presetId: DEFAULT_PRESET, alphaDeg: 0, gamma: 0, mode: "exterior", custom: null };

  // An incoming `#s=` conformal link (e.g. a polygon handed off from the Riemann-Map studio) sets the
  // imported polygon; we re-fit our own flow through it.
  const incoming = conformalPolygonFromLink(window.location.hash);
  if (incoming) {
    state.custom = incoming.corners;
    state.presetId = CUSTOM_ID;
  }

  // ---- toolbar --------------------------------------------------------------
  const bar = el("header", "toolbar");
  const brand = el("div", "brand");
  brand.innerHTML = "<strong>2D Electrostatics · Polygon</strong><span>flow past / inside a polygon — Schwarz–Christoffel transplant</span>";
  const back = el("a", "pal-btn", "← Field sandbox");
  (back as HTMLAnchorElement).href = "./";
  const foilLink = el("a", "pal-btn", "Airfoil →");
  (foilLink as HTMLAnchorElement).href = "./airfoil.html";

  const controls = el("div", "foil-controls");

  // Interior/exterior mode toggle (a segmented control, like the sandbox's lens toggle).
  const modeSeg = el("div", "modeseg");
  const btnExt = el("button", "seg-btn", "Flow past K");
  const btnInt = el("button", "seg-btn", "Flow inside K");
  btnExt.type = "button";
  btnInt.type = "button";
  modeSeg.append(btnExt, btnInt);

  const presetRow = el("label", "row");
  const presetHead = el("span", "row-h");
  presetHead.append(el("span", "row-l", "Polygon K"));
  const presetSel = el("select", "tp-select");
  if (state.custom) {
    const opt = el("option", undefined, "Imported polygon");
    opt.value = CUSTOM_ID;
    opt.selected = true;
    presetSel.append(opt);
  }
  for (const p of POLYGON_PRESETS) {
    const opt = el("option", undefined, p.label);
    opt.value = p.id;
    if (p.id === state.presetId) opt.selected = true;
    presetSel.append(opt);
  }
  presetRow.append(presetHead, presetSel);
  const sAoA = slider("Angle of attack", -30, 30, 1, state.alphaDeg, "°");
  const sGamma = slider("Circulation Γ", -4, 4, 0.1, state.gamma);
  const copyBtn = el("button", "pal-btn", "Copy link ⧉");
  controls.append(modeSeg, presetRow, sAoA.row, sGamma.row, copyBtn);

  const readout = el("div", "readout tp-readout");
  bar.append(brand, back, foilLink, controls, readout);

  // ---- two-pane stage -------------------------------------------------------
  const stage = el("div", "foil-stage");
  const makePane = (label: string): { net: Net2D; caption: HTMLElement } => {
    const pane = el("figure", "foil-pane");
    const canvas = el("canvas", "foil-canvas");
    attachCanvasA11y(canvas, { role: "img", label });
    const caption = el("figcaption");
    pane.append(canvas, caption);
    stage.append(pane);
    return { net: new Net2D(canvas), caption };
  };
  const disk = makePane("The disk plane: the reference flow that is carried onto the polygon");
  const poly = makePane("The polygon plane: the same flow carried through the Schwarz–Christoffel map onto the polygon");

  app.append(bar, stage);

  const presetOf = (id: string): (typeof POLYGON_PRESETS)[number] =>
    POLYGON_PRESETS.find((p) => p.id === id) ?? POLYGON_PRESETS[0];

  // Reflect the mode in the toggle, slider labels/visibility, and pane captions.
  const syncModeUi = (): void => {
    const interior = state.mode === "interior";
    btnExt.setAttribute("aria-pressed", String(!interior));
    btnInt.setAttribute("aria-pressed", String(interior));
    sAoA.label.textContent = interior ? "Inlet direction" : "Angle of attack";
    sGamma.row.style.display = interior ? "none" : ""; // Γ (circulation) is exterior-only
    disk.caption.innerHTML = interior
      ? "<b>Disk plane</b> — a source→sink pair inside the unit circle |ζ| = 1 (the reference flow)"
      : "<b>Disk plane</b> — flow past the unit circle |ζ| = 1 (the reference flow)";
    poly.caption.innerHTML = interior
      ? "<b>Polygon plane</b> — the same flow, carried by f: 𝔻 → K into the polygon"
      : "<b>Polygon plane</b> — the same flow, carried by Ψ: 𝔻* → ext(K) onto the polygon";
  };

  let frame = 0;
  let lastFit: ConformalFit | null = null;
  let lastCorners: Pt[] = [];

  const paintExterior = (corners: Pt[]): void => {
    const flow: RefFlow = { U: 1, alpha: (state.alphaDeg * Math.PI) / 180, gamma: state.gamma };
    const net = flowNet(flow, { streamlines: 9, equipotentials: 9, span: 6, samples: 220 });

    if (disk.net.resize()) {
      disk.net.fitBounds({ minx: -3.6, maxx: 3.6, miny: -3.6, maxy: 3.6 });
      disk.net.clear();
      disk.net.drawLines(net.equipotentials, 0.9);
      disk.net.drawLines(net.streamlines, 1.3);
      disk.net.fillBody(unitCircle(180));
    }

    let map: ReturnType<typeof fitPolygonFlow> | null = null;
    try {
      map = fitPolygonFlow(corners);
    } catch {
      map = null;
    }
    if (poly.net.resize()) {
      poly.net.clear();
      if (map) {
        const m = map;
        const streams = pushforward(net.streamlines, (z) => m.evalPsi(z));
        const equis = pushforward(net.equipotentials, (z) => m.evalPsi(z));
        const bdry = m.boundary(400);
        const bb = boundsOf([{ color: "", pts: bdry }]);
        if (bb) {
          const pad = 1.4 * Math.max(bb.maxx - bb.minx, bb.maxy - bb.miny);
          poly.net.fitBounds({ minx: bb.minx - pad, maxx: bb.maxx + pad, miny: bb.miny - pad, maxy: bb.maxy + pad }, 1.02);
        }
        poly.net.drawLines(equis, 0.9);
        poly.net.drawLines(streams, 1.3);
        poly.net.fillBody(bdry);
        drawCornerDots(m.cornerImages, m.cornerPreimages, corners.length);
      }
    }
    if (map) {
      lastFit = { engine: "sc-exterior", angles: map.angles, prevertices: map.cornerPreimages, capacity: map.capacity, converged: map.converged, degraded: map.degraded, residual: map.residual };
      const tag = map.converged ? (map.degraded ? "converged · degraded" : "converged") : "not converged";
      readout.innerHTML =
        `capacity cap(K) = <b>${map.capacity.toFixed(4)}</b><br>` +
        `exterior SC fit: ${tag} · residual ≈ ${map.residual.toExponential(1)}<br>` +
        `<span class="tp-approx">≈ flow net: Ψ is a ${map.laurentTerms}-term Laurent series</span>`;
    } else {
      lastFit = null;
      readout.innerHTML = `<span class="tp-warn">⚠ the exterior SC fit failed for this polygon</span>`;
    }
  };

  const paintInterior = (corners: Pt[]): void => {
    const { a, b } = inletPorts((state.alphaDeg * Math.PI) / 180);
    const net = sourceSinkNet(a, b, { streamlines: 15, equipotentials: 6, samples: 220 });

    if (disk.net.resize()) {
      disk.net.fitBounds({ minx: -1.15, maxx: 1.15, miny: -1.15, maxy: 1.15 });
      disk.net.clear();
      disk.net.drawLines(net.equipotentials, 0.9);
      disk.net.drawLines(net.streamlines, 1.3);
      disk.net.strokeBody(unitCircle(180));
      disk.net.drawDot(a, SOURCE_COLOR, 5);
      disk.net.drawDot(b, SINK_COLOR, 5);
    }

    let map: ReturnType<typeof fitPolygonInterior> | null = null;
    try {
      map = fitPolygonInterior(corners);
    } catch {
      map = null;
    }
    if (poly.net.resize()) {
      poly.net.clear();
      if (map) {
        const m = map;
        const streams: NetCurve[] = net.streamlines.map((c) => ({ color: c.color, pts: m.forwardMany(c.pts) }));
        const equis: NetCurve[] = net.equipotentials.map((c) => ({ color: c.color, pts: m.forwardMany(c.pts) }));
        const bdry = m.boundary();
        const bb = boundsOf([{ color: "", pts: bdry }]);
        if (bb) {
          const pad = 0.18 * Math.max(bb.maxx - bb.minx, bb.maxy - bb.miny);
          poly.net.fitBounds({ minx: bb.minx - pad, maxx: bb.maxx + pad, miny: bb.miny - pad, maxy: bb.maxy + pad }, 1.05);
        }
        poly.net.drawLines(equis, 0.9);
        poly.net.drawLines(streams, 1.3);
        poly.net.strokeBody(bdry);
        poly.net.drawDot(m.forward(a), SOURCE_COLOR, 5);
        poly.net.drawDot(m.forward(b), SINK_COLOR, 5);
        drawCornerDots(m.cornerImages, m.cornerPreimages, corners.length);
      }
    }
    if (map) {
      lastFit = { engine: "sc-interior", angles: map.angles, prevertices: map.cornerPreimages, converged: map.converged, degraded: map.degraded, residual: map.residual };
      const tag = map.converged ? (map.degraded ? "converged · degraded" : "converged") : "not converged";
      readout.innerHTML =
        `interior map f: 𝔻 → K<br>` +
        `SC fit: ${tag} · residual ≈ ${map.residual.toExponential(1)}<br>` +
        `<span class="tp-approx">source→sink flow, exact streamlines carried by f (=)</span>`;
    } else {
      lastFit = null;
      readout.innerHTML = `<span class="tp-warn">⚠ the interior SC fit failed for this polygon</span>`;
    }
  };

  /** Colour-matched corner ↔ prevertex markers (the SC prevertex-linking idiom), on both panes. */
  const drawCornerDots = (images: readonly Pt[], preimages: readonly Pt[], n: number): void => {
    for (let k = 0; k < n; k++) {
      const col = cornerColor(k, n);
      if (images[k]) poly.net.drawDot(images[k], col);
      if (preimages[k]) disk.net.drawDot(preimages[k], col);
    }
  };

  const paint = (): void => {
    frame = 0;
    const corners = state.custom ?? presetOf(state.presetId).corners;
    lastCorners = corners.slice();
    if (state.mode === "interior") paintInterior(corners);
    else paintExterior(corners);
  };
  const requestPaint = (): void => {
    if (!frame) frame = requestAnimationFrame(paint);
  };

  const setMode = (mode: Mode): void => {
    if (state.mode === mode) return;
    state.mode = mode;
    syncModeUi();
    requestPaint();
  };
  btnExt.addEventListener("click", () => setMode("exterior"));
  btnInt.addEventListener("click", () => setMode("interior"));

  presetSel.addEventListener("change", () => {
    // Choosing a named preset drops the imported polygon (and its option).
    if (presetSel.value !== CUSTOM_ID) {
      state.presetId = presetSel.value;
      state.custom = null;
      const opt = presetSel.querySelector(`option[value="${CUSTOM_ID}"]`);
      if (opt) opt.remove();
    }
    requestPaint();
  });
  copyBtn.addEventListener("click", () => {
    if (!lastFit) return;
    const link = buildConformalLink(lastCorners, lastFit);
    const url = `${window.location.origin}${window.location.pathname}${link}`;
    void navigator.clipboard?.writeText(url).then(
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
  sAoA.input.addEventListener("input", () => {
    state.alphaDeg = Number(sAoA.input.value);
    sAoA.val.textContent = `${state.alphaDeg}°`;
    requestPaint();
  });
  sGamma.input.addEventListener("input", () => {
    state.gamma = Number(sGamma.input.value);
    sGamma.val.textContent = state.gamma.toFixed(1);
    requestPaint();
  });
  window.addEventListener("resize", requestPaint);
  syncModeUi();
  requestPaint();
}

runWithFatalBoundary(main);
