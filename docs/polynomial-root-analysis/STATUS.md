# Polynomial Root Analysis — status: read first, update last

Plan: [`PLAN.md`](PLAN.md) · Spec: [`DESIGN.md`](DESIGN.md) · Record: [ADR-0047](../DECISIONS.md#adr-0047) ·
Evidence: [`research/`](research/) · Branch of record for the planning round: `claude/polynomial-galois-suite-7iqcb2`.

**Rule (inherited from M8):** do the step named under _Current_, update this file, commit, push. Never
end a session with unpushed work. A step that cannot be done as written is recorded under _Findings_,
not silently changed.

## Current

**PRA-2 — analysis overlays, wave 1** (PLAN §7), awaiting the owner's go-ahead. It brings KaTeX
(the discriminant is the first typeset formula) and the app's first browser suite (the pseudozero
ladder's shader), which joins the root `test:browser` chain.

## Done

- 2026-09-23 — **PRA-1.1, the lifts.** `cauchyBound` + `polishRoot(s)` into `@cas/core` from
  `@cas/faber` and Contour Integration (both shown **bit-identical** by fingerprinting
  `polynomialRoots` and `findPoles` before and after); `toExactRational`/`simplestRational` moved
  (`git mv`) into `@cas/exact`; `smithDiscs` + exact disc tests new in `@cas/exact`; the keyed
  builder moved (`git mv`) into `@cas/ui` with its eleven tests.
- 2026-09-24 — **PRA-1 complete (1.1–1.4).** PRA-1.3 the shell: two panes over one `ShellState`,
  root and coefficient drags with ring invariants (ℝ drags a conjugate pair, ℚ snaps on release to the
  simplest rational within half a pixel), keyboard parity, the `#vs=` permalink with refusals by name,
  undo/redo, the figure (verdict in the caption and the PNG text), the root-form phase portrait on
  CET-C6. PRA-1.4 the gate: 30-case corpus (per-root backward error ≤ 16ε, forward error within Vieta's
  predicted bound, bit-exact root form, exact discs, Yun-decided multiplicities); `a₀` round a circle
  returns every root to its own label and round a branch point swaps exactly two; the two-state
  `applyState` test in both directions; sweep 34 mutants, 32 killed, 2 equivalent; a11y roster
  `polynomial-root-analysis` + `-overlay` clean. GATE_PLACEHOLDER
- 2026-09-24 — **PRA-1.2, the engine.** `src/engine/`: the dual-form `Polynomial` with its ring
  invariants, the typed-polynomial reader, Aberth (moved into `@cas/core`) + exact refinement, Smith
  discs, Yun-decided multiplicities, conditioning, ℚ-mode snapping; the 30-case corpus.

- 2026-09-23 — **PRA-0.** Owner accepted ADR-0047 and the three PLAN §12 decisions. The app
  (`apps/polynomial-root-analysis`, port 5185, `@cas/ui` only) mounts a header, a notice and two empty
  named panes inside `runWithFatalBoundary`; wired into `vitest.workspace.ts`, the test census,
  `APP_NAMES`, the a11y roster + baseline, `.claude/launch.json` (`pra`), the launcher (_Coming soon_),
  README, ARCHITECTURE §8/§11, CLAUDE.md and the ideas file. Gate **623 files / 7116 tests** (622 / 7111
  before: +1 file / 5 tests, `test/scaffold.test.ts`). Sweep **11/11 killed** (role, label, labelling,
  replace-vs-append, notice, landmark containment, `<h1>`, `data-pane`, the missing-host throw, the
  boundary, the mount). `pnpm a11y polynomial-root-analysis launcher --strict`: clean, 14 interactive
  nodes, 0 unnamed; no horizontal scroll at 390 px.

- 2026-09-22 — two rounds of owner questions (answers recorded verbatim below), five research tracks,
  PLAN + DESIGN written, ADR-0047 drafted as _Proposed_ (as ADR-0046 until the collision below), the idea entered in
  `docs/design/future-app-ideas.md` as ▶ 8. No code touched.

## Findings (things learned while executing; each names its step)

- _(PRA-1.1)_ **`smithDiscs` in `Frac` arithmetic took 8.2 s at degree 24**, three orders over the
  8 ms budget: `Frac.of` reduces by gcd on every operation. Rewritten over scaled Gaussian integers
  (one common denominator per side, homogenised Horner, no reduction inside the loops) it took
  18–45 ms; the remaining cost was the 276 pairwise disjointness tests on ~6000-bit products, so a
  log₂-bracket prefilter decides every pair farther than a relative 1e-6 from touching and only the
  rest reach the exact test. **0.8–1.8 ms at degree 24** (unity, random, and 1e-30-scaled roots),
  inside budget, so discs are computed per frame. The prefilter's two margins were each mutated in
  both directions; it took a bisection to the exact touching threshold and an EXACTLY touching pair
  (`z² − 1` about −1/3 and 1, ρ = 4/3) to kill them — the random corpus never came close enough.
- _(PRA-1.1)_ **The disjointness test is exact and tight**, not PLAN/DESIGN's AM–GM
  `|zᵢ − zⱼ|² > 2(sᵢ + sⱼ)`: `δ² − sᵢ − sⱼ > 0 ∧ (δ² − sᵢ − sⱼ)² > 4sᵢsⱼ` is the same inequality
  squared, and the AM–GM form would merge discs a factor √2 apart (tested: radii 1 and 0 at distance
  √1.01 are disjoint, which AM–GM cannot see).
- _(PRA-1.1)_ **`@cas/exact` gains its first package edge, a type-only `@cas/expr`**, because
  `toExactRational` reads an AST. `@cas/expr` has no `@cas` dependencies, so the DAG stays acyclic.
- _(PRA-1.2)_ **Aberth, not Durand–Kerner + polish, decided by measurement** (PLAN §6's open row):
  `@cas/core`'s DK diverged on Wilkinson 20 from its spiral seeds and, circle-seeded, had not
  converged after 2000 iterations (backward error 8e-4); Aberth converged in 32 sweeps (4.9 ms). So
  Polynomial Roots' `aberth.ts` moved (`git mv`, with its test) into `@cas/core`, gaining one option,
  `seedFromWorkspace`, so a drag continues each root from where it was; its default path is unchanged
  and Polynomial Roots' suites are green through the move.
- _(PRA-1.2)_ **A residual-converged root set is not a root set of THIS polynomial when p is
  ill-conditioned.** On Wilkinson every Aberth root met the 8ε residual rule, yet the set was not even
  conjugate-closed (11.23 − 0.15i, 11.66 − 0.03i, …) and Smith's discs about it, with the exact integer
  coefficients, had radii up to 338 in one component of 20: the ε-pseudozero set is a region, and any
  point of it passes. Floating-point evaluation cannot do better, so `refine.ts` runs Aberth with p/p′
  evaluated EXACTLY (scaled BigInts, dyadic iterates — every coefficient is rational or dyadic): Wilkinson
  then reads 20 isolated discs of radius **0** (the refined roots are the integers exactly). It is
  skipped for a polynomial Yun says is not squarefree (it would collapse a multiple root's
  approximations onto one point, where Smith's hypotheses fail) and undone if it collapses a pair anyway.
- _(PRA-1.2, corrected at PRA-1.4)_ **One cost found by measuring the whole frame rather than the
  kernel.** Reading a disc's reduced `radiusSq` to DRAW it cost 18 ms a frame (a gcd on thousands of
  bits) against Smith's own 0.9 ms; `SmithDisc.radiusUpper()` draws from the top 64 bits instead and the
  exact `Frac` is reduced only when read. **A drag frame at degree 20–24 costs 1.1–2.6 ms median,
  4.4 ms worst** (seeded Aberth + exact refinement + discs + groups), inside the 8 ms budget with no
  deferral to release. *This entry first also claimed that exact Newton's ~1e-300 imaginary parts made
  Smith take 2.5 s and 19.5 s; that was measured against a STALE `@cas/exact` build (the app imports
  its `dist/`), and re-measured against a current one the discs cost the same with or without them.
  The flush of sub-ulp components stays, for the reason the sweep found: without it ℂ mode reads
  Wilkinson's root 3 as 3 + 4.7e-38i. Lesson: rebuild the package dists before timing anything.*
- _(PRA-1.2)_ **The gate's "round-trips root → coeff → root to 1e-12" is replaced by what is true.**
  Wilkinson's re-solved roots cannot come back to 1e-12 — the rounding in forming its coefficients
  moves root 15 by ~1e-3, which is its conditioning, not a defect. The corpus test asserts instead:
  root form keeps the roots bit for bit; every solved root has residual ≤ 16ε·Σ|aₖ||r|ᵏ; and every
  re-solved simple root lies within 4× the forward error Vieta's own rounding predicts
  (`n·ε·ΣEₖ|r|ᵏ/|p′(r)|`, `Eₖ` the coefficients of `∏(z + |rⱼ|)`).
- _(PRA-1.2)_ **`@cas/expr` has no implicit multiplication and no unary plus** (`20z`, `2(z+1)`,
  `(z+1)(z−1)`, `+z` are all syntax errors there). `parse.ts` inserts them at the token level before
  parsing; the parser itself is left alone (its other consumers compile to GLSL).
- _(PRA-1.2)_ **ℚ-mode snapping is the simplest rational within half a pixel**, not
  `simplestRational`, which returns the rational that reproduces a double exactly — a 16-digit fraction
  for any dragged value. `rational.ts` does the Stern–Brocot descent in exact arithmetic.
- _(PRA-1.4)_ **The sweep (34 mutants, 32 killed, 2 equivalent) bought seven tests and deleted three
  pieces of code.** First pass 16/34, and the survivors were real: ℝ's reality check accepted a
  NEGATIVE imaginary part; the degree cap was checked only on text; the quadratic's anti-cancellation
  choice and the solver's unit-circle fallback were masked by the exact refinement and by seeds that
  always worked (real seeds on `z⁴ + 1` cannot leave the axis, which is the case that needs the
  fallback); a ℚ coefficient drag re-snapped the coefficients it did not move, invisible on integer
  coefficients (`0.123z²` has 1/8 within half a pixel); a no-op edit pushed an undo step. And three
  pieces of code were shown to do nothing: a mirror branch for negative intervals in the rational snap
  (`floor` already handles them), a collision guard after exact refinement (it leaves a multiple
  root's copies an ulp apart, never equal — measured), and a leading-coefficient guard in the drag
  (the engine refuses first). What the guard was FOR was real, though: the closed form returns a
  quadratic's double root as two identical points and Smith refused, so `separate()` spreads exact
  coincidences along the real direction — the first version spread on a circle, and `conjugateClose`
  folded two of (z + 2)³'s copies back onto one point. **Equivalent:** a vertical spread certifies the
  same as a horizontal one (both keep conjugates conjugate; horizontal is chosen so a real multiple root
  is drawn on the axis), and the snap's closed-interval test at `n + 1 = hi` (the recursion returns the
  same `n + 1`).
- _(PRA-1.3)_ **Two landmarks named "Roots"** — the root pane and the Roots card — failed axe's
  `landmark-unique`; the panes are "Root plane" and "Coefficient plane".
- _(PRA-1.3)_ **The phase portrait is drawn from the ROOT form**, `arg aₙ + Σ arg(z − rᵢ)` and
  `log|aₙ| + Σ log|z − rᵢ|`: stable in float32 at every degree allowed, where Horner on Wilkinson's
  coefficients in float32 is noise. It is therefore a picture of `aₙ∏(z − r̃ᵢ)`, within each certified
  disc of p, and the legend says `≈` once.
- _(PRA-1.3)_ **KaTeX is deferred to the first typeset formula** (PRA-2's discriminant): PRA-1 shows
  the typed polynomial in its input and the coefficients as exact text, and a typesetting dependency
  with nothing to typeset would be carried for nothing.
- _(PRA-1.3)_ **Root labels are not in the permalink.** A link carries the polynomial's one true form;
  labels are session state (the preview tracker's), so a reopened coefficient-form link numbers its
  roots from a fresh solve. PRA-3, where a label names a permutation, decides whether they travel.
- _(PRA-1.1)_ **The `animate.ts` lift is deferred to PRA-3**, where this app first animates
  (running a loop, playing a motion). Nothing in PRA-1 moves on its own, so lifting it now would be
  extraction ahead of a consumer, which the owner's approval did not ask for.

- _(PRA-0, re-verifying PLAN against the tree)_ **Aberth lives in
  `apps/polynomial-roots/src/engine/aberth.ts`**, not the `src/engine/roots/` PLAN §6 names.
- _(PRA-0 → PRA-1)_ **`polishRoots` / `cauchyBound` are not exported anywhere.** `@cas/faber`'s
  `roots.ts` inlines both inside `polynomialRoots`; Contour Integration's `kernel/poles.ts` has private
  `cauchyBound` and `polish`. The PRA-1 lift into `@cas/core` is a factoring-out of two copies, each
  source's tests green before and after.
- _(PRA-0 → PRA-4)_ **`families/field.ts` and `families/linear.ts` import Contour Integration's `RatPi`
  and `formatExact`.** The lift into `@cas/exact` splits them: `Field<T>`, `FRAC_FIELD` and the
  elimination move; the ℚ(i)(π) instance stays in the app.
- _(PRA-0)_ PLAN §4.2 says `src/galois/`, DESIGN says `src/engine/galois/`; DESIGN's path is used.
- _(PRA-0)_ **Three §6.1 items are deferred to the step that makes them true, not skipped:**
  `scripts/check-built-artifacts.mjs` covers PUBLISHED apps that spawn a worker, and PRA-0 does
  neither — the row lands with the Galois worker (PRA-4); the root `test:browser` chain gets the app
  when it has a browser suite (PRA-2's shader test); the launcher's three SEO blobs list published tools
  only (Correspondences is not in them), so this app joins them at the publish gate (PRA-5) with the
  deploy `cp`. Separately, the root `test:browser` chain already omits Polynomial Roots'
  browser suite — noted, not this app's to fix.
- _(PRA-0)_ The empty panes are `role="img"` canvases whose names say they are empty: a canvas named
  for roots that draws none would be the page's first unearned claim. They become `application` with
  a keyboard map when PRA-1 wires the drags (PLAN §5.2 rule 10).

- _(planning)_ Quadrature Domains' `app/sym/sym-core.mjs` holds a complete Berlekamp–Zassenhaus
  factoriser, `𝔽ₚ` layer, Sturm isolation and Schur–Cohn counts, unreachable from TypeScript
  (research 05 §1). PLAN §6 ports rather than shims; QD keeps its copy under ADR-0008's exception.
- _(planning)_ The plotter's `src/riemann/` already holds a monodromy tracker, permutation-group code
  and lasso generators (research 05 §9). PLAN §7 PRA-3 extracts them as `@cas/monodromy`.
- _(planning, 2026-09-23)_ **PR #348 landed in parallel** — `apps/polynomial-roots` (ADR-0046, the
  Baez–Christensen–Derbyshire root-cloud renderer), taking ADR-0046, port 5184, the _Polynomial Roots_
  name, and bringing `APP_NAMES` current. Reconciled by merging master: this record is **ADR-0047**,
  the port **5185**, the ensemble overlay dropped (PLAN §1.2), `CET_C6` from `@cas/gpu`, and
  Polynomial Roots' app-local Aberth solver noted as a possible second-consumer extraction at PRA-1.
  Research 04's rows on `APP_NAMES`, the port list and `cetC6.ts` are stale by that PR and say so.
- _(planning)_ Two dev-server ports collide today (5176 plotter/riemann-map, 5177
  argument-principle/contour-integration; research 04 §1). Not this app's to fix.

## Open questions for the owner

None open. (PRA-0's three — ADR-0047, the PRA-5 publish gate, the two `@cas/ui` lifts — were
answered "Approved" on 2026-09-23.)

## Decisions taken during execution (the owner's answers, verbatim)

**PRA-0 (2026-09-23).** On the three PLAN §12 decisions and the roadmap: "Approved. Run PRA-0."

**Round 1 (before research).** 1 audience: "Default is perfect" (a strong undergraduate, a
researcher-usable sandbox). 2 "Sandbox for now, expository argument later." 3 coefficient field:
"Whatever's the largest set of polynomials you expect to be able to consistently compute Galois groups
for systematically. Or, failing that, preset families." 4 degree cap / tiers: "Sounds good for now."
5 real/rational modes: deferred to after research. 6 "Two panes, with a toggle which overlays them on
the same pane (perhaps using domain coloring for the polynomial plot, in addition to labeled roots)."
7 overlays: "Default is good, plus anything else you come across." 8 algebraic and monodromy groups:
"Both." 9 commutators: Arnold's loops, "That's exactly what I meant." 10 Galois correspondence: "I'd
like this as well." 11 proof line: Arnold, "Exactly." 12 contrast with solvable degrees: "Yes,
exactly." 13 hand-offs: "No handoffs for now." 14 references: defaults. 15 scale: "whatever scale is
appropriate for the ultimate size of the app."

**Round 2 (after research).** 1 tiers: default (Sₙ/Aₙ any degree `=`, `=` to degree 7, `≈` 8–15,
8–11 deferred). 2 ring modes ℂ/ℝ/ℚ: "Agree." 3 certified monodromy from the start: "Go with your
recommendation." 4 both loop mechanisms: "Agree." 5 families first-class: default. 6 correspondence
lattice: default (full for degree ≤ 5, derived series always). 7 formulas typed + gallery, Dummit
deferred: default. 8 tables: "Fetching is fine." 9 `@cas/exact` widened + one new package: "This
sounds good." 10 overlay order: "Looks good." 11 degree cap 24: "Sounds good." 12 name: **"Polynomial
Root Analysis"**. 13 ladder without narrative for now: "Yes, but narrative text is essential for the
final product (so should be in the longer term roadmap)." Surfaced ideas: "I like all of these ideas
which surfaced. Please add them to the longer-term roadmap." (PRA-9/PRA-10.)
