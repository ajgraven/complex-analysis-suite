# Polynomial Root Analysis — status: read first, update last

Plan: [`PLAN.md`](PLAN.md) · Spec: [`DESIGN.md`](DESIGN.md) · Record: [ADR-0047](../DECISIONS.md#adr-0047) ·
Evidence: [`research/`](research/) · Branch of record for the planning round: `claude/polynomial-galois-suite-7iqcb2`.

**Rule (inherited from M8):** do the step named under _Current_, update this file, commit, push. Never
end a session with unpushed work. A step that cannot be done as written is recorded under _Findings_,
not silently changed.

## Current

**PRA-6 — the Galois correspondence, numerically** (PLAN §7), awaiting the owner's go-ahead. PRA-5 is
complete, and the app is wired to publish with the next merge to `master`.

## Done

- 2026-09-26 — **PRA-5 complete (5.1–5.5): Tier 1, the labelled group, Tier 2, and the publish
  wiring.** 5.1: `src/engine/galois/data/transitive.json` — all 1,012 transitive groups of degree 2–15,
  generated from GAP's transgrp by `scripts/generate-transitive-groups.mjs` (counts = OEIS A002106;
  degree ≤ 7 re-derived with `@cas/monodromy`, maximal transitive classes and their conjugators
  included), and `data/invariants.json`, one relative invariant per maximal pair, searched by
  `scripts/generate-invariants.ts` and checked where used. 5.2: `refine.ts` (Newton in BigInt fixed
  point, then Smith discs, exact), `discArith.ts` (complex discs, outward rounding in the radius only).
  5.3: `descent.ts` — Stauduhar's descent from Sₙ/Aₙ, resolvents rounded to ℤ once every disc is
  narrower than ½, integer roots tested exactly, Tschirnhaus transformations when a root is multiple; the
  group is carried as τ∘G∘τ⁻¹ on the reader's numbered roots, its generators shown and playable as
  motions. 5.4: `tier2.ts` — degrees 8–15 ranked by χ² over the certified types, `≈`, with the
  indistinguishable sets named. 5.5: the launcher card links, `deploy-pages.yml` copies the app, the
  SEO blobs and README/ARCHITECTURE/CLAUDE.md say so. Gate clauses: all **36** transitive groups of
  degree 2–7 read their PARI-checked label `=`; the five quintic families read S₅, A₅, D₅, F₂₀, C₅ with
  their rows, the last step D₅ → C₅ by the degree-2 resolvent, and Dummit's sextic (research 01 §4)
  agrees on solvability for every x⁵ + ax + b; the labelled generators fix the last resolvent's certified
  integer root, checked in disc arithmetic (> 40 generator checks); z⁸ − 3z⁶ + 4z⁴ − 2z² + 1 (8T10 by
  GAP) and z⁸ − 4z⁶ − 4z⁴ + 4z² + 1 (8T11) both list 8T10 and 8T11 as indistinguishable, `≈`; Trinks'
  z⁷ − 7z + 3 reads `= PSL(3,2) (7T5), of order 168` and "not solvable". Sweep **31 mutants, 28 killed, 3 recorded equivalents** (15 on the first pass; `ds-holders`, `ds-exact-root` and `tb-alt` unreachable, by the arguments below). Gate
  **639 files / 7417 tests** (637 / 7384 before PRA-5); `pnpm a11y --strict` **1386 interactive nodes across 36 pages, 0 unnamed** (roster entries
  `-descent` and `-estimate` new).
