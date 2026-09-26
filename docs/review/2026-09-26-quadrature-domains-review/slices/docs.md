# docs — summary

Covered QD's 12 top-level docs plus the four module READMEs, the suite-level claims about QD (CLAUDE.md, root README,
MIGRATION, INTERCHANGE, ADR-0003/0006/0008/0018/0026/0032), the launcher card, `package.json`, the licence files, the
thesis artefacts, and in-code headers that make checkable claims. I measured rather than re-read: a path-existence
probe over every doc, a symbol/line probe over THEORY_MAP, glyph counts over `thesis.txt`, a grep of the built `dist/`
for licence notices, and a run of the orphaned clean-realm test child. Probes are in
`/tmp/claude-0/-home-user-complex-analysis-suite/7d83a4a1-9cc2-5097-8eba-a8efea56452d/scratchpad/docs/`.
**Headline.** The mathematics in the docs is mostly right: I re-derived the (★)/(★_S) Lagrange duality, the
Aharonov–Shapiro resolvent and worked numbers, and the simple-pole Blaschke–Jacobian. There are four real problems.
(1) One test file (`worker-graph-cleanrealm`) is run only by the legacy runner, and the docs that say the root gate
is complete are wrong. (2) The Schwarz "tiling set" is defined backwards in three docs, against the thesis and the
app's own UI. (3) `thesis.txt`, named as the ground-truth maths reference, has had every formula glyph stripped out.
(4) The README says the KaTeX and math.js licences ship in `dist/`, and they do not. The rest is widespread
staleness, and a 5,908-line HANDOFF that four other trackers overlap.

## Findings

### DOC-1 [P2] The clean-realm worker-graph test is run by neither the gate nor CI, and the docs say the gate is complete
- Category: test / stale-doc
- Location: `app/node-test.js:56` (listed there) vs `vitest/node/` (29 wrappers, none for it); `CONTRIBUTING.md:157-162`; `README.md:127-129`; `CLAUDE.md` ("29 per-file specs … `app/node-test.js` is kept for standalone runs")
- Claim: `app/test/` holds 30 `*.test.js` files. `vitest/node/` wraps 29 of them. The missing one is
  `worker-graph-cleanrealm.test.js`, which guards the bug class "an ESM module uses a kernel global without importing
  it". That bug is invisible in-process, and the guard exists because of a shipped regression (powerQD / bounded-PQD
  `Complex is not defined`). The root `pnpm test` runs Vitest only, and no CI workflow runs
  `pnpm -C apps/quadrature-domains test`. So the guard runs only when someone types `node app/node-test.js`.
  CONTRIBUTING's "to add a subsystem, drop a file there and add its name to the TESTS array" is the path that created
  the gap: it never mentions the Vitest wrapper. README says "The root gate is the complete suite check".
- Evidence (measured): `ls app/test/*.test.* | wc -l` → 30; `ls vitest/node/*.test.* | wc -l` → 29;
  `grep -rn worker-graph-cleanrealm` matches only `app/node-test.js` and the file itself;
  `grep -n 'node-test\|quadrature' .github/workflows/*.yml` finds no test invocation. The child passes today:
  `node app/test/worker-graph-cleanrealm.child.mjs` → `CLEANREALM_OK 4`, exit 0.
- Confidence: high
- Prior review: new
- Fix: add `vitest/node/worker-graph-cleanrealm.test.ts` (floor 2, already in `node-test.js:101`). Add a test
  asserting that the `TESTS` array and `vitest/node/*.test.ts` are the same set. Update CONTRIBUTING's recipe. (S)

### DOC-2 [P2] The Schwarz "tiling set" is defined backwards in THEORY_MAP, app/schwarz/README and README
- Category: maths / stale-doc
- Location: `THEORY_MAP.md:230-233`; `app/schwarz/README.md:4-6`; `README.md:721-724`
- Claim: THEORY_MAP says iterating σ "partitions the plane into the 'tiling set' (orbits stay bounded forever) and its
  complement (orbits escape after n steps)". `app/schwarz/README.md` says the same. README says "points that stay in
  Ω forever are the tiling-set interior (black)". The thesis (§5.8, `thesis.txt:7052-7055`) defines it the other way:
  "The tiling set, composed of the set of points which **eventually escape to the fundamental tile** … the
  non-escaping set, those points which do not escape". The app's code and in-app help use the thesis meaning:
  `schwarz-ui.mjs:31-32` gates the preimage-tree seed "to the tiling set (escapeTime kind 'fundamental')", and
  `ui-strings.mjs:476-480` agrees. THEORY_MAP also says "σ : Ω → Ω". σ is defined on Ω̄ and maps into ℂ̂. It does not
  preserve Ω, which is the whole reason there is a fundamental tile.
