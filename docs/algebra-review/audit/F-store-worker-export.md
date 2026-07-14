# Track F — Store, Worker & Export Engineering

*Read-only audit of the QD Algebra module's derivation-DAG store, Web-Worker offload, and external-CAS bridge.*
Scope: `apps/quadrature-domains/app/algebra/algebra-store.mjs`, `algebra/sym-worker.mjs`,
`workers/sym-worker-entry.mjs`, `algebra/cas-export.mjs`, and `sym-core.mjs`'s `runJob` +
`MPoly.termList`/`fromTermList` serializers. Tests read: `vitest/sym-worker-lifecycle.test.ts`,
`sym-worker-thread.test.ts`, `worker-entry.test.ts`, `algebra-provui.test.ts`,
`app/test/algebra-store.test.js`, `cas-export.test.js`.

## 1. Summary & soundness

The engineering that carries the math is **sound and well-guarded**. The single most important
parity property holds by construction: **one `runJob` dispatcher** (`sym-core.mjs:5147`) is the
only heavy-op implementation, executed verbatim on **both** the worker thread
(`sym-worker-entry.mjs:23`) and the main-thread fallback (`sym-worker.mjs:86`), and a real
`node:worker_threads` differential (`sym-worker-thread.test.ts:103`) asserts the two are
**bit-identical** (`toEqual`). ℚ(i) BigInt coefficients cross every boundary as **decimal strings**
(`MPoly.termList` → `fromTermList`), never as `Number`/JSON-number, so there is no silent-corruption
path. Cancellation and supersede genuinely **terminate** the worker (deterministically tested), the
DAG is append-only with immutable nodes and per-track assumption isolation, and `exportDAG`/`importDAG`
round-trips losslessly (byte-identical re-export) with backward-compat for legacy snapshots. The two
provenance registries are in sync for all 20 node-creating ops, and the store is DOM-free. There are
**no critical or high findings**. The findings below are LOW/MEDIUM and mostly *latent* (guard-completeness
and defensive-robustness gaps that the current UI never triggers), plus one MEDIUM-SUSPECTED semantic
footgun in the CAS export that is mitigated — but not guarded — by honest labeling.

## 2. Confirmed strengths

- **S1 — One `runJob`, proven bit-identical across the boundary.** Worker entry
  (`workers/sym-worker-entry.mjs:23`) and the fallback (`algebra/sym-worker.mjs:86`,
  `if (_fallback || !_worker) return _QD.Sym.runJob(...)`) both call the *same* `sym-core.mjs`
  `runJob`. `sym-worker-thread.test.ts` forces the REAL worker path (`_isFallback()===false`, line 90)
  and asserts `viaWorker.toEqual(direct)` for groebner/solveZeroDim/dimension/classify (line 103),
  plus the error path (line 108) and throttled progress (line 134).

- **S2 — Lossless ℚ(i) BigInt serialization.** `MPoly.termList()` (`sym-core.mjs:463`) emits each
  coefficient as `re:[n.toString(), d.toString()], im:[...]` (decimal **strings**); `fromTermList`
  (`sym-core.mjs:233`) rebuilds via `new Rational(BigInt(t.coeff.re[0]), BigInt(t.coeff.re[1]))`.
  No `Number`/`parseFloat` path exists. Survives both structured-clone (postMessage) and
  `JSON.stringify` (save). Tested: `algebra-store.test.js:1316` (node poly round-trips exactly) and
  `:1313` (re-export byte-identical to import).

