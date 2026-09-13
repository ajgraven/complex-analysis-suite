// What this app takes on faith, stated as data — ADR-0042's closed set of imports.
//
// Two records need a contour piece whose value is exactly known and **not derived by the contour**.
// E3's top side collapses to the real Gaussian and leaves `∫ℝ e^{−x²}dx = √π`, which is `Γ(1/2)` by
// polar coordinates; F2's return ray leaves `∫₀^∞ e^{−tⁿ}dt = Γ(1+1/n)`, which is the real
// substitution `u = tⁿ`. Neither is a residue, neither vanishes, and neither is proved by the
// argument the app is checking.
//
// **THE TWO ERRORS ARE OPPOSITE AND BOTH FATAL.** Pricing such a piece by quadrature caps a
// perfectly exact argument at `≈` by its most certain step — the inverse of the failure `@cas/rigor`
// exists to prevent. Letting it read `=` with nothing said launders an import as a derivation: `√π`
// becomes something this contour established, which it did not. The resolution is that the claim and
// the reason it is believed travel together, which is what every other certificate in this app
// already does, and that the set of things believed is a LIST rather than a string a record can
// invent.
//
// **THERE IS ONE IMPORT, AND THE TWO RECORDS NAME THE SAME FUNCTION.** E3's own record says so —
// "It is `Γ(1/2)`, a polar-coordinates fact" — so the closed set is the Gamma function at a rational
// argument, and `√π` is a SPELLING of `Γ(1/2)` rather than a second entry. That is not a
// convenience: it is what makes the independent check below cover both records at once.
//
// **AN IMPORTED VALUE HAS NO INVERSE, AND THAT IS THE ARITHMETIC OF "IMPORTED".** It generates a
// rank-1 module over the app's own exponential basis: a solve may add two of them and scale either
// by something it derived, and may never divide by one, because nothing in the argument produces it.
// `families/importedValue.ts` enforces exactly that, and `solveImported.ts` never leaves the module.
import { Frac } from "@cas/exact";
import { C } from "@cas/expr";
import type { Level } from "@cas/rigor";

/**
 * One member of the closed set — a transcendental this app believes without deriving.
 *
 * `id` is the identity a solve compares: two known values may be combined only when theirs MATCH,
 * since `a·√π + b·Γ(4/3)` is an element of a rank-2 module and no record in the corpus is in one.
 */
export interface ImportedAtom {
  readonly id: string;
  /** How it prints in an answer — `√π`, `Γ(4/3)`. */
  readonly text: string;
  /** Its value. The FORM is `=`; this decimal is `≈`, as every decimal in this app is. */
  readonly numeric: number;
  /** The sentence the derivation renders after "imported, not derived here". */
  readonly provenance: string;
  /**
   * The level the import justifies, which a record must DECLARE and MATCH.
   *
   * Narrowed to `=` in the type rather than left a `Level` and checked. Every member of the closed
   * set is a number known in closed form, so a ceiling test against `Level`'s top would assert
   * nothing and read as a guard while being one — the failure mode M5.7's sweep named. Narrowing
   * instead makes `solveImported`'s `exact(…)` correct by construction, and turns the day someone
   * adds an import that is only `≈` into a type error that forces the question rather than a silent
   * mislabel.
   */
  readonly rigor: Extract<Level, "=">;
}

/**
 * `√π` — `Γ(1/2)`, and the only atom the corpus reaches through the half-integer reduction below.
 *
 * Its value is `Math.sqrt(Math.PI)` rather than `C.gamma([0.5, 0])`, which is a real choice and the
 * accurate one: the Lanczos evaluation is 2.5e-16 relative away from the correctly rounded double,
 * and the reduction `Γ(k+½) = (2k)!/(4^k k!)·√π` is an exact identity, so every half-integer value
 * is computed from the better number. The Lanczos route is then free to serve as the CHECK.
 */
const SQRT_PI: ImportedAtom = {
  id: "sqrt(pi)",
  text: "√π",
  numeric: Math.sqrt(Math.PI),
  provenance:
    "Γ(1/2) = √π — the Gaussian ∫ℝ e^{−x²}dx = √π, established by polar coordinates, not by any contour",
  rigor: "=",
};

