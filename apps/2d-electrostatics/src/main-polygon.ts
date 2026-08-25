// apps/2d-electrostatics — the polygon transplant (M2.4b). Flow past a polygon K is flow past the unit
// disk carried through the EXTERIOR Schwarz–Christoffel map Ψ: 𝔻* → ext(K) (@cas/conformal), shown as
// two linked panes: the disk plane (left) and the polygon plane (right). The reference flow net —
// streamlines ψ = Im W_ref = const and equipotentials φ = Re W_ref = const of flow past the unit disk —
// is built exactly in the ζ-plane (transplant.ts) and pushed FORWARD through Ψ onto K (never inverting
// the SC map). Each streamline keeps a colour key, so the same streamline reads the same colour in both
// panes: the map visibly carries the flow. Angle-of-attack and circulation sliders reshape the flow; a
// preset picker chooses K. Honest `≈` — Ψ is a truncated Laurent series over a machine-precision fit;
// capacity + converged/degraded/residual are surfaced. Third page of the app (index.html is the free
// sandbox, airfoil.html the Joukowski wing).
import "./styles/main.css";
import { runWithFatalBoundary, attachCanvasA11y } from "@cas/ui";
import { flowNet, unitCircle, pushforward, type RefFlow, type NetCurve, type Pt } from "./transplant.js";
import { fitPolygonFlow, type PolygonFlowMap } from "./polygonMap.js";
import { POLYGON_PRESETS, DEFAULT_PRESET } from "./transplantPresets.js";
import { Net2D, boundsOf } from "./render/net2d.js";

