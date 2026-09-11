// Contour templates: parameterised instances of the free substrate, not a separate kind of object.
//
// PLAN.md's round-2 answer was "templates on a free substrate", and this is what that means in code
// — a template returns an ordinary `Contour` whose geometry happens to reference named parameters,
// so it stays fully editable after loading and its `R` is the same store field whether you drag the
// handle or scrub the number in the derivation prose.
//
// Six of the gallery's seven templates are here or trivially derived from these; the keyhole and
// dogbone wait for M4, since their pieces need the `side` tags that only mean something once branch
// cuts exist.
import type { Contour, Param, Piece, Scalar } from "./model.js";
import { pt } from "./model.js";

const param = (
  name: string,
  value: number,
  range: readonly [number, number],
  scale: "linear" | "log" = "linear",
  limit?: Param["limit"],
): Param => ({ name, value, range, scale, limit });

const ref = (name: string, mul = 1, add = 0): Scalar => ({ param: name, mul, add });

/**
 * A full circle of radius `R` about `centre`, positively oriented.
 *
 * The single most important template: it is the residue theorem's own contour, and — because the
 * pullback `f(z(t))z′(t)` is periodic on it — the one case where the trapezoidal rule is exact for
 * `∮dz/z` at every node count.
 */
export function circleTemplate(centre: readonly [number, number] = [0, 0], radius = 1): Contour {
  const pieces: Piece[] = [
    {
      id: "circle",
      name: "the circle |z − a| = R",
      geom: {
        kind: "arc",
        center: pt(centre[0], centre[1]),
        radius: ref("R"),
        theta0: 0,
        theta1: 2 * Math.PI,
      },
      role: "residue",
      colour: 0,
    },
  ];
  return { pieces, params: { R: param("R", radius, [1e-6, 1e6], "log") } };
}

/**
 * The upper-half-plane semicircular contour: the real segment `[−R, R]` followed by the arc.
 *
 * This is the shape behind gallery tiers A5–A7 and B1–B3, and the roles are already the ones the
 * Ledger will consume in M3 — the diameter is the `target`, the arc is what a lemma must `vanish`.
 */
export function semicircleTemplate(radius = 2, half: "upper" | "lower" = "upper"): Contour {
  const sign = half === "upper" ? 1 : -1;
  const pieces: Piece[] = [
    {
      id: "diameter",
      name: "the real axis [−R, R]",
      geom: {
        kind: "segment",
        from: pt(ref("R", -1), 0),
        to: pt(ref("R"), 0),
      },
      role: "target",
      colour: 1,
    },
    {
      id: "arc",
      name: `the R→∞ ${half} semicircle`,
      geom: {
        kind: "arc",
        center: pt(0, 0),
        radius: ref("R"),
        theta0: 0,
        theta1: sign * Math.PI,
      },
      role: "vanish",
      colour: 2,
    },
  ];
  return {
    pieces,
    params: { R: param("R", radius, [0.1, 1e6], "log", { to: "inf" }) },
  };
}

/** An axis-aligned rectangle, positively oriented, from two opposite corners. */
export function rectangleTemplate(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Contour {
  const corners: [number, number][] = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
  const pieces: Piece[] = corners.map((from, k) => {
    const to = corners[(k + 1) % 4];
    return {
      id: `side-${k + 1}`,
      name: ["bottom", "right", "top", "left"][k],
      geom: { kind: "segment", from: pt(from[0], from[1]), to: pt(to[0], to[1]) },
      role: "free",
      colour: (k % 6) as 0 | 1 | 2 | 3 | 4 | 5,
    };
  });
  return { pieces, params: {} };
}