- Evidence (measured): the quotes above. `grep -n -i 'tiling set' thesis.txt`.
- Confidence: high
- Prior review: new
- Fix: rewrite all three to the Lee–Makarov / thesis definitions: the tiling set T^∞ is the points that eventually
  land in the fundamental tile; K is the non-escaping set; the limit set is ∂T^∞. (S)

### DOC-3 [P2] `thesis.txt`, the named "ground-truth math reference", has no mathematical symbols; `prop463.txt` is misnamed, unreferenced and of untraceable origin
- Category: stale-doc / structure
- Location: `thesis.txt` (460 KB); `prop463.txt`; `HANDOFF.md:5899-5903` ("The thesis PDF and the extracted `thesis.txt` … are the ground-truth math reference"); THEORY_MAP "Equation labels match the thesis"
- Claim: the extraction dropped every Greek, script and math-italic glyph. Theorem 3.2.2's inverse formula reads
  `= (0) + -1()#.` and the Blaschke factor reads `() = - .`. Nothing in THEORY_MAP or SCHWARZ_FORMULATION can be
  checked against it (I had to fall back to first principles for every derivation in this review). The PQD weight
  normalisation (4.2.1) and the Thm 5.3.2 bound `0 < α ≤ π²` cannot be read off it at all. `prop463.txt` is a much
  better extraction (math-italic intact), but it covers thesis pages 72–75: the proof of Thm 4.4.2 through the proof
  of Thm 4.5.2. It is not Proposition 4.6.3, which is at `thesis.txt:4547`, on another page. Nothing references it.
  Its provenance cannot be traced here, because the clone's history is grafted at `c19ec92` (#300, an unrelated
  faber-transform commit) and all three files appear there first.
- Evidence (measured): a Python count of code points in U+1D400–1D7FF / U+0391–03C9. `thesis.txt`: 0 math-italic,
  0 Greek, 0 `Ω`, 0 `φ`. `prop463.txt`: 478 math-italic, 39 Greek, 35 `Ω`, 40 `φ`. `sed -n 1738,1748p thesis.txt`.
- Confidence: high
- Prior review: new
- Fix: re-extract the whole PDF the way `prop463.txt` was made, with `===== PAGE n =====` markers, and replace
  `thesis.txt`. Delete or rename `prop463.txt`. State the source edition. (S)

### DOC-4 [P2] README says the third-party licences "travel with" `dist/`; the build carries neither the KaTeX nor the math.js notice
- Category: stale-doc (licence compliance)
- Location: `README.md:983-986`; `apps/quadrature-domains/dist/assets/*.js`
- Claim: "Third-party libraries … KaTeX (MIT) and math.js (Apache-2.0). Both ship inside `dist/`, so their licenses
  travel with any copy you deploy." Minification strips both notices. Apache-2.0 §4(a) requires a copy of the licence
  with redistribution, and MIT requires the copyright notice. QD's own `LICENSE` is not in `dist/` either, since only
  `public/` is copied.
- Evidence (measured, on the `dist/` built 14:02 today): `grep -l -i 'khan academy\|Jos de Jong\|Apache'
  dist/assets/*.js dist/*.html dist/*.js` → no match. `grep -c 'Permission is hereby granted'` → 0. The only surviving
  headers are Fraction.js (`@license`) and decimal.js (`Copyright … Michael Mclaughlin`).
- Confidence: medium (grep-based; I did not audit every chunk by hand)
- Prior review: new
- Fix: emit a `THIRD-PARTY-LICENSES.txt` into `dist/`, for example with `rollup-plugin-license`, or copy the two
  licence files into `public/`. Then fix the README sentence. (S)