- 2026-09-26 — **PRA-4 complete (4.1–4.4): the exact engine and Galois Tier 0.** 4.1: `@cas/exact`
  gains `modPoly.ts` (𝔽ₚ[x], p < 2²⁵: arithmetic, gcd, powmod, distinct-degree + Cantor–Zassenhaus,
  `factorDegreesModP` — Dedekind's cycle type, `null` where the theorem is silent) and `zPoly.ts`
  (`factorOverZ` by Hensel lifting + Zassenhaus recombination on the monic transform, `rationalRoots`,
  `isSquare`); QD's new `exact-factor-differential.test.ts` factors 50 random integer products and three
  hard cases with both engines, agreeing on every factor set. 4.2: `src/engine/galois/tier0.ts` — the
  factorisation, the exact discriminant, the cycle type at every good prime below 1000 with its first
  witness and count, the power trick, and one statement of Conrad 2.1/2.2/3.1 (primitive by a prime cycle
  > n/2 or an (n − 1)-cycle; + a swap ⇒ Sₙ; + a 3-cycle ⇒ ⊇ Aₙ, the discriminant deciding) — run in a
  worker (`galois.worker.ts`, `createComputeClient`), evidence only. 4.3: the Galois card — the
  factorisation, the group or "not yet identified", each hypothesis with its witness, the list of cycle
  types drawn as rings of dots; reducible input per factor. Gate clauses: the 37-entry corpus (35 of the
  36 transitive groups of degree 2–7) is irreducible and names Sₙ/Aₙ exactly when the group is one;
  x⁵ − x − 1 reads `= S₅` with "a 5-cycle at p = 3", "type (3, 2) at p = 2, cubed is a swap", "the
  discriminant 2869 is not a square"; x⁵ + 20x + 16 reads `= A₅`; x⁵ − 5x + 12 reads "Contains the
  elements below; not yet identified" with no name anywhere on the card. Sweep **32 mutants, 30 killed, 2
  recorded equivalents** (28 on the first pass). Gate **637 files / 7384 tests** (634 / 7341 before PRA-4); browser suite 1 / 3;
  `pnpm a11y --strict` **1304 interactive nodes across 34 pages, 0 unnamed** (roster entry `polynomial-root-analysis-galois` new: a reducible
  polynomial, one factor named and one open).
- 2026-09-24 — **PRA-3 complete (3.1–3.4): `@cas/monodromy` and loops.** 3.1: the plotter's
  `monodromy.ts`, `permGroup.ts`, `generatorLoop.ts`, `permDiagram.ts` and `winding.ts` moved byte for
  byte into `packages/monodromy` (the fourteenth package, source-exported) with their tests; the plotter
  imports them and keeps the one test that drives them through its own curve enumerator. 3.2: the
  CERTIFIED tracker (`track.ts`, DESIGN §4.4) on `@cas/exact`'s new `smithDiscsEnvelope`; loop words,
  commutators, the derived series, primitivity and Sₙ/Aₙ recognition; in the app, loop words → exact
  polylines, the run in labels, root-side motions, braid crossings. 3.3: the Monodromy card (lassos,
  word builder, pen, runnable word tree, σ with its certificate or refusal, play on the roots, the group of
  every lasso), loops in `#vs=` as the word, the braid strip. Gate clauses: x⁵ − x − 1's four a₀ lassos each
  certify a transposition and generate S₅ (order 120, listed); the commutator of two lassos sharing a root
  certifies the package's composed 3-cycle; a drawn loop through a branch point refuses by name with no σ;
  the motion (1 2 3 4 5) lands every root on its image and closes every coefficient loop to 1e-12; a word
  of four x-adjacent lenses crosses four times. Sweep **34 mutants, 33 killed, 1 recorded equivalent**
  (19 on the first pass). Gate **634 files / 7341 tests** (629 / 7285 before PRA-3); browser suite
  1 / 3; `pnpm a11y --strict` **1264 interactive nodes across 33 pages, 0 unnamed**.
- 2026-09-24 — **PRA-2 complete (2.1–2.4): analysis overlays, wave 1.** The engine (2.1): exact
  convex hull and Gauss–Lucas test, certified critical points, the exact discriminant and aⱼ's branch
  points by two routes compared, certified pseudozero regions (Rouché on grid-cell boundaries,
  falsified by 40 extreme perturbations). The card (2.2): KaTeX `git mv`'d from Contour Integration
  into `@cas/ui/math` (second consumer), four new `ShellState` fields carried by `#vs=` as optional
  keys. The stage (2.3): the pseudozero ladder in GLSL with a probe mode, hull, critical points,
  trails, ✕ branch points, the certified cells outlined; the app's first browser suite. The rest
  (2.4): the gain matrix as a heat row, time-faded trails. Sweep **37 mutants (32 node, 5 GLSL),
  37 killed**, 23 on the first pass (`an-approx-sign` was replaced by `an-approx-square` when the line it mutated was deleted as the bug below). Gate **629 files / 7285 tests** (627 / 7223 before PRA-2); browser
  suite 1 file / 3 tests; `pnpm a11y --strict` **1196 interactive nodes across 32 pages, 0 unnamed** (roster entry `polynomial-root-analysis-analysis` new: every layer on, by permalink); Contour Integration's browser suite 22 / 232 green through the KaTeX move.
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
  `polynomial-root-analysis` + `-overlay` clean. Gate **627 files / 7223 tests** (623 / 7116 before PRA-1); `pnpm a11y --strict`
  **1150 interactive nodes across 31 pages, 0 unnamed**.
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

- _(PRA-5)_ **The table is GAP's, not the LMFDB API's.** The API answers every script with a captcha
  gate (measured); the LMFDB's transitive-group data is itself GAP's transgrp (Conway–Hulpke–McKay's
  classification and numbering, also PARI's and Magma's). GAP ran here from the `passagemath-gap` wheels
  on PyPI with `passagemath-gap-pkg-transgrp-data`, and PARI (`cypari2`, `polgalois` with
  `new_galois_format`) served as the independent check on every corpus label — neither is a dependency
  of the repo. Licence: the groups are mathematics; transgrp's arrangement is Artistic-2.0 and the
  labels follow it, which the JSON says. **Degree 8–15 is the full list with class distributions**
  (GAP computes them in 19 s for all 1,012 groups), so DESIGN §5.1's "`cycleTypes: null`, unrankable"
  fallback was never needed.
- _(PRA-5)_ **"37 groups of degree 3–7" is 35** (A002106: 2 + 5 + 5 + 16 + 7); the 37 counts degrees 1
  and 2 as well. The gate is run over all 36 of degree 2–7.
- _(PRA-5)_ **The invariants are stored, because one of them is expensive to FIND.** Orbit sums of a
  single monomial serve every maximal pair of degree ≤ 7 except the index-2 G ∩ Aₙ (none can: that
  needs an alternating function, and the discriminant decides it exactly), but S₆ ⊃ PGL(2,5) has none
  of degree ≤ 5 — proving that takes 5.3 s of search — and its smallest is x₀²x₁²x₂x₄ (orbit 30).
  Searched once, stored, and verified at use (stabiliser = K, by enumeration).
- _(PRA-5)_ **Shifts are not enough Tschirnhaus.** With x ↦ x + k only, 15 of the 35 corpus polynomials
  refused on a repeated integer root (x⁴ − 2, the cyclotomics, every 6T* with a zero coefficient
  pattern); a general h(x) with small integer coefficients fixes 34, and **x⁷ − 2 needs a dense h of
  degree ≥ 4**: its roots are αζᵏ, the D₇-invariant x₀x₁ takes 7·Σ_{j+l≡0 (7)} hⱼhₗα^{j+l}ζ^{lc}, and
  without two exponents of h summing to 7 that is 7h₀² at every coset. Measured cost: 1024 bits, ~2.5 s,
  the corpus's slowest (the worker's reason to exist). The argument does not need the h(zᵢ) distinct.