interface TpState {
  presetId: string;
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

/** A hue key for corner k of n — the same key colours a prevertex (ζ-pane) and its image (K-pane). */
function cornerColor(k: number, n: number): string {
  return `hsl(${((k / Math.max(1, n)) * 320).toFixed(0)}, 85%, 66%)`;
}

function main(): void {
  const app = document.getElementById("app");
  if (!app) return;
  app.textContent = "";

  const state: TpState = { presetId: DEFAULT_PRESET, alphaDeg: 0, gamma: 0 };

  // ---- toolbar --------------------------------------------------------------
  const bar = el("header", "toolbar");
  const brand = el("div", "brand");
  brand.innerHTML = "<strong>2D Electrostatics · Polygon</strong><span>flow past a polygon — Schwarz–Christoffel transplant</span>";
  const back = el("a", "pal-btn", "← Field sandbox");
  (back as HTMLAnchorElement).href = "./";
  const foilLink = el("a", "pal-btn", "Airfoil →");
  (foilLink as HTMLAnchorElement).href = "./airfoil.html";

  const controls = el("div", "foil-controls");
  const presetRow = el("label", "row");
  const presetHead = el("span", "row-h");
  presetHead.append(el("span", "row-l", "Polygon K"));
  const presetSel = el("select", "tp-select");
  for (const p of POLYGON_PRESETS) {
    const opt = el("option", undefined, p.label);
    opt.value = p.id;
    if (p.id === state.presetId) opt.selected = true;
    presetSel.append(opt);
  }
  presetRow.append(presetHead, presetSel);
  const sAoA = slider("Angle of attack", -30, 30, 1, state.alphaDeg, "°");
  const sGamma = slider("Circulation Γ", -4, 4, 0.1, state.gamma);
  controls.append(presetRow, sAoA.row, sGamma.row);

  const readout = el("div", "readout tp-readout");
  bar.append(brand, back, foilLink, controls, readout);

  // ---- two-pane stage -------------------------------------------------------
  const stage = el("div", "foil-stage");
  const makePane = (label: string, caption: string): Net2D => {
    const pane = el("figure", "foil-pane");
    const canvas = el("canvas", "foil-canvas");
    attachCanvasA11y(canvas, { role: "img", label });
    const cap = el("figcaption");
    cap.innerHTML = caption;
    pane.append(canvas, cap);
    stage.append(pane);
    return new Net2D(canvas);
  };
  const diskNet = makePane(
    "The disk plane: uniform flow past the unit circle, the reference flow that is carried onto the polygon",
    "<b>Disk plane</b> — flow past the unit circle |ζ| = 1 (the reference flow)",
  );
  const polyNet = makePane(
    "The polygon plane: the same flow carried through the exterior Schwarz–Christoffel map onto the polygon",
    "<b>Polygon plane</b> — the same flow, carried by Ψ: 𝔻* → ext(K) onto the polygon",
  );

  app.append(bar, stage);

  const presetOf = (id: string): (typeof POLYGON_PRESETS)[number] =>
    POLYGON_PRESETS.find((p) => p.id === id) ?? POLYGON_PRESETS[0];

  let frame = 0;
  const paint = (): void => {
    frame = 0;
    const preset = presetOf(state.presetId);
    const flow: RefFlow = { U: 1, alpha: (state.alphaDeg * Math.PI) / 180, gamma: state.gamma };
    const net = flowNet(flow, { streamlines: 9, equipotentials: 9, span: 6, samples: 220 });

    // ---- disk pane: the reference flow, exact --------------------------------
    if (diskNet.resize()) {
      diskNet.fitBounds({ minx: -3.6, maxx: 3.6, miny: -3.6, maxy: 3.6 });
      diskNet.clear();
      diskNet.drawLines(net.equipotentials, 0.9);
      diskNet.drawLines(net.streamlines, 1.3);
      diskNet.fillBody(unitCircle(180));
    }

    // ---- polygon pane: the transplanted flow ---------------------------------
    let map: PolygonFlowMap | null = null;
    try {
      map = fitPolygonFlow(preset.corners);
    } catch {
      map = null;
    }

    if (polyNet.resize()) {
      polyNet.clear();
      if (map) {
        const m = map; // const so the pushforward closure keeps the non-null narrowing
        const Psi = (z: Pt): Pt => m.evalPsi(z);
        const streams: NetCurve[] = pushforward(net.streamlines, Psi);
        const equis: NetCurve[] = pushforward(net.equipotentials, Psi);
        const bdry = m.boundary(400);
        const bb = boundsOf([{ color: "", pts: bdry }]);
        if (bb) {
          // Frame on K with room for the near-body flow (body ~⅓ of the view).
          const w = bb.maxx - bb.minx;
          const h = bb.maxy - bb.miny;
          const pad = 1.4 * Math.max(w, h);
          polyNet.fitBounds({ minx: bb.minx - pad, maxx: bb.maxx + pad, miny: bb.miny - pad, maxy: bb.maxy + pad }, 1.02);
        }
        polyNet.drawLines(equis, 0.9);
        polyNet.drawLines(streams, 1.3);
        polyNet.fillBody(bdry);
        // Colour-matched corner ↔ prevertex markers (the SC prevertex-linking idiom).
        const n = preset.corners.length;
        for (let k = 0; k < n; k++) {
          const col = cornerColor(k, n);
          if (m.cornerImages[k]) polyNet.drawDot(m.cornerImages[k], col);
          if (m.cornerPreimages[k]) diskNet.drawDot(m.cornerPreimages[k], col);
        }
      }
    }

    // ---- readout -------------------------------------------------------------
    if (map) {
      const tag = map.converged ? (map.degraded ? "converged · degraded" : "converged") : "not converged";
      readout.innerHTML =
        `capacity cap(K) = <b>${map.capacity.toFixed(4)}</b><br>` +
        `SC fit: ${tag} · residual ≈ ${map.residual.toExponential(1)}<br>` +
        `<span class="tp-approx">≈ flow net: Ψ is a ${map.laurentTerms}-term Laurent series</span>`;
    } else {
      readout.innerHTML = `<span class="tp-warn">⚠ the SC fit failed for this polygon</span>`;
    }
  };
  const requestPaint = (): void => {
    if (!frame) frame = requestAnimationFrame(paint);
  };

  presetSel.addEventListener("change", () => {
    state.presetId = presetSel.value;
    requestPaint();
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
  requestPaint();
}

runWithFatalBoundary(main);
