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
import { dropletBoundary, dropletFlowNet, multiSourceStreamlines } from "./render/interiorDropletRender.js";
import { canonicalize, evolveDroplet, type DropletFrame, type StopReason } from "./heleShawInteriorStepper.js";
import { invertMap, type Cx } from "./heleShawInterior.js";

interface Well {
  lab: Pt; // fixed plane-frame location
  strength: number; // Q > 0 injects, Q < 0 sucks
}
interface Preset {
  readonly id: string;
  readonly label: string;
  readonly coeffs: Cx[];
  readonly q: number;
  readonly spin: number;
  readonly suction: boolean;
  readonly note: string;
  /** Initial lab-frame location of a single point source; default the centre [0, 0]. */
  readonly source?: Cx;
  /** A full set of wells (overrides `q`/`source` when present) — for competing multi-source presets. */
  readonly sources?: readonly Well[];
}
// Initial droplets. Coefficients are a₁…a_N; a₁ real sets the conformal radius. Injection smooths, suction
// fingers.
/** A unit disk represented with `deg` modes (a₁ = r, higher aₖ = 0): an off-centre source needs those
 *  spare modes to develop the bulge toward the well (a bare degree-1 disk cannot deform). */
const paddedDisk = (r: number, deg: number): Cx[] => Array.from({ length: deg }, (_, i): Cx => (i === 0 ? [r, 0] : [0, 0]));
const PRESETS: readonly Preset[] = [
  { id: "disk", label: "Disk (uniform growth)", coeffs: [[1, 0]], q: 1, spin: 0, suction: false, note: "a disk stays a disk — the exact self-similar solution" },
  { id: "smooth", label: "Perturbed circle → smooths (inject)", coeffs: [[1, 0], [0, 0], [0.22, 0]], q: 1.5, spin: 0, suction: false, note: "injection is stabilizing — the bump decays as the droplet grows" },
  { id: "blob", label: "Asymmetric blob (inject)", coeffs: canonicalize([[1.3, 0], [0.24, 0.12], [0, -0.12]]), q: 1.5, spin: 0, suction: false, note: "watch the Richardson moments stay conserved as the area grows" },
  { id: "finger", label: "Fingering → cusp (suction ⚠)", coeffs: [[1, 0], [0, 0], [0.12, 0]], q: -2, spin: 0, suction: true, note: "suction is ill-posed — the perturbation grows into a (3,2)-cusp" },
  { id: "spin", label: "Spun blob (inject + spin)", coeffs: canonicalize([[1.2, 0], [0.28, 0], [0, 0.12]]), q: 1, spin: 1.2, suction: false, note: "a rigid co-rotation — area- and shape-neutral, the honest interior twist" },
  { id: "offcenter", label: "Off-centre source → grows toward it (inject)", coeffs: paddedDisk(1, 16), q: 1.5, spin: 0, suction: false, source: [0.5, 0], note: "an off-centre well — drag the source dot; the droplet grows fastest toward it (moments drift by Ṁₖ = Q·bᵏ)" },
  { id: "compete", label: "Source + sink (competing ⚠)", coeffs: paddedDisk(1.4, 20), q: 1.5, spin: 0, suction: true, sources: [{ lab: [-0.8, 0], strength: 1.5 }, { lab: [0.8, 0], strength: -1.5 }], note: "a well and a drain (ΣQ = 0): the area holds while fluid streams across — add/remove/drag wells, adjust the selected one's Q" },
];

/** The wells of a preset: an explicit multi-well set, else a single well from `source`/`q`. */
const buildWells = (p: Preset): Well[] =>
  p.sources
    ? p.sources.map((w): Well => ({ lab: [w.lab[0], w.lab[1]], strength: w.strength }))
    : [{ lab: p.source ? [p.source[0], p.source[1]] : [0, 0], strength: p.q }];

interface DrState {
  presetId: string;
  spin: number;
  allowSuction: boolean;
  frac: number; // 0..1 along the evolution timeline
  playing: boolean;
  showNet: boolean;
  wells: Well[]; // the point sources/sinks (fixed lab locations)
  selected: number; // index of the well the Q slider edits
  tol: number; // the adaptive integrator's local-error tolerance (self-refinement knob, F1.3)
}

