# Remediation plan — Quadrature Domains review of 2026-09-20

A sequenced plan to close every finding in [`REPORT.md`](REPORT.md) and to land the improvements it
recommends, **executed by Opus 5 subagents**: each work package (WP) below is a self-contained brief for
one subagent, the WPs are grouped into **waves** whose members touch disjoint files and therefore run in
parallel, and the waves run in order because each depends on the last. Effort: S = under half a day,
M = half to one day, L = one to two days, per subagent. Finding ids (DIR-1, WGT-1, PSW-1 …) refer to the
report and to the per-area evidence in [`findings/`](findings/). Progress lives in
[`STATUS.md`](STATUS.md) next to this file (the M8 pattern: read it first, do the wave it names, update
it, push).

## Scope

**The app, plus the shared-package or sibling-app change a QD finding motivates** — the same rule the
Complex Dynamics plan used. Three findings cross the app boundary and are in scope because the defect is
the wire, not the app: WGT-1's consumer-side refusal (WP12), UI-2's root selection in `apps/hele-shaw-flow`
(WP12), and SCH-1's erosion in `packages/gpu` (WP14). A package or sibling-app change ships with that
package's other consumers' tests run and green. No other sibling app is touched.

**Out of scope, recorded with the reason:**

- The `@cas/core` `poly.trim` absolute cut-off (SOLV-6's second half) — inherited by six apps, so it is a
  suite decision; WP11 documents it at the QD call site and leaves the primitive alone.
- The weighted-φ interchange form (`form:"weighted-laurent"`, report improvement 29) — a schema addition
  wanting an ADR and a σ engine in `@cas/schwarz`. WP1 refuses the export honestly; the form is listed under
  _Decisions to record_.
- Adopting `@cas/ui` — ADR-0032 says QD is deliberately not a consumer; WP16 closes the canvas a11y gap
  in-app.
- Migrating QD onto `@cas/rigor` — the suite has two rigor vocabularies on purpose (ADR-0040).

## How the subagents run

**One WP = one Opus 5 subagent in its own git worktree.** The orchestrator spawns every WP of a wave in
one message (`Agent`, `model: "opus"`, `isolation: "worktree"`, `run_in_background: true`), each with the
brief in Appendix A filled in from its WP section. A subagent never pushes; it commits on its worktree
branch and reports. When the wave's subagents have all reported, the orchestrator merges the worktree
branches into the integration branch **in the order the wave lists them**, runs the full gate after
_each_ merge, updates `STATUS.md`, pushes, and **pauses for the owner's review at the wave gate** before
spawning the next wave (CLAUDE.md: pause at each milestone gate).

**Disjointness is the contract.** Every WP carries a _Files owned_ list. Within a wave those lists do not
overlap, which is what makes the merges trivial and the parallelism safe. A subagent that finds it must
edit a file outside its list **stops and reports** rather than editing it; the orchestrator either
re-assigns the file or serialises the two WPs. Cross-cutting files that several WPs would want are
assigned to exactly one WP per wave (the table in each wave says which).

**Every WP follows the same discipline**, stated once here and referenced by the brief:

1. **Reproduce before fixing.** Re-run the finding's own reproduction (its command, inputs and expected
   output are in the findings file) and confirm the defect on the clean worktree. A fix for a defect that
   did not reproduce is a report, not a commit.
2. **Pin with a test that fails without the fix.** Every behaviour change lands with a regression test
   _and its negative control_: revert the fix, run the test, see red, restore. Prefer the test the
   finding names. Never loosen a tolerance, skip or quarantine a test to get green.
3. **Run the full gate, never piped.** `pnpm lint && pnpm typecheck && pnpm test && pnpm build` from
   the repo root after the LAST edit; where the WP says so, also the QD browser suite
   (`cd apps/quadrature-domains && pnpm test:browser`) and any sibling suite named. **Never through
   `tail` or `head`.** The QD node suite alone is `node app/node-test.js` in the app (2342 assertions at
   baseline; the count must not go down).
4. **Small commits, honest messages, no model identifiers in the tree.** One commit per finding closed
   where practical. Stay inside the WP: no drive-by refactors, no widening. If measuring shows the plan
   is wrong about something, do what is right, and say so in the report and in `STATUS.md`.
5. **Report in at most ten lines**: the commits, the gate numbers, the findings closed, anything the plan
   got wrong, and anything left for the owner to decide.

**Wave gate = the full gate green on the integration branch after the last merge + the owner's review.**

---

## Wave 0 — make the gate trustworthy for parallel work · 1 subagent · effort S

Sequential and alone, because the rest of the plan runs several gates concurrently on one container and
two things break under exactly that.

### WP0 — Gate hygiene, the thesis, and the status scaffold · closes TEST-1, TEST-4, DOC-1

**Files owned:** `apps/quadrature-domains/vitest/node/worker-graph-cleanrealm.test.ts` (new),
`apps/quadrature-domains/vitest/node/_run.ts`, `apps/quadrature-domains/vitest/sym-factor-recombine-cap.test.ts`,
`apps/quadrature-domains/thesis.txt`, `apps/quadrature-domains/prop463.txt`,
`apps/quadrature-domains/vitest/thesis-text.test.ts` (new), `docs/review/2026-09-20-quadrature-domains-review/STATUS.md`.

**Changes**

- **TEST-1.** Add the missing wrapper so `worker-graph-cleanrealm` runs in CI: one file on the pattern of
  its 29 siblings, and its floor in `_run.ts`'s `FLOORS`. Then add a spec (`vitest/node/_manifest.test.ts`)
  that reads `TESTS` out of `app/node-test.js` and asserts a wrapper exists for every entry and `FLOORS`'
  keys equal `node-test.js`'s — the report's improvement 30 "derive, don't hand-sync".
- **TEST-4.** Replace the `< 4000 ms` wall-clock assertion at `sym-factor-recombine-cap.test.ts:33` with
  a check on what the cap actually guarantees (the recombination budget was respected — the function's own
  `status`/reason, or a call-count on the recombination loop), so the verdict no longer depends on machine
  load. Prove it: run the spec under three concurrent `node app/node-test.js` and confirm it stays green.
- **DOC-1.** Replace `thesis.txt` with a faithful extraction of `Andrew_Graven_Thesis.pdf` (pdf.js from
  node keeps the mathematics; `pdftotext`/pypdf are unavailable in the container — see A8's evidence for the
  extractor). Keep `===== PAGE n =====` markers. Delete `prop463.txt` (0 referrers) or fold its page into the
  new file. Add `vitest/thesis-text.test.ts`: the file contains ≥ 1,000 Greek characters and the strings
  `Theorem 3.2.3` and `𝑑𝐴 = 𝑑𝑥𝑑𝑦/𝜋`. Re-point `THEORY_MAP.md`'s line citations later (WP18); this WP does
  not touch it.
- **STATUS.md.** Fill the scaffold (already in this directory) with the wave/WP table set to _not started_,
  the integration branch name, and the baseline gate numbers measured on this container.

**Gate:** full gate; `node app/node-test.js` must report 30/30 files ran (it already asserts this).

---

## Wave 1 — the four one-line certificates · 4 subagents in parallel · effort S each

Each is hours, each is a false certificate a user meets today, and their file sets are disjoint.