### DOC-5 [P3] Package metadata and repo artefacts left over from the standalone era
- Category: stale-doc / structure
- Location: `package.json:37-40`; `package-lock.json`; `LICENSE` + `app/LICENSE.txt`; `Andrew_Graven_Thesis.pdf`
- Claim:
  (a) `repository.url` still points at `ajgraven/Quadrature-Domains-Visualization-Tool`. QD is the only workspace
  package with a `repository` field, and the canonical home is `complex-analysis-suite` (per the launcher's canonical
  URL).
  (b) A tracked npm `package-lock.json` sits in a pnpm workspace. It names the package `quadrature-domain-solver`, has
  katex/mathjs as devDeps, and has no `@cas/*` and no vite, so `npm ci` in this directory would install a different
  tree.
  (c) The two licence files are byte-identical. `app/LICENSE.txt` sits inside the Vite root but outside `public/`, so
  it ships nowhere. The monorepo has no root `LICENSE` at all.
  (d) The thesis PDF, at 5.17 MB and 163 pages, is the largest tracked file in the repo and is not in LFS.
- Evidence (measured): the `grep '"url"\|"license"'` sweep over `apps/*/package.json`; `head package-lock.json`;
  `diff LICENSE app/LICENSE.txt` → same; `git ls-files | xargs stat | sort -n | tail`.
- Confidence: high
- Prior review: new
- Fix: point `repository` at the monorepo with `"directory": "apps/quadrature-domains"`. Delete `package-lock.json`
  and `app/LICENSE.txt`. Add a root `LICENSE`. Consider linking the CaltechTHESIS record instead of vendoring the
  PDF, or move it under `docs/references/`. (S)

### DOC-6 [P3] "h = 1/w, not the textbook 2/w": no standard convention gives 2/w
- Category: maths (doc)
- Location: `README.md:889-892`; `THEORY_MAP.md:307-310`; `HANDOFF.md:2262-2266`
- Claim: this is the unit-disk quadrature function under different normalisations. QD/thesis (dA/π, suppressed
  1/(2πi)): (1/2πi)∮ f·(1/w) dw = f(0) = ∫_𝔻 f dA/π, so h = 1/w ✓. Standard dA with the Green's form
  (1/2i)∮ f w̄ dw: h = 1/w again. Standard dA with a literal ∮ gives π f(0) = ∮ f h dw, so h = 1/(2i w). dA/π with a
  literal ∮ gives h = 1/(2πi w). Standard dA with suppressed 1/(2πi) gives h = π/w. None of these is 2/w. The
  convention *statement* is correct; the "contrast" example is wrong, and it is exactly the kind of sentence someone
  would use to "fix" a factor at the interchange edge.
- Evidence (inferred): the arithmetic above.
- Confidence: high
- Prior review: new
- Fix: replace the clause with "the quadrature *coefficient* of the unit disk is 1 here and π under dA = dx dy". (S)

### DOC-7 [P3] THEORY_MAP gives the Blaschke factor without the phase that code, thesis and HANDOFF use
- Category: maths (doc)
- Location: `THEORY_MAP.md:155` vs `app/solvers/solver-lqd-common.mjs:42,54-62` and `HANDOFF.md:2284-2286`
- Claim: THEORY_MAP says `blaschkeEval` is the "standard Blaschke factor `(z − z_0)/(1 − conj(z_0) z)`". The code
  multiplies by `−conj(z_0)/|z_0|`, giving the thesis form normalised so that b(0) = |z₀| > 0. That phase is
  load-bearing for the singular-LQD γ gauge.
- Evidence (measured): `solver-lqd-common.mjs:58` computes `phaseFactor = -conj(z0)/|z0|`.
- Confidence: high
- Prior review: new
- Fix: correct the row. (S)

### DOC-8 [P3] Two docs use "(★)" for different formulas, and the (★_S) header comment still states the formula the doc calls a bug
- Category: maths (doc) / stale-doc
- Location: `README.md:360`, `THEORY_MAP.md:53` vs `SCHWARZ_FORMULATION.md:30-33`, `THEORY_MAP.md:94`; `app/qd/qd-equations.mjs:333-336`
- Claim:
  (a) README's and THEORY_MAP's headline **(★)** is the *inverse* form `A_{j,k} = Σ_s (s/k) C_{j,s} [t^s] ψ̃_j^k`,
  which uses the compositional inverse. SCHWARZ_FORMULATION's "**Classical (★)**" is the *forward* form
  `C_{j,s} = Σ_k (k/s) A_{j,k} [t^k] φ̃_j^s`, and it says that form needs "no compositional inverse". I checked by
  Lagrange–Bürmann that the two are equivalent, so there is no maths error. But a reader of README → SCHWARZ_FORMULATION
  sees "(★) has no compositional inverse" next to a (★) that is built from one. The numeric solver uses the inverse
  form (`computeTargetA_QD`) and the symbolic generator uses the forward form. THEORY_MAP:94 says so, but README does
  not.
  (b) The header of `generateSchwarzBounded` (qd-equations.mjs:336) gives (★_S) with a `conj(c_{j,l})` numerator. The
  body (l.378-386) and SCHWARZ_FORMULATION both say that numerator "was a bug", and the code uses `A_{j,l}`. The header
  also cites `direct/direct-common.js`, which no longer exists.
