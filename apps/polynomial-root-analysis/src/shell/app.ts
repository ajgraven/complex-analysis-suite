// The page: two rails around a stage of two panes (PLAN §4.3, §5), over one `ShellState`.
//
// Everything a reader can do ends in `commit(state)`: the state is resolved (`resolveState`, pure),
// pushed on the undo stack, rendered, and written to the address bar. A drag is the one exception —
// its frames update a LIVE polynomial straight from the engine and commit once, on release, so a
// drag is one undo step (DESIGN §7) and a ℚ-mode drag snaps once, where the reader let go.
import { attachCanvasA11y, patch } from "@cas/ui";
import { Frac, Gauss, QiPoly, renderQiPolyText } from "@cas/exact";
import {
  fromCoeffs,
  fromRoots,
  partnerOf,
  type Cx,
  type Polynomial,
  type Ring,
} from "../engine/polynomial.js";
import { parsePolynomial } from "../engine/parse.js";
import { snapRational } from "../engine/rational.js";
import { APP_NAME, MONODROMY, PANE } from "../engine/vocabulary.js";
import type { Loop } from "../engine/loops/loop.js";
import { motion as makeMotion, FRAMES_PER_MOVE } from "../engine/loops/motion.js";
import { crossings, pathsAsFrames } from "../engine/loops/braid.js";
import { loopPath } from "../engine/loops/loop.js";
import { lassoGroup } from "../engine/loops/group.js";
import { monodromyGroupCert } from "../engine/certify.js";
import { commuteLastTwo, inverted, withLasso } from "./loopEdit.js";
import {
  scaleOf,
  toScreen,
  toWorld,
  worldRange,
  zoomAbout,
  type Viewport,
} from "../ui/camera.js";
import {
  COEFF_HALF,
  ROOT_RADIUS,
  drawAxes,
  drawBranchPoints,
  drawCoeffs,
  drawCritical,
  drawDiscs,
  drawHull,
  drawRegionOutlines,
  drawRoots,
  drawTrails,
  drawLoopPath,
  drawBranchNumbers,
  drawBraid,
} from "../ui/ink.js";
import { Portrait } from "../ui/portrait.js";
import { figureBytes } from "./figure.js";
import { formatCx } from "./format.js";
import { leftRail, rightRail } from "./rails.js";
import {
  DEFAULT_STATE,
  frame,
  memoRun,
  resolvePolynomial,
  resolveState,
  specOf,
  type Cam,
  type Resolution,
  type ShellState,
} from "./state.js";
import { decodeShell, encodeShell } from "./viewState.js";

type PaneId = "roots" | "coefficients";
/** What a pointer or the keyboard is holding. */
type Target =
  | { readonly kind: "root"; readonly index: number }
  | { readonly kind: "coeff"; readonly index: number };

interface Pane {
  readonly id: PaneId;
  readonly section: HTMLElement;
  readonly stack: HTMLElement;
  readonly gl: HTMLCanvasElement | null;
  readonly ink: HTMLCanvasElement;
  readonly heading: HTMLElement;
  readonly legend: HTMLElement;
  portrait: Portrait | null;
  announce: (message: string) => void;
}

export interface App {
  currentState(): ShellState;
  applyState(s: ShellState): void;
  /** The polynomial on screen right now (mid-drag included). */
  live(): Resolution;
  /** For tests and the keyboard: the same actions the pointer performs. */
  actions(): {
    type(text: string): void;
    setRing(ring: Ring): void;
    setOverlay(on: boolean): void;
    setDiscs(on: boolean): void;
    select(target: Target | null): void;
    moveTo(target: Target, to: Cx): void;
    release(): void;
    undo(): void;
    redo(): void;
    nudge(dx: number, dy: number, pane: PaneId): void;
    setCoefficient(j: number | null): void;
    setLoop(loop: Loop | null): void;
    lasso(k: number): void;
    setBuilding(on: boolean): void;
    invert(): void;
    commute(): void;
    /** The pen: start (or finish) drawing, and place a vertex at a world point. */
    pen(): void;
    penAt(z: Cx): void;
    play(): void;
    group(): void;
  };
  /** What the braid strip is showing: strand count and crossings. */
  braid(): { strands: number; crossings: number } | null;
  refusal(): string | null;
}

const HISTORY = 200;

function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  props: Record<string, string> = {},
): HTMLElementTagNameMap[K] {
  const e = doc.createElement(tag);
  for (const [k, v] of Object.entries(props)) e.setAttribute(k, v);
  return e;
}