### WP1 — Refuse the weighted unbounded export · closes WGT-1 (= SCH-11 = UI-3, producer half), TEST-11

**Files owned:** `apps/quadrature-domains/app/schwarz/schwarz-export.mjs`,
`apps/quadrature-domains/vitest/schwarz-export.test.ts`, `apps/quadrature-domains/vitest/schwarz-handoff-link.test.ts`,
`apps/quadrature-domains/vitest/browser/schwarz-export.browser.test.ts`.

**Changes.** `phiToMapSpec` (`:31`) gains the guard `boundedClassicalMapSpec` (`:57`) already has:
`if (phi.family && phi.family !== 'unboundedQD') return null;` (the classical unbounded family leaves
`family` unset — confirm by grep before relying on it, and prefer a single exported `isWeightedPhi(phi)`
that both call). `classifyPhiForExport` gains a `weighted` kind so `explainPhiUnavailable`,
`explainSigmaUnavailable` and `explainHeleShawUnavailable` say _why_ ("a power/log-weighted φ has no
interchange form yet"). Emit `weight: {kind, alpha}` on the `quadrature-domain` payload where the schema
already has a seat, so a consumer can refuse (WP12 does the consumer half). Every current classical payload
must stay **byte-identical** — assert it against the existing goldens. Fixtures: the four
`{unbounded:true, family:'unboundedLQD'|'unboundedLQD_singular'|'unboundedPQD'|'unboundedPQD_singular'}`
twins of the existing `boundedWeightedPhi`, each asserted refused on all three surfaces; plus a test for
`exportSigmaDeepLink` (TEST-11 — the one wrapper with no test). Negative control: remove the guard, all
four go red.

**Gate:** full gate + QD browser suite (the export browser spec).

### WP2 — A zero row is not a node · closes UI-1

**Files owned:** `apps/quadrature-domains/app/ui/ui.mjs` (`buildHData` only), `apps/quadrature-domains/app/ui/ui-h-text.mjs`,
`apps/quadrature-domains/app/test/h-text-roundtrip.test.js`, `apps/quadrature-domains/vitest/qd-url-state.test.ts`.

**Changes.** In `buildHData` (`ui.mjs:241-253`) skip a grid row whose whole principal part is exactly zero
(a zero residue is not a quadrature node; this also covers a hand-typed `0/(w-1) + w^2`). Keep the
placeholder row in `parseAndApplyHText` — it exists so the grid has a row to extend — but it must never
reach the solver. Extend `h-text-roundtrip.test.js` one layer up: for **all 41 presets**, `formatH →
parseAndApplyHText → buildHData` and assert the rebuilt `hData` equals the preset's own (the layer its
current assertions stop one short of). Replace `qd-url-state.test.ts`'s `parseAndApplyHText` stub with
the real function for at least the five pure-polynomial presets, asserting **by verdict** (the solve
succeeds after reload). Negative control: restore the unfiltered `buildHData`, the five go red.

**Gate:** full gate. Then, by hand or Playwright against the built app, reload the `unb-deltoid` share
link and confirm "✓ Valid quadrature domain".

### WP3 — σ's poles at the nodes · closes SCH-2, SCH-4, SCH-7

**Files owned:** `apps/quadrature-domains/app/schwarz/schwarz-analysis.mjs`,
`apps/quadrature-domains/app/schwarz/schwarz-inverse.mjs` (the `:231` comment only),
`apps/quadrature-domains/app/test/schwarz.test.js`.

**Changes.** `findSigmaSingularities`: `wPole = schwarz.evalPhi(branches[j].z)` in place of the reflected
point, and delete the `absZj < 1e-12` guard (φ(0) is well defined for both families). Replace the vacuous
test at `schwarz.test.js:404-411` ("either 0 or 1 pole is acceptable") with: the bounded two-pole fixture
reports poles at `±0.5` to 1e-9, `|σ|` grows like `1/d` within 1e-3 of each, and the count equals the
number of branches (plus one at ∞ for the unbounded family). Negative control: the mutant SCH-4 names
(delete the `polesOut.push` body) must now fail. Fix the `schwarz-inverse.mjs:231` comment (no closed-form
`unboundedQD` inverse exists; it is Newton-routed).

**Gate:** full gate.

### WP4 — `factor` tells the truth about perfect powers · closes ALG-1, ALG-8, ALG-4

**Files owned:** `apps/quadrature-domains/app/sym/sym-core.mjs`, `apps/quadrature-domains/app/sym/sym-radical.mjs`,
`apps/quadrature-domains/vitest/sym-core-oracles.test.ts`, `apps/quadrature-domains/vitest/sym-factor-recombine-cap.test.ts`
(new cases only; WP0 has already landed its edit), `apps/quadrature-domains/app/algebra/algebra-format.mjs`
(the "irreducible" string, if it lives there — grep first; otherwise report).

**Changes.** The single-distinct-factor path in `factor()` (`sym-core.mjs:2446`) must return the
factorisation `f^k` with `status: 'reducible'` when `k ≥ 2`, and `irreducible` only when the degree did not
drop. Add `radicalReduced: boolean` to the result (∏ factors is a proper divisor of the input). Same
primitive at `sym-radical.mjs:443,449` so `solveByRadicals((x³−x−1)²)` solves rather than refusing
Abel–Ruffini (ALG-8). ALG-4: route the multivariate perfect power through `multivariateSquarefreePart`
before declaring `undetermined`. Tests: `expect(S.factor((x−1)²).status).not.toBe('irreducible')` and the
14 sympy false certificates from A4's differential corpus as a fixture table (`scratch/A4/fac-cases.json`
is recorded in the findings; regenerate with the same generator if needed), plus the three negative
controls (`w₁² − 1`, `w₁² + 1`, `w₁² − 2`). The UI string "no nontrivial factorization exists" must be
unreachable for a perfect power — assert it via the store's status, not the DOM.

**Gate:** full gate.

**Wave 1 merge order:** WP4 → WP3 → WP1 → WP2 (WP2 last because it wants a browser check after merge).

---

## Wave 2 — the direct problem, the certificates it feeds, and structured refusals · 4 subagents · effort M each

### WP5 — The unbounded classical direct problem, right way up · closes DIR-1, DIR-2, DIR-3, DIR-7, DIR-10, DIR-12, TEST-2 M18, TEST-8

**Files owned:** `apps/quadrature-domains/app/direct/direct-common.mjs`, `apps/quadrature-domains/app/direct/direct-verify.mjs`,
`apps/quadrature-domains/app/direct/direct-recompute.mjs`, `apps/quadrature-domains/app/direct/README.md`,
`apps/quadrature-domains/app/test/direct.test.js`, `apps/quadrature-domains/vitest/direct-verify-dispatch.test.ts`.

