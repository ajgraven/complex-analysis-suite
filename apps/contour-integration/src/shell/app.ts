import { Frac } from "@cas/exact";
import { makeComplexFn, parse, type Node } from "@cas/expr";
import { assembleVerdict, describeLevel, mayReportValue } from "@cas/rigor";
import { attachCanvasA11y, mountNavHeader, type CanvasKeyAction } from "@cas/ui";
import {
  DEFAULT_VIEW,
  fitView,
  panBy,
  plotToScreen,
  scale,
  screenToPlot,
  zoomAt,
  type View,
  type Viewport,
} from "../kernel/camera.js";
import type { Cx, Resolved } from "../kernel/geom.js";
import { findPoles, type PoleReport } from "../kernel/poles.js";
import { checkAdmissibility } from "../kernel/branch/admissibility.js";
import {
  INFINITY as INFINITY_ID,
  NO_BRANCH,
  cutPolyline,
  type BranchChoice,
} from "../kernel/branch/model.js";
import {
  OFFERED_ORDERS,
  addBranchPoint,
  applyBranchGrab,
  branchHandles,
  joinToOneCut,
  orderLabel,
  removeBranchPoint,
  setOrder,
  splitToRays,
  type BranchGrab,
  type BranchHandle,
} from "../engine/branchEdit.js";
import { accumulateForIntegral, type Accumulation } from "../engine/contour/accumulate.js";
import { analyse } from "../engine/analyse.js";
import { buildDerivation, type Derivation, type Statement } from "../engine/derivation.js";
import { RESIDUE_THEOREM_IDENTITY } from "../engine/residueTheorem.js";
import type { ContourIntegral } from "../engine/contour/integrate.js";
import type { ResidueTheoremResult } from "../engine/residueTheorem.js";
import { ledgerHeadline, legalityRefusal, type LedgerResult } from "../engine/ledger.js";
import { resolveAll, type Contour } from "../engine/contour/model.js";
import {
  handlesOf,
  nearestHandle,
  onContour,
  radiusDragValue,
  setParam,
  translateContour,
  type Handle,
} from "../engine/contour/edit.js";
import {
  circleTemplate,
  dogboneTemplate,
  indentedSemicircleTemplate,
  keyholeTemplate,
  rectangleTemplate,
  semicircleTemplate,
} from "../engine/contour/templates.js";
import {
  isVariant,
  offeredFamilies,
  primaryGolden,
  solveFamily,
  type FamilyRun,
} from "../families/runFamily.js";
import type { Family, FamilyTarget, Golden } from "../families/schema.js";
import type { PiSolvedTargets, SolvedValue } from "../families/solveTarget.js";
import type { Bindings } from "../families/system.js";
import { GLStage } from "../ui/stage/glStage.js";
import { drawContour, PIECE_COLOURS } from "../ui/stage/ink.js";
import { CONTRAST_LABELS, drawAccumulator, type ContrastMode } from "../ui/accumulator.js";

/**
 * The shell: an integrand, a contour, and the integral accumulating along it — in two modes.
 *
 * **Sandbox** is the free one: type `f`, pick a template, drag the view. **Gallery** opens one of the
 * corpus records instead, which is the difference between an engine that can prove things and an app
 * that shows them: until this mode existed, thirteen certified worked examples passed in CI and no
 * user could open one.
 *
 * The wiring rule both modes obey is that neither of them computes anything here. Sandbox mode calls
 * `engine/analyse.ts`; gallery mode calls `families/runFamily.ts`, which calls the same `analyse`.
 * That is the whole reason the second mode is safe to add: the numbers on screen are the numbers the
 * golden corpus pins, along the same code path, rather than a second implementation that agrees by
 * inspection.
 *
 * The other thing to notice is the order inside `analyse`: the integral is asked for first, and if it
 * comes back refused **no value is shown at all**. The result card has no "invalid" styling for a
 * number, because there is never a number to style.
 */

const PRESETS: { label: string; src: string }[] = [
  { label: "1/z", src: "1/z" },
  { label: "1/(1+z^2)", src: "1/(1+z^2)" },
  { label: "1/(1+z^4)", src: "1/(1+z^4)" },
  { label: "1/(z-1)^2", src: "1/(z-1)^2" },
  { label: "(3+4i)/(z^3-1)", src: "(3+4i)/(z^3-1)" },
  { label: "z/(z^2+2*z+2)", src: "z/(z^2+2*z+2)" },
  { label: "exp(i*z)/(1+z^2)", src: "exp(i*z)/(1+z^2)" },
];

type TemplateId =
  | "circle"
  | "semicircle"
  | "semicircleDown"
  | "indented"
  | "rectangle"
  | "keyhole"
  | "dogbone";

/**
 * `seed` is how a template whose SHAPE presupposes a cut declares one.
 *
 * A keyhole with no cut is four pieces with a coincidence in them, and a dogbone with no cut is a
 * closed curve enclosing nothing — which is to say `∮ = 0` and no lesson. So these two offer the cut
 * system they were drawn for. It stays a CHOICE in exactly the sense M4.1 fixed: the seeded points
 * and cut are ordinary declared objects, listed in the Branch cuts card, draggable, re-orderable and
 * removable, and the template only offers them when nothing is declared yet — it never overwrites a
 * cut the user placed.
 */
const TEMPLATES: {
  id: TemplateId;
  label: string;
  build: () => Contour;
  seed?: (branch: BranchChoice) => BranchChoice;
}[] = [
  { id: "circle", label: "circle", build: () => circleTemplate([0, 0], 1.5) },
  { id: "semicircle", label: "semicircle ↑", build: () => semicircleTemplate(3, "upper") },
  { id: "semicircleDown", label: "semicircle ↓", build: () => semicircleTemplate(3, "lower") },
  // C1's contour, and the one that makes `∮` stop being the answer: it encloses nothing, so
  // `∮ = 0` while the integral is π/2 and the entire value comes from the indentation's
  // `iα·Res`. The engine has had this template since M3 with no way in.
  {
    id: "indented",
    label: "indented semicircle",
    build: () => indentedSemicircleTemplate(8, 0.05),
  },
  { id: "rectangle", label: "rectangle", build: () => rectangleTemplate(-1.6, -1.2, 1.6, 1.2) },
  // Tier D's two shapes, which the engine has had since M4.2 and M4.6 with no way in either.
  {
    id: "keyhole",
    label: "keyhole",
    build: () => keyholeTemplate(4, 0.15),
    seed: (b) => setOrder(addBranchPoint(b, [0, 0]), "b1", { kind: "power", alpha: Frac.of(1n, 2n) }),
  },
  // The one that encloses nothing and is not zero — but only once the cut is inside it, which is
  // why this is the template that seeds a BOUNDED cut rather than a ray.
  {
    id: "dogbone",
    label: "dogbone",
    build: () => dogboneTemplate(-1, 1, 0.12),
    seed: (b) => {
      const half = { kind: "power", alpha: Frac.of(-1n, 2n) } as const;
      let next = setOrder(addBranchPoint(b, [-1, 0]), "b1", half);
      next = setOrder(addBranchPoint(next, [1, 0]), "b2", half);
      return joinToOneCut(next, "b1", "b2") ?? next;
    },
  },
];

/** How close a pointer must come to a handle or to the contour, in CSS px, to grab it. */
const GRAB_PX = 11;

/**
 * Function evaluations per piece while a gesture is in flight.
 *
 * PLAN §4.5: drag coarse, re-run the full quadrature on release, reconcile, and treat a disagreement
 * beyond the estimator's own bound as a bug signal worth logging. The node-spacing rule asks for up to
 * 65,536 nodes when a pole is close, which is right for an answer and far too slow for a gesture — and
 * only the CROSS-CHECK is affected, since `∮` comes from a formula over exact residues either way.
 */
const DRAFT_EVALUATIONS = 768;

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const fmt = (x: number): string => {
  if (Object.is(x, -0)) return "0";
  const a = Math.abs(x);
  if (a !== 0 && (a < 1e-4 || a >= 1e6)) return x.toExponential(4);
  return String(Math.round(x * 1e8) / 1e8);
};
const fmtCx = ([re, im]: Cx): string => `${fmt(re)} ${im < 0 ? "−" : "+"} ${fmt(Math.abs(im))}i`;

/** A fixture's bindings, short enough for a `<select>` option: `a = 5, b = 3`. */
const fixtureLabel = (g: Golden): string => {
  const parts = Object.entries(g.params).map(
    ([k, v]) => `${k} = ${typeof v === "number" ? fmt(v) : String(v)}`,
  );
  return parts.length > 0 ? parts.join(", ") : "no parameters";
};

/**
 * The real quantity a record is about, rendered from the record's own fields.
 *
 * Deliberately built from `FamilyTarget` rather than written as prose per record: a second,
 * hand-written statement of what the integral is would be a second source of truth, and the first
 * time it disagreed with the executable one the app would be lying in the most legible place.
 */
const targetText = (t: FamilyTarget): string => {
  const bound = (x: string): string => (x === "inf" ? "∞" : x === "-inf" ? "−∞" : x);
  const range = `(${bound(t.lower)} → ${bound(t.upper)})`;
  return t.kind === "sum"
    ? `Σ ${t.variable} ${range}  ${t.summand ?? "?"}`
    : `∫ ${range}  ${t.integrand ?? "?"}  d${t.variable}`;
};

