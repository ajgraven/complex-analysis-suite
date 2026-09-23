# `apps/polynomial-root-analysis` — design spec

> Companion to [`PLAN.md`](PLAN.md). PLAN says _what_ and _in what order_; this says _how_: module
> layout, the core types, the verdict rules per card, the algorithms pass by pass, the data formats,
> the worker protocol, the state/URL contract, the test corpus, and what is deliberately left open.
> Status follows PLAN's (PROPOSED). Where a choice is provisional it is marked `⚠ decide at PRA-n`.

---

## 1. Module layout

```
apps/polynomial-root-analysis/
  index.html · vite.config.ts (port 5185) · package.json · tsconfig.json · eslint.config.js
  src/
    main.ts                       runWithFatalBoundary(mount)
    engine/                       pure, DOM-free, node-tested
      polynomial.ts               Polynomial (dual form), Ring invariants, Vieta, degree cap
      roots/
        solve.ts                  DK + polish (@cas/core), seeding from previous roots
        discs.ts                  Smith discs in exact Gauss arithmetic (@cas/exact smithDiscs)
        analysis.ts               critical points, hull, bounds, κ, drag gains, multiplicities
        discriminant.ts           exact disc (ℚ), numeric disc, disc-in-a_j zeros (both routes)
        pseudozero.ts             CPU side: Mosier components from the discs (the = counts)
      loops/
        loop.ts                   Loop words (lasso | word | commutator | inverse | drawn), sampling
        run.ts                    preview (nearest-match) + certified pass via @cas/monodromy
        motion.ts                 root-side motions: lens homotopy, collision check, fallback
      galois/                     the exact engine's app half (worker-hosted)
        pipeline.ts               tiers 0–2, orchestration, evidence records (no @cas/rigor here)
        cycleTypes.ts             Dedekind witnesses from f mod p
        snan.ts                   Conrad 2.1 / 2.2 / 3.1 + the power trick
        refine.ts                 BigInt dyadic root refinement to a requested bit count
        discArith.ts              complex disc arithmetic (Gauss centre, Frac radius)
        invariants.ts             orbit-sum invariants with exact stabiliser (searched, cached)
        stauduhar.ts              relative resolvents, certified rounding, exact root test, descent
        tables.ts                 loader for data/transitive.json (+ lattice, maximal pairs)
        statistics.ts             Tier 2: consistent candidates, ranking, indistinguishable pairs
        correspondence.ts         subgroup lattice nodes, H-invariants, integer discs
      family/
        family.ts                 BiPoly p(t, z), exact branch points (disc_z + smithDiscs), presets
        flower.ts                 tethered lassos from a base point (@cas/monodromy generatorLoop)
      formula/
        tree.ts                   radical-formula AST (subset of @cas/expr Node) + depth
        evaluate.ts               branch-tracked evaluation along a motion; windings; refusals
        gallery.ts                quadratic, Cardano, Ferrari, candidate quintics depth 1..4
      ladder/
        rungs.ts                  the four rung states; identities; derived series via @cas/monodromy
      vocabulary.ts               every reader-facing word decided once; denylist source
      analyse.ts                  resolveState(ShellState) → Analysis (one pure function)
      certify.ts                  evidence → @cas/rigor certificates/verdicts (the ONLY importer of rigor)
    galois.worker.ts              re-parses the request, runs engine/galois/pipeline, returns evidence
    shell/                        DOM; jsdom-tested
      state.ts                    ShellState, DEFAULTS, mountApp, currentState/applyState
      viewState.ts                #vs= codec (namespace "pra"), verified on encode, refusals by name
      app.ts · rails/ · cards/ · stageView.ts · stageController.ts · strip.ts · undo.ts · figure.ts
    ui/
      stage/                      glStage.ts, phase.glsl.ts (+ pseudozero ladder); CET_C6 from @cas/gpu
      ink/                        points, discs, hull, trails, loops, lassos, braid strip
      markers.ts                  the plotter's halo-glyph idiom
  test/                           corpus/ + *.test.ts (+ *.browser.test.ts under pnpm test:browser)
  scripts/                        fetch-transitive-groups.mjs (LMFDB → src/engine/galois/data/)
```