- Evidence (measured): the quoted lines. The Lagrange check: [t^{−s}] ψ̃^{−k} = (k/s)[ζ^k] φ̃^s, and
  [ζ^{−k}] φ̃^{−s} = (s/k)[t^s] ψ̃^k. The simple-pole claim `C = A φ′(z_j) = |φ′|²(1−|z_j|²)²` re-derived ✓.
- Confidence: high
- Prior review: new
- Fix: label them (★_inv) and (★_fwd) consistently, and fix the header formula and path. (S)

### DOC-9 [P2] README omits whole shipped capabilities: weighted Direct problem, three interchange hand-offs, four of five `@cas` dependencies
- Category: stale-doc
- Location: `README.md:327-341` (family table), `:786-796` (Direct UI), `:836-852` (Direct API), `:13`, `:71`
- Claim:
  (a) The Direct tab has a Weight selector (QD / PQD / LQD × Bounded / Unbounded / Numerical × singular) and eight
  weighted kernels (`boundedPowerQD`, `boundedLogQD`, their singular variants, and the four unbounded ones,
  `direct-common.mjs:1273-2018`, per Thm 4.3.5 / 4.3.7). README's family table, UI section and API table list only
  classical direct modes. `app/direct/README.md:10-36` is correct, so the two contradict each other.
  (b) The Schwarz tab has three `@cas/interchange` exports: Riemann map φ → Complex Dynamics, σ → CD, and
  "Send to Hele-Shaw Flow". README never mentions them.
  (c) README says QD "consumes the shared `@cas/core` kernel". The code also imports `@cas/interchange` (the share
  link and the exports), `@cas/gpu/colormap` + `/shader`, and `@cas/faber`. (`package.json` itself matches CLAUDE.md:
  runtime `@cas/core`, `@cas/faber`, `@cas/gpu`, `@cas/interchange`; dev `@cas/exact`, `@cas/schwarz`, used by
  `vitest/*differential*` only ✓.)
- Evidence (measured): `direct-ui.mjs:292-302`; `schwarz-ui.mjs:489-491`; `grep "from '@cas/" app -r`.
- Confidence: high
- Prior review: new
- Fix: add the weighted Direct rows and API, a "Hand-offs to other apps" subsection, and the real dependency list. (S)

### DOC-10 [P3] In-app help understates what the UI does
- Category: stale-doc (user-facing)
- Location: `app/schwarz/schwarz-ui.mjs:302-303`; `:485-487`; `app/ui/ui-strings.mjs:466-471` (`hints.directProblem`, rendered at `index.html:730`)
- Claim:
  - The Source-φ help says "All six inverse families are supported (classical bounded / unbounded, and all four LQD
    variants)". `schwarz-common.mjs` has adapters for all ten, with the PQD four on CPU (`adaptPowerQD*`,
    `adaptUnboundedPQD*`, l.468-800), and README says ten.
  - The export blurb says "σ export covers the unbounded-Laurent families … other φ export as φ only", but
    `explainSigmaUnavailable` (schwarz-export.mjs:104-106) also exports bounded-classical σ (S5-C2).
  - The Direct hint lists only classical modes (see DOC-9a).
  Spot-checks that DO match the UI: Schwarz resolution 192–768, maxIter 1–200, the eleven colormaps, the five scale
  modes, pole order 1–6, and the GPU caps 12/8/12.
- Evidence (measured): the quoted source lines.
- Confidence: high
- Prior review: new
- Fix: update the three strings. (S)

