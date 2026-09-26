# Verification: algebra slice (adversarial pass)

The verifier wrote its own probes (v1–v16, in `scratchpad/verify-algebra/`) and ran them against the real
store and the real prove-plan. It edited no tracked file.

## Verdicts

| ID | Verdict | Final severity |
|---|---|---|
| ALG-1 | CONFIRMED | P1 (reachability contrived) |
| ALG-2 | CONFIRMED-BUT-SEVERITY→P2 | P2 |
| ALG-3 | CONFIRMED-BUT-SEVERITY→P2 | P2 |
| ALG-4 | CONFIRMED | P1 |
| ALG-5 | CONFIRMED-BUT-SEVERITY→P2 | P2 |
| ALG-6 | CONFIRMED (label path); harm PLAUSIBLE | P2 |
| ALG-9 | CONFIRMED | P2 |
| ALG-12 | CONFIRMED, worse than reported | P2 |

## Evidence

### ALG-1: false "Irreducible over ℚ(i) ✓"
- **Reachability.** Typed input only: Add equation → Attempt to factor → "Irreducible over ℚ(i) ✓".
- **The cap is too small.** Each root pair spoils at most one shift, so deg² + 1 shifts always suffice. The code
  stops at 2·deg + 8.
- **QD systems do not plausibly hit it.** It needs at least 2·deg + 9 equal-real-part root pairs whose imaginary
  gaps cover the even integers. A search over ∏(x² + k²) found no example.

### ALG-2: exponential blow-up in gcd/factor (severity lowered to P2)
- The engine blow-up is real: a 9-term trivariate product does not finish `factor` in 90 s.
- The synchronous render paths are confirmed (`_factorInfo`, and `spuriousFactors` with no term cap).
- On presets (disk, cardioid, two-point-sym, triangle), the worst synchronous `factor` took 1.29 s. So a freeze
  needs a hand-typed trivariate.

### ALG-3: branch counts and decomposition prose (severity lowered to P2)
- The per-branch counts are right. Only the aggregation prose is wrong: the branches overlap, so their sum is an
  upper bound, not "adds up to the original".
- The components always cover V(I). So "may not cover" and "LOWER BOUND" point in the wrong direction.
- `complete:false` fires on a non-prime leaf even when no cap fired.

### ALG-4: shape-from-moments claims an exact order from float data
- 1/√2 data at full double precision gives order 2, with a spurious node.
- A 2-node case typed to 4 decimals gives order 3, with a phantom node.
- The residual is about 1e-16 in every case, so it cannot flag the error.
- The card claims "the exact QD-order" and an "exact" Prony polynomial.

### ALG-5: `=` pill on a rationalised boundary curve (severity lowered to P2)
- The `=` pill passes through unchanged while the coordinates are rationalised.
- An irrational QD can earn 'exact', so the case is reachable.
- The card's note does say "rationalized solution". That mitigation lowers the severity.

### ALG-6: `=` on "No real quadrature domain" without certification (harm plausible)
- **The label path is reproduced end to end.** `x^66+1` gives realCount null (the 64 cap), then a failed RUR,
  then a numeric solve, then "No real quadrature domain." with rigor 'exact' and an `=` shown.
- **No wrong answer was found.** Durand–Kerner either converges or refuses. So the `=` is unearned, but no wrong
  verdict was demonstrated.
- **The opposite error also exists.** The \|Im\| < 1e-4 filter counts complex roots at ±5e-5·i as real.

### ALG-9: factor() skips the squarefree step
- (x+y)²(x−y) comes back undetermined.
- x⁴y²(2y−3)²(xy+2)² returns a factor that is neither split nor squarefree, which breaks the "radical factors"
  contract.
- The reducible card hides the caps. There is no false irreducible.

### ALG-12: unbounded exponent freezes the tab (worse than reported)
- `z1^3000000` takes 1.6 s, and the cost is linear in the exponent.
- The preview parse is bound to the `input` event (algebra-ui.mjs:2140, :2144), so a 9-digit exponent freezes
  the tab on the keystroke.

## New items

### N1 [P1, arguably P0]: the proof tree treats every 'no-real' leaf as a certified empty set
`runProofTree` treats every 'no-real' leaf as determined-empty, whatever that leaf's own rigor.

- **Cause.** prove-plan.mjs:544 returns early on 'no-real'. `assembleTreeVerdict`'s `allExact` then ranges over
  the zero-dim leaves only, so with no zero-dim leaves it is vacuously exact.
- **Demonstrated with injected deps.** A leaf whose own verdict is "⚠ PARTIAL" (rigor 'partial') makes the tree
  report "No genuine quadrature domain." with `=`. The same happens for a realCount-null leaf.
- **Reachability.** The UI reaches this whenever the root system is positive-dimensional
  (algebra-ui.mjs:3303-3317).
- **Not demonstrated.** A real QD system triggering it was not constructed.
- **Fix.** Carry each leaf's rigor into the aggregate.

### N2 [P3]: `factor` gives up on trivially irreducible polynomials
- `factor` returns 'undetermined' on `x*y+z*w` and on QD's own disk (●) equations.
- A cheap certificate is available: a polynomial of degree 1 in some variable, with content 1 in that variable,
  is irreducible.