Rule inherited from Contour Integration's M5.1 review: **`no-shadow` is an error for the app**, and the
worker module has a lint rule forbidding `@cas/rigor` imports (PLAN §9, the forged-certificate risk).

---

## 2. Core types

```ts
// engine/polynomial.ts
export type Ring = "C" | "R" | "Q";
export type Cx = readonly [re: number, im: number];

export interface Polynomial {
  readonly degree: number; // 1 … 24
  readonly ring: Ring;
  readonly source: "roots" | "coeffs"; // which float form is the truth right now
  readonly lead: Cx; // aₙ; 1 unless typed otherwise; fixed by a drag
  readonly coeffs: readonly Cx[]; // a₀ … aₙ  (ascending), derived when source === "roots"
  readonly roots: readonly Cx[]; // r₁ … rₙ, derived when source === "coeffs" (tracked)
  readonly labels: readonly number[]; // root identity across drags (1 … n), permuted by tracking
  readonly exact: QiPoly | null; // ℚ mode only: the truth; both float forms derive from it
}

// engine/roots/discs.ts  (backed by @cas/exact smithDiscs)
export interface RootDisc {
  centre: Cx;
  radiusSq: Frac;
  component: number;
  count: number;
}
export interface RootReport {
  root: Cx;
  label: number;
  disc: RootDisc;
  multiplicity: { value: number; exact: boolean }; // exact ⇔ yunSquarefree said so
  kappa: number; // Σ|aₖ||r|ᵏ / |p′(r)|
  gains: readonly number[]; // |∂r/∂aₖ| = |rᵏ / p′(r)|
}

// engine/loops/loop.ts
export type Loop =
  | { kind: "lasso"; point: number; sign: 1 | -1 } // around branch point #point of the selected coefficient
  | { kind: "word"; parts: readonly Loop[] }
  | { kind: "inverse"; of: Loop }
  | { kind: "commutator"; a: Loop; b: Loop }
  | { kind: "drawn"; vertices: readonly Cx[] }; // the pen; closed; base point = vertices[0]
export interface LoopContext {
  coefficient: number;
  base: Cx;
  branchPoints: readonly RootDisc[];
}

// @cas/monodromy
export type Perm = readonly number[]; // image of i is perm[i], 0-based
export interface TrackResult {
  perm: Perm | null; // null ⇔ refused
  evidence: TrackEvidence; // per segment: disjointness proven / bisections / refusal reason
  paths: readonly (readonly Cx[])[]; // per root, the sampled continuation (animation + braid)
}

// engine/loops/motion.ts
export interface Motion {
  perm: Perm;
  frames: readonly (readonly Cx[])[];
  fallback: boolean;
}

// engine/galois — evidence (plain data; certificates are made in engine/certify.ts)
export interface GaloisEvidence {
  degree: number;
  factorisation: { factors: string[]; irreducible: boolean }; // exact, over ℤ
  discriminant: { value: string; isSquare: boolean }; // decimal string of the integer
  cycleTypes: { type: number[]; prime: number }[]; // Dedekind witnesses
  snan: { verdict: "S" | "A" | "open"; rows: { hypothesis: string; witness: string }[] };
  identification:
    | {
        tier: 1;
        label: string;
        name: string;
        order: number;
        parity: -1 | 1;
        solvable: boolean;
        descent: DescentStep[];
        generators: Perm[];
      } // generators act on plotted roots
    | {
        tier: 2;
        candidates: {
          label: string;
          name: string;
          order: number;
          solvable: boolean;
          score: number;
          indistinguishableFrom: string[];
        }[];
        primesUsed: number;
      }
    | { tier: 0 };
}
export interface DescentStep {
  from: string;
  to: string;
  index: number; // e.g. "5T5" → "5T3", [S5 : F20] = 6
  resolvent: { degree: number; coefficients: string[]; bits: number }; // exact integers after certified rounding
  root: { value: string; coset: number } | null; // the rational simple root, if any
  outcome: "descend" | "stay";
}

// engine/family/family.ts
export interface Family {
  text: string;
  poly: BiPoly;
  base: Cx;
  branchPoints: RootDisc[];
  lassos: { point: number; result: TrackResult }[];
  group: GroupEvidence | null;
}

// engine/formula/tree.ts
export type FormulaNode = Node /* @cas/expr */; // vars a0..a{n−1}; calls sqrt, cbrt, root(k, ·)
export interface RadicalReport {
  node: FormulaNode;
  k: number;
  winding: number;
  shift: number;
  closed: boolean;
}

// shell/state.ts
export interface ShellState {
  mode: "sandbox" | "family" | "ladder";
  ring: Ring;
  poly: { text: string } | { coeffs: string[] } | { roots: string[]; lead: string }; // ℚ: text; else the source form
  selectedCoefficient: number | null;
  loop: Loop | null;
  motion: Perm | null;
  formula: string | null;
  family: { text: string; base: [string, string] } | null;
  rung: 2 | 3 | 4 | 5 | null;
  overlays: {
    critical: boolean;
    hull: boolean;
    discs: boolean;
    branchPoints: boolean;
    trails: boolean;
    pseudozero: number | null /* log10 ε */;
    kappa: boolean;
  };
  view: {
    overlay: boolean;
    stageMode: "quiet" | "full" | "iso" | "textbook";
    rootCam: Cam;
    coeffCam: Cam;
  };
}
```

