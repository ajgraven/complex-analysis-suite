// Pass 5's fourth route: a contour that encloses NOTHING and closes on one imported value.
//
// E3 and F2 are the corpus's two Cauchy-theorem records. Their singular set is empty, so `∮ = 0`,
// every arc is killed by a lemma, and the whole answer comes from one `free` piece whose value is
// exactly known and not derived here — `√π` by polar coordinates, `Γ(1+1/n)` by the substitution
// `u = tⁿ`. ADR-0042 is the decision that such a piece may carry `=`; this is the arithmetic.
//
// **NOT IN UNITS OF π, AND `∮ = 0` IS WHY THAT IS SAFE.** Everything in `solveTarget` is π times an
// element of the exponential basis; an imported atom carries no π and the basis has no seat for
// `π·√π`. The two would be incomparable — the same wall M5.6 met over `1 + Σcⱼ` and M5.7 over a
// collision's ring — except that `0` is `0` in both normalisations. So this route REQUIRES a
// vanishing closed-contour value and vanishing piece limits, and refuses anything else by name. That
// is not a convenience: it is the empty singular set, which is the content of both records.
//
// **THE ATOM NEVER MOVES.** The solve works in the rank-1 module `A·(exponential basis)`: the matrix
// `M` is the record's own coefficient rows over ℚ, `r` is the imported value's basis part, and each
// unknown comes out as a rational combination of `Re(r)` and `Im(r)` — with `A` carried alongside,
// never inverted and never multiplied by another atom. `families/importedValue.ts` says why division
// is refused; here the consequence is that `combineOver` cannot be used, because the right-hand side
// is a MODULE over the field rather than an element of it.
import { Frac, Gauss, SqrtExt } from "@cas/exact";
import { LATEX, TEXT, type Notation } from "../kernel/notation.js";
import { exact, refuse, unknown, type Certificate, type Level } from "@cas/rigor";
import { parse } from "@cas/expr";
import { ExpSum, formatExpSum } from "../kernel/expSum.js";
import { Exponent } from "../kernel/exponent.js";
import { unitRoot } from "../kernel/unitRoot.js";
import type { ImportedAtom } from "../kernel/imported.js";
import { importedValue, type ImportedValue } from "./importedValue.js";
import { buildSystem } from "./system.js";
import type { Bindings } from "./system.js";
import { FRAC_FIELD } from "./field.js";
import { describeKernel, solveOver } from "./linear.js";
import type { SolvedValue } from "./solveTarget.js";
import type { Family, FamilyPiece } from "./schema.js";

/** One unknown this contour determines, as a multiple of the imported atom. */
export interface SolvedImport extends SolvedValue {
  readonly targetId: string;
  readonly atom: ImportedAtom;
  /**
   * The unknown divided by the atom, exactly — present when the closed form survived.
   *
   * Absent for the same reason `solveTarget`'s `text` is: an exponential with an exponent this basis
   * cannot evaluate leaves a real part that is not an element of it. F2 at `n = 5` is that case
   * (`e^{iπ/10}` needs `ℚ(ζ₂₀)`, degree 4 over ℚ), and the decimal stands.
   */
  readonly multiple?: ExpSum;
}

export interface ImportedSolveResult {
  readonly solved: readonly SolvedImport[];
  /** What the argument took on faith, per piece — rendered as the derivation's imported step. */
  readonly imports: readonly ResolvedImport[];
  /** One sentence per combination of unknowns this contour cannot see. Usually empty. */
  readonly invisible: readonly string[];
  readonly certificates: readonly Certificate[];
}

export type SolveImportedResult =
  | { readonly ok: true; readonly result: ImportedSolveResult }
  | { readonly ok: false; readonly reason: string; readonly certificate: Certificate };

export interface ImportedSolveInputs {
  /** The closed-contour value in units of π. Must be ZERO — see the header. */
  readonly closedContourPiUnits: ExpSum;
  /** The exact limits of the pieces that do not vanish. Must all be zero, for the same reason. */
  readonly pieceLimits: readonly { readonly pieceId: string; readonly contribution: ExpSum }[];
  /**
   * The record's imports, already RESOLVED — see {@link resolveImports}.
   *
   * Passed in rather than walked here because the ledger needs the same values one pass earlier, for
   * the KILL row that carries the import's `=`. Resolving twice would let the row and the answer
   * disagree about what was imported, which is the one thing a provenance claim must never do.
   */
  readonly imports: readonly ResolvedImport[];
  readonly bindings?: Bindings;
}

/** One piece's import, resolved at a binding. */
export interface ResolvedImport {
  readonly pieceId: string;
  readonly value: ImportedValue;
  /** The record's own provenance sentence — required, and rendered after "imported, not derived here". */
  readonly method: string;
  readonly rigor: Level;
  /** How the value reads: `e^(−289/400)·√π`. */
  readonly text: string;
  /** The same value typeset (M8 step 0.4b). */
  readonly latex: string;
}

/**
 * Every `knownValue` on this family's pieces, walked into `(import) × (basis)` at one binding.
 *
 * The ONE place a `knownValue` expression is interpreted. Both the ledger (through `runFamily`) and
 * Pass 5 read this, so "what does the row say was imported" and "what did the answer use" cannot
 * come apart.
 */
