// apps/hele-shaw-flow — the interior-droplet Hele-Shaw evolver (M4c.2; carved out of 2d-electrostatics, ADR-0036). A bounded fluid droplet D(t),
// the image of the unit disk under an interior conformal map f(w,t) = Σ a_k w^k, fed by a point source at
// its center. We integrate the classical Polubarinova–Galin equation (heleShawInteriorStepper.ts) and
// scrub/play the evolution, drawing the boundary and the interior flow net (streamlines + equipotentials).
//
// This is the NUMERICAL companion (`≈`) to the exact closed-form twist page: injection (Q > 0) is the
// stable, smoothing direction (a perturbed circle relaxes; the conserved Richardson moments hold — the
// honest error bar); suction (Q < 0) is the ILL-POSED fingering direction (RISKS §3), gated behind an
// opt-in and stopped hard at the (3,2)-cusp (min|f'| → 0, ⚠), never integrated past. Sixth page of the app.
import "./styles/main.css";
import "@cas/ui/nav.css";
import { runWithFatalBoundary, attachCanvasA11y, mountNavHeader } from "@cas/ui";
import { Net2D, boundsOf, type Pt } from "@cas/flow";
import { dropletBoundary, dropletFlowNet } from "./render/interiorDropletRender.js";
import { canonicalize, evolveDroplet, type DropletFrame, type StopReason } from "./heleShawInteriorStepper.js";
import { type Cx } from "./heleShawInterior.js";

interface Preset {
  readonly id: string;
  readonly label: string;
  readonly coeffs: Cx[];
  readonly q: number;
  readonly spin: number;
  readonly suction: boolean;
  readonly note: string;
}
// Initial droplets. Coefficients are a₁…a_N; a₁ real sets the conformal radius. Injection smooths, suction
// fingers.
const PRESETS: readonly Preset[] = [
  { id: "disk", label: "Disk (uniform growth)", coeffs: [[1, 0]], q: 1, spin: 0, suction: false, note: "a disk stays a disk — the exact self-similar solution" },
  { id: "smooth", label: "Perturbed circle → smooths (inject)", coeffs: [[1, 0], [0, 0], [0.22, 0]], q: 1.5, spin: 0, suction: false, note: "injection is stabilizing — the bump decays as the droplet grows" },
  { id: "blob", label: "Asymmetric blob (inject)", coeffs: canonicalize([[1.3, 0], [0.24, 0.12], [0, -0.12]]), q: 1.5, spin: 0, suction: false, note: "watch the Richardson moments stay conserved as the area grows" },
  { id: "finger", label: "Fingering → cusp (suction ⚠)", coeffs: [[1, 0], [0, 0], [0.12, 0]], q: -2, spin: 0, suction: true, note: "suction is ill-posed — the perturbation grows into a (3,2)-cusp" },
  { id: "spin", label: "Spun blob (inject + spin)", coeffs: canonicalize([[1.2, 0], [0.28, 0], [0, 0.12]]), q: 1, spin: 1.2, suction: false, note: "a rigid co-rotation — area- and shape-neutral, the honest interior twist" },
];