The `Polynomial` invariant is enforced by one constructor: `source === "roots"` ⇒ `coeffs` was
computed by Vieta from `roots` in this object's construction; `source === "coeffs"` ⇒ `roots` was
computed by the tracker (or a fresh solve) from `coeffs`. There is no third path; a test constructs
both and checks the other side to `1e-12`.

---

## 3. The verdict rules per card

`engine/certify.ts` is the only module that imports `@cas/rigor`; it turns evidence into
certificates and every card renders `describeLevel` beside the glyph. ADR-0045's predicate
`valueRefusal(value, verdict, of)` is reused verbatim, the caller naming what it shows.

| Card           | Row                                                   | Certificate                                                                                      |
| -------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Roots          | coordinate                                            | `estimate` (DK + polish)                                                                         |
| Roots          | "1 root in this disc" / "`k` roots in this component" | `exact` — method "Smith 1970, exact Gauss evaluation on the dyadic roots"; restriction none      |
| Roots          | multiplicity                                          | `exact` in ℚ (Yun) · `estimate` otherwise, claim worded "cluster of `k` within `ρ`"              |
| Analysis       | discriminant                                          | `exact` in ℚ · `estimate` otherwise                                                              |
| Analysis       | branch points of `aⱼ`                                 | `exact` in ℚ (isolated roots of the exact polynomial) · `estimate` otherwise                     |
| Analysis       | critical point inside the hull                        | `exact` on the dyadic points (an exact orientation test)                                         |
| Analysis       | bound circle                                          | `bound("≤")` with the exact `Frac` radius                                                        |
| Analysis       | pseudozero component count                            | `exact` (Mosier, from the discs) — the _picture_ is `estimate` and says so once in the legend    |
| Monodromy      | permutation                                           | `exact` when every segment certified; else `refuse(reason)` and no permutation prints            |
| Monodromy      | generated group (order, name)                         | `exact` when enumerated under the cap; `bound("≥")` on the order when capped                     |
| Galois         | irreducible / factorisation                           | `exact`                                                                                          |
| Galois         | `G ≤ Aₙ`                                              | `exact`                                                                                          |
| Galois         | contains type λ                                       | `exact`, provenance the prime                                                                    |
| Galois         | `= Sₙ` / `= Aₙ`                                       | `exact`, provenance the theorem's hypotheses as `Step`s                                          |
| Galois         | `= nTj` (Tier 1)                                      | `exact`, provenance the descent steps; restriction "degree ≤ 7"                                  |
| Galois         | labelled generator                                    | `exact` per generator, provenance the coset's certified integer root                             |
| Galois         | `≈ nTj` (Tier 2)                                      | `estimate`, claim listing every consistent candidate; restriction naming indistinguishable pairs |
| Galois         | solvable                                              | meets the group row's level                                                                      |
| Correspondence | "`= m`" at a node                                     | `exact` when the disc holds one integer and the resolvent's exact root test confirms             |
| Family         | branch point                                          | `exact`                                                                                          |
| Family         | monodromy group                                       | `exact` when every branch point has a certified lasso; `refuse` naming the missing one           |
| Family         | bridge sentence                                       | `exact` (a theorem; provenance Hermite/Harris, Hilbert) — displayed only in family mode          |
| Ladder         | "node closes / fails at depth N"                      | `exact`, provenance the sampling criterion (§4.8)                                                |
| Ladder         | identity `[a, b] = c`                                 | `exact`, composed                                                                                |

