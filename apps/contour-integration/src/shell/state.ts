// The shell's STATE, and the one function that turns it into numbers.
//
// **WHY THIS FILE EXISTS.** `app.ts` is 2,500 lines reached by no test at all, and every one of
// M6's workstreams lands in it: the `#vs=` codec has to read the shell's state, the figure export
// has to carry it, and both have to prove that reading it back reproduces what was on screen. None
// of that is possible while the state is a set of `let` locals inside `mountApp`'s closure, and
// none of it is TESTABLE while the only way to reach the compute path is to mount a WebGL2 app.
//
// So this module owns two things and deliberately no more:
//
//   1. **{@link ShellState}** — everything that determines what the app shows, as plain data. The
//      closure still owns the locals; this is the shape they project onto and restore from.
//   2. **{@link resolveState}** — the app's three compute branches (a gallery record, a sandbox
//      expression, a sandbox expression with a branch factor declared), as ONE function of that
//      state. `recompute()` calls it, and so does the test.
//
// **THAT SHARED PATH IS THE POINT, not a convenience.** It is M3.5a's move one level up: the
// gallery and the sandbox already run through `engine/analyse.ts` so that "the numbers on screen are
// the numbers the suite pins, along the same path" rather than two implementations agreeing by
// inspection. A `resolveState` the shell did not call would be a third implementation, and the test
// over it would prove nothing about the app.
//
// **NO DOM.** Not tidiness — the stage is WebGL2 and jsdom has no `getContext`, so anything that
// touches the shell's DOM is unreachable from the node gate. Everything here is plain data in and
// plain data out, which is why the test that rides it can run in `pnpm test` rather than only in the
// browser suite.
import { makeComplexFn, parse, type Node } from "@cas/expr";
import type { Bindings, Family, Golden } from "../families/schema.js";
import {
  offeredFamilies,
  primaryGolden,
  solveFamily,
  type FamilyRun,
  type Offered,
} from "../families/runFamily.js";
import type { PiSolvedTargets, SolvedValue } from "../families/solveTarget.js";
import { analyse, type Analysis } from "../engine/analyse.js";
import { runDeclared, type SandboxDeclaration } from "../engine/declaredRun.js";
import { checkSplit, type SplitCheck } from "../engine/splitCheck.js";
import type { QuadratureBudget, PathFn } from "../engine/contour/integrate.js";
import { type Contour } from "../engine/contour/model.js";
import { effectiveBranch, NO_BRANCH, type BranchChoice } from "../kernel/branch/model.js";
import type { DeclaredOrder } from "../kernel/branch/declaration.js";
import type { DeclaredProduct } from "../kernel/branch/declared.js";
import type { Cx } from "../kernel/geom.js";
import { findPoles, type PoleReport } from "../kernel/poles.js";
import { asSummationKernel } from "../kernel/summationKernel.js";
import { DEFAULT_VIEW, type View } from "../kernel/camera.js";
import type { ContrastMode } from "../ui/accumulator.js";
import { Frac } from "@cas/exact";
import { TEMPLATES, type TemplateId } from "./templates.js";

/**
 * The branch FACTOR the sandbox has declared, if any.
 *
 * The exponent is deliberately absent: it lives on the branch point itself, where the existing
 * picker edits it, so there is one place a reader changes `α` and no way for two copies to disagree.
 * `app.ts` states the same rule at its own copy of this shape.
 */
export interface DeclarationState {
  readonly pointId: string;
  readonly window: readonly [Frac, Frac];
  readonly sign: 1 | -1;
  readonly constant: Cx;
  /** `m` in `log^m`. Ignored for a power factor; kept so toggling the order does not lose it. */
  readonly logPower: number;
}

/**
 * Everything that decides what the app shows, as plain data.
 *
 * **Split into three kinds, and the split is load-bearing for M6.2.** The PROBLEM fields decide the
 * numbers: drop one on a round trip and the app draws the same picture computing a different
 * integral — which is exactly M5.1's shadowed-`branch` bug, where the answer moved while the cut
 * stayed put. The VIEW fields cannot change a number by construction. The SESSION field is neither:
 * it is the sandbox's parked contour, which exists so that opening a record and coming back does not
 * leave a keyhole standing under `1/z`.
 */