const ACCURACY_BUDGET = 0.05; // stop with ⚠ "accuracy lost" once the moment drift exceeds this (F1.3)

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
  const state: DrState = {
    presetId: first.id,
    spin: first.spin,
    allowSuction: first.suction,
    frac: 0.5,
    playing: false,
    showNet: true,
    wells: buildWells(first),
    selected: 0,
    tol: 1e-6,
  };
  const selWell = (): Well => state.wells[state.selected] ?? state.wells[0];

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

  const sQ = slider("source Q (selected well)", -3, 3, 0.05, selWell().strength);
  const sSpin = slider("spin ω (rigid co-rotation)", -2, 2, 0.05, state.spin);
  const sT = slider("time t", 0, 1, 0.001, state.frac);
  const playBtn = el("button", "pal-btn", "▶ Play");
  playBtn.type = "button";

  // Multi-well controls (F1.2): add / remove wells; the Q slider edits the selected one.
  const wellRow = el("div");
  wellRow.style.cssText = "display:flex; align-items:center; gap:6px; flex-wrap:wrap;";
  const addWellBtn = el("button", "pal-btn", "＋ well");
  addWellBtn.type = "button";
  const delWellBtn = el("button", "pal-btn", "－ well");
  delWellBtn.type = "button";
  wellRow.append(el("span", "row-l", "Wells"), addWellBtn, delWellBtn, el("span", undefined, "· click a dot to select, drag to move"));

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

  // Solver tolerance (F1.3): the self-refinement knob — tighter tol ⇒ the integrator takes smaller steps
  // and the local error / moment drift shrink (visible in the readout).
  const solverRow = el("label", "row");
  const solverHead = el("span", "row-h");
  solverHead.append(el("span", "row-l", "solver"));
  const solverSel = el("select", "tp-select");
  const TOLS: readonly { label: string; tol: number }[] = [
    { label: "coarse (1e-4)", tol: 1e-4 },
    { label: "normal (1e-6)", tol: 1e-6 },
    { label: "fine (1e-8)", tol: 1e-8 },
  ];
  for (const o of TOLS) {
    const opt = el("option", undefined, o.label);
    opt.value = String(o.tol);
    if (o.tol === state.tol) opt.selected = true;
    solverSel.append(opt);
  }
  solverRow.append(solverHead, solverSel);

  controls.append(presetRow, sQ.row, wellRow, sSpin.row, sT.row, solverRow, playBtn, netCheck, suctionCheck);

  const readout = el("div", "readout tp-readout");
  bar.append(brand, back, twistLink, controls, readout);

  // ---- single z-plane pane --------------------------------------------------
  const stage = el("div", "pot-stage");
  const fig = el("figure", "foil-pane");
  const canvas = el("canvas", "foil-canvas");
  attachCanvasA11y(canvas, {
    role: "img",
    label: "A bounded fluid droplet in a Hele-Shaw cell, grown from a point source by the Polubarinova–Galin equation",
  });
  const cap = el("figcaption");
  cap.innerHTML =
    "<b>Interior Hele-Shaw droplet</b> — the free boundary ∂D<sub>t</sub> = f<sub>t</sub>(∂𝔻) moves by Darcy's law under a point source (drag the yellow dot to move it). Injection smooths; suction fingers (ill-posed).";
  fig.append(canvas, cap);
  stage.append(fig);
  mountNavHeader(app, { current: "hele-shaw-flow" });
  app.append(bar, stage);

  const net = new Net2D(canvas);

  // Cache the evolved timeline per (preset, Q, spin, suction) — evolveDroplet integrates ~hundreds of RK4
  // steps, so rebuild only when a control changes; the time slider just indexes cached frames.
  let cache: { key: string; frames: DropletFrame[]; stop: StopReason; bounds: ReturnType<typeof boundsOf> } | null = null;
  // Lab-fixed well specs: pass `lab` only for an off-centre well, so a lone central well keeps the exact
  // original code path (and goldens); a central well is `{ strength }`, at = 0.
  const sourceSpec = (): { strength: number; lab?: Cx }[] =>
    state.wells.map((w) => (w.lab[0] || w.lab[1] ? { strength: w.strength, lab: [w.lab[0], w.lab[1]] as Cx } : { strength: w.strength }));
  const timelineFor = (): typeof cache => {
    const p = PRESETS.find((x) => x.id === state.presetId) ?? first;
    const key = `${state.presetId}|${state.spin}|${state.allowSuction}|${state.tol}|` + state.wells.map((w) => `${w.strength}@${w.lab[0]},${w.lab[1]}`).join(";");
    if (cache && cache.key === key) return cache;
    const { frames, stop } = evolveDroplet(p.coeffs, sourceSpec(), {
      dt: 0.02,
      tMax: TMAX,
      maxFrames: FRAMES_CAP,
      spin: state.spin,
      allowSuction: state.allowSuction,
      tol: state.tol,
      accuracyBudget: ACCURACY_BUDGET,
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
  let dragWell = -1; // index of the well being dragged (−1 none); while dragging, reuse the cached timeline
  const paint = (): void => {
    raf = 0;
    if (!net.resize()) return;
    net.clear();

    const anySuction = state.wells.some((w) => w.strength < 0);
    if (anySuction && !state.allowSuction) {
      readout.innerHTML =
        `a well has Q &lt; 0 (suction)<br>` +
        `<span class="tp-warn">⚠ suction is ill-posed — tick “allow suction” to evolve it anyway (RISKS §3)</span>`;
      return;
    }
    // While dragging a well, reuse the last cached timeline (the shape stays put) and only re-draw the flow
    // net + move the markers — a full re-evolve runs on release. Otherwise (re)build as needed.
    const tl = dragWell >= 0 && cache ? cache : timelineFor();
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

    // Draw order: interior flow net (light), then the droplet boundary (bright), then the well markers.
    if (state.showNet) {
      if (state.wells.length === 1) {
        // One well: the exact φ_a-warped flow net (a = 0 ⇒ the plain polar grid).
        const at = invertMap(frame.coeffs, state.wells[0].lab) ?? [0, 0];
        const fnet = dropletFlowNet(frame.coeffs, { rings: 5, rays: 28, at });
        net.drawLines(fnet.streamlines, 0.7);
        net.drawLines(fnet.equipotentials, 0.9);
      } else {
        // Several wells: coarse streamlines of the combined flow (the full field is idea B2).
        const resolved = state.wells.map((w) => ({ at: invertMap(frame.coeffs, w.lab) ?? [0, 0], strength: w.strength }));
        net.drawLines(multiSourceStreamlines(frame.coeffs, resolved), 0.7);
      }
    }
    net.fillBody(dropletBoundary(frame.coeffs, 480), "rgba(40,224,245,0.10)", "#28e0f5", 2.2);
    state.wells.forEach((w, i) => {
      const color = w.strength >= 0 ? "#ffd166" : "#6db4ff"; // inject warm, suction cool
      net.drawDot(w.lab, color, i === state.selected ? 6.5 : 4.5); // the selected well is larger
    });

    // ---- readout: honest labels -----------------------------------------------
    const atEnd = idx >= tl.frames.length - 1;
    const stopWord =
      tl.stop === "cusp"
        ? `<span class="tp-warn">⚠ stopped at a (3,2)-cusp (min|f′| → 0) — ill-posed past here</span>`
        : tl.stop === "diverged"
          ? `<span class="tp-warn">⚠ the evolution diverged (under-resolved)</span>`
          : tl.stop === "source-left-fluid"
            ? `<span class="tp-warn">⚠ a well left the fluid — stopped</span>`
            : tl.stop === "accuracy-lost"
              ? `<span class="tp-warn">⚠ accuracy lost (moment drift &gt; budget) — stopped before the cusp</span>`
              : `<span class="tp-approx">reached t = ${fmt(frame.t)}</span>`;
    const p = PRESETS.find((x) => x.id === state.presetId) ?? first;
    const total = state.wells.reduce((s, w) => s + w.strength, 0);
    const sel = selWell();
    // A lone central well conserves the moments; off-centre / competing wells follow Richardson's law
    // Ṁₖ = Σⱼ Qⱼ·bⱼᵏ, and we report the drift FROM that prediction (still → 0 for an accurate solve).
    const conserved = state.wells.length === 1 && sel.lab[0] === 0 && sel.lab[1] === 0;
    const mag = state.spin !== 0 ? "|Mₖ|" : "Mₖ";
    const driftLabel = conserved ? `${mag} moment drift (conserved)` : `${mag} drift vs Ṁₖ=ΣQⱼ·bⱼᵏ`;
    const wellWord = state.wells.length === 1 ? "well" : "wells";
    readout.innerHTML =
      `${state.wells.length} ${wellWord} · ΣQ = ${fmt(total)}${total < 0 ? " (net suction ⚠)" : ""} &nbsp; ω = ${fmt(state.spin)}<br>` +
      `selected well: Q = ${fmt(sel.strength)} at (${fmt(sel.lab[0])}, ${fmt(sel.lab[1])})<br>` +
      `t = <b>${fmt(frame.t)}</b> &nbsp; area A = ${fmt(frame.area)} &nbsp; min|f′| = ${fmt(frame.minFPrime)}<br>` +
      `${driftLabel} (≈, exact = 0): <b>${frame.momentDrift.toExponential(1)}</b> &nbsp; local err: ${frame.localErr.toExponential(1)}<br>` +
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
    sQ.input.value = String(selWell().strength);
    sQ.val.textContent = selWell().strength.toFixed(2);
    sSpin.input.value = String(state.spin);
    sSpin.val.textContent = state.spin.toFixed(2);
    suctionBox.checked = state.allowSuction;
  };
  presetSel.addEventListener("change", () => {
    const p = PRESETS.find((x) => x.id === presetSel.value);
    if (!p) return;
    stopPlay();
    state.presetId = p.id;
    state.spin = p.spin;
    state.allowSuction = p.suction;
    state.wells = buildWells(p);
    state.selected = 0;
    state.frac = 0.5;
    sT.input.value = String(state.frac);
    sT.val.textContent = state.frac.toFixed(2);
    syncControls();
    requestPaint();
  });
  sQ.input.addEventListener("input", () => {
    stopPlay();
    selWell().strength = Number(sQ.input.value); // the Q slider edits the selected well
    sQ.val.textContent = selWell().strength.toFixed(2);
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
  solverSel.addEventListener("change", () => {
    stopPlay();
    state.tol = Number(solverSel.value); // tighter tol ⇒ smaller steps ⇒ the local err / drift shrink
    requestPaint();
  });

  // ---- draggable wells: add / remove / select / drag (F1.2) -----------------
  const worldAt = (e: PointerEvent): Pt => {
    const r = canvas.getBoundingClientRect();
    return net.toWorld(e.clientX - r.left, e.clientY - r.top);
  };
  const hitTolWorld = (): number => {
    const a = net.toWorld(0, 0);
    const b = net.toWorld(0, 14);
    return Math.hypot(a[0] - b[0], a[1] - b[1]) || 0.1;
  };
  const insideInitial = (w: Pt): boolean => {
    const fr0 = cache?.frames[0]; // keep a well inside the initial droplet so the evolution starts valid
    return !!fr0 && invertMap(fr0.coeffs, w) !== null;
  };
  addWellBtn.addEventListener("click", () => {
    stopPlay();
    const base = selWell();
    let lab: Pt = [base.lab[0] + 0.3, base.lab[1] + 0.3];
    if (!insideInitial(lab)) lab = insideInitial([0, 0]) ? [0, 0] : [base.lab[0], base.lab[1]];
    state.wells.push({ lab, strength: 1 });
    state.selected = state.wells.length - 1;
    syncControls();
    requestPaint();
  });
  delWellBtn.addEventListener("click", () => {
    if (state.wells.length <= 1) return; // always keep at least one well
    stopPlay();
    state.wells.splice(state.selected, 1);
    state.selected = Math.min(state.selected, state.wells.length - 1);
    syncControls();
    requestPaint();
  });
  const nearestWell = (w: Pt): number => {
    let best = -1;
    let bestD = hitTolWorld();
    state.wells.forEach((wl, i) => {
      const d = Math.hypot(w[0] - wl.lab[0], w[1] - wl.lab[1]);
      if (d <= bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  };
  canvas.addEventListener("pointerdown", (e) => {
    const i = nearestWell(worldAt(e));
    if (i < 0) return;
    stopPlay();
    state.selected = i; // click selects the well
    dragWell = i;
    syncControls();
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
    requestPaint();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (dragWell < 0) return;
    const w = worldAt(e);
    // Keep the well inside the INITIAL droplet (frame 0), so the evolution starts valid; a later exit
    // under suction is caught by the driver's per-frame "well left the fluid" stop.
    if (insideInitial(w)) {
      state.wells[dragWell].lab = [w[0], w[1]];
      requestPaint();
    }
  });
  const endWellDrag = (): void => {
    if (dragWell < 0) return;
    dragWell = -1;
    requestPaint(); // re-evolve with the moved well (the cache key changed)
  };
  canvas.addEventListener("pointerup", endWellDrag);
  canvas.addEventListener("pointercancel", endWellDrag);

  window.addEventListener("resize", requestPaint);
  requestPaint();
}

runWithFatalBoundary(main);
