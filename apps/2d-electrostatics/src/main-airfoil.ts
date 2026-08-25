// apps/2d-electrostatics — the Joukowski airfoil transplant (M2.2). Flow past an airfoil IS flow past a
// cylinder carried through z = J(ζ) = ζ + b²/ζ, shown as two linked panes: the cylinder plane (left)
// and the airfoil plane (right). Both domain-colour the closed-form velocity and contour the SAME
// cylinder-plane stream function ψ = Im W, so a streamline in the cylinder pane maps to the matching
// streamline on the wing — the map visibly carries the flow. Thickness/camber/angle-of-attack sliders
// reshape the airfoil; the Kutta toggle fixes the circulation at the trailing edge and reports the
// Kutta–Joukowski lift L = ρUΓ. Second page of the app (index.html is the free-field sandbox).
import "./styles/main.css";
import { runWithFatalBoundary, attachCanvasA11y } from "@cas/ui";
import { kuttaCirculation, cylinderRadius, type AirfoilParams } from "./airfoil.js";
import { createAirfoilRenderer, type AirfoilView } from "./render/airfoilView.js";

const CYL_VIEW: AirfoilView = { center: [0, 0], halfSpan: 2.0 };
const FOIL_VIEW: AirfoilView = { center: [0, 0], halfSpan: 2.8 };

interface FoilState {
  thickness: number;
  camber: number;
  alphaDeg: number;
  kutta: boolean;
}

function paramsOf(s: FoilState): AirfoilParams {
  const base: AirfoilParams = {
    U: 1,
    alpha: (s.alphaDeg * Math.PI) / 180,
    b: 1,
    center: [-s.thickness, s.camber],
    circulation: 0,
  };
  return { ...base, circulation: s.kutta ? kuttaCirculation(base) : 0 };
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

function sizeCanvas(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext): void {
  const dpr = window.devicePixelRatio || 1;
  const r = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.floor(r.width * dpr));
  const h = Math.max(1, Math.floor(r.height * dpr));
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

  const state: FoilState = { thickness: 0.12, camber: 0.06, alphaDeg: 8, kutta: true };

  // ---- toolbar --------------------------------------------------------------
  const bar = el("header", "toolbar");
  const brand = el("div", "brand");
  brand.innerHTML = "<strong>2D Electrostatics · Airfoil</strong><span>flow past a Joukowski wing</span>";
  const back = el("a", "pal-btn", "← Field sandbox");
  (back as HTMLAnchorElement).href = "./";

  const controls = el("div", "foil-controls");
  const sThick = slider("Thickness", 0, 0.35, 0.005, state.thickness);
  const sCamber = slider("Camber", 0, 0.2, 0.005, state.camber);
  const sAoA = slider("Angle of attack", -20, 20, 0.5, state.alphaDeg, "°");
  const kutta = el("label", "check");
  const kBox = el("input");
  kBox.type = "checkbox";
  kBox.checked = state.kutta;
  kutta.append(kBox, el("span", undefined, "Kutta condition"));
  controls.append(sThick.row, sCamber.row, sAoA.row, kutta);

  const lift = el("div", "readout lift-readout");
  bar.append(brand, back, controls, lift);

  // ---- two-pane stage -------------------------------------------------------
  const stage = el("div", "foil-stage");
  const makePane = (label: string, caption: string): { canvas: HTMLCanvasElement } => {
    const pane = el("figure", "foil-pane");
    const canvas = el("canvas", "foil-canvas");
    attachCanvasA11y(canvas, { role: "img", label });
    const cap = el("figcaption");
    cap.innerHTML = caption;
    pane.append(canvas, cap);
    stage.append(pane);
    return { canvas };
  };
  const cyl = makePane(
    "The cylinder plane: uniform flow past a circular cylinder with a doublet and a vortex",
    "<b>Cylinder plane</b> — uniform flow + doublet + vortex past the circle |ζ − ζ₀| = R",
  );
  const foil = makePane(
    "The airfoil plane: the same flow carried through the Joukowski map onto the wing",
    "<b>Airfoil plane</b> — the same flow, carried by z = ζ + b²/ζ onto the wing",
  );

  app.append(bar, stage);

  const cylGl = cyl.canvas.getContext("webgl2");
  const foilGl = foil.canvas.getContext("webgl2");
  if (!cylGl || !foilGl) throw new Error("WebGL2 is required for the airfoil transplant view.");
  const cylRenderer = createAirfoilRenderer(cylGl);
  const foilRenderer = createAirfoilRenderer(foilGl);

  let frame = 0;
  const paint = (): void => {
    frame = 0;
    const params = paramsOf(state);
    sizeCanvas(cyl.canvas, cylGl);
    cylRenderer.render(params, CYL_VIEW, 0);
    sizeCanvas(foil.canvas, foilGl);
    foilRenderer.render(params, FOIL_VIEW, 1);

    const R = cylinderRadius(params);
    const L = params.U * params.circulation; // ρ = 1
    lift.innerHTML =
      `Γ = ${params.circulation.toFixed(3)} · R = ${R.toFixed(3)}<br>` +
      `lift L = ρUΓ = <b>${L.toFixed(3)}</b> ${state.kutta ? "(Kutta)" : "(Γ = 0)"}`;
  };
  const requestPaint = (): void => {
    if (!frame) frame = requestAnimationFrame(paint);
  };

  sThick.input.addEventListener("input", () => {
    state.thickness = Number(sThick.input.value);
    sThick.val.textContent = state.thickness.toFixed(3);
    requestPaint();
  });
  sCamber.input.addEventListener("input", () => {
    state.camber = Number(sCamber.input.value);
    sCamber.val.textContent = state.camber.toFixed(3);
    requestPaint();
  });
  sAoA.input.addEventListener("input", () => {
    state.alphaDeg = Number(sAoA.input.value);
    sAoA.val.textContent = `${state.alphaDeg}°`;
    requestPaint();
  });
  kBox.addEventListener("change", () => {
    state.kutta = kBox.checked;
    requestPaint();
  });
  window.addEventListener("resize", requestPaint);
  requestPaint();
}

runWithFatalBoundary(main);