- **S3 — Cancellation/supersede terminate the thread.** `cancel()`→`_dispose()`→`_teardownWorker()`
  calls `_worker.terminate()` (`sym-worker.mjs:43`). Supersede TERMINATEs + rejects `{aborted,superseded}`
  + rebuilds (`sym-worker.mjs:94-102`). `run()` is `async` and returns a Promise on every path.
  `sym-worker-lifecycle.test.ts` locks this deterministically via a terminate counter
  (`:99 expect(workerStats.terminated).toBeGreaterThan(...)`), not wall-clock timing — the prior
  "reject-only left a core burning" flaw (memory: PR #21) is closed and regression-guarded.

- **S4 — Deterministic / reproducible DAG.** No `Date`/`Math.random`/`performance.now` anywhere in
  store, sym-core, cas-export, or the worker (grep clean; `sym-core.mjs:1650` explicitly "no Math.random
  in the engine"). Ambient variables are `.sort()`ed before every order is built (`_varsOf`,
  `_varSplit`, `_reimTransform` return `[...].sort()`); separating linear forms come from exact-BigInt
  `_sepCandidates`. Map/Set iteration only feeds order-independent substitution maps or is re-sorted, so
  the derivation is reproducible.

- **S5 — DAG integrity: immutable nodes, pristine column 0, isolated tracks.** Nodes are only ever
  *added* (every `provenance.op` site calls `addNode({ id: nid(), … })`); none mutate an upstream
  node's `poly`, so `snapshot()`'s shallow node-map copy (`:319`) is safe. Every reduction appends a
  new column; `algebra-store.test.js:497/611` confirm column 0 keeps its barred vars / `w0`.
  `forkTrack` (`:566`) deep-copies the source column with **fresh ids**, inherits the parent's
  assumptions **by value** (`:578-579` `.slice()`), and leaves the source untouched; analyses resolve
  the **analyzed** track's assumptions via `trackOf(ids[0])` (`currentReimSystem:1730`,
  `_pruneSolutionsByAssumptions:1998`, `knownValues:1808`). The prior cross-track leakage is
  regression-tested (`:193-231` B-01, `:405` A6-solve).

- **S6 — Lossless, backward-compatible, fail-closed save/load.** `exportDAG` (`:2291`) emits
  version + model + formulation + per-track assumptions + substConj/substBarred + tracks + activeTrack +
  per-node id/kind/rel/column/track/order/meta/provenance/termList + edges. `importDAG` (`:2313`)
  restores all of it, recomputes `seq`/`trackSeq` past the imported ids, filters dangling edges
  (`:2352`), and **re-homes orphan-track / non-numeric-column nodes to t0/0** (`:2342-2343`, tested
  `:1337-1343`). Legacy snapshots (no `assumptions`/`tracks`) degrade to a single t0 record
  (`:2333-2334`). Round-trip is undoable and byte-identical (`:1298-1325`).

- **S7 — Provenance registries synchronized; store is DOM-free.** Both `PROV_STORE`
  (`algebra-store.mjs:89`) and `PROV_UI` (`algebra-ui.mjs:72`) cover exactly the **20** ops that the
  store actually writes to nodes (enumerated from the 21 `op:'…'` node-creation sites). Coverage is
  tested on both sides (`algebra-store.test.js:1381`, `algebra-provui.test.ts:41`). `resolvent`
  (`PROV_STORE:117`) is a **display-only query** (`resolventOf:1834` returns LaTeX, creates no node),
  so its absence from `PROV_UI` is correct and documented (`algebra-provui.test.ts:28-29`). The store
  reaches into **no** DOM API — grep for `document|createElement|innerHTML|querySelector|getElementById`
  is empty; the only `window` refs are `window.QD` namespace lookups.

- **S8 — Import robustness + honest external-CAS labeling.** `parseRCTD`/`parseMsolveSolutions`
  never throw and report located errors (`cas-export.js:238/320`; tested `:116-124`, `:162-176`,
  including the tolerant-scanner no-hang guard). `importRCTD` builds+validates every polynomial
  *before* mutating (atomic; `:2552-2569`) and lands each cell's `realCount` as its own labeled
  `op:'rctd'` node — it does **not** overwrite the in-browser verdict. Singular/Sage are labeled
  "variety Gröbner cross-check" (not a real-count), msolve is a variety-preserving ℚ(i)→ℚ map, and
  Maple RCTD is presented as the parametric route the browser cannot run (`cas-export.js:15-24`,
  `AHARONOV_SHAPIRO.md:74-103`).

## 3. Findings

### F1 — `_CAP_KEYS` and its coverage test are both incomplete: worker silently drops caps the ops honor — SEVERITY: LOW (→ MEDIUM if any caller passes them)

**Evidence.** `_CAP_KEYS = ['maxBasis','maxSteps','maxDegree','maxTerms','maxEigenDim','maxHermiteDim','maxRounds','reduced','keepEliminated']`
(`algebra-store.mjs:183`); every `*Async` payload forwards only `_capOpts(opts)`
(e.g. `:1928`, `:1958`). But worker-reachable `runJob` ops read caps **absent** from that list:
- `solveRealCertified` → `rationalUnivariateRep` reads `opts.maxDim` (`sym-core.mjs:1877`) and
  `opts.maxTries` (`:1881`);