interface DrState {
  presetId: string;
  q: number;
  spin: number;
  allowSuction: boolean;
  frac: number; // 0..1 along the evolution timeline
  playing: boolean;
  showNet: boolean;
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

const TMAX = 6; // integrate up to this elapsed time (or until a cusp / max frames)
const FRAMES_CAP = 240;

function main(): void {
  const app = document.getElementById("app");
  if (!app) return;
  app.textContent = "";

  const first = PRESETS[0];
  const state: DrState = { presetId: first.id, q: first.q, spin: first.spin, allowSuction: first.suction, frac: 0.5, playing: false, showNet: true };

  // ---- toolbar --------------------------------------------------------------
  const bar = el("header", "toolbar");
  const brand = el("div", "brand");
  brand.innerHTML = "<strong>Hele-Shaw Flow · Droplet (numerical)</strong><span>a bounded droplet grown by the Polubarinova–Galin equation (≈)</span>";
  const back = el("a", "pal-btn", "← Hele-Shaw Flow");
  (back as HTMLAnchorElement).href = "./";
  const twistLink = el("a", "pal-btn", "Twist (exact) →");
  (twistLink as HTMLAnchorElement).href = "./twist.html";

  const controls = el("div", "foil-controls");

  const presetRow = el("label", "row");
  const presetHead = el("span", "row-h");
  presetHead.append(el("span", "row-l", "Initial droplet"));
  const presetSel = el("select", "tp-select");
  for (const p of PRESETS) {
    const opt = el("option", undefined, p.label);
    opt.value = p.id;
    presetSel.append(opt);
  }
  presetRow.append(presetHead, presetSel);

  const sQ = slider("source Q (inject / suck)", -3, 3, 0.05, state.q);
  const sSpin = slider("spin ω (rigid co-rotation)", -2, 2, 0.05, state.spin);
  const sT = slider("time t", 0, 1, 0.001, state.frac);
  const playBtn = el("button", "pal-btn", "▶ Play");
  playBtn.type = "button";

  const netCheck = el("label", "check");
  const netBox = el("input");
  netBox.type = "checkbox";
  netBox.checked = state.showNet;
  netCheck.append(netBox, el("span", undefined, "flow net (streamlines + equipotentials)"));

  const suctionCheck = el("label", "check");
  const suctionBox = el("input");
  suctionBox.type = "checkbox";
  suctionBox.checked = state.allowSuction;
  suctionCheck.append(suctionBox, el("span", undefined, "allow suction (⚠ ill-posed)"));

  controls.append(presetRow, sQ.row, sSpin.row, sT.row, playBtn, netCheck, suctionCheck);

  const readout = el("div", "readout tp-readout");
  bar.append(brand, back, twistLink, controls, readout);

  // ---- single z-plane pane --------------------------------------------------
  const stage = el("div", "pot-stage");
  const fig = el("figure", "foil-pane");
  const canvas = el("canvas", "foil-canvas");
  attachCanvasA11y(canvas, {
    role: "img",
    label: "A bounded fluid droplet in a Hele-Shaw cell, grown from a central source by the Polubarinova–Galin equation",
  });
  const cap = el("figcaption");
  cap.innerHTML =
    "<b>Interior Hele-Shaw droplet</b> — the free boundary ∂D<sub>t</sub> = f<sub>t</sub>(∂𝔻) moves by Darcy's law under a central source. Injection smooths; suction fingers (ill-posed).";
  fig.append(canvas, cap);
  stage.append(fig);
  mountNavHeader(app, { current: "hele-shaw-flow" });
  app.append(bar, stage);

  const net = new Net2D(canvas);

  // Cache the evolved timeline per (preset, Q, spin, suction) — evolveDroplet integrates ~hundreds of RK4
  // steps, so rebuild only when a control changes; the time slider just indexes cached frames.
  let cache: { key: string; frames: DropletFrame[]; stop: StopReason; bounds: ReturnType<typeof boundsOf> } | null = null;
  const timelineFor = (): typeof cache => {
    const p = PRESETS.find((x) => x.id === state.presetId) ?? first;
    const key = `${state.presetId}|${state.q}|${state.spin}|${state.allowSuction}`;
    if (cache && cache.key === key) return cache;
    const { frames, stop } = evolveDroplet(p.coeffs, { strength: state.q }, {
      dt: 0.02,
      tMax: TMAX,
      maxFrames: FRAMES_CAP,
      spin: state.spin,
      allowSuction: state.allowSuction,
    });
    // Stable view: fit to the UNION of all frames so the camera doesn't jump while animating — and so it
    // stays correct under suction, where the droplet shrinks and the last (near-cusp) frame is not the
    // largest. Computed once per family build.
    const allPts: Pt[] = [];
    for (const fr of frames) for (const pt of dropletBoundary(fr.coeffs, 120)) allPts.push(pt);
    const bounds = allPts.length ? boundsOf([{ color: "", pts: allPts }]) : null;
    cache = { key, frames, stop, bounds };
    return cache;
  };

  let raf = 0;
  const paint = (): void => {
    raf = 0;
    if (!net.resize()) return;
    net.clear();

    if (state.q < 0 && !state.allowSuction) {
      readout.innerHTML =
        `Q = ${fmt(state.q)} (suction)<br>` +
        `<span class="tp-warn">⚠ suction is ill-posed — tick “allow suction” to evolve it anyway (RISKS §3)</span>`;
      return;
    }
    const tl = timelineFor();
    if (!tl || tl.frames.length === 0) {
      readout.innerHTML = `<span class="tp-warn">⚠ no timeline could be built for these settings</span>`;
      return;
    }
    if (tl.bounds) {
      const b = tl.bounds;
      const pad = 0.22 * Math.max(b.maxx - b.minx, b.maxy - b.miny, 1e-3);
      net.fitBounds({ minx: b.minx - pad, maxx: b.maxx + pad, miny: b.miny - pad, maxy: b.maxy + pad }, 1.04);
    }
    const idx = Math.min(tl.frames.length - 1, Math.max(0, Math.round(state.frac * (tl.frames.length - 1))));
    const frame = tl.frames[idx];

    // Draw order: interior flow net (light), then the droplet boundary (bright), then the source dot.
    if (state.showNet) {
      const fnet = dropletFlowNet(frame.coeffs, { rings: 5, rays: 28 });
      net.drawLines(fnet.streamlines, 0.7);
      net.drawLines(fnet.equipotentials, 0.9);
    }
    net.fillBody(dropletBoundary(frame.coeffs, 480), "rgba(40,224,245,0.10)", "#28e0f5", 2.2);
    const src: Pt = [0, 0];
    net.drawDot(src, "#ffd166", 5); // the central source (image of w = 0)

    // ---- readout: honest labels -----------------------------------------------
    const atEnd = idx >= tl.frames.length - 1;
    const stopWord =
      tl.stop === "cusp"
        ? `<span class="tp-warn">⚠ stopped at a (3,2)-cusp (min|f′| → 0) — ill-posed past here</span>`
        : tl.stop === "diverged"
          ? `<span class="tp-warn">⚠ the evolution diverged (under-resolved)</span>`
          : `<span class="tp-approx">reached t = ${fmt(frame.t)}</span>`;
    const p = PRESETS.find((x) => x.id === state.presetId) ?? first;
    readout.innerHTML =
      `Q = ${fmt(state.q)}${state.q < 0 ? " (suction ⚠)" : " (inject)"} &nbsp; ω = ${fmt(state.spin)}<br>` +
      `t = <b>${fmt(frame.t)}</b> &nbsp; area A = ${fmt(frame.area)} &nbsp; min|f′| = ${fmt(frame.minFPrime)}<br>` +
      `${state.spin !== 0 ? "|Mₖ|" : "Mₖ"} moment drift (≈, conserved = 0): <b>${frame.momentDrift.toExponential(1)}</b><br>` +
      `<span class="tp-approx">${p.note}</span>` +
      (atEnd ? `<br>${stopWord}` : "");
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
      stopPlay(); // stop at the end of the timeline (a cusp ⚠ or t_max), never past it
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
  const syncControls = (): void => {
    sQ.input.value = String(state.q);
    sQ.val.textContent = state.q.toFixed(2);
    sSpin.input.value = String(state.spin);
    sSpin.val.textContent = state.spin.toFixed(2);
    suctionBox.checked = state.allowSuction;
  };
  presetSel.addEventListener("change", () => {
    const p = PRESETS.find((x) => x.id === presetSel.value);
    if (!p) return;
    stopPlay();
    state.presetId = p.id;
    state.q = p.q;
    state.spin = p.spin;
    state.allowSuction = p.suction;
    state.frac = 0.5;
    sT.input.value = String(state.frac);
    sT.val.textContent = state.frac.toFixed(2);
    syncControls();
    requestPaint();
  });
  sQ.input.addEventListener("input", () => {
    stopPlay();
    state.q = Number(sQ.input.value);
    sQ.val.textContent = state.q.toFixed(2);
    requestPaint();
  });
  sSpin.input.addEventListener("input", () => {
    stopPlay();
    state.spin = Number(sSpin.input.value);
    sSpin.val.textContent = state.spin.toFixed(2);
    requestPaint();
  });
  sT.input.addEventListener("input", () => {
    stopPlay();
    state.frac = Number(sT.input.value);
    sT.val.textContent = state.frac.toFixed(2);
    requestPaint();
  });
  netBox.addEventListener("change", () => {
    state.showNet = netBox.checked;
    requestPaint();
  });
  suctionBox.addEventListener("change", () => {
    stopPlay();
    state.allowSuction = suctionBox.checked;
    requestPaint();
  });
  window.addEventListener("resize", requestPaint);
  requestPaint();
}

runWithFatalBoundary(main);