export interface ShellState {
  // ── problem ────────────────────────────────────────────────────────────────────────────────
  readonly mode: "sandbox" | "gallery";
  /** SANDBOX. Under a declaration this is the COFACTOR `R(z)`, not the integrand — see `recompute`. */
  readonly expr: string;
  readonly declaration: DeclarationState | null;
  /** What the box held when the factor was declared — the split check's reference, and its only one. */
  readonly beforeDeclaration: string | null;
  /** The sandbox's declared cut system. A record's own cuts are the record's and are not stored here. */
  readonly branch: BranchChoice;
  /** The contour on screen, in either mode: a template, or one the reader has dragged. */
  readonly contour: Contour;
  /**
   * Where the SANDBOX's contour came from — PROVENANCE, not a second copy of its geometry.
   *
   * `shell/viewState.ts` carries the contour as this recipe rather than as its piece list, which is
   * what takes M6.2a's worst-case permalink from 2,838 B of URL — over research 07 §6's warning — to
   * 1,078 B. It is expressible because every sandbox contour is exactly
   * `translate(TEMPLATES[id].build() with params, shift)`: the only assignments to `contour` in
   * sandbox mode are a template build, `setParam` (params only) and `translateContour` (a rigid
   * shift). The params ride in `contour.params`, so only the id and the shift live here.
   *
   * It survives a mode switch, exactly as {@link branch} does and for the same reason: it is the
   * SANDBOX's, and gallery mode simply has no use for it — a record derives its own contour, so a
   * gallery link carries no contour at all.
   *
   * `null` means "not from a template", which is M7.2's pen tool — and the codec now has a second
   * wire form for exactly that case, carrying the drawn path's VERTICES (a twelve-corner path is 292
   * base64 characters against 2,028 as a piece list) and verifying on encode that they rebuild the
   * shape on screen. Until the pen existed nothing produced this and the codec refused to encode it,
   * the refusal being the signal that the pen would need its own serialisation rather than forty
   * lines of speculative one.
   */
  readonly contourSource: ContourSource | null;
  /** GALLERY: the open record's id, and which of its fixtures. */
  readonly record: string | null;
  readonly fixture: number;
  /** GALLERY: a move on a family PARAMETER — these reach the integrand, not only the geometry. */
  readonly bindings: Bindings;
  /** GALLERY: a move on a LIMIT parameter. Geometry only; never substituted into the integrand. */
  readonly geometry: Readonly<Record<string, number>>;

  // ── view — none of this can change a number ────────────────────────────────────────────────
  readonly view: View;
  readonly contrast: ContrastMode;
  readonly scrub: number;
  /** Modulus contours: `null` follows the context, a boolean is the reader's own choice. */
  readonly iso: boolean | null;

  // ── the teaching layer — what is MASKED, never a number ────────────────────────────────────
  /**
   * The faded drill's open rung, or `null` for the app as it otherwise is.
   *
   * Filed with the view rather than with the problem because it cannot change a number:
   * {@link resolveState} does not read it, and the drill's own risk register (M7-plan §2, S-e) makes
   * that a rule — progress may decide what is masked and never what is reported. It is in the state
   * at all because M7's gate clause 2 requires every rung to be addressable by permalink, which is
   * also what puts it under M6.2's round-trip-by-verdict test.
   */
  readonly drill: DrillState | null;

  // ── session ────────────────────────────────────────────────────────────────────────────────
  /** The sandbox's contour, parked while a record is open. */
  readonly sandboxContour: Contour | null;
}

/**
 * Which drill task is open, and at which rung.
 *
 * The stage is spelled out here rather than imported from `shell/drill.ts` because that module
 * imports this one: the type belongs to the state, and the drill re-exports it as `DrillStage`.
 */
export interface DrillState {
  /** The task's id — a contrast cell's id (`shell/drill.ts`'s `DRILL_TASKS`). */
  readonly task: string;
  readonly stage: 1 | 2 | 3 | 4;
}

/** The recipe a sandbox contour was built from — see {@link ShellState.contourSource}. */
export interface ContourSource {
  readonly template: TemplateId;
  /** The accumulated rigid translation since the template was built. */
  readonly shift: Cx;
}