- _(PRA-5)_ **The G ∩ Aₙ step can only ever say "stay".** A square discriminant starts the descent at
  Aₙ, so every group reached after is even; the in-loop "descend" branch was dead code, and the sweep
  found it (`ds-parity` could not be killed). Removed.
- _(PRA-5)_ **A factor of a reducible polynomial claimed the reader's numbering.** The Sₙ/Aₙ path set
  `labelsHold: true` unconditionally ("any numbering carries the same group" — true of the group, not
  of the numbering). Found by the sweep; a factor's roots are its own now.
- _(PRA-5)_ **Two sweep survivors are unreachable, by an argument rather than a measurement.** `ds-holders`
  (two value discs holding the same integer) and `ds-exact-root` (skipping R(θ) = 0): R(θ) is a
  non-zero integer when θ is not a root, so a disc of radius ρ holding θ forces the other values'
  distances to multiply to ≥ 1/ρ — which puts a radius above ½ on the constant coefficient, and the
  certification refuses first. Both checks stay: the claim should not rest on that inequality. Recorded
  as equivalent. So is `tb-alt` (Aₙ is the only index-2 subgroup of Sₙ).
- _(PRA-5)_ **The main chunk grew 399 → 741 kB** with the 347 kB table; **cut back to 429 kB** after the
  owner's go-ahead by splitting it: degrees 2–7 (14 kB) ship in the main bundle, degrees 8–15 are
  registered statically by the worker and fetched lazily on the main thread (a 315 kB chunk, 35 kB
  gzipped), with the card re-asked when it lands. Sₙ/Aₙ need no data at all — their labels are the last
  two of each degree and their generators textbook — so the theorem names them before it arrives. **And
  GAP stalled** regenerating the split (> 10 min on 14T60's classes, where the first runs took 19 s for
  everything): its class algorithms are randomised, so the script now fixes the seed.
