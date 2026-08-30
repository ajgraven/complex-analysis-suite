// apps/2d-electrostatics — the Hele-Shaw "twisting" showpiece (M4b). The Graven–Makarov one-point
// unbounded-QD family QD(α/(w−w₀)) at w₀ = 2, driven by a COMPLEX charge α = q + iγ: q injects (grows the
// droplet), γ spins it (the twist). We scrub/play the growing family {Ω_t} up to its critical time — a
// double point (α > 0) or a (3,2)-cusp (α < 0 or complex) — drawing the twisting boundary, the exterior
// conformal grid (its rays spiral for γ ≠ 0), and the spiral equipotentials of the driving charge.
//
// Everything is CLOSED FORM (`=`): the map, the conserved quadrature datum (recoverCharge = α at every t,
// shown as the conservation monitor), and the α>0 critical time. The cusp edge is ill-posed (RISKS §3):
// the timeline STOPS at t* with a ⚠ and never integrates past it. Fifth page of the app.
import "./styles/main.css";
import { runWithFatalBoundary, attachCanvasA11y } from "@cas/ui";
import type { Pt } from "./transplant.js";
import { Net2D, boundsOf } from "./render/net2d.js";
import { boundaryOf, conformalNet, spiralEquipotentials } from "./render/heleShawRender.js";
import { admissible, buildFamily, recoverCharge, W0, type Cx, type Frame, type Critical } from "./heleShawOnePoint.js";

const NODE: Pt = [W0, 0]; // the quadrature node w₀
const FRAMES = 64;

interface Preset {
  readonly id: string;
  readonly label: string;
  readonly alpha: Cx;
}
const PRESETS: readonly Preset[] = [
  { id: "sym", label: "Symmetric (α = 1)", alpha: [1, 0] },
  { id: "neg", label: "Negative (α = −0.5)", alpha: [-0.5, 0] },
  { id: "twist", label: "Twist (α = i)", alpha: [0, 1] },
  { id: "strong", label: "Strong twist (α = 1.5i)", alpha: [0, 1.5] },
];

