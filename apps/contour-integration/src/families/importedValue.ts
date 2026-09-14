// A record's `knownValue.expr`, split into `(what this app imports) × (what it derived itself)`.
//
// ADR-0042's field is `{ expr, method, rigor }` — one expression, because that is how a reader writes
// the value down. This is the walk that decides which part of it the app is taking on faith, and it
// is deliberately a DECISION rather than a numeric evaluation: `@cas/expr` would happily hand back
// `-0.8605917395725560` for E3's top side, and an answer assembled from that decimal is `≈` however
// exactly it was known.
//
// **THE MODULE, AND WHY DIVISION IS REFUSED.** The output is `A·c` with `A` one member of
// `kernel/imported.ts`'s closed set and `c` an element of the app's own exponential basis — a rank-1
// module over that basis. Addition and scaling stay inside it; multiplication of two atoms and
// division by one do not, and both are refused by name rather than approximated. That is not a
// limitation working around a missing feature: nothing in the argument PRODUCES `√π`, so nothing in
// the argument can divide by it, and the arithmetic saying so is what "imported, not derived here"
// means when it is more than a label.
import { Frac, Gauss, SqrtExt } from "@cas/exact";
import type { Node } from "@cas/expr";
import { ExpSum } from "../kernel/expSum.js";
import { Exponent } from "../kernel/exponent.js";
import { gammaImport, type ImportedAtom } from "../kernel/imported.js";
import { exactBasisConstant } from "./basisConstant.js";
import type { Bindings } from "./schema.js";

/** `1` in the exponential basis — `c·e^{0}` with `c = 1`. */
const ONE = ExpSum.of(SqrtExt.ONE, Exponent.ZERO);

/** `A·c`: one imported atom times an element of the exponential basis. */
export interface ImportedValue {
  readonly atom: ImportedAtom;
  /**
   * The part the argument derived for itself — E3's `−e^{−b²/4}`, F2's `−e^{iπ/(2n)}`.
   *
   * It carries the SIGN and every factor the record wrote beside the import, so a solve never has to
   * know which half of the product came from where: it scales this and leaves the atom alone.
   */
  readonly coefficient: ExpSum;
  /** `A·c` as a decimal, for the quadrature cross-check. `≈`, as every decimal here is. */
  readonly numeric: readonly [number, number];
}

export type ImportedValueResult =
  | { readonly ok: true; readonly value: ImportedValue }
  | { readonly ok: false; readonly reason: string };

/**
 * How a leaf SPELLS an import, or null — the single recogniser {@link atomOf} and
 * {@link mentionsImport} both go through.
 *
 * **One place, because two would drift.** A mutation sweep found exactly that: relaxing `sqrt(pi)`
 * to any `sqrt` in the reader alone left the scanner still refusing `sqrt(2)` at the gate, so the
 * corpus stayed green while `sqrt(2)` had quietly become `√π` inside a larger product. The guard is
 * the ARGUMENT being exactly the constant, never the function name: `sqrt(2)` is an algebraic number
 * this app holds natively and `sqrt(pi)` is the one transcendental it takes on faith.
 */
function importSpelling(node: Node): { readonly fn: "sqrt-pi" } | { readonly fn: "gamma"; readonly arg: Node | undefined } | null {
  if (node.kind !== "call") return null;
  if (node.name === "sqrt") {
    const arg = node.args[0];
    return arg !== undefined && arg.kind === "const" && arg.name === "pi" ? { fn: "sqrt-pi" } : null;
  }
  return node.name === "gamma" ? { fn: "gamma", arg: node.args[0] } : null;
}

/** The atom a leaf names, or null when it names none. `null` is not a refusal — most leaves are not atoms. */
function atomOf(node: Node, bindings: Bindings): ImportedValueResult | null {
  const spelling = importSpelling(node);
  if (spelling === null) return null;

  if (spelling.fn === "sqrt-pi") {
    const found = gammaImport(Frac.of(1n, 2n));
    /* c8 ignore next */
    if (found === null) throw new Error("unreachable: Γ(1/2) is not a pole");
    return { ok: true, value: { atom: found.atom, coefficient: ONE, numeric: [0, 0] } };
  }
  const arg = spelling.arg;
  if (arg === undefined) return { ok: false, reason: "`gamma` was written with no argument" };

  // The argument must be an exact rational — `Γ` at an irrational argument is a different import and
  // is not in the closed set. `1 + 1/n` at F2's integer `n` is one; a dragged float would not be.
  const walked = exactBasisConstant(arg, bindings);
  if (!walked.ok) {
    return { ok: false, reason: `the argument of Γ is not an exact constant: ${walked.reason}` };
  }
  const algebraic = walked.value.asSqrtExt()?.asGauss() ?? null;
  if (algebraic === null || !algebraic.im.isZero()) {
    return {
      ok: false,
      reason:
        "the argument of Γ is not a real rational; the closed set of imports is the Gamma function " +
        "at a RATIONAL argument, and nothing else",
    };
  }
  const found = gammaImport(algebraic.re);
  if (found === null) {
    return {
      ok: false,
      reason:
        `Γ at ${algebraic.re.toNumber()} is not in the closed set: the import is Γ at a POSITIVE ` +
        "rational, since Γ has poles at the non-positive integers and its reflection below 1/2 is a " +
        "branch no record reaches",
    };
  }
  return {
    ok: true,
    value: {
      atom: found.atom,
      coefficient: ExpSum.of(SqrtExt.fromGauss(Gauss.rat(found.multiple.n, found.multiple.d)), Exponent.ZERO),
      numeric: [0, 0],
    },
  };
}