- _(PRA-5)_ **The denylist's `nTj` rule is gone**: DESIGN §9 denies a label "without its name", and the
  card never prints one without it (degree ≤ 7: "PSL(3,2) (7T5)"; beyond: GAP's name beside it).
- _(PRA-5)_ **A browser pass found three**: A₇'s two classes of PSL(3,2) read as "inside no copy of
  PSL(3,2)" then "inside a copy of PSL(3,2)" — each now says which of its two kinds; the Tier 2 list ran
  to 18 candidates (6 shown, the rest counted); the restriction sentence read "Only so far as…".
- _(PRA-5)_ **Publishing happens at the merge**, not on this branch: `deploy-pages.yml` runs on
  `master` only. The launcher card links and the `cp` is in place.

- _(PRA-4)_ **The gate's "cubed is a transposition" reads "cubed is a swap"** — DESIGN §9's on-screen
  word for a transposition. The content of the row is the gate's.
- _(PRA-4)_ **The Klüners–Malle database was not reachable** (the fetch hits a captcha), so the corpus
  is Cohen's per-group set for degrees 2–6 (as sympy's suite carries it) and, for degree 7, six
  citable constructions: the ℚ(ζ₂₉) period polynomial (C₇, recomputed from the periods in the suite),
  the degree-7 subfield of the Hilbert class field of ℚ(√−71) (D₇, disc −71³), z⁷ − 2 (F₄₂), Trinks'
  z⁷ − 7z + 3, z⁷ − 56z + 48 (A₇ — found by searching z⁷ + az + b for a square discriminant and named by
  Tier 0 itself) and z⁷ − z − 1 (S₇). **F₂₁ (7T3) is missing** — PRA-5's gate names all 37 groups and
  has to supply one.
- _(PRA-4)_ **`Field`/`linear` were not lifted from Contour Integration.** PLAN puts the lift in PRA-4,
  but nothing in Tier 0 solves a linear system; ADR-0007 says a primitive moves when its consumer
  exists, so the lift waits for the step that needs it (PRA-5's resolvents, if they do).
- _(PRA-4)_ **x⁵ − x − 1 closes at ONE prime.** Type (3, 2) at p = 2 is both a swap (cubed) and a
  3-cycle (squared), and 3 is a prime greater than 5/2 — so p = 2 alone names S₅. The card still shows
  the 5-cycle at p = 3 because the primitivity row prefers the LONGEST qualifying cycle (an n-cycle for
  a prime degree reads as the familiar statement); the swap and 3-cycle rows take the first prime.
- _(PRA-4)_ **Conrad's own example needs p = 311 for a direct swap** (z⁶ + z⁴ + z + 3: type
  (2, 1, 1, 1, 1) first at 311); the power trick finds one at p = 2, from (3, 2, 1). Pinned.
- _(PRA-4)_ **The (n − 1)-cycle clause never changes a verdict, only a witness.** A primitive group with
  a swap or a 3-cycle contains Aₙ, which (Bertrand) contains a p-cycle for a prime n/2 < p ≤ n, so with
  enough primes the prime clause always fires too; at degree 9 the clause makes the 8-cycle the shown
  witness. The sweep found it untested and the degree-9 test pins it.
- _(PRA-4)_ **The discriminant route to Sₙ (3-cycle + non-square, no swap) is unreachable at 1000
  primes on the whole corpus** — a swap always turns up first — so the sweep's `t0-verdict-disc`
  survived. It is reached with a lower prime bound (z⁴ − 6z − 3 below 10: a 3-cycle at 5 and no swap)
  and pinned there; without it, dropping the square test would name A₄ for an S₄ polynomial.
- _(PRA-4)_ **Cost: degree 16 in 71 ms, degree 24 in ~0.5 s** (z¹⁶ + z + 1, z²⁴ + z + 1: the
  discriminant and 166 distinct-degree factorisations). That is the worker's case; the sync fallback
  runs it deferred behind the busy line.
- _(PRA-4)_ **A browser pass found three wording defects no test had**: "The polynomial is factors over
  ℚ…" (a sentence template shared by both outcomes), "a 8-cycle" (now `aCycle`, by the spoken number),
  and a hyphen-minus in "−108". The reducible legend no longer repeats the headline.
