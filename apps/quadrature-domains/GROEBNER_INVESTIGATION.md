# Expanding the solvable class of the QD Gröbner / polynomial-system engine

> Research investigation (4 parallel agents: algorithms, symbolic-numeric, WASM/bridges, QD
> structure) + synthesis. Goal: handle **more** systems (more variables, positive-dimensional,
> larger QD families) while staying **portable** (no-build vanilla JS, browser + Node), **usable**,
> **efficient**. Grounded in this session's hard findings: plain Buchberger hits a *combinatorial*
> S-pair wall ~14 vars / ~478 gens; multi-modular GB was built, verified, and reverted (slower);
> content removal already tames coefficients; reality reduction is the biggest lever shipped.

## The core reframe

The bottleneck is **not** "Buchberger is too slow per step" — Phase A/D already made the exact kernel
~4.5× faster, bit-identically, and it didn't move the wall. The wall is **combinatorial** (number of
S-pairs) and **structural** (the full conjugate model carries twice the variables it needs). So the
highest-leverage moves, in order, are:

1. **Shrink the problem before the engine sees it** (exploit QD structure — it's deeply *linear* and
   *symmetric*). Cheapest, biggest, fully portable, no engine risk.
2. **A better *solve* path** (eigenvalue / quotient-ring solving) that reuses machinery already in the
   repo and handles a strictly larger zero-dim class than today's shape-lemma.
3. **A stronger *GB algorithm*** (signature-based / GVW) that attacks the S-pair wall directly.
4. **Escape hatches** (external `msolve` bridge; optional in-browser Giac/Xcas WASM) for the genuinely
   hard cases no in-JS method will crack.

Everything below is rated on **(payoff × portability ÷ effort)** for *this* tool.

---

## Tier 1 — Structural & preprocessing wins (cheap, portable, no engine changes) ★ start here

> **STATUS: L1 SHIPPED** (`Sym.linearReduce`, integrated into `solveZeroDim` as a default-on
> `preprocess` step; also fixing φ(0) — `generateClassicalBounded(hData,{w0})` — removes w₀/w̄₀ up
> front). Honest scope: for the cleared-denominator conjugate model L1 strips the *gauge* (1 var)
> but not more — the (★) rows carry the A-coefficients with non-constant (z/z̄-dependent) leading
> coefficients, so they aren't constant-linear. L2–L6 (linear gauge elim, auto-reality, symmetry
> relations, grevlex→FGLM routing, Möbius saturation) remain open.

The QD coefficient blocks are linear in the parameters and low-index coefficients
(`qd-equations.js generateClassicalBounded`): the **gauge** is linear in every `A_{j,1}`; each
**`(★)_{j,s}`** row is linear in its `C_{j,s}`; the **locator** is linear in `a_j`. And the systems
carry provable *linear* symmetry relations. L1 below now exploits the genuinely-constant-linear
generators before solving (the gauge); the rest is L2–L6.

- **L1 — Linear-substitution preprocessing (`Sym.linearReduce`).** Repeatedly: find a generator of
  total degree 1 in some variable with constant leading coefficient, solve it, `MPoly.subst` into the
  rest, to fixpoint. Removes variables with **zero degree growth** (resultants *raise* degree). ~50
  lines over the existing `MPoly.degreeIn/coeffsIn/subst`. **Biggest single portable win** — shrinks
  essentially every QD system before Buchberger.
- **L2 — Linear gauge elimination.** `eliminateWithGauge` currently uses a *resultant* even though the
  gauge is linear (degree 1) in the shared `A_{j,1}`. Substitute instead when `degreeIn===1` — same
  result, no Sylvester matrix, no degree inflation. `algebra-store.js:248`.
- **L3 — Auto-reality on provably-real branches.** Reality reduction (`v̄→v`) is the shipped lever that
  took the cardioid 478→118 gens. When the quadrature data `{a_j, C_{j,s}, w0}` is real **and** the
  pole multiset is conjugation-symmetric (disk, cardioid `z+z²/2`, single order-n pole `z+zⁿ/n`), a
  real solution branch *provably* exists — assert `realVars = baseVariables()` automatically (or
  certify it cheaply from the numeric `φ` via `buildVarMap`). Makes the 118-gen regime the default.
- **L4 — Provable symmetry relations as linear substitutions.** Conjugate pole pairs give
  `z_2 = z̄_1`, `A_{2,k}=Ā_{1,k}`; `Z_n`-symmetric maps force many `A_{j,k}=0` and tie phases. These
  are *exact linear* substitutions (reality is the special case for the conjugation involution).
  Reuses `relabel`/`subst`; pairs with the existing `symmetry.js detectSymmetry`.
- **L5 — Better defaults / routing.** (a) Route any **zero-dimensional** `order:'lex'` request through
  the already-built **grevlex→FGLM** pipeline instead of direct lex Buchberger (`isZeroDimensional` is
  cheap and present). (b) Auto-populate the elimination block with the *hard* variables (`z_j, z̄_j` —
  they carry the Möbius powers), leaving the linear-appearing `A_{j,k}` in the trailing block. (c) A
  "**sparsest-variable-last**" ordering pre-pass, optionally trying 2–4 orders under a Worker deadline
  and keeping the first that finishes (variable order can swing GB size by orders of magnitude).