/**
 * `Γ(q)` at a rational `q`, split into an exact rational multiple of an ATOM.
 *
 * Three outcomes, and each is a statement rather than a case:
 *
 * - **`q` a positive half-integer** → `√π` with the multiple `(2k)!/(4^k k!)`. The recurrence
 *   `Γ(z+1) = zΓ(z)` walked down to `Γ(1/2)`, in exact ℚ. E3 lands here at `q = 1/2` (multiple 1)
 *   and F2 at `n = 2`, `q = 3/2` (multiple `1/2`) — which is why the two records share one atom and
 *   the F2 invariant `|T| = Γ(1+1/n)` is checkable against E3's own number.
 * - **`q` a pole** (`q ≤ 0` and integral) → `null`. `Γ` is not defined there and an import that does
 *   not exist must not acquire a value.
 * - **anything else** → its own opaque atom. `Γ(4/3)` is a transcendental that is not an algebraic
 *   multiple of `√π`, so carrying it symbolically is the honest thing and evaluating it is not.
 */
export function gammaImport(q: Frac): { readonly atom: ImportedAtom; readonly multiple: Frac } | null {
  if (q.d === 1n && q.n <= 0n) return null;

  // A positive half-integer: `q = k + 1/2` with `k ≥ 0`. Decided on the denominator, exactly.
  if (q.d === 2n && q.n > 0n) {
    const k = (q.n - 1n) / 2n;
    let multiple = Frac.ONE;
    // `Γ(k+½) = (k−½)(k−3/2)…(½)·Γ(½)`, accumulated in ℚ rather than through a factorial identity,
    // so the arithmetic is the recurrence itself and there is nothing to transcribe wrongly.
    for (let j = 0n; j < k; j++) {
      multiple = multiple.mul(Frac.of(2n * (k - j) - 1n, 2n));
    }
    return { atom: SQRT_PI, multiple };
  }

  const text = `Γ(${q.d === 1n ? `${q.n}` : `${q.n}/${q.d}`})`;
  return {
    atom: {
      id: text,
      text,
      numeric: C.gamma([q.toNumber(), 0])[0],
      provenance:
        `${text} = ∫₀^∞ t^{${q.d === 1n ? `${q.n - 1n}` : `${q.n - q.d}/${q.d}`}}e^{−t}dt — ` +
        "the Gamma function at a rational argument, established by the real substitution u = tⁿ and " +
        "not by any contour",
      rigor: "=",
    },
    multiple: Frac.ONE,
  };
}

/**
 * The whole closed set, as a list a reader can check — "what does this app take on faith?".
 *
 * One entry, because there is one. It is a function of a rational rather than a table of constants
 * (`Γ(4/3)` and `Γ(5/4)` are different numbers and the same import), which is what
 * {@link gammaImport} is; this names it, and a record reaching anything else is refused by name.
 */
export const IMPORTS: readonly { readonly name: string; readonly spelling: readonly string[]; readonly what: string }[] =
  [
    {
      name: "Γ(q) at a rational q",
      spelling: ["gamma(<q>)", "sqrt(pi)"],
      what:
        "the Gamma function, which a record may spell `gamma(3/2)` or — at q = 1/2 only — `sqrt(pi)`. " +
        "A positive half-integer reduces to an exact rational multiple of √π; anything else is carried " +
        "as its own symbol.",
    },
  ];

/**
 * `∫₀^∞ e^{−tⁿ}dt = Γ(1+1/n)`, by quadrature — the import checked against its own stated method.
 *
 * The one number this app believes, verified by arithmetic that shares nothing with the Lanczos
 * series that produced it: F2's `method` says the value comes from the real substitution `u = tⁿ`,
 * and this is that integral. It covers E3 too, since `Γ(1/2) = 2Γ(3/2) = 2∫₀^∞e^{−t²}dt = √π`.
 *
 * A midpoint rule on `[0, T]`: the integrand is smooth and positive with a `e^{−Tⁿ}` tail, so the
 * truncation is below float64 resolution at `T = 12` for every `n ≥ 1` and the error is the rule's.
 */
export function gaussianMomentByQuadrature(n: number, nodes = 400_000, T = 12): number {
  let sum = 0;
  for (let k = 0; k < nodes; k++) {
    const t = ((k + 0.5) * T) / nodes;
    sum += Math.exp(-(t ** n));
  }
  return (sum * T) / nodes;
}