### DOC-11 [P3] README body contains a dozen claims that no longer match the code
- Category: stale-doc
- Location: `README.md` as listed
- Claim (each measured):
  - `app/disabled/` (tree l.311, family table l.341, Known limitations l.939): the directory does not exist.
  - "emits app/dist/" (l.109): `vite.config.mjs:31` sets `outDir: resolve(here,"dist")`.
  - The file tree misses about 20 modules: `ui-copy-buttons`, `ui-qol-help`, `prewarm`, `solver-pqd-common`, eight
    `algebra-*` files, `schwarz-{analysis,export,export-plan,forward,inverse}`, and `workers/{protocol,worker-crash-detail}`.
  - "radio buttons for the ten inverse families" (l.457): it is a segmented Weight × Domain × singular control
    (`index.html:109-125`).
  - "escape time available in CPU mode only" (l.719): GPU does a per-cursor `escapeTime` (`schwarz-ui.mjs:35-36`).
  - "Three buttons:" (l.791) lists two, and the DOM has two (`direct-ui.mjs:986-987`).
  - "Direct-pole drag … planned UX follow-up" (l.958): node drag on the canvas is shipped (l.469 and the coachmark).
  - "Higher Laurent terms typically don't correspond to classical QDs" (l.401): every univalent Laurent-polynomial φ
    gives a UQD with polynomial h. The deltoid is the app's own oracle (`thesis-examples.mjs:101`), and σ∘φ =
    c/z + Σ conj(F_l) zˡ has no finite pole in 𝔻*. Confidence medium on how this interacts with the Direct kernel's
    `c·z+F₀` pole convention; the Direct slice owns the maths.
  - Param-slice "Capability refused (… polynomial-h LQDs which are deferred)" (l.770; also `app/param-slice/README.md:74`):
    `checkLqdPolynomialGap` no longer exists, and no solver error matches the `not yet implemented|deferred to` regex
    (`param-slice-common.mjs:276`). The class is effectively unreachable, and the example is shipped.
  - "All entry points are on `window.QD` (and `module.exports` for Node)" (l.808): this is the pre-ESM mechanism.
- Confidence: high (medium for the Laurent item)
- Prior review: new
- Fix: one pass over README. (S)

### DOC-12 [P3] TODO.md lists about 14 shipped features as open; PLAN-SPHERE says "ready for implementation"
- Category: stale-doc
- Location: `TODO.md:40,72,81,85,90,94,99,121,130,134,392,419-435`; `PLAN-SPHERE.md:3`
- Claim: these are open `[ ]` but shipped:
  - #21 URL state: `ui-url-state.mjs`, `#vs=`
  - #8 cusp detector: `analysis/cusps.mjs`
  - #11 symmetry detector: `analysis/symmetry.mjs`
  - #13 z↔w view: the z-disk view
  - #16 preimage tree: `schwarz-paint.mjs:211`
  - #18 σ domain colouring
  - #22 PNG export
  - #23 high-res Schwarz export (#338)
  - #15 critical orbits
  - #20 orbit-family sweep
  - #A6 level curves
  - #A11 forward image (`schwarz-forward.mjs`)
  - #A12 limit set
  - #A13 box counting (`boxCountingDimension`)
  - #A14 cycle finder (`findCycles`)
  The sphere has long shipped and was later folded into the Schwarz tab.
- Evidence (measured): `grep -rli` for each feature. The `schwarz-features.mjs:13` header lists "σ level curves,
  critical orbits, the cycle finder, the orbit-family sweep".