- _(PRA-4)_ **Two recorded equivalent mutants.** `app-stale` — the callback's own key check is redundant
  with `createComputeClient`'s request id and `cancel()`; kept as defence in depth. `card-open-text` —
  the group certificate is `=` or `⚠` and nothing else, so `=== "="` and `!== "⚠"` agree.

- _(PRA-3.4)_ **Removing the certificate changed no answer — so the claim is tested now, not only the
  answer.** On the first sweep, `trk-no-disjoint` (drop the disjointness test) survived: every
  permutation in the suite stayed right, because the float pre-check already rejects every envelope that
  overlaps by more than 1.5× touching and the label match does the rest. Only the band between 1× and
  1.5× needs the exact test, and nothing reached it. The decision is now `certifySegment`, tested on that
  band directly (20% overlap refused, touching refused, a start-only overlap refused), and a falsification
  test samples nine interior t on every certified step of two loops (> 300 points) and requires each disc
  to hold exactly one root of p_t from an independent solve.
- _(PRA-3.4)_ **An involution hides a label mix-up.** `labelPerm[L[i]] = L[σ(i)]` and its transpose agree
  whenever σ² = 1, so every lasso test passed both; the label tests run a commutator (a 3-cycle) on
  permuted labels. The same fact hid a no-op `inverse` (a swap undone by itself).
- _(PRA-3.4)_ **One recorded equivalent**, `trk-at-isolated`: the new roots' own discs need not be
  checked for isolation at the step's end, because the NEXT step's certificate starts from exactly those
  discs and the path's end re-checks them; the check stays for a clearer refusal one step sooner.
- _(PRA-3.4)_ **The a11y audit's state wait was too short for a heavy link, and flaked 1 in 3.**
  `polynomial-roots-place` (a degree-14 trinary sweep) failed to show its state within 5 s about one
  run in three with the link honoured and Polynomial Roots untouched; at 20 s, 4 of 4 clean and the full
  roster clean. A state never reached still fails by name.
- _(PRA-3.2)_ **Exporting `then` makes a module a thenable.** `await import()` of `@cas/monodromy` called
  the export and every suite that imported the package failed to load; it is `andThen`.
- _(PRA-3.2)_ **The tracker's cost, measured, and the floor decided.** zⁿ − z − 1 with a₀ round a small
  circle: 28 / 161 / 457 / 778 / 1662 ms at n = 5 / 10 / 15 / 20 / 24 (8.4 s and 22.9 s at 20 and 24 before
  a float pre-check skipped plainly failing exact envelopes and the matcher stopped reducing fractions).
  DESIGN's `⚠ decide at PRA-3` floor is 20 halvings of each polyline edge; the loops the card builds
  never needed more than 5. Runs are synchronous and memoised; a worker is left until a loop is slow
  enough at a degree someone uses to need one.
- _(PRA-3.3)_ **A loop has to move the colours.** After a loop the roots were drawn with their old
  labels, so the root the proof says is now where 4 was jumped back to 2's place on screen. The roots take
  the proof's labels once per loop (re-resolving is stable because σ conjugated by itself is σ).
- _(PRA-3.2)_ **A lasso's tether must be routed.** x⁵ − x − 1's branch points ±β lie on the real axis with
  a₀ = −1, so the straight tether to +β runs through −β; the lasso bends through a waypoint, the first of
  six candidates that keeps clear of every other branch point.

- _(PRA-2.4)_ **The ≈ discriminant had the wrong sign at half of all degrees.** `discFromRoots`
  multiplied `aₙ^{2n−2}∏_{i<j}(rᵢ − rⱼ)²` by `(−1)^{n(n−1)/2}`, which belongs to the `∏_{i≠j}` form;
  z⁵ − z − 1 (n(n−1)/2 = 10) hid it. The Analysis card showed a drag frame's Δ with the wrong sign at
  degrees 2, 3, 6, 7, 10, 11, …. Found because the sweep's `an-approx-*` survivors bought a test against
  the exact Δ on non-monic polynomials of both parities.
- _(PRA-2.4)_ **The gate caught a cycle the app's own checks could not**: the Analysis card imported
  the level glyph from `rails.ts`, which builds the card. `tsc`, ESLint and Vitest were all green; only
  dependency-cruiser's `no-circular` (inside `pnpm lint`) sees it. `level()` now lives in `shell/level.ts`.
  Same lesson as PRA-1.2's `polynomial.ts ↔ solve.ts`: run the whole gate before a push, not the app's.
