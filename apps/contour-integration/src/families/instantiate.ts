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

/**
 * The range a limit parameter may be MOVED over — which is not always the range above.
 *
 * **A range is a claim about where the app will answer, and for tier G's `N` the default one is
 * false.** Found at M8 step 3.2, when the sweep gave `N` a ladder running to the range's top.
 * There are TWO walls above it and they are three and a half decades apart:
 *
 * 1. `analyse.ts` refuses a band wider than `MAX_KERNEL_BAND` (4096) rather than clamping it —
 *    deliberately, since a clamped window would let LEGALITY call a contour clear of singularities
 *    it runs straight through. That was the wall the first draft capped at.
 * 2. **The one that actually binds is COST, and it is not linear.** A single resolve of
 *    `series-cot-kernel` is 50 ms at `N = 128`, 179 ms at 256, 342 ms at 320, 700 ms at 384,
 *    2.2 s at 512 and **25.6 s at 1024** — doubling about every 64 past 256, because the exact
 *    residue sum's arithmetic grows with the number of poles AND with their digits. The draft
 *    budget does not touch it (25.5 s against 25.8 s at 1024): this is the exact half, not the
 *    quadrature. A ladder whose last rung is 4095 would take the better part of an hour in ONE
 *    commit, and the scrub and the rail slider can reach the endpoint too — so this is not a
 *    property of the new control. The rail slider has been able to hang the app at tier G since
 *    the record landed; nothing had ever dragged it there.
 *
 * So the endpoint is the furthest the app will answer at IN A FRAME, not the furthest it could
 * answer at given an hour. 256 is where the worst of the three records is still under 200 ms, which
 * is a slow commit and not a hang; 320 is already a third of a second and 384 three quarters.
 *
 * Keyed on `admits` because that is the field that says the parameter counts something the cost is
 * measured in; today that is exactly the kernel-band case and nothing else in the corpus sets it,
 * so a second constrained parameter of another kind is where this needs a second look.
 */
const MAX_SERIES_N = 256;

function limitRange(l: { readonly to: "inf" | "0+"; readonly through?: string }): readonly [number, number] {
  const [lo, hi] = LIMIT_RANGE[l.to];
  return l.through === "halfIntegers" ? [lo, Math.min(hi, MAX_SERIES_N)] : [lo, hi];
}

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
      range: limitRange(l),
      scale: "log",
      limit: { to: l.to },
      // **The one place the record's vocabulary meets the engine's.** `through: "halfIntegers"` is
      // a statement about tier G's CONTOUR — `Γ_N` has half-width `N + ½` — and `admits` is about
      // the number a control moves, which is `N`. Translating here rather than carrying the
      // record's word through is what keeps `squareTemplate`'s half out of every downstream reader.
      //
      // It was declared and DROPPED here until M8 step 3.2, which is when it started to matter:
      // measured over all three tier-G records, the sweep's first rung as interpolated (9.19) and
      // the scrub's first arrow press (4.03) both leave the lattice, and `kernel/bounds/squareSide.ts` refuses
      // every one of the four sides at such a width.
      ...(l.through === "halfIntegers" ? { admits: "integers" as const } : {}),
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