A refusal never carries a value-bearing field: `TrackResult.perm` is `null` on refusal, and
`GaloisEvidence.identification` is `{ tier: 0 }` when nothing closed — the card then prints the
certified rows it has and the sentence "not yet identified", never a name.

---

## 4. Algorithms, pass by pass

### 4.1 Roots and their discs

1. **Solve.** `rootsMonicClosure` (DK, Seidel, bail on non-finite) seeded from the previous roots when
   they exist (a drag) or from the spiral otherwise; then `polishRoots` (Newton, ≤ 8 steps, stop at
   `|step| < 1e-15`). Degree 1 and 2 by closed form.
2. **Discs (exact).** Every root `zᵢ` is a dyadic `Gauss` (`Frac.of(m, 2ᵉ)` per component). Compute
   `p(zᵢ)` and `∏_{j≠i}(zᵢ − zⱼ)` in `Gauss`; `Wᵢ = p(zᵢ)/(aₙ ∏)`; `sᵢ = n²·norm2(Wᵢ)` (a `Frac`) is
   the squared radius. Disjointness of `Dᵢ`, `Dⱼ` is decided by the sufficient test
   `norm2(zᵢ − zⱼ) > 2(sᵢ + sⱼ)` (AM–GM bounds `(ρᵢ + ρⱼ)²`); components are the connected components
   of the "not provably disjoint" graph and each carries `count = size` (Smith). The reported radius
   for display is `sqrtUpper(sᵢ)`, a rational upper bound.
3. **Multiplicity.** ℚ mode: `yunSquarefree(exact)` gives factors with multiplicities; each factor's
   numeric roots are matched to discs. Otherwise a component of `k` discs reads "cluster of `k`".
4. **Critical points** are the roots of `p′` (same solve, own discs); the Gauss–Lucas containment is
   asserted per critical point by an exact orientation test against the hull of the dyadic roots.
5. **Conditioning.** `κ(rᵢ)`, the gain row `|rᵢᵏ / p′(rᵢ)|`, and the Vandermonde `|∏(rᵢ − rⱼ)|` as the
   coefficient-drag gauge; all floats, labelled `≈`.

### 4.2 Vieta and the two drags

- **Root drag** (`source = "roots"`): coefficients by incremental Vieta — multiply out `∏(z − rᵢ)`
  once (`O(n²)`) or update by dividing out `(z − r_old)` and multiplying by `(z − r_new)` (`O(n)`); in
  ℝ mode the conjugate partner moves with the mirror; in ℚ mode release snaps every coefficient to
  `simplestRational` and rebuilds `exact`, the chip naming the snap.
- **Coefficient drag** (`source = "coeffs"`): each pointer frame is a segment in one `aⱼ`-plane; the
  preview tracker (§4.4, preview mode) continues the labelled roots; on release the certified pass
  runs over the whole recorded path and either confirms the labelling (`=`) or reports the crossing it
  could not certify — the labels then stand as the preview left them but the badge says
  "identity across the last drag: uncertified".

### 4.3 The discriminant in the `aⱼ`-plane

- **Exact (ℚ mode).** Write `p` with coefficients in `QiPoly[inner = aⱼ]`: every coefficient constant
  except `aⱼ`, which is the inner variable; `@cas/exact` `discriminant(coeffs)` returns a `QiPoly` in
  `aⱼ`; its roots are solved numerically and isolated by Smith discs (exact), so a branch point is
  `= 1 root of disc in D(bₖ, ρₖ)`.
- **Numeric (ℂ, ℝ).** With `q = p − aⱼ zʲ`, a double root at `z` needs `z·q′(z) − j·q(z) = 0`; for each
  such `z ≠ 0`, `aⱼ = −q(z)/zʲ`. For `j = 0` this is `a₀ = −q(cₖ)` at the critical points. Both routes
  are computed in ℚ mode and compared in tests (PLAN §7 PRA-2 gate).
