// Turn a Family record into a runnable `Contour`.
//
// This is the join between the corpus and the engine, and it is deliberately thin: the record's
// pieces already hold the runtime `Geom`, so nothing is translated here — only the parameter scope
// is assembled and the family-level fields (coefficients, bonus, lemma) are dropped, because they
// belong to Pass 5 and not to geometry.
import { evaluate, parse, substitute, type Node } from "@cas/expr";
import type { Contour, Param, Params, Piece } from "../engine/contour/model.js";
import { toContourIntegrand } from "../engine/substitution.js";
import type { Family } from "./schema.js";
import type { Bindings } from "./system.js";

/**
 * Where a limit parameter starts.
 *
 * A display default, not a claim. The residue-theorem value is INDEPENDENT of `R` once every pole
 * the family selects is enclosed — `familyGolden.test.ts` asserts exactly that by instantiating each
 * record at two widely separated radii and requiring the exact value to be identical — so this
 * number decides what the user first sees and nothing else. `0+` starts small for the same reason.
 *
 * A record whose poles sit near this radius overrides it with `limitParams[].start`: the default
 * knows nothing about where a family's poles are, and one landing exactly ON the outer circle leaves
 * its winding number undecided, so the record would open refusing.
 */
const DEFAULT_LIMIT_VALUE = { inf: 4, "0+": 0.05 } as const;

const LIMIT_RANGE = {
  inf: [0.25, 1e6],
  "0+": [1e-6, 1],
} as const;

export interface InstantiateOptions {
  /** Override any parameter's starting value — the limit params included. */
  readonly values?: Readonly<Record<string, number>>;
}

/**
 * Build the parameter scope: the family's own `parameters`, plus the limit parameters its contour
 * declares. A limit parameter carries `limit`, which is what lets the UI animate `R → ∞` and what
 * lets the Ledger state an asymptotic conclusion rather than a single numeric bound (DESIGN §2.1).
 */