/** Does this subtree mention an import ANYWHERE? Used to name the refusal, not to accept the leaf. */
function mentionsImport(node: Node): boolean {
  if (importSpelling(node) !== null) return true;
  switch (node.kind) {
    case "neg":
    case "not":
      return mentionsImport(node.operand);
    case "arith":
    case "compare":
      return mentionsImport(node.left) || mentionsImport(node.right);
    case "call":
      return node.args.some(mentionsImport);
    case "if":
      return mentionsImport(node.cond) || mentionsImport(node.then) || mentionsImport(node.otherwise);
    default:
      return false;
  }
}

/**
 * The multiplicative leaves of an expression — the descent splits on `*` and `neg` and stops.
 *
 * Stopping is the point. A `/` is a leaf, so `exactBasisConstant` sees the whole quotient and an atom
 * inside one never becomes a factor of the answer; `mentionsImport` then turns what would be a
 * puzzling "unknown function" into the refusal the module's shape actually calls for.
 */
function leaves(node: Node, out: Node[], sign: 1 | -1): 1 | -1 {
  if (node.kind === "neg") return leaves(node.operand, out, sign === 1 ? -1 : 1);
  if (node.kind === "arith" && node.op === "*") {
    return leaves(node.right, out, leaves(node.left, out, sign));
  }
  out.push(node);
  return sign;
}

/**
 * `expr` as `A·c`, or a refusal naming what took it outside the module.
 *
 * EXACTLY ONE ATOM IS REQUIRED. Zero means the value is an ordinary element of this app's basis and
 * is not an import at all — a record claiming one there is describing its own arithmetic as faith,
 * which is the ADR's second error wearing the first's clothes. Two would be a rank-2 module, which no
 * record in the corpus is in and which `solveImported` has no arithmetic for.
 */
export function importedValue(expr: Node, bindings: Bindings): ImportedValueResult {
  // ASKED FIRST, and the ordering is the point. A `knownValue` of `2*pi` is a plausible mistake, and
  // walking its leaves first answers it with `exactBasisConstant`'s sentence about additive crossing
  // phases — true, and bewildering. The schema question comes before the arithmetic one.
  if (!mentionsImport(expr)) {
    return {
      ok: false,
      reason:
        "this value names no imported constant, so it is not an import — it is an element of this " +
        "app's own basis, and a piece carrying one should say where the contour derives it",
    };
  }

  const parts: Node[] = [];
  const sign = leaves(expr, parts, 1);

  let atom: ImportedAtom | null = null;
  let coefficient = sign === 1 ? ONE : ONE.neg();

  for (const leaf of parts) {
    const found = atomOf(leaf, bindings);
    if (found !== null) {
      if (!found.ok) return found;
      if (atom !== null) {
        return {
          ok: false,
          reason:
            `this value multiplies two imported constants (${atom.text} and ${found.value.atom.text}); ` +
            "their product is an element of a rank-2 module and no solve here works in one",
        };
      }
      atom = found.value.atom;
      const scaled = coefficient.mul(found.value.coefficient);
      /* c8 ignore next */
      if (scaled === null) throw new Error("unreachable: a rational multiple never conflicts on a radicand");
      coefficient = scaled;
      continue;
    }
    if (mentionsImport(leaf)) {
      return {
        ok: false,
        reason:
          "an imported constant appears inside a division or another function; an imported value has " +
          "no inverse here, because nothing in the argument produces it — write it as a factor",
      };
    }
    const walked = exactBasisConstant(leaf, bindings);
    if (!walked.ok) return { ok: false, reason: walked.reason };
    const product = coefficient.mul(walked.value);
    if (product === null) {
      return {
        ok: false,
        reason: "two factors of this value need different quadratic extensions, which this basis cannot hold",
      };
    }
    coefficient = product;
  }

  // The expression mentions an import, so some leaf either yielded one or refused above.
  /* c8 ignore next */
  if (atom === null) throw new Error("unreachable: mentionsImport was true and no leaf refused");

  const [re, im] = coefficient.toTuple();
  return { ok: true, value: { atom, coefficient, numeric: [re * atom.numeric, im * atom.numeric] } };
}