- Lasso radii are derived from the branch-point discs (`≥ 3ρₖ`, `≤ 0.4 ×` the nearest-neighbour
  distance, as the plotter's `generatorRadius`), with the tether from the base point (the current
  `aⱼ`) chosen not to enter another branch point's disc; a tether that must is refused by name.

### 4.4 The certified tracker (`@cas/monodromy`)

Input: a polyline of parameter values `t₀ … t_m` (dyadic), a function `polyAt(t) → QiPoly-like
coefficients` that is **linear in `t` on each segment** for a coefficient loop and polynomial of degree
`d` for a family segment, and the current certified roots `z₁ … zₙ` with their labels.

Per segment `[tₐ, t_b]`:

1. `Wᵢ(t) = p_t(zᵢ)/∏_{j≠i}(zᵢ − zⱼ)` at the **fixed** previous roots. Linear case: `|Wᵢ(t)|` is convex
   in `t`, so `max = max(|Wᵢ(tₐ)|, |Wᵢ(t_b)|)`; take `sᵢ = n²·max(norm2)` exactly. Polynomial case:
   expand `Wᵢ` in `s ∈ [0,1]` and bound `|Wᵢ| ≤ Σₖ |cₖ|` with `sqrtUpper` on each `norm2(cₖ)`.
2. If the discs `D(zᵢ, √sᵢ)` are pairwise disjoint (the AM–GM test of §4.1), then by Smith for every
   `t` in the segment `p_t` has exactly one root in each disc; the roots are continuous in `t`; hence
   the root in `Dᵢ` at `t_b` is the continuation of `zᵢ`. **This is the whole certificate.**
3. Solve at `t_b` (DK seeded from `zᵢ`, polished); assign each new root to the unique `Dₖ` containing
   it (exact membership test); require the assignment to be a bijection and every new root to have its
   own certified disc at `t_b`; the label of the new root in `Dₖ` is the label of `zₖ`.
4. If step 2 fails, bisect the segment (dyadic midpoint) and retry, down to a floor of `2⁻²⁰` of the
   original segment length or an absolute `δ` (`⚠ decide at PRA-3` from measurement); at the floor,
   **refuse**, naming the segment and the distance to the nearest branch-point disc.

Output: the composed permutation (labels at the end vs the start), `paths` for animation, and the
evidence (segments, bisections, the refusal). The **preview** mode is the plotter's nearest-match
tracker on the same polyline, for frame-rate animation only; it never produces a certificate.

### 4.5 Galois Tier 0

1. `toExactRational` → refuse unless the denominator is constant and the coefficients are real
   (a Gaussian-rational coefficient reads "Galois groups over ℚ need rational coefficients").
2. Clear denominators (`integerPrimitive`); `yunSquarefree`; **`factorOverZ`** (Zassenhaus:
   `f mod p` squarefree for a small `p`, `factorModP` by distinct-degree + Cantor–Zassenhaus,
   Hensel lift to a bound from Mignotte, recombination with degree-set pruning). Reducible ⇒ the card
   shows the factorisation and runs the tiers per irreducible factor; the joint group is deferred
   (PLAN §12).
3. `disc` as an exact integer (`@cas/exact` `discriminant` with constant inner coefficients);
   `isSquare` by integer square root.
4. Cycle types: for primes `p < 1000` with `p ∤ lc·disc`, distinct-degree factorisation of `f mod p`
   gives the multiset of factor degrees = the cycle type; record `(type, first witness prime)`; keep
   counting occurrences for Tier 2.
5. Sₙ/Aₙ: transitive (irreducible) + a transposition (seen, or the power trick on a `(2, odd…)` type)
   - a `p`-cycle with prime `p > n/2` ⇒ `Sₙ` (Conrad 2.1); a 3-cycle + such a `p`-cycle ⇒ `Aₙ` if disc
     is a square else `Sₙ` (2.2); a transposition + an `(n−1)`-cycle ⇒ `Sₙ` (3.1). Each hypothesis is a
     row with its witness. Nothing else is claimed at Tier 0.