- `parametricRealCount1D` reads `opts.maxTries` (`:4232`), `opts.maxCalls`/`maxSegments`/`maxDepth`
  (`:4785-4787`), `opts.tol` (`:4217`);
- `solveZeroDim`/`classify` → `solveByEigenvalues` reads `opts.verifyTol` (`:4031`);
  `_sepForm` reads `opts.formTries` (`:4331`).

The guard meant to prevent exactly this (comment `algebra-store.mjs:176-182`, "A cap the ops honor but
MISSING here would be silently dropped for the worker while the sync fallback still honored it") is
`algebra-store.test.js:1425-1427`, but its `OP_CAPS` is a **hand-curated** list with the *same*
omissions, so it passes despite the gap. Result: if a caller ever passes `maxDim`/`maxTries`/`maxCalls`
/etc. to a `*Async` method, the **sync fallback honors it but the worker uses its own default** — a
silent sync≠worker divergence, and (worse) one whose reproducibility depends on which path ran.

**Why it matters / fix.** Currently *latent* — the store/UI pass only `{ paramValues }` (grep of
`algebra-ui.mjs` for classify/solve/dimension opts). But it defeats the stated purpose of the A9 guard.
Fix: derive the guard's op-cap list from a single source of truth (or add the missing keys to
`_CAP_KEYS`), and/or document the intentionally-worker-defaulted caps explicitly rather than omitting
them silently.

### F2 — sync `classify` twin doesn't thread `opts` to buchberger / realSolutionCount; the worker does — SEVERITY: LOW (defensive)

**Evidence.** `_classifyImpl` (`algebra-store.mjs:1770`, `:1777`) calls `S.buchberger(reim.polys, ord)`
and `S.realSolutionCount({ G, order: ord }, null, reim.vars)` with **no opts**, whereas
`runJob('classify')` (`sym-core.mjs:5204`, `:5214`) threads `opts` into both. Identical at the default
caps (the UI case, opts `{}`), but on the `symWorker()===null` fallback path a supplied cap would apply
to the worker/runJob route yet be **ignored** by the sync `classify`. Same asymmetry as F1, on the honesty
gate specifically.

**Fix.** Thread `opts` in `_classifyImpl` for symmetry with `runJob('classify')` so the two never
diverge under caps.

### F3 — a superseded job's abort-signal listener is never removed; a late abort cancels the *successor* job — SEVERITY: LOW (unreachable from the current UI)

