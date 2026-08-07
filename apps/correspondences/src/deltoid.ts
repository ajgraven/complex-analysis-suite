// The deltoid Schwarz reflection — Milestone A. The classical UNBOUNDED quadrature domain Ω = ℂ \ K
// (K = the 3-cusped hypocycloid); φ: {|z|>1} → Ω is the Laurent polynomial φ(z) = z + 1/(2 z²), and
// σ(w) = conj(F(φ⁻¹(w))). The σ ENGINE now lives in @cas/schwarz (shared with Complex Dynamics;
// docs/design/SIGMA-HANDOFF.md, S2a) — this module keeps only the deltoid instance + boundary sampler,
// and re-exports the engine surface its consumers already import from here.
import {
  makeUnboundedLaurentSchwarz,
  type Complex,
  type UnboundedLaurentSchwarz,
} from "@cas/schwarz";

export type {
  Complex,
  UnboundedLaurentSchwarz,
  EscapeKind,
  EscapeResult,
  EscapeOptions,
} from "@cas/schwarz";
export { makeUnboundedLaurentSchwarz, escapeTime, pointInPolygon } from "@cas/schwarz";

/** The deltoid: c = 1, φ(z) = z + 1/(2 z²) (F₂ = ½, the only nonzero Laurent coefficient). The (c, F)
 *  are exported so the correspondence engine can build φ(w) = V from the same coefficients. */
export const DELTOID_C = 1;
export const DELTOID_F: readonly Complex[] = [
  [0, 0],
  [0, 0],
  [0.5, 0],
];
export const DELTOID = makeUnboundedLaurentSchwarz(DELTOID_C, DELTOID_F);

/** Sample the deltoid boundary ∂Ω = φ(|z|=1): the 3-cusped hypocycloid (cusps at the cube roots of
 *  unity — φ(1) = 1.5). Used as the polygon for the in-Ω test. */
export function deltoidBoundary(
  n = 512,
  schwarz: UnboundedLaurentSchwarz = DELTOID,
): Complex[] {
  const pts: Complex[] = [];
  for (let k = 0; k < n; k++) {
    const t = (2 * Math.PI * k) / n;
    pts.push(schwarz.evalPhi([Math.cos(t), Math.sin(t)]));
  }
  return pts;
}