### 4.6 Tier 1 — Stauduhar descent with generic invariants (degree ≤ 7)

One mechanism for degrees 3–7; Cohen's absolute resolvents (and Dummit's explicit sextic for `n = 5`)
are **test goldens**, not a second engine.

1. **Refine the roots** to `B` bits in `engine/galois/refine.ts`: Newton steps in dyadic fixed point
   (`BigInt` mantissas, exponent `−B`), each step doubling the correct bits; a final Smith-disc pass at
   `B` bits certifies `|zᵢ − αᵢ| ≤ ρᵢ`.
2. **Disc arithmetic** (`discArith.ts`): `(c, r)` with `c ∈ Gauss`, `r ∈ Frac`; `+`, `×`, integer
   powers, with outward rounding in the radius only (centres exact); `containsExactlyOneInteger`,
   `excludesAllIntegers`.
3. **Descent.** Start at `G = Sₙ` (or `Aₙ` when disc is a square, both labelled trivially). For each
   maximal transitive subgroup class `H` of `G` (from the table, embedded in `G`): find an invariant
   `F = Σ_{h∈H} h·m` for a monomial `m` whose orbit sum has stabiliser exactly `H` in `G`
   (searched over small exponent vectors at table-build time and verified at runtime by the perm
   engine); coset representatives `σ` of `H` in `G` (`≤ 120` for `n ≤ 7`); the relative resolvent
   `R(T) = ∏_σ (T − F(σ·z))` in disc arithmetic; if some coefficient's disc has radius `≥ ½`, double `B`
   and go to 1 (cap 4096 bits, then refuse by name); round to `ℤ[T]`; **exact** root test: an integer
   root `θ` (candidates are the coset values whose discs contain an integer) with `R′(θ) ≠ 0` ⇒
   `Gal ≤ σHσ⁻¹` — descend with `G := σHσ⁻¹` (labelled). If `R` is not squarefree, Tschirnhaus
   `x ↦ x + k` (`k = 1, 2, 3`) and retry; refuse after three. If no maximal `H` admits a root, `G` is the
   group: its label `nTj` is read from the table by the conjugacy class the descent followed.
4. **Output** the labelled `G` (generators as permutations of the plotted roots, the descent's steps
   as rows), parity, order, name, solvability (table). The five quintic families are the acceptance
   test; the C₅/D₅ step is the last descent from `D₅` to `C₅` with the degree-2 relative resolvent.

### 4.7 Tier 2 — statistics (degrees 8–15)

Candidates are the transitive groups of degree `n` whose cycle-type support contains every certified
type, whose parity matches the discriminant, and (when cheap) whose orbit-length pattern for the
`x₁ + x₂` resolvent matches the factorisation of that resolvent (degree `C(n, 2) ≤ 105`, factored
exactly). Rank by a χ² score of observed frequencies against each candidate's distribution over the
primes used; report the list, the score, the number of primes, and — from the table — the sets of
candidates with identical distributions ("cycle statistics cannot separate 8T10 from 8T11"). `≈` only.

### 4.8 The formula evaluator