export function mountApp(root: Element): void {
  let view: View = DEFAULT_VIEW;
  let ast: Node | null = null;
  let f: ((z: Cx) => Cx) | null = null;
  let poles: PoleReport | null = null;
  let contour: Contour = TEMPLATES[0].build();
  let resolved: readonly Resolved[] = resolveAll(contour);
  let integral: ContourIntegral | null = null;
  let theorem: ResidueTheoremResult | null = null;
  let ledger: LedgerResult | null = null;
  let derivation: Derivation | null = null;
  let acc: Accumulation | null = null;
  let scrub = 1;
  let contrast: ContrastMode = "none";
  let highlight = -1;

  // --- grab state --------------------------------------------------------------------------
  /**
   * What a move acts on. `null` means the view, which is the default and the only thing the app used
   * to offer: every pointer drag panned, so north-star behaviour 1 — drag a contour across a pole and
   * watch the value jump by exactly `2πi·Res` — was unreachable except through a parameter slider.
   */
  let grab:
    | { readonly kind: "body" }
    | { readonly kind: "radius"; readonly handle: Handle }
    | { readonly kind: "branch"; readonly handle: BranchHandle }
    | null = null;
  let handles: readonly Handle[] = [];
  /**
   * The declared cut system — a SANDBOX object, not something read out of the integrand.
   *
   * `engine/branchEdit.ts` says why it is declared rather than detected. Under a gallery record it
   * stays empty: a record's argument is the record's, and a cut drawn across it would be editing a
   * worked example rather than exploring one.
   */
  let branch: BranchChoice = NO_BRANCH;
  /** The open record's cut system, when it declares one. Drawn, never edited. */
  let recordBranch: BranchChoice | null = null;
  let bHandles: readonly BranchHandle[] = [];
  /** The branch handle under the pointer, for the cursor. −1 for none. */
  let bHovered = -1;
  /** The handle under the pointer, for the ink layer and the cursor. −1 for none. */
  let hovered = -1;
  /** Which gesture is in flight. `contour` is the one that runs the quadrature at draft quality. */
  let gesture: "none" | "view" | "contour" = "none";
  /** The contour as it was when the gesture began, so a translation is measured from an anchor rather
   *  than accumulated move by move. */
  let anchorContour: Contour | null = null;
  let anchorAt: Cx = [0, 0];

  // --- gallery state -----------------------------------------------------------------------
  // ONE door into the corpus, and it is the loader's output rather than the raw `FAMILIES` array: a
  // record that failed an invariant must not be openable anywhere, because a worked example that
  // cannot be worked is worse than a missing one.
  const offered = offeredFamilies();
  let mode: "sandbox" | "gallery" = "sandbox";
  /**
   * The sandbox's own contour, parked while a record is open.
   *
   * Opening a record REPLACES `contour`, so without this, switching back left the record's geometry
   * standing under a typed integrand — C1's indented semicircle with `1/z` on it. Not wrong, but not
   * a state either mode meant to produce, and the user did not ask for it.
   */
  let sandboxContour: Contour = contour;
  let family: Family | null = null;
  let golden: Golden | null = null;
  /** A move on a family PARAMETER. These reach the integrand, not only the geometry. */
  let bindingOverrides: Bindings = {};
  /** A move on a LIMIT parameter. Geometry only; never substituted into the integrand. */
  let geometryOverrides: Record<string, number> = {};
  let solved: SolvedValue | null = null;
  /**
   * The rest of a SYSTEM solve — the other unknowns this contour determined, and the ones it did not.
   *
   * D4's title promises `∫₀^∞ R(x) dx` "for free", and it IS free: the same identity determines it.
   * Showing only the primary would make the record's own headline invisible, and dropping the
   * invisible-combination report would leave a reader unable to tell "the app cannot" from "this
   * contour does not".
   */
  let systemTargets: PiSolvedTargets | null = null;
  /** What the record could not do, when it could not do it. Shown, never swallowed. */
  let recordNote: string | null = null;
  /**
   * Slider bounds, frozen when a fixture is opened.
   *
   * `instantiate` derives a parameter's range from its VALUE (`span = max(10, 2|v|)`), which is right
   * for opening a record and wrong for dragging one: re-deriving the range on every move rescales the
   * track under the thumb, so a steady drag drifts. Frozen per fixture, the track means one thing for
   * as long as the user is holding it.
   */
  let frozenRanges: Record<string, { range: readonly [number, number]; scale: "linear" | "log" }> =
    {};

  // --- layout -------------------------------------------------------------------------------
  const shell = el("div", "shell");
  const bar = el("header", "bar");
  const stageWrap = el("div", "stage");
  const glCanvas = el("canvas", "gl");
  const inkCanvas = el("canvas", "ink");
  const overlay = el("div", "overlay");
  const rail = el("aside", "rail");
  const strip = el("footer", "strip");
  stageWrap.append(glCanvas, inkCanvas, overlay);
  shell.append(bar, stageWrap, rail, strip);
  root.replaceChildren(shell);
  // The shared suite nav (ADR-0032): back to the launcher, and across to the sibling apps. Mounted
  // before the stage so it sits above it in the document order a screen reader walks.
  mountNavHeader(shell, { current: "contour-integration" });

  // Bar: where the problem comes from — a typed integrand, or one of the gallery's records.
  const sourceWrap = el("div", "sourceToggle");
  sourceWrap.setAttribute("role", "group");
  sourceWrap.setAttribute("aria-label", "problem source");
  const sandboxGroup = el("span", "barGroup");
  const galleryGroup = el("span", "barGroup");

  const input = el("input", "expr");
  input.type = "text";
  input.spellcheck = false;
  input.setAttribute("aria-label", "integrand f(z)");
  input.value = "1/z";
  const presetWrap = el("span", "presets");
  for (const p of PRESETS) {
    const b = el("button", "preset", p.label);
    b.type = "button";
    b.addEventListener("click", () => {
      input.value = p.src;
      applyExpression();
    });
    presetWrap.append(b);
  }
  sandboxGroup.append(el("span", "flabel", "f(z) ="), input, presetWrap);

  // A `<select>` with one `<optgroup>` per tier, not a wall of buttons. The tiers ARE the gallery's
  // ordering — each adds exactly one engine capability — and a native select is keyboard- and
  // screen-reader-navigable without any work of ours.
  const recordSelect = el("select", "picker");
  recordSelect.setAttribute("aria-label", "gallery record");
  for (const tier of offered.tiers) {
    const group = document.createElement("optgroup");
    group.label = `tier ${tier.tier}`;
    for (const fam of tier.families) {
      const opt = document.createElement("option");
      opt.value = fam.id;
      opt.textContent = fam.id;
      group.append(opt);
    }
    recordSelect.append(group);
  }
  const fixtureSelect = el("select", "picker");
  fixtureSelect.setAttribute("aria-label", "fixture");
  galleryGroup.append(
    el("span", "flabel", "record"),
    recordSelect,
    el("span", "flabel", "at"),
    fixtureSelect,
  );

  for (const m of ["sandbox", "gallery"] as const) {
    const b = el("button", "preset", m === "sandbox" ? "Sandbox" : "Gallery");
    b.type = "button";
    b.dataset.mode = m;
    b.setAttribute("aria-pressed", String(m === mode));
    b.addEventListener("click", () => setMode(m));
    sourceWrap.append(b);
  }

  bar.append(el("span", "brand", "Contour Integration"), sourceWrap, sandboxGroup, galleryGroup);

  // Rail cards.
  const errorBox = el("div", "error");
  errorBox.hidden = true;
  const recordCard = el("section", "card");
  const ledgerCard = el("section", "card");
  const derivationCard = el("section", "card");
  const resultCard = el("section", "card");
  const contourCard = el("section", "card");
  const branchCard = el("section", "card");
  const poleCard = el("section", "card");
  rail.append(
    errorBox,
    recordCard,
    ledgerCard,
    derivationCard,
    resultCard,
    contourCard,
    branchCard,
    poleCard,
  );

  // Strip: the accumulator.
  // The canvas needs a containing block with a definite size of its own. A `height: 100%` canvas
  // whose grid track is content-sized feeds back on itself: each resize measures the canvas, grows
  // the track, and re-measures — it reached 173,922 px tall before this wrapper was added.
  const accWrap = el("div", "accWrap");
  const accCanvas = el("canvas", "accCanvas");
  accWrap.append(accCanvas);
  const accSide = el("div", "accSide");
  strip.append(accWrap, accSide);

  const accTitle = el("h2", undefined, "Partial sum Σ f(zₖ)·Δzₖ");
  const accValue = el("p", "num accValue", "—");
  const scrubber = el("input", "scrub");
  scrubber.type = "range";
  scrubber.min = "0";
  scrubber.max = "1000";
  scrubber.value = "1000";
  scrubber.setAttribute("aria-label", "position along the contour");
  const contrastWrap = el("div", "contrasts");
  accSide.append(accTitle, accValue, scrubber, contrastWrap);

  const contrastLabel = el("span", "muted small", "compare with:");
  contrastWrap.append(contrastLabel);
  for (const mode of ["none", "sumZ", "sumFz", "sumDz"] as ContrastMode[]) {
    const b = el("button", "preset", CONTRAST_LABELS[mode]);
    b.type = "button";
    b.dataset.mode = mode;
    b.addEventListener("click", () => {
      contrast = mode;
      for (const other of contrastWrap.querySelectorAll("button")) {
        other.classList.toggle("on", other.dataset.mode === mode);
      }
      drawAcc();
    });
    if (mode === "none") b.classList.add("on");
    contrastWrap.append(b);
  }

  // --- rendering ----------------------------------------------------------------------------
  let stage: GLStage | null = null;
  try {
    stage = new GLStage(glCanvas);
  } catch (e) {
    errorBox.hidden = false;
    errorBox.textContent = e instanceof Error ? e.message : String(e);
  }

  const viewport = (): Viewport => ({
    width: stageWrap.clientWidth || 1,
    height: stageWrap.clientHeight || 1,
  });

  function sizeCanvas(canvas: HTMLCanvasElement, w: number, h: number): CanvasRenderingContext2D | null {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pw = Math.max(1, Math.round(w * dpr));
    const ph = Math.max(1, Math.round(h * dpr));
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  let frame = 0;
  const requestDraw = (): void => {
    if (frame !== 0) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const vp = viewport();
      stage?.render(view, vp);
      const ctx = sizeCanvas(inkCanvas, vp.width, vp.height);
      if (ctx) {
        drawContour(ctx, resolved, view, vp, {
          colours: contour.pieces.map((p) => p.colour),
          highlight,
          marker: acc && acc.steps.length > 0 ? scrub : undefined,
          refused: integral?.refusal !== undefined,
          cuts: cutPolylines(),
          handles: handles.map((h, k) => ({
            at: h.at,
            emphasis:
              grab?.kind === "radius" && grab.handle.param === h.param
                ? "grabbed"
                : k === hovered
                  ? "hover"
                  : "none",
          })),
        });
        // Branch handles ride the same ring idiom as the radius handles, drawn after them so a cut
        // vertex sitting under a contour handle is still takeable.
        drawBranchHandles(ctx, vp);
      }
      drawPoleMarkers();
    });
  };

  /**
   * Each cut as a finite polyline, with its rays clipped beyond everything on screen.
   *
   * The clipping radius comes from the VIEW rather than from the contour, because this one is for
   * drawing: a ray has to leave the visible plane, and the ledger's own clipping (which is about the
   * geometry, not the picture) is computed separately from the contour's extent.
   */
  function cutPolylines(): { points: readonly Cx[]; refused: boolean }[] {
    // THE RECORD'S OWN CUT, under a record. D1's `argRange` decides where the cut runs and the whole
    // record is about what happens when it runs somewhere else, so a figure without it is missing
    // the thing it is teaching. In the sandbox the cut is the user's.
    const drawn = mode === "sandbox" ? branch : (recordBranch ?? NO_BRANCH);
    if (drawn.cuts.length === 0) return [];
    const vp = viewport();
    const reach =
      4 *
      (Math.hypot(view.center[0], view.center[1]) +
        view.halfHeight * (1 + Math.max(1, vp.width) / Math.max(1, vp.height)));
    // ONE reading of legality for the picture and the rail: the ledger's LEGALITY row and this
    // colour must never disagree about whether a cut system is admissible.
    const refused = !checkAdmissibility(drawn).ok;
    const out: { points: readonly Cx[]; refused: boolean }[] = [];
    for (const cut of drawn.cuts) {
      const poly = cutPolyline(drawn, cut, reach);
      if (poly !== null) out.push({ points: poly, refused });
    }
    return out;
  }

  function drawBranchHandles(ctx: CanvasRenderingContext2D, vp: Viewport): void {
    bHandles.forEach((h, k) => {
      const [x, y] = plotToScreen(h.at[0], h.at[1], view, vp);
      const held = grab?.kind === "branch" && sameBranchGrab(grab.handle.grab, h.grab);
      const r = held || k === bHovered ? 7 : 5;
      ctx.beginPath();
      // A branch POINT is a square and a cut vertex is a diamond, so the two are told apart without
      // colour — and neither can be mistaken for the round poles, handles or integration marker.
      if (h.grab.kind === "point") ctx.rect(x - r, y - r, 2 * r, 2 * r);
      else {
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r, y);
        ctx.lineTo(x, y + r);
        ctx.lineTo(x - r, y);
        ctx.closePath();
      }
      ctx.strokeStyle = "rgba(8, 10, 14, 0.9)";
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.strokeStyle = held ? "#ffffff" : "#c77dff";
      ctx.lineWidth = held || k === bHovered ? 2.4 : 1.6;
      ctx.stroke();
    });
  }

  function drawPoleMarkers(): void {
    overlay.replaceChildren();
    if (!poles) return;
    const vp = viewport();
    for (const pole of poles.poles) {
      const [sx, sy] = plotToScreen(pole.at[0], pole.at[1], view, vp);
      if (sx < -40 || sy < -40 || sx > vp.width + 40 || sy > vp.height + 40) continue;
      const mark = el("div", pole.possiblyRemovable ? "pole uncertain" : "pole");
      mark.style.left = `${sx}px`;
      mark.style.top = `${sy}px`;
      if (pole.order > 1) mark.append(el("span", "poleOrder", `order ${pole.order}`));
      overlay.append(mark);
    }
  }

  function drawAcc(): void {
    const w = accWrap.clientWidth || 1;
    const h = accWrap.clientHeight || 1;
    const ctx = sizeCanvas(accCanvas, w, h);
    if (!ctx) return;
    if (!acc) {
      ctx.clearRect(0, 0, w, h);
      accValue.textContent = integral?.refusal === undefined ? "—" : "refused";
      return;
    }
    drawAccumulator(ctx, acc, w, h, {
      upTo: scrub,
      contrast,
      pieceColours: contour.pieces.map((p) => p.colour),
    });
    const count = Math.max(1, Math.round(scrub * acc.steps.length));
    const at = acc.steps[count - 1];
    accValue.textContent = at ? fmtCx(at.running) : "—";
  }

  // --- computation --------------------------------------------------------------------------
  /**
   * Point the camera at the contour that is now on screen.
   *
   * Called when the contour is REPLACED — a record opened, a fixture chosen, a template picked — and
   * deliberately not when a slider moves one: refitting mid-drag would fight the hand on the slider,
   * and `R → ∞` would walk the camera out with it.
   */
  function frameContour(): void {
    view = fitView(resolved, viewport());
    requestDraw();
  }

  function clearComputed(): void {
    recordBranch = null;
    integral = null;
    theorem = null;
    ledger = null;
    derivation = null;
    acc = null;
    solved = null;
  }

  /**
   * What the problem IS, for the derivation's first stage.
   *
   * Read off the record in gallery mode — the same fields the record card shows, so the two cannot
   * disagree — and off the expression box in the sandbox, which is all there is to say there.
   */
  function problemStatements(): Statement[] {
    if (mode !== "gallery" || !family) {
      return [
        { label: "integrand", text: input.value.trim() },
        { label: "contour", text: contour.pieces.map((p) => p.name).join(", ") },
      ];
    }
    const out: Statement[] = family.targets.map((t) => ({ label: "target", text: targetText(t) }));
    out.push({ label: "contour integrand", text: contourIntegrandText(family) });
    if (family.auxiliary) {
      out.push({
        label: "relation",
        text: `the target is ${family.auxiliary.relation} of ∮ f dz — ${family.auxiliary.note}`,
      });
    }
    return out;
  }

  /** Rebuild the derivation from whatever the analysis just produced. */
  function rebuildDerivation(): void {
    derivation =
      ledger && poles && integral && theorem
        ? buildDerivation({
            ledger,
            poles,
            integral,
            theorem,
            spec: contour.pieces,
            statements: problemStatements(),
            ...(solved === null ? {} : { solved }),
          })
        : null;
  }

  /** Take a completed run as the app's state. Nothing is recomputed: `runFamily` already did it. */
  function adopt(run: FamilyRun): void {
    ast = run.ast;
    f = run.f;
    poles = run.poles;
    contour = run.contour;
    resolved = run.resolved;
    integral = run.integral;
    theorem = run.theorem;
    ledger = run.ledger;
    recordBranch = run.branch ?? null;
    // A partial sum through a singularity is meaningless rather than merely rough, so this is null
    // whenever the integral refused — showing one beside a refusal hands back the withheld number.
    acc = accumulateForIntegral(run.f, run.resolved, run.integral);
    stage?.setIntegrand(run.ast);
  }

  /** The work ceiling for this pass: draft while a contour is being dragged, full otherwise. */
  const budgetNow = (): { readonly maxEvaluations: number } | undefined =>
    gesture === "contour" ? { maxEvaluations: DRAFT_EVALUATIONS } : undefined;

  function recompute(): void {
    if (mode === "gallery") {
      recomputeRecord();
    } else {
      resolved = resolveAll(contour);
      if (!f || !ast || !poles) {
        clearComputed();
      } else {
        const budget = budgetNow();
        const a = analyse({
          ast,
          f,
          poles,
          contour,
          branch,
          ...(budget === undefined ? {} : { budget }),
        });
        resolved = a.resolved;
        integral = a.integral;
        theorem = a.theorem;
        ledger = a.ledger;
        acc = accumulateForIntegral(f, resolved, integral);
        solved = null;
      }
    }
    handles = handlesOf(contour, resolved);
    if (hovered >= handles.length) hovered = -1;
    bHandles = mode === "sandbox" ? branchHandles(branch) : [];
    if (bHovered >= bHandles.length) bHovered = -1;
    rebuildDerivation();
    renderRecordCard();
    renderLedger();
    renderDerivation();
    renderResult();
    renderContourCard();
    renderBranchCard();
    renderPoles();
    drawAcc();
    requestDraw();
  }

  /**
   * Re-run the open record at the current bindings.
   *
   * Everything the gallery shows comes back from this one call, including the geometry: a family
   * parameter changes the INTEGRAND as well as the contour (A1's `a` lives in `1/(a + b·cos θ)`), so
   * "move a slider" is "rebuild the problem", not "move a point".
   */
  function recomputeRecord(): void {
    recordNote = null;
    solved = null;
    systemTargets = null;
    if (!family || !golden) {
      clearComputed();
      return;
    }
    const budget = budgetNow();
    const r = solveFamily(family, golden, {
      bindings: bindingOverrides,
      geometry: geometryOverrides,
      ...(budget === undefined ? {} : { budget }),
    });
    if (r.ok) {
      adopt(r.run);
      solved = r.solved;
      systemTargets = r.route === "system" ? r.targets : null;
      errorBox.hidden = true;
      return;
    }
    // Pass 5 may refuse while the run itself is sound. Show what there is and say what is missing,
    // rather than blanking a record whose ledger and contour are perfectly readable.
    recordNote = r.reason;
    if (r.run) {
      adopt(r.run);
      errorBox.hidden = true;
    } else {
      clearComputed();
      errorBox.hidden = false;
      errorBox.textContent = r.reason;
    }
  }

  function setMode(next: "sandbox" | "gallery"): void {
    const previous = mode;
    mode = next;
    for (const b of sourceWrap.querySelectorAll("button")) {
      b.setAttribute("aria-pressed", String(b.dataset.mode === next));
      b.classList.toggle("on", b.dataset.mode === next);
    }
    // The integrand box lives inside `sandboxGroup`, so gallery mode hides it rather than making it
    // read-only: the contour integrand is derived from the record (substitution and Jacobian
    // included), an editable copy of it would desync the two, and the record card states it instead.
    sandboxGroup.hidden = next !== "sandbox";
    galleryGroup.hidden = next !== "gallery";
    if (next === "gallery") {
      if (previous === "sandbox") sandboxContour = contour;
      loadRecord(recordSelect.value || offered.tiers[0]?.families[0]?.id);
    } else {
      recordNote = null;
      contour = sandboxContour;
      applyExpression();
      // Not on the first call, where `previous === next` and the app is simply booting: reframing
      // there would override the default view for no reason the user can see.
      if (previous !== next) frameContour();
    }
  }

  /** Open a record at its primary fixture — the first that binds parameters rather than varying. */
  function loadRecord(id: string | undefined): void {
    const found = offered.tiers.flatMap((t) => t.families).find((fam) => fam.id === id);
    family = found ?? null;
    golden = found ? primaryGolden(found) : null;
    if (found) recordSelect.value = found.id;
    selectFixture(golden);
  }

  /** Bind a fixture: its parameters become the bindings, and every override is dropped. */
  function selectFixture(g: Golden | null): void {
    golden = g;
    bindingOverrides = {};
    geometryOverrides = {};
    frozenRanges = {};
    renderFixtureOptions();
    recompute();
    frameContour();
    // Frozen AFTER the first run, from the contour the record actually produced, so the tracks match
    // the values on screen.
    if (mode === "gallery") {
      for (const param of Object.values(contour.params)) {
        frozenRanges[param.name] = { range: param.range, scale: param.scale };
      }
    }
  }

  function renderFixtureOptions(): void {
    fixtureSelect.replaceChildren();
    if (!family) return;
    for (const [k, g] of family.golden.entries()) {
      const opt = document.createElement("option");
      opt.value = String(k);
      const variant = isVariant(family, g);
      // A variant fixture selects an alternative DERIVATION (A5's half-range corollary, A6's closing
      // down) that the engine has no route for. Offering it and then failing would read as a bug in
      // the record; saying so is the honest version.
      opt.textContent = variant
        ? `${fixtureLabel(g)} — alternative derivation, not executable`
        : fixtureLabel(g);
      opt.disabled = variant;
      if (golden === g) opt.selected = true;
      fixtureSelect.append(opt);
    }
  }

  function applyExpression(): void {
    if (mode === "gallery") return;
    try {
      ast = parse(input.value.trim());
      const fn = makeComplexFn(ast);
      f = (z: Cx) => fn(z as [number, number], [0, 0]) as Cx;
      stage?.setIntegrand(ast);
      errorBox.hidden = true;
    } catch (e) {
      ast = null;
      f = null;
      poles = null;
      errorBox.hidden = false;
      errorBox.textContent = e instanceof Error ? e.message : String(e);
      recompute();
      return;
    }
    poles = findPoles(ast);
    recompute();
  }

  // --- rail rendering -----------------------------------------------------------------------
  function badge(level: string): HTMLElement {
    return el("span", "badge", level);
  }

  const STATUS_GLYPH: Record<string, string> = {
    satisfied: "✓",
    failed: "✗",
    unknown: "?",
  };

  /**
   * What is actually integrated, which is NOT the posed integrand.
   *
   * GALLERY §5.0 calls confusing the two "the single commonest error in the whole subject":
   * `cos 2θ/(5 − 4cos θ)` is smooth at every real θ, and the contour integrand it becomes has a
   * pole of order 2 at the origin. Read straight off the record, so the statement on screen is the
   * one the engine acted on.
   */
  function contourIntegrandText(fam: Family): string {
    if (fam.auxiliary) return fam.auxiliary.integrand;
    const t = fam.targets[0];
    if (t?.substitution) {
      return (
        `${t.integrand ?? "?"}   with  z = ${t.substitution.map},  ` +
        `d${t.variable} = ${t.substitution.jacobian} dz`
      );
    }
    return `${t?.integrand ?? "?"}   read in z — the real axis IS a piece of the contour`;
  }

  /**
   * The open record: what it claims, and what the engine independently got.
   *
   * Showing both is the point. The record's `closedForm` was derived and numerically verified by
   * hand during research; `solved.text` is what Pass 5 produced just now from exact residues in units
   * of π. The app's whole thesis is the agreement of two routes that share no machinery, and this is
   * where a reader can see it rather than take it on trust.
   */
  function renderRecordCard(): void {
    recordCard.hidden = mode !== "gallery";
    if (mode !== "gallery") return;
    recordCard.replaceChildren(el("h2", undefined, "Gallery record"));

    if (!family || !golden) {
      recordCard.append(el("p", "muted", "No record selected."));
      return;
    }

    const head = el("p", "recordHead");
    head.append(el("span", "tag", `tier ${family.tier}`), el("span", "num", family.id));
    recordCard.append(head, el("p", "muted small", family.title));

    for (const t of family.targets) {
      recordCard.append(el("p", "num targetLine", targetText(t)));
      if (t.convergence !== "absolute") {
        recordCard.append(
          el("p", "muted small", `converges ${t.convergence === "conditional" ? "conditionally" : "as a principal value"}`),
        );
      }
    }
    recordCard.append(
      el("p", "muted small", "Contour integrand:"),
      el("p", "num", contourIntegrandText(family)),
    );
    if (family.auxiliary) {
      recordCard.append(
        el("p", "muted small", `the target is ${family.auxiliary.relation} of ∮ f dz — ${family.auxiliary.note}`),
      );
    }

    // The engine's answer, then the record's claim, then whether they agree.
    if (solved) {
      if (solved.text !== undefined) {
        const line = el("p", "resultValue exactValue");
        // Pass 5's own evidence decides this, never the call site.
        line.append(badge(assembleVerdict(solved.certificates).level), ` ${solved.text}`);
        recordCard.append(line);
      }
      const dec = el("p", "num numericValue");
      dec.append(badge("≈"), ` ${fmt(solved.value)}`);
      recordCard.append(dec);

      const claim = family.closedForm.simplified ?? family.closedForm.expr;
      recordCard.append(el("p", "muted small", `the record claims  ${claim}`));

      const want = typeof golden.numeric === "number" ? golden.numeric : golden.numeric[0];
      const off = Math.abs(solved.value - want);
      const tol = golden.verifiedTo * Math.max(1, Math.abs(want));
      const agree = el("p", off <= tol ? "crosscheck" : "restriction");
      agree.append(
        off <= tol ? badge("≤") : badge("⚠"),
        off <= tol
          ? ` agrees with the golden value to ${off.toExponential(2)}`
          : ` DISAGREES with the golden value by ${off.toExponential(2)} — one of them is wrong`,
      );
      recordCard.append(agree);
      // The REST of a system solve: every other unknown this identity determines, and every
      // combination it does not. Both are answers about this contour, and each keeps its own badge.
      if (systemTargets !== null) {
        const targets = family.targets;
        const primaryId = (targets.find((t) => t.role === "primary") ?? targets[0]).id;
        const describe = (id: string): string => {
          const target = targets.find((t) => t.id === id);
          return target === undefined ? id : targetText(target);
        };
        for (const other of systemTargets.solved) {
          if (other.targetId === primaryId) continue;
          const line = el("p", "resultValue exactValue bonusValue");
          line.append(badge(assembleVerdict(other.certificates).level), ` ${other.text}`);
          recordCard.append(line, el("p", "muted small", `${describe(other.targetId)} — from the same contour`));
        }
        // A borrowed input is part of the argument, not a detail of it: the record's own trap asks
        // for "the prerequisite as its own row with its own verdict", and the badge above already
        // meets that verdict into every answer that used it.
        for (const input of systemTargets.borrowed) {
          const line = el("p", "resultValue bonusValue");
          line.append(badge(assembleVerdict([input.certificate]).level), ` ${input.text}`);
          recordCard.append(
            line,
            el("p", "muted small", `${describe(input.targetId)} — ${input.certificate.claim}`),
          );
        }
        for (const sentence of systemTargets.invisible) {
          const line = el("p", "restriction");
          line.append(badge("?"), ` ${sentence}`);
          recordCard.append(line);
        }
      }

      // `method` is a paragraph, by design — GALLERY §2's whole point is that a golden value with no
      // method is an assertion. It is still not what a reader needs first, so it folds.
      const how = el("details", "method");
      how.append(el("summary", "muted small", "how the golden value was verified"), el("p", "muted small", golden.method));
      recordCard.append(how);
    }

    for (const r of family.restrictions ?? []) {
      recordCard.append(el("p", "restriction", r));
    }
    if (recordNote !== null) {
      recordCard.append(el("p", "repair", recordNote));
    }
    // Said from data rather than implied by silence: the loader drops a record that fails any of
    // DESIGN §5's four invariants, and a reader is entitled to know whether it dropped any.
    recordCard.append(
      el(
        "p",
        "muted small",
        `${offered.count} records loaded · ${offered.dropped.length} dropped`,
      ),
    );
  }

  /**
   * The Closing Ledger. The headline is a SENTENCE, not a number: "does this argument finish" is the
   * question a number cannot answer, and it is the one thing this app offers that nothing else does.
   */
  /** The last sentence announced, so the live region does not repeat itself on every redraw. */
  let announced = "";
  /**
   * Set once the accessible canvas is attached, below.
   *
   * A binding rather than a direct reference to that `const`: it is declared after this function and
   * only happens to be initialised before the first render. Reordering the mount would turn that
   * into a temporal-dead-zone throw at runtime that the type checker cannot see, so the indirection
   * makes the order a non-issue instead of a thing to remember.
   */
  let announce: (message: string) => void = () => {};

  function renderLedger(): void {
    ledgerCard.replaceChildren(el("h2", undefined, "Does the argument close?"));
    if (!ledger) {
      ledgerCard.append(el("p", "muted", "No integrand."));
      return;
    }

    const head = el("p", ledger.closes ? "headline closes" : "headline open");
    head.textContent = ledgerHeadline(ledger);
    ledgerCard.append(head);

    // The headline IS the product — "does this argument close?" — so a screen-reader user should
    // hear it change rather than have to go looking for it. Guarded against repeating on a redraw
    // that changed nothing, which would otherwise make the live region chatter on every pan.
    const sentence =
      ledger.closes && ledger.value
        ? solved?.text !== undefined
          ? `${ledgerHeadline(ledger)} The closed contour is worth ${ledger.value.text}, and the integral is ${solved.text}.`
          : `${ledgerHeadline(ledger)} The closed-contour value is ${ledger.value.text}.`
        : ledgerHeadline(ledger);
    if (sentence !== announced) {
      announced = sentence;
      announce(sentence);
    }

    if (ledger.closes && ledger.value) {
      const v = el("p", "resultValue exactValue");
      // The VALUE's evidence, not the argument's. `ledger.verdict` is the meet over every step, so it
      // carries the arc bound's `≤` — which is a true statement about the weakest step and a false
      // one about `∮`, whose own evidence is the residue theorem. DESIGN §4 Pass 3 is explicit that
      // the bound and the limit are different claims and that only the limit reaches the answer.
      const valueLevel =
        theorem?.exactValue !== undefined ? theorem.verdict.level : (integral?.verdict.level ?? "?");
      v.append(badge(valueLevel), ` ${ledger.value.text}`);
      // NAME the number. This one is `∮ f dz`, and when the contour has a target that is not the
      // answer — C1 is the case that makes it unavoidable: its contour encloses nothing, so `∮ = 0`
      // while the integral is π/2 and the entire value comes from the indentation's `iα·Res`.
      // Unlabelled, "This argument closes. = 0" reads as "the answer is 0", which is GALLERY §5.0b's
      // wrong answer printed in the most authoritative place on the page.
      ledgerCard.append(
        v,
        el(
          "p",
          "muted small",
          ledger.hasTarget
            ? "∮ f dz — the closed contour. The integral it is being used to find is above."
            : "∮ f dz",
        ),
      );
    }

    const list = el("ul", "ledger");
    for (const row of ledger.rows) {
      const li = el("li", `ledgerRow ${row.status}`);
      li.append(
        el("span", "constraint", row.constraint),
        el("span", "glyph", STATUS_GLYPH[row.status] ?? "?"),
        el("span", "ledgerClaim", row.claim),
      );
      if (row.repair !== undefined) li.append(el("span", "repair", row.repair));
      list.append(li);
    }
    ledgerCard.append(list);
  }

  /**
   * The derivation: the argument in order, with every line carrying its own evidence.
   *
   * Nothing here composes a claim. `engine/derivation.ts` reads the ledger's rows and their
   * certificates; this function turns that structure into DOM. The one editorial decision is what to
   * show by default — a failing argument opens itself, because the diagnostic IS the product, while
   * a closing one folds, because a reader who is satisfied should not have to scroll past a proof.
   */
  function renderDerivation(): void {
    derivationCard.replaceChildren();
    if (!derivation) {
      derivationCard.hidden = true;
      return;
    }
    derivationCard.hidden = false;

    const shell = el("details", "derivation");
    shell.open = !derivation.closes;
    const steps = derivation.stages.reduce((n, st) => n + st.lines.length, 0);
    const summary = el(
      "summary",
      undefined,
      derivation.closes
        ? `Derivation — ${steps} steps, each with its evidence`
        : `Derivation — where it stops: ${derivation.failedAt ?? "incomplete"}`,
    );
    shell.append(summary);

    for (const st of derivation.stages) {
      const block = el("div", `derivStage${st.failed ? " failed" : ""}`);
      block.append(el("h3", undefined, st.title), el("p", "muted small why", st.why));

      for (const statement of st.statements) {
        const row = el("p", "statement");
        row.append(el("span", "stLabel", statement.label), el("span", "num", statement.text));
        block.append(row);
      }

      if (st.poles.length > 0) {
        const list = el("ul", "poleTable");
        for (const row of st.poles) {
          const li = el("li");
          li.append(el("span", "num", fmtCx(row.at)));
          li.append(el("span", "tag", `order ${row.order}`));
          li.append(
            el(
              "span",
              row.windingDecided ? "tag" : "tag warn",
              row.windingDecided ? `n(γ) = ${row.winding}` : "n(γ) undecided",
            ),
          );
          if (row.residue !== undefined) li.append(el("span", "num", `Res = ${row.residue}`));
          if (row.basis === "numeric") li.append(el("span", "tag warn", "located numerically"));
          if (row.possiblyRemovable) li.append(el("span", "tag warn", "may be removable"));
          if (!row.orderCertain) li.append(el("span", "tag warn", "order uncertain"));
          list.append(li);
        }
        block.append(el("p", "muted small", "per pole — the winding number and the count are separate facts:"), list);
      }

      for (const line of st.lines) {
        const li = el("div", `derivLine ${line.status}`);
        const head = el("p", "derivClaim");
        head.append(badge(line.level), ` ${line.text}`);
        li.append(head);
        if (line.pieceName !== undefined) li.append(el("p", "muted small", line.pieceName));
        li.append(el("p", "muted small method", line.method));
        if (line.restriction !== undefined) li.append(el("p", "restriction", line.restriction));

        // A failed step is the diagnostic and is never folded away. The satisfied ones are the audit
        // trail — worth having, not worth reading first — so they go behind one disclosure.
        const failedSteps = line.provenance.filter((x) => !x.ok);
        const okSteps = line.provenance.filter((x) => x.ok);
        for (const step of failedSteps) li.append(el("p", "provBad", `✗ ${step.text}`));
        if (okSteps.length > 0) {
          const trail = el("details", "prov");
          trail.append(
            el("summary", "muted small", `audit trail (${okSteps.length} step${okSteps.length === 1 ? "" : "s"})`),
          );
          for (const step of okSteps) trail.append(el("p", "provOk", `✓ ${step.text}`));
          li.append(trail);
        }
        if (line.repair !== undefined) li.append(el("p", "repair", line.repair));
        block.append(li);
      }
      shell.append(block);
    }

    if (derivation.conclusion) {
      const end = el("p", "conclusion");
      // Badged from the CONCLUSION's own evidence, which is not the argument-wide meet: a vanishing
      // arc owes a `≤` at finite R and an `=` for its limit, and only the limit enters the answer.
      end.append(
        badge(derivation.conclusion.level),
        ` ${derivation.conclusion.label} = ${derivation.conclusion.text}`,
      );
      shell.append(end);
    }
    derivationCard.append(shell);
  }

  function renderResult(): void {
    resultCard.replaceChildren(el("h2", undefined, "∮ f(z) dz"));
    if (!integral) {
      resultCard.append(el("p", "muted", "No integrand."));
      return;
    }

    // Two independent reasons there may be no number, and the second is the one that used to be
    // missed: the quadrature can be perfectly happy about a contour LEGALITY has already refused.
    const illegal = ledger === null ? undefined : legalityRefusal(ledger);
    if (integral.refusal !== undefined || !mayReportValue(integral.verdict) || illegal !== undefined) {
      // No number. Not a greyed-out number, not a number with a warning beside it — none.
      const row = el("p", "refusal");
      row.append(badge("⚠"), " Refused");
      resultCard.append(
        row,
        el("p", "muted", illegal?.claim ?? integral.refusal ?? "the result was refused"),
      );
      const repair =
        illegal?.repair ??
        integral.verdict.certificates
          .flatMap((c) => c.provenance)
          .find((s) => s.text.startsWith("suggested repair"))?.text;
      if (repair !== undefined) resultCard.append(el("p", "repair", repair));
      return;
    }

    // The exact value, when the residue theorem could supply one, is the headline — it comes from a
    // formula rather than from integrating, and the quadrature below it is the corroboration.
    if (theorem?.exactValue) {
      const head = el("p", "resultValue exactValue");
      // From the verdict, not from a literal. This badge used to be a hand-written "=" because the
      // verdict was capped at `≤` by the AGREEING quadrature — a claim that does not depend on the
      // quadrature being labelled by it. `residueTheorem.ts` now reports the corroboration beside the
      // value instead of inside it, so the computed level is the one to show.
      head.append(badge(theorem.verdict.level), ` ${theorem.exactValue.text}`);
      resultCard.append(head);
      const field =
        poles?.radicand === null || poles?.radicand === undefined
          ? "ℚ(i)"
          : `ℚ(i)(√${poles.radicand})`;
      // The IDENTITY, from the result rather than from a literal here. A dogbone is solved by a
      // different equation — `2πi[Σ(n − σ)Res − σRes(f,∞)]` — and printing the plain one above its
      // answer states the very equation D6 exists to show is inapplicable.
      resultCard.append(
        el(
          "p",
          "muted small",
          `${(theorem.identity ?? RESIDUE_THEOREM_IDENTITY).replace("∮ f dz = ", "")}, from exact residues over ${field}`,
        ),
      );
      // Three states, not two: agreement, disagreement, and NOTHING TO COMPARE. Folding the third
      // into the second announced a disagreement of exactly 0.00e+0 for a keyhole, which reads as a
      // contradiction where there was simply no second route.
      if (integral.quadratureSkipped === undefined) {
        const check = el("p", theorem.crossCheck !== undefined ? "crosscheck" : "restriction");
        check.append(
          badge(theorem.crossCheck?.level ?? "⚠"),
          theorem.crossCheck !== undefined
            ? ` quadrature agrees to ${(theorem.disagreement ?? 0).toExponential(2)}`
            : ` the quadrature DISAGREES by ${(theorem.disagreement ?? 0).toExponential(2)} — one of them is wrong`,
        );
        resultCard.append(check);
      }
    }

    // NO NUMERIC LINE WHEN THERE IS NO QUADRATURE. `integral.value ?? [0,0]` would have printed
    // `≈ 0.000 + 0.000i` beside the exact answer — a fabricated second opinion, and the one thing a
    // corroboration line must never be. The skip states its own reason instead.
    if (integral.quadratureSkipped !== undefined) {
      const why = el("p", "restriction");
      why.append(badge("?"), " no quadrature to compare against");
      resultCard.append(why, el("p", "muted small", integral.quadratureSkipped));
    } else {
      const value = integral.value ?? [0, 0];
      const head = el("p", theorem?.exactValue ? "num numericValue" : "resultValue num");
      head.append(badge(integral.verdict.level), ` ${fmtCx(value)}`);
      resultCard.append(head);
      if (!theorem?.exactValue) {
        resultCard.append(el("p", "muted small", describeLevel(integral.verdict.level)));
      }
    }

    for (const r of integral.verdict.restrictions) {
      resultCard.append(el("p", "restriction", r));
    }

    if (integral.windings.length > 0) {
      const list = el("ul", "windings");
      for (const w of integral.windings) {
        const li = el("li");
        li.append(
          el("span", "num", `n(γ, ${fmtCx(w.at)})`),
          el("span", w.decided ? "tag" : "tag warn", w.decided ? `= ${w.n}` : "undecided"),
        );
        list.append(li);
      }
      resultCard.append(el("p", "muted small", "Winding numbers (exact):"), list);
    }
    resultCard.append(
      el("p", "muted small", `${integral.closed ? "Closed" : "Not closed"} contour.`),
    );
  }

  /**
   * Which channel a parameter's slider writes to.
   *
   * In the sandbox every parameter is geometry, so a move edits the contour in place. Under a record
   * the three kinds are genuinely different: a FAMILY parameter rebuilds the integrand as well as the
   * contour, a LIMIT parameter is geometry alone (and must never be substituted into the integrand —
   * tier B renames its radius `R_lim` because `R` there is the rational function), and a DERIVED value
   * is computed from the others, so moving it independently would desync the geometry from its own
   * definition. Anything a family did not declare falls to `derived`, which is read-only.
   */
  /**
   * Write a parameter, through whichever channel owns it, and recompute.
   *
   * The sliders and the radius handles are the same edit and now go through the same door: dragging
   * the indented semicircle's outer arc moves `R` exactly as its slider does, which is what makes the
   * handle an affordance for the argument's own limit rather than a second way to change the picture.
   */
  function applyParam(name: string, value: number): void {
    const channel = channelOf(name);
    if (channel === "binding") {
      bindingOverrides = { ...bindingOverrides, [name]: value };
    } else if (channel === "geometry") {
      geometryOverrides = { ...geometryOverrides, [name]: value };
    } else {
      contour = setParam(contour, name, value);
    }
    recompute();
  }

  function channelOf(name: string): "sandbox" | "binding" | "geometry" | "derived" {
    if (mode !== "gallery" || !family) return "sandbox";
    if (family.contour.limitParams.some((l) => l.name === name)) return "geometry";
    if (family.parameters.some((q) => q.name === name)) return "binding";
    return "derived";
  }

  function renderContourCard(): void {
    contourCard.replaceChildren(el("h2", undefined, "Contour"));

    // No template picker under a record: the contour is the record's, and swapping it would leave a
    // worked example whose pieces no longer match the argument it is making.
    if (mode === "sandbox") {
      const picker = el("div", "presets");
      for (const t of TEMPLATES) {
        const b = el("button", "preset", t.label);
        b.type = "button";
        b.addEventListener("click", () => {
          contour = t.build();
          if (t.seed !== undefined && branch.points.length === 0) branch = t.seed(branch);
          recompute();
          frameContour();
        });
        picker.append(b);
      }
      contourCard.append(picker);
    } else if (family) {
      contourCard.append(el("p", "muted small", `template: ${family.contour.template}`));
    }

    for (const p of Object.values(contour.params)) {
      const channel = channelOf(p.name);
      if (channel === "derived") {
        const row = el("label", "paramRow");
        row.append(
          el("span", "num", `${p.name} = ${fmt(p.value)}`),
          el("span", "tag", "derived"),
        );
        contourCard.append(row);
        continue;
      }

      const wrap = el("label", "paramRow");
      const slider = el("input", "slider");
      slider.type = "range";
      slider.min = "0";
      slider.max = "1000";
      // Frozen bounds under a record, so a drag does not rescale its own track (see `frozenRanges`).
      const bounds = frozenRanges[p.name] ?? { range: p.range, scale: p.scale };
      const [lo, hi] = bounds.range;
      const toSlider = (v: number): number =>
        bounds.scale === "log"
          ? (1000 * (Math.log(v) - Math.log(lo))) / (Math.log(hi) - Math.log(lo))
          : (1000 * (v - lo)) / (hi - lo);
      const fromSlider = (t: number): number =>
        bounds.scale === "log"
          ? Math.exp(Math.log(lo) + (t / 1000) * (Math.log(hi) - Math.log(lo)))
          : lo + (t / 1000) * (hi - lo);
      slider.value = String(Math.round(toSlider(p.value)));
      const readout = el("span", "num", `${p.name} = ${fmt(p.value)}`);
      slider.addEventListener("input", () => {
        const v = fromSlider(Number(slider.value));
        readout.textContent = `${p.name} = ${fmt(v)}`;
        applyParam(p.name, v);
      });
      wrap.append(readout, slider);
      if (channel === "geometry" && p.limit) {
        wrap.append(el("span", "tag", p.limit.to === "inf" ? "→ ∞" : "→ 0⁺"));
      }
      contourCard.append(wrap);
    }

    const list = el("ul", "pieces");
    contour.pieces.forEach((piece, k) => {
      const li = el("li");
      const swatch = el("span", "chip");
      swatch.style.background = PIECE_COLOURS[piece.colour % PIECE_COLOURS.length];
      const pieceIntegral = integral?.pieces[k];
      li.append(swatch, el("span", "pieceName", piece.name), el("span", "tag", piece.role));
      // **A SKIPPED QUADRATURE HAS NO VALUE, AND `0 + 0i` IS NOT IT.** `integrateContour` fills the
      // piece list with zeros when it declines to sample a multivalued integrand, which is fine as a
      // placeholder and a lie on screen: D6's upper edge is worth 2.22, and printing `0 + 0i` beside
      // it is exactly the number a reader would go looking for the bug in.
      if (pieceIntegral && integral?.quadratureSkipped === undefined) {
        const v = el("span", "num pieceValue", fmtCx(pieceIntegral.value));
        li.append(v);
        if (pieceIntegral.capped) li.append(el("span", "tag warn", "resolution capped"));
      } else if (pieceIntegral) {
        li.append(el("span", "tag", "not sampled"));
      }
      li.addEventListener("pointerenter", () => {
        highlight = k;
        requestDraw();
      });
      li.addEventListener("pointerleave", () => {
        highlight = -1;
        requestDraw();
      });
      list.append(li);
    });
    contourCard.append(list);
  }

  /**
   * The declared cut system, and the one line that says whether it is legal.
   *
   * The verdict is shown HERE as well as in the ledger deliberately: it is the thing that changes as
   * a cut is dragged, and a reader watching their own hand should not have to look across the rail
   * to see the consequence. Both readings come from the same `checkAdmissibility` call the ledger
   * makes, so they cannot say different things.
   */
  function renderBranchCard(): void {
    branchCard.replaceChildren(el("h2", undefined, "Branch cuts"));
    if (mode !== "sandbox") {
      branchCard.append(
        el("p", "muted small", "A record's cuts are the record's. Switch to the sandbox to draw one."),
      );
      // **THE BACKDROP IS DRAWN IN THE PRINCIPAL BRANCH, NOT THE DECLARED ONE**, and saying so is the
      // difference between a picture and a claim. The colouring comes from the compiled evaluator,
      // which uses principal determinations for every sub-expression — so for D7 it shows a seam on
      // `(b, ∞)` where the composite is in fact continuous, which is that record's own
      // `rendering-the-union-of-sub-cuts` trap looking back at the reader. The LEDGER is unaffected:
      // every number on the right comes from exact residues in the DECLARED determination, and the
      // quadrature is skipped for exactly this reason. Rendering the declared branch is M4.7's work.
      if (family?.branch !== undefined) {
        branchCard.append(
          el(
            "p",
            "muted small",
            "⚠ the colouring behind the contour is drawn in the PRINCIPAL branch of each factor, not the determination this record declares — so it can show a seam where the composite is continuous. Every number in the ledger comes from the declared one.",
          ),
        );
      }
      return;
    }

    const tools = el("div", "presets");
    const add = el("button", "preset", "+ branch point");
    add.type = "button";
    add.addEventListener("click", () => {
      // Placed at the middle of the view rather than at the origin, so a second point does not land
      // on the first and a point never appears off screen.
      const c = branch.points.length === 0 ? ([0, 0] as Cx) : ([view.center[0] + 1, view.center[1]] as Cx);
      branch = addBranchPoint(branch, c);
      recompute();
    });
    tools.append(add);

    // The dogbone gesture, offered exactly when it means something: two points, and a shape to
    // toggle between. Whether the JOIN is admissible is the ledger's call, not this button's.
    const bounded = branch.cuts.find((c) => c.from !== INFINITY_ID && c.to !== INFINITY_ID);
    if (branch.points.length === 2 && bounded === undefined) {
      const join = el("button", "preset", "join into one cut");
      join.type = "button";
      join.addEventListener("click", () => {
        const next = joinToOneCut(branch, branch.points[0].id, branch.points[1].id);
        if (next !== null) branch = next;
        recompute();
      });
      tools.append(join);
    } else if (bounded !== undefined) {
      const split = el("button", "preset", "split into two rays");
      split.type = "button";
      split.addEventListener("click", () => {
        const next = splitToRays(branch, bounded.id);
        if (next !== null) branch = next;
        recompute();
      });
      tools.append(split);
    }
    branchCard.append(tools);

    if (branch.points.length === 0) {
      branchCard.append(
        el("p", "muted small", "No branch points declared, so the integrand is treated as single-valued."),
      );
      return;
    }

    const report = checkAdmissibility(branch);
    const head = el("p", "verdict");
    head.append(badge(report.certificate.level), ` ${report.detail}`);
    branchCard.append(head);
    if (!report.ok && report.repair !== undefined) {
      branchCard.append(el("p", "muted small", report.repair));
    }

    const list = el("ul", "pieces");
    for (const point of branch.points) {
      const li = el("li");
      const pick = el("select", "picker");
      pick.setAttribute("aria-label", `order of branch point ${point.id}`);
      for (const o of OFFERED_ORDERS) {
        const opt = document.createElement("option");
        opt.value = o.label;
        opt.textContent = o.label;
        opt.selected = orderLabel(o.order) === orderLabel(point.order);
        pick.append(opt);
      }
      pick.addEventListener("change", () => {
        const chosen = OFFERED_ORDERS.find((o) => o.label === pick.value);
        if (chosen) branch = setOrder(branch, point.id, chosen.order);
        recompute();
      });
      const drop = el("button", "preset", "remove");
      drop.type = "button";
      drop.setAttribute("aria-label", `remove branch point ${point.id}`);
      drop.addEventListener("click", () => {
        branch = removeBranchPoint(branch, point.id);
        recompute();
      });
      li.append(el("span", "pieceName", point.label), pick, drop);
      list.append(li);
    }
    branchCard.append(list);
  }

  function renderPoles(): void {
    poleCard.replaceChildren(el("h2", undefined, "Poles"));
    if (!poles) {
      poleCard.append(el("p", "muted", "No integrand."));
      return;
    }
    const verdict = assembleVerdict(poles.certificates);
    const head = el("p", "verdict");
    head.append(badge(verdict.level), ` ${describeLevel(verdict.level)}`);
    poleCard.append(head);

    if (!poles.rational) {
      poleCard.append(
        el("p", "muted", "f is not a rational function of z, so no poles are claimed."),
      );
      return;
    }
    if (poles.poles.length === 0) {
      poleCard.append(el("p", "muted", "No poles."));
      return;
    }
    const list = el("ul", "poles");
    for (const pole of poles.poles) {
      const li = el("li");
      li.append(el("span", "num", fmtCx(pole.at)));
      if (pole.order > 1) li.append(el("span", "tag", `order ${pole.order}`));
      if (!pole.orderCertain) li.append(el("span", "tag warn", "order uncertain"));
      if (pole.possiblyRemovable) li.append(el("span", "tag warn", "may be removable"));
      if (pole.residue) {
        const res = el("span", "num residueText");
        // No badge: there is no per-pole certificate to read one from, and the card already states
        // the pole report's own verdict above. A literal "=" here was a label with nothing behind it.
        res.append(` Res = ${pole.residue.text}`);
        li.append(res);
      } else if (pole.isExact === false) {
        li.append(el("span", "tag warn", "≈ located numerically"));
      }
      list.append(li);
    }
    poleCard.append(list);
    // **WHOSE RESIDUES THESE ARE.** A branch record's pole report describes the RATIONAL COFACTOR, not
    // the integrand: the branch point carries no residue, and `Res(f, z₀)` is the cofactor's residue
    // times the branch factor's value there. D6 is where the distinction stops being pedantic —
    // `Σ Res(R) = 0` for it, printed unqualified beside a non-zero answer, reads as a contradiction.
    if (family?.branch !== undefined) {
      poleCard.append(
        el(
          "p",
          "muted small",
          "of the rational cofactor R — the branch point carries no residue, and Res(f, z₀) is this times the branch factor at z₀",
        ),
      );
    }
    if (poles.exactResidueSum) {
      poleCard.append(
        el(
          "p",
          "muted small",
          `Σ Res = ${poles.exactResidueSum.text} (exact, over every pole${family?.branch === undefined ? "" : " of R"})`,
        ),
      );
    }
  }

  // --- interaction --------------------------------------------------------------------------
  //
  // THREE THINGS A POINTER DRAG CAN MEAN, decided in this order: a radius handle, then the contour
  // itself, then the view. Until now every drag panned the view, so north-star behaviour 1 — drag a
  // contour across a pole and watch the value jump by exactly `2πi·Res` — was reachable only through a
  // parameter slider, which is not the same experience and was not the promise.
  let lastX = 0;
  let lastY = 0;

  const stagePoint = (ev: PointerEvent): readonly [number, number] => {
    const rect = stageWrap.getBoundingClientRect();
    return [ev.clientX - rect.left, ev.clientY - rect.top];
  };
  const plotAt = (px: number, py: number): Cx => screenToPlot(px, py, view, viewport());
  /** The grab radius in PLOT units, so it is a constant number of pixels at every zoom level. */
  const grabTolerance = (): number => GRAB_PX * scale(view, viewport());

  /**
   * Whether the contour may be moved bodily.
   *
   * Sandbox only. Under a gallery record the contour is the record's, and translating it would leave a
   * worked example whose pieces no longer match the argument it is making — the same reason 3.5a hides
   * the template picker there. The radius handles still work, because those edit the parameters the
   * record itself declares, and `R → ∞` / `ρ → 0` are what its argument is about.
   */
  const canMoveBody = (): boolean => mode === "sandbox";

  function updateCursor(px?: number, py?: number): void {
    if (gesture === "contour") {
      stageWrap.style.cursor = "grabbing";
      return;
    }
    if (gesture === "view" || px === undefined || py === undefined) {
      stageWrap.style.cursor = gesture === "view" ? "grabbing" : "default";
      return;
    }
    const at = plotAt(px, py);
    const tol = grabTolerance();
    const over =
      nearestBranchHandle(at, tol) !== null ||
      nearestHandle(handles, at, tol) !== null ||
      (canMoveBody() && onContour(resolved, at, tol));
    stageWrap.style.cursor = over ? "grab" : "default";
  }

  /**
   * Compare the draft value the drag ended on against the full one, and log a disagreement.
   *
   * PLAN §4.5's instruction, verbatim: re-run the full quadrature on release and reconcile —
   * "disagreement beyond the estimator's bound is a bug signal worth logging". It is a `console.warn`
   * rather than a UI surface because the user cannot act on it; a developer can.
   */
  function reconcileDraft(draft: Cx | undefined, worstEstimate: number): void {
    const full = integral?.value;
    if (draft === undefined || full === undefined) return;
    const off = Math.hypot(full[0] - draft[0], full[1] - draft[1]);
    const tol = Math.max(32 * worstEstimate, 1e-9 * Math.max(1, Math.hypot(full[0], full[1])));
    if (off > tol) {
      console.warn(
        `[contour-integration] the draft quadrature used during the drag and the full one on release ` +
          `disagree by ${off.toExponential(2)}, past the estimator's own bound of ${tol.toExponential(2)}`,
      );
    }
  }

  /** The branch handle nearest `at` within `tol`, or null. Same rule as `nearestHandle`. */
  function nearestBranchHandle(at: Cx, tol: number): BranchHandle | null {
    let best: BranchHandle | null = null;
    let bestD = tol;
    for (const h of bHandles) {
      const d = Math.hypot(h.at[0] - at[0], h.at[1] - at[1]);
      if (d <= bestD) {
        bestD = d;
        best = h;
      }
    }
    return best;
  }

  stageWrap.addEventListener("pointerdown", (ev) => {
    const [px, py] = stagePoint(ev);
    const at = plotAt(px, py);
    const tol = grabTolerance();
    // A cut vertex is checked BEFORE the contour's own handles: it is the smaller target, it is
    // usually the thing sitting on top, and a drag that hits the contour instead would move the one
    // object the user was trying to hold still.
    const bHandle = nearestBranchHandle(at, tol);
    const handle = bHandle === null ? nearestHandle(handles, at, tol) : null;
    if (bHandle !== null) {
      grab = { kind: "branch", handle: bHandle };
      gesture = "contour";
    } else if (handle !== null) {
      grab = { kind: "radius", handle };
      gesture = "contour";
    } else if (canMoveBody() && onContour(resolved, at, tol)) {
      grab = { kind: "body" };
      gesture = "contour";
      // Anchored, not accumulated: a long drag measured from where it started cannot drift, and the
      // `add` offsets stay a single term instead of a sum of every pointer move.
      anchorContour = contour;
      anchorAt = at;
    } else {
      gesture = "view";
    }
    lastX = ev.clientX;
    lastY = ev.clientY;
    stageWrap.setPointerCapture(ev.pointerId);
    updateCursor(px, py);
    if (gesture === "contour") requestDraw();
  });

  stageWrap.addEventListener("pointermove", (ev) => {
    const [px, py] = stagePoint(ev);
    if (gesture === "none") {
      const at = plotAt(px, py);
      const tol = grabTolerance();
      const bHandle = nearestBranchHandle(at, tol);
      const bIndex = bHandle === null ? -1 : bHandles.indexOf(bHandle);
      const handle = bHandle === null ? nearestHandle(handles, at, tol) : null;
      const index = handle === null ? -1 : handles.indexOf(handle);
      if (index !== hovered || bIndex !== bHovered) {
        hovered = index;
        bHovered = bIndex;
        requestDraw();
      }
      updateCursor(px, py);
      return;
    }
    if (gesture === "view") {
      view = panBy(view, ev.clientX - lastX, ev.clientY - lastY, viewport());
      lastX = ev.clientX;
      lastY = ev.clientY;
      requestDraw();
      return;
    }

    const at = plotAt(px, py);
    if (grab?.kind === "branch") {
      branch = applyBranchGrab(branch, grab.handle.grab, at);
      recompute();
    } else if (grab?.kind === "body" && anchorContour !== null) {
      contour = translateContour(anchorContour, [at[0] - anchorAt[0], at[1] - anchorAt[1]]);
      recompute();
    } else if (grab?.kind === "radius") {
      // Out of range returns null rather than clamping, so the handle simply stops at the parameter's
      // declared bound instead of silently pinning it there.
      const next = radiusDragValue(contour, grab.handle, at);
      if (next !== null) applyParam(next.param, next.value);
    }
  });

  const endGesture = (ev: PointerEvent): void => {
    if (gesture === "none") return;
    const wasContour = gesture === "contour";
    const draft = wasContour ? integral?.value : undefined;
    const worst = wasContour
      ? Math.max(0, ...(integral?.pieces.map((q) => q.errorEstimate) ?? [0]))
      : 0;
    gesture = "none";
    anchorContour = null;
    stageWrap.releasePointerCapture(ev.pointerId);
    if (wasContour) {
      recompute();
      reconcileDraft(draft, worst);
    }
    updateCursor();
  };
  stageWrap.addEventListener("pointerup", endGesture);
  stageWrap.addEventListener("pointercancel", endGesture);

  // --- the same three things, from the keyboard ----------------------------------------------
  const grabName = (): string =>
    grab === null
      ? "the view"
      : grab.kind === "body"
        ? "the whole contour"
        : grab.kind === "branch"
          ? grab.handle.label
          : `${grab.handle.pieceName} (${grab.handle.param})`;

  /** Re-point a handle grab at the rebuilt handle, so repeated key presses keep working. */
  function refreshGrab(): void {
    const held = grab;
    if (held === null) return;
    if (held.kind === "radius") {
      const again = handles.find(
        (h) => h.param === held.handle.param && h.pieceIndex === held.handle.pieceIndex,
      );
      grab = again === undefined ? null : { kind: "radius", handle: again };
      return;
    }
    if (held.kind !== "branch") return;
    const want = held.handle.grab;
    const again = bHandles.find((h) => sameBranchGrab(h.grab, want));
    grab = again === undefined ? null : { kind: "branch", handle: again };
  }

  const sameBranchGrab = (a: BranchGrab, b: BranchGrab): boolean =>
    a.kind === b.kind &&
    a.id === b.id &&
    (a.kind !== "cut" || (b.kind === "cut" && a.index === b.index));

  /** Enter / Space walks what the arrows act on: the view, the contour, then each radius handle. */
  function cycleGrab(): void {
    const stops: (typeof grab)[] = [null];
    if (canMoveBody()) stops.push({ kind: "body" });
    for (const handle of handles) stops.push({ kind: "radius", handle });
    for (const handle of bHandles) stops.push({ kind: "branch", handle });
    const sameAs = (a: typeof grab): boolean => {
      if (a === null) return grab === null;
      if (grab === null || a.kind !== grab.kind) return false;
      if (a.kind === "radius") return grab.kind === "radius" && a.handle.param === grab.handle.param;
      if (a.kind === "branch") {
        return grab.kind === "branch" && sameBranchGrab(a.handle.grab, grab.handle.grab);
      }
      return true;
    };
    const index = stops.findIndex(sameAs);
    grab = stops[(index + 1) % stops.length] ?? null;
    announce(
      grab === null
        ? "Arrow keys pan the view. Press Enter to grab the contour instead."
        : `Arrow keys now move ${grabName()}. Press Enter for the next handle.`,
    );
    requestDraw();
  }

  function moveGrab(dx: number, dy: number): void {
    const held = grab;
    if (held === null) return;
    const port = viewport();
    // A fixed fraction of the viewport, as for panning, so a step means the same thing at every zoom.
    const step = (Math.min(port.width, port.height) / 24) * scale(view, port);
    // Screen y runs down and plot y runs up.
    const d: Cx = [dx * step, -dy * step];
    if (held.kind === "body") {
      if (!canMoveBody()) return;
      contour = translateContour(contour, d);
      recompute();
    } else if (held.kind === "branch") {
      branch = applyBranchGrab(branch, held.handle.grab, [
        held.handle.at[0] + d[0],
        held.handle.at[1] + d[1],
      ]);
      recompute();
    } else {
      const next = radiusDragValue(contour, held.handle, [
        held.handle.at[0] + d[0],
        held.handle.at[1] + d[1],
      ]);
      if (next !== null) applyParam(next.param, next.value);
    }
    refreshGrab();
  }

  // The accessible-canvas contract (ADR-0032): the GL canvas is the RENDER surface and is hidden
  // from assistive tech; the ink overlay above it carries the name, the focus and the keyboard map,
  // so the stage is navigable without a pointer at all.
  const stageA11y = attachCanvasA11y(inkCanvas, {
    label:
      "The complex plane: the integrand's phase portrait with the contour drawn over it. " +
      "Arrow keys pan, plus and minus zoom. Press Enter to grab the contour, one of its radius " +
      "handles, or a branch point or branch cut, after which the arrow keys move what you grabbed " +
      "and shift with an arrow pans.",
    role: "application",
    render: glCanvas,
    liveRegionHost: stageWrap,
    onKey: (action: CanvasKeyAction, ev: KeyboardEvent) => {
      const port = viewport();
      if (action.kind === "commit") {
        cycleGrab();
        return;
      }
      // With something grabbed the arrows MOVE it and shift pans, rather than the other way round:
      // the grab was just asked for, so it is the primary action until it is released.
      if (action.kind === "pan" && grab !== null && !ev.shiftKey) {
        moveGrab(action.dx, action.dy);
        return;
      }
      if (action.kind === "pan") {
        // A keyboard step is a fixed fraction of the viewport, so it means the same thing at every
        // zoom level — unlike a pixel step, which shrinks as you zoom in.
        const step = Math.min(port.width, port.height) / 12;
        view = panBy(view, -action.dx * step, -action.dy * step, port);
      } else if (action.kind === "zoom") {
        view = zoomAt(view, action.direction > 0 ? 1.25 : 1 / 1.25, port.width / 2, port.height / 2, port);
      } else {
        return;
      }
      requestDraw();
    },
  });

  announce = (message) => stageA11y.announce(message);

  stageWrap.addEventListener(
    "wheel",
    (ev) => {
      ev.preventDefault();
      const rect = stageWrap.getBoundingClientRect();
      view = zoomAt(view, Math.exp(-ev.deltaY * 0.0015), ev.clientX - rect.left, ev.clientY - rect.top, viewport());
      requestDraw();
    },
    { passive: false },
  );

  scrubber.addEventListener("input", () => {
    scrub = Number(scrubber.value) / 1000;
    drawAcc();
    requestDraw();
  });

  input.addEventListener("change", applyExpression);
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") applyExpression();
  });
  recordSelect.addEventListener("change", () => loadRecord(recordSelect.value));
  fixtureSelect.addEventListener("change", () => {
    const k = Number(fixtureSelect.value);
    if (family && Number.isInteger(k)) selectFixture(family.golden[k] ?? null);
  });
  window.addEventListener("resize", () => {
    drawAcc();
    requestDraw();
  });

  // Through `setMode` rather than straight to `applyExpression`, so the bar's two groups start in the
  // state the mode says they should be in instead of in whatever order they were appended.
  setMode(mode);
}
