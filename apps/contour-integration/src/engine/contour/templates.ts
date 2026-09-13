// Contour templates: parameterised instances of the free substrate, not a separate kind of object.
//
// PLAN.md's round-2 answer was "templates on a free substrate", and this is what that means in code
// — a template returns an ordinary `Contour` whose geometry happens to reference named parameters,
// so it stays fully editable after loading and its `R` is the same store field whether you drag the
// handle or scrub the number in the derivation prose.
//
// The keyhole arrived with M4.2 and the dogbone with M4.6, because their pieces need the `side` tags
// that only mean something once branch cuts exist.
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

/**
 * The indented semicircle: `[−R, −ρ]`, a **clockwise** half-turn over the origin, `[ρ, R]`, and the
 * `R → ∞` arc. Two limit parameters, heading opposite ways.
 *
 * The indentation is the point of the template. A simple pole sitting exactly ON the path makes the
 * integral meaningless; detouring over it makes the contour legal again, EXCLUDES the pole from the
 * residue sum (`n(γ,0) = 0`), and — in the limit — contributes `iα·Res` with `α` the signed swept
 * angle. Here the arc runs `θ: π → 0`, so `α = −π` and the piece pays `−iπ·Res`: a FRACTION of
 * `2πi·Res`, fixed by geometry and never by taste.
 *
 * Note the two segments are both `target`. Neither is individually a multiple of the unknown — only
 * their sum is, which is the principal value — and Pass 5 uses only the sum of the coefficients, so
 * the split between them is a convention rather than a claim.
 */
export function indentedSemicircleTemplate(radius = 8, indent = 0.05): Contour {
  const pieces: Piece[] = [
    {
      id: "left",
      name: "the real axis, left of the indentation",
      geom: { kind: "segment", from: pt(ref("R", -1), 0), to: pt(ref("rho", -1), 0) },
      role: "target",
      colour: 0,
    },
    {
      id: "indent",
      name: "the ρ → 0 indentation over z = 0",
      // θ: π → 0 sweeps CLOCKWISE over the origin, which is what makes α negative.
      geom: { kind: "arc", center: pt(0, 0), radius: ref("rho"), theta0: Math.PI, theta1: 0 },
      role: "vanish",
      lemma: "L4",
      colour: 3,
    },
    {
      id: "right",
      name: "the real axis, right of the indentation",
      geom: { kind: "segment", from: pt(ref("rho"), 0), to: pt(ref("R"), 0) },
      role: "target",
      colour: 0,
    },
    {
      id: "bigarc",
      name: "the R → ∞ semicircle",
      geom: { kind: "arc", center: pt(0, 0), radius: ref("R"), theta0: 0, theta1: Math.PI },
      role: "vanish",
      colour: 1,
    },
  ];
  return {
    pieces,
    params: {
      R: param("R", radius, [0.5, 1e6], "log", { to: "inf" }),
      rho: param("rho", indent, [1e-9, 1], "log", { to: "0+" }),
    },
  };
}

/**
 * The keyhole: out along the upper lip of `[0,∞)`, round to the lower lip, back in, and round again.
 *
 * **THE LIPS LIE IN THE CUT, and the `side` tag is what tells them apart** — `model.ts` is explicit
 * that the tag pins "which limit is meant where the piece runs along a branch cut, never an
 * ε-offset". So `upper` and `lower` are the SAME segment of ℝ₊ traversed in opposite directions,
 * and they fail to cancel only because `z^{α−1}` returns multiplied by `e^{2πi(α−1)}`. Drawing them
 * a hair above and below would make the picture clearer and the mathematics wrong: the factor is a
 * statement about a limit, not about a small displacement.
 *
 * The two circles run `0 → 2π` and `2π → 0`, which is the whole reason the contour is legal: as a
 * path in ℂ∖Γ the outer one is an arc from the upper lip round to the lower one, not a closed loop,
 * and the net winding about the branch point at 0 is `+1 − 1 = 0`. A bare circle about the origin
 * has winding 1 and is refused — the cut is not optional there, it is unavoidable.
 *
 * D1 and D3 both supply their own pieces; this is the sandbox's copy, so a keyhole can be drawn and
 * dragged without opening a record.
 */
