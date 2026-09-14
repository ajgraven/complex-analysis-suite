import { Frac } from "@cas/exact";
import { assembleVerdict, describeLevel } from "@cas/rigor";
import { injectPngText } from "@cas/export";
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
import { pointAt, type Cx, type Resolved } from "../kernel/geom.js";
import type { PoleReport } from "../kernel/poles.js";
import { checkAdmissibility } from "../kernel/branch/admissibility.js";
import { jumpWeights } from "../kernel/branch/correction.js";
import { allCrossingMonodromy } from "../kernel/branch/monodromy.js";
import type { DeclaredProduct } from "../kernel/branch/declared.js";
import { formatFrac, formatSqrtExt } from "../kernel/formatExact.js";
import {
  INFINITY as INFINITY_ID,
  NO_BRANCH,
  cutPolyline,
  effectiveBranch,
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
  setCutFromWindow,
  setShadow,
  setSheet,
} from "../engine/branchEdit.js";
import { accumulateForIntegral, type Accumulation } from "../engine/contour/accumulate.js";
import { declaredKey } from "../engine/declaredRun.js";
import type { SplitCheck } from "../engine/splitCheck.js";
import type { DeclaredOrder } from "../kernel/branch/declaration.js";
import { buildDerivation, type Derivation, type Statement } from "../engine/derivation.js";
import { RESIDUE_THEOREM_IDENTITY } from "../engine/residueTheorem.js";
import { PRESETS } from "./presets.js";
import type { ContourIntegral } from "../engine/contour/integrate.js";
import type { ResidueTheoremResult } from "../engine/residueTheorem.js";
import { integralRefusal, ledgerHeadline, type LedgerResult } from "../engine/ledger.js";
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
import { isVariant, primaryGolden, type FamilyRun } from "../families/runFamily.js";
import type { Family, FamilyTarget, Golden } from "../families/schema.js";
import type { PiSolvedTargets, SolvedValue } from "../families/solveTarget.js";
import type { Bindings } from "../families/system.js";
import { TEMPLATES } from "./templates.js";
import { decodeShell, encodeShell } from "./viewState.js";
import {
  drawFigure,
  figureCaption,
  figureLayout,
  figureMetadata,
  type FigureCaption,
} from "./figure.js";
import {
  compile,
  declaredOrder as orderOfState,
  offeredCorpus,
  recordOf,
  resolveState,
  type Compiled,
  type ContourSource,
  type ShellState,
  type StateResolution,
} from "./state.js";
import { GLStage } from "../ui/stage/glStage.js";
import { drawContour, PIECE_COLOURS } from "../ui/stage/ink.js";
import { CONTRAST_LABELS, drawAccumulator, type ContrastMode } from "../ui/accumulator.js";
import { CONTRAST_CELLS, contrastTable } from "./contrastGrid.js";
import { bulgeFromApex, penContour, penPath, type PenNode } from "../engine/contour/pen.js";

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

/**
 * What the arrow keys do on the stage — a constant, because it is prepended to a description that
 * IS regenerated, and two copies of the instructions would be two things to keep in step.
 */
const STAGE_KEYS =
  "The complex plane: the integrand's phase portrait with the contour drawn over it. " +
  "Arrow keys pan, plus and minus zoom. Press Enter to grab the contour, one of its radius " +
  "handles, or a branch point or branch cut, after which the arrow keys move what you grabbed " +
  "and shift with an arrow pans.";

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

/**
 * The pre-`navigator.clipboard` copy path: a hidden textarea and `document.execCommand("copy")`.
 *
 * Deprecated and still the only thing that works on a page served over plain HTTP or in an engine
 * without the async clipboard, which is exactly where a reader most needs the link they were given.
 * Returns whether it worked, so the caller can say "copied" or say it could not.
 */
function legacyCopy(text: string): boolean {
  const box = document.createElement("textarea");
  box.value = text;
  box.setAttribute("readonly", "");
  box.style.position = "fixed";
  box.style.opacity = "0";
  document.body.append(box);
  box.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  box.remove();
  return ok;
}

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

/**
 * What the auxiliary integrand's relation to the target actually IS, in one line.
 *
 * **NOT ALWAYS "the target is Re of ∮ f dz", and printing that unconditionally was false for G2.**
 * A tier-G record's target is a TERM of the residue sum — the kernel has residue 1 at every integer,
 * so `Res(K·f, n)` IS the summand — and `∮` tends to zero, taking any real part of it with it. The
 * record fills `relation` because `auxiliary` means "the contour integrand differs from the target's",
 * which is true; what is not true is that a real-linear functional recovers the target from `∮`. The
 * same declaration the COVER row reads decides which sentence this is, so the two cannot disagree.
 */
function relationText(family: Family): string {
  const aux = family.auxiliary;
  if (aux === undefined) return "";
  const inSum = family.residueSelection.targetTerms?.[0];
  const how =
    inSum === undefined
      ? `the target is ${aux.relation} of ∮ f dz`
      : `${inSum.targetId} is a TERM of the residue sum, not a functional of ∮ f dz`;
  return `${how} — ${aux.note}`;
}

/**
 * A mounted shell, from the outside.
 *
 * Two functions and no more, because there is exactly one thing a caller needs of a mounted app
 * that it cannot get from the DOM: its state as data, and the ability to put one back. `main.ts`
 * ignores this; `test/shell.test.ts` and M6.2's permalinks are what it is for.
 */
export interface ShellHandle {
  readonly currentState: () => ShellState;
  readonly applyState: (next: ShellState) => void;
}

