// The unit-circle substitution `z = e^{iθ}` — how a real integral over `[0, 2π]` becomes a contour
// integral over `|z| = 1`.
//
// WHY THIS IS ENGINE CODE AND NOT A REWRITE CONVENIENCE. The substitution MANUFACTURES SINGULARITIES
// THE POSED INTEGRAND DOES NOT HAVE, and that is research 03 §1's "single commonest error" in the
// whole subject. `cos 2θ/(5 − 4cos θ)` is smooth at every real θ; the contour integrand it becomes
// has a pole of order exactly 2 at the origin, and an engine that runs pole detection on the posed
// integrand instead of on the substituted one returns `17π/12` where the answer is `π/6` — a factor
// of 8.5, from a pole that is invisible in the problem as stated (gallery A3).
//
// So the rule this module enforces is structural: **everything downstream sees only the contour
// integrand.** There is no path by which the θ-form reaches the pole finder.
//
// The three identities, all immediate from `z = e^{iθ}` and `z⁻¹ = e^{−iθ}` on `|z| = 1`:
//
//     cos kθ = (zᵏ + z⁻ᵏ)/2        sin kθ = (zᵏ − z⁻ᵏ)/(2i)        dθ = dz/(iz)
//
// Only integer `k` appears, because a fractional harmonic is not single-valued on the circle — it is
// a branch-cut problem (M4), not a substitution.
import { parse, type Node } from "@cas/expr";

const num = (value: number): Node => ({ kind: "num", value });
const zvar: Node = { kind: "var", name: "z" };
const I: Node = { kind: "const", name: "i" };
const arith = (op: "+" | "-" | "*" | "/" | "^", left: Node, right: Node): Node => ({
  kind: "arith",
  op,
  left,
  right,
});

/**
 * `z^k`, written so the numeric evaluator never sees a negative exponent.
 *
 * `z^(-2)` would go through complex `pow`, i.e. through `exp(−2 log z)` and its branch; `1/z^2` is
 * plain division. The exact reader treats the two identically, so this costs nothing there and keeps
 * the quadrature cross-check — the whole point of which is to share no machinery with the exact
 * route — free of a branch choice it has no reason to make.
 */
function zpow(k: number): Node {
  if (k === 0) return num(1);
  if (k > 0) return arith("^", zvar, num(k));
  return arith("/", num(1), arith("^", zvar, num(-k)));
}

/** The integer value of a node, when it has one. */
function constantInteger(node: Node): number | null {
  if (node.kind === "num") return Number.isInteger(node.value) ? node.value : null;
  if (node.kind === "neg") {
    const inner = constantInteger(node.operand);
    return inner === null ? null : -inner;
  }
  return null;
}

/**
 * The integer `k` for which `node ≡ k·θ`, or null.
 *
 * Null is the honest answer for anything else — `cos(θ²)`, `cos(1)`, `cos(sin θ − nθ)` — and the
 * caller refuses on it rather than inventing a rewrite. Note `k` is SIGNED and used as-is: `cos` is
 * even and `sin` is odd, and `(zᵏ − z⁻ᵏ)/(2i)` already carries that, so no sign case is needed.
 */
export function harmonicIndex(node: Node, theta: string): number | null {
  switch (node.kind) {
    case "var":
      return node.name === theta ? 1 : null;
    case "num":
      // A constant is a multiple of θ only when it is zero; `cos(1)` is a number, not a harmonic.
      return node.value === 0 ? 0 : null;
    case "neg": {
      const inner = harmonicIndex(node.operand, theta);
      return inner === null ? null : -inner;
    }
    case "arith": {
      if (node.op === "*") {
        const lc = constantInteger(node.left);
        const rc = constantInteger(node.right);
        if (lc !== null) {
          const k = harmonicIndex(node.right, theta);
          return k === null ? null : lc * k;
        }
        if (rc !== null) {
          const k = harmonicIndex(node.left, theta);
          return k === null ? null : rc * k;
        }
        return null;
      }
      if (node.op === "+" || node.op === "-") {
        const l = harmonicIndex(node.left, theta);
        const r = harmonicIndex(node.right, theta);
        if (l === null || r === null) return null;
        return node.op === "+" ? l + r : l - r;
      }
      return null;
    }
    default:
      return null;
  }
}

/**
 * The integer `k` for which `node ≡ i·k·θ`, or null — the exponent form of a harmonic.
 *
 * Written by flattening the product rather than by matching a shape, because `*` is left-associative
 * and `i*3*theta` parses as `(i*3)*theta`: neither operand of the top node is the `i`. Every factor
 * must be one of `i`, an integer, or `θ`, with exactly one `i` and exactly one `θ`.
 */
function imaginaryHarmonic(node: Node, theta: string): number | null {
  let coefficient = 1;
  let iCount = 0;
  let thetaCount = 0;
  let ok = true;

  const factor = (n: Node): void => {
    if (!ok) return;
    if (n.kind === "arith" && n.op === "*") {
      factor(n.left);
      factor(n.right);
      return;
    }
    if (n.kind === "neg") {
      coefficient = -coefficient;
      factor(n.operand);
      return;
    }
    if (n.kind === "const" && n.name === "i") {
      iCount++;
      return;
    }
    if (n.kind === "var" && n.name === theta) {
      thetaCount++;
      return;
    }
    const c = constantInteger(n);
    if (c === null) {
      ok = false;
      return;
    }
    coefficient *= c;
  };

  factor(node);
  if (!ok || iCount !== 1 || thetaCount !== 1) return null;
  return coefficient;
}