- Confidence: high (medium for #13 and #15)
- Prior review: new
- Fix: tick them, or retire TODO.md into the single tracker proposed in IMP-1. (S)

### DOC-13 [P3] HELPTEXT.md gives five pre-folderisation paths and is a developer doc with a user-help name
- Category: stale-doc / structure
- Location: `HELPTEXT.md:5,50-54`
- Claim: `app/ui-strings.mjs`, `app/ui-modes.mjs`, `app/ui-solve.mjs`, `app/thesis-examples.mjs` and `app/qol.mjs` are
  now `app/ui/…`, `app/analysis/…` and `app/core/qol.mjs`. It also says one `data-str*` hook survives in the Algebra
  markup; there are three (`algebra.help`, `hints.algebraCard`, `tooltips.eliminateVars`). The file documents where
  to edit strings, not what the UI does.
- Evidence (measured): the path probe; `grep -o 'data-str[a-z-]*=' algebra/algebra-ui.mjs`.
- Confidence: high
- Prior review: new
- Fix: fix the paths and fold it into CONTRIBUTING as "Editing UI text". (S)

### DOC-14 [P3] CONTRIBUTING: wrong residual contract, deleted test files, a broken anchor, a contradicted runtime
- Category: stale-doc
- Location: `CONTRIBUTING.md:31,43,157,164-165,137-146`
- Claim:
  - "`residual` → Length-(n+d) real residual vector; concatenates the (★) and (●) blocks". `residual_QD`
    (solver-qd.mjs:103-128) returns 2(n+d) reals, plus 1 for the gauge, with (●) *first*.
  - `solvers.test.js` is split into 4 shards, and `schwarz-ui.test.js` moved to Vitest.
  - The link `ARCHITECTURE.md#script-load-order` has no target heading.
  - "Fast (well under 30 s for the full battery)" is contradicted by `vitest.config.ts`'s "~7 min cold on CI".
  - The HANDOFF cadence says each entry carries "New test count (566 → 571 total)", which CLAUDE.md's no-pinned-counts
    policy contradicts.
- Evidence (measured): code excerpt; `grep '^#' ARCHITECTURE.md`.
- Confidence: high
- Prior review: new
- Fix: one pass. (S)

### DOC-15 [P3] THEORY_MAP line references: 19 of 29 have drifted, two point past end of file; one test pointer is gone
- Category: stale-doc
- Location: `THEORY_MAP.md:29-30,64-70,155-160,192-195,289,293,173-174`
- Claim:
  - `solver-lqd-singular.mjs:549` and `:629` cite a 464-line file.
  - `solveInverseQD` is cited at `solver.mjs:790` and is at 1463.
  - `houseQR` is cited at :195 and is at 234.
  - "Tests … in `app/node-test.js` (search for `Thm 5.3.2`)" now live in `app/test/solvers-1.test.js`.
  The file disclaims its line numbers ("the symbol name is the source of truth"), and every *symbol* I checked exists,
  so this is P3.
- Evidence (measured): `scratchpad/docs/tmcheck.py` plus per-symbol greps.
- Confidence: high
- Prior review: new
- Fix: drop the line numbers and keep file + symbol. Add the IMP-2 check. (S)

### DOC-16 [P3] In-code headers: 68 of 126 `.mjs` files still name themselves `.js`; the test-config comments count 26 files and a child process that no longer exist
- Category: stale-doc
- Location: e.g. `app/ui/ui-url-state.mjs:2-8` ("ui-url-state.js … don't cross <script> tags"); `vitest.config.ts:4-9,23` ("26 CommonJS files", "The child runs the entire real suite"); `vitest/node/_run.ts:4`
- Claim: the prior review's "twin of X.js" headers are fixed (2 benign hits remain). But 68 module headers still carry
  their pre-ESM self-name, and the Vitest config describes the retired single-child wrapper and a 26-file suite (now
  30 files, 29 wired: DOC-1).
- Evidence (measured): a loop over `find app -name '*.mjs'` checking `head -5` for `<basename>.js`.
- Confidence: high
- Prior review: partly new (the "81 twin headers" item in `2026-08-suite-review/findings/07-quadrature-domains.md` is fixed)
- Fix: a mechanical sed on the self-names, and a rewrite of the two config comments. (S)

### DOC-17 [P3] Stale dev-server configuration
- Category: stale-doc
- Location: `apps/quadrature-domains/.claude/launch.json`; `.claude/launch.json` (`qd-esm`); `CLAUDE.md` ("Dev servers go through `.claude/launch.json` … `qd-esm` 5199")
- Claim: the nested `qd-app` config serves `app/` with `python -m http.server 8765`. That cannot load the ESM app,
  because `core/vendor-globals.mjs:13-14` does `import katex from 'katex'` plus a CSS import, and `core/complex.mjs`
  re-exports `@cas/core`; all need Vite. The root `qd-esm` entry is `vite preview`, which serves whatever `dist/`
  last built, not a dev server. The CLAUDE.md claim of `qd-esm` 5199 itself is verified ✓.
- Evidence (measured): file contents.
- Confidence: high
- Prior review: new
- Fix: delete the nested launch.json. Either make `qd-esm` run `vite` (dev) or note that it needs a fresh build. (S)

### DOC-18 [P2] HANDOFF.md (5,908 lines) is self-declared historical but still carries "current" sections that contradict README, and four trackers overlap
- Category: structure
- Location: `HANDOFF.md:17-60` (§0), `:1971` (§2 "File layout (current)"), `:5876-5898` (§12 status), `:5559` (§10); `TODO.md`; `README.md:933-966`
- Claim:
  - Growth: 4,100+ lines at the 2026-08 suite review, 5,908 now (+44% in a month).
  - §0, under a "superseded" banner, still says the Algebra workspace is "NOT yet merged".
  - §2 "File layout (current)" lists deleted flat `.js` files.
  - §12 says "503 tests", "AQD parked in `app/disabled/aqd/`" (gone), and "README … the Riemann-sphere and
    critical-set features are not yet mentioned" (they are).
  - It has two numbering schemes: "(most recent)" headings in §0 and entries 1–66 in §7. New entries are inserted
    mid-file (#337's text is in §7 at l.2362).
  - It is also load-bearing: 117 code comments cite "HANDOFF #N", and README/TODO/THEORY_MAP cite 30+ entries.
  - Open work is tracked in four places that disagree: TODO.md (DOC-12), HANDOFF §10, HANDOFF §0, and README "Known
    limitations" (DOC-11).
  - README, ARCHITECTURE and CONTRIBUTING describe the test harness three times, and ARCHITECTURE's historical banner
    admits its mechanism sections are pre-ESM, for example "URL/hash state" (l.217) without the `#vs=`
    `@cas/interchange` envelope.
- Evidence (measured): `wc -l`; the section greps quoted; `grep -rc HANDOFF --include=*.mjs app` → 117.
- Confidence: high
- Prior review: noted as "grep-sampled, not audited" in `2026-08-suite-review/findings/09-documentation-staleness.md`, still open
- Fix: see IMP-1. (M)

### DOC-19 [P3] Suite-level docs: small contradictions about QD
- Category: stale-doc
- Location: `docs/MIGRATION.md:24,311-322`; `docs/DECISIONS.md` ADR-0026 context; `docs/INTERCHANGE.md:265-266`; root `README.md:120-128`; `apps/launcher/index.html:117-119`; `package.json:4`
- Claim:
  - MIGRATION's status table says Phase 5 "both apps adopt" `@cas/expr` + `@cas/gpu`. QD imports no `@cas/expr`, and
    the Phase 5 gate "QD renders its Schwarz dynamics with df64 deep zoom" is unmet (it is listed as deferred in the
    same banner).
  - ADR-0026's context says QD's σ engine has the weighted *LQD* adapters that the package lacks. It omits the four
    PQD adapters, and says QD "does not depend on `@cas/schwarz` (not in its package.json)". It is now a devDependency
    (AI-2 records this; the context is not annotated).
  - INTERCHANGE names both QD producers "Schwarz tab → *Export map*". The Hele-Shaw control is "Send to Hele-Shaw
    Flow → copy link".
  - The root README lists `@cas/exact` as "(CD + Correspondences)" without QD's dev use, and `@cas/gpu` without QD.
  - The launcher card and `package.json` description say "(log-)weighted" and omit power-weighted PQDs and the Algebra
    workspace.
  - CLAUDE.md's QD-specific claims are all verified ✓: 29 node specs, 33 jsdom specs (`_algebra-mount.ts` docblock at
    l.10), the browser config probing `/opt/pw-browsers/chromium` only, `qd-esm` 5199, not a `@cas/ui` consumer,
    `@cas/schwarz` dev-only.
- Evidence (measured): greps as quoted.
- Confidence: high
- Prior review: new
- Fix: one-line edits each. (S)

### DOC-20 [P2] Interchange: "h's residue is convention-neutral" is true only under a definition of `hData` that no doc states
- Category: convention (doc)
- Location: `docs/INTERCHANGE.md:88-95,139-142`; `packages/interchange/src/schema.ts:168`; `app/schwarz/schwarz-export.mjs:312-314`
- Claim: the wire is tagged `CANONICAL = {area:"standard", contour:"standard"}`, and `hData` is "the quadrature
  function h … convention-neutral (no π/2πi conversion)". That holds if h means **the principal part of the Schwarz
  function S (S = w̄ on ∂Ω)**, which involves no measure. If h instead means the kernel of the quadrature identity *in
  the tagged convention* (∫ f dx dy = ∮ f h dw), then h_canonical = h_QD·π/(2πi) = h_QD/(2i). QD's two normalisations
  are exactly what make those two definitions coincide in QD. Neither INTERCHANGE.md nor `schema.ts` says which one
  `hData` means, so a future consumer that reads the tag literally would introduce the silent 1/(2i) that ADR-0006
  exists to prevent. The shipped code (QD → Hele-Shaw, same author's conventions) is not shown to be wrong. This is a
  doc hole in the one guard.
- Evidence (inferred): QD: ∫f dA/π = (1/2πi)∮ f h dw ⇒ ∫f dx dy = (1/2i)∮ f h dw. Canonical literal:
  ∫f dx dy = ∮ f h′ dw ⇒ h′ = h/(2i).
- Confidence: medium (cross-slice; the interchange slice owns the code)
- Prior review: new
- Fix: define `hData` in both places as "the principal parts of the Schwarz function S, S|∂Ω = w̄
  (convention-free)". State that the quadrature *coefficients* are what scale by π. Add that sentence to QD's
  README "Conventions". (S)

## Improvements

- **IMP-1: A consolidated doc structure** (value: high for newcomers and for future review agents; cost M).
  - `README.md`: what it is, running it, features by tab, hand-offs, conventions, limitations. Current state only.
  - `ARCHITECTURE.md`: the current ESM mechanism only. Delete the historical banner and the pre-ESM sections.
  - `THEORY_MAP.md`: file + symbol, no line numbers.
  - `CHANGELOG.md`: HANDOFF §7 entries 1–66 verbatim, keeping the `#N` anchors so the 117 code citations still resolve.
  - `docs/history/`: HANDOFF §0–§6 and §8–§12, ESM-MIGRATION, PLAN-SPHERE, GROEBNER_INVESTIGATION.
  - One open-work tracker: TODO.md, re-audited, absorbing HANDOFF §10 and README "Known limitations".
  - HELPTEXT → a CONTRIBUTING section.
- **IMP-2: A doc-reference lint in `pnpm -C apps/quadrature-domains lint`** (value: medium; cost S). Check that every
  backticked path in the QD docs exists, that every THEORY_MAP symbol is defined, that `TESTS` equals
  `vitest/node/*`, and that the module-header self-names match. The probes in `scratchpad/docs/` are a starting point.
  This would have caught DOC-1, DOC-11, DOC-13, DOC-15 and DOC-16.
- **IMP-3: A maths-preserving thesis text with page markers** (value: high for researchers checking code against
  theorems; cost S). This is the DOC-3 fix. Also add a "thesis § → app control" index to THEORY_MAP (for example,
  Thm 4.3.7 → Direct ▸ PQD ▸ Unbounded) so a researcher can go from a theorem to the button that exercises it.
- **IMP-4: A README "Conventions" section that states the interchange-facing definitions** (value: medium, as ADR-0006
  hardening; cost S): h = principal part of S; coefficients scale by π; the corrected unit-disk example (DOC-6/DOC-20).

## Coverage

- I read HANDOFF.md by structure and sampled sections (§0, §2, §6, §7 head, §10 heading, §12), not line by line.
  ESM-MIGRATION, GROEBNER_INVESTIGATION and PLAN-SPHERE were checked for status claims only.
- I did not verify every ADR sentence mentioning QD, only 0003/0006/0008/0018/0024/0026/0032. VISION and RISKS carry
  "as built" banners and were only grepped for QD file names.
- I did not run any Vitest spec or the legacy suite (only the clean-realm child). The in-app help spot-check covered
  the Schwarz and Direct hints plus a handful of controls, not every `QD.Strings` entry, and not the Algebra
  `algebraOps` records.
- I could not verify the provenance of `prop463.txt`, `thesis.txt` or the PDF, because the clone's history is grafted
  at `c19ec92`. I also could not check whether the old `Quadrature-Domains-Visualization-Tool` repository still exists
  (no network check made).
- The PQD weight normalisation (thesis 4.2.1) and the direct unbounded `c·z+F₀` pole convention could not be checked
  against the thesis text because of DOC-3. They are left to the maths and Direct slices.