**Changes.** (1) Delete both `finitePoles.push` calls at `direct-common.mjs:577-599`; a Laurent-polynomial
φ is analytic on all of 𝔻\* so `polyPart` is the complete `h` (Theorem 3.2.3, `C_𝔻 φ# = φ# − c·z⁻¹`).
Delete `finitePoleHandled` and the "unlikely to be a classical QD" warning (DIR-3); say in the header and
README that finite nodes need φ with poles in 𝔻\*, which this input shape cannot express. (2) Give
`verifyBoundaryIdentity` an `unbounded` flag and score `posMass` in that branch (DIR-2), `zeroMass` in
both. (3) Make `unboundedQD` do what every weighted kernel does: build the family φ
(`{unbounded:true, c, polyA:F, branches:[]}`) and grade its own `h` with
`QD.Family.unboundedQD.verifyQuadratureIdentity` before returning, surfacing `maxRelDiff` on the result.
(4) DIR-7: numerical mode may not show ✓ beside "the computed h is meaningless". (5) Fix the `:35`
normalisation comment (DIR-10) and the `:1036` header (DIR-12). (6) Tests: replace `direct.test.js:259-297`
with the thesis assertions (`φ = c·z` ⇒ `h ≡ 0`; `φ = c·z + F₀` ⇒ `h ≡ conj(F₀)`) and a
family-verifier assertion per classical fixture; replace `:718-723` with `posMass < 1e-13` for the ellipse
**and** `posMass > 0.1` for a 1.5× perturbed polyPart (pins the reason, not only the outcome); delete the
NB at `:299-305` and add the direct↔inverse composition the classical section never had (ellipse and
deltoid round-trip to < 1e-12). M18: one case with `m ≥ 3` and complex `F[0]`, `F[1]` with `hData.polyPart`
pinned (the dropped-`conj` mutant survives every existing fixture). TEST-8: make
`direct-verify-dispatch.test.ts` import `direct-verify.mjs` and assert its dispatch on both `weight` and
`lastWeight`.

**Gate:** full gate. Then in the built app: unbounded Direct tab, `c = 0.6`, no F — no pole, no warning,
Verify green; `z + 0.3/z` — Verify green; `Send to inverse` succeeds on both.

### WP6 — Certified geometric properties and honest cusps · closes DIR-4, DIR-8, TEST-2 M09/M10/M13

**Files owned:** `apps/quadrature-domains/app/analysis/univalence.mjs`, `apps/quadrature-domains/app/analysis/cusps.mjs`,
`apps/quadrature-domains/app/ui/ui-solve.mjs` (the geometry card and cusp marker rendering only —
`:753-766`, `:880-881`), `apps/quadrature-domains/app/ui/ui-strings.mjs` (`:315-317` only),
`apps/quadrature-domains/app/test/univalence.test.js` (new, registered in `node-test.js` `TESTS` + a wrapper
+ a floor), `apps/quadrature-domains/app/test/cusps.test.js`, `apps/quadrature-domains/app/node-test.js`.

**Changes.** In `classifyUnivalence`'s existing boundary sweep accumulate `Δarg(φ − c)` and `Δarg(φ′)`;
`N₀ = Δarg(φ−c)/2π`, `N₁ = Δarg(φ′)/2π` (exact integers for analytic φ — round and assert integrality
within 1e-6, else `indeterminate`). Report `starLike` only when `N₀ === 1`, `convex` only when `N₁ === 0`,
otherwise `{indeterminate: true, reason}`; drop `PHIP_FLOOR2`, which the winding count subsumes. Add the
new row `# zeros of φ′ in 𝔻` (report improvement 8). The card renders `indeterminate` as "—" with the
reason, never as ✗ or ✓. DIR-8: `isCusp` must consult `confidence`/`pLeading`; a smooth near-cusp gets the
hollow marker and the card shows the confidence. Tests: `z² − 0.5z` (all three indeterminate; witness
`φ(0.57) = φ(−0.07)`), `z + 0.8z²` (convex indeterminate, not ✓), `z + 0.3z²` (control: star-like ✓,
convex ✗ with margin −0.5); a univalent-but-not-spiral-like φ with `is === false` (kills M10) and a
not-star-like one (M09); a near-cusp at the `relTol` boundary that is **not** called a cusp (M13). The
help string must state the hierarchy _as certified_.

**Gate:** full gate.

### WP7 — Critical points globally, c\* exactly · closes SOLV-2, SOLV-3, SOLV-13, TEST-2 M15

**Files owned:** `apps/quadrature-domains/app/analysis/critical-set.mjs`, `apps/quadrature-domains/app/solvers/solver-cmax.mjs`,
`apps/quadrature-domains/app/test/cmax.test.js`, `apps/quadrature-domains/app/test/critical-set.test.js` (new, registered as in WP6 —
coordinate: WP6 also edits `node-test.js`; **WP7 adds its entry in a separate line and the orchestrator
merges WP6 first**; if the merge conflicts, the orchestrator resolves it, not the subagent).

**Changes.** For the classical families φ′ = 0 clears to a polynomial (`∏ⱼ(1 − z̄ⱼz)^{mⱼ+1}` and `z^L` for
the Laurent part); use `QD.Direct.polynomialRoots` (global, seed-free, already used by `faber-analysis`) in
`findCriticalPoints` for those families, keeping the seeded Newton for the weighted ones with (a) seeds on
a small ring around each φ pole `1/conj(zⱼ)`, (b) a damped step, (c) `{points: [], complete: false}` when
`nConverged === 0` with seeds tried, which `critModulus` treats as _unknown_, never as _none_. Then in
`solver-cmax.mjs` drive c\* by Newton on the scalar `max_{φ′=0}|z| = 1` with the bisection kept as a
bracket; report `mechanism: 'cusp'` when the geometric criterion decides, with a residual. SOLV-13: stop
reporting a `cMax` above the true c\* on the polynomial families. Tests (the oracles the suite lacks):
`h = 1/(w−2)` critical-point moduli at c ∈ {2.5, 2.7, 2.9, 2.99} to 1e-6 against the closed form;
`c* = w₀ + √α` for five (α, w₀) pairs to `relTol`; `h = w²` ⇒ c\* = 0.5 and `h = w³` ⇒ c\* = 1/√3;
`cmax.test.js`'s stub case rewritten so the cusp branch is actually taken (its current mutant survives).

**Gate:** full gate.

### WP8 — Refusals are structured, and a point is not a domain · closes WGT-2, WGT-3, PSW-2, PSW-3, PSW-12, TEST-2 M25/M26 (tests only)