- _(PRA-2.4)_ **Two survivors were unreachable from the shell, and pinned anyway.** A drag frame never
  carries an exact layer, so `analyse`'s "no exact discriminant, numeric branch points while dragging"
  was equivalent through the app; it is a contract about COST (seconds on a dyadic layer), so it is
  now asserted on `analyse` directly with an exact polynomial.
- _(PRA-2.3)_ **An unclamped `fwidth` stroked the ε-edge one pixel from every root.** A quad holding a
  root sees f = log₁₀(|p|/w) fall by tens of decades, so `|f − log ε|/fwidth(f)` drops under the stroke
  width whatever ε is: 3 of 40 deep-inside pixels came out dark. Clamping the gradient at 0.25 decades a
  pixel removes it; the browser test that found it keeps the pixels next to a root in its sample.
- _(PRA-2.3)_ **Lightening does not read on CET-C6**, whose colours are already light: at ε = 10⁻¹² on
  Wilkinson the shaded set was barely distinguishable. The inside is greyed as well (luminance up,
  chroma under half), and the doubling bands give way to the ladder's decade lines while it is on —
  one family of level curves of |p| at a time.
- _(PRA-2.3)_ **The shader's f agrees with float64 to 7.6e-4** (the probe's own 16-bit quantisation of a
  50-decade range) on z⁵ − z − 1 and on Wilkinson — against the exact root form for the latter, since
  Horner on its coefficients is noise — and the inside flag agrees everywhere off a 5e-3 band.
- _(PRA-2.3)_ **A fresh solve was labelled in the solver's order** — Wilkinson read r₂ ≈ 3, r₄ ≈ 6, and
  the Roots card listed groups in the order Yun's factors were solved. Fresh solves (no continuation,
  or a degree change) now label in reading order; a continued polynomial keeps its labels.
- _(PRA-2.3)_ **The ink overlays have no automated test**: jsdom has no 2D context and the browser suite
  compiles the shader only. Hull, diamonds, trails, ✕ and the certified-cell outlines were checked in
  Chromium screenshots (a drag of a₀ through a branch point: two trails meet and part at the ✕'s
  image). Recorded rather than papered over; PRA-3's motions give the ink its first browser test.
- _(PRA-2.2)_ **KaTeX moved rather than being added twice.** Contour Integration's `shell/math.ts` is
  `git mv`'d to `@cas/ui/math` (a subpath export, so an app that never typesets never bundles `katex`); its
  28 importers were repointed and its tests stayed green.

- _(PRA-2.1)_ **The exact discriminant is only affordable on an exact layer.** disc(p) in t = aⱼ by
  Bareiss costs 0.1–0.3 s at degree 15–24 on rational coefficients, but 1.1 s at degree 8 and 21 s at
  degree 12 on DYADIC ones (a dragged float polynomial). So the exact route runs on the ℚ / typed layer
  once per commit, and a float polynomial or a drag frame gets the numeric route (`z·q′ − j·q`, `≈`).
- _(PRA-2.1)_ **The two routes found two defects in each other.** The numeric route stripped z = 0
  from `z·q′` for every j, dropping z⁴ − 4z² + t's branch point t = 0 (for j = 0 the condition is q′
  itself). And the exact route solved the whole discriminant, whose DOUBLE roots (z and −z reach the
  same a₂ on z⁴ − 4z² + 1/3) converged only to √ε — 8.6e-9 against the numeric route; it now solves
  per squarefree factor, so every branch point is isolated and carries its multiplicity (the number of
  collisions meeting there).
- _(PRA-2.1)_ **PLAN's pseudozero gate case does not hold, and is restated.** Under Mosier's
  COMPONENTWISE relative perturbations (|Δaₖ| ≤ ε|aₖ|, the definition the certificate proves),
  Wilkinson at ε = 1e-7 does not isolate roots 10–19: one region holds roots 2–20 and runs past the
  framed view (so it is refused, "reaches the edge of the view"), with root 1 alone. The certified
  picture is at ε = 1e-12: roots 1–5 each alone, and 6–20 in one region, `= 15`. The certificate is
  Rouché on the boundary of a union of grid cells — a Taylor lower bound on |p| along each cell edge
  with an a priori rounding term — and it is FALSIFIED in the suite: 40 polynomials at the extreme of
  the allowed set, each with exactly the certified number of roots in each certified region. 15–20 ms
  a view, so it runs on commit, not per drag frame.

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
