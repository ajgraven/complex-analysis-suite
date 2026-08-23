# Implementation log — 2026-08-23 review remediation

Execution of [`REMEDIATION-PLAN.md`](REMEDIATION-PLAN.md). All 8 work packages landed on
`claude/comprehensive-codebase-review-8g26az`, each with gates green (typecheck + lint + dep:check +
Vitest + build) before push. Test count grew 3197 → **3232** (+35 across the new regression tests).
Every `needs-review` behavior fix ships with a regression test; the two riskiest (QD live-race,
QD factoring honesty) were **negative-control-verified** (fail with the fix reverted).

| WP | Commit(s) | What landed |
|----|-----------|-------------|
| **WP1** | `05757f2` | `@cas/expr` GLSL peephole: float32-overflow guard + in-package codegen test; widened comment/perf-doc note. (MED #5) |
| **WP2** | `99c7a71` (+ revert `+…`) | Doc/comment currency: faber corner-image landmine (6 sites), README ADR cap, exterior-SC sign, sym-worker ops, seed RM+AP READMEs, STATE.md banner, param-slice log gate. |
| **WP3** | `52940fe` | **Extract `mapSpecToExpr` → `@cas/interchange`**, unifying the two guards CD lacked (CD now fails loudly, not NaN); ADR-0027; cross-consumer golden. (MED #1) |
| **WP4** | `870daa9` | Hoist `constExp`/`constReal` → `ast.ts` (JS↔GLSL fold-parity, one source). (MED #6) |
| **WP5** | `8e51819`/`b3ba407`/`ddcb1fb` | **5a** CD `fieldAt` periodicity early-out (perf regression + parity edge). **5b** QD live-vs-authoritative race — authoritative is the guaranteed last writer (neg-control verified). **5c** Berlekamp–Zassenhaus recombination cap surfaced honestly as `undetermined`, never a false `irreducible` (both halves neg-control verified). (MED #2/#3/#4) |
| **WP6** | `33263ff` | Honest-labeling seams: CD `compare()` BigInt-exact (neg-control on a real √2-convergent overflow); AP B4 readout reliability-gated; RM Ω→𝔻 hover ⚠ status + "≈ machine precision" prose + `polygonNonSimpleReason` ⚠ state. |
| **WP7** | `0836299` | `arccosh` principal branch (JS+GLSL); `Frac.toNumber` full-precision independent-shift rewrite; perturbation-oracle `escape2` param; shared `SCHWARZ_ESCAPE_DEFAULTS`; z^a parity doc. |
| **WP8** | `0dac3a8` | Interchange `View.c`/`bounded`/`weight` validation; correspondences sqrt-free escape + dead-config NITs; faber `c>0` guard + slider max; plotter `decodeState` clamps; CD `cabs2`/`binomial` NITs; perf-doc precision. |

## Deferred (documented, not implemented)

Kept out to stay low-risk / low-value at the end of the pass; all are LOW/NIT perf micro-opts in
complex interactive paths or cosmetic renames — none is a correctness issue:

- **AP** single `cumulativeArg` per `draw()` (recompute 4–6×/frame; negligible < res 300).
- **RM** defer the per-cell `activeDeriv` recolour to drag-release + skip dead line-style / numeric-source
  cell builds.
- **CD** `JuliaMetricsClient` send-side coalescing (already 350 ms-debounced upstream).
- **Faber** in-panel-drag `toCCW` normalization + a refusal-status cue (the sidebar editor already CCWs;
  a reflex-flipping in-panel drag currently just shows the ⚠-blank).
- **CD** `lastConnectivityRigorous` → `…FromCriticalOrbits` rename (multi-site incl. a worker message field).
- **correspondences** `family.ts` sqrt-free escape (needs an `abs²` on the abstract σ algebra).

## Not touched (deliberate deferrals confirmed still correct)

QD `sym-core`/`schwarz-common` merges (ADR-0008/0026), plotter↔AP winding/finder (ADR-0025), lstsq
twins (ADR-0018). The exterior-SC engine sharing the interior driver is by design, not duplication.
