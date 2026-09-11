// Turn a Family record into a runnable `Contour`.
//
// This is the join between the corpus and the engine, and it is deliberately thin: the record's
// pieces already hold the runtime `Geom`, so nothing is translated here — only the parameter scope
// is assembled and the family-level fields (coefficients, bonus, lemma) are dropped, because they
// belong to Pass 5 and not to geometry.
import type { Contour, Param, Params, Piece } from "../engine/contour/model.js";
import type { Family } from "./schema.js";

/**
 * Where a limit parameter starts.
 *
 * A display default, not a claim. The residue-theorem value is INDEPENDENT of `R` once every pole
 * the family selects is enclosed — `familyGolden.test.ts` asserts exactly that by instantiating each
 * record at two widely separated radii and requiring the exact value to be identical — so this
 * number decides what the user first sees and nothing else. `0+` starts small for the same reason.
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
    params[p.name] = { name: p.name, value, range: [-10, 10], scale: "linear" };
  }

  for (const l of family.contour.limitParams) {
    params[l.name] = {
      name: l.name,
      value: values[l.name] ?? DEFAULT_LIMIT_VALUE[l.to],
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

/** The integrand a family's contour is integrated against — the auxiliary when one is declared. */
export function contourIntegrandOf(family: Family): string {
  if (family.auxiliary !== undefined) return family.auxiliary.integrand;
  const target = family.targets[0];
  if (target?.integrand === undefined) {
    throw new Error(
      `'${family.id}' declares neither an auxiliary integrand nor a target integrand, so there is ` +
        `nothing to integrate — a family whose unknown is a sum needs an auxiliary (tier G)`,
    );
  }
  // The target is written in its real variable; the contour integral is the same expression in z.
  return target.integrand.replace(new RegExp(`\\b${target.variable}\\b`, "g"), "z");
}
