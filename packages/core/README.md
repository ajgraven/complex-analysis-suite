# @cas/core

The suite's **pure numeric kernel** — complex arithmetic, a representation-generic algebra
contract, simultaneous polynomial root-finding, and truncated formal-series multiplication.
No DOM, no WebGL, and — deliberately — **no mathematical conventions**
([ADR-0006](../../docs/DECISIONS.md#adr-0006-convention-neutral-core-packages)): there are
no `π` / `2πi` normalization constants here, so a change for one app can't silently corrupt
another. This is the kernel at the bottom of the [dependency layering](../../docs/ARCHITECTURE.md#4-the-dependency-rule);
it depends on nothing.

Extracted in [Phase 3](../../docs/MIGRATION.md#phase-3--extract-cascore) as the shared
successor to the Quadrature app's `complex.js` / `taylor.js` and the several duplicated
Durand–Kerner copies across both apps.

## Install

Internal workspace package — consume it via `workspace:*`:

```jsonc
// an app's package.json
"dependencies": { "@cas/core": "workspace:*" }
```

`@cas/core` is built to `dist/` (its `exports."."` points at `./dist/index.js`), so the
root `pnpm build` / `pnpm test` scripts build it before its consumers run.

## API

```ts
import Complex, {
  objAlgebra,
  tupleAlgebra,
  makeDurandKerner,
  makeSeries,
} from "@cas/core";
import type {
  Cx,
  ComplexAlgebra,
  ComplexTuple,
  Series,
  DurandKernerResult,
} from "@cas/core";
```

**Complex arithmetic** (`Complex`, the default export) — object-representation `{re, im}`
(`Cx`) numbers: `add · sub · neg · mul · scale · div · inv · conj · abs · abs2 · arg · pow ·
cpow · eq`, constructors `c(re, im) · ZERO() · ONE() · I() · clone`, string `parse ·
toString · format`, and allocation-free in-place variants (`mulInto · addInto · subInto ·
scaleInto · addMulInto`) for hot loops.

**Representation-genericity** (`ComplexAlgebra<C>`) — the operations any complex
representation must provide (`make · re · im · add · sub · neg · mul · div · scale · abs ·
abs2 · isFinite`), with two reference instances so the same generic algorithm runs over
either layout the two apps use:

- `objAlgebra` — over `{re, im}` (`Cx`)
- `tupleAlgebra` — over `[re, im]` (`ComplexTuple`)

**Root-finding** — `makeDurandKerner(alg)` returns a simultaneous polynomial root-finder
over any `ComplexAlgebra`, returning `DurandKernerResult<C>` (`{ roots, converged,
iterations }`). Options cover tolerance, iteration cap, Jacobi vs. Seidel updates, and
coincident-root handling.

**Formal series** — `makeSeries(alg)` returns `{ zeros, unit, mul }` for truncated
power-series arithmetic (`Series<C>` = coefficient array, index `i` = coefficient of `xⁱ`).
`mul` is a plain convolution in the supplied algebra — deliberately so: both apps' multiplies are
bit-for-bit identical to it (same accumulation order), which is what let it be shared without
shifting either app's rounding. It does **not** use error-free splits, as this line previously
claimed.

**Stereographic projection** — `planeToSphere(z)` / `sphereToPlane(p)` map `ℂ ∪ {∞}` to and
from the Riemann sphere, with a cancellation-safe inverse. Shared by both apps' sphere views,
which is what earned it a place in the kernel (ADR-0007).

## What is _not_ here

By design (and per the kernel's own header comment): **no** Newton/deflation, **no**
`mat4`/camera helpers, **no** series `exp`/`log`/`compose`. The migration plan sketched
these for `core`, but no second consumer ever forced their extraction, so they stayed in
their originating apps — exactly the demand-driven rule of
[ADR-0007](../../docs/DECISIONS.md#adr-0007-incremental-extraction-driven-by-real-need). Add
them here the day a second app needs them, with golden tests, not before.

## Tests

`test/` — a golden-value corpus representing both apps' needs (`complex`, `durand-kerner`,
`series`, `sphere`). This corpus is what makes "fix a bug once" safe for a shared kernel.
