import { makeComplexFn, parse, type Node } from "@cas/expr";
import { assembleVerdict, describeLevel, mayReportValue } from "@cas/rigor";
import { attachCanvasA11y, mountNavHeader, type CanvasKeyAction } from "@cas/ui";
import {
  DEFAULT_VIEW,
  fitView,
  panBy,
  plotToScreen,
  zoomAt,
  type View,
  type Viewport,
} from "../kernel/camera.js";
import type { Cx, Resolved } from "../kernel/geom.js";
import { findPoles, type PoleReport } from "../kernel/poles.js";
import { accumulateForIntegral, type Accumulation } from "../engine/contour/accumulate.js";
import { analyse } from "../engine/analyse.js";
import type { ContourIntegral } from "../engine/contour/integrate.js";
import type { ResidueTheoremResult } from "../engine/residueTheorem.js";
import { ledgerHeadline, type LedgerResult } from "../engine/ledger.js";
import { resolveAll, type Contour } from "../engine/contour/model.js";
import {
  circleTemplate,
  indentedSemicircleTemplate,
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
import type { SolvedTarget } from "../families/solveTarget.js";
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

type TemplateId = "circle" | "semicircle" | "semicircleDown" | "indented" | "rectangle";

const TEMPLATES: { id: TemplateId; label: string; build: () => Contour }[] = [
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
];

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
  let acc: Accumulation | null = null;
  let scrub = 1;
  let contrast: ContrastMode = "none";
  let highlight = -1;

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
  let solved: SolvedTarget | null = null;
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
  const resultCard = el("section", "card");
  const contourCard = el("section", "card");
  const poleCard = el("section", "card");
  rail.append(errorBox, recordCard, ledgerCard, resultCard, contourCard, poleCard);

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
        });
      }
      drawPoleMarkers();
    });
  };

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
    integral = null;
    theorem = null;
    ledger = null;
    acc = null;
    solved = null;
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
    // A partial sum through a singularity is meaningless rather than merely rough, so this is null
    // whenever the integral refused — showing one beside a refusal hands back the withheld number.
    acc = accumulateForIntegral(run.f, run.resolved, run.integral);
    stage?.setIntegrand(run.ast);
  }

  function recompute(): void {
    if (mode === "gallery") {
      recomputeRecord();
    } else {
      resolved = resolveAll(contour);
      if (!f || !ast || !poles) {
        clearComputed();
      } else {
        const a = analyse({ ast, f, poles, contour });
        resolved = a.resolved;
        integral = a.integral;
        theorem = a.theorem;
        ledger = a.ledger;
        acc = accumulateForIntegral(f, resolved, integral);
        solved = null;
      }
    }
    renderRecordCard();
    renderLedger();
    renderResult();
    renderContourCard();
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
    if (!family || !golden) {
      clearComputed();
      return;
    }
    const r = solveFamily(family, golden, {
      bindings: bindingOverrides,
      geometry: geometryOverrides,
    });
    if (r.ok) {
      adopt(r.run);
      solved = r.solved;
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
        line.append(badge("="), ` ${solved.text}`);
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
      v.append(badge("="), ` ${ledger.value.text}`);
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

  function renderResult(): void {
    resultCard.replaceChildren(el("h2", undefined, "∮ f(z) dz"));
    if (!integral) {
      resultCard.append(el("p", "muted", "No integrand."));
      return;
    }

    if (integral.refusal !== undefined || !mayReportValue(integral.verdict)) {
      // No number. Not a greyed-out number, not a number with a warning beside it — none.
      const row = el("p", "refusal");
      row.append(badge("⚠"), " Refused");
      resultCard.append(row, el("p", "muted", integral.refusal ?? "the result was refused"));
      const repair = integral.verdict.certificates
        .flatMap((c) => c.provenance)
        .find((s) => s.text.startsWith("suggested repair"));
      if (repair) resultCard.append(el("p", "repair", repair.text));
      return;
    }

    // The exact value, when the residue theorem could supply one, is the headline — it comes from a
    // formula rather than from integrating, and the quadrature below it is the corroboration.
    if (theorem?.exactValue) {
      const head = el("p", "resultValue exactValue");
      head.append(badge("="), ` ${theorem.exactValue.text}`);
      resultCard.append(head);
      const field =
        poles?.radicand === null || poles?.radicand === undefined
          ? "ℚ(i)"
          : `ℚ(i)(√${poles.radicand})`;
      resultCard.append(
        el("p", "muted small", `2πi Σ n(γ,aₖ)·Res(f,aₖ), from exact residues over ${field}`),
      );
      const check = el("p", theorem.agrees === true ? "crosscheck" : "restriction");
      check.append(
        theorem.agrees === true ? badge("≤") : badge("⚠"),
        theorem.agrees === true
          ? ` quadrature agrees to ${(theorem.disagreement ?? 0).toExponential(2)}`
          : ` the quadrature DISAGREES by ${(theorem.disagreement ?? 0).toExponential(2)} — one of them is wrong`,
      );
      resultCard.append(check);
    }

    const value = integral.value ?? [0, 0];
    const head = el("p", theorem?.exactValue ? "num numericValue" : "resultValue num");
    head.append(badge(integral.verdict.level), ` ${fmtCx(value)}`);
    resultCard.append(head);
    if (!theorem?.exactValue) {
      resultCard.append(el("p", "muted small", describeLevel(integral.verdict.level)));
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
        if (channel === "binding") {
          bindingOverrides = { ...bindingOverrides, [p.name]: v };
        } else if (channel === "geometry") {
          geometryOverrides = { ...geometryOverrides, [p.name]: v };
        } else {
          contour = {
            ...contour,
            params: { ...contour.params, [p.name]: { ...p, value: v } },
          };
        }
        recompute();
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
      if (pieceIntegral) {
        const v = el("span", "num pieceValue", fmtCx(pieceIntegral.value));
        li.append(v);
        if (pieceIntegral.capped) li.append(el("span", "tag warn", "resolution capped"));
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
        res.append(badge("="), ` Res = ${pole.residue.text}`);
        li.append(res);
      } else if (pole.isExact === false) {
        li.append(el("span", "tag warn", "≈ located numerically"));
      }
      list.append(li);
    }
    poleCard.append(list);
    if (poles.exactResidueSum) {
      poleCard.append(el("p", "muted small", `Σ Res = ${poles.exactResidueSum.text} (exact, over every pole)`));
    }
  }

  // --- interaction --------------------------------------------------------------------------
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  stageWrap.addEventListener("pointerdown", (ev) => {
    dragging = true;
    lastX = ev.clientX;
    lastY = ev.clientY;
    stageWrap.setPointerCapture(ev.pointerId);
  });
  stageWrap.addEventListener("pointermove", (ev) => {
    if (!dragging) return;
    view = panBy(view, ev.clientX - lastX, ev.clientY - lastY, viewport());
    lastX = ev.clientX;
    lastY = ev.clientY;
    requestDraw();
  });
  const endDrag = (ev: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    stageWrap.releasePointerCapture(ev.pointerId);
  };
  stageWrap.addEventListener("pointerup", endDrag);
  stageWrap.addEventListener("pointercancel", endDrag);

  // The accessible-canvas contract (ADR-0032): the GL canvas is the RENDER surface and is hidden
  // from assistive tech; the ink overlay above it carries the name, the focus and the keyboard map,
  // so the stage is navigable without a pointer at all.
  const stageA11y = attachCanvasA11y(inkCanvas, {
    label:
      "The complex plane: the integrand's phase portrait with the contour drawn over it. " +
      "Arrow keys pan, plus and minus zoom.",
    role: "application",
    render: glCanvas,
    liveRegionHost: stageWrap,
    onKey: (action: CanvasKeyAction) => {
      const port = viewport();
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