- **L6 — Saturate by the Möbius factors.** After generation, `saturate` by `Π(1 − z̄_j z_j)` to drop
  spurious `|z_j|=1` boundary components that cleared denominators introduce — lowers quotient
  dimension and helps `solveZeroDim` reach shape position. `saturate` already exists.

**Tier-1 verdict:** days of work, no new engine, fully portable, and likely the difference between
"hangs" and "finishes" for most QD systems of interest. **Do this first.**

---

## Tier 2 — A better solve engine (medium effort, big class expansion for *solving*)

> **STATUS: S1 SHIPPED** (`Sym.solveByEigenvalues` + `multiplicationMatrix`; `solveZeroDim` falls
> back to it on any shape-position failure → solves every radical zero-dim ideal). S2 (certified
> numerics) deferred as an optional hardening follow-up.

- **S1 — Eigenvalue / quotient-ring solving (Möller–Stetter + reordered-Schur). ★ highest solve-path
  ROI.** For a zero-dim ideal, `R/I` has the **standard monomials** as a basis — which
  `standardMonomials()` **already computes** — and multiplication-by-`xᵢ` is a matrix `Mᵢ` whose
  **eigenvalues are the `i`-th coordinates of the solutions** (Stickelberger). Build each `Mᵢ` by
  GB-reducing `xᵢ·b` for `b∈B` (exact over ℚ(i), operations the engine already does); form one random
  combination `M=ΣcᵢMᵢ`; compute its **Schur form**; read coordinates as Rayleigh quotients
  (Corless–Gianni–Trager–Watt). **This removes the shape-position failure** that makes today's
  `solveZeroDim` give up (`sym-core.js:1424`) — it solves a *strictly larger* zero-dim class with
  scaffolding already in the repo. Needs a dense **complex Schur/QR eigensolver** in JS (portable;
  modest sizes since quotient dimension is capped). Reuses the existing Durand–Kerner finder for the
  univariate step.
- **S2 — Certified numerics (Krawczyk interval-Newton + Smale α-theory over ℚ(i)).** Wrap the
  *existing* Newton / Durand–Kerner / S1 outputs in an interval-Krawczyk test → a **proof** that a
  unique root exists in a small box; or an exact α-certificate using the tool's ℚ(i) layer. ~100 lines
  of portable interval arithmetic. Turns "numeric guess" into "rigorous root" — the trust gap a
  numeric solver leaves. Low effort, high value, composes with S1 and the existing solver.

---

## Tier 3 — A stronger GB algorithm (higher effort; the S-pair-wall lever)

> **STATUS: G1 SHIPPED** (`Sym.buchbergerSig`; opt-in via `buchberger(…, {signature:true})`).
> POT module order + syzygy/Koszul + rewrite criteria on the packed kernel. Bit-identical to
> `buchberger` (reduced GB is unique); **cyclic-5 2.2× / cyclic-6 ~1.3× faster**. G2 (truncated
> GB) and G3 (Gröbner Walk) not pursued. Note: the rewrite criterion is the simpler srcIdx form —
> a one-J-pair-per-signature dedup would prune further (future work).

