// @cas/dynamics — public surface. Exterior (inverse-Böttcher) Riemann maps of the complement of a
// filled Julia set for polynomial / rational / z^d+c maps, and of the multibrot connectedness locus:
// the Laurent coefficients that uniformize the exterior, the capacity (leading coefficient), and
// boundary reconstruction. Extracted from Complex Dynamics (ADR-0007 second-consumer rule: Riemann Map
// is the second consumer). Convention-neutral, on @cas/core + @cas/expr; the genesis of the long-planned
// domain package (ARCHITECTURE §3).
export {
  juliaExteriorCoeffs,
  polynomialJuliaExteriorCoeffs,
  rationalLaurentAtInfinity,
  rationalExteriorCoeffs,
  mandelbrotExteriorCoeffs,
  evalExterior,
  juliaConnected,
  reconstructBoundary,
} from "./uniformize.js";

// External-ray tracing (z² + c), extracted from Complex Dynamics (ADR-0014 follow-on). The bulb-angle
// combinatorics (`bulbRayAngles`) stays app-local in CD — it needs CD's orbit-portrait code.
export { parameterRay, dynamicRay, rayDepthForZoom, parseAngle } from "./rays.js";
export type { RayOptions } from "./rays.js";
