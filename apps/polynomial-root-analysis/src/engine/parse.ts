// A typed polynomial, read exactly — or refused by name (DESIGN §7's refusal posture).
//
// The text goes through @cas/expr's parser and @cas/exact's `toExactRational`, so `0.1z² − 1` is read
// as `z²/10 − 1` (the rational the reader meant) and anything that is not a polynomial with
// Gaussian-rational coefficients says why it is not.
import { QiPoly, toExactRational } from "@cas/exact";
import { parse, type Node } from "@cas/expr";
import { MAX_DEGREE, type Ring } from "./polynomial.js";

export type ParseResult =
  | { readonly ok: true; readonly exact: QiPoly; readonly variable: string }
  | { readonly ok: false; readonly reason: string };

function variables(node: Node, out: Set<string>): Set<string> {
  switch (node.kind) {
    case "var":
      out.add(node.name);
      break;
    case "neg":
    case "not":
      variables(node.operand, out);
      break;
    case "arith":
    case "compare":
      variables(node.left, out);
      variables(node.right, out);
      break;
    case "call":
      node.args.forEach((a) => variables(a, out));
      break;
    default:
      break;
  }
  return out;
}

/** Names that multiply when written next to something: the variables and the constants. */
const FACTOR_NAMES = new Set(["z", "x", "i", "pi", "e"]);
const TOKEN = /\s*(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?|[A-Za-z_]\w*|\S)/gy;

/**
 * Write the multiplications a reader leaves out: `20z`, `2(z+1)`, `(z+1)(z−1)`, `z(z+1)`, `2 z`.
 * @cas/expr's parser has no implicit multiplication (measured: every one of those is a syntax error
 * there), and a polynomial box that rejects `3z^2` is a box nobody can use. A `*` goes between two
 * tokens when the first ENDS a factor (a number, a variable or constant, `)`) and the second STARTS
 * one (a number, a name, `(`) — except before `(` after a function name, which is a call. A unary
 * `+`, which the parser also lacks, is dropped.
 */
export function insertImplicitProducts(text: string): string {
  const tokens: string[] = [];
  TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN.exec(text)) !== null) tokens.push(m[1]);
  const isNum = (t: string): boolean => /^[\d.]/.test(t);
  const isName = (t: string): boolean => /^[A-Za-z_]/.test(t);
  let out = "";
  tokens.forEach((t, i) => {
    const prev = tokens[i - 1];
    // A unary plus, which @cas/expr also lacks: `+z^2 - 1`, `(+3)`, `2*+z`.
    if (t === "+" && (prev === undefined || "(+-*/^,".includes(prev))) return;
    if (prev !== undefined) {
      const ends =
        isNum(prev) || prev === ")" || (isName(prev) && FACTOR_NAMES.has(prev));
      const starts = isNum(t) || isName(t) || t === "(";
      if (ends && starts) out += "*";
    }
    out += t;
  });
  return out;
}

/** Read `text` as a polynomial in `z` (or in `x`, when that is the one variable it names). */
export function parsePolynomial(text: string, ring: Ring): ParseResult {
  if (text.trim() === "") return { ok: false, reason: "there is no polynomial to read" };
  let ast: Node;
  try {
    ast = parse(insertImplicitProducts(text));
  } catch (e) {
    return {
      ok: false,
      reason: `this does not parse: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  const vars = variables(ast, new Set());
  const variable = vars.has("z") || !vars.has("x") ? "z" : "x";
  const read = toExactRational(ast, variable);
  if (!read.ok) return { ok: false, reason: read.reason };
  const { num, den } = read.value;
  if (den.degree() > 0)
    return {
      ok: false,
      reason: `this is a rational function of ${variable} with a non-constant denominator, not a polynomial`,
    };
  const exact = num.scale(den.coeff(0).inv());
  const n = exact.degree();
  if (exact.isZero() || n < 1)
    return {
      ok: false,
      reason: "a constant has no roots — the degree must be at least 1",
    };
  if (n > MAX_DEGREE)
    return { ok: false, reason: `degree ${n} is over this app's cap of ${MAX_DEGREE}` };
  if (ring !== "C") {
    for (let k = 0; k <= n; k++) {
      if (!exact.coeff(k).im.isZero()) {
        return {
          ok: false,
          reason: `the coefficient of ${variable}^${k} is not real, and ${ring === "R" ? "ℝ" : "ℚ"} mode keeps every coefficient real`,
        };
      }
    }
  }
  return { ok: true, exact, variable };
}