export function mountApp(root: Element): ShellHandle {
  let view: View = DEFAULT_VIEW;
  // NO `ast` / `f` LOCALS. They were the compiled integrand and its evaluator, and every reader of
  // them is now downstream of `resolveState`, which carries whichever pair the branch that ran
  // actually used — the record's, the declared product's, or the box's. Keeping shell-level copies
  // meant three writers and a window in which they disagreed with the numbers on screen. `poles`
  // stays because the poles CARD and the derivation read it directly.
  let poles: PoleReport | null = null;
  /**
   * The sandbox expression's parse, cached because the cost is not in the resolve.
   *
   * `findPoles` on a rational does root-finding, and re-running it on every frame of a contour drag
   * is the one regression this app can least afford. Recomputed when the EXPRESSION changes, which
   * is what `applyExpression` is. Gallery mode ignores it: a record's contour integrand comes from
   * the record, substitution and Jacobian included, and never from the box.
   */
  let compiled: Compiled | null = null;
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

  // --- the pen (M7.2c) ----------------------------------------------------------------------
  /**
   * The path being drawn, or `null` when the pen is not out.
   *
   * **A THIRD TOP-LEVEL STATE, not a fourth `grab` kind.** `grab` answers "what does a MOVE act
   * on?", and the pen's grammar is click-to-place: there is nothing held between events, and a drag
   * bows the piece just placed rather than moving anything. Filing it under `grab` would make every
   * reader of that union ask whether the pen can be dragged.
   *
   * It is NOT in `ShellState`, deliberately: a half-drawn path is not a state worth sharing or
   * restoring, and `contour` already holds every finished one. `penNodes` is the gesture; the
   * contour is the result.
   */
  let penNodes: PenNode[] | null = null;
  /** Where the pointer is while drawing, in plot coordinates — the pending piece's other end. */
  let penAt: Cx | null = null;
  /** The snap that fired for `penAt`, so the badge can name it (research 07 rule 5). */
  let penSnap: string | null = null;
  /** Held while a drag bows the piece just placed; `null` between clicks. */
  let penDrag: { readonly from: Cx; readonly index: number } | null = null;
  /**
   * The declared cut system — a SANDBOX object, not something read out of the integrand.
   *
   * `engine/branchEdit.ts` says why it is declared rather than detected. Under a gallery record it
   * stays empty: a record's argument is the record's, and a cut drawn across it would be editing a
   * worked example rather than exploring one.
   */
  /**
   * The sandbox's own cut system. `NO_BRANCH` with its LAMP moved off the origin.
   *
   * `NO_BRANCH.basePoint` is `[0,0]`, which is right for a rational integrand where nothing reads
   * it — and wrong here, because the first branch point a reader adds also lands at the origin and
   * a point sitting ON the base point casts no shadow. Shadow mode then refused on its first click,
   * correctly and uselessly. Every gallery record puts its base point at `i` for the same reason,
   * so the sandbox does too rather than inventing a third convention.
   */
  let branch: BranchChoice = { ...NO_BRANCH, basePoint: [0, 1] };
  /** The open record's cut system, when it declares one. Drawn, never edited. */
  let recordBranch: BranchChoice | null = null;
  /**
   * The declared branch product on the stage, when the open record has one — research 06 §5.1 #2.
   *
   * Held so the Branch-cuts card can say WHICH of the two honest cases the modulus contours are
   * showing: over a power product `|f|` cannot see the determination and the contours run straight
   * through the seam, and over a `log^m` the monodromy is additive so they break at it. Both are
   * honest and they are not the same claim.
   */
  let declaredOnStage: DeclaredProduct | null = null;
  /**
   * Modulus contours: `null` follows the context, a boolean is the reader's own choice.
   *
   * Default-on under a record with a branch and off elsewhere, because that is the case the device
   * exists for — a seam on the stage with nothing to tell the reader it is a choice. An explicit
   * click sticks, so the default never overrides a decision.
   */
  let isoPref: boolean | null = null;
  const isoOn = (): boolean => isoPref ?? declaredOnStage !== null;
  /**
   * The cut system to ANALYSE and DRAW — the shadow of the base point, or the declared arcs.
   *
   * One accessor, because the alternative is for each of the ledger, the ink layer and the readout
   * to remember to derive, and the first one that forgot would draw a cut the verdict is not about.
   * The EDITOR and the handles deliberately read `branch` itself: the declaration is what a reader
   * edits, and `shadowCuts` clears the flag on what it returns so a derived system cannot be edited
   * as though it were declared.
   */
  const effective = (): BranchChoice =>
    effectiveBranch(mode === "sandbox" ? branch : (recordBranch ?? NO_BRANCH));
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
  /** The recipe's shift when the gesture began, so a drag is measured from an anchor here too. */
  let anchorShift: Cx = [0, 0];
  let anchorAt: Cx = [0, 0];

  // --- gallery state -----------------------------------------------------------------------
  // ONE door into the corpus, and it is the loader's output rather than the raw `FAMILIES` array: a
  // record that failed an invariant must not be openable anywhere, because a worked example that
  // cannot be worked is worse than a missing one.
  const offered = offeredCorpus();
  let mode: "sandbox" | "gallery" = "sandbox";
  /**
   * The sandbox's own contour, parked while a record is open.
   *
   * Opening a record REPLACES `contour`, so without this, switching back left the record's geometry
   * standing under a typed integrand — C1's indented semicircle with `1/z` on it. Not wrong, but not
   * a state either mode meant to produce, and the user did not ask for it.
   */
  let sandboxContour: Contour = contour;
  /**
   * The sandbox contour's PROVENANCE — see `ShellState.contourSource`.
   *
   * Not nulled by gallery mode, exactly as `branch` is not: it is the SANDBOX's, a record derives
   * its own contour, and keeping it means the parked contour and its recipe come back together.
   */
  let contourSource: ContourSource | null = { template: TEMPLATES[0].id, shift: [0, 0] };
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
  // `<main>`, which is one of the two axe findings this page has ever had: the grid holding the
  // stage, the rail and the strip IS the document's main content, and it was a bare `div`.
  const shell = el("main", "shell");
  const bar = el("header", "bar");
  const stageWrap = el("div", "stage");
  const glCanvas = el("canvas", "gl");
  const inkCanvas = el("canvas", "ink");
  const overlay = el("div", "overlay");
  const rail = el("aside", "rail");
  const strip = el("footer", "strip");
  stageWrap.append(glCanvas, inkCanvas, overlay);
  shell.append(bar, stageWrap, rail, strip);
  /**
   * The shared suite nav (ADR-0032), in its own host BEFORE `<main>`.
   *
   * **It used to be mounted into `shell` with a comment claiming that put it "before the stage in
   * the document order a screen reader walks". It did the opposite.** `mountNavHeader` ends with
   * `container.appendChild(nav)`, so the nav was the LAST child of the shell — after the bar, the
   * stage, the rail and the strip — while `.cas-nav` is `position: fixed` and draws at the top. It
   * looked first and read last, which is the visual-versus-DOM order mismatch that matters most to
   * the reader who cannot see the first part. Its own host, prepended, is also what lets the shell
   * be a `<main>` at all: a landmark containing the site navigation is not what `<main>` means.
   */
  const navHost = el("div", "navHost");
  root.replaceChildren(navHost, shell);
  mountNavHeader(navHost, { current: "contour-integration" });

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
  const fLabel = el("span", "flabel", "f(z) =");
  sandboxGroup.append(fLabel, input, presetWrap);

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

  /**
   * Copy the permalink — the one place a reader ASKS for a link, and therefore the one place the
   * codec's refusal has to be visible.
   *
   * `navigator.clipboard.writeText` synchronously inside the click, which is the suite's form (the
   * plotter's, CD's, QD's): a clipboard write outside the user gesture is refused by the browser.
   * Older engines have no async clipboard at all, so there is a `document.execCommand` fallback, and
   * if even that fails the button says so rather than pretending.
   */
  /**
   * **CONTRASTS IS NOT A MODE.** M7.1's ladder is five `ShellState`s, three of them gallery records
   * and one a sandbox state, so a third `mode` would have to represent "showing the grid" as a
   * property of a state that is already in one of the two modes — and every mode check in the file,
   * the codec included, would grow a case that means "none of the above". It is a panel over the
   * app instead, and opening a cell is `applyState(cell.state())`: the grid hands the reader a
   * state and gets out of the way, which is also why every cell is already a permalink.
   */
  const contrastButton = el("button", "preset contrastOpen", "Contrasts");
  contrastButton.type = "button";
  contrastButton.setAttribute("aria-label", "compare five arguments that differ one step at a time");
  contrastButton.setAttribute("aria-expanded", "false");

  const shareButton = el("button", "preset shareLink", "Copy link");
  shareButton.type = "button";
  shareButton.setAttribute("aria-label", "copy a permalink to this state");
  const shareNote = el("span", "muted small shareNote");
  shareNote.setAttribute("role", "status");
  let shareTimer = 0;
  const saySoon = (text: string): void => {
    shareNote.textContent = text;
    window.clearTimeout(shareTimer);
    shareTimer = window.setTimeout(() => {
      shareNote.textContent = "";
    }, 6000);
  };
  shareButton.addEventListener("click", () => {
    const enc = encodeShell(currentState());
    if (!enc.ok) {
      // The state cannot be linked to, and the reason is the interesting part — today that is the
      // pen tool's contour, which has no recipe. Saying "copied" and handing over a link to
      // something else would be the worst of the three outcomes.
      saySoon(`No link: ${enc.reason}`);
      return;
    }
    window.history.replaceState(null, "", enc.hash);
    const url = window.location.href;
    void navigator.clipboard?.writeText(url).then(
      () => { saySoon("Link copied"); },
      () => { saySoon(legacyCopy(url) ? "Link copied" : "Could not copy — the link is in the address bar"); },
    );
    if (navigator.clipboard === undefined) {
      saySoon(legacyCopy(url) ? "Link copied" : "Could not copy — the link is in the address bar");
    }
  });

  /** Download the plate. */
  const saveButton = el("button", "preset", "Save figure");
  saveButton.type = "button";
  saveButton.setAttribute("aria-label", "download this figure as a PNG carrying its own permalink");
  saveButton.addEventListener("click", () => {
    void figureBytes()
      .then((bytes) => {
        if (bytes === null) {
          saySoon("Could not render the figure");
          return;
        }
        const buf = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(buf).set(bytes);
        const href = URL.createObjectURL(new Blob([buf], { type: "image/png" }));
        const a = document.createElement("a");
        a.href = href;
        a.download = mode === "gallery" && family !== null ? `${family.id}.png` : "contour-integration.png";
        document.body.append(a);
        a.click();
        a.remove();
        window.setTimeout(() => {
          URL.revokeObjectURL(href);
        }, 1000);
        saySoon("Figure saved");
      })
      .catch(() => {
        saySoon("Could not render the figure");
      });
  });

  /**
   * Copy the plate to the clipboard.
   *
   * The PROMISE goes into `ClipboardItem`, not the resolved blob — Safari requires the write to be
   * issued inside the user gesture, and awaiting the render first would put it outside. The
   * plotter's form, and the reason it is written this way there too.
   */
  const copyImageButton = el("button", "preset", "Copy figure");
  copyImageButton.type = "button";
  copyImageButton.setAttribute("aria-label", "copy this figure to the clipboard");
  copyImageButton.addEventListener("click", () => {
    if (typeof ClipboardItem === "undefined" || typeof navigator.clipboard?.write !== "function") {
      saySoon("This browser cannot copy images — use Save figure");
      return;
    }
    const png = figureBytes().then((bytes) => {
      if (bytes === null) throw new Error("the figure could not be rendered");
      const buf = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(buf).set(bytes);
      return new Blob([buf], { type: "image/png" });
    });
    void navigator.clipboard.write([new ClipboardItem({ "image/png": png })]).then(
      () => {
        saySoon("Figure copied");
      },
      () => {
        saySoon("Could not copy the figure — use Save figure");
      },
    );
  });

  bar.append(
    // An `<h1>`, which is the other axe finding: seven card headings started at level 2 with no
    // level 1 above them. The CSS keeps it the size it always was — this is a document-structure
    // change, not a visual one.
    el("h1", "brand", "Contour Integration"),
    sourceWrap,
    sandboxGroup,
    galleryGroup,
    contrastButton,
    shareButton,
    saveButton,
    copyImageButton,
    shareNote,
  );

  // ──────────────────────────────────────────────────────────────────────────────────────────
  // The contrast grid (M7.1).
  //
  // Built ONCE, on first open, because every cell runs a full solve and four of the five are gallery
  // records: doing that at mount would put five solves in front of the first frame for a panel most
  // readers never open. It is not rebuilt afterwards either — the ladder is a constant, and nothing
  // the reader does to the app can change what those five states resolve to.
  // ──────────────────────────────────────────────────────────────────────────────────────────
  const contrastPanel = el("section", "contrastPanel");
  contrastPanel.hidden = true;
  contrastPanel.setAttribute("aria-label", "contrasting arguments");
  const contrastClose = el("button", "preset contrastClose", "Close");
  contrastClose.type = "button";
  let contrastBuilt = false;
  let contrastReturnFocus: HTMLElement | null = null;

  /** A status glyph with a real text alternative — the glyph alone names nothing. */
  function statusCell(status: string, claim: string): HTMLElement {
    const td = el("td", `st ${status}`);
    const glyph = el("span", "glyph", status === "satisfied" ? "✓" : status === "failed" ? "✗" : "?");
    glyph.setAttribute("aria-hidden", "true");
    td.append(glyph, el("span", "srOnly", status));
    td.title = claim;
    return td;
  }

  function buildContrastPanel(): void {
    const table = contrastTable();
    const head = el("tr");
    // NOT empty: axe's `empty-table-header` fires on a bare corner cell, and it is also the one
    // place to say what the row headings are. Found by running axe against the OPEN panel — the
    // a11y roster audits pages in their default state, so a panel nothing opens is never audited.
    head.append(el("th", "rowHead", "ledger row"));
    for (const cell of table.cells) {
      const th = el("th", "colHead");
      th.scope = "col";
      th.append(el("div", "cellLabel", cell.label), el("div", "muted small", cell.note));
      // The step's own sentence — what this column changes about the one before it.
      if (cell.because !== null) th.append(el("div", "because small", `↑ ${cell.because}`));
      // **THE ANSWER, NOT `∮`.** C1's `∮` is exactly 0 while the integral it determines is π/2.
      const answer = el("div", "cellAnswer");
      answer.textContent = cell.answer ?? (cell.closes ? "—" : `⚠ does not close (${cell.failedAt ?? "?"})`);
      th.append(answer);
      const open = el("button", "preset", "Open");
      open.type = "button";
      open.setAttribute("aria-label", `open ${cell.label} in the app`);
      open.addEventListener("click", () => {
        const found = CONTRAST_CELLS.find((c) => c.id === cell.id);
        if (found === undefined) return;
        closeContrast();
        applyState(found.state());
        frameContour();
      });
      th.append(open);
      head.append(th);
    }

    const body = el("tbody");
    for (const row of table.rows) {
      const tr = el("tr");
      const th = el("th", "rowHead");
      th.scope = "row";
      th.textContent = row.label;
      tr.append(th);
      row.cells.forEach((entry, i) => {
        if (entry === null) {
          const td = el("td", "st absent");
          td.append(el("span", "glyph", "—"));
          td.title = "this argument has no such row";
          tr.append(td);
          return;
        }
        const td = statusCell(entry.status, entry.claim);
        // The declared contrast, and only it. An incidental rewording is marked apart, because a
        // grid that highlights a row saying the same thing in other words stops meaning anything.
        if (row.highlight.includes(i)) td.classList.add("changed");
        else if (row.muted.includes(i)) td.classList.add("reworded");
        tr.append(td);
      });
      body.append(tr);
    }

    const t = el("table", "contrastTable");
    const thead = el("thead");
    thead.append(head);
    t.append(thead, body);

    const bar2 = el("div", "contrastBar");
    bar2.append(el("h2", undefined, "One step at a time"), contrastClose);
    const legend = el("p", "muted small");
    legend.textContent =
      "Each column differs from the one on its left in the highlighted row, and in nothing else. " +
      "A dotted cell is the same claim about a differently-named piece.";
    contrastPanel.replaceChildren(bar2, legend, t);
    contrastBuilt = true;
  }

  function openContrast(): void {
    if (!contrastBuilt) buildContrastPanel();
    contrastReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    contrastPanel.hidden = false;
    contrastButton.setAttribute("aria-expanded", "true");
    contrastClose.focus();
  }

  function closeContrast(): void {
    if (contrastPanel.hidden) return;
    contrastPanel.hidden = true;
    contrastButton.setAttribute("aria-expanded", "false");
    // Focus goes back where it came from, or the reader is dropped at the top of the document.
    (contrastReturnFocus ?? contrastButton).focus();
    contrastReturnFocus = null;
  }

  contrastButton.addEventListener("click", () => {
    if (contrastPanel.hidden) openContrast();
    else closeContrast();
  });
  contrastClose.addEventListener("click", closeContrast);
  // Appended HERE rather than in the `shell.append` above, because `contrastPanel` is declared
  // below that line and a `const` used before its declaration is a runtime error, not a hoist.
  shell.append(contrastPanel);
  contrastPanel.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      ev.stopPropagation();
      closeContrast();
    }
  });

  // Rail cards.
  const errorBox = el("div", "error");
  errorBox.hidden = true;
  /**
   * Why a shared link could not be opened — its OWN box, not the parse-error one.
   *
   * `errorBox` is cleared by the next successful `applyExpression`, and a link refusal wiped a
   * moment after it appears is the same as no refusal at all. This one survives until the reader's
   * first action (see `syncHash`), which is the moment the message stops being about their session.
   */
  const linkBox = el("div", "error linkError");
  linkBox.hidden = true;
  linkBox.setAttribute("role", "status");
  const recordCard = el("section", "card");
  const ledgerCard = el("section", "card");
  const derivationCard = el("section", "card");
  const resultCard = el("section", "card");
  const contourCard = el("section", "card");
  const branchCard = el("section", "card");
  const poleCard = el("section", "card");
  rail.append(
    linkBox,
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
  for (const contrastMode of ["none", "sumZ", "sumFz", "sumDz"] as ContrastMode[]) {
    const b = el("button", "preset", CONTRAST_LABELS[contrastMode]);
    b.type = "button";
    b.dataset.mode = contrastMode;
    b.addEventListener("click", () => {
      contrast = contrastMode;
      for (const other of contrastWrap.querySelectorAll("button")) {
        other.classList.toggle("on", other.dataset.mode === contrastMode);
      }
      drawAcc();
    });
    if (contrastMode === "none") b.classList.add("on");
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
      stage?.render(view, vp, { iso: isoOn() ? 1 : 0 });
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
        drawPen(ctx, vp);
      }
      drawPoleMarkers();
    });
  };

  // ──────────────────────────────────────────────────────────────────────────────────────────
  // The pen's snapping, and the preview it draws.
  //
  // Research 07 rule 5: **snap with intent, never silently.** Every snap returns the name of the
  // constraint that fired, the badge shows it, and holding a modifier suppresses the lot — because a
  // reader who cannot place a vertex where they meant to has lost the tool, and one who does not
  // know a vertex moved has lost the argument. The targets are the ones this app's ledger cares
  // about: a POLE (a vertex there makes LEGALITY refuse, so it must be deliberate), the axes (a
  // contour along ℝ is most of the gallery), and the path's own vertices (which is how it closes).
  // ──────────────────────────────────────────────────────────────────────────────────────────

  /** What a snap moved the pointer to, and what to call it. */
  function penSnapTo(at: Cx, free: boolean): { readonly at: Cx; readonly why: string | null } {
    if (free) return { at, why: null };
    const tol = grabTolerance();
    // The path's own FIRST vertex wins over everything, because landing on it is how a path closes
    // and a pole sitting near it must not steal the gesture that finishes the contour.
    const first = penNodes?.[0];
    if (first !== undefined && Math.hypot(at[0] - first.at[0], at[1] - first.at[1]) <= tol) {
      return { at: [first.at[0], first.at[1]], why: "the first vertex — click to close" };
    }
    for (const node of (penNodes ?? []).slice(1)) {
      if (Math.hypot(at[0] - node.at[0], at[1] - node.at[1]) <= tol) {
        return { at: [node.at[0], node.at[1]], why: "a vertex already placed" };
      }
    }
    for (const pole of poles?.poles ?? []) {
      if (Math.hypot(at[0] - pole.at[0], at[1] - pole.at[1]) <= tol) {
        // Snapping ONTO a pole is allowed and named, not prevented: LEGALITY refuses a contour
        // through a singularity, and a reader who wants to see that refusal has to be able to aim.
        return { at: [pole.at[0], pole.at[1]], why: "a pole — the contour may not pass through it" };
      }
    }
    if (Math.abs(at[1]) <= tol && Math.abs(at[0]) <= tol) return { at: [0, 0], why: "the origin" };
    if (Math.abs(at[1]) <= tol) return { at: [at[0], 0], why: "the real axis" };
    if (Math.abs(at[0]) <= tol) return { at: [0, at[1]], why: "the imaginary axis" };
    return { at, why: null };
  }

  /** The path as it stands plus the pending piece, so the preview is the same geometry as the result. */
  function penPreview(): Contour | null {
    if (penNodes === null || penNodes.length === 0) return null;
    const pending = penAt === null ? [] : [{ at: [penAt[0], penAt[1]] as const }];
    const nodes = [...penNodes, ...pending];
    return nodes.length < 2 ? null : penContour({ nodes, closed: false });
  }

  function drawPen(ctx: CanvasRenderingContext2D, vp: Viewport): void {
    if (penNodes === null) return;
    // The pending path, dashed so it reads as not-yet-a-contour: the ledger says nothing about it,
    // and drawing it like a finished piece would claim otherwise.
    const preview = penPreview();
    if (preview !== null) {
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = "#7aa2f7";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      for (const g of resolveAll(preview)) {
        const steps = g.kind === "segment" ? 1 : 48;
        for (let i = 0; i <= steps; i++) {
          const [wx, wy] = pointAt(g, i / steps);
          const [x, y] = plotToScreen(wx, wy, view, vp);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      ctx.restore();
    }
    // The vertices: a ring each, the first one larger because it is the target that closes the path.
    penNodes.forEach((node, i) => {
      const [x, y] = plotToScreen(node.at[0], node.at[1], view, vp);
      const r = i === 0 ? 6.5 : 4.5;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(8, 10, 14, 0.9)";
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.strokeStyle = "#7aa2f7";
      ctx.lineWidth = i === 0 ? 2.4 : 1.6;
      ctx.stroke();
    });
  }

  // ──────────────────────────────────────────────────────────────────────────────────────────
  // The pen's grammar (research 07 rule 6): click = corner, drag = arc, click-the-start = close,
  // Backspace = drop the last, Esc = abort.
  //
  // **UNDO IS OBJECT-LEVEL** (rule 10): one gesture is one entry, so Backspace removes a VERTEX and
  // not a pointer sample, and the URL is written when the path finishes rather than on every move —
  // there is no `#vs=` form for a half-drawn path and `syncHash` is never called from here.
  // ──────────────────────────────────────────────────────────────────────────────────────────

  function penStart(): void {
    penNodes = [];
    penAt = null;
    penSnap = null;
    penDrag = null;
    renderContourCard();
    requestDraw();
  }

  /** Leave the pen, keeping whatever contour is on screen. */
  function penStop(): void {
    penNodes = null;
    penAt = null;
    penSnap = null;
    penDrag = null;
    renderContourCard();
    requestDraw();
  }

  /**
   * Adopt the drawn path as the contour.
   *
   * `contourSource` goes NULL, which is the truth about a drawn contour rather than a gap: it has no
   * recipe, and `viewState.ts` reads its vertices back out of the geometry when a link is minted.
   */
  function penCommit(closed: boolean): void {
    if (penNodes === null || penNodes.length < 2) return;
    const drawn = penContour({ nodes: penNodes, closed });
    contour = drawn;
    sandboxContour = drawn;
    contourSource = null;
    penStop();
    recompute();
  }

  /** A click: place a vertex, or close the path if it landed on the first one. */
  function penClick(at: Cx, free: boolean): void {
    if (penNodes === null) return;
    const snapped = penSnapTo(at, free);
    const first = penNodes[0];
    const closing =
      first !== undefined &&
      penNodes.length >= 3 &&
      Math.hypot(snapped.at[0] - first.at[0], snapped.at[1] - first.at[1]) <= grabTolerance();
    if (closing) {
      penCommit(true);
      return;
    }
    penNodes = [...penNodes, { at: [snapped.at[0], snapped.at[1]] as const }];
    // **THE DRAG BOWS THE PIECE THAT ENDS AT THIS VERTEX, not the one leaving it**, and the first
    // draft had it the other way round — which made the chord `(node → penAt)` with `penAt` still
    // sitting on the click, so the chord was zero and `penBow` returned without doing anything. A
    // browser pass found it, because the only script that had exercised the gesture never held the
    // button down. Bowing the INCOMING piece is also the gesture the reader expects: press the new
    // corner, pull the curve towards you, release.
    penDrag =
      penNodes.length >= 2 ? { from: penNodes[penNodes.length - 2].at, index: penNodes.length - 2 } : null;
    penSnap = snapped.why;
    // The card carries the vertex count and gates `Close` on it, so it is stale until re-rendered.
    // Found by the test: three assertions failed and all three were this one omission.
    renderContourCard();
    requestDraw();
  }

  /**
   * A drag after a click bows the piece that click STARTED — so the bulge is the pointer's own
   * offset from the chord, which is the quantity `arcThroughBulge` takes.
   *
   * The piece being bowed is the one LEAVING the vertex just placed, and it only exists once there
   * is a next vertex — so while drawing, the drag bows the PENDING piece, whose far end is the
   * pointer. That makes the gesture self-consistent: drag away from the straight line and the
   * preview bows away with you.
   */
  function penBow(at: Cx): void {
    if (penNodes === null || penDrag === null) return;
    const i = penDrag.index;
    const from = penNodes[i];
    const to = penNodes[i + 1];
    if (from === undefined || to === undefined) return;
    // Both ends are PLACED, so the chord is fixed and only the pointer's offset from it varies.
    // Through `bulgeFromApex`, which is also how `penPath` reads a bulge back off a finished arc —
    // one formula, so the gesture and its inverse cannot disagree about what a bulge means.
    const bulge = bulgeFromApex(from.at, to.at, at);
    if (bulge === 0) return;
    const next = [...penNodes];
    next[i] = { at: from.at, bulge };
    penNodes = next;
    requestDraw();
  }

  /** Backspace: one gesture, one entry. */
  function penBack(): void {
    if (penNodes === null || penNodes.length === 0) return;
    penNodes = penNodes.slice(0, -1);
    penDrag = null;
    penSnap = null;
    renderContourCard();
    requestDraw();
  }

  /**
   * Each cut as a finite polyline, with its rays clipped beyond everything on screen.
   *
   * The clipping radius comes from the VIEW rather than from the contour, because this one is for
   * drawing: a ray has to leave the visible plane, and the ledger's own clipping (which is about the
   * geometry, not the picture) is computed separately from the contour's extent.
   */
  function cutPolylines(): { points: readonly Cx[]; refused: boolean; label?: string }[] {
    // THE RECORD'S OWN CUT, under a record. D1's `argRange` decides where the cut runs and the whole
    // record is about what happens when it runs somewhere else, so a figure without it is missing
    // the thing it is teaching. In the sandbox the cut is the user's.
    const drawn = effective();
    if (drawn.cuts.length === 0) return [];
    const vp = viewport();
    const reach =
      4 *
      (Math.hypot(view.center[0], view.center[1]) +
        view.halfHeight * (1 + Math.max(1, vp.width) / Math.max(1, vp.height)));
    // ONE reading of legality for the picture and the rail: the ledger's LEGALITY row and this
    // colour must never disagree about whether a cut system is admissible.
    const refused = !checkAdmissibility(drawn).ok;
    // The jump weight, from the same `jumpWeights` the correction sums over — so the number on the
    // arc is the number the picture is corrected by, not a second computation of it. `null` is a
    // log's side: infinite-order monodromy has no finite jump, and the label says so rather than
    // printing a number for it.
    const weights = jumpWeights(drawn);
    const out: { points: readonly Cx[]; refused: boolean; label?: string }[] = [];
    for (const cut of drawn.cuts) {
      const poly = cutPolyline(drawn, cut, reach);
      if (poly === null) continue;
      const jump = weights.get(cut.id);
      const label =
        jump === undefined ? undefined : jump === null ? "J = ∞" : `J = ${formatFrac(jump)}`;
      out.push({ points: poly, refused, ...(label === undefined ? {} : { label }) });
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
    // **A browser pass is why this line is here.** Opening a record refits the camera AFTER the
    // recompute that wrote the URL, so the ADDRESS BAR kept the previous view — measured at
    // `halfHeight 1.2` in the bar against 4.8 on screen. The copy button was unaffected, because it
    // writes its own hash first, which is exactly what made the defect hard to see: the shared link
    // was right and the URL a reader could select and paste was one step behind. `screen()` cannot
    // see a camera, so no jsdom test could catch it either until one read the hash.
    syncHash();
  }

  /**
   * **THE SANDBOX'S DECLARED FACTORISATION** — M5.1c, and the reason the integrand box changes
   * meaning.
   *
   * Null until the reader declares one, and then the box holds only `R(z)` while this holds the
   * rest. It is an explicit step rather than a consequence of having branch points, because the
   * keyhole and dogbone TEMPLATES already seed a cut system (M4.6): inferring a factorisation from
   * "there are branch points" would silently reinterpret whatever was typed the moment a template
   * was picked.
   *
   * The exponent is NOT stored here. It lives on the branch point itself, where the existing picker
   * already edits it, so there is one place a reader changes `α` and no way for two copies to
   * disagree about it.
   */
  let declaration: {
    readonly pointId: string;
    readonly window: readonly [Frac, Frac];
    readonly sign: 1 | -1;
    readonly constant: Cx;
    /** `m` in `log^m`. Ignored for a power factor; kept so toggling the order does not lose it. */
    readonly logPower: number;
  } | null = null;

  /**
   * What the box held at the moment the factor was declared — the split check's reference.
   *
   * Without it the declaration would be unfalsifiable: the app cannot verify a reader's INTENT, but
   * it can verify that `declared · R(z)` is the expression they had a moment ago, and refuse to
   * pretend otherwise. See `engine/splitCheck.ts`.
   */
  /**
   * Held as SOURCE and re-parsed where it is used, rather than kept as a second `Node` beside it.
   * Two copies of one expression is exactly the shape M5.1's review found a bug in, and undeclaring
   * needs the source anyway to put back what the reader actually typed.
   */
  let beforeDeclarationSrc: string | null = null;
  let splitCheck: SplitCheck | null = null;
  /** What the stage's program was last built FROM — a value key, never an object identity. */
  let stageKey: string | null = null;
  /** Why the declared run refused, when it did — shown in place of an answer, never beside one. */
  let declaredRefusal: string | null = null;

  /**
   * The declared order, read off the branch point the factor sits on.
   *
   * Through `shell/state.ts`, so the order the RENDER shows and the order the RESOLVER computes
   * from are one function of one state rather than two readings that agree by inspection.
   */
  const declaredOrder = (): DeclaredOrder | null => orderOfState(currentState());

  function clearComputed(): void {
    recordBranch = null;
    // The stage keeps whatever program it last built — this function clears the COMPUTED state, not
    // the picture — so the flag has to go to null even though `adopt` and `applyExpression` move the
    // two together. Here the card is about to describe a record whose program was never built, and
    // null is what makes it say "declared but not on the stage", which is then true.
    declaredOnStage = null;
    stageKey = null;
    integral = null;
    theorem = null;
    ledger = null;
    derivation = null;
    acc = null;
    solved = null;
    declaredRefusal = null;
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
      out.push({ label: "relation", text: relationText(family) });
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
    poles = run.poles;
    contour = run.contour;
    resolved = run.resolved;
    integral = run.integral;
    theorem = run.theorem;
    ledger = run.ledger;
    recordBranch = run.branch ?? null;
    // A partial sum through a singularity is meaningless rather than merely rough, so this is null
    // whenever the integral refused — showing one beside a refusal hands back the withheld number.
    // `run.sides` rather than a re-read of the spec: the panel draws the same sum the quadrature
    // integrated, so both come from the one array `analyse` used (see `Analysis.sides`).
    acc = accumulateForIntegral(run.f, run.resolved, run.integral, undefined, run.sides);
    // **THE PICTURE IN THE DECLARED DETERMINATION.** With a branch factor the stage is handed the
    // record's declaration and the rational cofactor SEPARATELY, so the branch half is built from
    // what the record says and not from the compiled AST's principal branch — see
    // `kernel/branch/declared.ts`. Without one (tiers A–C) this is the same call it always was.
    declaredOnStage = run.declared?.product ?? null;
    // The gallery builds its own program here, so the SANDBOX's key must not survive the trip: with
    // it left in place, switching back to a sandbox whose declaration had not changed would skip the
    // rebuild and leave the record's picture under the sandbox's numbers.
    stageKey = null;
    if (run.declared === undefined) stage?.setIntegrand(run.ast);
    else stage?.setIntegrand(run.declared.cofactor, run.declared.product);
  }

  // ── the permalink ─────────────────────────────────────────────────────────────────────────
  //
  // Boot-time read plus `history.replaceState` on settle, which is the house idiom across the suite
  // — nothing in the repo re-hydrates from a live `hashchange`, and the app where a dropped field
  // changes the ANSWER is not where that should start.

  /** False until the boot-time link has been read, so the app's own first renders cannot clobber it. */
  let hashReady = false;

  /**
   * Put the current state in the address bar.
   *
   * `replaceState`, never `pushState`: a contour drag would otherwise leave a hundred history
   * entries between the reader and the page they came from. A state that cannot be encoded leaves
   * the URL ALONE rather than half-writing one.
   */
  function writeHash(): void {
    if (!hashReady) return;
    // The reader has acted, so a message about the link they arrived on is no longer about them.
    linkBox.hidden = true;
    const enc = encodeShell(currentState());
    if (!enc.ok) return;
    if (enc.hash !== window.location.hash) {
      window.history.replaceState(null, "", enc.hash);
    }
  }

  let hashTimer = 0;
  /**
   * The state has changed; the URL should catch up shortly.
   *
   * **COALESCED, and a real browser is why.** A wheel zoom has no gesture and no end event, so a
   * fast spin is dozens of discrete settled changes in a second — and `replaceState` is rate-limited
   * by the browser (Safari drops calls past roughly a hundred in thirty seconds), so writing per
   * event would silently stop writing. One timer means every caller can simply say "this changed"
   * and the URL lands once, shortly after things stop moving.
   */
  function syncHash(): void {
    if (!hashReady) return;
    window.clearTimeout(hashTimer);
    hashTimer = window.setTimeout(writeHash, 250);
  }

  // ── the exported figure ───────────────────────────────────────────────────────────────────

  /** What the plate is a figure OF — the record's own headline, or the typed integrand. */
  function figureTitle(): string {
    if (mode === "gallery" && family !== null) return `${family.id} — ${contourIntegrandText(family)}`;
    return `∮ ${input.value.trim()} dz over ${contour.pieces.map((q) => q.name).join(", ")}`;
  }

  const captionNow = (): FigureCaption =>
    figureCaption({ title: figureTitle(), integral, theorem, ledger, solved });

  /**
   * Composite the plate and hand back its PNG bytes, metadata and all.
   *
   * **THE GL LAYER IS RE-RENDERED HERE, SYNCHRONOUSLY, and that is not belt-and-braces.** `GLStage`
   * creates its context without `preserveDrawingBuffer`, so the drawing buffer is gone once the
   * browser has composited the frame: probing the live page, `canvas.gl` reads back a single
   * distinct colour where the ink layer reads 44. Without this line the exported figure would be
   * missing the phase portrait — the whole backdrop — and would look merely plain rather than wrong.
   */
  async function figureBytes(scale = 2): Promise<Uint8Array | null> {
    // **EVERYTHING THE PLATE CLAIMS IS CAPTURED BEFORE THE FIRST `await`, and a review of this
    // function is why.** `toBlob` yields to the event loop, so a draft that called `captionNow()`
    // once for the drawing and again for the metadata could have a pending recompute land between
    // them — a figure whose drawn caption said one thing and whose stamped verdict said another,
    // which is precisely the dishonesty the verdict key exists to prevent. Same for the permalink:
    // a link encoded after the yield could describe a state the picture is not of.
    const vp = viewport();
    stage?.render(view, vp, { iso: isoOn() ? 1 : 0 });
    const caption = captionNow();
    const enc = encodeShell(currentState());
    const permalink = enc.ok ? window.location.origin + window.location.pathname + enc.hash : null;
    const layout = figureLayout(
      { w: glCanvas.width, h: glCanvas.height },
      { w: accCanvas.width, h: accCanvas.height },
      scale,
    );
    const style = getComputedStyle(shell);
    const plate = document.createElement("canvas");
    drawFigure(plate, layout, [glCanvas, inkCanvas], accCanvas, caption, {
      background: style.getPropertyValue("--c-bg").trim() || "#0f1115",
      text: style.getPropertyValue("--c-text").trim() || "#e7e9ee",
      muted: style.getPropertyValue("--c-muted").trim() || "#99a1b3",
    });
    const blob = await new Promise<Blob | null>((done) => {
      plate.toBlob(done, "image/png");
    });
    if (blob === null) return null;
    return injectPngText(new Uint8Array(await blob.arrayBuffer()), figureMetadata(permalink, caption));
  }

  /**
   * Move the contour, and keep its RECIPE in step.
   *
   * One function because the shift is provenance: two call sites accumulating it by hand would be two
   * chances for the recipe and the geometry to disagree, and a permalink minted from a stale recipe
   * reopens a contour somewhere else. `from` is the contour the translation is measured against —
   * the gesture's anchor for a pointer drag, the live contour for a keyboard nudge — and `fromShift`
   * the recipe's shift at that same moment, so the two always describe the same starting point.
   */
  function moveContour(from: Contour, fromShift: Cx, d: Cx): void {
    contour = translateContour(from, d);
    if (contourSource !== null) {
      contourSource = { ...contourSource, shift: [fromShift[0] + d[0], fromShift[1] + d[1]] };
    }
  }

  /** The work ceiling for this pass: draft while a contour is being dragged, full otherwise. */
  const budgetNow = (): { readonly maxEvaluations: number } | undefined =>
    gesture === "contour" ? { maxEvaluations: DRAFT_EVALUATIONS } : undefined;

  // ── the shell's state, projected out and put back ─────────────────────────────────────────
  //
  // The closure keeps owning the locals; these two are the projection onto {@link ShellState} and
  // the restoration from it. Everything M6 needs downstream rides here — a `#vs=` permalink is this
  // object encoded, and a PNG carries the same bytes — so the one property worth pinning is that
  // `applyState(currentState())` changes nothing, for every record and for a hand-built sandbox
  // state. A field dropped from either half breaks exactly that, and nothing else would notice: the
  // app would draw the same picture while computing a different integral, which is M5.1's shadowed
  // `branch` bug in a new place.

  /** The app's state, as plain data. */
  function currentState(): ShellState {
    const fam = family;
    const g = golden;
    const open = fam !== null && g !== null;
    return {
      mode,
      // The box, verbatim — under a declaration this is the COFACTOR `R(z)` and not the integrand.
      expr: input.value,
      declaration,
      beforeDeclaration: beforeDeclarationSrc,
      branch,
      contour,
      contourSource,
      // Kept in either mode: which record the picker is on outlives a trip to the sandbox, as it
      // does on screen.
      record: open ? fam.id : null,
      fixture: open ? Math.max(0, fam.golden.indexOf(g)) : 0,
      bindings: bindingOverrides,
      geometry: geometryOverrides,
      view,
      contrast,
      scrub,
      iso: isoPref,
      sandboxContour,
    };
  }

  /**
   * Take a state as the app's own, and rebuild from it.
   *
   * Deliberately NOT routed through `setMode`/`loadRecord`/`selectFixture`: those carry a gesture's
   * side effects — `frameContour()`, dropped overrides — and a restored state brings its own view
   * and its own overrides. The DOM controls are synced here instead, because a state that decides
   * the numbers while the bar still shows the old mode is the same class of defect as a cut drawn
   * where the answer is not.
   */
  function applyState(next: ShellState): void {
    mode = next.mode;
    for (const b of sourceWrap.querySelectorAll("button")) {
      b.setAttribute("aria-pressed", String(b.dataset.mode === mode));
      b.classList.toggle("on", b.dataset.mode === mode);
    }
    sandboxGroup.hidden = mode !== "sandbox";
    galleryGroup.hidden = mode !== "gallery";

    branch = next.branch;
    declaration = next.declaration;
    beforeDeclarationSrc = next.beforeDeclaration;
    contour = next.contour;
    contourSource = next.contourSource;
    sandboxContour = next.sandboxContour ?? next.contour;
    view = next.view;
    contrast = next.contrast;
    scrub = next.scrub;
    isoPref = next.iso;
    scrubber.value = String(Math.round(scrub * 1000));
    for (const b of contrastWrap.querySelectorAll("button")) {
      b.classList.toggle("on", b.dataset.mode === contrast);
    }

    const found = recordOf(next);
    family = found?.family ?? null;
    golden = found?.golden ?? null;
    bindingOverrides = { ...next.bindings };
    geometryOverrides = { ...next.geometry };
    // A state with no record puts the picker back to its first option rather than leaving a stale
    // selection standing — which is also what it shows at boot, so `record: null` means one thing.
    recordSelect.value = family?.id ?? offered.tiers[0]?.families[0]?.id ?? "";
    renderFixtureOptions();

    // The box, and the label that says what is in it. Both, or the app claims a cofactor is an
    // integrand — the defect the "undeclare" button exists to prevent.
    input.value = next.expr;
    const declared = declaration !== null;
    fLabel.textContent = declared ? "R(z) =" : "f(z) =";
    input.setAttribute("aria-label", declared ? "rational cofactor R(z)" : "integrand f(z)");
    compiled = compile(input.value);
    if (compiled.ok) {
      poles = compiled.poles;
      errorBox.hidden = true;
    } else {
      poles = null;
      errorBox.hidden = false;
      errorBox.textContent = compiled.error;
    }
    // A restored state has no relationship to whatever program the previous one left linked, so the
    // stage is rebuilt rather than kept: `recompute` builds the declared one, and this builds the
    // plain one, exactly as `applyExpression` does.
    declaredOnStage = null;
    stageKey = null;
    if (compiled.ok && !declared && mode === "sandbox") stage?.setIntegrand(compiled.ast);

    recompute();

    // Frozen AFTER the run, from the contour on screen — the same rule `selectFixture` follows, and
    // for the same reason: the track has to mean what the value beside it means.
    frozenRanges = {};
    if (mode === "gallery") {
      for (const param of Object.values(contour.params)) {
        frozenRanges[param.name] = { range: param.range, scale: param.scale };
      }
    }
  }

  /**
   * Everything the resolver produced, taken as the app's state.
   *
   * The shell decides NOTHING here — which branch ran, and what each one produced, is
   * `resolveState`'s call. This is the assignment half, and it is the only half that touches the
   * DOM, the stage or the accumulator.
   */
  function applyResolution(res: StateResolution): void {
    switch (res.kind) {
      case "gallery": {
        family = res.family;
        golden = res.golden;
        recordNote = res.note;
        systemTargets = res.targets;
        if (res.run !== null) {
          adopt(res.run);
          solved = res.solved;
          errorBox.hidden = true;
        } else {
          clearComputed();
          errorBox.hidden = false;
          errorBox.textContent = res.fatal ?? "";
        }
        return;
      }
      case "declared": {
        declaredRefusal = null;
        resolved = res.analysis.resolved;
        integral = res.analysis.integral;
        theorem = res.analysis.theorem;
        ledger = res.analysis.ledger;
        acc = accumulateForIntegral(res.f, resolved, integral, undefined, res.analysis.sides);
        solved = null;
        splitCheck = res.split;
        // The picture becomes the DECLARED determination, as it already is under a record — so the
        // sandbox's colour seam and its declared cut stop being different objects.
        //
        // Keyed BY VALUE, and a review found out why: `runDeclared` builds `declared` fresh on every
        // call, so an identity test never fires and the GLSL was being recompiled and relinked on
        // every recompute — every frame of a contour drag included, which is exactly when the app
        // can least afford it. The key covers the cofactor's source too, since that goes into the
        // program as well.
        const key = `${declaredKey(res.declared)}::${input.value}`;
        if (stageKey !== key) {
          stageKey = key;
          declaredOnStage = res.declared;
          stage?.setIntegrand(res.cofactor, res.declared);
        }
        return;
      }
      case "declared-refused":
        clearComputed();
        declaredRefusal = res.reason;
        splitCheck = null;
        return;
      case "plain":
        resolved = res.analysis.resolved;
        integral = res.analysis.integral;
        theorem = res.analysis.theorem;
        ledger = res.analysis.ledger;
        acc = accumulateForIntegral(res.f, resolved, integral, undefined, res.analysis.sides);
        solved = null;
        return;
      case "empty":
        clearComputed();
        if (mode === "gallery") {
          recordNote = null;
          systemTargets = null;
        }
        return;
    }
  }

  /**
   * Rebuild everything the current state implies, and redraw.
   *
   * **The three compute branches are not here.** They live in `shell/state.ts` as one pure function
   * of {@link ShellState}, which is what makes them reachable from a test at all — and what makes
   * the fixed-point claim about `applyState(currentState())` a claim about the app rather than about
   * a second implementation of it. M3.5a moved the gallery and the sandbox onto one `analyse` for
   * the same reason, one level down.
   */
  function recompute(): void {
    // Set BEFORE the resolve, as it always was: the gallery's resolution carries its own `resolved`
    // through `adopt`, the plain and declared branches overwrite this with the analysis's copy, and
    // a refusal leaves it — so a contour that produced no answer is still drawn.
    if (mode === "sandbox") resolved = resolveAll(contour);
    applyResolution(resolveState(currentState(), compiled, budgetNow()));
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
    // The two canvases' text alternatives describe what was just computed, so they are refreshed
    // with it — a static label would go stale the first time a record changed.
    inkCanvas.setAttribute("aria-label", `${STAGE_KEYS} ${describeStage()}`);
    accCanvas.setAttribute("aria-label", describeAccumulator());
    // Not mid-gesture: a drag recomputes at draft quality on every frame, and the URL is for the
    // state the reader stopped at. `endGesture` calls it once the gesture is over.
    if (gesture === "none") syncHash();
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
    compiled = compile(input.value);
    if (!compiled.ok) {
      poles = null;
      errorBox.hidden = false;
      errorBox.textContent = compiled.error;
      recompute();
      return;
    }
    poles = compiled.poles;
    // No declaration in the sandbox, and that is correct rather than a gap: the expression the
    // user typed IS the definition, so its principal branch is the function they asked for.
    //
    // Set on the line before `setIntegrand` deliberately, here and in `adopt`. The invariant is
    // that `declaredOnStage` describes the program the stage is CURRENTLY holding, so the two
    // move together or not at all — a failed parse leaves the previous program on screen, and
    // clearing the flag without clearing the program would have the card describe a picture that
    // is not there.
    // With a factor declared the box holds `R(z)`, and `recompute` puts the DECLARED product on
    // the stage instead — so the program is not built here and the flag is not cleared here.
    if (declaration === null) {
      declaredOnStage = null;
      stageKey = null;
      stage?.setIntegrand(compiled.ast);
    }
    errorBox.hidden = true;
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
      recordCard.append(el("p", "muted small", relationText(family)));
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
        for (const borrowed of systemTargets.borrowed) {
          const line = el("p", "resultValue bonusValue");
          line.append(badge(assembleVerdict([borrowed.certificate]).level), ` ${borrowed.text}`);
          recordCard.append(
            line,
            el("p", "muted small", `${describe(borrowed.targetId)} — ${borrowed.certificate.claim}`),
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

    const panel = el("details", "derivation");
    panel.open = !derivation.closes;
    const steps = derivation.stages.reduce((n, st) => n + st.lines.length, 0);
    const summary = el(
      "summary",
      undefined,
      derivation.closes
        ? `Derivation — ${steps} steps, each with its evidence`
        : `Derivation — where it stops: ${derivation.failedAt ?? "incomplete"}`,
    );
    panel.append(summary);

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
      panel.append(block);
    }

    if (derivation.conclusion) {
      const end = el("p", "conclusion");
      // Badged from the CONCLUSION's own evidence, which is not the argument-wide meet: a vanishing
      // arc owes a `≤` at finite R and an `=` for its limit, and only the limit enters the answer.
      end.append(
        badge(derivation.conclusion.level),
        ` ${derivation.conclusion.label} = ${derivation.conclusion.text}`,
      );
      panel.append(end);
    }
    derivationCard.append(panel);
  }

  function renderResult(): void {
    resultCard.replaceChildren(el("h2", undefined, "∮ f(z) dz"));
    if (!integral) {
      resultCard.append(el("p", "muted", "No integrand."));
      return;
    }

    // Three independent reasons there may be no number, asked in ONE place — `integralRefusal`, in
    // `engine/ledger.ts`. It used to be asked here, inline, which was fine while this was the only
    // surface; the exported figure's caption is the second, and a caption that re-derived the
    // question would be one edit away from printing a number on a shareable image that the app
    // itself withholds.
    const refused = integralRefusal(integral, ledger);
    if (refused !== null) {
      // No number. Not a greyed-out number, not a number with a warning beside it — none.
      const row = el("p", "refusal");
      row.append(badge("⚠"), " Refused");
      resultCard.append(row, el("p", "muted", refused.claim));
      if (refused.repair !== undefined) resultCard.append(el("p", "repair", refused.repair));
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
          contourSource = { template: t.id, shift: [0, 0] };
          if (t.seed !== undefined && branch.points.length === 0) branch = t.seed(branch);
          recompute();
          frameContour();
        });
        picker.append(b);
      }
      contourCard.append(picker);

      // ── the pen (M7.2c) ──
      const penRow = el("div", "penRow");
      if (penNodes === null) {
        const draw = el("button", "preset", "Draw a contour");
        draw.type = "button";
        draw.setAttribute("aria-label", "draw a contour by hand");
        draw.addEventListener("click", () => {
          penStart();
          inkCanvas.focus();
        });
        penRow.append(draw);
        // Say so when the contour on screen IS hand-drawn, because "template: …" is what a reader
        // sees under a record and its absence would otherwise be the only clue.
        if (penPath(contour) !== null) {
          penRow.append(el("span", "tag", `drawn · ${contour.pieces.length} pieces`));
        }
      } else {
        // **THE GRAMMAR, WRITTEN DOWN** (research 07 rule 6). Not a lesson — the keys are the
        // affordance, and a tool whose gestures are undiscoverable is a tool nobody finds.
        penRow.append(
          el("span", "num", `${penNodes.length} vertex${penNodes.length === 1 ? "" : "es"}`),
        );
        const close = el("button", "preset", "Close");
        close.type = "button";
        close.disabled = penNodes.length < 3;
        close.setAttribute("aria-label", "close the drawn path and adopt it as the contour");
        close.addEventListener("click", () => {
          penCommit(true);
        });
        const back = el("button", "preset", "Undo");
        back.type = "button";
        back.disabled = penNodes.length === 0;
        back.setAttribute("aria-label", "remove the last vertex");
        back.addEventListener("click", penBack);
        const abort = el("button", "preset", "Cancel");
        abort.type = "button";
        abort.setAttribute("aria-label", "abandon the drawn path");
        abort.addEventListener("click", penStop);
        penRow.append(close, back, abort);
      }
      contourCard.append(penRow);
      if (penNodes !== null) {
        contourCard.append(
          el(
            "p",
            "muted small",
            "Click to place a corner, drag to bow the piece into an arc, click the first vertex " +
              "to close. Backspace drops the last corner, Escape abandons the path, Alt suppresses " +
              "snapping.",
          ),
        );
        // **THE SNAP NAMES ITSELF** (rule 5): a vertex that moved without saying so is a vertex the
        // reader did not place, and on this stage that can be the difference between a contour the
        // ledger certifies and one it refuses.
        if (penSnap !== null) {
          contourCard.append(el("p", "small snapNote", `snapped to ${penSnap}`));
        }
      }
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
  /**
   * The modulus-contour toggle, and the one sentence that says what it proves.
   *
   * **The claim is not the same in the two cases, so the sentence is not either.** For a power
   * product `|f| = |c|·∏|z−bₖ|^{αₖ}·|R|` is single-valued: the determination enters only through
   * the argument, so a level curve of `|f|` crosses the seam without noticing it, which is the most
   * direct possible demonstration that the seam is a choice (research 06 §5.1's device #2, "the
   * strongest honest device available"). For a `log^m` it is FALSE — the monodromy is additive and
   * `|(L + 2πi)^m| ≠ |L^m|` — so the contours break at the cut, by a factor of 18.7 for D4 and 80.7
   * for D5, and the app says that instead. Claiming continuity over a log would be using an honest
   * device to tell a lie.
   */
  function modulusToggle(): HTMLElement {
    const wrap = el("div");
    const tools = el("div", "presets");
    const b = el("button", "preset", "modulus contours");
    b.type = "button";
    b.setAttribute("aria-pressed", String(isoOn()));
    b.classList.toggle("on", isoOn());
    b.addEventListener("click", () => {
      isoPref = !isoOn();
      renderBranchCard();
      requestDraw();
    });
    tools.append(b);
    wrap.append(tools);
    if (isoOn()) {
      const logged = (declaredOnStage?.factors ?? []).some((factor) => factor.kind === "log");
      wrap.append(
        el(
          "p",
          "muted small",
          logged
            ? "|f| carries a log, so it is NOT single-valued: crossing the cut adds 2πi and the modulus jumps with it. These contours break at the cut, and no choice of argument window can make them meet."
            : "|f| does not depend on the determination, so these contours run straight through any cut — which is the clearest evidence that a seam in the colour is a choice about the argument and not something the function does.",
        ),
      );
    }
    return wrap;
  }

  /**
   * What crossing each cut would cost, beside the cut editor — research 06 §3.2's factor, in front
   * of the reader BEFORE they drag into a refusal rather than inside it.
   *
   * The refusal names it too (`engine/ledger.ts`), but a reader who only meets it there meets it as
   * a punishment. Here it is the number that makes the drag legible: nothing changes while the cut
   * stays clear of the contour, and this is exactly what changes when it does not.
   */
  function monodromyReadout(): HTMLElement | null {
    const all = allCrossingMonodromy(effective());
    if (all.length === 0) return null;
    const wrap = el("div");
    wrap.append(el("h3", "small muted", "Crossing a cut"));
    const list = el("ul", "pieces");
    for (const m of all) {
      const li = el("li");
      li.append(el("span", "pieceName num", m.cut));
      li.append(
        el(
          "span",
          "pieceValue",
          m.kind === "additive"
            ? "adds 2πi — infinite order, so no factor and no sheet count closes the loop"
            : // BOTH forms, §3.4: the literal one is what the integrand's exponent gives, and a
              // reader who only ever sees the reduced one carries it to an `x^s` integrand where
              // the `−1` is not there to cancel.
              m.literal === m.reduced
              ? `× ${m.literal}${m.value === null ? "" : ` = ${formatSqrtExt(m.value)}`}`
              : `× ${m.literal} = ${m.reduced}${m.value === null ? "" : ` = ${formatSqrtExt(m.value)}`}`,
        ),
      );
      list.append(li);
    }
    wrap.append(list);
    return wrap;
  }

  function renderBranchCard(): void {
    branchCard.replaceChildren(el("h2", undefined, "Branch cuts"));
    // The modulus-contour toggle belongs to both modes: under a record it is the device that
    // answers the seam, and in the sandbox it is the same device over the user's own expression.
    branchCard.append(modulusToggle());
    const readout = monodromyReadout();
    if (readout !== null) branchCard.append(readout);
    if (mode !== "sandbox") {
      branchCard.append(
        el("p", "muted small", "A record's cuts are the record's. Switch to the sandbox to draw one."),
      );
      // **THE BACKDROP IS NOW DRAWN IN THE DECLARED DETERMINATION** (M4.7c), which is what this
      // line says. Until then it came from the compiled evaluator's principal branch and showed a
      // seam on D7's `(b, ∞)` where the composite is continuous — that record's own
      // `rendering-the-union-of-sub-cuts` trap looking back at the reader. It is built from the
      // record's own factor list now, each factor in its declared window, so the picture and the
      // ledger are in the same determination. See `kernel/branch/declared.ts`.
      if (family?.branch !== undefined) {
        branchCard.append(
          el(
            "p",
            "muted small",
            declaredOnStage === null
              ? "the colouring behind the contour is drawn in the principal branch of each factor; this record's determination is declared but not on the stage."
              : "the colouring behind the contour is drawn in the determination this record DECLARES — each factor in its own argument window — so the picture and the ledger are on the same sheet.",
          ),
        );
      }
      return;
    }

    const tools = el("div", "presets");
    // **SHADOW MODE — research 06 §2.3, and free.** If `f` is defined by continuing along `[z₀, z]`,
    // the induced cuts are exactly the rays from each `bₖ` pointing away from `z₀`, so they swing
    // like shadows as the lamp moves. It needs no data structure, which is why it is a toggle over a
    // derivation rather than a second cut representation to keep in step — and why the cut vertices
    // stop being draggable while it is on: there, a cut is a consequence.
    const shadow = el("button", "preset", "shadow cuts");
    shadow.type = "button";
    shadow.setAttribute("aria-pressed", String(branch.shadow === true));
    shadow.classList.toggle("on", branch.shadow === true);
    shadow.addEventListener("click", () => {
      branch = setShadow(branch, branch.shadow !== true);
      recompute();
      renderBranchCard();
    });
    tools.append(shadow);
    const add = el("button", "preset", "+ branch point");
    // The mode's own sentence, present whenever it is on. It also carries the repair the LEDGER
    // cannot: admissibility's advice is "run a cut from it to another branch point, or to infinity",
    // which is right in general and names an action shadow mode does not offer — there a cut is a
    // consequence, and what a reader moves is the lamp.
    const shadowNote =
      branch.shadow === true
        ? el(
            "p",
            "muted small",
            "the cuts are the rays pointing away from z₀ — drag the base point to swing them. A branch point sitting on z₀ casts no shadow, so move one clear of the other. Every shadow reaches infinity, so a bounded arc — the dogbone — cannot be one: switch this off to build it.",
          )
        : null;
    add.type = "button";
    add.addEventListener("click", () => {
      // Placed at the middle of the view rather than at the origin, so a second point does not land
      // on the first and a point never appears off screen.
      const c = branch.points.length === 0 ? ([0, 0] as Cx) : ([view.center[0] + 1, view.center[1]] as Cx);
      branch = addBranchPoint(branch, c);
      recompute();
    });
    tools.append(add);

    // The dogbone gesture, offered exactly when it means something: two points, a shape to toggle
    // between, and EXPLICIT cuts. Whether the JOIN is admissible is the ledger's call, not this
    // button's.
    //
    // **Not in shadow mode**, and review is why. It read `branch.cuts` — the declaration — which
    // shadow mode ignores, so "split into two rays" edited something invisible and changed nothing
    // on screen: the same handle-on-a-consequence defect `branchHandles` excludes the cut vertices
    // to avoid, left standing here. Worse for the JOIN, which offers the one shape a shadow system
    // structurally cannot express — every ray reaches infinity, so there is no bounded arc to make.
    const bounded = branch.cuts.find((c) => c.from !== INFINITY_ID && c.to !== INFINITY_ID);
    if (branch.shadow === true) {
      // nothing: the cuts are a consequence here, and the note below says where to go for a dogbone
    } else if (branch.points.length === 2 && bounded === undefined) {
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
    if (shadowNote !== null) branchCard.append(shadowNote);
    // **THE SANDBOX'S CUT AND THE SANDBOX'S COLOURING ARE DIFFERENT OBJECTS**, and a reader can see
    // both at once, so the app has to say it. The colouring comes from the expression that was
    // typed, in `@cas/expr`'s principal branch of every sub-expression; the cut is a DECLARATION the
    // reader made, and M4.7c's finding is that the determination a written expression is in cannot
    // be inferred from it — so the app does not pretend the two agree by correcting one into the
    // other. Under a record they DO agree, because a record declares its factorisation and the
    // stage is built from it; here there is nothing to build from, and the honest report is that
    // moving the cut changes the ledger's verdict and not the picture's seam.
    if (branch.points.length > 0) {
      branchCard.append(
        el(
          "p",
          "muted small",
          declaration === null
            ? "the colouring is the principal branch of the expression above; the cut is your declaration, and the two need not coincide. Moving the cut changes the verdict, not the seam."
            : "the colouring is built from the factorisation you declared, each factor in its own window — so the seam IS your cut, as it is under a gallery record. Moving the cut still changes the verdict and not the seam, because ∮ reads the window and never the geometry.",
        ),
      );
    }

    if (branch.points.length === 0) {
      branchCard.append(
        el("p", "muted small", "No branch points declared, so the integrand is treated as single-valued."),
      );
      return;
    }

    renderDeclaration(branch);

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

  /**
   * **THE DECLARED FACTORISATION, AS AN EDITABLE OBJECT** (M5.1c).
   *
   * Declaring is an explicit act with a visible cost: the integrand box stops holding the integrand
   * and starts holding `R(z)`. That trade is what buys an exact answer — `findPoles` on
   * `z^0.3/(1+z)` reports `rational: false` and no poles at all, so without a declared split the
   * sandbox has no residues and no `∮` — and it is stated rather than implied, with the assembled
   * form shown alongside so the reader can see what they are now claiming.
   */
  /**
   * @param shown — the cut system being RENDERED (post-`effective`), never the state to edit.
   *
   * **Named `shown` and not `branch`, and a browser pass is why.** It was `branch`, which shadowed
   * the module-level `let branch` that every handler here assigns to — so `branch = setSheet(…)` and
   * `branch = rebuilt.choice` both wrote to the parameter and were discarded. The sheet spinner did
   * nothing at all, and worse, changing the determination moved the ANSWER (which reads
   * `declaration.window`) while leaving the cut drawn where it was (which reads this). The two then
   * disagreed about where the discontinuity is, silently — precisely the thing "declaring the
   * determination IS declaring the cut" exists to prevent. TypeScript cannot catch it: assigning to
   * a parameter is legal.
   */
  function renderDeclaration(shown: BranchChoice): void {
    const wrap = el("div", "declaration");
    const order = declaredOrder();

    if (declaration === null || order === null) {
      wrap.append(
        el(
          "p",
          "muted small",
          "The integrand above is taken whole, in the principal branch of every sub-expression — so " +
            "its residues are not decidable and there is no ∮. Declare a factorisation to get one: " +
            "the box then holds R(z) and the factor is read in its own window.",
        ),
      );
      for (const point of shown.points) {
        const b = el("button", "preset", `declare a factor on ${point.label}`);
        b.type = "button";
        b.addEventListener("click", () => {
          beforeDeclarationSrc = input.value;
          declaration = {
            pointId: point.id,
            window: [Frac.ZERO, Frac.of(2n)],
            sign: 1,
            constant: [1, 0],
            logPower: 2,
          };
          fLabel.textContent = "R(z) =";
          input.setAttribute("aria-label", "rational cofactor R(z)");
          recompute();
        });
        wrap.append(b);
      }
      branchCard.append(wrap);
      return;
    }

    // ---- the declared factor, editable ----------------------------------------------------
    const head = el("p", "verdict");
    head.append(el("strong", undefined, "Declared factor"));
    wrap.append(head);

    const row = el("div", "contrasts");
    const windows: readonly { readonly label: string; readonly value: readonly [Frac, Frac] }[] = [
      { label: "arg ∈ [0, 2π)", value: [Frac.ZERO, Frac.of(2n)] },
      { label: "arg ∈ [−π, π)", value: [Frac.of(-1n), Frac.ONE] },
    ];
    const windowPick = el("select", "picker");
    windowPick.setAttribute("aria-label", "argument window of the declared factor");
    for (const w of windows) {
      const opt = document.createElement("option");
      opt.value = w.label;
      opt.textContent = w.label;
      opt.selected = declaration.window[0].equals(w.value[0]);
      windowPick.append(opt);
    }
    windowPick.addEventListener("change", () => {
      const chosen = windows.find((w) => w.label === windowPick.value);
      // **Declaring the determination IS declaring the cut**, so the cut is rebuilt from the new
      // window rather than left where it was — otherwise the two would disagree about where the
      // discontinuity is, silently.
      //
      // Through `setCutFromWindow`, which rebuilds the cut's GEOMETRY on the point the declaration
      // names. This used to take `buildDeclaration`'s whole `choice`, whose single point is `"b"`
      // while the reader's is `"b1"` — so the declaration was orphaned on every window change and
      // the app went on integrating the cofactor as though it were the integrand. See that
      // function's note; a jsdom driver over the real shell is what found it.
      if (chosen && declaration) {
        declaration = { ...declaration, window: chosen.value };
        const next = setCutFromWindow(branch, declaration.pointId, chosen.value, order);
        if (next !== null) branch = next;
      }
      recompute();
    });
    row.append(el("span", "muted small", "window:"), windowPick);

    if (order.kind === "power") {
      const orient = el("button", "preset", declaration.sign === 1 ? "(z − b)" : "(b − z)");
      orient.type = "button";
      orient.setAttribute("aria-label", "orientation of the declared factor");
      orient.addEventListener("click", () => {
        if (declaration) declaration = { ...declaration, sign: declaration.sign === 1 ? -1 : 1 };
        recompute();
      });
      row.append(el("span", "muted small", "written:"), orient);
    } else {
      const m = el("input", "expr small");
      m.type = "number";
      m.min = "1";
      m.step = "1";
      m.value = String(declaration.logPower);
      m.setAttribute("aria-label", "power m of log^m");
      m.addEventListener("change", () => {
        const v = Math.round(Number(m.value));
        if (declaration && Number.isFinite(v)) declaration = { ...declaration, logPower: Math.max(1, v) };
        recompute();
      });
      row.append(el("span", "muted small", "log^m, m ="), m);
    }
    wrap.append(row);

    // Short label, explanation beneath: at the rail's width the sentence-length version was clipped
    // mid-word ("…back in th"), which a browser pass caught and no test could.
    // ---- the sheet spinner (research 06 §5.3) ---------------------------------------------
    // Deferred in M4.7d with its reason — "the sandbox has no declared branch FACTOR for a sheet
    // index to multiply" — and this is the slice that gives it one. A sheet is a whole-turn offset
    // of the declared window, so the spinner moves the ANSWER and leaves the cut exactly where it
    // is; the badge names the factor so that is visible rather than inferred.
    const sheetRow = el("div", "contrasts");
    const sheetIn = el("input", "expr small");
    sheetIn.type = "number";
    sheetIn.step = "1";
    sheetIn.value = String(shown.sheet);
    sheetIn.setAttribute("aria-label", "sheet the answer is reported on");
    sheetIn.addEventListener("change", () => {
      const v = Number(sheetIn.value);
      if (Number.isFinite(v)) branch = setSheet(branch, v);
      recompute();
    });
    sheetRow.append(el("span", "muted small", "sheet:"), sheetIn);
    if (order.kind === "power") {
      const j = order.alpha.mul(Frac.of(BigInt(shown.sheet)));
      sheetRow.append(
        el(
          "span",
          "muted small",
          shown.sheet === 0
            ? "sheet 0 — the determination as declared"
            : `× e^(2πi·${formatFrac(j)}), and the cut does not move`,
        ),
      );
    } else {
      sheetRow.append(
        el(
          "span",
          "muted small",
          shown.sheet === 0
            ? "sheet 0 — the determination as declared"
            : `log + ${shown.sheet === 1 ? "" : `${shown.sheet}·`}2πi — a log's monodromy is ADDITIVE, so no factor closes it`,
        ),
      );
    }
    wrap.append(sheetRow);

    const drop = el("button", "preset", "undeclare");
    drop.type = "button";
    drop.setAttribute("aria-label", "undeclare the factor and put the whole integrand back in the box");
    drop.addEventListener("click", () => {
      // **Put back what was TYPED, not what is in the box.** The box holds `R(z)` now, so leaving it
      // alone and merely changing the label would take the cofactor and call it the integrand —
      // silently a different problem, and one that still looks plausible. A browser pass found
      // exactly that: after undeclaring, `1/(1+z)` was being integrated as though it were
      // `z^(−1/2)/(1+z)`, with a perfectly reasonable `2πi` beside it.
      if (beforeDeclarationSrc !== null) input.value = beforeDeclarationSrc;
      declaration = null;
      splitCheck = null;
      beforeDeclarationSrc = null;
      fLabel.textContent = "f(z) =";
      input.setAttribute("aria-label", "integrand f(z)");
      applyExpression();
    });
    wrap.append(drop, el("p", "muted small", "puts the whole integrand back in the box."));

    // ---- is the split the integrand it claims to be? ---------------------------------------
    if (declaredRefusal !== null) {
      const bad = el("p", "verdict");
      bad.append(badge("⚠"), ` ${declaredRefusal}`);
      wrap.append(bad);
    }
    if (splitCheck !== null) {
      const line = el("p", "verdict");
      line.append(badge(splitCheck.ok ? "≤" : "⚠"), ` ${splitCheck.detail}`);
      wrap.append(line);
    }
    branchCard.append(wrap);
  }

  function renderPoles(): void {
    poleCard.replaceChildren(el("h2", undefined, "Poles"));
    if (!poles) {
      poleCard.append(el("p", "muted", "No integrand."));
      return;
    }
    // With a factor declared these are the poles of `R(z)` and not of the integrand, which matters:
    // a branch point is not a pole and carries no residue, so the two lists are genuinely different
    // and a reader comparing this card to the expression box would otherwise be misled.
    if (mode === "sandbox" && declaration !== null) {
      poleCard.append(el("p", "muted small", "of the cofactor R(z) — the branch point carries no residue of its own."));
    }
    const verdict = assembleVerdict(poles.certificates);
    const head = el("p", "verdict");
    head.append(badge(verdict.level), ` ${describeLevel(verdict.level)}`);
    poleCard.append(head);

    // **"NO POLES" AND "NO CLAIM" ARE DIFFERENT SENTENCES, and until M5.3a the card printed the
    // second for both.** An entire integrand HAS an answer — the singular set is empty — and saying
    // "no poles are claimed" about it understates what the engine established, while saying "No
    // poles." about an unread integrand overstates it. The decision is read first for that reason.
    if (poles.entire) {
      poleCard.append(
        el("p", "muted", "No poles: f is entire, so the singular set is empty and Σ Res is the empty sum."),
      );
      return;
    }
    if (!poles.rational) {
      poleCard.append(
        el("p", "muted", "f could not be read exactly, so no poles are claimed — which is not the same as there being none."),
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
    // **THE PEN TAKES THE CLICK FIRST**, before any grab test. While it is out, the stage is a
    // drawing surface: a click that happened to land on a radius handle must place a vertex, not
    // start a drag, or the tool would silently stop working near anything else on screen.
    if (penNodes !== null) {
      penAt = at;
      penClick(at, ev.altKey || ev.metaKey);
      stageWrap.setPointerCapture(ev.pointerId);
      return;
    }
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
      anchorShift = contourSource?.shift ?? [0, 0];
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
    if (penNodes !== null) {
      const raw = plotAt(px, py);
      const free = ev.altKey || ev.metaKey;
      // A drag BOWS the piece just placed; a plain move only moves the pending end. The far end is
      // snapped either way, so the preview and the committed piece are the same geometry.
      if (penDrag !== null && (ev.buttons & 1) !== 0) {
        penBow(raw);
      } else {
        const snapped = penSnapTo(raw, free);
        penAt = [snapped.at[0], snapped.at[1]];
        penDrag = null;
        // **THE CARD IS REBUILT ONLY WHEN THE SNAP'S NAME CHANGES**, not on every move. The card
        // replaces its children and rebuilds its controls, and doing that per pointer sample would
        // be both wasteful and visibly unstable — while the only thing a move can change in it is
        // which constraint is being named.
        if (snapped.why !== penSnap) {
          penSnap = snapped.why;
          renderContourCard();
        }
        requestDraw();
      }
      return;
    }
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
      moveContour(anchorContour, anchorShift, [at[0] - anchorAt[0], at[1] - anchorAt[1]]);
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
    // Unconditionally, because a VIEW pan changes the camera and recomputes nothing.
    syncHash();
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

  const sameBranchGrab = (a: BranchGrab, b: BranchGrab): boolean => {
    // The base grab has no id: there is exactly one base point, so the kind identifies it.
    if (a.kind !== b.kind) return false;
    if (a.kind === "base") return true;
    if (a.kind === "point") return b.kind === "point" && a.id === b.id;
    return b.kind === "cut" && a.id === b.id && a.index === b.index;
  };

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
      moveContour(contour, contourSource?.shift ?? [0, 0], d);
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
  /**
   * What the stage and the accumulator SHOW, in words, derived from the ledger.
   *
   * Research 02 §8 makes the head-to-tail partial sum the app's P0 picture, and it was completely
   * unannounced — the one substantive gap M6.0's keyboard walk found. This is the `role="img"` case
   * `@cas/ui`'s `attachCanvasA11y` exists for.
   *
   * **Generated, never written.** Every clause comes from something the engine computed: the caption
   * the exported figure uses (so the two cannot disagree), the piece list, and the enclosed count.
   * A hand-written alternative would drift from the picture the first time a record changed, and
   * would be the one place in this app claiming something nothing checked.
   */
  function describeStage(): string {
    const c = captionNow();
    const pieces = contour.pieces.length;
    // **"WOUND", not "enclosed", and the distinction is D6's.** This counts poles whose winding
    // number the engine decided to be non-zero, which is exactly what it says. The ledger's CATCH
    // row can differ: the exterior residue theorem re-weights each pole by `n − σ`, so a dogbone
    // with the cut inside it encloses its poles and still contributes nothing from them. Describing
    // this count as "enclosed" would put a claim in the text alternative that the ledger next to it
    // does not make.
    //
    // `w.decided &&` is UNOBSERVABLE and kept deliberately — a mutation sweep survivor, recorded
    // rather than deleted: every `decided: false` path in `kernel/winding.ts` returns `n: 0`, so the
    // two conditions agree today. Dropping it would make this line depend on that invariant holding
    // in another module, which is not a dependency a description should have.
    const wound = integral?.windings.filter((w) => w.decided && w.n !== 0).length ?? 0;
    return (
      `${c.title}. ${pieces} piece${pieces === 1 ? "" : "s"}; ` +
      `${wound === 0 ? "the contour winds about no pole" : `it winds about ${wound} pole${wound === 1 ? "" : "s"}`}. ` +
      `${c.value}. ${c.verdict}`
    );
  }

  function describeAccumulator(): string {
    const c = captionNow();
    if (acc === null) {
      return "The partial sum of f(z)·Δz along the contour. Nothing is plotted: there is no value to accumulate.";
    }
    return (
      `The partial sum Σ f(zₖ)·Δzₖ, plotted head to tail in the complex plane over ` +
      `${acc.steps.length} steps along the contour. Its endpoint is the integral: ${c.value}.`
    );
  }

  // Attached for its side effect: the role, the name and the live region. There is nothing to
  // announce and no key to handle, so the handle itself is not kept.
  attachCanvasA11y(accCanvas, {
    // A STATIC view, so `role="img"` and no key handler: everything the reader can change about it —
    // the scrub position and the comparison — is a labelled control in the strip beside it.
    role: "img",
    // Through the same generator `recompute` refreshes it with, so the label has one source even at
    // this one moment before the first recompute has run.
    label: describeAccumulator(),
  });

  /**
   * Backspace and Escape, which `@cas/ui`'s key map does not carry.
   *
   * `attachCanvasA11y` translates arrows, `±`, Enter and Space into `CanvasKeyAction`s — a
   * deliberately small vocabulary shared by every canvas in the suite — so the pen's two extra keys
   * are a listener of this app's own rather than a widening of that contract for one consumer.
   */
  inkCanvas.addEventListener("keydown", (ev) => {
    if (penNodes === null) return;
    if (ev.key === "Backspace") {
      ev.preventDefault();
      penBack();
    } else if (ev.key === "Escape") {
      ev.preventDefault();
      penStop();
    }
  });

  const stageA11y = attachCanvasA11y(inkCanvas, {
    // The keys, then what is on screen — the second half regenerated on every recompute (see
    // `describeStage`), which is why the instructions are a constant the two places share.
    label: `${STAGE_KEYS} ${describeStage()}`,
    role: "application",
    render: glCanvas,
    liveRegionHost: stageWrap,
    onKey: (action: CanvasKeyAction, ev: KeyboardEvent) => {
      const port = viewport();
      // **WITH THE PEN OUT, ENTER CLOSES** rather than cycling the grab: there is nothing to grab
      // while drawing, and the reader's next intention is to finish the path. Arrow keys still pan,
      // which is what makes a vertex placeable outside the current view.
      if (penNodes !== null && action.kind === "commit") {
        penCommit(penNodes.length >= 3);
        return;
      }
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
      // Keyboard pan and zoom run outside any gesture, so `endGesture` never sees them.
      syncHash();
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
      // A wheel has no gesture and no end event; the coalescing in `syncHash` is what makes this
      // safe to call per tick.
      syncHash();
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

  // **THE LINK IS READ LAST AND EXACTLY ONCE.** After the app has built itself, so a decoded state
  // goes through the same `applyState` any other restore does; before `hashReady`, so none of the
  // boot renders above has overwritten the very hash being read.
  const link = decodeShell(window.location.hash);
  if (link !== null) {
    if (link.ok) {
      // **NO `frameContour()` HERE**, and it was there for one draft: the link CARRIES the camera,
      // and reframing would throw away the view the sharer chose. It is always a real view rather
      // than the bare default, because opening a record or picking a template frames the contour
      // first and `currentState()` reads the result.
      applyState(link.state);
    } else {
      // Shown, never drawn over. A link that cannot be honoured must not open something plausible
      // instead — that is the whole reason this codec refuses rather than defaulting.
      linkBox.hidden = false;
      linkBox.textContent =
        `This shared link could not be opened: ${link.reason}. ` +
        "Showing the app's own starting state instead.";
    }
  }
  hashReady = true;

  return { currentState, applyState };
}
