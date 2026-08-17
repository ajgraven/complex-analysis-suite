# `@cas/conformal`

The **conformal-map builder** for the suite: given the boundary of a Jordan domain Ω, construct the
Riemann map to (and from) the unit disk 𝔻. It is the numerical engine behind the Riemann-map studio's
"forward numerical map 𝔻 → Ω" source, and it now also hosts the **Schwarz–Christoffel** engine for
polygons (`fitSchwarzChristoffel`); the other alternative engines (AAA, zipper — roadmap Tier 3) are the
future tenants.

Strict TypeScript on [`@cas/core`](../core) (its Householder-QR least squares is the numerical workhorse
the fits stand on). Convention-neutral per
[ADR-0006](../../docs/DECISIONS.md#adr-0006-convention-neutral-core): no `π` / `2πi` normalization lives
here — this is plain complex approximation theory.

## Why it was extracted now (extract-*ahead*-of-demand)

Every other `@cas/*` package waited for a **second consumer** before extraction
([ADR-0007](../../docs/DECISIONS.md#adr-0007-incremental-extraction-driven-by-real-need)). This one did
**not** — at extraction the Riemann-map app was its only consumer. It is a **deliberate exception**
([ADR-0018](../../docs/DECISIONS.md#adr-0018-extract-casconformal-ahead-of-demand-lift-lstsq-into-cascore)):
the next roadmap step (Schwarz–Christoffel) was a *new conformal engine*, and the choice was to give it a
package to be born into rather than to build it inside the app and extract afterward. That engine has since
**landed in-package** (roadmap step E, ADR-0020) — the promised second consumer that retro-justifies the
extraction (see [Consumers](#consumers) below). The seam is drawn
where the mathematics already is — the builder is pure, self-contained, and node-tested — so the risk of
a premature/wrong seam (the reason ADR-0007 exists) is low. See ADR-0018 for the full argument and the
revisit trigger.

## API

```ts
import {
  arnoldiBasis, evalArnoldi, evalExpansion, cabs,   // ./vandermondeArnoldi — the stable basis
  fitConformalMap, fitSmoothConformalMap,           // ./lightning  — f: Ω → 𝔻
  fitForwardMap,                                     // ./forwardMap — g: 𝔻 → Ω
  fitSchwarzChristoffel,                             // ./scMap      — the SC map of a polygon
  buildForwardMap, solveParameterProblem,           // SC internals, if you want them directly
  gaussJacobi, integrateSegment,                    // the quadrature primitives
} from "@cas/conformal";
import type { ArnoldiBasis, C, ConformalMap, ForwardMap, Polygon, SCMap, SCOptions } from "@cas/conformal";
```

The public complex type is `C = [re, im]` (tuple representation).

**`vandermondeArnoldi`** — the Vandermonde-with-Arnoldi basis (Brubeck, Nakatsukasa & Trefethen 2021).
Arnoldi on the diagonal "multiply by z" operator produces orthonormal columns Q at the sample points plus
an upper-Hessenberg H that regrows the *same* basis at any new point, replacing the exponentially
ill-conditioned Vandermonde matrix. This is the numerically-stable substrate the fits are expressed in.

**`lightning`** — `f: Ω → 𝔻` by the lightning least-squares method (Gopal & Trefethen 2019):
`f(z) = z·e^{g(z)}` with `Re g = −log|z|` on ∂Ω, `g` fit in the Arnoldi basis plus rational terms
`1/(z − β)` whose poles cluster root-exponentially toward corners — which is what resolves the algebraic
boundary singularity a corner creates. `fitSmoothConformalMap` is the no-corners special case. Every result
carries a `boundaryResidual` (maxⱼ ‖f(zⱼ)|−1‖), the honest `≈` accuracy tag.

**`forwardMap`** — `g: 𝔻 → Ω`, fit *directly* from `f`'s boundary correspondence rather than by inverting
`f` pointwise (which is fragile near corners). This is the direction the studio's primary view needs — it
watches the disk's polar grid land on the region. Also `≈`, with its own `boundaryResidual`.

**`fitSchwarzChristoffel`** — the **Schwarz–Christoffel** map `f: 𝔻 → polygon` for a bounded simple polygon
(roadmap step E; [ADR-0020](../../docs/DECISIONS.md#adr-0020-schwarz-christoffel-engine-lightning-seeded-disk-canonical-two-mode)), `f(w) = A + C·∫₀ʷ ∏ₖ(1 − t/wₖ)^{αₖ−1} dt`. Two modes
share one honestly-flagged `SCMap` (Option A):

- **precise** (default) — the classical parameter-problem solve (`scParameterProblem`: softmax gap
  parametrization + damped Gauss–Newton, each step an `@cas/core` least-squares) followed by the exact SC
  forward map (`buildForwardMap`, side integrals via compound Gauss–Jacobi quadrature) and its **inverse**
  (`z → w` by the Driscoll–Trefethen ODE + Newton hybrid). Reaches machine precision on convex **and**
  reentrant polygons. Outputs the prevertices, the accessory constants `C = f′(0)` and `A = f(0)` (conformal
  centre), the quadrilateral **conformal modulus**, and an honest `residual`.
- **fast** — the lightning fit (Ω → 𝔻 with corner-clustered poles): instant, warm-startable, `converged:false`,
  the prevertices read off `f(vₖ)` for free. Reliable for convex/mild polygons (a few digits, honestly
  `≈`-tagged); it sets `degraded:true` when the fit is untrustworthy (strongly reentrant corners — a known
  limitation of the polygon lightning fit; use precise there). `warmStart` feeds a fast (or prior) solve into
  precise as its Gauss–Newton seed — the "drag with lightning, release to refine" continuation path.

Deferred (roadmap): CRDT for elongated/crowded polygons, unbounded/circular-arc variants, and
`@cas/interchange` serialization. (The **exterior** SC engine has since shipped — see the Faber
Transform consumer below.) See
[`docs/design/schwarz-christoffel-plan.md`](../../docs/design/schwarz-christoffel-plan.md).

## Consumers

- **Riemann Map** (`apps/riemann-map/src/main.ts`) — the forward-numerical-map source: pick a smooth region,
  fit `f` then `g`, and render the image of the disk's polar grid under `g`.
- **Schwarz–Christoffel** (`fitSchwarzChristoffel`, roadmap step E) — the second consumer that retro-justifies
  the ahead-of-demand extraction (ADR-0018 → [ADR-0020](../../docs/DECISIONS.md#adr-0020-schwarz-christoffel-engine-lightning-seeded-disk-canonical-two-mode)). It reuses the lightning fit
  (the fast mode, and — via `warmStart` — the optional precise seed; precise otherwise cold-starts uniformly)
  and `@cas/core`'s least squares (for the Gauss–Newton step).
- **Faber Transform** (`apps/faber-transform/src/polygon.ts`) — drives the **exterior** SC builder
  (`fitExteriorSchwarzChristoffel` + `exteriorMapLaurentAtInfinity`) to get the exterior map's
  Laurent-at-∞ jet for arbitrary convex/reentrant polygon domains K (M1b, ADR-0024, #279).
- **Anticipated:** the other Tier-3 engines (AAA, zipper) — future tenants of this package.

## Tests

`test/vandermondeArnoldi.test.ts` (column-orthonormality of Q; exact reproduction of a low-degree polynomial
off the sample set), `test/lightning.test.ts` (the closed form `f(z)=z/R` for a disk; small residual on a
smooth ellipse; an off-centre circle), and `test/forwardMap.test.ts` (the unit disk → identity; a smooth
ellipse and off-centre circle staying finite, accurate, and inside Ω). The disk cases have closed forms, so
those assertions are tight; the smooth-region cases assert the `boundaryResidual` the method actually earns.
The Riemann-map app additionally exercises the builder over its real domain-preset library in
`apps/riemann-map/test/forwardMap.test.ts`.

The Schwarz–Christoffel engine is validated against closed-form golden values: `test/gaussJacobi.test.ts`
(known Gauss–Legendre/Jacobi rules + polynomial exactness), `test/scQuadrature.test.ts` (regular-n-gon
integrals `(1/n)B(1/n,1−2/n)` + the compound rule beating a single panel near a singularity),
`test/schwarzChristoffel.test.ts` (regular n-gons; the square recovering conformal radius `2/K(1/√2)`),
`test/scParameterProblem.test.ts` (a scalene triangle, a pentagon from a skewed seed, a reentrant L-shape —
all reproduced to ≥10 digits), and `test/scMap.test.ts` (the two-mode `fitSchwarzChristoffel` API, warm start,
modulus, and the honest fast-mode `degraded` flag).