export function keyholeTemplate(outer = 4, inner = 0.15): Contour {
  const pieces: Piece[] = [
    {
      id: "upper",
      name: "the upper edge of the cut",
      geom: { kind: "segment", from: pt(ref("eps"), 0), to: pt(ref("R"), 0) },
      role: "target",
      side: "above",
      colour: 0,
    },
    {
      id: "outer",
      name: "the R → ∞ circle",
      geom: { kind: "arc", center: pt(0, 0), radius: ref("R"), theta0: 0, theta1: 2 * Math.PI },
      role: "vanish",
      lemma: "L2",
      colour: 1,
    },
    {
      id: "lower",
      name: "the lower edge of the cut",
      geom: { kind: "segment", from: pt(ref("R"), 0), to: pt(ref("eps"), 0) },
      role: "reproduces",
      side: "below",
      colour: 2,
    },
    {
      id: "inner",
      name: "the ε → 0 circle",
      geom: { kind: "arc", center: pt(0, 0), radius: ref("eps"), theta0: 2 * Math.PI, theta1: 0 },
      role: "vanish",
      lemma: "L1",
      colour: 3,
    },
  ];
  return {
    pieces,
    params: {
      R: param("R", outer, [0.5, 1e6], "log", { to: "inf" }),
      eps: param("eps", inner, [1e-9, 1], "log", { to: "0+" }),
    },
  };
}

/**
 * The dogbone: along the top of a bounded cut, round one end, back along the bottom, round the other.
 *
 * **IT ENCLOSES NOTHING, AND IS NOT ZERO.** That is the whole point of the shape, and D6's first trap
 * says it plainly: `n(D, ±ia) = 0` — the dogbone winds zero times about every pole — "and yet
 * `∫_D f = 2T ≠ 0`. The residue theorem's hypothesis is not 'no poles inside' but 'holomorphic inside
 * except at isolated singularities', and the CUT is inside." The identity that does apply is the one
 * for the EXTERIOR region, which contains ∞ — `engine/exteriorTheorem.ts`.
 *
 * **THERE IS NO OUTER CIRCLE HERE, and its absence is the claim.** D6 and D7 both list one, because
 * the classical derivation writes the composite cycle `γ = C_R(ccw) + crosscut + D_cw + crosscut-back`
 * and reads `∮γ = 2πi Σ Res` off it. Drawing that as a contour would be drawing two disjoint loops and
 * calling them one path — and it would make every winding number `1`, which is precisely the fact D6
 * exists to deny. So `C_R` is not a piece: it is `Res(f, ∞)`, exactly, and it appears as that row.
 * `∮_{C_R,ccw} f = −2πi·Res(f,∞)` is the definition of the residue at infinity, not an approximation
 * to it, so nothing is lost — D7's `|∮_outer| = 26.7` is still on screen, in the row that owns it.
 *
 * As with the keyhole, the two edges are the SAME segment traversed in opposite directions and the
 * `side` tag is what tells them apart; they fail to cancel because the branch factor returns
 * multiplied by its crossing phase. The traversal runs right along the TOP, which is clockwise about
 * the cut — convention O, and the sign the exterior identity is written in.
 *
 * Each end cap is a FULL turn, not a semicircle, for the same reason the keyhole's inner circle runs
 * `2π → 0`: the lips lie in the cut, so the arc leaves the upper lip at local angle `π` (resp. `2π`),
 * goes round the far side, and arrives at the lower lip having turned by `−2π`. Its two endpoints are
 * the same POINT and different LIPS, which is what makes the path closed and the classification
 * `endpoint` rather than an untagged crossing.
 */
export function dogboneTemplate(left = -1, right = 1, end = 0.12): Contour {
  const pieces: Piece[] = [
    {
      id: "top",
      name: "the upper edge of the cut, left to right",
      geom: {
        kind: "segment",
        from: pt(ref("eta", 1, left), 0),
        to: pt(ref("eta", -1, right), 0),
      },
      role: "target",
      side: "above",
      colour: 0,
    },
    {
      id: "endB",
      name: "the η-circle round the right branch point, upper lip to lower",
      geom: {
        kind: "arc",
        center: pt(right, 0),
        radius: ref("eta"),
        theta0: Math.PI,
        theta1: -Math.PI,
      },
      role: "vanish",
      lemma: "L1",
      colour: 3,
    },
    {
      id: "bottom",
      name: "the lower edge of the cut, right to left",
      geom: {
        kind: "segment",
        from: pt(ref("eta", -1, right), 0),
        to: pt(ref("eta", 1, left), 0),
      },
      role: "reproduces",
      side: "below",
      colour: 2,
    },
    {
      id: "endA",
      name: "the η-circle round the left branch point, lower lip to upper",
      geom: {
        kind: "arc",
        center: pt(left, 0),
        radius: ref("eta"),
        theta0: 2 * Math.PI,
        theta1: 0,
      },
      role: "vanish",
      lemma: "L1",
      colour: 3,
    },
  ];
  return { pieces, params: { eta: param("eta", end, [1e-9, 0.5], "log", { to: "0+" }) } };
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
