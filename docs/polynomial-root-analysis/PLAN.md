# `apps/polynomial-root-analysis` — implementation plan

> **Status: ACCEPTED** (2026-09-23), with [ADR-0047](../DECISIONS.md#adr-0047). PRA-0 has landed;
> progress is tracked in [`STATUS.md`](STATUS.md). Each later milestone is a separately-approved gate
> (CLAUDE.md: working software at every step; pause at each gate for review).
>
> Grounded in five research tracks in [`research/`](research/): Galois-group computation in the
> browser (01), monodromy and Abel–Ruffini visualisation (02), root-visualisation methods (03), suite
> conventions (04), and the exact/numeric primitives the repo already holds (05). Read 01, 02 and 05
> before implementing; 03 is the overlay catalogue; 04 is the wiring checklist.
>
> Two rounds of owner questions preceded this plan; the answers are folded in and recorded in
> [§12](#12-decisions-taken-and-what-remains). The companion spec is [`DESIGN.md`](DESIGN.md).

---

## 1. What this app is

**Polynomial Root Analysis** — the fourteenth app (the thirteenth to be published). It is not
[ADR-0046](../DECISIONS.md#adr-0046)'s _Polynomial Roots_, the root-cloud renderer that landed in parallel — see §1.2. A polynomial's roots and its coefficients drawn as
two point sets in two complex planes, each draggable with the other following; every analytic overlay
a theorem about that picture; and, on top of it, the two groups that act on the roots — the **Galois
group over ℚ** of a typed polynomial, computed and honestly labelled, and the **monodromy group** of a
loop or a family, computed by certified continuation — animated on the plotted roots. The app closes
with **Arnold's topological proof of Abel–Ruffini**: a candidate formula built from radicals is a live
object whose radical nodes either close or fail to close along a loop, nested commutator loops kill one
radical level each, and the quintic stalls because A₅ is its own commutator subgroup.

Three pages of content live in one page of app, chosen by a **mode** (sandbox · family · ladder):

| Mode        | Content                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Honesty                                                                                                                                                                                       |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sandbox** | Type or drag a polynomial. Roots ↔ coefficients (Vieta one way, a tracked re-solve the other). Ring selector ℂ / ℝ / ℚ. Overlays: critical points + Gauss–Lucas hull, certified root discs, discriminant points in the coefficient pane, drag trails, the pseudozero ladder on the GPU, conditioning gauges. Galois card (ℚ mode): tiers `=` Sₙ/Aₙ at any degree, `=` full identification to degree 7, `≈` ranked candidates 8–15. Loops in the coefficient pane → permutation, `=` or refused. Galois correspondence as a lattice of numeric invariants. | Roots `≈` with `=` inclusion discs; discriminant, multiplicities and the group `=` in ℚ mode, otherwise labelled; every monodromy permutation `=` (certified tracking) or `⚠` refused by name |
| **Family**  | `p(t, z)` with coefficients polynomial in `t` over ℚ. Branch points (exact zeros of `disc_z`), a flower of lassos from a base point, each lasso's permutation, the generated group = the Galois group over ℂ(t); the bridge to the arithmetic group and to specialisations (Hilbert irreducibility). Showpieces `x⁵ − x − t`, `x⁴ − 4x² + t`, Trinks' `x⁷ − 7x + 3`.                                                                                                                                                                                      | Branch points `=`; permutations `=` or refused; the group `=` when every branch point is accounted for                                                                                        |
| **Ladder**  | Four rungs — quadratic, cubic, quartic, quintic. Each rung: a generic polynomial, a candidate formula (a tree with radical nodes), commutator words of increasing depth, and the derived series of Sₙ. Run a word: the roots move, the formula's nodes close or fail, the depth that kills the formula is reported. The quintic rung shows the same 60 elements lighting up again.                                                                                                                                                                        | Every "fails to close" is a measured winding, every identity in the ladder is checked by the permutation engine, the derived series is enumerated, not quoted                                 |

### 1.1 The gap this fills

Research 02 §8 and 03 §7: four live browser demos animate root swaps (Stein 2019, Akalin 2016,
Kalicki–Morales–Ostrander 2019, relint.de 2026) and all four move the _roots_ and derive coefficient
loops by Vieta. **None** lets a reader draw a loop in coefficient space and tracks the roots along it;
none draws the discriminant locus; none shows a nested commutator as a structured object; none shows
A₅ = [A₅, A₅]; none computes a Galois group; none has a GPU backdrop; none labels a single number.
On the analysis side, no explorable draws pseudozero sets, certified root discs, or the coefficient-pane
discriminant. The suite is the only place where the phase portrait, the electrostatic reading of
`log|p|`, exact arithmetic over ℚ, and the `=`/`≤`/`≈` vocabulary already coexist.

### 1.2 What it is not

- Not a computer-algebra system. The Galois engine reaches `=` only where research 01 says it can
  (Sₙ/Aₙ at any degree; full identification to degree 7) and says `≈` above that, naming the
  candidates it cannot separate. Degree 8–11 certification (PARI's `galdata` tables) is deferred.
- Not a proof assistant for Galois theory. The correspondence is shown _numerically_ (an H-invariant of
  the roots becoming an integer), not derived.
- Not the Riemann-surface studio: the plotter owns algebraic curves `F(w, z) = 0`. This app owns the
  _univariate_ polynomial and one-parameter families of it; the two share `@cas/monodromy` (§6).
- **Not the root-cloud picture.** `apps/polynomial-roots` (ADR-0046, merged 2026-09-23 while this
  plan was being written) owns every root of every polynomial over a small alphabet — Littlewood,
  Odlyzko–Poonen, the dragons, the limit set. This app owns _one_ polynomial and what acts on it; the
  ensemble overlay research 03 ranked tenth is therefore **not** on this app's backlog, and a hand-off
  (a cloud root clicked there opening here as a sandbox polynomial) is a PRA-10 candidate.
- No cross-app hand-offs in this plan (owner's decision, question 13 of round 1). Candidates are
  listed under [§7 PRA-10](#pra-10--exposition-and-the-long-tail) for later.
- The narrative layer (a stepper telling Arnold's proof in a lecturer's order) is **not** in the first
  milestones — the owner wants the sandbox first — but it is **essential for the final product** and
  is PRA-10's first item, so nothing below may make it harder (the ladder is built as states a
  narrative can address by permalink, exactly as Contour Integration's M7 rungs were).

---

## 2. The intellectual core

Three objects, and the theorems that tie them, are what the app exists to put on one screen.

**(a) Vieta is a branched covering.** `V: ℂⁿ → ℂⁿ`, `(r₁..rₙ) ↦ (a₀..aₙ₋₁)`, is a polynomial map (so
dragging a root moves every coefficient smoothly), and its inverse is the root-finding problem:
continuous everywhere, analytic off the discriminant, with `ε^{1/m}` behaviour at an `m`-fold root
(research 03 §1). The Jacobian is the Vandermonde `∏(rᵢ − rⱼ)`. Every surprise the sandbox produces —
roots exploding, Wilkinson, a loop that swaps two roots — is this asymmetry. The space of monic
polynomials without multiple roots has fundamental group the braid group (Arnold 1970), and the map
`Bₙ → Sₙ` is the monodromy.

**(b) A loop in one coefficient's plane is a word in transpositions.** Fix every coefficient but `aⱼ`.
The discriminant becomes a univariate polynomial in `aⱼ` whose zeros are the points where two roots
collide; for `a₀` there are `n − 1` of them, at `a₀ = −q(cₖ)` for the critical points `cₖ` of
`q = p − a₀` (research 02 §1.3, 03 §6). A lasso from the base point around zero number `k` induces the
transposition of the two roots that collide there; the `n − 1` lassos generate `Sₙ` (Żołądek Lemma 2).
So the coefficient pane is where every permutation is _made_, and a commutator of lassos is a loop the
reader can see.

**(c) Two groups act on the roots, and they are not the same group.** The **Galois group over ℚ** of a
polynomial with rational coefficients is a permutation group with no intrinsic motion; it is computed
(research 01) and _animated_ by moving the roots along non-crossing paths realising a chosen element,
the coefficients tracing loops by Vieta. The **monodromy group** of a family `p(t, z)` is the group
generated by the lassos around its branch points; by Hermite/Harris it equals the Galois group of the
family over ℂ(t), a normal subgroup of the arithmetic group over ℚ(t), and Hilbert irreducibility says a
specialisation `p(c, z)` has the arithmetic group for all `c` outside a thin set (Krumm–Sutherland make
that set explicit). **The generic loop in the `a₀`-plane gives `Sₙ` whatever the typed polynomial's
Galois group is** — `x² − 4` has trivial Galois group and a loop around `a₀ = 0` still swaps `2` and
`−2` — so the vocabulary must never let a reader believe a loop yields a Galois element. The one
theorem that connects them is displayed as a certificate on the family page, and the sandbox's Galois
card and monodromy card are two cards, not one.

**(d) Radicals follow commutators.** Anything built from the coefficients by `+ − × ÷` returns to its
value along every loop; `ᵏ√F` returns along every _commutator_ of loops, because the winding of `F`
around 0 along `γ₁γ₂γ₁⁻¹γ₂⁻¹` is `m₁ + m₂ − m₁ − m₂ = 0`. A formula with `N` nested radical levels is
therefore trivial on every `N`-fold nested commutator, while the roots undergo the corresponding
iterated commutator of permutations. `[(12),(23)] = (123)`; `[(123),(234)] = (14)(23)`;
`[(123),(345)] = (235)` — the third feeds into itself, which is `A₅ = [A₅, A₅]`, and the cubic and
quartic succeed at depth 2 and 3 because `S₃ ⊳ A₃ ⊳ 1` and `S₄ ⊳ A₄ ⊳ V₄ ⊳ 1` terminate
(research 02 §1.3, Ramond 2020). This is Arnold's proof, and the app's ladder mode is that proof with
the identities _executed_ rather than quoted.

**(e) The picture is a charge picture.** `log|p(z)| = Σ log|z − rᵢ|` is the potential of unit charges
at the roots (research 03 §0): the phase portrait's hue vortices are the roots, the critical points are
the field's equilibria (Gauss's proof of Gauss–Lucas), lemniscates are equipotentials, and the
pseudozero set `|p(z)| ≤ ε·w(z)` is a generalised lemniscate carrying Mosier's exact statement "every
polynomial within `ε` has the same number of roots in this component".

---

## 3. Rigor architecture — how `=` is earned

All labels come from `@cas/rigor` (ADR-0040): a `Certificate` only from its five constructors, a
`Verdict` only from `assembleVerdict`, the level the _meet_ over evidence. ADR-0045's rule applies
verbatim: nothing prints a value the argument has not earned, and the caller says which value it is
showing.

**The one design decision that makes certification cheap: every number on screen is a dyadic
rational.** A `float64` is `m·2ᵉ`, so the numeric roots the picture holds are exact elements of ℚ(i),
and `p(zᵢ)`, `∏(zᵢ − zⱼ)` and the Weierstrass correction `Wᵢ = p(zᵢ)/∏(zᵢ − zⱼ)` can be computed
**exactly** in `@cas/exact`'s `Gauss` arithmetic with no error analysis at all. Smith's theorem (1970)
then says every root lies in `∪ D(zᵢ, n|Wᵢ|)` and a connected component of `k` discs holds exactly `k`
roots. That is the app's `=` engine for roots, multiplicities-as-clusters, branch points, and the
step-to-step tracking certificate — one theorem, exact arithmetic, `O(n²)` BigInt operations on
~`n·53`-bit numbers.

| Claim                                                                                | Level                               | How it is earned                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coefficients (ℚ mode)                                                                | `=`                                 | Typed text → `toExactRational`; decimals via `simplestRational`, shown back so the reader sees what was taken                                                                                                                                                             |
| Root coordinates                                                                     | `≈`                                 | Durand–Kerner + Newton polish (`@cas/core`)                                                                                                                                                                                                                               |
| "exactly one root in `D(zᵢ, ρᵢ)`" / "exactly `k` roots in this component"            | `=`                                 | Smith discs, exact `Gauss` evaluation on the dyadic roots; `ρᵢ` an exact `Frac` upper bound on `n                                                                                                                                                                         | Wᵢ    | `                                                                                                                                                                                                                                                                     |
| Multiplicity                                                                         | `=` (ℚ) / `≈` (ℂ, ℝ)                | `yunSquarefree` over ℚ; otherwise a cluster count, labelled as such (a float polynomial with a multiple root is a measure-zero event)                                                                                                                                     |
| Discriminant, and its zeros in the `aⱼ`-plane                                        | `=` (ℚ) / `≈` (ℂ, ℝ)                | `@cas/exact` `discriminant` with `aⱼ` the inner variable; zeros isolated by Smith discs on the exact polynomial. In ℂ mode: the zeros of `z·q′ − j·q` and `aⱼ = −q(z)/zʲ`, numeric                                                                                        |
| Critical points, hull, Marden foci, bounds circles                                   | `≈` / `≤`                           | Numeric roots of `p′` with their own Smith discs; bounds are exact `Frac` from the dyadic coefficients                                                                                                                                                                    |
| Pseudozero level `ε` shown on the GPU                                                | `≈`                                 | float32 shader; the honest default `ε = 2⁻⁵³`; the `=` statement per component (Mosier) is computed on the CPU from the exact discs, not from pixels                                                                                                                      |
| Monodromy permutation of a loop                                                      | `=` or `⚠`                          | Certified tracking (DESIGN §4.4): on each segment the discs about the _previous_ roots with radius `n·max                                                                                                                                                                 | Wᵢ(t) | `over the segment (exact, since`Wᵢ`is linear in`t` on a coefficient segment) are pairwise disjoint ⇒ no root swap on that segment; a segment that will not certify is bisected to a floor and then **refused by name** ("the loop passes within δ of a branch point") |
| Galois group: "contains an element of cycle type λ"                                  | `=`                                 | Dedekind: `f mod p` squarefree with that factorisation shape, prime named as witness                                                                                                                                                                                      |
| `G ≤ Aₙ` or not                                                                      | `=`                                 | `disc f` an exact integer; integer square test                                                                                                                                                                                                                            |
| `G = Sₙ` / `G = Aₙ`                                                                  | `=`                                 | Conrad's theorems 2.1 / 2.2 / 3.1 with the power trick, each hypothesis a certified row                                                                                                                                                                                   |
| `G = nTj` for `n ≤ 7`                                                                | `=`                                 | Resolvent method: roots refined in BigInt to a precision at which every resolvent coefficient's disc has radius < ½, rounded, then the integer polynomial factored / root-tested **exactly**; the numerics only suggest, the exact computation proves (research 01 §3(d)) |
| The group _labelled_ on the plotted roots (generators as permutations of roots 1..n) | `=`                                 | Stauduhar integrality test for one invariant per conjugate, certified rounding + exact verification against the resolvent                                                                                                                                                 |
| `G ≈ nTj` for `8 ≤ n ≤ 15`                                                           | `≈`                                 | Cycle-type statistics vs the transitive-group table; the row names every candidate consistent with the certified types and parity, and says when two are statistically indistinguishable (8T10 / 8T11)                                                                    |
| Solvable / not                                                                       | `=` when the group is `=`, else `≈` | Table lookup                                                                                                                                                                                                                                                              |
| Monodromy group of a family                                                          | `=`                                 | Every zero of the exact `disc_z` accounted for by a certified lasso; the generated group enumerated (BFS, capped and _saying_ so)                                                                                                                                         |
| "This formula fails to close at depth N"                                             | `=`                                 | Winding counts along the motion are integers measured from a sampled path whose samples are dense enough that consecutive arguments differ by < π (checked, else refined)                                                                                                 |
| A permutation identity in the ladder                                                 | `=`                                 | Composed by `@cas/monodromy` and compared, not quoted                                                                                                                                                                                                                     |

Two rules from Contour Integration's review are adopted unchanged: a refusal never carries a field a
consumer could read as a claim (ADR-0045's second finding), and a value earned by different rows than
its neighbour has its own predicate (`=` on the group name does not license `=` on a labelled
generator; each has its certificate).

**RISKS §3 stands and is narrowed, not overruled.** The plotter's continuation stays `≈` — nearest-match
tracking has no certificate. This app's tracker is a _different algorithm_ whose per-segment claim is a
theorem applied in exact arithmetic; ADR-0047 records that the `=` is earned by Smith's theorem, not by
the continuation's success, and that a segment which cannot be certified is refused rather than guessed.

---

## 4. System architecture

### 4.1 Core data model (full types in DESIGN §2)

- **`Polynomial`** — dual representation. `roots: Cx[]` + `lead: Cx` (root form, primary during a
  root drag) and `coeffs: Cx[]` (coefficient form, primary during a coefficient drag or after typing);
  a `source: "roots" | "coeffs"` tag says which one is the truth right now, and the other is derived.
  In ℚ mode an exact layer `exact: QiPoly` (real coefficients as `Gauss` with zero imaginary part) is
  the source of truth and both float forms derive from it. Wilkinson is well-conditioned in root form
  (research 03 §9), so the root form never loses roots to rounding while dragging roots; only a
  coefficient drag meets the covering, and it does so through the tracker.
- **`Ring`** — `"C" | "R" | "Q"`. Invariants: in `R` the root multiset is conjugation-closed and a
  dragged root drags its conjugate; in `Q` a drag snaps to `simplestRational` on release and the exact
  layer exists; the Galois card is live in `Q` only.
- **`RootReport`** — per root: coordinate, Smith disc `(centre, ρ: Frac)`, component id and count,
  multiplicity certificate, condition number `κ(rᵢ) = Σ|aₖ||rᵢ|ᵏ / |p′(rᵢ)|`, per-coefficient drag gain
  `∂rᵢ/∂aₖ = −rᵢᵏ/p′(rᵢ)`.
- **`Loop`** — a closed path in the `aⱼ`-plane (or the `t`-plane in family mode), carried
  _semantically_: `{ kind: "lasso", point: k, sign: ±1 }`, `{ kind: "word", parts: Loop[] }`,
  `{ kind: "commutator", a: Loop, b: Loop }`, `{ kind: "inverse", of: Loop }`, or
  `{ kind: "drawn", vertices: Cx[] }`. A word is a tree so a nested commutator is a structured object
  the UI can expand (research 02 §8 item 3). Sampled polylines are derived, never stored.
- **`Motion`** — a root-side realisation of a permutation `σ`: lens paths (Akalin's 3-point polyline
  with a perpendicular bulge, `θ = π/12`) for each cycle, with a collision check that falls back to a
  product of transposition lenses. Coefficient loops are derived by Vieta at each frame.
- **`TrackResult`** — `{ perm, certificate, paths: Cx[][] }` — `paths` is the per-root animation
  data and the braid strip's input.
- **`GaloisReport`** — the tiered result: irreducibility, discriminant, cycle-type witnesses, the
  Sₙ/Aₙ certificate, the identified group `{ label: "5T5", name: "S5", order, parity, solvable }`
  with its certificate, the labelled generators, and (Tier 2) the ranked candidate list.
- **`Family`** — `p(t, z)` as `BiPoly`; branch points with discs; base point; the flower of lassos;
  the generated group.
- **`Formula`** — a radical-formula tree from `@cas/expr`'s AST over symbols `a0..a{n−1}` with
  `sqrt`, `cbrt`, `root(k, ·)` nodes; the branch-tracked evaluator carries one rotation counter per
  radical node.
- **`ShellState`** — everything the permalink carries (DESIGN §8); `resolveState` is one pure function
  from state to what is computed, exactly as Contour Integration's M6.1.

### 4.2 Engines

| Engine                                                                                         | Where                                                                 | Runs                                                                           |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Numeric roots, polish, Smith discs, critical points, bounds, κ                                 | `@cas/core` (roots) + app `src/engine/roots/` (discs on `@cas/exact`) | main thread, per frame                                                         |
| Exact layer: `toExactRational`, squarefree, discriminant, discriminant-in-`aⱼ`, rational roots | `@cas/exact`                                                          | main thread (sub-ms at `n ≤ 24`)                                               |
| Tracking (certified + preview), permutations, groups, lassos, derived series                   | `@cas/monodromy`                                                      | main thread for previews; the certified pass in the worker when a loop is long |
| Galois tiers 0–2, resolvents, BigInt root refinement, the labelled group                       | app `src/galois/` on `@cas/exact`                                     | **worker** (`createComputeClient`, coefficients passed as strings)             |
| Formula evaluator with branch tracking                                                         | app `src/engine/formula/`                                             | main thread, per frame                                                         |
| GPU: phase portrait, pseudozero ladder, isolines                                               | `@cas/gpu` + app `src/ui/stage/`                                      | GPU                                                                            |

### 4.3 The stage and the panes

Two panes side by side — **root pane** and **coefficient pane** — with an **overlay toggle** that draws
both point sets on one plane (roots as ringed circles, coefficients as squares labelled by degree) over
the phase portrait of `p`. Each pane has the three-layer split Contour Integration settled at M8: a GL
canvas (the portrait and the pseudozero ladder — data, `aria-hidden`), an ink canvas (points, discs,
hull, trails, loops, lassos, braid — everything a figure must carry), and a DOM overlay for transient
chips. In family mode the pair becomes the `t`-plane (branch points, base point, lassos) and the
`z`-plane (roots at the base point, animated along a lasso). Below the stage a **strip** carries the
braid plot of the last tracked loop (time along `x`, `Re` along `y`, over/under by `Im`) — the
Contour Integration accumulator's slot.

### 4.4 Worker protocol

`createComputeClient` with the Galois request carrying the exact coefficients as decimal strings and the
ring; the worker re-parses; results carry certificates as plain data re-branded on receipt through
`@cas/rigor`'s constructors (a `Certificate` does not survive structured clone and must not be forged
from JSON — the worker returns _evidence_, the main thread assembles the verdict). The app joins
`scripts/check-built-artifacts.mjs`'s list because it spawns a worker.

### 4.5 Performance budget

- Root re-solve during a coefficient drag: ≤ 2 ms at `n = 24` (DK seeded from the previous roots +
  polish; the tracker's _preview_ pass, not the certified one).
- Smith discs: exact `Gauss` at `n = 24` ≈ `n² = 576` multiplications of ~1300-bit numbers — measured
  before PRA-1's gate, budget ≤ 8 ms; if over, discs are computed on release rather than per frame,
  and the plan says so.
- Certified tracking of a lasso with 64 segments at `n = 7`: ≤ 50 ms in the worker.
- Galois Tier 1 at `n = 7`: the degree-35 resolvent at ~600 bits — research 01 §8 estimates
  milliseconds; budget ≤ 500 ms in the worker, with the busy state shown.
- GPU: the pseudozero ladder is ~20 lines on top of the portrait; no new pass.

---

## 5. UI specification

### 5.1 Layout

The M8 shell idiom (ADR-0043): a keyed DOM builder, **two rails** around the stage, KaTeX for every
formula, a vocabulary module with a denylist test. Left rail — _what is being analysed_: the polynomial
box (typed, `z` the variable), the ring selector, the degree, the coefficient list with exact forms in ℚ
mode, the family box in family mode, the mode switch. Right rail — _what it proves_: the roots card
(each root with its disc, count, multiplicity, κ), the analysis card (discriminant, critical points,
bounds, the conditioning gauges), the **Galois card**, the **monodromy card** (the loop word, its
permutation, the certificate or the refusal), the **correspondence card** (the lattice), and in ladder
mode the **ladder card**. The keyed builder is Contour Integration's `src/shell/dom.ts`; this app is its
second consumer, so it is extracted into `@cas/ui` at PRA-1 on the ADR-0007 rule (§6).

### 5.2 Interaction rules

1. **A drag never changes the truth silently.** A root drag makes root form the source; a coefficient
   drag makes coefficient form the source and routes through the tracker so root _labels_ persist
   (root 3 stays root 3 across the drag). The badge on each root shows whether its identity across the
   last drag was certified.
2. **Snap with intent, never silently** (Contour Integration rule 4): in ℚ mode a release snaps to the
   simplest rational and the chip says which; a coefficient dragged near a discriminant point offers
   "snap to the collision" and, taken, produces an exact double root and shows the Puiseux `m`-gon as
   the reader leaves (PRA-9).
3. **Selecting a coefficient shows its branch points.** Grab `aⱼ` and the zeros of the discriminant in
   the `aⱼ`-plane appear (Stein's mechanism); they are the things to lasso.
4. **A loop is authored, not sampled.** Lasso a branch point (one click), compose (shift-click adds to
   the word), invert, commutator (two words selected → `[a, b]`); or draw with the pen. The word is
   shown as a tree beside the plane, every node expandable, every node runnable on its own.
5. **Running a loop animates and then decides.** The roots move along the tracked paths (the preview
   tracker at frame rate); on completion the certified pass runs and the permutation prints `=` with
   its cycles, or the card prints the refusal by name and the roots return to their start.
6. **A permutation can be played back on the roots.** Any permutation the app knows — a loop's, a
   Galois generator, a ladder identity — is a button that runs a root-side motion, the coefficients
   tracing their loops in the other pane.
7. **Two cards, two groups.** The Galois card and the monodromy card never share a headline, and the
   vocabulary test asserts that "Galois" never appears on the monodromy card outside the bridge
   sentence, which is displayed only where the theorem applies (family mode).
8. **Every number is a badge or a refusal** — ADR-0045's predicate, with the four levels rendered
   inline with `describeLevel`, restrictions at the point of display.
9. **Undo/redo over the state**, as M8; the permalink carries the whole state (DESIGN §8), and the
   figure export stamps the permalink and the verdicts (`cas:state`, the documented key).
10. **Keyboard parity for every drag** (`attachCanvasA11y` with a keyboard map: arrows move the
    selected point, brackets change selection, Enter runs), audited through the accessibility tree,
    not a DOM walk (M6.4's lesson).

### 5.3 Vocabulary

`engine/vocabulary.ts` decides the words once: _root_, _coefficient_, _branch point_ (of the selected
coefficient), _loop_, _lasso_, _commutator_, _swap_, _cycle_, _monodromy permutation_, _Galois group
over ℚ_, _monodromy group of the family_, _closes_ / _fails to close_ (of a formula node), _certified_ /
_refused_. House ids (`tier0`, `smith`, `stauduhar`) never reach a reader; the two-part denylist from
Contour Integration (AST literal scan + mounted-screen scan) is reused.

### 5.4 Colour and type

Roots keep one colour each across every pane and the braid strip (the plotter's hue law
`hsv(k/n, 0.85, 1)`, so a permutation is readable as colours changing places). The portrait is
Kovesi's CET-C6 (`@cas/gpu` `CET_C6`, CC-BY, extracted by ADR-0046). The pseudozero ladder is drawn as isolines in the ink
colour, not as a second hue.

---

## 6. Reuse strategy (ADR-0007 discipline)

Research 05's table, turned into commitments. **North star: the app builds fewer primitives from
scratch than Contour Integration did**, and it does — the factoriser, the tracker, the permutation
code, the exact extractor, the polish and the keyed renderer all exist today.

| Need                                                                           | Today                                                                                                           | Action                                                                                                                                                                                                           | Justification                                                   |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| AST → exact ℚ(i) polynomial (`toExactRational`, `simplestRational`)            | `apps/contour-integration/src/kernel/exactRational.ts`                                                          | **lift to `@cas/exact`**, Contour Integration re-imports, byte-identical golden                                                                                                                                  | second consumer                                                 |
| `Field<T>` + exact Gaussian elimination (`solveOver`, rank decided)            | `apps/contour-integration/src/families/{field,linear}.ts`                                                       | **lift to `@cas/exact`**, unify with the plotter's `Scalar<T>`                                                                                                                                                   | second consumer (Berlekamp nullspace, resolvent linear algebra) |
| Newton polish, Cauchy bound, cluster                                           | `packages/faber/src/roots.ts`, `apps/contour-integration/.../poles.ts`                                          | **lift `polishRoots`/`cauchyBound` to `@cas/core`**                                                                                                                                                              | already two consumers                                           |
| Smith/Weierstrass inclusion discs (exact)                                      | absent                                                                                                          | **new in `@cas/exact`** (`smithDiscs`)                                                                                                                                                                           | used by the app and by `@cas/monodromy`'s certified tracker     |
| Factorisation over ℤ / ℚ, `𝔽ₚ[x]`, Hensel, distinct-degree factorisation       | `apps/quadrature-domains/app/sym/sym-core.mjs` (untyped, on `globalThis`)                                       | **port to TypeScript in `@cas/exact`** over `Frac`/`QiPoly`; QD keeps its own copy (ADR-0008's standing exception) with a cross-check golden                                                                     | second consumer; a shim would import an app                     |
| BigInt root refinement (dyadic fixed-point Newton)                             | absent                                                                                                          | **new in `@cas/exact`** (`dyadic.ts`)                                                                                                                                                                            | Tier 1 needs ~600-bit roots                                     |
| Monodromy tracker, `permGroup`, `generatorLoop`, `permDiagram`                 | `apps/complex-function-plotter/src/riemann/`                                                                    | **extract to a new `@cas/monodromy`**; the plotter re-imports; parity golden on its `monodromy.test.ts` cases                                                                                                    | second consumer (owner-approved, round 2 question 9)            |
| Certified tracker, derived series, commutator, Sₙ/Aₙ recognisers on generators | absent                                                                                                          | new in `@cas/monodromy`                                                                                                                                                                                          | two consumers on day one (sandbox, family)                      |
| Transitive-group tables (`n ≤ 15`)                                             | absent                                                                                                          | **fetched from the LMFDB API** by `scripts/fetch-transitive-groups.mjs`, checked in as JSON with provenance and licence (CC BY-SA 4.0; GAP `transgrp` data is free to redistribute)                              | data, not code                                                  |
| Keyed DOM builder                                                              | `apps/contour-integration/src/shell/dom.ts`                                                                     | **lift to `@cas/ui`**                                                                                                                                                                                            | second consumer                                                 |
| CET-C6 colormap                                                                | `@cas/gpu` `CET_C6` (extracted from Contour Integration by ADR-0046 M6)                                         | use as-is                                                                                                                                                                                                        | —                                                               |
| Aberth–Ehrlich solver + worker pool                                            | `apps/polynomial-roots/src/engine/roots/` (app-local by ADR-0046 decision 6, "until a second consumer appears") | this app is that consumer _if_ PRA-1's measurement prefers Aberth to DK + polish at degree ≤ 24; then a second-consumer extraction to `@cas/core` beside `makeDurandKerner`, else DK stays and the row is closed | decide at PRA-1                                                 |
| Animation transport (`stepT`, `createAnimator`)                                | `apps/complex-function-plotter/src/ui/animate.ts`                                                               | **lift to `@cas/ui`**                                                                                                                                                                                            | second consumer                                                 |
| Permalink, PNG export, rigor, fatal boundary, compute client                   | `@cas/interchange`, `@cas/export`, `@cas/rigor`, `@cas/ui`                                                      | use as-is                                                                                                                                                                                                        | —                                                               |
| Draggable point handles                                                        | per-app patterns (2D Electrostatics, Riemann Map)                                                               | app-local at first; a `@cas/ui` primitive is noted for the _next_ consumer                                                                                                                                       | not yet a package                                               |

Each lift is its own commit with the source app's tests green before and after (CLAUDE.md:
test-guard every refactor), and lands in the milestone that first needs it.

### 6.1 New-app checklist (research 04 §2, verified against the tree)

`vitest.workspace.ts` · `scripts/assert-test-census.mjs` (`floor: 1`) · `scripts/a11y-audit.mjs` roster
(+ deep-linked ladder and family states with `expect` selectors) · `scripts/a11y-baseline.json` ·
`.github/workflows/deploy-pages.yml` `cp -r` (**not** at PRA-0; at the publish gate) ·
`apps/launcher/index.html` card (`Coming soon` until publish) + the three SEO blobs ·
`eslint.config.js` `APP_NAMES` (brought current by ADR-0046; add the new slug) ·
`README.md` (table, count, deploy sentence, tree) · `CLAUDE.md` (enumeration, tree, decision 11, a
Status paragraph) · `docs/ARCHITECTURE.md` §3/§8 · `docs/DECISIONS.md` ADR-0047 + index row ·
`docs/design/future-app-ideas.md` status marker · `.claude/launch.json` (`pra`, port **5185** — 5184 is Polynomial Roots') ·
`scripts/check-built-artifacts.mjs` (worker) · root `package.json` `test:browser` chain.

---

## 7. Milestones and gates

Milestones are numbered **PRA-n**. Each gate is a shippable point; `pnpm lint && pnpm typecheck &&
pnpm test && pnpm build` green before and after, never piped. Every slice carries a **mutation sweep**
(tree verified green first; `killed/total`; each survivor closed by an assertion or recorded as
equivalent with its reason). Sizing is rough order of magnitude (S/M/L).

### PRA-0 — Scaffold and spine · _S_

The app directory from the 2d-hydrodynamics template (port 5185, namespace `pra`), an empty stage that
mounts inside the fatal boundary, the wiring list of §6.1 minus the deploy `cp`, the launcher card as
_Coming soon_, ADR-0047 accepted, this plan and DESIGN checked in, the five research notes under
`docs/polynomial-root-analysis/research/`, `STATUS.md` opened.
**Gate:** the gate is green with the new app in every registry that must see it; `pnpm a11y` audits the
empty page clean; one test exists (the census floor).

### PRA-1 — The two panes · _L_

Typed polynomial (`@cas/expr` parse; `toExactRational` lifted to `@cas/exact`; a non-polynomial
refuses by name), the dual representation with its `source` tag, ring modes ℂ/ℝ/ℚ with their invariants,
root drag (Vieta, `O(n)` incremental), coefficient drag (re-solve seeded from the previous roots +
polish; labels persist), Smith discs computed exactly with `=` counts per component, multiplicities
(`yunSquarefree` in ℚ, clusters elsewhere), the GL phase portrait, the overlay toggle, the two rails
with the roots card, the permalink, the figure export, undo/redo, keyboard parity. Lifts:
`polishRoots`/`cauchyBound` → `@cas/core`, `smithDiscs` new in `@cas/exact`, the keyed builder and
`animate.ts` → `@cas/ui`.
**Gate:** a golden corpus of 30 polynomials (Wilkinson 20, roots of unity, a double root, a cluster,
Littlewood samples, every quintic family of §PRA-4) round-trips root → coeff → root to `1e-12` in root
form; every displayed root carries `= 1 root in D(zᵢ, ρᵢ)` with `ρᵢ` an exact `Frac`; the double root
reads `= 2` in ℚ mode and `≈ cluster of 2` in ℂ mode; a coefficient drag of `a₀` around a circle
enclosing no branch point returns every root to its own label (asserted by identity, not by set);
Smith discs at `n = 24` measured against the 8 ms budget and the number written into STATUS;
`applyState(s)` from a state as unlike `s` as the app gets lands on `s` (M6.1's two-state test, not the
fixed-point test); sweep ≥ 20 mutants.

### PRA-2 — Analysis overlays, wave 1 · _M_

Critical points + Gauss–Lucas hull (with the electrostatic sentence), the exact discriminant (ℚ) and
its numeric twin, **discriminant points in the coefficient pane for the selected coefficient** (exact
via `@cas/exact` `discriminant` with `aⱼ` inner; numeric via `z·q′ − j·q`), drag trails as a root locus
(time-coloured, cleared on release or kept by a toggle), the conditioning gauges (`κ(rᵢ)`, the drag gain
matrix as a heat row), and the **pseudozero ladder** on the GPU with the honest default `ε = 2⁻⁵³` and
Mosier's `=` count per component computed on the CPU.
**Gate:** for every corpus polynomial the critical points lie in the hull (asserted with the exact
`Frac` hull test on the dyadic points); the `a₀`-plane branch points equal `−q(cₖ)` to `1e-10` and, in ℚ
mode, are the isolated roots of the exact discriminant (both routes, compared); Wilkinson's ladder at
`ε = 1e-7` shows one component containing roots 10..19 (the count row reads `= 10`); a browser test
compiles the ladder shader and checks one isoline pixel against a CPU evaluation; sweep.

### PRA-3 — `@cas/monodromy` and loops · _L_

Extract the plotter's `monodromy.ts`, `permGroup.ts`, `generatorLoop.ts`, `permDiagram.ts` into
`@cas/monodromy` (plotter re-imports; its `monodromy.test.ts` cases become the package's parity golden).
Add: the **certified tracker** (DESIGN §4.4), `commutator`, `derivedSeries`, `Sₙ/Aₙ` recognisers on
generator sets, `Loop` words. In the app: lasso authoring in the coefficient pane, the word tree,
inverse and commutator builders, the pen loop, running a loop (preview animation, then the certified
pass), the monodromy card, root-side **motions** for any known permutation with the lens homotopy and
the transposition-product fallback, and the **braid strip**.
**Gate:** for `x⁵ − x − 1` with `a₀` selected, the four lassos each certify a transposition and the
generated group is `S₅` (`=`, enumerated: order 120); the commutator of two lassos sharing a root
certifies a 3-cycle and the identity `[τ₁, τ₂] = (123)` is composed by the package and compared; a
drawn loop passing through a branch-point disc **refuses by name** and no permutation prints; a
motion realising `(12345)` makes each coefficient trace a closed loop (asserted: return to start to
`1e-12`) and the roots land on their images; the braid strip's crossing count equals the word length
for a transposition lens; the plotter's Riemann-surface tests are green through the extraction; sweep.

### PRA-4 — The exact engine and Galois Tier 0 · _L_

`@cas/exact` gains `𝔽ₚ[x]` (`ModPoly`: arithmetic, gcd, powmod, distinct-degree + Cantor–Zassenhaus
equal-degree factorisation), Hensel lifting and Zassenhaus recombination (`factorOverZ`), rational-root
test, integer square test, and `Field`/`linear` lifted from Contour Integration. The app's `src/galois/`
worker: irreducibility (and the factorisation shown when reducible — the group is then identified per
irreducible factor and the joint group deferred), the exact discriminant and its square test, Dedekind
cycle types from the primes below 1000 with witnesses, and the **Sₙ/Aₙ certificate** (Conrad 2.1, 2.2,
3.1 with the power trick), each hypothesis a certificate row. The Galois card shows the growing list
"contains an element of type λ (witness p)" as a _visualisable_ object.
**Gate:** the Klüners–Malle test polynomials for every transitive group of degree ≤ 7 factor
correctly over ℤ and report irreducible; QD's `sym-core` factorisation of 50 random integer polynomials
agrees with the port (cross-check golden, the two implementations sharing no code); `x⁵ − x − 1` reads
`= S₅` with the rows "5-cycle at p = 3", "type (3,2) at p = 2, cubed is a transposition", "disc = 2869,
not a square"; `x⁵ + 20x + 16` reads `= A₅`; the Tier-0 certificate on a D₅ quintic does **not** close
and the card says "contains …; not yet identified" with no group name printed; sweep.

### PRA-5 — Tier 1 identification and the labelled group · _L_

BigInt dyadic root refinement; complex disc arithmetic over exact centres and `Frac` radii; the
resolvent engine (degree 5: Dummit's sextic from explicit coefficients, plus the C₅/D₅ resolvent;
degree 6: the `x₁ + x₂`, `x₁ + x₂ + x₃`, `x₁ − x₂` resolvents; degree 7: the degree-35 resolvent + the
discriminant; degrees 3–4 the classical cases), certified rounding, exact factorisation of the
resolvent, Tschirnhaus retry when a resolvent is not squarefree, lookup in the 37-group table, and the
**labelled group**: the conjugate of `nTj` that acts on the numbered plotted roots, found by the
Stauduhar integrality test on one invariant per coset (certified rounding + exact verification), its
generators shown as permutations of the roots and playable as motions. Tier 2 for `8 ≤ n ≤ 15`: the
fetched table, statistics, the ranked candidate list, the indistinguishable-pair warning. **Publish
gate**: the launcher card links and the deploy `cp` lands.
**Gate:** every transitive group of degree 3–7 (37 groups) is identified `=` from its Klüners–Malle
polynomial; the five quintic families (`x⁵ − x − 1` S₅, `x⁵ + 20x + 16` A₅, `x⁵ − 5x + 12` D₅, `x⁵ − 2`
F₂₀, the `ℚ(ζ₁₁)⁺` quintic C₅) print their groups with the certificate rows research 01 §4 lists; the
labelled generators, applied to the numeric roots, preserve the resolvent's certified integer root
(asserted numerically to the disc radius); for `x⁸ + …` chosen with group 8T10 the card lists 8T10 and
8T11 as indistinguishable and prints `≈`; Trinks' `x⁷ − 7x + 3` reads `= 7T5` (order 168) with "not
solvable"; `pnpm a11y --strict` clean; sweep.

### PRA-6 — The Galois correspondence, numerically · _M_

Subgroup lattices for the 37 groups of degree ≤ 7 (fetched with the tables: subgroups up to
conjugacy, with the derived series marked), each node carrying an H-invariant (an orbit sum of a root
monomial) evaluated at the numeric roots with its disc; a node reads "= integer m" when the disc
contains exactly one integer and the exact resolvent confirms it, else "not rational". Playing a
Galois element as a motion leaves the invariants of the subgroups containing it fixed and moves the
others to conjugate values; running a coefficient loop whose permutation is outside `G` moves an
invariant that was an integer off the integers — the picture of "this loop is not a Galois element".
Full lattice for degree ≤ 5, derived series always.
**Gate:** for `x³ − 2` the lattice shows `S₃`'s six subgroups with `ℚ(∛2)`, `ℚ(ω)` and the two
conjugates' invariants reading `= integer` exactly at the nodes Conrad's worked example lists; for the
D₅ quintic the `F₂₀`-invariant reads `= 40` (Dummit's `θ`); a lasso transposition applied to the D₅
roots moves that invariant off `40` (asserted with the disc); sweep.

### PRA-7 — Families · _M_

The family box (`p(t, z)` over ℚ, `BiPoly`), exact branch points as roots of `disc_z` isolated by Smith
discs, the base point, the flower of lassos (`generatorLoop`'s tethered lassos from a common base
point), each lasso's certified permutation, the generated group with its enumeration cap stated, the
**bridge card** (monodromy = Galois over ℂ(t) ⊴ arithmetic group over ℚ(t); a specialisation's group
over ℚ is a subgroup, equal outside a thin set), and the showpieces as presets: `x⁵ − x − t` (four
simple branch points, four transpositions, S₅), `x⁴ − 4x² + t` (Sottile's example: `(−1 1)` at `t = 0`,
a double transposition at `t = 4`), Trinks' `x⁷ − 7x + 3` as the member of a generically-S₇ family that
lands in the thin set.
**Gate:** `x⁵ − x − t` lists exactly four branch points (the roots of `3125t⁴ − 256`, `=`), four
certified transpositions and `= S₅`; `x⁴ − 4x² + t` gives the two named permutations; a lasso whose
tether crosses another branch point's disc refuses; specialising `x⁵ − x − t` at `t = 1` opens the
sandbox's `x⁵ − x − 1` and the bridge card cites the `= S₅` from PRA-4; sweep.

### PRA-8 — The ladder: Abel–Ruffini · _L_

The formula tree (typed through `@cas/expr` over `a0..a{n−1}` with `sqrt`/`cbrt`/`root(k, ·)`, plus a
gallery: the quadratic formula, Cardano, Ferrari, and candidate quintic formulas of nesting depth 1..4),
the branch-tracked evaluator (one rotation counter per radical node; "closes" is a measured winding of
zero), the commutator-tree builder wired to the ladder's identities, the **ladder card** with four rungs
each a `ShellState` (hence a permalink), the derived-series picture (cycle graph of `Sₙ` with the
derived subgroups as highlighted subsets, enumerated by `@cas/monodromy` — `S₄`: 24 → 12 → 4 → 1;
`S₅`: 120 → 60 → 60), and the report "depth `N` is killed by this word; the formula needs ≥ `N + 1`
levels", with the quintic rung reporting that no depth is safe.
**Gate:** Cardano's radical nodes close on every commutator of depth 2 and the outer cube root fails on
a depth-1 commutator whose permutation is `(123)` (measured winding ±1); Ferrari closes at depth 3 and
fails at depth 2 with permutation `(14)(23)`; every depth-`N` candidate quintic formula, `N = 1..4`,
fails on the depth-`N` word from Ramond's self-feeding identity, whose permutation is a 3-cycle
(composed and compared); the enumerated derived series of `S₅` is `120, 60, 60` and of `S₄` is
`24, 12, 4, 1`; every rung audits clean through its permalink in the a11y roster; sweep.

### PRA-9 — Overlays, wave 2, and the surfaced ideas · _M–L_ (backlog, owner-ordered)

Each is a slice with its own gate; the owner picks the order. Singular lemniscates (isolines of `|p|` at
critical values, exact capacity `c^{1/n}`) with the electrostatic reading · Marden's Steiner inellipse
(cubics) and Jensen discs (ℝ mode) · Newton basins as a stage mode with the Hubbard–Schleicher–Sutherland
starting circles as an `=` overlay, hover orbit, sphere view · bounds picker (Cauchy, Fujiwara, Kojima,
Eneström–Kakeya) with a Rouché/Pellet disc counter · Kalantari's Basic Family slider with the Voronoi
limit · _(random-polynomial ensembles are Polynomial Roots' — §1.2 — and are not duplicated here)_ ·
**the braid in 3D** (ℂ × t ribbon, the braid word returned) ·
**snap to a discriminant point and the Puiseux `m`-gon** on leaving it · **Zeng's distance** to the
nearest polynomial with a multiple root, drawn as an arrow in the coefficient pane · **relax to Fekete**
(gradient ascent on `Σ log|rᵢ − rⱼ|`, every κ improving live) · the **derived series on a cycle graph**
of `S₅` as an animated "the same 60 light up again" · **Sendov's conjecture** as a conjecture-badged
overlay · real-perturbation pseudozero sets in ℝ mode.

### PRA-10 — Exposition and the long tail · _L_

**The narrative layer, essential for the final product**: a stepper giving Arnold's proof in a
lecturer's order (as Contour Integration's M8 stepper), the front door of classics, prediction prompts
graded from the certificates, the faded drill over the ladder — designed to address the ladder's
states by permalink so PRA-8 needs no rework. Then, owner-ordered: Dummit's radical solution exhibited
for solvable `x⁵ + ax + b` (`=`, verified by re-expansion); Tier 1 extended to degrees 8–11 with
offline-generated Stauduhar invariant tables; Schreier–Sims for group orders beyond the BFS cap; an
optional lazily-loaded PARI-wasm cross-check (4.5 MB, never the engine); hand-offs via
`@cas/interchange` (roots → charges in 2D Electrostatics, roots ↔ Fekete points in Potential Theory, a
disc → Argument Principle, a polynomial → the plotter), each on the second-consumer rule when a
receiving tool asks.

---

## 8. Testing strategy

- **Node gate**: every engine module (roots, discs, exact, tracker, groups, tiers, resolvents,
  formula evaluator) with golden corpora committed as data modules: the 30-polynomial sandbox corpus,
  the Klüners–Malle polynomials for the 37 groups of degree ≤ 7 (plus a dozen for degrees 8–15 to pin
  Tier 2's rankings), the five quintic families with their certificate rows, the family showpieces
  with their permutations, the ladder's identities.
- **Cross-implementation goldens**: the `@cas/exact` factoriser against QD's `sym-core.mjs` on random
  inputs (two codebases, no shared arithmetic); the certified tracker against the plotter's
  nearest-match tracker on loops far from branch points (they must agree where both are sure).
- **jsdom** (per-file docblock): the shell — `resolveState` as one pure function, the two-state
  `applyState` test, the vocabulary denylist on the mounted screen across every mode and a refusing
  state, M6.4's structural invariants (one `<main>`, one `<h1>`, every canvas named or hidden).
- **Browser suite** (`pnpm test:browser`, `CAS_CHROMIUM_EXECUTABLE ?? /opt/pw-browsers/chromium`):
  the portrait and the pseudozero ladder compiled and linked; one isoline pixel against a CPU value;
  the GL canvas readable for export (`preserveDrawingBuffer`); the ink layer actually painted (M7.3's
  "measure the pixels" lesson).
- **Mutation sweeps** per slice; the sweep's own soundness checked (tree green first).
- **a11y**: the roster audits the default page, a deep-linked ladder rung, and a family state; the
  accessibility tree, not a DOM walk, is the instrument.
- **Property tests worth their cost**: Vieta round trip in root form; `smithDiscs` containment
  (verified against a high-precision refinement); "a loop that certifies has a permutation equal to the
  plotter's tracker's on the same loop"; a permutation identity composed two ways.

---

## 9. Risk register

| Risk                                                                                                 | Severity | Likelihood | Mitigation                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------- | -------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The certified tracker refuses too often near branch points (bisection floor reached on honest loops) | M        | M          | The lasso generator sizes lassos from the exact branch-point discs (radius ≥ 3× the disc); the preview always animates; the refusal names the distance so a reader can enlarge the lasso; measured on the corpus before PRA-3's gate |
| BigInt cost of exact discs per frame at `n = 24`                                                     | M        | M          | Budget in §4.5; discs on release if over; the number written down rather than assumed                                                                                                                                                |
| Tier 1 precision growth (degree-35 resolvent, coefficient discs must have radius < ½)                | M        | L          | Iterate: double the precision until every radius < ½ (research 01 §3(d)); cap at 4096 bits and refuse by name beyond it                                                                                                              |
| A resolvent that is not squarefree                                                                   | M        | M          | Tschirnhaus retry `x ↦ x + k`, `k = 1, 2, …`, each attempt a row; refuse after three                                                                                                                                                 |
| The monodromy ↔ Galois conceptual trap (a reader takes a loop's permutation for a Galois element)    | H        | H          | Two cards; the bridge sentence only in family mode; the denylist asserts the word "Galois" is absent from the monodromy card; PRA-10's narrative carries the explanation                                                             |
| Transitive-group data provenance and licence                                                         | L        | L          | Fetched by a checked-in script from the LMFDB API with a recorded date; CC BY-SA 4.0 attribution in the README and the data file; GAP `transgrp` counts cross-checked against OEIS A002106                                           |
| Coefficient-drag continuity: root labels jump when the drag crosses a branch point                   | M        | H          | It _should_ jump (a branch point was crossed) and the badge says so: the preview tracker flags a crossing, the label swap is shown as a permutation chip, and the certified pass on release decides it                               |
| Ill-conditioned high-degree coefficient drags (Wilkinson) make the coefficient pane useless          | M        | M          | The κ gauge and the pseudozero ladder are the explanation, not a bug; the degree cap is 24 and the gauge turns the drag handle's colour                                                                                              |
| The formula evaluator's radical argument passes through 0                                            | M        | M          | Refuse the run by name ("the radicand of node k vanished at frame f"); the lens paths make it measure-zero                                                                                                                           |
| Extraction of the plotter's monodromy stack breaks the Riemann-surface studio                        | M        | L          | Parity golden from its own tests; the extraction is a `git mv` + re-import with no numerics change, proven byte-identical on its corpus                                                                                              |
| A worker result forged into a `Certificate`                                                          | H        | L          | Evidence crosses the boundary as plain data; only the main thread's `@cas/rigor` constructors make certificates; a test asserts the worker module never imports `@cas/rigor`                                                         |
| Scope: PRA-8 without PRA-10's narrative reads as a toy                                               | M        | M          | The ladder card's rungs carry one sentence each from the vocabulary module — enough to name what is shown, not a lecture; the owner decided narrative comes later                                                                    |

---

## 10. Sizing

PRA-0 S · PRA-1 L · PRA-2 M · PRA-3 L · PRA-4 L · PRA-5 L · PRA-6 M · PRA-7 M · PRA-8 L · PRA-9 M–L
(owner-ordered slices) · PRA-10 L. Contour Integration's scale: the exact engine (PRA-4/5) and the
monodromy package (PRA-3) are the two hard parts; the panes (PRA-1) are the widest; the ladder (PRA-8)
is the one that has to be _right_ rather than large. Publish at PRA-5's gate (the Galois card live),
earlier at the owner's call.

---

## 11. Suggested first commit (PRA-0)

1. `apps/polynomial-root-analysis/` from the 2d-hydrodynamics template: `package.json` (description
   naming the maths, ADR-0047 and the packages: `@cas/core`, `@cas/exact`, `@cas/expr`, `@cas/gpu`,
   `@cas/rigor`, `@cas/ui`, `@cas/interchange`, `@cas/export`, and `@cas/monodromy` once it exists),
   `vite.config.ts` (port 5185), `tsconfig.json`, `eslint.config.js`, `index.html`, `src/main.ts`
   inside `runWithFatalBoundary`, `test/scaffold.test.ts`.
2. The wiring list of §6.1 (no deploy `cp`; launcher card _Coming soon_; `.claude/launch.json` entry).
3. ADR-0047 → Accepted; `docs/polynomial-root-analysis/STATUS.md` opened with _Current: PRA-1_.
4. Gate green; the test census counts the new project.

---

## 12. Decisions taken, and what remains

**Taken (owner, rounds 1 and 2):** audience a strong undergraduate with a researcher-usable sandbox;
sandbox first, exposition later but essential; coefficient field ℚ for the Galois part with the tiers of
research 01 §9 (`=` Sₙ/Aₙ any degree, `=` to degree 7, `≈` 8–15, degree 8–11 certification deferred);
ring modes ℂ/ℝ/ℚ with snap-on-release in ℚ; certified monodromy from the start with the uncertified
tracker as preview; both loop mechanisms (coefficient-pane lassos as the monodromy object, root-side
motions as the Abel–Ruffini mechanism); families first-class; the correspondence as a lattice of
numeric invariants (full lattice for degree ≤ 5, derived series always); formula trees typed and from a
gallery, Dummit's radicals deferred; tables fetched from the LMFDB API; `@cas/exact` widened and one
new package `@cas/monodromy`; the overlay order of §7 PRA-2/PRA-9; degree cap 24; the name
**Polynomial Root Analysis**; the ladder as four rung states with no narrative yet; every surfaced
idea on the PRA-9/PRA-10 backlog; no hand-offs now.

**Reconciled after the fact (2026-09-23):** PR #348 merged `apps/polynomial-roots` (ADR-0046, the
root-cloud renderer) while this plan was being written, taking the ADR number, port 5184 and the name
_Polynomial Roots_. This plan's record is therefore **ADR-0047**, its port **5185**, its name unchanged
(_Polynomial Root Analysis_ — one polynomial and what acts on it, against a cloud of all of them), the
ensemble overlay is dropped in favour of the sibling (§1.2), and `CET_C6` is taken from `@cas/gpu`.

**Decided at PRA-0 (owner, 2026-09-23): all three accepted as written.**

1. Accept ADR-0047 (this plan's decisions as a record).
2. Confirm the publish gate (PRA-5 proposed).
3. Confirm the extraction of the keyed DOM builder and `animate.ts` into `@cas/ui` at PRA-1 (both are
   second-consumer extractions by the rule; listed because they touch Contour Integration and the
   plotter).

**Deliberately unspecified** (DESIGN §10): the exact resolvent invariants for degree 6 and 7 (Cohen
6.3.10–11 vs Soicher–McKay's table — chosen at PRA-5 by testing both against the corpus), the lens-path
geometry for cycles of length ≥ 4, the braid strip's crossing convention, the transitive-table JSON
schema beyond the fields DESIGN §5 names, and the cards' typography.