- **G1 — Signature-based Gröbner (GVW, one-shot, grevlex). The engine-level class-extender.**
  Add a `(monomial, index)` **signature** to each generator; prune whole families of S-pairs via the
  **syzygy** + **rewrite** criteria *before* reduction. Benchmarks (processed-pair counts = your literal
  wall): GVW 191 vs F5 691 on Katsura-8, 974 vs 3905 on Cyclic-7 — and far more vs plain GM-Buchberger.
  Choose **GVW** over F5 for its *proved termination* (F5's was an open/flawed problem). Maps almost
  1:1 onto the existing Buchberger loop (signature compare = one packed-exponent compare + index
  tiebreak); reuses the ℚ(i) reducer verbatim. Caveat: QD systems are overdetermined/non-regular, so
  it won't hit *zero* zero-reductions, but the rewrite criterion still prunes hard. Effort: 2–4 days
  for a correct, terminating GVW; medium risk (criterion correctness, restricted/regular top-reduction).
- **G2 — Truncated / d-Gröbner mode.** When the question is bounded ("a degree-≤2 relation among the
  coefficients", "the elimination ideal up to degree d"), maintain G up to degree d and stop once no
  new generator appears at that degree. Turns an infeasible full GB into a feasible bounded answer.
  Low effort on the existing sugar/degree machinery — **must** be gated to bounded queries (a truncated
  GB is not a full GB).
- **G3 — Generic Gröbner Walk.** Order-conversion (grevlex→lex/elim) that, *unlike FGLM*, works on
  **positive-dimensional** ideals — the precise gap in the stack today. Generic walk uses only
  small-integer term-order comparisons (no big-integer perturbation). Pairs naturally with a
  grevlex-first GVW. Medium effort; step count can vary.

**Do NOT build in JS:** **F4 / Matrix-F5** (its speed *is* fast sparse linear algebra over the field —
vanilla-JS BigInt ℚ(i) has none, so you'd lose the whole advantage and inherit memory blowup). Take
F5's *signature* idea (G1), not F4's *matrix* idea. **Multi-modular GB** — already proven a dead end
(combinatorial wall, not coefficients). **Hilbert-driven** — needs an unknown-a-priori series for
inhomogeneous QD input. **Sparse-FGLM/Wiedemann** — accelerates a non-bottleneck.

---

## Tier 4 — Escape hatches (low effort, unbounded ceiling)

- **E1 — `msolve` `.ms` export + importer (the concrete Phase-3 bridge). ★ the real wall-demolisher.**
  msolve is the fastest free F4 GB + real-root-isolation engine; its `.ms` input maps ~1:1 onto the
  existing term-list export (line 1 = vars; line 2 = `0` for ℚ; then comma-separated polys). Add an
  "Export to msolve" button (+ the `msolve -f in.ms -o out.ms` command) and an importer that parses the
  output back into the solution model. For the deeper real/semi-algebraic ambition, also emit a
  Macaulay2 (`Msolve` package) or Sage script; the gold standard is Maple
  `RealComprehensiveTriangularize` (proprietary). Zero in-browser cost (pure string I/O), but **not
  self-contained** (user runs msolve). This is the only path that truly removes the ceiling.
- **E2 — (optional) Giac/Xcas WASM, lazy-loaded.** The *only* browser-ready WASM CAS with a genuine
  multivariate Gröbner engine (`gbasis`), runs fully client-side, **no server, no COOP/COEP headers**
  (single-threaded), ~12 MB vendored static files, **GPL3**. Lazy-load behind a "heavy engine" toggle.
  Honest ceiling: single-threaded WASM is only ~1.5–2× over good JS (and up to >15× *slower* than
  *native* msolve on hard symbolic GB) — it buys *some* headroom past 14 vars, not an order of
  magnitude. GPL3 + 12 MB payload are real costs; check the license against the project's.
- **E3 — Parameter homotopy for the QD family.** QD systems are a *parametric family*; once one generic
  member is solved (even via E1/S1), reach any nearby quadrature data by predictor–corrector tracking
  in the parameter — only `#solutions` paths, reusing the **Newton solver already in the app**, no
  mixed-volume needed online. Uniquely exploits the QD structure; numeric (certifiable via S2).
  **Skip from-scratch polyhedral homotopy** (mixed-volume machinery is the wrong cost profile for a
  no-build JS tool) and **in-JS numerical irreducible decomposition** (too sophisticated — consume it
  as a CAS-export target instead).

**Skip outright:** Pyodide + SymPy (huge payload, *pure-Python Buchberger* = the same wall, slower);
nerdamer/Algebrite (degree-3 max, no multivariate GB); GAP.js / CoCoA-wasm / Singular-wasm (no
browser-runnable artifact exists); WASM *threads* on a static host (needs COOP/COEP a static host
can't send; only a `coi-serviceworker` hack, which dings portability).

---

## Recommended sequencing

1. **Tier 1 (L1–L6)** — structural/preprocessing + routing. Cheapest, most portable, biggest class
   expansion per line; makes the cardioid-class default-tractable. **No engine risk.**
2. **Tier 2 S1 (eigenvalue solving)** — removes the shape-position failure; strictly larger zero-dim
   solve class; reuses existing FGLM/standardMonomials. Then **S2 (certified numerics)** to harden.
3. **Then choose by appetite:** **E1 (`msolve` bridge)** for an immediate, low-effort, unbounded
   ceiling on the hard cases; **and/or G1 (GVW)** for a genuine in-engine class-extension (more effort,
   keeps everything in-browser). **G3 (walk)** if positive-dimensional elimination becomes important.

Each tier is independently shippable and bit-identical-where-applicable. Tiers 1–2 alone likely move
the practical ceiling from ~14 to a meaningfully larger class while staying 100% portable; E1 removes
the ceiling for the rest without touching portability of the core.

## Sources (selected)
Signatures/GVW: Gao–Volny–Wang; Eder–Faugère survey (arXiv:1404.1774). Walk: Fukuda et al.
(math/0501345). Triangular/regular chains: Chen thesis (UWO); arXiv:1104.0689. Eigenvalue solving:
Sturmfels CBMS; Corless–Gianni–Trager–Watt reordered-Schur; Telen–Mourrain–Van Barel TNF
(arXiv:1803.07974). Certified numerics: M2 NumericalCertification; alphaCertified (arXiv:2405.04842).
Parameter homotopy/monodromy: Duff et al. (IMA JNA 39(3):1421; arXiv:1609.08722). WASM/bridges: msolve
(github.com/algebraic-solving/msolve); Giac/Xcas; "Not So Fast" WASM-vs-native (arXiv:1901.09056).
QD structure: app/qd-equations.js, app/algebra/algebra-store.js, app/symmetry.js.
