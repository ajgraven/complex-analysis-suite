// apps/argument-principle — an educational visualizer for the argument principle.
//
// The theorem: the winding number of the image curve f(γ) about the origin equals the number of zeros
// minus poles of f enclosed by the contour γ. Phase 2 makes BOTH sides visible and shows them agree:
// the zeros/poles/critical points are located (exact rational root-finding, or a transcendental grid
// estimate), marked in the z-plane, counted inside γ, and displayed beside the winding of f(γ) — with
// honest `=` / `≈` labels. Phase 1 supplied the live dual view (cursor contour, pan/zoom, KaTeX).
import "./styles/main.css";
import "katex/dist/katex.min.css";
import katex from "katex";
import { parse } from "@cas/expr/parser";
import { makeComplexFn } from "@cas/expr/evaluate";
import { toLatex } from "@cas/expr/latex";
import type { Node } from "@cas/expr/ast";
import type { Complex } from "@cas/expr/complex";
import {
  DEFAULT_VIEW_STATE,
  decodeArgPrincipleState,
  encodeArgPrincipleState,
  type ArgPrincipleViewState,
} from "./viewState.js";
import { FUNCTION_PRESETS, presetIdForExpr } from "./presets.js";
import {
  contourSamples,
  insideContour,
  contourBBox,
  contourPointAt,
  pathStats,
  orientCCW,
  type ContourShape,
} from "./contour.js";
import { windingTurns, windingReliable, partialWindingTurns } from "./winding.js";
import {
  planeMap,
  drawAxes,
  drawPolyline,
  drawDot,
  drawX,
  drawDiamond,
  drawOrderBadge,
  fitViewport,
  type AxisColors,
  type PlaneMap,
  type Vec2,
  type Viewport,
} from "./render/plane.js";
import { attachPanZoom, attachContourPlane } from "./render/nav.js";
import { findSingularities, countInside, type Region, type Singularities } from "./singularities.js";
import { importEnvelopeText, type ImportedMap } from "./interchange/importMap.js";

const C0: Complex = [0, 0];
const NO_SING: Singularities = { zeros: [], poles: [], critical: [], differentiable: true, exact: false };

interface Model {
  readonly ast: Node | null;
  readonly f: (z: Vec2) => Vec2;
  readonly latex: string | null;
  readonly error: string | null;
}

