# @cas/faber

The **exterior Faber transform** engine, shared across the suite. Extracted from the Quadrature Domains
app's `faber-analysis.mjs` under the ADR-0007 second-consumer rule (QD + the Faber-transform visualizer).

Given an exterior conformal map φ: 𝔻\* → Ω by its Laurent expansion at ∞,

```
φ(z) = c·z + c₀ + c₁/z + c₂/z² + …            // { c, laurent: [c₀, c₁, …] }
```

(the bounded complement is `K = ℂ∖Ω`), the package provides:

| Export | What it does |
|---|---|
| `faberPolynomials(map, N)` / `faberPolynomial(map, n)` | Faber polynomials F₀…F_N of K, via the three-term recurrence `c·F_{n+1} = (ζ−c₀)F_n − Σ c_k F_{n−k} − n·c_n`. |
| `faberTransform(map, taylor)` | The forward transform `Φφ(f)(w) = Σ b_n F_n(w)` from f's Taylor coefficients on the unit disk. Exact for polynomial input; the order-N truncation otherwise. |
| `polynomialRoots(coeffs, opts)` | Durand–Kerner (over `@cas/core`) + Newton polish; returns `converged:false` rather than garbage at ill-conditioned high degree. |
| `formatFaberPoly(Fn, opts)` | A readable ζ-expression, e.g. `"ζ² − 2"`. Exponents default to Unicode superscripts; pass `opts.sup` (e.g. ``(k) => `^{${k}}` ``) to emit markup a consumer typesets with real `<sup>`. |
| `faberConvergence(map, N)` | Per-order `{ n, converged, residual, roots }` report. |
| `weightedFaberPolynomial(s)` / `weightSeries` | Corner-suppressing weighted Faber polynomials `Q_{n,m} = Σⱼ gⱼ F_{n−j}` (M3, ADR-0024): the weight `G_m = ∏_k (1 − w_k/z)^{1/m}` on the SC prevertices `w_k = 1/u_k`. |
| `faberTransformRational` / `partialFractions` | Exact rational-image path — partial-fraction the input, then map each pole/monomial via the exterior-map jet. |
| `faberImageOfPole` / `exteriorMapJet` / `evalRationalImage` | Building blocks for the rational path (the exterior map's Laurent jet + per-pole images). |

**Input contract.** The engine takes a plain `{ c, laurent }` (an `ExteriorMap`), *not* any app's
conformal-map struct. Quadrature Domains adapts its solved φ via `phiLaurentAtInfinity`; the
Faber-transform app passes each curated preset's closed-form Laurent, or — for arbitrary polygon
domains K — a truncated **exterior** Schwarz–Christoffel Laurent (honestly `≈`-labeled).

**Convention-neutral (ADR-0006).** No π / 2πi normalization lives here — those stay at each app's edge.

**Dist-built (Flavor-B).** Emits `dist/` (`pnpm build`) because Quadrature Domains consumes it in **raw
Node** (its legacy node-test runner), which cannot load `.ts` source. Stands only on `@cas/core`.

Golden oracles: φ(z)=z ⇒ Fₙ=ζⁿ; φ(z)=z+1/z ⇒ Fₙ=2·Tₙ(ζ/2) (Chebyshev), so F₂=ζ²−2 and the F₆ roots are
`2cos((2k−1)π/12)` on `[−2,2]`. See `docs/design/faber-transform-plan.md`.
