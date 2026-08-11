# `@cas/conformal`

The **conformal-map builder** for the suite: given the boundary of a Jordan domain Ω, construct the
Riemann map to (and from) the unit disk 𝔻. It is the numerical engine behind the Riemann-map studio's
"forward numerical map 𝔻 → Ω" source, and the home the alternative conformal engines (Schwarz–Christoffel,
AAA, zipper — roadmap Tier 3) will be built into.

Strict TypeScript on [`@cas/core`](../core) (its Householder-QR least squares is the numerical workhorse
the fits stand on). Convention-neutral per
[ADR-0006](../../docs/DECISIONS.md#adr-0006-convention-neutral-core): no `π` / `2πi` normalization lives
here — this is plain complex approximation theory.

## Why it was extracted now (extract-*ahead*-of-demand)

Every other `@cas/*` package waited for a **second consumer** before extraction
([ADR-0007](../../docs/DECISIONS.md#adr-0007-incremental-extraction-driven-by-real-need)). This one does
**not** — the Riemann-map app is still its only consumer today. It is a **deliberate exception**
([ADR-0018](../../docs/DECISIONS.md#adr-0018-extract-casconformal-ahead-of-demand-lift-lstsq-into-cascore)):
the next roadmap step (Schwarz–Christoffel) is a *new conformal engine*, and the choice is to give it a
package to be born into rather than to build it inside the app and extract afterward. The seam is drawn
where the mathematics already is — the builder is pure, self-contained, and node-tested — so the risk of
a premature/wrong seam (the reason ADR-0007 exists) is low. See ADR-0018 for the full argument and the
revisit trigger.

## API

```ts
import {
  arnoldiBasis, evalArnoldi, evalExpansion, cabs,   // ./vandermondeArnoldi — the stable basis
  fitConformalMap, fitSmoothConformalMap,           // ./lightning  — f: Ω → 𝔻
  fitForwardMap,                                     // ./forwardMap — g: 𝔻 → Ω
} from "@cas/conformal";
import type { ArnoldiBasis, C, ConformalMap, ForwardMap } from "@cas/conformal";
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

## Consumers

- **Riemann Map** (`apps/riemann-map/src/main.ts`) — the forward-numerical-map source: pick a smooth region,
  fit `f` then `g`, and render the image of the disk's polar grid under `g`.
- **Anticipated: Schwarz–Christoffel** (roadmap step E) and the other Tier-3 engines — the reason for the
  ahead-of-demand extraction. The `corners?` parameter on `fitConformalMap` / `fitForwardMap` is already the
  hook they plug into.

## Tests

`test/vandermondeArnoldi.test.ts` (column-orthonormality of Q; exact reproduction of a low-degree polynomial
off the sample set), `test/lightning.test.ts` (the closed form `f(z)=z/R` for a disk; small residual on a
smooth ellipse; an off-centre circle), and `test/forwardMap.test.ts` (the unit disk → identity; a smooth
ellipse and off-centre circle staying finite, accurate, and inside Ω). The disk cases have closed forms, so
those assertions are tight; the smooth-region cases assert the `boundaryResidual` the method actually earns.
The Riemann-map app additionally exercises the builder over its real domain-preset library in
`apps/riemann-map/test/forwardMap.test.ts`.