function buildModel(expr: string): Model {
  try {
    const ast = parse(expr);
    const fn = makeComplexFn(ast);
    let latex: string | null = null;
    try {
      latex = toLatex(ast);
    } catch {
      latex = null;
    }
    return {
      ast,
      f: (z: Vec2): Vec2 => {
        const zc: Complex = [z[0], z[1]];
        const w = fn(zc, C0);
        return [w[0], w[1]];
      },
      latex,
      error: null,
    };
  } catch (e) {
    return {
      ast: null,
      f: (): Vec2 => [NaN, NaN],
      latex: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}
function axisColors(): AxisColors {
  return { grid: cssVar("--grid", "#2a3140"), axis: cssVar("--axis", "#4a5468") };
}

function createThemeToggle(onChange: () => void): HTMLButtonElement {
  const KEY = "ap.theme";
  const ORDER = ["auto", "dark", "light"] as const;
  type Choice = (typeof ORDER)[number];
  const LABEL: Record<Choice, string> = { auto: "Theme: auto", dark: "Theme: dark", light: "Theme: light" };
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "ghost";
  btn.setAttribute("aria-label", "Toggle colour theme");
  const read = (): Choice => {
    let v: string | null = null;
    try {
      v = localStorage.getItem(KEY);
    } catch {
      v = null;
    }
    return v === "dark" || v === "light" ? v : "auto";
  };
  const apply = (c: Choice): void => {
    if (c === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = c;
    btn.textContent = LABEL[c];
  };
  let current = read();
  apply(current);
  btn.addEventListener("click", () => {
    current = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
    try {
      if (current === "auto") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, current);
    } catch {
      /* storage unavailable */
    }
    apply(current);
    onChange();
  });
  return btn;
}

function makeCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.className = "plane";
  return c;
}
function button(label: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "ghost";
  b.textContent = label;
  return b;
}

function checkbox(label: string, checked: boolean): { root: HTMLLabelElement; input: HTMLInputElement } {
  const root = document.createElement("label");
  root.className = "check";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  const span = document.createElement("span");
  span.textContent = label;
  root.append(input, span);
  return { root, input };
}

interface Cell {
  readonly root: HTMLElement;
  set(value: string, tag: string): void;
}
function metricCell(label: string, accent: string): Cell {
  const root = document.createElement("div");
  root.className = "cell";
  const l = document.createElement("div");
  l.className = "cl";
  l.textContent = label;
  const v = document.createElement("div");
  v.className = "cv";
  v.style.color = accent;
  root.append(l, v);
  return {
    root,
    set(value: string, tag: string): void {
      v.innerHTML = `${value}<span class="tag">${tag}</span>`;
    },
  };
}

function main(): void {
  const app = document.getElementById("app");
  if (!app) return;
  app.textContent = "";

  // A suite hand-off arrives as an `#s=` interchange link; the app's own share-links are `#vs=`.
  const rawHash = window.location.hash;
  let imported: ImportedMap | null = null;
  let importError: string | null = null;
  if (rawHash.startsWith("#s=")) {
    try {
      imported = importEnvelopeText(rawHash);
    } catch (e) {
      importError = e instanceof Error ? e.message : String(e);
    }
  }
  const fromLink = imported ? null : decodeArgPrincipleState(rawHash);
  let state: ArgPrincipleViewState = imported
    ? {
        ...DEFAULT_VIEW_STATE,
        map: {
          expr: imported.expr,
          vars: ["z"],
          antiholomorphic: /conjugate/.test(imported.expr),
        },
        ...(imported.center
          ? {
              zView: { centerRe: imported.center.re, centerIm: imported.center.im, zoom: DEFAULT_VIEW_STATE.zView.zoom },
              contour: { ...DEFAULT_VIEW_STATE.contour, centerRe: imported.center.re, centerIm: imported.center.im },
            }
          : {}),
      }
    : (fromLink ?? DEFAULT_VIEW_STATE);
  let model = buildModel(state.map.expr);
  let sing: Singularities = NO_SING;
  let draftPath: Vec2[] | null = null; // the freehand path being drawn (transient, not persisted)
  const anim = { on: false, t: 0, speed: 0.25 }; // traversal animation (transient)
  let animRaf = 0;
  let animLast = 0;

  // ---- DOM shell -----------------------------------------------------------
  const topbar = document.createElement("header");
  topbar.className = "topbar";
  const brand = document.createElement("div");
  brand.className = "brand";
  brand.innerHTML = "<strong>Argument Principle</strong><span>winding = zeros − poles</span>";
  const spacer = document.createElement("div");
  spacer.className = "spacer";
  const clearBtn = button("Clear drawn curve");
  const fitBtn = button("Fit image");
  const resetBtn = button("Reset views");
  const themeBtn = createThemeToggle(() => schedule());
  topbar.append(brand, spacer, clearBtn, fitBtn, resetBtn, themeBtn);

  const toolbar = document.createElement("div");
  toolbar.className = "toolbar";
  const presetWrap = document.createElement("label");
  presetWrap.className = "field";
  presetWrap.innerHTML = "<span>Preset</span>";
  const presetSel = document.createElement("select");
  for (const p of FUNCTION_PRESETS) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    presetSel.append(opt);
  }
  presetWrap.append(presetSel);
  const exprWrap = document.createElement("label");
  exprWrap.className = "field grow";
  exprWrap.innerHTML = "<span>f(z) =</span>";
  const exprInput = document.createElement("input");
  exprInput.type = "text";
  exprInput.spellcheck = false;
  exprInput.autocomplete = "off";
  exprInput.value = state.map.expr;
  exprWrap.append(exprInput);
  const radiusWrap = document.createElement("label");
  radiusWrap.className = "field";
  const radiusLabel = document.createElement("span");
  radiusWrap.append(radiusLabel);
  const radius = document.createElement("input");
  radius.type = "range";
  radius.min = "0.05";
  radius.max = "4";
  radius.step = "0.01";
  radius.value = String(state.contour.radius);
  radiusWrap.append(radius);
  toolbar.append(presetWrap, exprWrap, radiusWrap);

  const controls2 = document.createElement("div");
  controls2.className = "toolbar sub";
  const resWrap = document.createElement("label");
  resWrap.className = "field";
  const resLabel = document.createElement("span");
  resWrap.append(resLabel);
  const resInput = document.createElement("input");
  resInput.type = "range";
  resInput.min = "60";
  resInput.max = "2000";
  resInput.step = "20";
  resInput.value = String(state.render.resolution);
  resWrap.append(resInput);
  const playBtn = button("▶ Traverse γ");
  const speedWrap = document.createElement("label");
  speedWrap.className = "field";
  const speedLabel = document.createElement("span");
  speedLabel.textContent = "Speed";
  const speedInput = document.createElement("input");
  speedInput.type = "range";
  speedInput.min = "0.05";
  speedInput.max = "1";
  speedInput.step = "0.05";
  speedInput.value = "0.25";
  speedWrap.append(speedLabel, speedInput);
  const domainChk = checkbox("Domain curve γ", state.render.showDomainCurve);
  const imageChk = checkbox("Image curve f(γ)", state.render.showImageCurve);
  const drawHint = document.createElement("span");
  drawHint.className = "hint";
  drawHint.textContent = "Tip: left-drag on the z-plane to draw a custom contour.";
  controls2.append(resWrap, playBtn, speedWrap, domainChk.root, imageChk.root, drawHint);

  const formula = document.createElement("div");
  formula.className = "formula";
  const errEl = document.createElement("div");
  errEl.className = "err";
  errEl.hidden = true;
  const importNote = document.createElement("div");
  importNote.className = "import-note";
  importNote.hidden = true;

  const stage = document.createElement("div");
  stage.className = "stage";
  const zPane = document.createElement("figure");
  zPane.className = "pane";
  const zCanvas = makeCanvas();
  const zCap = document.createElement("figcaption");
  zCap.innerHTML =
    "<b>Domain</b> — z-plane · move to place γ, right-drag pan, scroll zoom · " +
    '<span class="key zero">✕ zero</span> <span class="key pole">✕ pole</span> ' +
    '<span class="key crit">◆ f′=0</span>';
  zPane.append(zCanvas, zCap);
  const wPane = document.createElement("figure");
  wPane.className = "pane";
  const wCanvas = makeCanvas();
  const wCap = document.createElement("figcaption");
  wCap.innerHTML = "<b>Image</b> — w = f(z) · f(γ) · drag pan, scroll zoom";
  wPane.append(wCanvas, wCap);
  stage.append(zPane, wPane);

  const readout = document.createElement("div");
  readout.className = "readout";
  const metrics = document.createElement("div");
  metrics.className = "metrics";
  const zerosCell = metricCell("Zeros inside", cssVar("--accent", "#3bb6c0"));
  const polesCell = metricCell("Poles inside", cssVar("--pole", "#e8608f"));
  const nmpCell = metricCell("Zeros − Poles", cssVar("--text", "#e7eaf2"));
  const windCell = metricCell("Winding of f(γ)", cssVar("--gold", "#dbb057"));
  metrics.append(zerosCell.root, polesCell.root, nmpCell.root, windCell.root);
  const status = document.createElement("div");
  status.className = "status";
  const animEl = document.createElement("div");
  animEl.className = "anim";
  animEl.hidden = true;
  const noteEl = document.createElement("p");
  noteEl.className = "note";
  noteEl.innerHTML =
    "The argument principle: the winding number of f(γ) about 0 equals (zeros − poles) of f enclosed by " +
    "γ. Counts marked <span class=\"approx\">=</span> are exact (f rational, roots found algebraically); " +
    "<span class=\"approx\">≈</span> are numerical estimates (transcendental f, or a winding read from " +
    "the sampled image).";
  readout.append(metrics, status, animEl, noteEl);

  app.append(topbar, importNote, toolbar, controls2, formula, errEl, stage, readout);
  if (imported) {
    importNote.hidden = false;
    importNote.textContent = `Imported f(z) from ${imported.source}${imported.note ? ` — ${imported.note}` : ""}.`;
  } else if (importError) {
    importNote.hidden = false;
    importNote.classList.add("bad");
    importNote.textContent = `Could not import the hand-off link: ${importError}`;
  }

  // ---- state + finder ------------------------------------------------------
  /** The contour in effect: the path being drawn (if any), otherwise the committed contour. */
  function effectiveContour(): ContourShape {
    if (draftPath && draftPath.length >= 2) {
      const s = pathStats(draftPath);
      return { kind: "path", points: draftPath, centerRe: s.centerRe, centerIm: s.centerIm, radius: s.radius };
    }
    return state.contour;
  }
  function canvasAspect(canvas: HTMLCanvasElement): number {
    const r = canvas.getBoundingClientRect();
    return r.height > 0 ? r.width / r.height : 1;
  }
  function imagePoints(): Vec2[] {
    if (model.error) return [];
    return contourSamples(effectiveContour(), state.render.resolution).map((p) => model.f(p));
  }
  /** The finder's search region: the union of the z-view and the contour, padded — so every marker in
   *  view and every root inside γ is covered (the transcendental grid only finds what it samples). */
  function searchRegion(): Region {
    const halfH = 2 / state.zView.zoom;
    const halfW = halfH * canvasAspect(zCanvas);
    const bb = contourBBox(effectiveContour());
    const xMin = Math.min(state.zView.centerRe - halfW, bb.minX);
    const xMax = Math.max(state.zView.centerRe + halfW, bb.maxX);
    const yMin = Math.min(state.zView.centerIm - halfH, bb.minY);
    const yMax = Math.max(state.zView.centerIm + halfH, bb.maxY);
    return {
      cx: (xMin + xMax) / 2,
      cy: (yMin + yMax) / 2,
      halfW: ((xMax - xMin) / 2) * 1.1,
      halfH: ((yMax - yMin) / 2) * 1.1,
    };
  }
  function refreshSing(): void {
    sing = model.error || !model.ast ? NO_SING : findSingularities(model.ast, searchRegion());
  }

  let frame = 0;
  function schedule(): void {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      render();
    });
  }
  let persistTimer = 0;
  function schedulePersist(): void {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = window.setTimeout(() => {
      persistTimer = 0;
      history.replaceState(null, "", encodeArgPrincipleState(state));
    }, 200);
  }
  function commit(next: ArgPrincipleViewState, refresh: boolean): void {
    state = next;
    if (refresh) refreshSing();
    schedule();
    schedulePersist();
  }
  function setExpr(expr: string): void {
    model = buildModel(expr);
    state = { ...state, map: { ...state.map, expr, antiholomorphic: /conjugate/.test(expr) } };
    const id = presetIdForExpr(expr);
    if (id) presetSel.value = id;
    refreshSing();
    renderFormula();
    schedule();
    schedulePersist();
  }
  function fitImage(): void {
    commit({ ...state, wView: fitViewport(imagePoints(), canvasAspect(wCanvas)) }, false);
  }

  // ---- rendering -----------------------------------------------------------
  function renderFormula(): void {
    if (model.error) {
      errEl.hidden = false;
      errEl.textContent = `Parse error: ${model.error}`;
      formula.classList.add("dim");
      return;
    }
    errEl.hidden = true;
    errEl.textContent = "";
    formula.classList.remove("dim");
    if (model.latex) {
      try {
        katex.render(`f(z) = ${model.latex}`, formula, { throwOnError: false, displayMode: true });
        return;
      } catch {
        /* fall through */
      }
    }
    formula.textContent = `f(z) = ${state.map.expr}`;
  }

  function drawPane(
    canvas: HTMLCanvasElement,
    view: Viewport,
    paint: (ctx: CanvasRenderingContext2D, map: PlaneMap) => void,
  ): void {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const wCss = Math.max(1, Math.floor(rect.width));
    const hCss = Math.max(1, Math.floor(rect.height));
    canvas.width = Math.floor(wCss * dpr);
    canvas.height = Math.floor(hCss * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, wCss, hCss);
    const map = planeMap(view, wCss, hCss);
    drawAxes(ctx, map, axisColors());
    paint(ctx, map);
  }

  function render(): void {
    const contour = effectiveContour();
    const zPts = contourSamples(contour, state.render.resolution);
    const wPts: Vec2[] = model.error ? [] : zPts.map((p) => model.f(p));

    const cZero = cssVar("--accent", "#3bb6c0");
    const cPole = cssVar("--pole", "#e8608f");
    const cCrit = cssVar("--gold", "#dbb057");
    const cCenter = cssVar("--muted", "#8c95a9");
    const cTrace = cssVar("--trace", "#8b7bf0");

    clearBtn.disabled = state.contour.kind !== "path" && !draftPath;

    // The animated traversal point (E1): the same parameter t marks a point on γ and its image on f(γ).
    const showAnim = anim.on || anim.t > 0;
    const zAnim = showAnim ? contourPointAt(contour, anim.t, state.render.resolution) : null;
    const wAnim = zAnim && !model.error ? model.f(zAnim) : null;

    drawPane(zCanvas, state.zView, (ctx, map) => {
      if (state.render.showDomainCurve) {
        drawPolyline(ctx, map, zPts, { closed: true, color: cZero, width: 2 });
      }
      for (const c of sing.critical) drawDiamond(ctx, map, c.z, cCrit);
      for (const p of sing.poles) {
        drawX(ctx, map, p.z, cPole);
        drawOrderBadge(ctx, map, p.z, p.order, cPole);
      }
      for (const z of sing.zeros) {
        drawX(ctx, map, z.z, cZero);
        drawOrderBadge(ctx, map, z.z, z.order, cZero);
      }
      if (contour.kind === "circle") drawDot(ctx, map, [contour.centerRe, contour.centerIm], cCenter, 3);
      if (zAnim) drawDot(ctx, map, zAnim, cTrace, 6);
    });
    drawPane(wCanvas, state.wView, (ctx, map) => {
      if (state.render.showImageCurve && wPts.length > 1) {
        drawPolyline(ctx, map, wPts, { closed: true, rainbow: true, width: 2 });
      }
      drawDot(ctx, map, [0, 0], cPole, 5);
      if (wAnim && Number.isFinite(wAnim[0]) && Number.isFinite(wAnim[1])) {
        const o = map.toPx([0, 0]);
        const pp = map.toPx(wAnim);
        ctx.save();
        ctx.strokeStyle = cTrace;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(o[0], o[1]);
        ctx.lineTo(pp[0], pp[1]); // the arg vector: origin → f(z(t))
        ctx.stroke();
        ctx.restore();
        drawDot(ctx, map, wAnim, cTrace, 6);
      }
    });

    updateReadout(contour, wPts);

    if (showAnim && !model.error && wPts.length > 1) {
      const swept = partialWindingTurns(wPts, anim.t);
      const full = Math.round(windingTurns(wPts));
      animEl.hidden = false;
      animEl.innerHTML =
        `▶ traversing γ: t = ${anim.t.toFixed(2)} · arg of f(z) swept <b>${swept.toFixed(2)}</b> turns` +
        ` — reaches <b>${full}</b> over the full loop (that is the winding number).`;
    } else {
      animEl.hidden = true;
    }
  }

  function updateReadout(contour: ContourShape, wPts: readonly Vec2[]): void {
    const haveImage = !model.error && wPts.length > 1;
    const turns = haveImage ? windingTurns(wPts) : NaN;
    const winding = haveImage ? Math.round(turns) : NaN;
    const reliable = haveImage && windingReliable(wPts);

    if (!sing.differentiable) {
      zerosCell.set("—", "");
      polesCell.set("—", "");
      nmpCell.set("—", "");
      windCell.set(haveImage ? String(winding) : "—", haveImage ? "≈" : "");
      status.className = "status warn";
      status.textContent = "f is not holomorphic — the argument principle does not apply (no f′).";
      return;
    }

    const inside = (p: Vec2): boolean => insideContour(p, contour);
    const zi = countInside(sing.zeros, inside);
    const pi = countInside(sing.poles, inside);
    const nmp = zi - pi;
    const eq = sing.exact ? "=" : "≈";
    zerosCell.set(String(zi), eq);
    polesCell.set(String(pi), eq);
    nmpCell.set(String(nmp), eq);
    windCell.set(haveImage ? String(winding) : "—", haveImage ? "≈" : "");

    if (!haveImage) {
      status.className = "status";
      status.textContent = "";
    } else if (!reliable) {
      status.className = "status warn";
      status.textContent = "γ passes near a singularity — the winding estimate is unreliable; nudge γ.";
    } else if (nmp === winding) {
      status.className = "status ok";
      status.textContent = `✓ winding ${winding} = zeros ${zi} − poles ${pi}  ·  accumulated turns ${turns.toFixed(3)}`;
    } else {
      status.className = "status warn";
      status.textContent = `mismatch: winding ${winding} vs zeros − poles ${nmp} — a root may sit near γ, or the estimate is under-resolved.`;
    }
  }

  // ---- animation -----------------------------------------------------------
  function animFrame(ts: number): void {
    if (!anim.on) {
      animRaf = 0;
      return;
    }
    const dt = animLast ? (ts - animLast) / 1000 : 0;
    animLast = ts;
    anim.t = (anim.t + dt * anim.speed) % 1;
    render();
    animRaf = requestAnimationFrame(animFrame);
  }
  function setPlaying(on: boolean): void {
    anim.on = on;
    playBtn.textContent = on ? "⏸ Pause traversal" : "▶ Traverse γ";
    if (on) {
      animLast = 0;
      if (!animRaf) animRaf = requestAnimationFrame(animFrame);
    } else {
      schedule();
    }
  }

  // ---- interaction wiring --------------------------------------------------
  playBtn.addEventListener("click", () => setPlaying(!anim.on));
  speedInput.addEventListener("input", () => {
    const s = Number(speedInput.value);
    if (Number.isFinite(s) && s > 0) anim.speed = s;
  });
  presetSel.addEventListener("change", () => {
    const p = FUNCTION_PRESETS.find((q) => q.id === presetSel.value);
    if (p) {
      exprInput.value = p.expr;
      setExpr(p.expr);
      fitImage();
    }
  });
  exprInput.addEventListener("input", () => setExpr(exprInput.value));
  radius.addEventListener("input", () => {
    const r = Number(radius.value);
    if (Number.isFinite(r) && r > 0) {
      radiusLabel.textContent = `Radius r = ${r.toFixed(2)}`;
      commit({ ...state, contour: { ...state.contour, radius: r } }, true);
    }
  });
  resetBtn.addEventListener("click", () => {
    commit({ ...state, zView: DEFAULT_VIEW_STATE.zView, wView: DEFAULT_VIEW_STATE.wView }, true);
  });
  fitBtn.addEventListener("click", () => fitImage());
  resInput.addEventListener("input", () => {
    const r = Math.round(Number(resInput.value));
    if (Number.isFinite(r) && r >= 3) {
      resLabel.textContent = `Resolution ${r}`;
      commit({ ...state, render: { ...state.render, resolution: r } }, false);
    }
  });
  domainChk.input.addEventListener("change", () =>
    commit({ ...state, render: { ...state.render, showDomainCurve: domainChk.input.checked } }, false),
  );
  imageChk.input.addEventListener("change", () =>
    commit({ ...state, render: { ...state.render, showImageCurve: imageChk.input.checked } }, false),
  );
  clearBtn.addEventListener("click", () => {
    draftPath = null;
    commit({ ...state, contour: { ...state.contour, kind: "circle" } }, true);
  });

  attachContourPlane(zCanvas, {
    getView: () => state.zView,
    setView: (v: Viewport) => commit({ ...state, zView: v }, true),
    onHover: (world: Vec2) => {
      if (state.contour.kind !== "circle") return; // in path mode the contour is fixed until cleared
      commit({ ...state, contour: { ...state.contour, centerRe: world[0], centerIm: world[1] } }, false);
    },
    onDrawStart: (world: Vec2) => {
      draftPath = [world];
      schedule();
    },
    onDrawMove: (world: Vec2) => {
      if (!draftPath) return;
      const last = draftPath[draftPath.length - 1];
      const minD = (2 / state.zView.zoom) * 0.008; // decimate to ~1/125 of the view height
      if (!last || Math.hypot(world[0] - last[0], world[1] - last[1]) > minD) {
        draftPath.push(world);
        schedule();
      }
    },
    onDrawEnd: () => {
      if (draftPath && draftPath.length >= 3) {
        const points = orientCCW(draftPath); // normalize to positive orientation so winding = N − P
        const s = pathStats(points);
        commit(
          { ...state, contour: { kind: "path", centerRe: s.centerRe, centerIm: s.centerIm, radius: s.radius, points } },
          true,
        );
      }
      draftPath = null;
      schedule();
    },
  });
  attachPanZoom(
    wCanvas,
    () => state.wView,
    (v: Viewport) => commit({ ...state, wView: v }, false),
  );
  window.addEventListener("resize", () => schedule());

  // ---- boot ----------------------------------------------------------------
  const initialId = presetIdForExpr(state.map.expr);
  if (initialId) presetSel.value = initialId;
  radiusLabel.textContent = `Radius r = ${state.contour.radius.toFixed(2)}`;
  resLabel.textContent = `Resolution ${state.render.resolution}`;
  refreshSing();
  renderFormula();
  render();
  if (!fromLink) fitImage();
  history.replaceState(null, "", encodeArgPrincipleState(state));
}

main();
