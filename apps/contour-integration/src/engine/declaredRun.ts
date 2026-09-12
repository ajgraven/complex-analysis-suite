// **ONE ANALYSIS OF A DECLARED BRANCH INTEGRAND — the sandbox's route to an exact answer.**
//
// Until M5.1 the sandbox could declare branch points, exponents and cuts but not the FACTORISATION,
// and the consequence was larger than it sounds. `findPoles` on `z^0.3/(1+z)` reports
// `rational: false` and **zero poles**, so `applyResidueTheorem` returns an estimate with no
// `exactValue` at all and the ledger fails at KILL. The sandbox did not produce a wrong answer for a
// multivalued integrand; it produced *no* answer. Which is why PLAN §7's M4 gate clause — "dragging
// a cut across the contour changes the answer" — was only half delivered: there was no answer for it
// to be true of.
//
// So this is the sandbox's `runFamily`: given a declared factor and a rational cofactor, build the
// three things a branch analysis needs — the residue-bearing `PowerFactor`/`LogFactor`, a `poles`
// report of the COFACTOR (the branch point carries no residue), and an evaluator in the DECLARED
// determination — and hand them to `analyse`.
//
// **THE CUT'S GEOMETRY AND THE FACTOR'S WINDOW ARE SEPARATE INPUTS, and that is the whole design.**
// `buildDeclaration` derives a cut system from the window, because declaring a determination IS
// declaring where the cut runs. But the sandbox's cut is DRAGGABLE, and a derived cut cannot be
// dragged — it is a consequence, not an object. So the live (possibly dragged) `BranchChoice` is
// passed in beside the declaration, exactly as a record passes its `choice` beside its `factor`, and
// the two are read by different things:
//
//   - the residues read the **window** (`powerAtPole(pole, {alpha, argRange})` — the geometry is not
//     an argument it takes), so `∮` cannot see where the cut is drawn;
//   - LEGALITY reads the **geometry**, so where the cut runs decides whether the argument is legal.
//
// That is M4.7d's invariance result arriving as a property of the code rather than a claim about it:
// drag a cut clear of the contour and the value is bit-identical, because nothing in the chain that
// produced it was given the cut's position.
import { makeComplexFn, type Node } from "@cas/expr";
import type { Frac } from "@cas/exact";
import { analyse, type Analysis } from "./analyse.js";
import type { PathFn, QuadratureBudget } from "./contour/integrate.js";
import { resolveAll, type Contour, type CutSide } from "./contour/model.js";
import { evaluateDeclared, sideResolves, type DeclaredProduct } from "../kernel/branch/declared.js";
import { buildDeclaration, type DeclaredOrder } from "../kernel/branch/declaration.js";
import type { BranchChoice } from "../kernel/branch/model.js";
import { pointAt, type Cx } from "../kernel/geom.js";
import { findPoles, type PoleReport } from "../kernel/poles.js";

/**
 * The evaluator a declared product implies, and whether every declared `side` can pin a limit.
 *
 * Extracted from `families/runFamily.ts` on the second-consumer rule — the sandbox needs the
 * identical evaluator or its quadrature is checking a different integrand from the one the gallery's
 * is. See `kernel/branch/declared.ts` for why `side` is a `1e-30` displacement inside the evaluator
 * rather than an `ε`-offset contour.
 */
export interface DeclaredEvaluator {
  readonly f: PathFn;
  /**
   * Why the quadrature must be skipped, or `null`.
   *
   * The one surviving case from M5.0: a cut running VERTICALLY through a piece that declares a side.
   * "above" then displaces along the cut rather than across it, `arg` does not move, and whichever
   * limit `atan2` returns would be taken — wrong half the time, silently. No record is in that
   * shape; a hand-built contour can be, which is exactly why the question is asked per analysis.
   */
  readonly unresolved: string | null;
}

export function declaredEvaluator(
  product: DeclaredProduct,
  cofactor: Node,
  contour: Contour,
): DeclaredEvaluator {
  const co = makeComplexFn(cofactor);
  const f: PathFn = (z: Cx, side?: CutSide): Cx => {
    const b = evaluateDeclared(product, z, side);
    const r = co(z as [number, number], [0, 0]) as Cx;
    return [b[0] * r[0] - b[1] * r[1], b[0] * r[1] + b[1] * r[0]];
  };

  // Sampled once per side-declaring piece, at its midpoint: a lip runs ALONG a cut by construction,
  // so whether the side resolves is a property of the pair and not of the point.
  const resolved = resolveAll(contour);
  let unresolved: string | null = null;
  contour.pieces.forEach((piece, k) => {
    if (piece.side === undefined || unresolved !== null) return;
    if (!sideResolves(product, pointAt(resolved[k], 0.5), piece.side)) {
      unresolved =
        `${piece.name} declares side '${piece.side}', but the cut it runs along is vertical there: ` +
        `"above" displaces along the cut rather than across it, so no limit is pinned and a ` +
        `quadrature would choose one by coin toss. The exact route is the residue theorem.`;
    }
  });
  return { f, unresolved };
}

/** What the sandbox declares: one branch factor on one of its points, times a rational cofactor. */
export interface SandboxDeclaration {
  /** `c` in `c·(s(z − b))^α·R(z)`. */
  readonly constant: Cx;
  /**
   * Which branch point in the live cut system carries the factor.
   *
   * A factor is declared ON a point the reader placed, rather than at a position typed separately,
   * so the declaration and the geometry cannot disagree about where it is. A point away from the
   * origin is refused by {@link buildDeclaration} with its reason — the single-factor residue reader
   * is about the origin — which makes the restriction self-explaining instead of a rule in a doc.
   */
  readonly pointId: string;
  readonly order: DeclaredOrder;
  /** `arg(s·(z − b)) ∈ [lo·π, hi·π)`. This, not the drawn cut, is what the residues read. */
  readonly window: readonly [Frac, Frac];
  /** The rational cofactor `R(z)` — what the integrand box holds once a factor is declared. */
  readonly cofactor: Node;
}