function buildParams(family: Family, values: Readonly<Record<string, number>>): Params {
  const params: Record<string, Param> = {};

  for (const p of family.parameters) {
    const value = values[p.name];
    if (value === undefined) {
      throw new Error(
        `instantiating '${family.id}': parameter '${p.name}' has no value and no default — ` +
          `a family parameter is a number with a domain, so the caller must supply one`,
      );
    }
    // The range is a UI hint, but it must at least CONTAIN the value it is given: A1's a = 10
    // fixture sat exactly on the old fixed [−10, 10] edge, and a fixture beyond it would have been
    // outside its own slider.
    const span = Math.max(10, Math.abs(value) * 2);
    params[p.name] = { name: p.name, value, range: [-span, span], scale: "linear" };
  }

  // Derived geometry values, computed from the parameters just bound. B1's arc flips half-plane
  // with sgn(a), and `Scalar` is affine — so the sign becomes a parameter of its own and the
  // geometry stays affine in it.
  for (const d of family.contour.derived ?? []) {
    const scope: Record<string, [number, number]> = {};
    for (const [name, p] of Object.entries(params)) scope[name] = [p.value, 0];
    let value: number;
    try {
      const got = evaluate(parse(d.expr), [0, 0], [0, 0], undefined, scope);
      if (typeof got === "boolean") throw new Error("a derived value must be numeric");
      value = got[0];
    } catch (e) {
      throw new Error(
        `instantiating '${family.id}': derived value '${d.name}' = '${d.expr}' did not evaluate: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
    const span = Math.max(1, Math.abs(value));
    params[d.name] = { name: d.name, value, range: [-span, span], scale: "linear" };
  }

  for (const l of family.contour.limitParams) {
    params[l.name] = {
      name: l.name,
      value: values[l.name] ?? l.start ?? DEFAULT_LIMIT_VALUE[l.to],
      range: LIMIT_RANGE[l.to],
      scale: "log",
      limit: { to: l.to },
    };
  }

  return params;
}

/** The record's pieces as runtime pieces — geometry and role, with the Pass-5 fields left behind. */
function buildPieces(family: Family): Piece[] {
  return family.contour.pieces.map((p) => ({
    id: p.id,
    name: p.name,
    geom: p.geom,
    role: p.role,
    // The lemma MUST travel. It is optional in the sandbox, where the ledger reads the right lemma
    // off the integrand's shape — but no shape test distinguishes an indentation from a closing arc
    // (in C1 they share a centre), so dropping it here silently sent L4's piece down the Jordan path
    // and the solved target came out 0 instead of π/2.
    ...(p.lemma !== undefined ? { lemma: p.lemma } : {}),
    ...(p.side !== undefined ? { side: p.side } : {}),
    colour: p.colour,
  }));
}

export function instantiate(family: Family, options: InstantiateOptions = {}): Contour {
  return {
    pieces: buildPieces(family),
    params: buildParams(family, options.values ?? {}),
  };
}

export type ContourIntegrandResult =
  | { readonly ok: true; readonly ast: Node }
  | { readonly ok: false; readonly reason: string };

/**
 * The integrand a family's contour is actually integrated against.
 *
 * Three things happen here, in this order, and the order matters:
 *
 * 1. **Parameters are bound to their fixture values.** `cos(n·θ)` is not a harmonic until `n` is a
 *    number, and `a + b cos θ` is not a rational function of `z` until `a` and `b` are.
 * 2. **The substitution is applied**, when the record declares one — and with it the Jacobian.
 * 3. Only then does anything downstream see an expression.
 *
 * **The auxiliary is PRE-Jacobian.** When a record declares `auxiliary`, that expression replaces
 * the target's integrand and the Jacobian is still applied on top of it. A4 is what pins this: its
 * θ-form `g(e^{iθ}) e^{−inθ}` complexifies to `g(z) z^{−n}`, and the record states the contour
 * integrand is `g(z)/(i z^{n+1})` — i.e. that times `dθ = dz/(iz)`. Writing an auxiliary with the
 * Jacobian already folded in would double it, silently, by a factor of `iz`.
 *
 * Step 3 is the invariant worth naming: **nothing downstream ever sees the θ-form.** The
 * substitution manufactures singularities the posed integrand does not have (A3's order-`n` pole at
 * the origin, from a real integrand that is smooth at every θ), so pole detection run on the posed
 * form is not slightly wrong, it is wrong by a factor of 8.5. Making this the only route to an
 * integrand is what prevents that, structurally rather than by remembering.
 */
export function contourIntegrandOf(family: Family, bindings: Bindings = {}): ContourIntegrandResult {
  const target = family.targets[0];
  const source = family.auxiliary?.integrand ?? target?.integrand;
  if (target === undefined || source === undefined) {
    return {
      ok: false,
      reason:
        `'${family.id}' declares neither an auxiliary integrand nor a target integrand, so there ` +
        `is nothing to integrate — a family whose unknown is a sum needs an auxiliary (tier G)`,
    };
  }

  let ast: Node;
  try {
    ast = parse(source);
  } catch (e) {
    return { ok: false, reason: `'${source}' does not parse: ${e instanceof Error ? e.message : String(e)}` };
  }

  // 1 — bind the declared parameters. Variant flags in a fixture (`halfRange`, `closeDown`) are not
  // parameters and are deliberately not consulted: only names the family declares are bound.
  for (const p of family.parameters) {
    const bound = bindings[p.name];
    if (bound === undefined) {
      return { ok: false, reason: `parameter '${p.name}' is unbound, so the integrand is not a function of z alone` };
    }
    const value = typeof bound === "number" ? bound : Number(bound);
    if (typeof bound === "boolean" || !Number.isFinite(value)) {
      return { ok: false, reason: `parameter '${p.name}' is bound to '${String(bound)}', which is not a number` };
    }
    ast = substitute(ast, p.name, { kind: "num", value });
  }

  // 2 — substitute, or simply read the real variable as z when the real line IS the contour.
  if (target.substitution !== undefined) {
    const substituted = toContourIntegrand(ast, target.variable, target.substitution);
    return substituted.ok ? { ok: true, ast: substituted.value } : substituted;
  }
  return { ok: true, ast: substitute(ast, target.variable, { kind: "var", name: "z" }) };
}
