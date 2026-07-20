# `@cas/exact`

The **exact-arithmetic kernel** shared across the suite — the exact analogue of
[`@cas/core`](../core)'s numeric one. Where `@cas/core` works in floating point, this package
works in ℚ(i) over `BigInt`, so results are *decided*, not estimated.

Extracted per [ADR-0007](../../docs/DECISIONS.md#adr-0007-incremental-extraction-driven-by-real-need)
once Complex Dynamics became its second consumer — later than the original phase plan, which is
the rule working as intended rather than an oversight. Convention-neutral per
[ADR-0006](../../docs/DECISIONS.md#adr-0006-convention-neutral-core): no `π` / `2πi` normalization
lives here.

## Why exact

The suite makes claims that a float cannot support. "This curve has a cusp at exactly this point",
"this polynomial is irreducible", "there are exactly two real solutions" — each is a *decision*,
and a decision computed in floating point is an estimate wearing a decision's clothing. The
project's honest-labeling rule (`=` exact, `≤` rigorous bound, `≈` estimate) is only meaningful if
something can actually produce the `=`. That is this package.

## API

```ts
import {
  bigGcd, Frac, Gauss,          // ./gaussian — ℚ over BigInt, and ℚ(i)
  QiPoly,                       // ./qiPoly  — exact univariate over ℚ(i)
  BiPoly,                       // ./biPoly  — exact bivariate (outer var over QiPoly coeffs)
  bareissDet, discriminant, integerPrimitive, primitivePoly, resultant,   // ./resultant
  renderBiPolyText, renderGaussMag, renderQiPolyText,                     // ./render
} from "@cas/exact";
```

**`Frac` / `Gauss`** (`./gaussian`) — ℚ over `BigInt`, and ℚ(i) built on it. A *field*, so
division is exact and no step silently loses precision. `bigGcd` is the shared reducer.

**`QiPoly`** (`./qiPoly`) — exact univariate polynomials over ℚ(i): divmod, exact division,
Horner. The variable is deliberately **abstract** — it is `z̄` for a correspondence curve and `c`
for a Gleason polynomial, and the type does not care.

**`BiPoly`** (`./biPoly`) — exact bivariate polynomials: a polynomial in an outer variable whose
coefficients are `QiPoly`, with monic division. This is the layer Complex Dynamics' dynatomic
Φ<sub>n</sub>(z, c) needs.

**`resultant`** (`./resultant`) — Sylvester resultant and discriminant via fraction-free Bareiss
elimination over ℚ(i)[inner], plus content-clearing. Eliminates a variable between two curves:
the correspondence cusp locus, and CD's multiplier specialization.

**`render`** (`./render`) — shared coefficient/polynomial string formatting, so the two apps
display the same polynomial the same way.

## Consumers

- **Complex Dynamics** — `src/combinatorics/dynatomic.ts` (Gleason polynomials, dynatomic
  Φ<sub>n</sub>), surfaced in the UI via `src/main.ts`.
- **Correspondences** — `src/exact/correspondenceCurve.ts` (the exact deltoid correspondence
  curve and its cusps).

The Quadrature-Domains app's **runtime** does not use this package. Its Algebra module has its
own exact engine (`app/sym-core.mjs` — ℚ(i), `MPoly`, Gröbner/FGLM, Hermite, the factorizer),
which is older, larger, and multivariate. Consolidating the two was considered and rejected —
see [ADR-0008](../../docs/DECISIONS.md#adr-0008-extract-casexact-keep-qds-sym-core-separate) for
the four reasons and the revisit triggers.

QD does carry `@cas/exact` as a **devDependency**, for one purpose:
`vitest/exact-symcore-differential.test.ts` imports both engines into one process and asserts
they agree on a shared ℚ(i) corpus, comparing canonical `(n, d)` tuples rather than floats. Two
independent implementations of the same field are safe only while they agree, and that test is
what makes the disagreement loud instead of silent.

## Tests

`test/exact.test.ts` and `test/biPoly.test.ts` — golden values plus algebraic identities
(e.g. `resultant(f, g)` vanishing exactly when `f` and `g` share a root). Exactness makes these
assertions unusually strong: there is no tolerance to tune, so a regression cannot hide inside one.