interface TwState {
  q: number;
  gamma: number;
  frac: number; // 0..1 along the growing timeline
  playing: boolean;
  showGrid: boolean;
  showField: boolean;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function slider(label: string, min: number, max: number, step: number, value: number): { row: HTMLElement; input: HTMLInputElement; val: HTMLElement } {
  const row = el("label", "row");
  const head = el("span", "row-h");
  const val = el("span", "row-v", value.toFixed(2));
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
const fmt = (v: number): string => (Math.abs(v) < 5e-4 ? "0" : v.toFixed(3));
const fmtCx = (c: Cx): string => `${fmt(c[0])} ${c[1] >= 0 ? "+" : "−"} ${fmt(Math.abs(c[1]))}i`;

function main(): void {
  const app = document.getElementById("app");
  if (!app) return;
  app.textContent = "";

  const state: TwState = { q: 1, gamma: 0, frac: 0.55, playing: false, showGrid: true, showField: true };

  // ---- toolbar --------------------------------------------------------------
  const bar = el("header", "toolbar");
  const brand = el("div", "brand");
  brand.innerHTML = "<strong>2D Electrostatics · Hele-Shaw twist</strong><span>a growing quadrature domain driven by a complex charge</span>";
  const back = el("a", "pal-btn", "← Field sandbox");
  (back as HTMLAnchorElement).href = "./";
  const potLink = el("a", "pal-btn", "Potential →");
  (potLink as HTMLAnchorElement).href = "./potential.html";
  const dropLink = el("a", "pal-btn", "Droplet (numerical) →");
  (dropLink as HTMLAnchorElement).href = "./droplet.html";

  const controls = el("div", "foil-controls");

  const presetRow = el("label", "row");
  const presetHead = el("span", "row-h");
  presetHead.append(el("span", "row-l", "Preset"));
  const presetSel = el("select", "tp-select");
  presetSel.append(el("option", undefined, "Custom α"));
  for (const p of PRESETS) {
    const opt = el("option", undefined, p.label);
    opt.value = p.id;
    presetSel.append(opt);
  }
  presetRow.append(presetHead, presetSel);

  const sQ = slider("charge q = Re α (inject)", -1, 4, 0.05, state.q);
  const sG = slider("spin γ = Im α (twist)", -2.5, 2.5, 0.05, state.gamma);
  const sT = slider("time t → t*", 0, 1, 0.001, state.frac);
  const playBtn = el("button", "pal-btn", "▶ Play");
  playBtn.type = "button";

  const gridCheck = el("label", "check");
  const gridBox = el("input");
  gridBox.type = "checkbox";
  gridBox.checked = state.showGrid;
  gridCheck.append(gridBox, el("span", undefined, "conformal grid"));
  const fieldCheck = el("label", "check");
  const fieldBox = el("input");
  fieldBox.type = "checkbox";
  fieldBox.checked = state.showField;
  fieldCheck.append(fieldBox, el("span", undefined, "source field (spiral)"));

  controls.append(presetRow, sQ.row, sG.row, sT.row, playBtn, gridCheck, fieldCheck);

  const readout = el("div", "readout tp-readout");
  bar.append(brand, back, potLink, dropLink, controls, readout);

  // ---- single z-plane pane --------------------------------------------------
  const stage = el("div", "pot-stage");
  const fig = el("figure", "foil-pane");
  const canvas = el("canvas", "foil-canvas");
  attachCanvasA11y(canvas, {
    role: "img",
    label: "A growing, twisting quadrature domain in a Hele-Shaw cell driven by a complex point charge",
  });
  const cap = el("figcaption");
  cap.innerHTML =
    "<b>Hele-Shaw with spin</b> — the same mechanism as the airfoil's Kutta lift, inside a Hele-Shaw cell (McKee–Bush 2024). The boundary ∂Ω<sub>t</sub> = φ<sub>t</sub>(∂𝔻) grows and twists.";
  fig.append(canvas, cap);
  stage.append(fig);
  app.append(bar, stage);

  const net = new Net2D(canvas);

  // Cache the built family per (q, γ) — buildFamily solves ~64 maps, so rebuild only when the charge
  // changes; the time slider just indexes cached frames.
  let cache: { key: string; frames: Frame[]; critical: Critical; bounds: ReturnType<typeof boundsOf> } | null = null;
  const familyFor = (q: number, gamma: number): typeof cache => {
    const key = `${q}|${gamma}`;
    if (cache && cache.key === key) return cache;
    const alpha: Cx = [q, gamma];
    const { frames, critical } = buildFamily(alpha, FRAMES);
    // Stable view: fit to the LAST (largest) frame's boundary so the camera doesn't jump while animating.
    const bounds = frames.length ? boundsOf([{ color: "", pts: boundaryOf(frames[frames.length - 1].map, 240) }, { color: "", pts: [NODE] }]) : null;
    cache = { key, frames, critical, bounds };
    return cache;
  };

  let raf = 0;
  const paint = (): void => {
    raf = 0;
    const alpha: Cx = [state.q, state.gamma];
    if (!net.resize()) return;
    net.clear();

    if (!admissible(alpha)) {
      readout.innerHTML =
        `α = ${fmtCx(alpha)}<br>` +
        `<span class="tp-warn">⚠ no domain — α is outside the admissible parabola |w₀|² + 2·Re α &gt; 2|α|</span>`;
      return;
    }
    const fam = familyFor(state.q, state.gamma);
    if (!fam || fam.frames.length === 0) {
      readout.innerHTML = `α = ${fmtCx(alpha)}<br><span class="tp-warn">⚠ the family could not be built for this charge</span>`;
      return;
    }
    if (fam.bounds) {
      const b = fam.bounds;
      const pad = 0.22 * Math.max(b.maxx - b.minx, b.maxy - b.miny);
      net.fitBounds({ minx: b.minx - pad, maxx: b.maxx + pad, miny: b.miny - pad, maxy: b.maxy + pad }, 1.04);
    }
    const idx = Math.min(fam.frames.length - 1, Math.max(0, Math.round(state.frac * (fam.frames.length - 1))));
    const frame = fam.frames[idx];
    const rMaxWorld = fam.bounds ? 0.6 * Math.max(fam.bounds.maxx - fam.bounds.minx, fam.bounds.maxy - fam.bounds.miny) : 6;

    // Draw order: source field (light), conformal grid (light), then the droplet boundary (bright).
    if (state.showField) net.drawLines(spiralEquipotentials(alpha, NODE, { rMax: rMaxWorld, rMin: 0.05, levels: 13 }), 0.8);
    if (state.showGrid) {
      const cn = conformalNet(frame.map, { rings: 5, rays: 28, rMax: 4.5 });
      net.drawLines(cn.rays, 0.7);
      net.drawLines(cn.rings, 0.9);
    }
    net.fillBody(boundaryOf(frame.map, 480), "rgba(40,224,245,0.10)", "#28e0f5", 2.2);
    net.drawDot(NODE, "#ffd166", 5); // the quadrature node w₀

    // ---- readout: honest labels -----------------------------------------------
    const cr = fam.critical;
    const recovered = recoverCharge(frame.map);
    const chargeErr = Math.hypot(recovered[0] - alpha[0], recovered[1] - alpha[1]);
    const nearCritical = idx >= fam.frames.length - 1;
    const mechWord = cr.mechanism === "double-point" ? "double point" : "(3,2)-cusp";
    const critLine = nearCritical
      ? `<span class="tp-warn">⚠ at the critical time t* ≈ ${fmt(cr.tStar)} — the family terminates in a ${mechWord}${cr.mechanism === "cusp" ? " (ill-posed past here)" : ""}</span>`
      : `<span class="tp-approx">t* ≈ ${fmt(cr.tStar)} · terminates in a ${mechWord}</span>`;
    readout.innerHTML =
      `α = q + iγ = ${fmtCx(alpha)} at w₀ = ${W0}<br>` +
      `t = A(Ω_t)/π = <b>${fmt(frame.t)}</b> &nbsp; c = ${fmt(frame.c)}<br>` +
      `conserved charge (=): recovered α = ${fmtCx(recovered)} (Δ ${chargeErr.toExponential(0)})<br>` +
      critLine;
  };
  const requestPaint = (): void => {
    if (!raf) raf = requestAnimationFrame(paint);
  };

  // ---- animation ------------------------------------------------------------
  let anim = 0;
  const stopPlay = (): void => {
    state.playing = false;
    playBtn.textContent = "▶ Play";
    if (anim) {
      cancelAnimationFrame(anim);
      anim = 0;
    }
  };
  const tick = (): void => {
    anim = 0;
    if (!state.playing) return;
    state.frac = Math.min(1, state.frac + 0.006);
    sT.input.value = String(state.frac);
    sT.val.textContent = state.frac.toFixed(2);
    requestPaint();
    if (state.frac >= 1) {
      stopPlay(); // stop at the critical time (⚠), never past it
      return;
    }
    anim = requestAnimationFrame(tick);
  };
  playBtn.addEventListener("click", () => {
    if (state.playing) {
      stopPlay();
      return;
    }
    if (state.frac >= 1) state.frac = 0; // replay from birth
    state.playing = true;
    playBtn.textContent = "⏸ Pause";
    anim = requestAnimationFrame(tick);
  });

  // ---- wiring ---------------------------------------------------------------
  const syncCharge = (): void => {
    sQ.input.value = String(state.q);
    sQ.val.textContent = state.q.toFixed(2);
    sG.input.value = String(state.gamma);
    sG.val.textContent = state.gamma.toFixed(2);
  };
  presetSel.addEventListener("change", () => {
    const p = PRESETS.find((x) => x.id === presetSel.value);
    if (!p) return;
    stopPlay();
    state.q = p.alpha[0];
    state.gamma = p.alpha[1];
    state.frac = 0.55;
    sT.input.value = String(state.frac);
    sT.val.textContent = state.frac.toFixed(2);
    syncCharge();
    requestPaint();
  });
  sQ.input.addEventListener("input", () => {
    state.q = Number(sQ.input.value);
    sQ.val.textContent = state.q.toFixed(2);
    presetSel.value = "Custom α";
    requestPaint();
  });
  sG.input.addEventListener("input", () => {
    state.gamma = Number(sG.input.value);
    sG.val.textContent = state.gamma.toFixed(2);
    presetSel.value = "Custom α";
    requestPaint();
  });
  sT.input.addEventListener("input", () => {
    stopPlay();
    state.frac = Number(sT.input.value);
    sT.val.textContent = state.frac.toFixed(2);
    requestPaint();
  });
  gridBox.addEventListener("change", () => {
    state.showGrid = gridBox.checked;
    requestPaint();
  });
  fieldBox.addEventListener("change", () => {
    state.showField = fieldBox.checked;
    requestPaint();
  });
  window.addEventListener("resize", requestPaint);
  requestPaint();
}

runWithFatalBoundary(main);