export function resolveImports(
  family: Family,
  bindings: Bindings,
): { readonly ok: true; readonly imports: readonly ResolvedImport[] } | { readonly ok: false; readonly reason: string } {
  const out: ResolvedImport[] = [];
  for (const piece of importedPieces(family)) {
    const declared = piece.knownValue;
    /* c8 ignore next */
    if (declared === undefined) continue;
    let value;
    try {
      value = importedValue(parse(declared.expr), bindings);
    } catch (e) {
      return { ok: false, reason: `piece '${piece.id}': '${declared.expr}' is not a readable expression: ${String(e)}` };
    }
    if (!value.ok) return { ok: false, reason: `piece '${piece.id}': ${value.reason}` };
    out.push({
      pieceId: piece.id,
      value: value.value,
      method: declared.method,
      rigor: declared.rigor,
      text: formatImported(value.value.coefficient, value.value.atom),
      latex: formatImported(value.value.coefficient, value.value.atom, LATEX),
    });
  }
  return { ok: true, imports: out };
}

/** The `free` pieces that carry an import — the shape half, needing no bindings and no residues. */
export function importedPieces(family: Family): readonly FamilyPiece[] {
  return family.contour.pieces.filter((p) => p.knownValue !== undefined);
}

/**
 * `e^{iqπ}` EVALUATED into the coefficient, for every term whose exponent is one.
 *
 * **The opposite contract to `ExpSum.foldSigns`, deliberately.** That one may only combine a radical
 * the coefficient already carries — M5.4's rule, which exists so D7's `17/4·e^{−iπ/4}` keeps its
 * visible magnitude of 4.25 rather than becoming `17√2/8 − 17i√2/8`. Here there is no choice to
 * preserve: the answer is `Re(e^{iπ/(2n)}·Γ(1+1/n))`, and a real part cannot be taken of a term whose
 * exponent is imaginary. So this introduces the radical, and it is the last step rather than a
 * normal form — nothing downstream reads the result but the realification.
 *
 * A term it cannot evaluate is left exactly as it was, which is how F2 at `n = 5` reaches the
 * decimal-only path instead of a wrong number.
 */
function evaluateUnitRoots(sum: ExpSum): ExpSum {
  let out = ExpSum.ZERO;
  for (const t of sum.terms) {
    const e = t.exponent;
    const q = e.algebraic.isZero() && e.log.isZero() && e.pi.re.isZero() ? e.pi.im : null;
    const root = q === null ? null : unitRoot(q.n, q.d);
    const scaled = root === null ? null : tryMul(t.coefficient, root);
    out = out.add(scaled === null ? ExpSum.of(t.coefficient, t.exponent) : ExpSum.of(scaled, Exponent.ZERO));
  }
  return out;
}

/** `SqrtExt.mul` as a decision — two different radicands leave the basis and produce nothing. */
function tryMul(a: SqrtExt, b: SqrtExt): SqrtExt | null {
  try {
    return a.mul(b);
  } catch {
    return null;
  }
}

/** Re or Im of `Σ cₖe^{βₖ}` when every `βₖ` is real, else null. The same split `solveTarget` takes. */
function realPart(sum: ExpSum, part: "re" | "im"): ExpSum | null {
  let out = ExpSum.ZERO;
  for (const t of sum.terms) {
    if (!t.exponent.isReal()) return null;
    const pick = (g: Gauss): Gauss =>
      part === "re" ? new Gauss(g.re, Frac.ZERO) : new Gauss(g.im, Frac.ZERO);
    out = out.add(ExpSum.of(SqrtExt.of(pick(t.coefficient.a), pick(t.coefficient.b), t.coefficient.d), t.exponent));
  }
  return out;
}