export type DeclaredRunResult =
  | {
      readonly ok: true;
      /** Everything `analyse` computed, spread so a caller reads it exactly as `FamilyRun` reads it. */
      readonly analysis: Analysis;
      readonly f: PathFn;
      /** The COFACTOR's poles — the branch point carries no residue of its own. */
      readonly poles: PoleReport;
      readonly declared: DeclaredProduct;
      /** The integrand as one expression, for display: `c·(s(z−b))^α·R(z)`. */
      readonly ast: Node;
      /** The cut system the WINDOW implies — what a dragged cut is measured against. */
      readonly implied: BranchChoice;
    }
  | { readonly ok: false; readonly reason: string };

const num = (value: number): Node => ({ kind: "num", value });
const mul = (left: Node, right: Node): Node => ({ kind: "arith", op: "*", left, right });

/** `c` as an expression, or `null` when it is exactly 1 and would only add noise. */
function constantNode(c: Cx): Node | null {
  const [re, im] = c;
  if (re === 1 && im === 0) return null;
  if (im === 0) return num(re);
  const i: Node = { kind: "const", name: "i" };
  if (re === 0) return im === 1 ? i : mul(num(im), i);
  return { kind: "arith", op: "+", left: num(re), right: im === 1 ? i : mul(num(im), i) };
}

/**
 * The declared integrand as one expression — for the reader, not for the engine.
 *
 * Nothing computes from this: the residues come from the exact declaration and the quadrature from
 * {@link declaredEvaluator}. It exists because the integrand box now holds only `R(z)`, and a reader
 * who cannot see what the whole integrand is has been asked to trust a split they cannot check.
 *
 * It is built from AST nodes rather than by parsing an assembled string, so a cofactor that needed
 * parenthesising cannot be re-parsed into a different expression than the one the engine used.
 */
function assembledAst(d: SandboxDeclaration, at: number): Node {
  const z: Node = { kind: "var", name: "z" };
  // `s·(z − b)`: at the origin this is `z` or `−z`, and `(b − z)` is the same NUMBER as `−(z − b)`
  // and not the same power — which is why the sign is carried rather than folded into a constant.
  const shifted: Node = at === 0 ? z : { kind: "arith", op: "-", left: z, right: num(at) };
  const base: Node =
    d.order.kind === "power" && d.order.sign === -1 ? { kind: "neg", operand: shifted } : shifted;

  let branchPart: Node;
  if (d.order.kind === "log") {
    const l: Node = { kind: "call", name: "log", args: [base] };
    branchPart = d.order.power === 1 ? l : { kind: "arith", op: "^", left: l, right: num(d.order.power) };
  } else {
    const a = d.order.alpha;
    branchPart = {
      kind: "arith",
      op: "^",
      left: base,
      right: a.d === 1n ? num(Number(a.n)) : { kind: "arith", op: "/", left: num(Number(a.n)), right: num(Number(a.d)) },
    };
  }

  const c = constantNode(d.constant);
  const withCofactor = mul(branchPart, d.cofactor);
  return c === null ? withCofactor : mul(c, withCofactor);
}

/**
 * Analyse a hand-declared branch integrand against a contour.
 *
 * `branch` is the LIVE cut system — dragged, shadowed, whatever the reader has done to it — and is
 * what LEGALITY reads. The window inside `declaration` is what the residues read. Passing both is
 * the point; see this module's header.
 */
export function runDeclared(
  declaration: SandboxDeclaration,
  contour: Contour,
  branch: BranchChoice,
  budget?: QuadratureBudget,
): DeclaredRunResult {
  const point = branch.points.find((p) => p.id === declaration.pointId);
  if (point === undefined) {
    return { ok: false, reason: `there is no branch point '${declaration.pointId}' to carry the factor` };
  }
  if (point.at[1] !== 0) {
    return {
      ok: false,
      reason:
        `the branch point is at ${point.at[0]} ${point.at[1] < 0 ? "−" : "+"} ${Math.abs(point.at[1])}i, ` +
        "off the real axis. The single-factor engine reads its determination along a cut from a real " +
        "point; an off-axis branch point needs the multi-point engine",
    };
  }

  const built = buildDeclaration({
    constant: declaration.constant,
    at: point.at[0],
    window: declaration.window,
    order: declaration.order,
  });
  if (!built.ok) return built;

  // **THE POLES ARE THE COFACTOR'S.** A branch point is not a pole — it carries no residue — and
  // `findPoles` on the assembled integrand would report `rational: false` and none at all, which is
  // exactly the hole this module fills. Records have split this way since M4.2; the sandbox splits
  // it because the reader declared the split.
  const poles = findPoles(declaration.cofactor);
  const { f, unresolved } = declaredEvaluator(built.declared, declaration.cofactor, contour);
  const effective = unresolved === null ? budget : { ...budget, skip: unresolved };

  const ast = assembledAst(declaration, point.at[0]);
  const analysis = analyse({
    ast,
    f,
    poles,
    contour,
    branch,
    ...(effective === undefined ? {} : { budget: effective }),
    ...(built.factor.kind === "power"
      ? { power: { factor: built.factor.value, rational: declaration.cofactor } }
      : { log: { factor: built.factor.value, rational: declaration.cofactor } }),
  });

  return { ok: true, analysis, f, poles, declared: built.declared, ast, implied: built.choice };
}
