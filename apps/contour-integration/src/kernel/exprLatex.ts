// An `@cas/expr` expression, typeset — with this app's parameter-naming convention applied.
//
// M8 step 0.4b. The printing itself is `@cas/expr`'s `toLatex`; the one thing it cannot know is that
// a record's parameters are SPELLED for their Greek letters — `alpha`, `mu`, `xi` — so a variable it
// prints verbatim would render as five italic letters rather than as `α`. That is not the shared
// package's guess to make (a plotter's `a`, `b`, `c` are not Greek, and a user's variable named
// `eta` may not be either), so the convention lives in the app that has it.
//
// It sits in `kernel/` rather than beside the records because the ledger's own claims carry exact
// values too (`families/latex.ts` was its first consumer and `engine/ledger.ts` its second), and
// `engine` may not import `families`.
import { parse, toLatex, type Node } from "@cas/expr";

/** The Greek letters the gallery's parameters are named for. */
const GREEK = [
  "alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta", "iota", "kappa",
  "lambda", "mu", "nu", "xi", "rho", "sigma", "tau", "upsilon", "phi", "chi", "psi", "omega",
] as const;

// Applied to the PRINTED form rather than to the AST, and safe there because `toLatex` emits a
// variable as its bare name: the only other place these letters can appear is inside a control
// sequence it has just written, which the lookbehind excludes.
const GREEK_NAMES = new RegExp(`(?<![\\\\A-Za-z])(${GREEK.join("|")})(?![A-Za-z])`, "g");

/** Print an AST, with a parameter named for a Greek letter shown as one. */
export function printLatex(ast: Node): string {
  return toLatex(ast).replace(GREEK_NAMES, "\\$1");
}

/** Print an expression, or `null` when it is not one — a record's prose `simplified`, say. */
export function latexOf(src: string): string | null {
  try {
    return printLatex(parse(src));
  } catch {
    return null;
  }
}