A `FormulaNode` is an `@cas/expr` AST restricted to `num`, `const`, `var aₖ`, `neg`, `arith`,
`call sqrt/cbrt/root`. Along a motion (frames `f = 0 … F`), evaluate bottom-up; at a radical node
`root(k, X)` with argument values `X_f`: require `|X_f − X_{f−1}| < |X_{f−1}|` for every `f` (else the
frame set is refined by inserting midpoints until it holds, up to a cap, then refused by name); under
that criterion the wrapped argument increment is the true increment, so the total winding `m ∈ ℤ` is
decided; the node's branch shifts by `m mod k`; it **closes** iff `m ≡ 0 (mod k)`. The value tracked is
`|X|^{1/k} · e^{i(arg₀ + accumulated)/k}` — continuous by construction, never re-selected by
proximity. A vanishing radicand (`|X_f|` below `1e-9` of the frame's scale) refuses the run. The
report names the shallowest node that fails and its depth; the "needs ≥ `N+1` levels" sentence is the
vocabulary's.

### 4.9 Motions

`motion.ts` realises `σ` as frames: for each cycle `(i₁ … i_k)` every `r_{iₗ}` travels to `r_{iₗ₊₁}`
along a 3-point polyline (midpoint displaced by `½·tan θ·|chord|` to the left of the chord,
`θ = π/12`), all cycles simultaneously, fixed points stationary; a collision check over all frames
(minimum pairwise distance `> 0.05 ×` the configuration's diameter) accepts the motion, else the
fallback runs `σ` as a product of transpositions sequentially, each a lens, `fallback: true`. The
inverse motion is the mirrored bulge. Coefficients per frame by Vieta; the coefficient pane draws
their loops and, for a loop of `a₀`, shows the winding around each branch point as a chip.

---

## 5. Data formats

### 5.1 `src/engine/galois/data/transitive.json` (generated; never edited by hand)

```jsonc
{
  "source": "LMFDB gps_transitive API, fetched 2026-MM-DD by scripts/fetch-transitive-groups.mjs",
  "licence": "CC BY-SA 4.0 (LMFDB); counts cross-checked against OEIS A002106",
  "degrees": {
    "5": {
      "count": 5,
      "groups": {
        "5T5": { "name": "S5", "order": 120, "parity": -1, "solvable": false, "primitive": true,
                 "generators": [[1,0,2,3,4],[1,2,3,4,0]],
                 "cycleTypes": { "1.1.1.1.1": 1, "2.1.1.1": 10, "2.2.1": 15, "3.1.1": 20, "3.2": 20, "4.1": 30, "5": 24 },
                 "maximalTransitive": [ { "label": "5T4", "embedding": [[...],[...]] }, { "label": "5T3", "embedding": [...] } ],
                 "sameStatisticsAs": [] },
        "…": {}
      }
    }
  }
}
```

`cycleTypes` are class sizes by type (from LMFDB class data; for degrees ≤ 7 recomputed by
enumeration in the script and required to agree). `maximalTransitive` and the invariants' monomials
are computed by the script for degrees ≤ 7 with the same perm code the app uses (`@cas/monodromy`),
so a table entry and a runtime check cannot disagree by construction. For degrees 8–15 only the
metadata and `cycleTypes` are stored (`⚠ decide at PRA-5`: if the API does not expose class data for a
group, the script enumerates groups of order ≤ 10⁶ and marks larger ones `cycleTypes: null`, which
Tier 2 treats as "consistent by type membership only, unrankable").

### 5.2 Subgroup lattices (PRA-6), `data/lattice.json`

Per group of degree ≤ 7: subgroups up to conjugacy with order, a representative generator set, the
containment edges, the derived-series chain marked, and per node one monomial whose orbit sum has
stabiliser exactly that subgroup (searched at build time). Full lattices for degree ≤ 5; for 6 and 7
the transitive sublattice plus the derived series.

### 5.3 Test corpora (`test/corpus/`)

```ts
export interface SandboxCase {
  id: string;
  text: string;
  ring: Ring;
  expect: {
    degree: number;
    multiplicities?: number[];
    discIsSquare?: boolean;
    hullContainsCritical: true;
  };
}
export interface GaloisCase {
  id: string;
  text: string;
  source: "Klüners–Malle" | "LMFDB" | "research-01";
  group: string;
  order: number;
  solvable: boolean;
  tier: 0 | 1 | 2;
  rows?: string[];
}
export interface FamilyCase {
  id: string;
  text: string;
  base: [string, string];
  branchPoints: number;
  perms: Perm[];
  group: string;
}
export interface LadderCase {
  rung: 2 | 3 | 4 | 5;
  formula: string;
  word: Loop;
  perm: Perm;
  closesAtDepth: number | null;
}
```

---

## 6. Worker protocol

`createComputeClient<GaloisRequest, GaloisEvidence>` with:

- `GaloisRequest = { coefficients: string[]; ring: "Q"; degreeCap: 15; primesBelow: 1000; bitsCap: 4096 }`
  — decimal strings, so `Frac` class identity never crosses the boundary;
- `compute` = the same `runPipeline` the worker calls (`runSync` parity, as CD's `JuliaMetricsClient`);
- `onBusy` drives the card's busy state; coalescing means a keystroke burst yields one answer;
- the worker returns **evidence only**; `engine/certify.ts` assembles verdicts on the main thread.
- The tracker's certified pass also runs through the client for loops longer than 64 segments
  (`⚠ decide at PRA-3` after measuring).

---

## 7. State, URL, undo

- `ShellState` (§2) is the whole truth; `resolveState(s)` is pure and is what the golden tests run.
- `#vs=` via `@cas/interchange` `encodeViewState("pra", state)`; the decoder rejects a foreign app,
  fills `DEFAULTS` for absent fields, and **refuses by name**: an unknown mode, a coefficient index past
  the degree, a lasso naming a branch point the polynomial does not have, a formula that does not
  parse, a non-finite number, a family text that is not polynomial in `t` and `z`.
- **Verified on encode** (M6.2's rule): the loop word is re-sampled and the motion re-realised from
  the encoded state and compared by shape before a link is minted; a state that cannot be honoured
  refuses rather than minting a link that opens a different picture.
- A drawn loop is carried as its vertices (semantics, not samples: the vertices _are_ the object);
  a lasso word is carried as the tree; a motion as the permutation; trails are never carried.
- Undo/redo over `ShellState` snapshots, as M8; a drag is one undo step (its release), not a frame.
- The figure export composites `[gl, ink]` of both panes plus the strip, stamps `Software`,
  `cas:state` (the permalink) and the headline verdicts under `cas:verdict`.

---

## 8. Test corpus content (initial)

- **Sandbox (30):** Wilkinson 20; `z²⁴ − 1`; `(z − 1)²(z + 2)³`; a 3-cluster at spacing `1e-4`;
  three Littlewood polynomials; `z⁵ − z − 1`; the five quintic families; Trinks; a real-coefficient
  quartic with two conjugate pairs; a degree-1 and a degree-2; a polynomial with a zero root; a
  non-monic; a typed decimal (`0.1z² − 1`, snapping to `1/10`); ten random integer polynomials of
  degree 6–12 with fixed seeds.
- **Galois (≥ 50):** the Klüners–Malle polynomial for each of the 37 transitive groups of degree 3–7;
  the five quintic families with their rows; Trinks (7T5, order 168); `x⁶ + x⁴ + x + 3` (Conrad's
  transposition-at-311 example); an 8T10 and an 8T11 polynomial (Tier 2 indistinguishable); two
  reducible inputs; one with a Gaussian coefficient (refused); one of degree 16 (Tier 0 only).
- **Family (4):** `x⁵ − x − t`, `x⁴ − 4x² + t`, `x³ + t·x + 1`, `x⁷ − 7x + t` with `t = 3` specialised.
- **Ladder (8):** the four rungs' gallery formulas with the words of PLAN §7 PRA-8's gate.

---

## 9. Vocabulary (initial decisions)

_root_ · _coefficient_ · _branch point of `aⱼ`_ (never "discriminant zero" on screen; the analysis
card's discriminant row says "the discriminant vanishes at these values of `aⱼ`") · _loop_, _lasso_,
_word_, _commutator_ · _swap_ (a transposition), _cycle_ · _monodromy permutation_, _monodromy group of
the family_ · _Galois group over ℚ_ · _closes_ / _fails to close_ · _certified_ / _refused_ ·
_exactly `k` roots in this disc_. Denied on screen: `Smith`, `Stauduhar`, `Dedekind`, `tier`, `DK`,
`Weierstrass`, `nTj` without its name, `Sn`/`An` without subscripts.

---

## 10. Deliberately unspecified

- The exact monomials used for invariants (searched at build time; the search order is an
  implementation detail with a test that the stabiliser is exact).
- Whether degree 6 and 7 use additional absolute resolvents as _shortcuts_ before the descent
  (`⚠ decide at PRA-5` by timing).
- The lens geometry for cycles of length ≥ 4 beyond the collision check and its fallback.
- The braid strip's over/under convention and its colour law beyond "one colour per root".
- The bisection floor and the absolute `δ` of the tracker (measured at PRA-3).
- The pseudozero ladder's default rungs beyond `ε = 2⁻⁵³` and `1e-7`.
- Card typography, the front door, and everything PRA-10 owns.
