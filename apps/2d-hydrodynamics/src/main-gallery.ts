// apps/2d-hydrodynamics — the closed-form transplant gallery (HD-2). Flow past a body B is flow past the
// unit disk 𝔻* carried through a closed-form conformal map ψ: 𝔻* → ext(B), shown as two linked panes:
// the disk plane (left) and the body plane (right). The reference flow net (uniform + circulation) is
// built exactly in the ζ-plane by @cas/flow's `flowNet`, and `pushforward` carries every streamline /
// equipotential FORWARD through ψ onto the body — the same map that shapes the body carries the flow, so
// a streamline reads the same colour in both panes. Everything is closed-form, so the transplant is exact
// (=). The bodies are @cas/flow's EXTERIOR_MAP_PRESETS (the second-consumer extraction, ADR-0037), minus
// the Joukowski wing, which has its own thickness/camber/Kutta page (airfoil.html).
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

// The gallery is the closed-form exterior maps EXCEPT the Joukowski segment — the airfoil page is the
// Joukowski family (with thickness, camber, and the Kutta condition), so it would only duplicate here.
const GALLERY: readonly ExteriorMapPreset[] = EXTERIOR_MAP_PRESETS.filter((p) => p.id !== "joukowski-ext");

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

function main(): void {
  const app = document.getElementById("app");
  if (!app) return;
  app.textContent = "";

  const hashId = window.location.hash.replace(/^#/, "");
  const initial = GALLERY.find((p) => p.id === hashId) ?? GALLERY[0];
  const state: GalleryState = { id: initial.id, alphaDeg: 0, gamma: 0 };

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
  controls.append(bodyRow, sAoA.row, sGamma.row);

  const readout = el("div", "readout tp-readout");
  bar.append(brand, back, controls, readout);

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

    if (disk.net.resize()) {
      disk.net.fitBounds({ minx: -3.6, maxx: 3.6, miny: -3.6, maxy: 3.6 });
      disk.net.clear();
      disk.net.drawLines(net.equipotentials, 0.9);
      disk.net.drawLines(net.streamlines, 1.3);
      disk.net.fillBody(unitCircle(180));
    }

    if (body.net.resize()) {
      body.net.clear();
      const psi = (z: Pt): Pt => preset.psi(z);
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
    }

    disk.caption.innerHTML = "<b>Disk plane</b> — flow past the unit circle |ζ| = 1 (the reference flow)";
    body.caption.innerHTML = `<b>Body plane</b> — the same flow, carried by ψ: 𝔻* → ext(K) onto the ${shortName(preset).toLowerCase()}`;
    readout.innerHTML =
      `ψ = <b>${preset.expr}</b><br>` +
      `<span class="tp-exact">= exact closed-form transplant</span>`;
  };
  const requestPaint = (): void => {
    if (!frame) frame = requestAnimationFrame(paint);
  };

  bodySel.addEventListener("change", () => {
    state.id = bodySel.value;
    history.replaceState(null, "", `#${state.id}`); // a permalink to the chosen body
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