export function mountApp(host: HTMLElement): App {
  const doc = host.ownerDocument;
  const win = doc.defaultView;

  // ── The page's frame: a bar, then ONE <main> holding the rails and the stage (M6.4's structure).
  const header = el(doc, "header", { class: "bar" });
  const h1 = el(doc, "h1", { class: "brand" });
  h1.textContent = APP_NAME;
  header.append(h1);
  const main = el(doc, "main", { class: "shell" });
  const linkRefusal = el(doc, "p", { class: "link-refusal", role: "alert" });
  linkRefusal.hidden = true;
  const left = el(doc, "section", {
    class: "rail rail-left",
    "aria-label": "What is being analysed",
  });
  const stage = el(doc, "div", { class: "stage" });
  const right = el(doc, "section", {
    class: "rail rail-right",
    "aria-label": "What it proves",
  });
  main.append(linkRefusal, left, stage, right);
  host.replaceChildren(header, main);

  const panes: Record<PaneId, Pane> = {
    roots: buildPane("roots", true),
    coefficients: buildPane("coefficients", false),
  };

  // ── The braid strip (PLAN §4.3): below the panes, the last loop's or motion's strands over time.
  const braidSection = el(doc, "section", {
    class: "braid",
    "aria-labelledby": "braid-title",
  });
  const braidTitle = el(doc, "h2", { id: "braid-title" });
  braidTitle.textContent = "Braid";
  const braidCanvas = el(doc, "canvas", { class: "braid-canvas", role: "img" });
  const braidLegend = el(doc, "p", { class: "pane-legend" });
  braidLegend.textContent = MONODROMY.braid;
  braidSection.append(braidTitle, braidCanvas, braidLegend);
  stage.append(braidSection);

  function buildPane(id: PaneId, withGl: boolean): Pane {
    const section = el(doc, "section", {
      class: "pane",
      "data-pane": id,
      "aria-labelledby": `pane-${id}`,
    });
    const heading = el(doc, "h2", { id: `pane-${id}` });
    heading.textContent = id === "roots" ? PANE.roots : PANE.coefficients;
    const stack = el(doc, "div", { class: "canvas-stack" });
    const gl = withGl ? el(doc, "canvas", { class: "gl" }) : null;
    const ink = el(doc, "canvas", { class: "ink" });
    if (gl) stack.append(gl);
    stack.append(ink);
    const legend = el(doc, "p", { class: "pane-legend" });
    section.append(heading, stack, legend);
    stage.append(section);
    const a11y = attachCanvasA11y(ink, {
      label: heading.textContent ?? id,
      role: "application",
      render: gl ?? undefined,
      liveRegionHost: section,
    });
    const pane: Pane = {
      id,
      section,
      stack,
      gl,
      ink,
      heading,
      legend,
      portrait: null,
      announce: a11y.announce,
    };
    if (gl) {
      try {
        pane.portrait = new Portrait(gl);
      } catch {
        // No WebGL2: the roots, discs and every certificate still work; only the backdrop is missing,
        // and the legend says so rather than leaving a blank panel to be read as "no phase".
        pane.portrait = null;
      }
    }
    return pane;
  }

  // ── State.
  let state: ShellState = DEFAULT_STATE;
  let resolution: Resolution = resolveState(state);
  let live: Resolution = resolution;
  const undoStack: ShellState[] = [];
  const redoStack: ShellState[] = [];
  let selected: Target | null = null;
  let dragging: Target | null = null;
  let textRefusal: string | null = null;
  let ringRefusal: string | null = null;
  let copyStatus = "";
  let pendingText: string | null = null;
  /** Root trails by LABEL, for the drag in progress (and kept after it when `state.trails`). */
  const trails = new Map<number, Cx[]>();
  // Loop authoring and playback — session state, never in the permalink (the WORD is; these are how it
  // is being edited or shown).
  let building = false;
  let pen: Cx[] | null = null;
  let group: {
    cert: ReturnType<typeof monodromyGroupCert>;
    order: number | null;
  } | null = null;
  let motionInfo: { fallback: boolean; lenses: number } | null = null;
  /** The braid strip's strands (frames × roots) and their labels. */
  let braid: { frames: Cx[][]; labels: readonly number[] } | null = null;
  /** An animation in progress: roots (and, for a motion, coefficients) per frame. */
  let anim: {
    roots: Cx[][];
    coeffs: Cx[][] | null;
    f: number;
    labels: readonly number[];
  } | null = null;
  let animHandle: number | null = null;

  const initial = decodeShell(win?.location.hash ?? "");
  if (initial?.ok) {
    state = initial.state;
    resolution = resolveState(state);
    live = resolution;
  } else if (initial && !initial.ok) {
    linkRefusal.hidden = false;
    linkRefusal.textContent = `The link could not be opened: ${initial.reason}. Showing the default polynomial instead.`;
  }

  // ── The address bar, coalesced: history.replaceState is rate-limited by browsers.
  let hashTimer: ReturnType<typeof setTimeout> | null = null;
  function syncHash(): void {
    if (!win) return;
    if (hashTimer) clearTimeout(hashTimer);
    hashTimer = setTimeout(() => {
      hashTimer = null;
      win.history.replaceState(null, "", encodeShell(state));
    }, 250);
  }

  function commit(next: ShellState, prev?: Polynomial | null): void {
    const res = resolveState(next, prev ?? live.poly ?? undefined);
    if (!res.poly) {
      // A state that does not resolve is never committed; the refusal is shown where it was asked for.
      return;
    }
    if (JSON.stringify(next) !== JSON.stringify(state)) {
      undoStack.push(state);
      if (undoStack.length > HISTORY) undoStack.shift();
      redoStack.length = 0;
    }
    const before = sessionKey(state, resolution);
    state = next;
    resolution = res;
    live = res;
    if (sessionKey(state, res) !== before) resetSession();
    adoptRun();
    render();
    syncHash();
  }

  /** What the loop session belongs to: the polynomial and the coefficient that moves. */
  function sessionKey(s: ShellState, r: Resolution): string {
    return JSON.stringify([r.poly?.coeffs ?? null, s.coefficient]);
  }
  function resetSession(): void {
    group = null;
    motionInfo = null;
    braid = null;
    pen = null;
    stopAnim();
  }
  /**
   * A NEWLY set loop, certified: its paths become the braid and are played on the roots, and the roots
   * take the labels the proof gives them — the root that started as 2 is now where 4 was, so it is
   * drawn there in 2's colour. Adopted once per loop, not on every re-resolve: a later commit continues
   * the relabelled roots, and σ conjugated by itself is σ, so the card does not change under it.
   */
  let adopted = "";
  function adoptRun(): void {
    const run = resolution.loopRun;
    const key = JSON.stringify([sessionKey(state, resolution), state.loop]);
    if (key === adopted) return;
    adopted = key;
    motionInfo = null;
    const p = resolution.poly;
    if (!run || !run.ok || !p) return;
    const frames = pathsAsFrames(run.paths);
    braid = { frames, labels: p.labels };
    startAnim({ roots: frames, coeffs: null, f: 0, labels: p.labels });
    relabel(run.labelsAfter);
  }
  function relabel(labels: readonly number[]): void {
    const p = resolution.poly;
    if (!p) return;
    resolution = { ...resolution, poly: { ...p, labels } };
    live = resolution;
  }
  function stopAnim(): void {
    if (animHandle !== null && win) win.cancelAnimationFrame(animHandle);
    animHandle = null;
    anim = null;
  }
  function startAnim(a: NonNullable<typeof anim>): void {
    stopAnim();
    // No animation where there is no frame clock (jsdom, a background tab): the end state is the point.
    if (!win || typeof win.requestAnimationFrame !== "function" || a.roots.length < 2)
      return;
    anim = a;
    const perFrame = Math.max(1, Math.round(a.roots.length / 90));
    const tick = (): void => {
      if (!anim) return;
      anim.f += perFrame;
      if (anim.f >= anim.roots.length - 1) {
        anim = null;
        animHandle = null;
        render();
        return;
      }
      drawPane(panes.roots);
      if (!state.overlay) drawPane(panes.coefficients);
      animHandle = win.requestAnimationFrame(tick);
    };
    animHandle = win.requestAnimationFrame(tick);
  }

  // ── Viewports and hit testing.
  function viewport(p: Pane): Viewport {
    const r = p.stack.getBoundingClientRect();
    return {
      width: r.width || p.ink.clientWidth || 480,
      height: r.height || p.ink.clientHeight || 480,
    };
  }
  const paneFor = (t: Target): PaneId =>
    t.kind === "root" || state.overlay ? "roots" : "coefficients";
  const camOf = (id: PaneId): Cam => (id === "roots" ? state.rootCam : state.coeffCam);
  function setCam(id: PaneId, cam: Cam): void {
    state = id === "roots" ? { ...state, rootCam: cam } : { ...state, coeffCam: cam };
    render();
    syncHash();
  }

  function targetsIn(id: PaneId): Target[] {
    const p = live.poly;
    if (!p) return [];
    const roots: Target[] = p.roots.map((_, i) => ({ kind: "root", index: i }));
    const coeffs: Target[] = p.coeffs.map((_, k) => ({ kind: "coeff", index: k }));
    if (id === "roots") return state.overlay ? [...roots, ...coeffs] : roots;
    return state.overlay ? [] : coeffs;
  }

  function hit(id: PaneId, px: number, py: number): Target | null {
    const p = live.poly;
    if (!p) return null;
    const vp = viewport(panes[id]);
    const cam = camOf(id);
    let best: Target | null = null;
    let bestD = Infinity;
    for (const t of targetsIn(id)) {
      const w = t.kind === "root" ? p.roots[t.index] : p.coeffs[t.index];
      const [sx, sy] = toScreen(cam, vp, w);
      const d = Math.hypot(sx - px, sy - py);
      const reach = (t.kind === "root" ? ROOT_RADIUS : COEFF_HALF) + 6;
      if (d <= reach && d < bestD) {
        best = t;
        bestD = d;
      }
    }
    return best;
  }

  // ── Moving a point: the live polynomial follows the engine; nothing is committed until release.
  function ringForDrag(): Ring {
    // ℚ keeps its exactness at RELEST: during the drag the polynomial is real and approximate, and the
    // release snaps it (DESIGN §4.2).
    return state.ring === "Q" ? "R" : state.ring;
  }

  function moveTo(t: Target, to: Cx): void {
    const p = live.poly;
    if (!p) return;
    const ring = ringForDrag();
    let built;
    if (t.kind === "root") {
      const roots = [...p.roots];
      const i = t.index;
      if (ring === "R") {
        const j = partnerOf(p.roots, i);
        if (j === i)
          roots[i] = [to[0], 0]; // a real root stays on the axis
        else {
          const y =
            Math.abs(to[1]) < 1e-12 ? (p.roots[i][1] >= 0 ? 1e-12 : -1e-12) : to[1];
          roots[i] = [to[0], y];
          roots[j] = [to[0], -y];
        }
      } else roots[i] = to;
      built = fromRoots(roots, p.lead, ring, p.labels);
    } else {
      const coeffs = [...p.coeffs];
      const k = t.index;
      const next: Cx = ring === "C" ? to : [to[0], 0];
      coeffs[k] = next;
      built = fromCoeffs(coeffs, ring, p);
    }
    if (!built.ok) return;
    const poly = built.poly;
    live = resolvePolynomial(poly, state, true);
    // The root locus: each label's positions over this drag (DESIGN §4.2), cleared on release unless
    // the reader keeps them. Seeded with where the root started, so the first frame draws a segment.
    if (trails.size === 0 && p) p.roots.forEach((r, i) => trails.set(p.labels[i], [r]));
    poly.roots.forEach((r, i) => {
      const t0 = trails.get(poly.labels[i]);
      if (t0 && t0.length < 4000) t0.push(r);
    });
    dragging = t;
    render();
  }

  /** Half a pixel, in the units of the pane where coefficients are drawn — ℚ mode's snapping resolution. */
  function snapTolerance(): number {
    const id: PaneId = state.overlay ? "roots" : "coefficients";
    return 0.5 / scaleOf(camOf(id), viewport(panes[id]));
  }

  function release(): void {
    const t = dragging;
    dragging = null;
    const p = live.poly;
    if (!t || !p) return;
    if (!state.trails) trails.clear();
    // Dragging a coefficient is choosing it: its branch points are what the drag is moving through.
    const coefficient = t.kind === "coeff" ? t.index : state.coefficient;
    if (state.ring === "Q") {
      // Snap: a coefficient drag snaps the one coefficient that moved; a root drag moved them all.
      const prevExact = resolution.poly?.exact ?? null;
      const tol = snapTolerance();
      const coeffs: Gauss[] = p.coeffs.map((c, k) => {
        if (t.kind === "coeff" && k !== t.index && prevExact) return prevExact.coeff(k);
        return new Gauss(snapRational(c[0], tol), Frac.ZERO);
      });
      const exact = QiPoly.fromCoeffs(coeffs);
      if (exact.degree() !== p.degree) {
        live = resolution; // the leading coefficient snapped to zero: refuse the drag, keep what was
        render();
        return;
      }
      commit(
        {
          ...state,
          coefficient,
          loop: null,
          poly: { kind: "text", text: renderQiPolyText(exact, "z") },
        },
        p,
      );
      return;
    }
    commit({ ...state, coefficient, loop: null, poly: specOf(p) }, p);
  }

  // ── Pointer: drag a point, or pan the pane; the wheel zooms about the cursor.
  function wirePointer(pane: Pane): void {
    let panFrom: { x: number; y: number; cam: Cam } | null = null;
    const local = (e: MouseEvent): [number, number] => {
      const r = pane.ink.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    pane.ink.addEventListener("pointerdown", (e) => {
      const [x, y] = local(e);
      if (pen !== null && pane.id === (state.overlay ? "roots" : "coefficients")) {
        // The pen: a click places a vertex; the first snaps to the coefficient itself when close, so a
        // drawn loop starts where the coefficient is rather than being tethered to it.
        const cam = camOf(pane.id);
        const vp = viewport(pane);
        let z = toWorld(cam, vp, x, y);
        const base = live.loopContext?.base;
        if (pen.length === 0 && base) {
          const [bx, by] = toScreen(cam, vp, base);
          if (Math.hypot(bx - x, by - y) <= COEFF_HALF + 6) z = base;
        }
        penAt(z);
        return;
      }
      const t = hit(pane.id, x, y);
      pane.ink.setPointerCapture?.(e.pointerId);
      if (t) {
        selected = t;
        dragging = t;
        render();
      } else panFrom = { x, y, cam: camOf(pane.id) };
    });
    pane.ink.addEventListener("pointermove", (e) => {
      const [x, y] = local(e);
      if (dragging && paneFor(dragging) === pane.id)
        moveTo(dragging, toWorld(camOf(pane.id), viewport(pane), x, y));
      else if (panFrom) {
        const s = scaleOf(panFrom.cam, viewport(pane));
        setCam(pane.id, {
          ...panFrom.cam,
          cx: panFrom.cam.cx - (x - panFrom.x) / s,
          cy: panFrom.cam.cy + (y - panFrom.y) / s,
        });
      }
    });
    const end = (): void => {
      panFrom = null;
      if (dragging) release();
    };
    pane.ink.addEventListener("pointerup", end);
    pane.ink.addEventListener("pointercancel", end);
    pane.ink.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const [x, y] = local(e);
        setCam(
          pane.id,
          zoomAbout(camOf(pane.id), viewport(pane), x, y, Math.exp(-e.deltaY * 0.0015)),
        );
      },
      { passive: false },
    );
    pane.ink.addEventListener("keydown", (e) => onKey(pane, e));
  }

  // ── Keyboard parity (PLAN §5.2 rule 10): [ ] select, arrows move the selection (Shift ×10) or pan
  // when nothing is selected, + − zoom, Escape deselects. Each arrow press is one committed edit.
  function nudge(dx: number, dy: number, id: PaneId): void {
    const cam = camOf(id);
    if (selected && paneFor(selected) === id && live.poly) {
      const p = live.poly;
      const w =
        selected.kind === "root" ? p.roots[selected.index] : p.coeffs[selected.index];
      const step = cam.half / 50;
      moveTo(selected, [w[0] + dx * step, w[1] + dy * step]);
      release();
      const q = live.poly;
      if (q) {
        const now =
          selected.kind === "root" ? q.roots[selected.index] : q.coeffs[selected.index];
        panes[id].announce(`${describe(selected)} at ${formatCx(now, 4)}`);
      }
    } else
      setCam(id, {
        ...cam,
        cx: cam.cx + dx * cam.half * 0.1,
        cy: cam.cy + dy * cam.half * 0.1,
      });
  }

  function describe(t: Target): string {
    return t.kind === "root"
      ? `root ${live.poly?.labels[t.index] ?? t.index + 1}`
      : `coefficient a${t.index}`;
  }

  function onKey(pane: Pane, e: KeyboardEvent): void {
    const mult = e.shiftKey ? 10 : 1;
    const list = targetsIn(pane.id);
    const at = selected
      ? list.findIndex((t) => t.kind === selected?.kind && t.index === selected.index)
      : -1;
    switch (e.key) {
      case "ArrowLeft":
        nudge(-mult, 0, pane.id);
        break;
      case "ArrowRight":
        nudge(mult, 0, pane.id);
        break;
      case "ArrowUp":
        nudge(0, mult, pane.id);
        break;
      case "ArrowDown":
        nudge(0, -mult, pane.id);
        break;
      case "]":
      case "[": {
        if (list.length === 0) return;
        const next =
          e.key === "]" ? (at + 1) % list.length : (at - 1 + list.length) % list.length;
        selected = list[next];
        render();
        pane.announce(`Selected ${describe(selected)}`);
        break;
      }
      case "+":
      case "=":
      case "-":
      case "_": {
        const vp = viewport(pane);
        const f = e.key === "+" || e.key === "=" ? 1.25 : 0.8;
        setCam(pane.id, zoomAbout(camOf(pane.id), vp, vp.width / 2, vp.height / 2, f));
        break;
      }
      case "Enter":
        if (pen === null) return;
        togglePen();
        break;
      case "Escape":
        selected = null;
        pen = null;
        render();
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  // ── Loops (PLAN §5.2 rules 4–6).
  function setCoefficient(j: number | null): void {
    commit({ ...state, coefficient: j, loop: null });
  }
  function setLoop(loop: Loop | null): void {
    commit({ ...state, loop });
  }
  function lasso(k: number): void {
    setLoop(withLasso(state.loop, k, building));
  }
  function togglePen(): void {
    if (pen === null) {
      pen = [];
      render();
      return;
    }
    const vs = pen;
    pen = null;
    if (vs.length >= 3) setLoop({ kind: "drawn", vertices: vs });
    else render();
  }
  function penAt(z: Cx): void {
    if (pen === null) return;
    pen.push([z[0], z[1]]);
    render();
  }
  function play(): void {
    const run = resolution.loopRun;
    const p = resolution.poly;
    if (!run || !run.ok || !p) return;
    const m = makeMotion(p.roots, run.perm, p.lead);
    motionInfo = {
      fallback: m.fallback,
      lenses: Math.round((m.frames.length - 1) / FRAMES_PER_MOVE),
    };
    braid = { frames: m.frames.map((f) => [...f]), labels: p.labels };
    startAnim({
      roots: m.frames.map((f) => [...f]),
      coeffs: m.coeffFrames.map((f) => [...f]),
      f: 0,
      labels: p.labels,
    });
    // The root that started at i ends where perm[i]'s did, and keeps its label.
    const after = new Array<number>(p.degree);
    run.perm.forEach((k, i) => (after[k] = p.labels[i]));
    relabel(after);
    render();
  }
  function computeGroup(): void {
    const p = resolution.poly;
    const ctx = resolution.loopContext;
    if (!p || !ctx) return;
    const runs = ctx.branchPoints.map((_, k) =>
      memoRun(p, { kind: "lasso", point: k, sign: 1 }, ctx),
    );
    const g = lassoGroup(runs, p.degree);
    group = {
      cert: monodromyGroupCert(g.recognition, g.missing, p.degree),
      order: g.order,
    };
    render();
  }

  // ── Actions from the rails.
  function type(text: string): void {
    pendingText = text;
    const read = parsePolynomial(text, state.ring);
    if (!read.ok) {
      textRefusal = read.reason;
      render();
      return;
    }
    textRefusal = null;
    pendingText = null;
    const next: ShellState = { ...state, poly: { kind: "text", text } };
    const res = resolveState(next);
    if (!res.poly) {
      textRefusal = res.refusal;
      pendingText = text;
      render();
      return;
    }
    // A new polynomial gets a camera that shows it; a reader's own framing survives everything else.
    selected = null;
    commit(
      {
        ...next,
        loop: null,
        rootCam: frame(res.poly.roots),
        coeffCam: frame(res.poly.coeffs),
      },
      null,
    );
  }

  function setRing(ring: Ring): void {
    ringRefusal = null;
    const p = live.poly;
    let next: ShellState = { ...state, ring, loop: null };
    if (ring === "Q" && p && !p.exact) {
      // Leaving the floats: each coefficient becomes the simplest rational within 1e-9 of it, relative.
      const bad = p.coeffs.findIndex((c) => c[1] !== 0);
      if (bad >= 0) {
        ringRefusal = `coefficient a${bad} is not real, and ℚ mode needs rational coefficients`;
        render();
        return;
      }
      const exact = QiPoly.fromCoeffs(
        p.coeffs.map(
          ([re]) =>
            new Gauss(snapRational(re, 1e-9 * Math.max(1, Math.abs(re))), Frac.ZERO),
        ),
      );
      next = { ...next, poly: { kind: "text", text: renderQiPolyText(exact, "z") } };
    }
    const res = resolveState(next, p ?? undefined);
    if (!res.poly) {
      ringRefusal = res.refusal;
      render();
      return;
    }
    commit(next);
  }

  function undo(): void {
    const prev = undoStack.pop();
    if (!prev) return;
    redoStack.push(state);
    restore(prev);
  }
  function redo(): void {
    const next = redoStack.pop();
    if (!next) return;
    undoStack.push(state);
    restore(next);
  }
  function restore(s: ShellState): void {
    const res = resolveState(s, live.poly ?? undefined);
    state = s;
    resolution = res;
    live = res;
    selected = null;
    dragging = null;
    textRefusal = null;
    ringRefusal = null;
    pendingText = null;
    resetSession();
    adoptRun();
    render();
    syncHash();
  }

  async function copyLink(): Promise<void> {
    if (!win) return;
    const url = `${win.location.origin}${win.location.pathname}${encodeShell(state)}`;
    try {
      await win.navigator.clipboard.writeText(url);
      copyStatus = "Link copied.";
    } catch {
      copyStatus = "The browser refused the clipboard; the link is in the address bar.";
      win.history.replaceState(null, "", encodeShell(state));
    }
    render();
  }

  async function saveFigure(): Promise<void> {
    if (!win) return;
    // Everything the figure claims is read BEFORE the first await (Contour Integration's M6.3 review).
    const link = `${win.location.origin}${win.location.pathname}${encodeShell(state)}`;
    const res = live;
    render();
    const bytes = await figureBytes(
      doc,
      [panes.roots, ...(state.overlay ? [] : [panes.coefficients])],
      res,
      link,
    );
    if (!bytes) {
      copyStatus = "The figure could not be drawn in this browser.";
      render();
      return;
    }
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "image/png" }));
    const a = doc.createElement("a");
    a.href = url;
    a.download = "polynomial-root-analysis.png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    copyStatus = "Figure saved.";
    render();
  }

  // ── Rendering.
  function render(): void {
    const p = live.poly;
    patch(
      left,
      leftRail(
        {
          text:
            pendingText ??
            (state.poly.kind === "text"
              ? state.poly.text
              : p?.exact
                ? renderQiPolyText(p.exact, "z")
                : describePoly(p)),
          textRefusal,
          ringRefusal,
          ring: state.ring,
          poly: p,
          overlay: state.overlay,
          discs: state.discs,
          critical: state.critical,
          coefficient: state.coefficient,
          trails: state.trails,
          pseudozero: state.pseudozero,
          canUndo: undoStack.length > 0,
          canRedo: redoStack.length > 0,
          copyStatus,
        },
        {
          onText: type,
          onRing: setRing,
          onOverlay: (on) => commit({ ...state, overlay: on }),
          onDiscs: (on) => commit({ ...state, discs: on }),
          onCritical: (on) => commit({ ...state, critical: on }),
          onCoefficient: setCoefficient,
          onTrails: (on) => {
            if (!on) trails.clear();
            commit({ ...state, trails: on });
          },
          onPseudozero: (lv) => commit({ ...state, pseudozero: lv }),
          onUndo: undo,
          onRedo: redo,
          onCopyLink: () => void copyLink(),
          onSaveFigure: () => void saveFigure(),
        },
      ),
    );
    patch(
      right,
      rightRail(
        {
          ...live,
          selectedRoot: selected?.kind === "root" ? selected.index : null,
          coefficient: state.coefficient,
          critical: state.critical,
          pseudozero: state.pseudozero,
        },
        {
          model: {
            context: live.loopContext,
            loop: state.loop,
            run: live.loopRun,
            building,
            pen: pen === null ? null : pen.length,
            group,
            motion: motionInfo,
          },
          on: {
            onLasso: lasso,
            onBuild: (on) => {
              building = on;
              render();
            },
            onInvert: () => state.loop && setLoop(inverted(state.loop)),
            onCommute: () => state.loop && setLoop(commuteLastTwo(state.loop)),
            onPen: togglePen,
            onClear: () => setLoop(null),
            onRunNode: setLoop,
            onPlay: play,
            onGroup: computeGroup,
          },
        },
      ),
    );
    drawBraidStrip();
    stage.dataset.overlay = state.overlay ? "true" : "false";
    panes.coefficients.section.hidden = state.overlay;
    panes.roots.heading.textContent = state.overlay ? PANE.overlay : PANE.roots;
    drawPane(panes.roots);
    if (!state.overlay) drawPane(panes.coefficients);
    describePanes();
  }

  function describePoly(p: Polynomial | null): string {
    if (!p) return "";
    const terms: string[] = [];
    for (let k = p.degree; k >= 0; k--) {
      const c = p.coeffs[k];
      if (c[0] === 0 && c[1] === 0) continue;
      terms.push(
        `(${formatCx(c, 8).replace(/−/g, "-").replace(/ /g, "")})${k === 0 ? "" : k === 1 ? "*z" : `*z^${k}`}`,
      );
    }
    return terms.join(" + ");
  }

  function sizeCanvas(c: HTMLCanvasElement, vp: Viewport): number {
    const dpr = win?.devicePixelRatio ?? 1;
    const w = Math.max(1, Math.round(vp.width * dpr));
    const h = Math.max(1, Math.round(vp.height * dpr));
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    return dpr;
  }

  function drawPane(pane: Pane): void {
    const vp = viewport(pane);
    const cam = camOf(pane.id);
    const p = live.poly;
    const a = live.analysis;
    if (pane.gl && pane.portrait && p) {
      sizeCanvas(pane.gl, vp);
      pane.portrait.render(
        worldRange(cam, vp),
        p.roots,
        p.lead,
        // With the pseudozero ladder on, its decade lines replace the doubling bands: one set of
        // level curves of |p| at a time, and the ladder's are the ones that mean something.
        state.pseudozero === null,
        state.pseudozero === null
          ? null
          : { coeffs: p.coeffs, log10eps: state.pseudozero },
      );
    }
    const dpr = sizeCanvas(pane.ink, vp);
    const ctx = pane.ink.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, vp.width, vp.height);
    drawAxes(ctx, cam, vp, !(pane.gl && pane.portrait));
    if (!p) return;
    const sel = (kind: Target["kind"]): number | null =>
      selected && selected.kind === kind ? selected.index : null;
    // During an animation the points are drawn where the frame has them; everything proved is drawn
    // where it is.
    const rootsNow = anim ? anim.roots[anim.f] : p.roots;
    const coeffsNow = anim?.coeffs ? anim.coeffs[anim.f] : p.coeffs;
    const run = live.loopRun;
    // Branch points, their numbers, and the loop live in the plane of the coefficient they belong to.
    const coefficientLayer = (): void => {
      if (state.coefficient !== null && a?.branch) {
        drawBranchPoints(ctx, cam, vp, a.branch.points);
        if (live.loopContext) drawBranchNumbers(ctx, cam, vp, a.branch.points);
      }
      const ctxL = live.loopContext;
      if (ctxL && state.loop) {
        const path =
          run?.path ??
          (() => {
            const r = loopPath(state.loop, ctxL);
            return r.ok ? r.path : null;
          })();
        if (path) drawLoopPath(ctx, cam, vp, path, { dashed: !(run && run.ok) });
      }
      if (pen && pen.length) drawLoopPath(ctx, cam, vp, pen, { dashed: true });
      if (anim?.coeffs) {
        // A motion: each coefficient's closed loop, traced in full.
        for (let k = 0; k < p.degree; k++)
          drawLoopPath(
            ctx,
            cam,
            vp,
            anim.coeffs.map((c) => c[k]),
            { dashed: true },
          );
      }
    };
    if (pane.id === "roots") {
      if (a?.pseudozero)
        drawRegionOutlines(ctx, cam, vp, a.pseudozero.grid, a.pseudozero.regions);
      if (state.critical && a?.critical) drawHull(ctx, cam, vp, a.critical.hull.vertices);
      if (state.discs && live.discs?.ok) drawDiscs(ctx, cam, vp, live.discs.discs);
      drawTrails(ctx, cam, vp, trails, p.degree);
      if (run && run.paths.length)
        drawTrails(
          ctx,
          cam,
          vp,
          new Map(run.paths.map((q, i) => [p.labels[i], q])),
          p.degree,
        );
      if (state.critical && a?.critical && !anim)
        drawCritical(ctx, cam, vp, a.critical.points);
      drawRoots(ctx, cam, vp, rootsNow, anim ? anim.labels : p.labels, sel("root"));
      if (state.overlay) {
        coefficientLayer();
        drawCoeffs(ctx, cam, vp, coeffsNow, sel("coeff"));
      }
    } else {
      coefficientLayer();
      drawCoeffs(ctx, cam, vp, coeffsNow, sel("coeff"));
    }
  }

  function drawBraidStrip(): void {
    const w = Math.max(1, Math.round(braidSection.getBoundingClientRect().width || 480));
    const hgt = 120;
    const dpr = win?.devicePixelRatio ?? 1;
    braidCanvas.width = Math.round(w * dpr);
    braidCanvas.height = Math.round(hgt * dpr);
    braidCanvas.style.height = `${hgt}px`;
    const cs = braid ? crossings(braid.frames) : [];
    braidSection.hidden = braid === null;
    braidCanvas.setAttribute(
      "aria-label",
      braid
        ? `Braid of the last ${motionInfo ? "motion" : "loop"}: ${braid.labels.length} strands, ${cs.length} crossing${cs.length === 1 ? "" : "s"}.`
        : "No loop has been run.",
    );
    const ctx = braidCanvas.getContext("2d");
    if (!ctx || !braid) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBraid(
      ctx,
      w,
      hgt,
      braid.frames,
      braid.labels,
      cs.map((c) => ({ frame: c.frame, strand: c.over === c.a ? c.b : c.a })),
    );
  }

  /** The canvases' names are GENERATED from what is drawn, refreshed on every render. */
  function describePanes(): void {
    const p = live.poly;
    const keys =
      "Drag a point, or select one with [ and ] and move it with the arrow keys (Shift for larger steps); arrows with nothing selected pan; + and − zoom.";
    if (!p) {
      panes.roots.ink.setAttribute("aria-label", "Root pane: no polynomial.");
      panes.coefficients.ink.setAttribute(
        "aria-label",
        "Coefficient pane: no polynomial.",
      );
      return;
    }
    const discs = live.discs;
    const certified = discs?.ok
      ? discs.components === p.degree
        ? `each root in its own certified disc`
        : `${discs.components} certified groups of discs`
      : "no discs certified";
    const rootsText = `${state.overlay ? "Roots and coefficients" : "Root pane"}: the ${p.degree} roots of a degree-${p.degree} polynomial over its phase portrait, ${certified}. ${keys}`;
    panes.roots.ink.setAttribute("aria-label", rootsText);
    panes.coefficients.ink.setAttribute(
      "aria-label",
      `Coefficient pane: the ${p.degree + 1} coefficients a0 to a${p.degree} as points in the complex plane. ${keys}`,
    );
    const layers = [
      state.critical
        ? "Diamonds: the critical points; dashed: the roots' convex hull."
        : "",
      state.pseudozero !== null
        ? "Grey: the pseudozero set (≈), one faint line per decade outside it; outlined: the grid cells the Analysis card's count is proved over."
        : "",
      state.coefficient !== null && state.overlay
        ? `✕: where two roots collide as a${state.coefficient} moves.`
        : "",
    ]
      .filter(Boolean)
      .join(" ");
    panes.roots.legend.textContent = `${
      panes.roots.portrait
        ? `Colour: the argument of p (≈, drawn from the plotted roots).${state.pseudozero === null ? " Dark bands: each doubling of |p|." : ""} Rings: the certified discs.`
        : "The phase portrait needs WebGL2, which is unavailable here; the roots and their discs are unaffected."
    }${layers ? ` ${layers}` : ""}`;
    panes.coefficients.legend.textContent = `${
      state.ring === "C"
        ? "Each square is a coefficient; drag it anywhere."
        : "Each square is a coefficient; it moves along the real axis."
    }${
      state.coefficient !== null
        ? ` ✕: where two roots collide as a${state.coefficient} moves.`
        : ""
    }`;
  }

  for (const pane of Object.values(panes)) wirePointer(pane);
  if (win && "ResizeObserver" in win) {
    const ro = new win.ResizeObserver(() => render());
    ro.observe(panes.roots.stack);
    ro.observe(panes.coefficients.stack);
  }
  doc.addEventListener("keydown", (e) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    }
  });
  render();

  return {
    currentState: () => state,
    applyState: (s) => restore(s),
    live: () => live,
    refusal: () => textRefusal ?? ringRefusal,
    actions: () => ({
      type,
      setRing,
      setOverlay: (on) => commit({ ...state, overlay: on }),
      setDiscs: (on) => commit({ ...state, discs: on }),
      select: (t) => {
        selected = t;
        render();
      },
      moveTo,
      release,
      undo,
      redo,
      nudge,
      setCoefficient,
      setLoop,
      lasso,
      setBuilding: (on) => {
        building = on;
        render();
      },
      invert: () => state.loop && setLoop(inverted(state.loop)),
      commute: () => state.loop && setLoop(commuteLastTwo(state.loop)),
      pen: togglePen,
      penAt,
      play,
      group: computeGroup,
    }),
    braid: () =>
      braid
        ? { strands: braid.labels.length, crossings: crossings(braid.frames).length }
        : null,
  };
}