export type SubstitutionResult =
  | { readonly ok: true; readonly value: Node }
  | { readonly ok: false; readonly reason: string };

class Refusal extends Error {}

/**
 * Rewrite a θ-integrand into z, WITHOUT the Jacobian.
 *
 * Exported separately from {@link toContourIntegrand} so a test can see the two halves fail
 * independently: a wrong rewrite and a missing Jacobian both produce a wrong answer, and A3's
 * order-2 origin pole is assembled from one factor of each.
 */
export function substituteUnitCircle(integrand: Node, theta: string): SubstitutionResult {
  const walk = (n: Node): Node => {
    switch (n.kind) {
      case "call": {
        if (n.args.length === 1) {
          const arg = n.args[0];
          if (n.name === "cos" || n.name === "sin") {
            const k = harmonicIndex(arg, theta);
            if (k === null) {
              throw new Refusal(
                `${n.name}(…) has an argument that is not an integer multiple of ${theta}, so it is ` +
                  `not a single-valued function of z on the circle`,
              );
            }
            return n.name === "cos"
              ? arith("/", arith("+", zpow(k), zpow(-k)), num(2))
              : arith("/", arith("-", zpow(k), zpow(-k)), arith("*", num(2), I));
          }
          if (n.name === "exp") {
            const k = imaginaryHarmonic(arg, theta);
            if (k !== null) return zpow(k);
          }
        }
        // Any other call is left alone and its arguments rewritten — `exp(cos θ)` becomes
        // `exp((z + 1/z)/2)`, which is correct and which the exact reader will then refuse as
        // non-rational. Refusing here instead would be refusing too early.
        return { kind: "call", name: n.name, args: n.args.map(walk) };
      }
      case "var":
        if (n.name === theta) {
          throw new Refusal(
            `${theta} appears outside a trigonometric function; z = e^{i${theta}} inverts to ` +
              `${theta} = −i log z, which is multivalued and needs a branch cut, not a substitution`,
          );
        }
        return n;
      case "neg":
        return { kind: "neg", operand: walk(n.operand) };
      case "not":
        return { kind: "not", operand: walk(n.operand) };
      case "arith":
        return { kind: "arith", op: n.op, left: walk(n.left), right: walk(n.right) };
      case "compare":
        return { kind: "compare", op: n.op, left: walk(n.left), right: walk(n.right) };
      case "if":
        return {
          kind: "if",
          cond: walk(n.cond),
          then: walk(n.then),
          otherwise: walk(n.otherwise),
        };
      case "assign":
        return { kind: "assign", name: n.name, value: walk(n.value) };
      case "seq":
        return { kind: "seq", stmts: n.stmts.map(walk) };
      default:
        return n;
    }
  };

  try {
    return { ok: true, value: walk(integrand) };
  } catch (e) {
    if (e instanceof Refusal) return { ok: false, reason: e.message };
    throw e;
  }
}

/** Whether a declared `map` really is `z = e^{iθ}`, structurally rather than by string compare. */
export function isUnitCircleMap(mapSource: string, theta: string): boolean {
  let ast: Node;
  try {
    ast = parse(mapSource);
  } catch {
    return false;
  }
  if (ast.kind !== "call" || ast.name !== "exp" || ast.args.length !== 1) return false;
  return imaginaryHarmonic(ast.args[0], theta) === 1;
}

/**
 * The full contour integrand: the rewritten θ-form times the declared Jacobian.
 *
 * The Jacobian comes FROM THE RECORD rather than being hard-coded, so `jacobian: "1/(i*z)"` is a
 * load-bearing field and not a comment. What is hard-coded is the check that the declared `map`
 * really is `e^{iθ}` — a record declaring some other map must not silently inherit the cos/sin
 * identities, which hold only on the unit circle.
 */
export function toContourIntegrand(
  integrand: Node,
  theta: string,
  substitution: { readonly map: string; readonly jacobian: string },
): SubstitutionResult {
  if (!isUnitCircleMap(substitution.map, theta)) {
    return {
      ok: false,
      reason:
        `the declared map '${substitution.map}' is not z = e^{i${theta}}; the cos/sin identities ` +
        `this applies hold only on the unit circle`,
    };
  }

  const rewritten = substituteUnitCircle(integrand, theta);
  if (!rewritten.ok) return rewritten;

  let jacobian: Node;
  try {
    jacobian = parse(substitution.jacobian);
  } catch (e) {
    return {
      ok: false,
      reason: `the Jacobian '${substitution.jacobian}' does not parse: ${
        e instanceof Error ? e.message : String(e)
      }`,
    };
  }
  // A Jacobian mentioning θ would mean the substitution had not actually been carried out.
  if (mentions(jacobian, theta)) {
    return { ok: false, reason: `the Jacobian still mentions ${theta}` };
  }

  return { ok: true, value: arith("*", rewritten.value, jacobian) };
}

function mentions(node: Node, name: string): boolean {
  switch (node.kind) {
    case "var":
      return node.name === name;
    case "neg":
    case "not":
      return mentions(node.operand, name);
    case "arith":
    case "compare":
      return mentions(node.left, name) || mentions(node.right, name);
    case "call":
      return node.args.some((a) => mentions(a, name));
    case "if":
      return mentions(node.cond, name) || mentions(node.then, name) || mentions(node.otherwise, name);
    case "assign":
      return mentions(node.value, name);
    case "seq":
      return node.stmts.some((s) => mentions(s, name));
    default:
      return false;
  }
}