**Evidence.** In `run()` the signal wiring `signal.addEventListener('abort', () => cancel(), { once: true })`
(`sym-worker.mjs:120`) captures no jobId and is not removed when the job is *superseded* (the supersede
branch `:94-102` rejects+teardowns but leaves the old signal's listener registered). If that stale
signal later fires, `cancel()`→`_dispose()` (`:126`,`:47-50`) terminates the **currently live** worker
and rejects the **current** `_inflight` with `{aborted:true}` — i.e. it kills a different, newer job.

**Why it's not live.** The UI serializes all heavy ops behind a single `_abort` guard
(`algebra-ui.mjs:1418`; every op does `if (_abort) return;`, e.g. `:1449`,`:1543`,`:1786`), so a second
`run()` is never issued while one is in flight and the supersede branch is never taken in production.
`sym-worker-lifecycle.test.ts` covers cancel/abort/supersede but not the specific "abort signal of an
already-superseded job" ordering.

**Fix.** In the abort handler, no-op unless the captured jobId is still `_inflight`; remove the listener
when the job settles.

### F4 — a worker load/runtime error rejects every job forever instead of degrading to the main thread — SEVERITY: LOW (latent)

**Evidence.** The constructor-throw path sets `_fallback = true` (`sym-worker.mjs:75`), but the
`w.addEventListener('error', …)` handler (`:59-68`) only rejects the inflight job and `_dispose()`s —
it does **not** set `_fallback`. `_dispose()` nulls `_worker`, so the next `ensureReady()` rebuilds the
same (broken) worker. A persistently failing worker entry therefore rejects *every* job with
"sym-worker crashed" rather than falling back to `runJob` on the main thread.

**Why it's not live.** The entry is a static module proven to import in Node
(`worker-entry.test.ts:51`), so a load failure in the browser is unlikely. Defensive only.

**Fix.** Count consecutive worker errors and flip `_fallback = true` after a small threshold so heavy
ops still complete (slowly) on the main thread.

### F5 — CAS export ships the raw column with no reim-split and no complex-coefficient guard; a conjugate-model column exported to Maple RCTD / msolve real-counts a *different* quantity — SEVERITY: MEDIUM (SUSPECTED)

**Evidence.** `casColumn`/`_columnItems` (`algebra-store.mjs:2372`,`:2366`) export
`n.poly.termList()` **verbatim** — the current column's polynomials, which in the conjugate model carry
ℚ(i) coefficients (`I` present) and *independent* variables `z_j`, `z̄_j` (`zb_j`). The in-browser
verdict, by contrast, always analyzes the **reim** system (`currentReimSystem`→`_reimTransform:1695`,
substituting `z_j = x_j + i·y_j`, `z̄_j = conj`) with parameters pinned. The export never reim-splits.
Maple `RealComprehensiveTriangularize` (`cas-export.js:151-158`) and the msolve real-root path (which
even *adds* `i^2+1` for complex coeffs, `cas-export.js:285`) count **real** solutions; over an
ℚ(i)-coefficient conjugate system that means "real `z_j` **and** real `z̄_j`", i.e. the assume-real
*slice* count — not the general QD count the reim verdict reports. There is **no** guard or warning:
`systemToCAS`/`_varSplit` never inspect coefficients for `I`, and `msolve`'s `needI` branch knowingly
maps the complex system rather than flagging it.

**Mitigation (why it's SUSPECTED / not higher).** The export is *designed* for the parametric-real
route, the doc explicitly walks the user to export the real moment-parametrized system
(`AHARONOV_SHAPIRO.md:90-103`, params `M0,m1,n1`), and the return trip lands as a **separate labeled
`op:'rctd'` column** — nothing conflates the Maple answer with the browser verdict. So a *careful* user
following the doc is fine. The risk is a user exporting a complex conjugate-model column and reading
Maple's real-count as "number of QDs."

**Confirm.** Export a complex conjugate-model column (I-coeffs, `z_j`/`zb_j` present) via Export ▸
"CAS / RCTD" ▸ Maple RCTD, run it, and compare its per-cell real-count to the reim `classify` verdict for
the same pinned data — they should disagree.

**Fix.** In `casColumn`/`msolveColumn`, warn or refuse when `_columnItems` contains a term with
`coeff.im[0] !== '0'` or a barred variable (or offer an auto-reim-split export), so the exported system
matches the real-count semantics the label implies.

### F6 — the newer worker ops lack the worker-vs-main-thread differential test — SEVERITY: LOW (test gap)

**Evidence.** `sym-worker-thread.test.ts`'s `CASES` (`:34-80`) exercises the bit-identical boundary only
for `groebner`/`solveZeroDim`/`dimension`/`classify`. The three roadmap ops routed through the same
worker — `solveRealCertified` (`runJob:5166`), `shapeFromMoments` (`:5173`), `parametricRealCount1D`
(`:5178`) — are JSON-shaped in `runJob` but have **no** differential asserting the postMessage round-trip
equals a direct `runJob` (they only ever hit the sync fallback in the node suite).

**Fix.** Add one case per op to the `CASES` table (each returns plain numbers/`{re,im}`/string arrays, so
`toEqual` applies directly).

## 4. Answers to the seven audit questions (index)

1. **Worker/main parity** — same `runJob` on both paths; bit-identical, tested (S1). ℚ(i) coeffs
   round-trip as decimal strings, no precision loss (S2).
2. **Cancellation/supersede** — genuinely terminate the worker; `run()` is async; no stale-result race
   (jobId-matched + fresh worker on supersede) (S3). One latent late-abort edge (F3, unreachable today).
3. **Determinism** — no Date/random; sorted variable orders; reproducible DAG (S4).
4. **DAG integrity** — immutable nodes, pristine column 0, isolated forked tracks (S5).
5. **Save/load round-trip** — lossless, backward-compatible, fail-closed, BigInt-safe (S6).
6. **External-CAS fidelity** — imports are atomic/honest and land as their own column (S8); the Maple
   RCTD / msolve **exports** are honestly labeled but ship the raw column with no reim-split/complex-coeff
   guard, so a conjugate-model export real-counts a different quantity than the verdict (F5).
7. **PROV_STORE/PROV_UI sync** — both cover all 20 node-creating ops (coverage-tested); store is DOM-free
   (S7).