/** The state the app boots into, minus the contour, which the caller supplies from a template. */
export function defaultState(contour: Contour): ShellState {
  return {
    mode: "sandbox",
    expr: "1/z",
    declaration: null,
    beforeDeclaration: null,
    // `NO_BRANCH.basePoint` is `[0,0]`, which is right for a rational integrand where nothing reads
    // it and wrong here: the first branch point a reader adds also lands at the origin, and a point
    // sitting ON the base point casts no shadow. Every gallery record puts its base point at `i`.
    branch: { ...NO_BRANCH, basePoint: [0, 1] },
    contour,
    // `TEMPLATES[0]` is the circle, which is what the app boots with — stated here rather than
    // passed in, so the default contour and the default recipe cannot disagree.
    contourSource: { template: TEMPLATES[0].id, shift: [0, 0] },
    record: null,
    fixture: 0,
    bindings: {},
    geometry: {},
    view: DEFAULT_VIEW,
    contrast: "none",
    scrub: 1,
    iso: null,
    drill: null,
    sandboxContour: contour,
  };
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Compiling the sandbox's expression.
//
// SEPARATE FROM {@link resolveState}, and cached by the caller, because the cost is not in the
// resolve: `findPoles` on a rational does root-finding, and re-running it on every frame of a
// contour drag would be a regression the app can least afford. The shell caches this when the
// EXPRESSION changes; the test calls it directly. One function either way, so the two cannot drift.
// ──────────────────────────────────────────────────────────────────────────────────────────────

export type Compiled =
  | { readonly ok: true; readonly ast: Node; readonly f: (z: Cx) => Cx; readonly poles: PoleReport }
  | { readonly ok: false; readonly error: string };

export function compile(expr: string): Compiled {
  let ast: Node;
  try {
    ast = parse(expr.trim());
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  const fn = makeComplexFn(ast);
  return {
    ok: true,
    ast,
    f: (z: Cx) => fn(z as [number, number], [0, 0]) as Cx,
    poles: findPoles(ast),
  };
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Resolving a state into numbers.
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * What a state resolves to — one variant per compute branch, carrying exactly what the shell
 * assigns from it and nothing it would have to reconstruct.
 */
export type StateResolution =
  /** A gallery record ran. `run` is absent only when the record could not be run at all. */
  | {
      readonly kind: "gallery";
      readonly family: Family;
      readonly golden: Golden;
      readonly run: FamilyRun | null;
      readonly solved: SolvedValue | null;
      readonly targets: PiSolvedTargets | null;
      /** Pass 5 refused while the run itself is sound — shown beside the ledger, never swallowed. */
      readonly note: string | null;
      /** Nothing to show at all. */
      readonly fatal: string | null;
    }
  /** The sandbox, with a branch factor declared — the route whose loss restores a different integral. */
  | {
      readonly kind: "declared";
      readonly analysis: Analysis;
      readonly f: PathFn;
      readonly declared: DeclaredProduct;
      readonly cofactor: Node;
      readonly split: SplitCheck | null;
    }
  | { readonly kind: "declared-refused"; readonly reason: string }
  /** The sandbox, plain: the typed expression IS the definition, so its principal branch is meant. */
  | {
      readonly kind: "plain";
      readonly analysis: Analysis;
      readonly ast: Node;
      readonly f: (z: Cx) => Cx;
    }
  /** Nothing could be computed — an unparseable expression, or no record selected. */
  | { readonly kind: "empty"; readonly reason: string | null };

/** The declared order, read off the branch point the factor sits on — never stored twice. */
export function declaredOrder(state: ShellState): DeclaredOrder | null {
  const d = state.declaration;
  if (d === null) return null;
  const point = effectiveBranch(state.branch).points.find((q) => q.id === d.pointId);
  if (point === undefined) return null;
  return point.order.kind === "log"
    ? { kind: "log", power: d.logPower }
    : { kind: "power", alpha: point.order.alpha, sign: d.sign };
}

/**
 * The loaded corpus, once.
 *
 * `offeredFamilies()` re-runs the loader — 28 records through four invariants — on every call, and
 * {@link recordOf} is reached on every recompute, every frame of a contour drag included. So the
 * DEFAULT corpus is memoised; a caller handing `offeredFamilies` its own records still gets a fresh
 * load, because that is not this corpus.
 *
 * The shell reads the same memo, which makes the record objects it holds and the ones `recordOf`
 * returns IDENTICAL rather than merely equal — and the fixture `<option>` list depends on that: it
 * marks the open fixture by `golden === g`.
 */
let loaded: Offered | null = null;
export function offeredCorpus(): Offered {
  loaded ??= offeredFamilies();
  return loaded;
}

/** The record and fixture a gallery state names, or null — resolved through the LOADER, never `FAMILIES`. */
export function recordOf(state: ShellState): { family: Family; golden: Golden } | null {
  if (state.record === null) return null;
  const family = offeredCorpus()
    .tiers.flatMap((t) => t.families)
    .find((fam) => fam.id === state.record);
  if (family === undefined) return null;
  const golden = family.golden[state.fixture] ?? primaryGolden(family);
  return { family, golden };
}

/**
 * The app's three compute branches, as one function of the state.
 *
 * `compiled` is the sandbox's cached parse; gallery mode ignores it, because a record's contour
 * integrand comes from the record (substitution and Jacobian included) and never from the box.
 */
export function resolveState(
  state: ShellState,
  compiled: Compiled | null,
  budget?: QuadratureBudget,
): StateResolution {
  if (state.mode === "gallery") {
    const found = recordOf(state);
    if (found === null) return { kind: "empty", reason: null };
    const { family, golden } = found;
    const r = solveFamily(family, golden, {
      bindings: state.bindings,
      geometry: state.geometry,
      ...(budget === undefined ? {} : { budget }),
    });
    if (r.ok) {
      return {
        kind: "gallery",
        family,
        golden,
        run: r.run,
        solved: r.solved,
        targets: r.route === "system" ? r.targets : null,
        note: null,
        fatal: null,
      };
    }
    // Pass 5 may refuse while the run itself is sound. Show what there is and say what is missing,
    // rather than blanking a record whose ledger and contour are perfectly readable.
    return {
      kind: "gallery",
      family,
      golden,
      run: r.run ?? null,
      solved: null,
      targets: null,
      note: r.reason,
      fatal: r.run ? null : r.reason,
    };
  }

  if (compiled === null || !compiled.ok) {
    return { kind: "empty", reason: compiled === null ? null : compiled.error };
  }
  const { ast, f, poles } = compiled;
  const effective = effectiveBranch(state.branch);
  const order = declaredOrder(state);

  if (state.declaration !== null && order !== null) {
    // **THE DECLARED ROUTE.** `ast` is the COFACTOR here, not the integrand — the box changed
    // meaning when the factor was declared — so the residues come from the declaration and the
    // poles from `R(z)`, exactly as they do for a gallery record.
    const spec: SandboxDeclaration = {
      constant: state.declaration.constant,
      pointId: state.declaration.pointId,
      order,
      window: state.declaration.window,
      cofactor: ast,
    };
    const r = runDeclared(spec, state.contour, effective, budget);
    if (!r.ok) return { kind: "declared-refused", reason: r.reason };
    // The split is checked against what the box held a moment before the declaration, which is the
    // only falsifiable form of "this factorisation is the integrand I meant".
    let split: SplitCheck | null = null;
    if (state.beforeDeclaration !== null) {
      try {
        split = checkSplit(r.declared, ast, parse(state.beforeDeclaration));
      } catch {
        split = null;
      }
    }
    return { kind: "declared", analysis: r.analysis, f: r.f, declared: r.declared, cofactor: ast, split };
  }

  // A summation KERNEL is recognised from the typed expression, and its poles are then windowed on
  // the contour inside `analyse` — which is why it is handed over as the kernel rather than as a
  // pole list: the window has to follow a drag, and `poles` is computed when the EXPRESSION changes.
  const kernel = asSummationKernel(ast);
  const analysis = analyse({
    ast,
    f,
    poles,
    contour: state.contour,
    branch: effective,
    ...(kernel === null ? {} : { summation: { kernel } }),
    ...(budget === undefined ? {} : { budget }),
  });
  return { kind: "plain", analysis, ast, f };
}
