# A5 — Parameter slice + worker / lazy-load / solve-orchestration infrastructure

## Scope covered

**Read end to end:** `app/param-slice/{README.md,param-slice-common.mjs,param-slice-pool.mjs,
param-slice-render.mjs,param-slice-ui.mjs}`; `app/workers/{protocol,solver-graph,
solver-worker-entry,param-slice-worker-entry,analysis-worker-entry,schwarz-worker-entry,
sym-worker-entry,worker-crash-detail}.mjs`; `app/lazy/*.mjs` + `app/lazy-features.mjs`;
`app/solvers/{prewarm,primary-solver-worker,primary-solution}.mjs`; `app/ui/ui-solve.mjs`
(orchestration only); `app/ui/ui-url-state.mjs` (for the slice's share-link gap);
`ARCHITECTURE.md`, `TODO.md`, the prior `A2-qd-solver-perf.md` + `docs/perf/qd-live-solver-review.md`.
Followed the chain down into `solvers/solver.mjs` `_computeIdentity` / `solver-qd.mjs`
`verifyQuadratureIdentity_QD` / `solver-uqd.mjs`'s adaptive escalation / `analysis/observables.mjs`
`estimateAccuracy`, because that is where the slice's classification actually comes from.

**Ran:** the QD headless suite; 7 Vitest specs in scope; 14 throwaway numeric/driver scripts in
`scratchpad/scratch/A5/` (parameter sweeps against known closed forms, a synthetic-pool driver for
`runAdaptive2D`, a worker-death driver, clean-realm import probes, timing harnesses).

**Prior finding re-checked and CLOSED (not re-reported):** A2's MED "live lane never invalidated at
drag-end". `ui/ui-solve.mjs:352-353` (WP5b) now bumps `_liveSolveToken` and clears `_liveDirty` at the
top of `solveAndRender`, and `vitest/ui-solve-orchestration.test.ts:266-311` pins it. Verified green.

**Not covered, honestly:** I did not drive the built app in a real browser (Playwright) — every
reproduction here is node-level against the same modules the workers import, and the two findings that
are browser-only in principle (PSW-3's real `Worker` death; the lazy-chunk 404) are reproduced at the
seam rather than in Chromium. I did not review `schwarz-worker-entry.mjs`'s content (lifecycle only, as
briefed) or `sym-worker-entry`'s payload (A4). I did not audit `primary-solution.mjs`'s publish
fan-out (A6 owns the consumers).

## Health

| command | result |
| --- | --- |
| `node app/node-test.js` | **2342 passed, 0 failed**, exit 0 (~4 min) |
| `vitest run vitest/{param-slice-pool,worker-entry,worker-protocol,worker-url-static-literal,ui-solve-orchestration,psw-lifecycle,psw-crash-char}.test.ts` | **7 files / 71 tests passed** (11.2 s) |
| `git status --short` | empty, before and after |
| worker-URL literal invariant (item 4) | **holds** — all 5 `new Worker(new URL('…literal…'))` sites, and all 5 entry chunks present in `dist/assets/` (`analysis-`, `param-slice-`, `schwarz-`, `solver-`, `sym-worker-entry-*.js`) |
| clean-realm invariant (item 4) | **holds and is wider than the test claims** — I imported `solver-graph.mjs` **+ `param-slice-worker-entry.mjs` + `analysis-worker-entry.mjs`** in a pristine node realm (no bootstrap globals) and ran one solve per classical/PQD/UQD/LQD/LQD-singular family plus all five analysis entry points: no `ReferenceError`. (`scratch/A5/clean2.mjs`) |

---

## Findings

### PSW-1 [CRITICAL] [confirmed] The slice's yellow "Identity fails" class is a quadrature artifact — 100% of it on two default presets, and on "Fast" the map has no green pixels at all

- **Where:** `app/param-slice/param-slice-ui.mjs:175-179` (`QUALITY_PRESETS`) → `:913-914`
  (`univalenceSamples: quality.univalenceSamples`, `identityTol`) → `app/param-slice/param-slice-common.mjs:427-431`
  (warm path: `verifyQuadratureIdentity(..., {numSamples: opts.univalenceSamples || 64})`) and
  `app/solvers/solver.mjs:1397-1404` `_computeIdentity` (cold path: `identitySamples ?? univalenceSamples`)
  → `app/solvers/solver-qd.mjs:272-273` `verifyQuadratureIdentity_QD` (`const N = options.numSamples ?? 500`,
  a **uniform trapezoid**, and — unlike `app/solvers/solver-uqd.mjs:436-449` — **with no `adaptiveSamples`
  escalation**).
- **What:** the pixel class `identity-fail` is decided by a fixed-node trapezoid whose convergence rate
  is set by how close φ's nearest branch preimage sits to `|z| = 1`. Near the univalence boundary that
  distance collapses, the required node count explodes, and the map paints **valid** quadrature domains
  yellow. On the shipped `two-point-sym` preset, both residues swept over the UI's **own default axis
  range** (`onAxisChange` sets min/max to `cur ∓ 1`, i.e. `[0.5, 2.5]`), 51×51 samples:

  | quality preset | pixels classed `identity-fail` | of which WRONG | % of the whole image wrong |
  | --- | --- | --- | --- |
  | Fast (N=32, tol 1e-5) | 2224 / 2601 — **and 0 pixels green** | 2218 | **85.3 %** |
  | Standard (N=128, tol 1e-6) — the default | 259 | 253 | **9.7 %** |
  | Rigorous (N=512, tol 1e-7) | 32 | 26 | 1.0 % |
  | N=2048 | 6 | 6 | 0.2 % |

  The last row is the point: **there is no genuine identity failure anywhere in this region.** All six
  N=2048 survivors converge to ≤ 2.0e-10 by N=8192–32768. And using the *predicted* node count
  (below) **2224 of 2224 solved pixels verify below 1e-6** — the true yellow count is **zero**.
  The same shape on the PQD side: on `pqd-1pt-a2` sweeping `C ∈ [3.2, 4.4]`, Fast gives
  `{identity-fail: 45, univalence-fail: 15, valid: 0}` where N ≥ 512 gives `{valid: 40, identity-fail: 20}`.
- **Evidence:**
  - `node scratch/A5/fp3.mjs` → the table above.
  - `node scratch/A5/conv.mjs` → per-point `maxRelDiff` vs N for the six N=2048 survivors, e.g.
    `C=(0.74,1.30)`: `1.02e0 1.04e0 1.09e0 1.23e0 1.11e0 8.13e-1 8.00e-2 7.70e-6` for
    N = 128…16384; contrast a well-conditioned pixel `C=(1.5,1.5)`: `3.92e-14` flat from N=128.
  - **Isolation (negative control):** `node scratch/A5/diag1.mjs` runs the same pixel under five option
    bags. Newton tolerance/maxIter and the phase set move **nothing** — `maxRelDiff = 8.781e-3` at
    `C=(1.04,1.04)` for `{it40,tol1e-9,direct+multistart}`, `{it80,tol1e-10}` and `{all five phases}`
    alike, with the Newton residual falling 4.19e-13 → 6.36e-16. Only `N` moves it: N=500 → **3.354e-14**.
  - **Mechanism, measured:** the required N is `≈ ln(1/tol) / ln(1/ρ)` with `ρ = maxⱼ|phi.branches[j].z|`.
    `node scratch/A5/char.mjs` + `rho.mjs`: `C=(0.74,1.30)` has `ρ = 0.99846` (critical point 2.7e-3 from
    `|z|=1`, max curvature 1.7e5) → predicted 14 944, observed 32 768; `C=(0.58,1.54)` `ρ = 0.99420` →
    3 959 vs 8 192; `C=(1.5,1.5)` `ρ = 0.618` → 48 vs 64. Predictor within 1.6–3× on all 8 probes.
  - `node scratch/A5/pred.mjs`: with `N = clamp(2^⌈log₂(4·ln(10¹²)/ln(1/ρ))⌉, 64, 65536)`,
    **2224/2224 solved pixels verify < 1e-6**; 2 pixels hit the 65536 cap and still pass.
- **Why it matters:** the parameter slice's entire product is a map of where quadrature domains exist.
  A class whose label asserts "the quadrature identity is not satisfied" is a mathematical claim, and it
  is false for every pixel that carries it here. On the Fast preset the map is inverted — nothing is
  green. Guardrail: honest labelling (`=`/`≤`/`≈`), and "wrong mathematics shown as certain".
  **This is not only a slice bug:** the Inverse tab shares the verifier (it uses `state.samples = 500`),
  so `h = 0.58/(w−1) + 1.54/(w+1)` opens with the status-panel badge reading **"⚠ Quadrature identity
  not satisfied"** on a domain whose residual is 2.0e-10 (`scratch/A5/inv2.mjs`).
- **Fix:** (a) port `solver-uqd.mjs:436-449`'s escalation into `verifyQuadratureIdentity_QD` — but note
  it would **not** rescue the worst case, because its `improved < 0.7×` break fires while the error is
  still in the pre-asymptotic plateau (`1.02 → 1.04 → 1.09 → 1.23`); (b) better and cheaper, size the
  node count from `ρ = maxⱼ|branches[j].z|` as above, which needs no extra evaluation because φ carries
  `z` already; (c) when the cap binds, report a distinct **`unresolved`** class rather than
  `identity-fail`, so the slice never asserts a failure the quadrature could not decide. Measured cost of
  (b) on the 51×51 grid: verify goes 0.046 → 0.272 ms/px (mean N 128 → 601), ≈ +59 % on a
  ~0.38 ms/px total — against removing 100 % of the false yellow. Pin with a test that sweeps
  `two-point-sym` across `[0.5,2.5]²` and asserts **zero** `identity-fail`.
- **Prior:** new. (`solver.mjs:1498-1506` documents the decoupling and says "bounded families and the
  param-slice fast preset keep their cheap, low-N identity check unchanged" — so the low-N choice was
  deliberate; that the low-N result is then *reported as a mathematical verdict* is the defect.)

### PSW-2 [HIGH] [confirmed] Family precondition refusals are painted as "Newton diverged" or "Unclassified" — and the colour depends on whether the family's NAME contains "singular"

- **Where:** `app/param-slice/param-slice-common.mjs:281` — `if (/iter|line search|jacobian|singular/i.test(err))
  return { cls: CLASS_NEWTON_DIVERGED, … }`, with the `capability-refused` bucket above it gated on
  `/\bnot yet implemented\b|\bdeferred to\b/i` (`:274`).
- **What:** the regex is matched against the whole error string, so it fires on the family NAME. Every
  `*_singular` family's input refusal is classed `newton-diverged` (**red**, "Newton diverged"), while the
  identical refusal from the non-singular twin falls through to `unclassified` (**magenta**, labelled
  "(debug)" in the legend). Reachable from the UI's own defaults: `onAxisChange` ranges an axis to
  `cur ± 1`, so sweeping `c` from a typical `c = 0.6` spans `[−0.4, 1.6]` and **5 of 21 columns sit at
  `c ≤ 0`**, which is not a conformal radius at all:

  ```
  unbounded               u u u u u v v v v v v v v v v v v v v v v     (u = magenta "Unclassified")
  pqd-unbounded           u u u u u n n n n n n n n n n u u u n n n
  pqd-unbounded-singular  R R R R R n n n v v i v v v v n n n n n n     (R = red "Newton diverged")
  lqd-unbounded-singular  R R R R R i i i i i i i i i i i i i i i i
  ```
  `c = −0.2` errors: `Family.unboundedQD: opts.c must be a positive number` → magenta;
  `Family.unboundedPQD_singular: opts.c must be positive` → **red**. Same mathematics, different colour,
  because one string contains the substring "singular".
- **Evidence:** `node scratch/A5/csweep.mjs` (the table above); `node scratch/A5/classif.mjs` feeds ten
  real solver strings straight to `PS.classifyResult` — 6/10 land in `newton-diverged` purely on the
  family name, including `solver-lqd-singular.js: solver.js must be loaded first` (a **module-load
  failure** reported as a Newton verdict).
- **Why it matters:** ~24 % of a default `c` slice is mislabelled, half the families one way and half the
  other. "Newton diverged" tells the user to raise the iteration budget; the truth is that the parameter
  is outside the family's domain. The `capability-refused` class exists for exactly this and is unused.
- **Fix:** stop classifying on prose. Give the thrown refusals a structured tag (`err.qdKind =
  'precondition' | 'capability' | 'newton'`) at the throw sites and switch on it; failing that, at minimum
  anchor the regex to the message tail after the last `: ` and add an explicit
  `/must be (a )?positive|must be nonzero|required|no quadrature data/i → capability-refused` branch
  ahead of the Newton branch. Pin with the ten-string table from `classif.mjs`.
- **Prior:** new (the HANDOFF #36 comment at `:276-280` claims this bucketing class was tightened; the
  family-name collision survived it).

### PSW-3 [HIGH] [confirmed] One worker dying mid-sweep aborts the whole render with a `TypeError`, contradicting the pool's own "the pipeline unwinds cleanly"

- **Where:** `app/param-slice/param-slice-pool.mjs:161-166` (`_onWorkerError` → `job.resolve(null)`) →
  `:110-113` (`solveBatch`'s `.then((results) => { if (!results) return; … })`, which leaves the dead
  chunk's slots **`undefined` holes** in `out`) → `app/param-slice/param-slice-render.mjs:176-179`
  (`storeResults`: `const cls = results[i].cls;` — unguarded) and, on the 1-D path,
  `app/param-slice/param-slice-ui.mjs:1019` (`PS.colorFor(results[col])`).
- **What:** `_onWorkerError`'s comment (`:150-155`) states the tile's pixels are "left unclassified rather
  than re-queued — best-effort, but the pipeline unwinds cleanly". They are not: the hole reaches
  `storeResults`, which throws `TypeError: Cannot read properties of undefined (reading 'cls')`. The
  throw escapes `runAdaptive2D`, is caught by `startRun`'s outer `try` (`:1048`), and the user gets
  `Render error: Cannot read properties of undefined (reading 'cls')` with the rest of the sweep
  abandoned — instead of a picture missing one chunk. Note `logErrorSamples` **is** hole-guarded
  (`param-slice-ui.mjs:995` — `if (r && r.errSample …)`), one line before the loop that is not.
  Same crash with zero surviving workers: `nChunks = Math.min(0, …) = 0` → the dispatch loop never runs
  → every slot undefined.
- **Evidence:** `node scratch/A5/crash1.mjs` — drives the real `runAdaptive2D` with a pool that returns
  exactly what `_onWorkerError` produces (one chunk of four resolved as `null`) → prints
  `THREW: TypeError: Cannot read properties of undefined (reading 'cls')`.
- **Why it matters:** a worker OOM or a structured-clone failure on one tile takes the whole cartography
  run down, on the one code path that was explicitly written to survive it.
- **Fix:** one line each — `const r = results[i]; if (!r) continue;` in `storeResults`, and
  `if (!results[col]) continue;` in the 1-D paint loop; leave those cells `UNKNOWN_CLASS` so the coverage
  fill and the "(no sample)" tooltip already handle them. Pin with `crash1.mjs` as a Vitest spec — the
  existing `vitest/param-slice-pool.test.ts:75-93` asserts the *promise* resolves to `null` but never
  hands that `null` to a consumer, so it pins the outcome without pinning the consequence.
- **Prior:** new.

### PSW-4 [MEDIUM] [confirmed] The Quality help text says Standard "matches the inverse tab's tolerance" — it matches the tolerance and not the sample count, and the sample count is what decides

- **Where:** `app/param-slice/param-slice-ui.mjs:596-600` ("`Standard` (N=128, tol=1e-6) matches the
  inverse tab's tolerance") vs `app/ui/ui.mjs:194-195` (`univalenceSamples: so.univalenceSamples ??
  state.samples`) and `app/ui/ui-state.mjs:59` (`samples: 500`). Same file `:594` claims Fast "may yield
  false-positive *identity-fail* pixels".
- **What:** the Inverse tab verifies at **500** nodes, the slice's Standard at **128**. PSW-1 shows the
  node count is the whole story, so the sentence tells the user the one thing that is not true of the
  preset. And "may yield false-positive pixels" understates Fast by a wide margin: Fast produced **zero**
  valid pixels on both families I measured.
- **Evidence:** the PSW-1 table; `scratch/A5/fp2.mjs` shows N=500 and N=512 give identical error counts
  (2/2601), so the gap is purely 128 vs 500.
- **Why it matters:** the help text is the only place the user is told how to read a yellow pixel.
- **Fix:** restate honestly — Standard uses **fewer** nodes than the Inverse tab and is a survey setting;
  say that yellow near a boundary should be re-checked at Rigorous or in the Inverse tab. Better: make
  the sample count adaptive (PSW-1 fix (b)) and retire the preset's N knob.
- **Prior:** new.

### PSW-5 [MEDIUM] [code] A warm-started pixel and a cold pixel are verified to different rigor, so the class can depend on the render's scan order

- **Where:** `app/param-slice/param-slice-common.mjs:36` (`UNIVALENCE_SAMPLES_CAP = 64`) and `:425`
  (`const uniN = Math.min(opts.univalenceSamples || 64, UNIVALENCE_SAMPLES_CAP)`) on the **warm** branch,
  against `app/solvers/solver.mjs:1526` (`isBoundaryUnivalent(sol.phi, univalenceSamples)`) on the
  **cold** branch, which uses the full preset N (up to 512). The identity check is *not* capped
  (`:428` passes the full N), so the two halves of one pixel's verdict disagree about rigor.
- **What:** whether a given pixel is warm-started is a property of the adaptive mesh — which pass it
  lands in and which neighbour `nearestPhi` (`param-slice-render.mjs:126-168`) happens to return — not a
  property of the parameter. So `univalence-fail` vs `valid` is, in principle, resolution- and
  order-dependent at the Rigorous preset (64 vs 512 samples). The cap's comment argues a coarse map
  resolves crossings fine at ≤64; that may be true, but it is asserted, not tested, and it is asserted
  only for the warm half.
- **Evidence:** code chain above. **I could not make it bite**: `scratch/A5/hyst1.mjs` and `hyst2.mjs`
  scan forward, backward and cold over two families and report **0 class differences in 61+41 points**;
  `scratch/A5/univN.mjs` finds `isBoundaryUnivalent(φ, 64)` and `(φ, 512)` agreeing on **84/84** solved
  PQD pixels (and 32 vs 512 likewise). So this is a real structural inconsistency with no observed
  consequence yet. **Closing experiment:** sweep a family with a shallow near-tangency of ∂Ω (an
  almost-touching two-lobe QD), render the same axes at n = 64 and n = 256, and diff the class grids
  resampled to the coarser resolution; any difference is this.
- **Why it matters:** a cartography map must be a function of the parameter, not of how it was drawn.
- **Fix:** drop the cap, or apply the same cap on both branches and say so in the legend. If the cap is
  kept for cost, record the sample count used per pixel and refuse to call a pixel `univalence-fail` at a
  lower count than the cold path would have used.
- **Prior:** new.

### PSW-6 [MEDIUM] [code] The 1-D sweep — which is the DEFAULT — has no per-pixel readout at all

- **Where:** `app/param-slice/param-slice-ui.mjs:1010-1024` (the 1-D branch never calls `runAdaptive2D`,
  so `sliceState.classGrid` / `iterGrid` / `gridDims` are never populated) → `:487-498` (`cellSummary`
  returns `null` unless `dims.n0 === colN && dims.n1 === rowN`) → `:466-478` (`hoverFormatter` prints
  "(no sample)") and `:350` (`refreshHoveredQDCard(null)` resets the card). `sliceState.nearestPhi`
  stays the previous 2-D render's closure, so the Hovered-QD preview and the live solve are dead too.
- **What:** the Y-axis picker defaults to `— (1-D sweep)` (`:151`), so this is what a first-time user
  gets. The hover tooltip always says "(no sample)", the mini-canvas always says "no cached φ", the live
  solve never fires, and the "Send to inverse" button is the only interaction. The classification is
  computed and painted but never stored, so the tooltip cannot name the colour.
  `sliceState.lastTiles` (`:41`, written at `:944`) is dead — nothing reads it.
- **Evidence:** code chain; `grep -rn lastTiles app/` returns only the declaration and the write.
- **Why it matters:** the tab's most-used mode is missing the readout that makes the map legible, and the
  README's Classification table implies otherwise.
- **Fix:** have the 1-D branch fill `classGrid` (n0 × 1) and `gridDims` the same way, and publish a
  trivial `nearestPhi` from the row's φs. ~20 lines, no new machinery.
- **Prior:** new.

### PSW-7 [MEDIUM] [code] The sidebar describes the LIVE scenario next to a picture of the OLD one, and click-to-load applies the pixel to the OLD one

- **Where:** `app/param-slice/param-slice-ui.mjs:71-81` (the `tab-changed` handler calls
  `refreshAxisOptions` / `refreshScenarioStatus` / `refreshQuadratureDataCard`, all of which read the
  **live** `snapshotScenario()`, and then `repaint()`s the **cached** `lastImageData`) vs `:940-942`
  (`lastScenario` is only written by `startRun`) and `:507-519` (`loadPixel` clones `lastScenario`).
- **What:** render a slice → go to the QD tab → change a residue → come back. The "Base scenario" and
  "Quadrature data" cards now show the new `h(w)` and the axis labels are re-derived from it, while the
  canvas still shows the old sweep. Clicking a pixel loads the **old** `h(w)` with the new axis value
  applied, under a sidebar that says otherwise. The intro card's "Re-open this tab after editing to
  refresh the axis options" (`:113-115`) is exactly the gesture that creates the mismatch.
- **Evidence:** code chain; nothing compares `snapshotScenario()` to `sliceState.lastScenario` anywhere
  (`grep -n lastScenario app/param-slice/param-slice-ui.mjs`).
- **Why it matters:** silently hands the user a domain that is not the one the picture is about.
- **Fix:** on tab activation, hash the snapshot (`hData` + `norm` + `mode`) and compare with the one
  `startRun` stored; on mismatch grey the canvas and set the progress line to "the QD tab changed —
  re-render". Cheap and it needs no new state beyond the stored hash.
- **Prior:** new.

### PSW-8 [MEDIUM] [code] The Inverse tab computes `trustedSignal: 'geometry'` for a near-cusp solution and then ignores it in the validity badge

- **Where:** `app/analysis/observables.mjs:249-263` (`nearCusp` / `trustedSignal`) vs
  `app/ui/ui-solve.mjs:32-49` `qdValidityBadge`, which branches only on `sol.univalent` /
  `sol.identityOK` / `sol.univalenceCertified`.
- **What:** for `h = 0.58/(w−1) + 1.54/(w+1)` the app computes `nearCusp = true`, `cuspDistance =
  9.3e-3`, `trustedSignal = 'geometry'` — and the badge still reads **"⚠ Quadrature identity not
  satisfied"**, because the badge never looks. The honest hedge exists but lives in a different card
  (`renderObservables`, `ui-solve.mjs:960-967`) that is rendered by a *later, idle* analysis pass. So the
  headline verdict contradicts the app's own conclusion about which signal to trust.
- **Evidence:** `node scratch/A5/inv2.mjs` — three points with `nearCusp=true`, `badge.cls='warn'`,
  `badge.text='⚠ Quadrature identity not satisfied'`, against identity residuals of 2e-10 at N=8192.
- **Why it matters:** honest-labelling guardrail, on the app's single most prominent claim.
- **Fix:** give `qdValidityBadge` the near-cusp flag and emit a distinct verdict — e.g.
  `⚠ Quadrature domain — identity check under-resolved near a cusp; verdict from geometry` — rather than
  asserting the identity fails. (Pairs with PSW-1 (c): the slice needs the same third state.)
- **Prior:** new.

### PSW-9 [MEDIUM] [confirmed] `estimateAccuracy.underResolved` — the one guard built for PSW-1's failure mode — cannot fire in the regime it exists for

- **Where:** `app/analysis/observables.mjs:277-282` —
  `if (relN > 1e-9 && relN > 16 * rel2N) out.underResolved = true;`
- **What:** the rule assumes the doubling is already in the geometric-decay regime. Below the resolution
  cliff the trapezoid error is O(1) and doubling barely moves it (or moves it the wrong way), so the
  ratio test fails exactly when under-resolution is worst.
- **Evidence:** `node scratch/A5/inv2.mjs`, N = 600/1200:
  `C=(0.58,1.54)` relN 1.38 / rel2N 0.505 → ratio 2.7 → `underResolved: false`;
  `C=(0.74,1.30)` relN 1.11 / rel2N **1.19** (error grew) → `underResolved: false`;
  `C=(0.66,1.42)` relN 0.601 / rel2N 0.0417 → ratio 14.4, just under the 16 gate → `false`.
  All three are under-resolved by five to ten orders of magnitude.
- **Why it matters:** it is the only automatic honesty check on the identity verdict, and it reports
  "resolved" on the worst cases. The "accuracy: ≈ 0.0 sig. digits" line is printed with no warning.
- **Fix:** invert the test — flag `underResolved` whenever `relN > identityTol` **and** the pair has not
  demonstrated convergence (`rel2N > relN/1000`, say), i.e. treat "not yet decided" as the default and
  require evidence of a converged, genuinely non-zero limit before reporting a failure. Better, use
  PSW-1's `ρ`-based required-N. `cross-app`-adjacent: `analysis/observables.mjs` is QD-local but is
  consumed by the analysis worker and the status panel.
- **Prior:** new.

### PSW-10 [LOW] [confirmed] The "brightness ∝ 1/iter" channel is partly a record of how the pixel was solved, not of the parameter

- **Where:** `app/param-slice/param-slice-common.mjs:298-309` (`k = 1 / (1 + iter / 20)`, `bg = 32`) and
  the iteration source: `:451` (warm: `ns.iterations`) vs `:462-467` `_wrapFullSolve` (cold:
  `p.iterations`, which is **0** for a direct algebraic solve). Consumed as a refinement trigger at
  `app/param-slice/param-slice-render.mjs:40` (`REFINE_ITER_DELTA = 8`) via
  `param-slice-common.mjs:511-534` `cellIsHomogeneous`.
- **What:** two renders of the same parameter point give different brightness depending on whether that
  pixel landed cold or warm — `iterations = 0` for a cold direct solve (`h = 1/w`: measured `it=0`),
  3–14 for the warm Newton at the same point. Measured on the two-point family, cold vs warm on the same
  11 parameter values: iteration counts `4 vs 3` / `4 vs 5`, i.e. ΔG = ±5/255 (≈2 % of the green
  channel). The same quantity drives `REFINE_ITER_DELTA`, so the mesh spends samples on a uniform region
  whose iteration counts differ only because half of it was seeded.
- **Evidence:** `node scratch/A5/bright.mjs`; `scratch/A5/probe0.mjs` for `iterations = 0`.
- **Why it matters:** small visually, but it is the only quantitative channel on the map and it is not a
  function of the parameter. The README (`app/param-slice/README.md:69`) and the legend
  (`param-slice-ui.mjs:249`) both present it as convergence difficulty.
- **Fix:** either colour by something parameter-intrinsic (the Newton residual, or `1 − ρ` where
  `ρ = maxⱼ|z_j|` — which is the conditioning the user actually wants to see, and PSW-1 shows it is the
  meaningful quantity), or normalise by always reporting the cold-equivalent iteration count.
  Also correct the README/legend formula: it is `1/(1 + iter/20)` over a `bg = 32` floor, not `1/iter`.
- **Prior:** new.

### PSW-11 [LOW] [confirmed] `runSweep` and the per-worker scenario cache are dead weight in production

- **Where:** `app/param-slice/param-slice-pool.mjs:185-215` (`Pool.runSweep`) and `:307-338`
  (`MainThreadPool.runSweep`); the scenario cache at `:74-84` (`worker._loadedScenarioId`) and `:52`
  (`nextScenarioId`).
- **What:** `grep -rn runSweep app/` finds **no production caller** — the 1-D path uses `solveBatch`
  (`param-slice-ui.mjs:1015`) and the 2-D path uses `solveBatch` through `dispatchPoints`
  (`param-slice-render.mjs:212`). Only `vitest/param-slice-pool.test.ts:179` drives it. The scenario
  cache is likewise inert for the adaptive path: `solveBatch` allocates a **new** `scenarioId` per call
  (`:101`) and gives each worker at most one chunk (`nChunks = min(workers, points)`), so `sendScenario`
  is true on every pass for every worker. It only ever saved bytes for `runSweep`, which nothing calls.
- **Evidence:** the grep above; `README.md:44` documents `runSweep` as public surface.
- **Why it matters:** ~90 lines of untested-in-production concurrency code, plus a test suite whose two
  `runSweep` specs give false confidence about the path the app takes.
- **Fix:** delete `runSweep` from both pools and the cache along with it, or move the 1-D path onto
  `runSweep` (it is the better fit — per-row progress) and keep one. Update `README.md:40-46`.
- **Prior:** new.

### PSW-12 [LOW] [code] Axis range defaults are parameter-blind: they propose `c ≤ 0` and `w₀` through the origin

- **Where:** `app/param-slice/param-slice-ui.mjs:681-698` (`onAxisChange` sets min/max to
  `(cur ∓ 1).toFixed(3)` for every `ParamRef` kind alike).
- **What:** `c` is a conformal radius and must be positive; `w₀` must be an interior point of Ω and is
  refused at 0 (`solver-pqd.mjs:650-654`, `Complex.abs2(w0) < QD.ZERO_THRESHOLD`). The default range
  puts both outside their domain for a large fraction of the sweep — see PSW-2's table, where 5/21
  columns are `c ≤ 0`.
- **Evidence:** `scratch/A5/csweep.mjs`; the guard at `solver-pqd.mjs:650`.
- **Fix:** add a `domain` field to `ParamRef` (`{min: 0, exclusive: true}` for `cReal`, a
  punctured-at-0 hint for `w0Re`/`w0Im`) and clamp the defaults; a one-line addition to each descriptor
  in `listAvailableParams`.
- **Prior:** new.

### PSW-13 [LOW] [code] A failed lazy chunk leaves a silently blank tab; a tab-toggle during load replays activation twice

- **Where:** `app/lazy-features.mjs:19-31` (`load` — `console.error` then rethrow) and `:33-45` (the
  `tab-changed` handler, whose `.catch(() => {})` swallows it).
- **What:** if `import('./lazy/param-slice.mjs')` rejects (a 404 chunk behind a stale service-worker
  precache, or an offline first visit to that tab), the user gets an empty `#controls-param-slice` with
  no message and no retry affordance — only a console line. Separately, `loaded.has(tab)` is only set
  *after* resolution, so switching away and back during the load registers a second `.then` on the same
  pending promise and dispatches the synthetic `tab-changed` **twice**; `param-slice-ui.mjs`'s handler is
  idempotent for mounting (`sliceState.mounted`, `_clickAttached`) but re-runs `refreshAxisOptions` /
  `refreshQuadratureDataCard`, which rebuild the `<select>`s and can lose an in-progress selection.
  (VitePWA precaches `**/*.js` with `registerType: 'autoUpdate'` — `vite.config.mjs:57-60` — so the
  stale-chunk case is narrow, not impossible.)
- **Evidence:** code chain; the double-replay is structural in `pending`/`loaded`'s ordering.
- **Fix:** render a retry card into the tab's control root on rejection (the module that owns the root is
  not loaded, so `lazy-features` must do it); and mark `pending`-but-not-`loaded` before attaching the
  replay so only the last activation replays.
- **Prior:** new.

### PSW-14 [NIT] [code] The live-lane pre-warm fires on any first pointerdown, including one that cannot lead to a drag

- **Where:** `app/solvers/prewarm.mjs:30-32` — `document.addEventListener('pointerdown', warmLive,
  { once: true, capture: true })`.
- **What:** the rationale (`:11-18`) is that a pointerdown is "the start of their first gesture", but the
  listener is on `document` with capture, so clicking the Parameter-slice tab button or its **Render
  slice** button spawns the live drag worker and parses the ~20-module solver graph on a tab that has no
  drag at all — while up to 16 slice workers are spawning.
- **Fix:** scope the listener to the plot canvas / pole grid, where a drag can actually start.
- **Prior:** new.

---

## Structural observations

- **The slice runs a different solver from the Inverse tab, and nothing says so.**
  `param-slice-ui.mjs:909-926` builds `{numRestarts: 1, newton: {maxIter: 40, tolerance: 1e-9},
  usePhases: {direct, multistart}}` with continuation / diverse / deflation **off**; the Inverse tab's
  default is `{numRestarts: 8, newton: {maxIter: 80, tolerance: 1e-10}}` with all five phases on
  (`ui.mjs:180-205` + `ui-modes.mjs:383-389`). The measured effect on the classification is **nil** for
  the families I swept — `scratch/A5/disagree.mjs` finds **0 class differences in 441 pixels** once the
  sample counts are matched, and `cmp1.mjs` shows the fold boundary landing identically — so the weak
  preset is a legitimate trade. But "No algebraic root" (grey) is a certainty claim made by a one-restart
  search, and the README (`param-slice/README.md:73`) states it as `solveInverseQD returned success:false
  after all stages`, which is true of the *slice's* stages and not of the ones the user just saw in the
  Inverse tab. Better: rename the class "No root found (survey search)" and say in the legend that the
  Inverse tab searches harder.
- **Classification boundaries themselves are right, and that is worth recording.** Two closed-form
  controls: the one-node QD `h = C/w` is a disk iff `C > 0` and the class flips exactly at `C = 0`
  (`scratch/A5/sweep1.mjs`, checked at ±1e-3); the cardioid family `h = 1.5/w + C₂/w²` maps to
  `φ(z) = a₁z + a₂z²` with `(C₁,C₂) = (a₁² + 2a₂², a₁²a₂)`, whose fold and univalence boundary coincide
  at `C₂ = 0.5` (`max_{a₂} a₂(1.5 − 2a₂²) = 0.5` at `a₂ = 0.5`, `a₁ = 1`) — the app's last valid sample is
  `C₂ = 0.5000` returning `A = (1.00001, 0.49999)`, i.e. exactly `z + z²/2`, and the boundary is located
  to better than 0.005 (`scratch/A5/card.mjs`, `fp2.mjs`). The mathematics of the classifier is sound;
  every finding above is about how the verdict is *verified* or *labelled*.
- **Warm-start's payoff is family-dependent and the code overstates it.**
  `param-slice-render.mjs:232-236` and `:252-260` claim "~0.03 ms" warm against "~5.6 ms for PQD" cold
  (187×). Measured with a JIT warm-up and best-of-3 (`scratch/A5/timing2.mjs`, `pqdtime2.mjs`):
  classical bounded family **1.00–1.22×** (0.381 → 0.383 ms/px at N=128); `pqd-1pt-a2` in a mostly-valid
  band **4.6×** (2.853 → 0.625 ms/px). Real, but an order of magnitude short of the comment.
- **`param-slice-worker-entry.mjs` is the one worker entry that does not use `workers/protocol.mjs`.**
  It hand-rolls `self.onmessage` (`:15-41`) where the solver / analysis / (and partly sym) entries go
  through `dispatch` (`protocol.mjs:32-45`). It therefore also lacks the "unhandled kind replies with an
  error" fix the protocol module exists for: a `kind !== 'tile'` message is silently dropped
  (`:18`) and the caller's promise never settles — the exact QD-UI-4 hang the module's header describes.
  There is only one kind today, so it is latent; folding it in costs ~10 lines and removes the exception.
- **`Pool.cancel()` settles pending tiles but lets in-flight ones complete and resolve with real
  results** (`param-slice-pool.mjs:139-146`). That is currently safe only because `runAdaptive2D` checks
  `cancelToken.cancelled` after each `await` (`render.mjs:283, 307`) and `startRun`'s re-entrancy guard
  (`ui.mjs:872`) blocks a second run while `activeJob` is set. It means a Cancel followed immediately by
  Render is silently *ignored* rather than queued, with no message — worth a one-line progress note.
- **`hardwareConcurrency` handling is correct** (`param-slice-pool.mjs:242`:
  `max(1, min(opts.maxWorkers || (navigator.hardwareConcurrency || 4), 16))` — undefined → 4, 1 → 1,
  64 → 16). No finding.
- **ADR-0007 note:** nothing here argues for extraction. `worker-crash-detail.mjs` is the correct
  minimal shared primitive (four consumers) and `createWorkerLane` correctly stopped at the three PSW
  lanes; the param-slice pool's lifecycle is genuinely different (survivor pool, not reject-and-respawn)
  and should stay separate. ADR-0026's "QD is deliberately not a `@cas/ui` consumer" is respected —
  `param-slice-ui.mjs` builds its own cards and its own canvas wiring.

---

## Improvement proposals (core functionality)

1. **Size the identity quadrature from φ's own conditioning, and add an honest `unresolved` class.** (S)
   `N = clamp(2^⌈log₂(4·ln(1/tol)/ln(1/ρ))⌉, 64, 65536)` with `ρ = maxⱼ|phi.branches[j].z|` — measured
   to resolve **2224/2224** pixels of a default two-point slice where the shipped Standard preset gets
   253 wrong, at +0.23 ms/px (verify 0.046 → 0.272 ms/px, ≈ +59 % of a ~0.38 ms/px render). When the cap
   binds, paint `unresolved` rather than `identity-fail`. **Prereq:** none (φ already carries `z`).
   **Risk:** low; the change is inside `_computeIdentity` / `verifyQuadratureIdentity_QD` and is a strict
   accuracy increase. This is the single highest-value change in my scope — it fixes the slice, the
   Inverse-tab badge (PSW-8) and the `c*` estimator's known under-estimate at once.
2. **Make α a sweepable axis.** (M) `listAvailableParams` (`param-slice-common.mjs:120-147`) enumerates
   residues, pole positions, polynomial coefficients, `c`, `q`, `w₀` — **not α**, and
   `param-slice-common.mjs:389` records the assumption ("α is fixed across a sweep (never a sweepable
   axis)"). α is the PQD family's defining parameter and the thesis's realizability statement
   (`C > (pᵅ − w₀ᵅ)²/α²`) is a statement *about* α; the app already has
   `QD.diagnosePQDRealizability` tracing the α-branch fold for a single point
   (`ui-solve.mjs:785-800`), so an (α, C) slice would draw the fold curve the diagnostic currently
   reports one pixel at a time. **Prereq:** the warm-hint gate must stop assuming α is constant
   (`param-slice-common.mjs:387-391` already syncs it onto the hint, so this is small); the mode's family
   tag must be re-selected per pixel when α crosses 1. **Risk:** medium — α crossing 1 changes family.
3. **Boundary tracing instead of rasterising.** (M) The classification boundaries I measured are smooth
   curves that the quadtree spends most of its budget resolving: a maximally-disagreeing classifier still
   leaves 37.5 % of cells unsampled and coverage-filled, while a homogeneous interior is sampled at the
   coarse stride. A predictor–corrector march along `{fold}` and `{|a₂| = |a₁|/2}` using the existing
   continuation machinery would give the *curve* to machine precision (the cardioid case is exactly
   `C₂ = 0.5`) instead of to one pixel. Ship it as an overlay on the raster, not a replacement.
   **Prereq:** a per-family "boundary residual" scalar; for the classical family `1 − ρ` and the fold's
   Jacobian determinant both exist already. **Risk:** medium.
4. **Slice state in the share link.** (S) `ui-url-state.mjs:66-122` already encodes a `#vs=` envelope and
   carries `tab: 'param-slice'` (`:54`), so a shared link opens the tab with default axes and a blank
   canvas. Adding `{ax, ay, xmin, xmax, xn, ymin, ymax, yn, q}` is ~15 lines in the same codec and makes a
   slice citable. **TODO.md:40 `#21 — URL state encoding` is unchecked although `#vs=` shipped** — see
   Documentation drift. **Prereq:** none. **Risk:** none.
5. **Export the classified image with its provenance.** (S) The slice is the one view with no export at
   all, while seven apps in the suite stamp PNG `tEXt` through `@cas/export`. The metadata that matters
   is exactly what PSW-1 shows is missing from the picture: the `h(w)`, the two `ParamRef`s and their
   ranges, the quality preset **and the identity node count actually used per pixel**. **Prereq:**
   proposal 1 (so there is a node count worth recording). **Risk:** none.
6. **Make the 1-D sweep first-class.** (S) Fill `classGrid`/`gridDims`/`nearestPhi` on the 1-D path
   (PSW-6) and, since a 1-D sweep is a curve, plot the *ordered* class transitions with their bracketing
   parameter values — for `h = 1.5/w + C₂/w²` that reads "univalent for C₂ ∈ [0, 0.500 ± 0.005]", which is
   a theorem-shaped output the raster cannot give. **Prereq:** PSW-6. **Risk:** none.
7. **Warm-start where it pays, cold where it does not.** (S) Measured: 1.0–1.2× for the classical bounded
   family, 4.6× for PQD. The adaptive renderer pays the `nearestPhi` bookkeeping and the speculative
   `tightMax` retry (`param-slice-common.mjs:432-446`) unconditionally. Gate the whole warm path on the
   family tag, which also removes PSW-5's warm/cold rigor split for the families that do not need it.

---

## Documentation drift

| doc file:line | claims | reality (file:line) | severity |
| --- | --- | --- | --- |
| `app/param-slice/param-slice-ui.mjs:596-600` (Quality help) | "`Standard` (N=128, tol=1e-6) matches the inverse tab's tolerance" | Inverse tab verifies at `state.samples = 500` (`ui/ui.mjs:194`, `ui/ui-state.mjs:59`); the tolerance matches, the node count does not, and the node count is what decides (PSW-1) | **MEDIUM** |
| `app/param-slice/param-slice-ui.mjs:594` | Fast "may yield false-positive *identity-fail* pixels" | Fast produced **zero** valid pixels on both families measured (2224/2601 and 60/60 yellow) | **MEDIUM** |
| `app/param-slice/README.md:69` + `param-slice-ui.mjs:249` | "brightness ∝ 1/iter" | `k = 1/(1 + iter/20)` over a `bg = 32` floor (`param-slice-common.mjs:298-309`), and `iter = 0` for a cold direct solve | LOW |
| `app/param-slice/param-slice-pool.mjs:150-155` (`_onWorkerError`) | "the pipeline unwinds cleanly" | it throws `TypeError` in `storeResults` (PSW-3) | **MEDIUM** |
| `app/param-slice/README.md:44` | `runSweep` documented as public surface | no production caller; tests only (PSW-11) | LOW |
| `app/param-slice/README.md:113` | "`node-test.js` … exercises `MainThreadPool` path" | `app/test/param-slice.test.js` contains no `Pool` / `MainThreadPool` / `solveBatch` reference at all; the pool is covered by `vitest/param-slice-pool.test.ts` | LOW |
| `app/param-slice/param-slice-render.mjs:232-236, 252-260` | warm hint "~0.03 ms" vs "~5.6 ms for PQD" cold | measured 1.0–1.2× (classical) and 4.6× (PQD), not 187× | LOW |
| `app/param-slice/README.md:73` | `No algebraic root` = "`solveInverseQD` returned `success:false` after all stages" | the slice runs 1 restart with continuation/diverse/deflation **off** (`param-slice-ui.mjs:912-923`) — not "all stages" | LOW |
| `ARCHITECTURE.md:343` | "The 1396-line `param-slice/param-slice-ui.mjs` … was carved to ~1096" | 1167 lines | LOW |
| `TODO.md:40` | `#21 — URL state encoding` unchecked | `#vs=` view-state shipped for the QD tab (`ui/ui-url-state.mjs:66-122`, `qd-url-state.test.ts`); what is genuinely missing is the **slice's** axes/ranges (proposal 4) | LOW |
| `app/param-slice/param-slice-common.mjs:276-280` | HANDOFF #36 "Tightened … math-rejection throws [no longer] mis-classify as feature gates" | 6 of 10 real solver refusal strings still land in `newton-diverged` on the family name (PSW-2) | **MEDIUM** |

---

## Tests

**Vacuous / passing for the wrong reason**

- `vitest/param-slice-pool.test.ts:75-93` ("a crashed worker settles its in-flight tile and drops from
  the pool") asserts `await expect(p).resolves.toBeNull()` — i.e. the *promise* settles. It never hands
  that `null` to the only consumer there is. **Surviving mutation:** none needed — the production
  consumer already throws on exactly this input (`scratch/A5/crash1.mjs`), and the test is green. The
  comment "the awaiting sweep unwinds instead of hanging forever" is the claim; the awaiting sweep
  crashes instead.
- `vitest/param-slice-pool.test.ts:179-197` and `:198-...` are the only exercise of `runSweep`, which
  production never calls (PSW-11). They pass; they guard nothing the app does.

**Coverage gaps that matter**

- **Nothing anywhere asserts that the classification is correct.** The whole `param-slice` test surface
  (`app/test/param-slice.test.js` + `vitest/param-slice-pool.test.ts`) tests `formatParamLabel`,
  `applyParam` round-trips, the adaptive-mesh predicates and the pool's plumbing — and not one assertion
  compares a pixel's class to a known answer. The two closed-form controls in *Structural observations*
  (the one-node disk at `C = 0`; the cardioid fold at `C₂ = 0.5` with `φ = z + z²/2`) are cheap,
  deterministic, and would have caught PSW-1 the moment the Fast preset was added: the disk sweep at
  Fast returns **zero** valid pixels.
- **No test drives `runAdaptive2D` at all.** `param-slice-render.mjs` is 350 lines of the app's only
  adaptive mesh and is reachable in node with a synthetic pool in ~20 lines (`scratch/A5/render1.mjs`).
  A grid-coverage assertion (every painted pixel's colour equals its truth for a smooth synthetic
  classifier) plus the hole case (PSW-3) would cover the module.
- **No test covers `classifyResult`'s bucket assignment against real solver strings.** The ten-string
  table in `scratch/A5/classif.mjs` is the test PSW-2 needs, and it is the kind of test that survives
  the next regex edit.
- **`vitest/worker-url-static-literal.test.ts` is a good invariant and holds**, but it scans source only.
  A cheap companion — assert each of the five `*-worker-entry-*.js` chunks exists in `dist/assets/` after
  a build — would close the "the chunk is silently omitted" failure mode it describes, which source text
  cannot see.
- **`app/test/worker-graph-cleanrealm.child.mjs` covers `solver-graph.mjs` only**, with four classical /
  PQD / UQD cases. The two other production worker entries (`param-slice-worker-entry.mjs`,
  `analysis-worker-entry.mjs`) import strictly more, and the LQD families are absent from the battery.
  I ran the wider version (`scratch/A5/clean2.mjs`) and it is clean today — so this is a free widening
  of a guard that already exists, three lines of `import` and six more cases.