/** Solve the contour identity for every unknown, in the module generated by the import. */
export function solveImported(family: Family, inputs: ImportedSolveInputs): SolveImportedResult {
  const bindings = inputs.bindings ?? {};
  const no = (reason: string): SolveImportedResult => ({
    ok: false,
    reason,
    certificate: refuse("the targets", reason),
  });

  if (inputs.imports.length === 0) return no("no piece of this contour carries an imported value");

  // THE RING CHECK, and it is the record's own content. See the header.
  if (!inputs.closedContourPiUnits.isZero()) {
    return no(
      "this contour encloses a non-zero residue sum AND closes on an imported value: `2πi Σ Res` " +
        "carries π and an imported constant does not, and no ring in this app holds both",
    );
  }
  for (const limit of inputs.pieceLimits) {
    if (!limit.contribution.isZero()) {
      return no(
        `piece '${limit.pieceId}' contributes a non-zero limit in units of π, which cannot be added ` +
          "to an imported constant — no ring in this app holds both",
      );
    }
  }

  // They must be ONE atom: `a·√π + b·Γ(4/3)` is a rank-2 module.
  const imports = inputs.imports;
  let atom: ImportedAtom | null = null;
  let total = ExpSum.ZERO;
  for (const entry of imports) {
    if (atom !== null && atom.id !== entry.value.atom.id) {
      return no(
        `this contour closes on two different imported constants (${atom.text} and ` +
          `${entry.value.atom.text}); their span is a rank-2 module and this solve works in a rank-1 one`,
      );
    }
    atom = entry.value.atom;
    total = total.add(entry.value.coefficient);
  }
  /* c8 ignore next */
  if (atom === null) throw new Error("unreachable: at least one piece carried an import");

  const built = buildSystem(family, bindings);
  if (!built.ok) return no(built.reason);
  if (built.system.field !== "Q" || built.system.matrix.length === 0) {
    return no(
      "an imported solve needs a rational coefficient matrix: the unknowns are real and the two rows " +
        "are the real and imaginary parts of one contour identity",
    );
  }
  const system = built.system;

  // `M t = −Σ (imported values)`, realified. The atom divides out of BOTH sides — it is the module's
  // generator — so what is solved is the basis part and the atom is reattached at the end.
  const rhs = evaluateUnitRoots(total.neg());
  const re = realPart(rhs, "re");
  const im = realPart(rhs, "im");
  const numeric = rhs.toTuple();

  const report = solveOver(FRAC_FIELD, system.matrix, system.unknowns);
  const certificates: Certificate[] = [];
  const solved: SolvedImport[] = [];

  for (const d of report.determined) {
    const targetId = system.targetIds[d.column];
    // `Σ_row weights[row]·rhs[row]` — the module action, written out because `combineOver` takes a
    // right-hand side IN the field and this one is over it. Two rows, always: Re and Im.
    const value =
      d.weights.reduce((acc, w, row) => acc + w.toNumber() * (row === 0 ? numeric[0] : numeric[1]), 0) *
      atom.numeric;
    const multiple =
      re === null || im === null
        ? undefined
        : d.weights.reduce(
            (acc, w, row) => acc.add((row === 0 ? re : im).scale(SqrtExt.fromGauss(Gauss.rat(w.n, w.d)))),
            ExpSum.ZERO,
          );
    const text = multiple === undefined ? undefined : formatImported(multiple, atom);
    // The LaTeX sibling, so the derivation's `$I = …$` line typesets. Without it that line fell back
    // to `text` INSIDE its own delimiters and shipped `$I = e^(−1/4)·√π$` — delimited but in engine
    // notation, which KaTeX renders as upright letters and a raw `√`. Six of them, and the
    // balance check could not see any: they are balanced, they are just not LaTeX.
    const latex = multiple === undefined ? undefined : formatImported(multiple, atom, LATEX);
    certificates.push(
      multiple === undefined
        ? unknown(
            `${targetId}'s closed form`,
            "the imported value carries an exponential whose exponent this basis cannot evaluate, so " +
              "its real part is not an element of it; the decimal stands",
          )
        : exact(
            `${targetId} is ${text}`,
            "the contour encloses nothing, so the linear system reads $Mt = -\\sum(\\text{imported values})$, " +
              "split into its real and imaginary parts and solved exactly over $\\mathbb{Q}$",
          ),
    );
    solved.push({ targetId, atom, value, ...(text === undefined ? {} : { text }), ...(latex === undefined ? {} : { latex }), ...(multiple === undefined ? {} : { multiple }), certificates: [] });
  }

  // The import's own row — the claim and the reason it is believed, travelling together. The
  // quadrature cross-check lives on the ledger's KILL row instead, where the piece is, so a reader
  // meets the import and its corroboration in one place rather than two.
  for (const entry of imports) {
    certificates.push(
      exact(
        `the piece '${entry.pieceId}' is ${entry.text}`,
        `imported, not derived here — ${entry.method}`,
        { provenance: [{ ok: true, text: entry.value.atom.provenance }] },
      ),
    );
  }

  const invisible = describeKernel(FRAC_FIELD, report, system.targetIds);
  for (const sentence of invisible) certificates.push(unknown("an unknown of this system", sentence));

  return {
    ok: true,
    result: {
      solved: solved.map((s) => ({ ...s, certificates })),
      imports,
      invisible,
      certificates,
    },
  };
}

/**
 * `c·√π` — the basis part beside the atom, with the three degenerate coefficients read properly.
 *
 * **`0` is not `0·√π`.** A vanishing unknown has no import in it at all — F2's shape determines
 * `∫ℝe^{−x²}sin(bx)dx = 0` from the imaginary row — and printing the atom beside a zero says the
 * answer rests on something it does not. The parenthesis rule is the term COUNT rather than a scan
 * for a sign, since `e^(−289/400)` is one term carrying a minus inside its own exponent.
 */
export function formatImported(
  multiple: ExpSum,
  atom: ImportedAtom,
  n_: Notation = TEXT,
): string {
  const symbol = n_ === LATEX ? atom.latex : atom.text;
  if (multiple.isZero()) return "0";
  const one = multiple.asSqrtExt();
  if (one !== null && one.equals(SqrtExt.ONE)) return symbol;
  if (one !== null && one.equals(SqrtExt.ONE.neg())) return `${n_.minus}${symbol}`;
  const body = formatExpSum(multiple, n_);
  return n_.product(body, symbol, multiple.terms.length > 1);
}