**Files owned:** every `apps/quadrature-domains/app/solvers/solver-*.mjs` **`normalizeOpts` block only** (the
ten families' input validation; nothing else in those files — WP9 owns their verifiers next wave),
`apps/quadrature-domains/app/solvers/define-family.mjs` (a `validateHData(hData, {bounded})` helper called
by the factory), `apps/quadrature-domains/app/param-slice/param-slice-common.mjs`,
`apps/quadrature-domains/app/param-slice/param-slice-pool.mjs`, `apps/quadrature-domains/app/param-slice/param-slice-ui.mjs`
(`onAxisChange` defaults only), `apps/quadrature-domains/app/workers/param-slice-worker-entry.mjs`,
`apps/quadrature-domains/app/test/param-slice.test.js`, `apps/quadrature-domains/vitest/param-slice-pool.test.ts`,
`apps/quadrature-domains/app/test/solvers-4.test.js` (new cases at the end only),
`apps/quadrature-domains/vitest/continuation-trace.test.ts` (new).

**Changes.** Tag every thrown refusal at its throw site with `err.qdKind = 'precondition' | 'capability' |
'newton'`; `classifyResult` switches on the tag, never on prose (PSW-2), and `capability-refused` is used
for what it names. `validateHData` refuses `hData.polyPart` for every bounded family (WGT-2) and an
identically-zero `h` for every family (WGT-3) — a named reason, the same shape as `unboundedPQD`'s
existing "no quadrature data" throw; one test per family asserting the throw, and
`solveInverseQD({poles:[],polyPart:[]},{bounded:true})` fails by name. PSW-3: `storeResults` tolerates the
`null` a crashed worker settles with, the sweep completes on the surviving workers, and the test that
"asserts the promise settles" now hands the value to the consumer. Fold `param-slice-worker-entry.mjs` onto
`workers/protocol.mjs` so an unknown message kind replies with an error. PSW-12: axis defaults that respect
the parameter's domain (`c > 0`, `w₀` off the origin). M25/M26: `continuationInC` under direct test via its
trace (monotone `c`, at least one grow, a shrink on an injected Newton failure, the documented underflow
refusal) — tests only; no change to the continuation code.

**Gate:** full gate.

**Wave 2 merge order:** WP5 → WP6 → WP7 → WP8.

---

## Wave 3 — the verifier · 2 subagents, then 1 · effort M + S, then M

The identity verifier is one theme and one set of files, so it is sequenced within the wave.

### WP9 — One identity verifier, ρ-sized, fail-closed · closes PSW-1 (= SOLV-14), PSW-8, PSW-9, PSW-4, PSW-5, TEST-2 (`?? 500` mutant)

**Files owned:** `apps/quadrature-domains/app/solvers/solver.mjs` (a new shared `runIdentityCheck` + `_computeIdentity`;
**not** `sameDomain`/`phisEquivalent`, which are WP10's), `apps/quadrature-domains/app/solvers/solver-qd.mjs`,
`apps/quadrature-domains/app/solvers/solver-uqd.mjs`, the `verifyQuadratureIdentity_*` functions of the eight
weighted `solver-*.mjs` (opt-in, see below), `apps/quadrature-domains/app/analysis/observables.mjs`
(`estimateAccuracy.underResolved`), `apps/quadrature-domains/app/param-slice/param-slice-common.mjs` (the
`unresolved` class + its colour; WP8 has merged), `apps/quadrature-domains/app/param-slice/param-slice-ui.mjs`
(legend + Quality help text), `apps/quadrature-domains/app/ui/ui-solve.mjs` (the validity badge reads
`trustedSignal` and renders `unresolved`), `apps/quadrature-domains/app/test/solvers-1.test.js`,
`apps/quadrature-domains/app/test/cusp-accuracy.test.js`, `apps/quadrature-domains/vitest/identity-verifier.test.ts` (new).

**Changes.** Lift the moment loop, the node-count policy and the escalation into one shared
`runIdentityCheck({sampleAt, momentsAt, rhsAt, scaleAt, rho})` in `solver.mjs`; the bounded and unbounded
classical verifiers supply only their moments and RHS. Policy: `N = clamp(ceil(2.5·ln(1/τ)/ln(1/ρ)), 500,
cap)` with `ρ = maxⱼ|phi.branches[j].z|` (free — φ carries `z`), then the UQD-style doubling with the
`improved` guard as backstop, then **fail closed**: when the error is still falling at the cap the result
is `identityOK: null` with `underResolved: true`, never `false`. `isValidQD` treats `null` as _not
certified_ (no green badge) and the badge says "unresolved at N nodes"; the slice paints a distinct
`unresolved` class (PSW-1 fix c). Report the node count used and whether it escalated on every result.
PSW-8: the badge honours `trustedSignal: 'geometry'`. PSW-4/5: the Quality help text says what the
presets actually do, and a warm-started pixel is verified to the same rigor as a cold one. The weighted
families keep their own verifiers this wave (WP20 replaces them) but route their node count through the
same policy. Measure and record the slice cost (A5 measured +59 % on a ~0.38 ms/px render) and the Inverse
tab's. Tests: `0.58/(w−1)+1.54/(w+1)` returns `identityOK === true` at default options; the same `h` with
`A_{1,1}` perturbed 1 % returns `false` at every ρ in A1's sweep; a sweep of `two-point-sym` over
`[0.5, 2.5]²` at Standard asserts **zero** `identity-fail` and the count of `unresolved`; `?? 120` in place
of the policy must go red. Add the closed-form controls A5 measured as the slice's first classification
tests: the one-node disk flips at `C = 0`, the cardioid fold at `C₂ = 0.5 ± 0.005`.

**Gate:** full gate. Record the two costs in `STATUS.md`.

### WP11 — `parse-h` says what it decided · closes SOLV-5, SOLV-6 (parse-h half), SOLV-10 · runs in parallel with WP9

**Files owned:** `apps/quadrature-domains/app/core/parse-h.mjs`, `apps/quadrature-domains/app/ui/ui-h-text.mjs`
(`:164`, the warning display; WP2 has merged), `apps/quadrature-domains/app/test/parse-h.test.js` (new, registered),
`apps/quadrature-domains/app/solvers/solver.mjs` **only** `scaleHDataPoles` (SOLV-10 — a three-line function;
if WP9's diff touches the same hunk the orchestrator resolves it).

**Changes.** SOLV-5: verify `Q == (w−a)^k` at the recovered root rather than coefficient-by-coefficient
with a magnitude-relative tolerance — evaluate `Q` and its first `k−1` derivatives at `a` relative to
`|Q|` on a circle of radius `|a|`-scaled `δ`, or fall through to Phase 2 whenever the strict check is not
_exact_ to 1e-12 in root-centred coordinates. Phase 1 must emit **warnings** (the channel exists and the UI
is wired): "two roots at 1000000 and 1000010 were merged into a double pole", "a residue of 1e-15 was
dropped" (SOLV-6: make the `1e-14` cut-off relative to the largest coefficient of the same term and warn;
leave `@cas/core`'s `trim` alone and note it in the code). SOLV-10: `scaleHDataPoles` carries `polyPart`.
Tests: `1/((w−1000000)(w−1000010))` parses to two simple poles with residues ±1e-1 (and the reconstruction
matches the literal function to 1e-12 at three points); `1/((w−1)(w−1.00001))` still merges (it is the
right regularisation) **and warns**; `1e-15*w^2 + 1/(w−3)` keeps its `w²`; the mutant `1e-10 → 1e-6` goes
red.

**Gate:** full gate.

### WP10 — Non-dimensionalise the solver · closes SOLV-1, SOLV-4, SOLV-6 (gates), SOLV-7, SOLV-8, SOLV-9, TEST-2 M03/M04/M05/M07 · **after WP9 and WP11 have merged**

**Files owned:** `apps/quadrature-domains/app/solvers/define-family.mjs` (`normalizeOpts` → `norm.hScale`),
`apps/quadrature-domains/app/solvers/solver.mjs` (every gate named below; `sameDomain`,
`phisEquivalent`, `canonicalizeByRotation`; `residualNorm`, `sampleBoundary`, `segmentsCross`,
`isBoundaryUnivalent` tests), `apps/quadrature-domains/app/solvers/solver-qd.mjs` and `solver-uqd.mjs`
(the `areaScale` floor inside the shared check WP9 built), `apps/quadrature-domains/app/solvers/solver-continuation.mjs`
(`minStep`), `apps/quadrature-domains/app/test/scale-covariance.test.js` (new, registered),
`apps/quadrature-domains/app/test/solver-primitives.test.js` (new, registered), `apps/quadrature-domains/vitest/solver-identity-tol.test.ts`.

**Changes.** Compute one `hScale` in `normalizeOpts` (`R = max(maxⱼ|aⱼ − w₀|, |c|, …)` — the radius the
identity is covariant under) and express every absolute gate as a multiple of it: `IDENTITY_TOL`'s floor
(`areaScale · R^k` bounded, the reciprocal power unbounded — SOLV-1), Newton's `tolerance` (SOLV-7),
`phisEquivalent`'s `tol` (SOLV-8), `continuationInC`'s `minStep` split into a step floor and a value
floor (SOLV-9), `QR_SINGULAR_TOL`'s pivot (the Aug-17 LOW — one line), `DEFAULT_FD_EPS` as a relative step.
Keep the `hScale ≈ 1` path **byte-identical** — dump every preset's solution before and after and diff.
SOLV-4: `canonicalizeByRotation` starts from `clonePhi(phi)` and overwrites only `branches`, returns the
input unchanged when `phi.unbounded` (the unbounded gauge is `c > 0` real, thesis `φ′(∞) > 0`);
`phisEquivalent` compares `c`, `polyA`, `z0`, `q`, `gamma`, `alpha` and treats `w0: undefined` as absent.
Tests: the **scale-and-rotation regression family** (report improvement 13) — every shipped preset under
`a → s·a, C_{j,s} → s^{s+1}·C_{j,s}, c → s·c` at s ∈ {1e-3, 1, 1e3}, the scale-normalised solution
identical to 1e-9 and every verdict (`univalent`, `identityOK`, `sameDomain` against s = 1) equal; the
same domain at s = 1 and s = 1e4 gives `maxRelDiff` within one order; a 1 %-perturbed φ is rejected at
every scale (there is no such test today); `sameDomain(deltoid@c=0.4, deltoid@c=0.1) === false`. The
four primitive tests: `residualNorm([3,4]) === 5` and a vector whose last component dominates (M07);
`sampleBoundary`'s ring closes (M04); `segmentsCross`'s endpoint exclusion at its ε (M05);
`isBoundaryUnivalent` on a φ with a non-finite sample fails closed (M03).

**Gate:** full gate; the preset dump diff empty at s = 1.

**Wave 3 merge order:** WP11 → WP9 → then spawn WP10 → merge.

---

## Wave 4 — the wire and the pictures · 3 subagents in parallel · effort M each

### WP12 — What crosses the wire is this domain · closes UI-2, WGT-1 (consumer half), UI-8 · cross-app

**Files owned:** `apps/hele-shaw-flow/src/importHeleShaw.ts`, `apps/hele-shaw-flow/src/heleShawOnePoint.ts`,
`apps/hele-shaw-flow/test/importHeleShaw.test.ts`, `apps/complex-dynamics/src/**` **only** the σ/map import
refusal path (`importMap.ts` or wherever `form:"schwarz"`/`kind:"map"` payloads are accepted — locate
first; report the file), `apps/complex-dynamics/test/importMap.test.ts`, `packages/interchange/src/goldens.ts`,
`packages/interchange/src/schema.ts` (only if a `weight` seat needs widening — say so), `apps/quadrature-domains/vitest/schwarz-handoff-link.test.ts`,
`apps/quadrature-domains/app/ui/ui-url-state.mjs` (UI-8: keep the preset id in the hash),
`apps/quadrature-domains/app/ui/ui-presets.mjs`.

**Changes.** UI-2: the consumer seeds `solveZ0`/`realRootGeq1` from the wire's `phi.branches[0].z` (already
carried, currently discarded) and **verifies** `recoverCharge` against the wire's α, reporting a mismatch
rather than resolving it; the `QD_TO_HELESHAW_LINK` golden pins z₀ (or the area t) on both sides, the way
`QD_TO_CD_DELTOID_PHI_AT_2` does. Both consumers refuse a payload carrying `weight` with a kind they cannot
reconstruct (WP1 emits it) with a named message; a payload without `weight` stays accepted unchanged.
Run every consumer test of `packages/interchange`, `apps/complex-dynamics` and `apps/hele-shaw-flow`.
UI-8: a reload reports the preset's name, not "— custom —", when the state still equals the preset.
Negative control for UI-2: the pre-fix consumer on the `unb-1pt-neg` payload must fail the new geometric
golden.

**Gate:** full gate (which runs those three projects) + the QD browser suite.

### WP13 — Figures and links carry their recipe · closes UI-4, SCH-5, TEST-10 (docs half), report improvement 28

**Files owned:** `apps/quadrature-domains/package.json` (+ `@cas/export` dependency; the lockfile change is
consuming an existing package), `apps/quadrature-domains/app/ui/ui-figure-export.mjs`,
`apps/quadrature-domains/app/schwarz/schwarz-export.mjs` (the PNG path only — WP1 has merged),
`apps/quadrature-domains/app/schwarz/schwarz-ui.mjs`, `apps/quadrature-domains/app/ui/ui-url-state.mjs`
(`selectedSolutionIdx` + the Schwarz view block — **WP12 also edits this file for UI-8; WP13 owns the
codec's new fields, WP12 the preset id; the orchestrator merges WP12 first**),
`apps/quadrature-domains/vitest/figure-export-ui.test.ts`, `apps/quadrature-domains/vitest/qd-url-state.test.ts`
(new cases), `apps/quadrature-domains/vitest/browser/schwarz-export.browser.test.ts`.

**Changes.** Stamp both PNG paths (the domain figure and the Schwarz/sphere export) with `Software` and
`cas:state` through `@cas/export`'s documented keys (`injectPngText`; it handles non-Latin-1 since the M6
review), the state being the app's own `#vs=` payload. Put the Schwarz view (`view, cx, cy, scale,
maxIter, colormap, scaleMode, modK, resolution` + the sphere camera) and `selectedSolutionIdx` in the
`#vs=` codec; a restored index past the alternate count found on this machine refuses by name. Tests:
`readPngText` on an exported figure returns the state that re-opens it (by verdict: apply it, same badge
and geometry); a Schwarz link round-trips its view; an alternate's link reopens on the alternate.

**Gate:** full gate + QD browser suite.

### WP14 — The mask stops shrinking Ω · closes SCH-1, SCH-3, SCH-6 · cross-app (`@cas/gpu`, Complex Dynamics)

**Files owned:** `apps/quadrature-domains/app/schwarz/schwarz-webgl.mjs`, `apps/quadrature-domains/app/sphere/sphere-webgl.mjs`,
`apps/quadrature-domains/app/sphere/sphere-ui.mjs`, `apps/quadrature-domains/app/schwarz/README.md` (`:42`, `:118-130`),
`apps/quadrature-domains/vitest/browser/schwarz-mask.browser.test.ts`, `packages/gpu/src/maskTexture.ts`,
`packages/gpu/test/**`, `apps/complex-dynamics/src/render/schwarzGL.ts` (the mask call site only),
`apps/complex-dynamics/test/schwarzMask.browser.test.ts`.

**Changes.** SCH-1: in both shaders, when the mask says NOT-in-Ω and the point is within one mask texel of
the stroke, run ψ and let `acceptZ` decide (the exact predicate the fast path already trusts); the mask
becomes a pre-filter. Do the same in `@cas/gpu`'s consumer path for Complex Dynamics, or — if the shader
there cannot call ψ — rebuild the mask per view sized so one texel ≤ one screen pixel and **refuse/annotate
when it cannot** (say which was done and why). Add class-agreement clauses at **30× and 300×** to both
browser suites (A6 measured 99.48 % and 94.81 % against the test's own 98.87 % floor; the fix must put
300× above 99.5 %), and an escape-time _value_ clause (grayscale + smooth, invert the LUT; A6's
`probe-n2.js` recipe is in the findings) so a shader off by ten iterations everywhere no longer passes.
SCH-3: a refused φ under forced GPU clears the previous frame and the status says "not rendered". SCH-6:
one `webglcontextlost` handler per mount, and the restore path passes the escape radius. Unify the
escape-radius definition (three today) behind one exported function. Rewrite `schwarz/README.md`'s cost
claim as measured.

**Gate:** full gate + QD browser suite + `apps/complex-dynamics` browser suite + `packages/gpu` browser
suite (all three take `/opt/pw-browsers/chromium`).

**Wave 4 merge order:** WP12 → WP13 → WP14.

---

## Wave 5 — robustness, shell, tests, tooling · 4 subagents in parallel · effort M, M, M, S

### WP15 — Algebra engine robustness · closes ALG-2, ALG-3, ALG-5, ALG-6, ALG-7, ALG-9, ALG-10, ALG-11, report improvement 17

**Files owned:** `apps/quadrature-domains/app/sym/sym-core.mjs` (`MPoly.pow`, `MPoly.fromTermList`; WP4 has
merged), `apps/quadrature-domains/app/algebra/expr-parser.mjs`, `apps/quadrature-domains/app/algebra/algebra-store.mjs`,
`apps/quadrature-domains/app/algebra/algebra-ui.mjs`, `apps/quadrature-domains/app/algebra/sym-worker.mjs`,
`apps/quadrature-domains/app/algebra/prove-plan.mjs`, `apps/quadrature-domains/app/algebra/algebra-moment-parse.mjs`,
`apps/quadrature-domains/app/algebra/cas-export.mjs`, `apps/quadrature-domains/app/test/expr-parser.test.js`,
`apps/quadrature-domains/app/test/algebra-store.test.js`, `apps/quadrature-domains/app/test/cas-export.test.js`,
`apps/quadrature-domains/vitest/sym-worker-*.test.ts`.

**Changes.** ALG-2: `fromTermList` validates every exponent (non-negative integer) and every import path
fails closed with the offending cell named. ALG-3 + improvement 17: `MPoly.pow` by repeated squaring, one
`estimateSize(poly, op)` predicate consulted by the parser, `defineSubstitution` and `addEquation` (the
`previewCost` seam) so the app refuses before allocating; `(z1+zb1)^6000` must refuse in < 50 ms and
`(x+y)^40` must still compute. ALG-5: `_validateDefine` rejects `i`/`I`, the `__re`/`__im` suffix pattern
and each CAS dialect's reserved names. ALG-6: surface the worker fallback once (toast) and hide Cancel while
latched; honour `runOpts.signal` on the fallback path if cheaply possible. ALG-7: the three C-route plans
consult `realSolutionCount` before stamping `rigor: 'exact'`, else stamp `≈`. ALG-9/10/11 as the findings
state. Differential test for `pow`: old vs new over random `p`, `k ≤ 40`, exact equality.

**Gate:** full gate.

### WP16 — Shell robustness and the slice UI · closes UI-5, UI-6, UI-7, UI-9, UI-10, PSW-6, PSW-7, PSW-10, PSW-11, PSW-13, PSW-14, SCH-9, SCH-10

**Files owned:** `apps/quadrature-domains/app/index.html`, `apps/quadrature-domains/app/main.mjs`,
`apps/quadrature-domains/app/lazy-features.mjs` and `app/lazy/*.mjs`, `apps/quadrature-domains/vite.config.mjs`
(PWA registration/update hooks), `apps/quadrature-domains/app/ui/ui-domain-plot.mjs`, `apps/quadrature-domains/app/ui/ui-domain-mode.mjs`,
`apps/quadrature-domains/app/ui/ui-state.mjs`, `apps/quadrature-domains/app/param-slice/param-slice-render.mjs`,
`apps/quadrature-domains/app/param-slice/param-slice-ui.mjs` (everything WP8/WP9 did not touch — the
1-D readout, the sidebar/picture coupling, the legend brightness note), `apps/quadrature-domains/app/param-slice/README.md`,
`apps/quadrature-domains/app/sphere/README.md`, `apps/quadrature-domains/vitest/ui-*.test.ts`, `apps/quadrature-domains/vitest/browser/boot.browser.test.ts`.

**Changes.** UI-5/UI-7: wire `vite-plugin-pwa`'s `onNeedRefresh` to the existing banner and populate
`#app-version` from the build (or delete both if the owner prefers — default: wire them). UI-6: the domain
plot canvas gets `role="application"`, a generated label naming the domain and its verdict, `tabindex="0"`
and arrow-key pan/zoom (in-app; not `@cas/ui`). UI-9: a blocked `localStorage` does not change the
first-visit domain. UI-10: re-sample the boundary polyline on zoom above the sample density. PSW-6: the 1-D
sweep fills `classGrid`/`gridDims`/`nearestPhi` and plots ordered class transitions with bracketing values
(report improvement 22). PSW-7: the sidebar describes the picture on screen. PSW-10/11/14 and SCH-9/10 as
stated in the findings. PSW-13: a failed lazy chunk shows an error in the tab, and a tab toggle during load
replays activation once. Accessibility-tree check over CDP after: 0 unnamed interactive nodes, the canvas
present.

**Gate:** full gate + QD browser suite.

### WP17 — Tests and CI as an instrument · closes TEST-3, TEST-5, TEST-6, TEST-7, TEST-9, TEST-12, TEST-13, report improvement 30 (remainder)

**Files owned:** `.github/workflows/deploy-pages.yml`, `.github/workflows/ci.yml`, `apps/quadrature-domains/vitest.browser.config.ts`,
`apps/complex-function-plotter/vitest.browser.config.ts`, `packages/schwarz/vitest.browser.config.ts`,
`apps/quadrature-domains/perf/*.mjs`, a new `scripts/resolve-chromium.mjs`, `apps/quadrature-domains/tsconfig.json`,
`apps/quadrature-domains/eslint.config.mjs`, `apps/quadrature-domains/app/test.html` (delete),
`apps/quadrature-domains/app/qd/qd-equations.mjs` (delete the dead conjugation trio — TEST-3),
`apps/quadrature-domains/vitest/browser/direct.browser.test.ts` (new), `apps/quadrature-domains/app/test/solvers-{1,2,3,4}.test.js`
(rebalance by moving whole `{ … }` blocks; the concatenation invariant must hold — check with `cat` + `diff`),
`apps/quadrature-domains/vitest/worker-url-static-literal.test.ts` (+ the built-chunk companion).

**Changes.** TEST-9: make the `browser` job a publish blocker in `deploy-pages.yml` (six lines of YAML) —
**this is the owner's call; do it, and say in the report that it adds ~50 s to every master push**. Then
`direct.browser.test.ts`: dispatch `tab-changed → direct`, assert the tab mounted and recomputed on one
bounded and one unbounded input (covers 2,128 of TEST-12's 3,829 unreached lines). TEST-5 + the two
CLAUDE.md gaps: one `resolveChromium()` used by every Playwright entry point in the repo
(`[env.QD_CHROME_PATH, env.CAS_CHROMIUM_EXECUTABLE, "/opt/pw-browsers/chromium", …].find(existsSync)`);
`pnpm perf:measure` runs on this container. TEST-6: `tsconfig.json` `include`s the Vitest specs so they are
type-checked; report what that surfaces and fix only what is in this app. TEST-13: turn `no-unused-vars`
to `error` (the backlog is 0). TEST-7: delete `app/test.html`. Shard rebalance: critical path from 33.5 s
toward ~22 s. Built-chunk companion: assert each `*-worker-entry-*.js` exists in `dist/assets` after
`vite build`.

**Gate:** full gate + QD browser suite; confirm `deploy-pages.yml` parses (`actionlint` if available, else
a dry read).

### WP18-pre — Widen the clean-realm battery · closes TEST-1's second half · effort S

**Files owned:** `apps/quadrature-domains/app/test/worker-graph-cleanrealm.test.js`,
`apps/quadrature-domains/app/test/worker-graph-cleanrealm.child.mjs`.

**Changes.** The battery covers `solver-graph.mjs` only; add the two other production worker entries
(`param-slice-worker-entry.mjs`, `analysis-worker-entry.mjs`) and the LQD families to the cases (A5 ran the
wider version and it is clean today, so this is a free widening of a guard that already exists).

**Wave 5 merge order:** WP18-pre → WP17 → WP15 → WP16.

---

## Wave 6 — documentation currency · 2 subagents in parallel · effort M, S

Last among the fixes, so it describes the code as it ends up.

### WP18 — App-local documentation · closes DOC-2 … DOC-13, WGT-5/6/7, DIR-9 (doc half), DIR-11, SOLV-11, SOLV-12, SCH-8, PSW-4 (doc), TEST-10 (doc), and every row of the nine drift tables

**Files owned:** everything under `apps/quadrature-domains/*.md`, `apps/quadrature-domains/app/**/README.md`,
`apps/quadrature-domains/HELPTEXT.md`, `apps/quadrature-domains/app/ui/ui-strings.mjs` (`:36` only),
`apps/quadrature-domains/package.json` (`repository.url`, `description`), the code comments named in the
drift tables (each a comment-only edit: `solver-pqd.mjs:20`, `schwarz-common.mjs:293`, `solver.mjs:1755`
doc block, `param-slice-render.mjs:232-260`, `solver-lqd-singular.mjs` "INDEPENDENT", `direct-common.mjs`
headers not already fixed by WP5), a new `apps/quadrature-domains/historical/` directory, a new
`apps/quadrature-domains/USER-GUIDE.md`, `apps/quadrature-domains/vitest/docs-currency.test.ts` (new).

**Changes.** Work the nine drift tables row by row (`findings/A*.md` § Documentation drift), checking each
against the code **after** waves 1–5. Structure (report improvement 31 / A8's proposals): a stated reading
order at the top of README (new here / resuming work / doing mathematics); README split — the ~400-line
per-control UI manual moves to `USER-GUIDE.md`; `historical/` receives `ESM-MIGRATION.md`, `PLAN-SPHERE.md`
(with a one-line "shipped as a Schwarz view mode; superseded" banner), and the old `prop463.txt` if WP0
kept it; `THEORY_MAP.md` drops its line numbers in favour of symbol names (164/164 symbols resolve; 30/30
lines do not) and gains the **Chapter IV (PQD)** section it never had; `ARCHITECTURE.md` lists all ten
families and the three hand-off buttons; a new README section records the **three cross-app hand-off
contracts** app-locally with links to the goldens; `TODO.md`'s five shipped items are checked with the
implementation path; `HANDOFF.md`'s eleven "(most recent)" headings are renumbered by entry; `HELPTEXT.md`
and `ui-strings.mjs:36` point at real files; `CONTRIBUTING.md`'s test section links `node-test.js`'s
`TESTS` instead of copying it and states the measured timing. `docs-currency.test.ts`: every backticked
path in the **live** app-local docs resolves against `git ls-files`; README's family table row count equals
the number of `registerFamily(` sites. The findings' "verified correct" lists are the rows you may skip.

**Gate:** full gate (the new spec must be green on the first run against the real docs).

### WP19 — Repo-level documentation and the review loop · closes DOC-12, the CLAUDE.md / `vitest.workspace.ts` claims, `docs/refactor/ASSESSMENT.md`'s banner

**Files owned:** `CLAUDE.md` (the QD sentences only: the "one Vitest spec wrapping `node app/node-test.js`"
claim; the browser-config paragraph after WP17's `resolveChromium`; a one-paragraph pointer to this review),
`vitest.workspace.ts` (its comment), root `README.md` (test counts, if moved), `docs/refactor/ASSESSMENT.md`
(closing banner), `docs/review/2026-08-23-comprehensive-review/PROGRESS.md` (a follow-up section: A2 and A3
MEDIUMs fixed, with the commits), `docs/review/2026-09-20-quadrature-domains-review/STATUS.md` (the closing
tally), `docs/DECISIONS.md` (**only if** the owner has approved an ADR from _Decisions to record_ below —
otherwise do not touch).

**Gate:** full gate.

**Wave 6 merge order:** WP18 → WP19.

---

## Wave 7 — the research-facing improvements · one subagent each, spawned as the owner approves · effort M–L

These are the report's §9 proposals that are features rather than fixes. Each is independent of the others
unless stated, so any subset can run in parallel; the file sets are disjoint from one another but overlap
waves 1–5, which is why they come last. **Each needs the owner's go/no-go**, recorded in `STATUS.md`.

| WP   | Improvement                                                                                                                                                  | Report § | Effort | Files (disjoint within the wave)                                                                                       | Prerequisite |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------ | ---------------------------------------------------------------------------------------------------------------------- | ------------ |
| WP20 | The thesis coincidence equation as the weighted families' verifier (one FFT; the only check that sees `q`), plus the α → 1 / α → 0⁺ limit tests and the eight-rotation equivariance test; investigate WGT-4's two failing rotations | 9.5, 9.10 | M | the eight weighted `solver-*.mjs` verifiers, `solver-pqd-common.mjs`, `solver-lqd-common.mjs`, `solvers-{1,4}.test.js`, a new `weighted-coincidence.test.js` | WP9, WP10 |
| WP21 | Theorem 3.3.1's existence criterion as a pre-flight gate on the one-point family, reported as an explanation, not a refusal                                    | 9.4      | S      | `solver-uqd.mjs` `normalizeOpts`, `ui-solve.mjs` (the message), `solvers-2.test.js`                                   | WP8          |
| WP22 | Weighted closed forms in the analytic-oracle gallery (Thm 5.3.2, 5.6.1, Ex. 4.3.1, Thms 4.5.1/4.5.3), and pin every existing example to a thesis equation or figure (DIR-9; two examples are not in the thesis — drop or relabel) | 9.9      | M      | `analysis/thesis-examples.mjs`, `ui/ui-thesis.mjs`, `app/test/thesis-examples.test.js`                                 | WP0 (the thesis text) |
| WP23 | Widen the unbounded direct problem to rational φ (poles in 𝔻\*), then give the Direct tab the Inverse tab's validity badge                                    | 9.6, 9.7 | M+M    | `direct/direct-common.mjs` (split into classical/weighted first — report §6), `direct-recompute.mjs`, `direct-ui.mjs`, `direct.test.js` | WP5          |
| WP24 | An analytic Jacobian for the classical families, FD cross-checked per family; clamp inside `residual` in both schema and hand-written families or in neither    | 9.11     | M      | `solver.mjs` (`newtonSolve`'s `jacobianFn` path), `solver-qd.mjs`, `solver-uqd.mjs`, `solver-faber.mjs`, a new `jacobian.test.js` | WP10         |
| WP25 | Expose `comprehensiveGroebnerSystem` as "Analyse parametrically" (one column per segment, `parametricRealCount1D` on each 1-parameter segment); step 0 is making CGS non-defective on the A&S system | 9.14     | M–L    | `sym-core.mjs` (`_cgsRec`), `algebra-store.mjs`, `algebra-ui.mjs`, `prove-plan.mjs`, `AHARONOV_SHAPIRO.md`, tests      | WP4, WP15    |
| WP26 | Radical/squarefree normalisation as an explicit audit-trailed reduction; then the exact-algebraic certification chain (`padeApproximant` → `rationalReconstruct` → `inIdeal`); cost-aware elimination-variable choice | 9.15, 9.16, 9.18 | M+M+S | `sym-core.mjs`, `algebra-store.mjs`, `algebra-op-runner.mjs`, `prove-plan.mjs`, tests                                  | WP4, WP15    |
| WP27 | α as a sweepable axis; slice state in the share link; export the classified image with provenance (`h`, both `ParamRef`s, quality, per-pixel node count); gate warm-start on the family tag | 9.19, 9.21, 9.23 | M | `param-slice/*.mjs`, `ui-url-state.mjs` (the `ps` block), `param-slice.test.js`                                       | WP9, WP13    |
| WP28 | Boundary tracing (predictor–corrector on the fold and the univalence boundary) as an overlay on the raster                                                    | 9.20     | M      | `param-slice-render.mjs`, `analysis/family-sweep.mjs`, `solver-continuation.mjs` (read), tests                        | WP27         |
| WP29 | A GPU path for the four PQD families (`cpow(v, 1/α)`); extract `renderFractalToTarget` so the sphere stops re-packing uniforms                                | 9.25, 9.27 | M+M  | `schwarz-webgl.mjs`, `sphere-webgl.mjs`, `schwarz-common.mjs`, both browser suites                                   | WP14         |
| WP30 | Close the singular-family `z₀ = 0` corner (Theorem 5.3.1's null LQDs) with its own gauge                                                                      | 9.12     | L      | `solver-lqd-singular.mjs`, `solver-pqd-singular.mjs`, their schemas and seeds, tests                                  | WP20         |
| WP31 | A `form:"weighted-laurent"` MapSpec and a weighted σ branch in `@cas/schwarz` (Correspondences the second consumer) — **needs an ADR first**                   | 9.29     | L      | `packages/interchange`, `packages/schwarz`, `schwarz-export.mjs`, Complex Dynamics import                             | ADR approved |

---

## Decisions to record (owner's call; outside any WP until decided)

1. **The `browser` job as a publish blocker** (WP17 does it; say no and WP17 leaves `deploy-pages.yml`
   alone and the σ-mask class keeps shipping unseen).
2. **`weight` on the wire now, a weighted MapSpec later** — WP1 emits `weight` inside the existing schema
   seat; WP31's form wants an ADR (`docs/DECISIONS.md`, superseding nothing; ADR-0007's second consumer is
   Correspondences).
3. **Refuse or build for `h ≡ 0`, bounded `polyPart`** — WP8 refuses by name. README `:944` should then
   read "not applicable" rather than "deferred" for bounded-LQD polynomial `h`.
4. **The SW update banner** — wire it (WP16's default) or delete it.
5. **Which of Wave 7 to run**, and in what order — the plan's own recommendation is WP20, WP21, WP22, WP23,
   WP25, WP27, then the rest.

## Not in this plan

- `@cas/core` `poly.trim`'s absolute epsilon (suite-wide; a one-line ADR-0006-style note if changed).
- QD onto `@cas/ui` or `@cas/rigor` (locked decisions).
- The Aug-17 `Taylor.invert` relative guard — one line, documented; fold into WP10 if the subagent has
  time, otherwise it stays as it is.

---

## Appendix A — the subagent brief (fill in per WP)

> Read `/CLAUDE.md` at the repo root first (the locked decisions, the guardrails, the gate paragraph).
> Then read `docs/review/2026-09-20-quadrature-domains-review/REPORT.md` §{sections} and the finding
> sections {ids} in `findings/{file}.md` — every command, input and expected number you need to reproduce
> the defect is there. Then read `REMEDIATION-PLAN.md` § "How the subagents run" and your section, **WP{n}**.
>
> You are working in your own git worktree on a throwaway branch; the orchestrator merges it. **You own
> exactly these files:** {list}. If you need to edit any other file, stop and report which and why —
> do not edit it. Do not push. Do not touch `STATUS.md` (the orchestrator does).
>
> Steps: (1) reproduce each finding on the clean worktree and record the number you saw; (2) implement the
> change as the WP states it — if measuring shows the plan is wrong, do what is right and say so; (3) add
> the regression test the WP names, then **revert your fix, run it, see it fail, restore** (the negative
> control); (4) run the full gate from the repo root, never through `tail`/`head`:
> `pnpm lint && pnpm typecheck && pnpm test && pnpm build`{+ browser suites the WP names}; (5) commit in
> small commits, one per finding where practical, no model identifiers in the tree; (6) `git status
> --short` must show nothing untracked or modified.
>
> Report in at most ten lines: the commit hashes; the gate numbers (files/tests, and the QD node-suite
> assertion count — it may not go down from {baseline}); the findings closed; anything the plan got wrong
> and what you did instead; anything the owner has to decide.

## Appendix B — the orchestrator's loop per wave

1. Read `STATUS.md`; confirm the integration branch is green at its head (run the gate once).
2. Spawn every WP of the wave in one message: `Agent` with `subagent_type: "general-purpose"`,
   `model: "opus"`, `isolation: "worktree"`, `run_in_background: true`, the Appendix A brief with the WP's
   section pasted in verbatim.
3. Wait for all reports. For each, in the wave's stated merge order: merge the worktree branch into the
   integration branch (`git merge --no-ff`), run the full gate, and if red, **do not merge the next one** —
   send the WP's subagent the failure (`SendMessage`) and wait for its fix commit.
4. Update `STATUS.md` (each WP's line: commits, gate numbers, deviations), commit, push the integration
   branch.
5. Post the wave summary to the owner in the CLAUDE.md "be brief" form, and **stop for review**. The next
   wave starts only on the owner's word.
