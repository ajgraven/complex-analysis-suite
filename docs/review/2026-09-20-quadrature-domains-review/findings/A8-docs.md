# A8 — Quadrature Domains documentation (whole-document view, cross-document consistency)

## Scope covered

**Read in full:** all 12 app-local `.md` (`README` 986, `ARCHITECTURE` 475, `CONTRIBUTING` 298,
`THEORY_MAP` 313, `TODO` 461, `HELPTEXT` 57, `ESM-MIGRATION` 197, `PLAN-SPHERE` 387,
`GROEBNER_INVESTIGATION` 188, `AHARONOV_SHAPIRO` 170, `SCHWARZ_FORMULATION` 107, `HANDOFF` 5,908 —
skimmed structurally + its §0/§7/§10/§11/§12 read), the 4 per-module READMEs, `package.json`,
`vite.config.mjs`, `vitest.browser.config.ts`, `perf/`, `prop463.txt`, `thesis.txt` (structure +
targeted passages). **Repo level:** root `README.md`, `CLAUDE.md` (every QD statement),
`docs/{ARCHITECTURE,MIGRATION,DECISIONS,INTERCHANGE,RISKS}.md`, `docs/refactor/{STATE,ISSUES,
PHASE-F,COMPLETION-PLAN,ASSESSMENT,LOG}.md` (heads + QD registers), `docs/perf/qd-live-solver-review.md`,
`docs/review/2026-08-suite-review/{findings/07,PROGRESS}.md`,
`docs/review/2026-08-23-comprehensive-review/{findings/A2,A3,A7,PROGRESS}.md`,
`.claude/launch.json`, both workflows.

**Sweeps run (scripted, not sampled)** — scripts in `scratchpad/scratch/A8/`:
`sweep2.py` (1,052 backticked path tokens → existence), `tmap.py` (every `file:line` in THEORY_MAP →
symbol at that line), `syms.py` (164 backticked call-identifiers in the live docs → source),
plus an anchor checker and a README-file-tree ⇄ `find app -name '*.mjs'` diff.

**Not covered (honest):** `docs/algebra-review/**` (5,287 lines) read only at the head/status level —
it is a self-contained 2026-07 engagement archive and belongs to the algebra agent's scope;
`HANDOFF.md`'s 78 numbered entries were not individually verified (spot-checked #21–#30, #59–#66);
`docs/ALGEBRA_*.md` / `*_FACTORING.md` checked for existence + QD-claim spot checks only.

## Health

| Command | Result |
|---|---|
| `node app/node-test.js` | **2342 passed / 0 failed**, 30/30 registered files, exit 0 |
| `{ time node app/node-test.js; }` | **real 1m31.077s** (user 1m07.5s) |
| `grep -rl "@vitest-environment jsdom" vitest/ \| wc -l` | **34** (all line-1 except the non-spec helper `_algebra-mount.ts`) |
| `git status --short` | empty (no repo file added, edited or deleted) |

## Findings

### DOC-1 [HIGH] [confirmed] `thesis.txt` — named as "the specification for the mathematics" — has had every mathematical symbol stripped by its extraction
- **Where:** `apps/quadrature-domains/thesis.txt` (9,360 lines, 460,147 bytes, ISO-8859-1);
  referenced by `apps/quadrature-domains/HANDOFF.md` only, and by the reviewer brief.
  Counter-example file: `apps/quadrature-domains/prop463.txt` (325 lines, UTF-8).
- **What:** The extraction dropped **every** Greek letter, **every** mathematical alphanumeric and
  **every** sub/superscript. Theorem 3.2.2 — the identity the whole inverse solver implements, which
  `THEORY_MAP.md:18` states as `φ(z) = w₀ + Φ_φ⁻¹(h)^#(z)` — appears in `thesis.txt:1745` as
  `= (0) + -1()#.` Equation 4.19 (`thesis.txt:3746`) reads
  `() = 1 + |0|2 - 1 ( - 1)`: `|z₀|²` has become `|0|2`, which reads as a *number*. A reviewer or
  agent told "the thesis is the specification" cannot check a single equation against it.
- **Evidence:**
  ```
  $ python3 -c "...count [Ͱ-Ͽ], [\U0001D400-\U0001D7FF], [₀-₉⁰-ⁿ]..."
  thesis.txt  chars=460147 greek=0   math-alnum=0   sub/sup=0
  prop463.txt chars=7122   greek=39  math-alnum=478 sub/sup=0
  $ file thesis.txt prop463.txt
  thesis.txt:  ISO-8859 text
  prop463.txt: data          # i.e. UTF-8 with mathematical alphanumerics
  ```
  Negative control: `prop463.txt` is page 72 of the *same* PDF re-extracted with a tool that
  preserves them — `𝜑(𝑧)=𝑐𝑧 …` survives there. `thesis.txt` *does* contain the same passage's
  prose (`grep -c "Proof of Theorem 4.4.2" thesis.txt` → 1) with the symbols gone, which is almost
  certainly why `prop463.txt` was created and then never referenced (DOC-13).
- **Why it matters:** The evidence standard for the whole review ("where the code and the thesis
  disagree, say which equation") rests on a file that cannot express an equation. It is usable only
  for locating theorem numbers and prose. Silently, it invites a reader to conclude an equation says
  something it does not — `|0|2` vs `|z₀|²` is exactly the class of error the honest-labelling
  guardrail exists to stop.
- **Fix:** Re-extract with a UTF-8/math-aware tool (`pdftotext -enc UTF-8 -raw`, or whatever produced
  `prop463.txt`), or — if re-extraction is not practical — put a banner at the top of `thesis.txt`
  stating that symbols are lost and the PDF is authoritative for any equation, and name `thesis.txt`
  in README/THEORY_MAP with that caveat (today it is named in neither). A one-line CI check
  (`grep -qP '[\x{0370}-\x{03FF}]' thesis.txt`) would pin a good extraction.
- **Prior:** new.

### DOC-2 [HIGH] [confirmed] `app/disabled/` does not exist at HEAD, but README points readers at it three times — including a "re-enable checklist"
- **Where:** `apps/quadrature-domains/README.md:311-313` (file-layout tree), `:341` (Supported-families
  table row), `:938-940` (Known limitations); `HANDOFF.md:482, 2065-2067, 3947, 5171-5172, 5817-5819,
  5880, 5903` (nine references, including §11 "Quick code-location index" and §12 "Status").
- **What:** README's tree draws `disabled/ ├── README.md (How to re-enable) └── aqd/ (Algebraic QD
  scaffolding, deferred)`; the family table's last row is `Algebraic QD … deferred (app/disabled/)`;
  and Known limitations says "Stage-0 through Stage-2 scaffolding lives in `app/disabled/aqd/` with a
  re-enable checklist." None of it is in the repo.
- **Evidence:**
  ```
  $ ls apps/quadrature-domains/app/disabled/
  ls: cannot access '...': No such file or directory
  $ git ls-files | grep -i disabled      # (empty)
  $ git log --oneline --all -- "apps/quadrature-domains/app/disabled"   # (empty)
  ```
  The clone is shallow (`.git/shallow` present; 7 QD commits reachable), so I **cannot** say whether
  it was ever committed here — only that it is absent from the tree *and* the index at HEAD, so every
  one of those twelve references resolves to nothing for a reader.
- **Why it matters:** Chapter VI (Algebraic QDs) is the thesis's own open direction, README lists it
  as a supported-families row, and the documented recovery path (`app/disabled/README.md`) is the only
  stated instruction for resuming it. Either work is missing, or the docs claim work that never came
  across the subtree import — and the guardrail is "preserve provenance … bring apps in with git
  history".
- **Fix:** Determine from the pre-monorepo repo whether `app/disabled/aqd/` exists. If it does,
  re-import it (or record deliberately that it was dropped and where it lives). If it does not, delete
  all twelve references and change the family table's AQD row to `deferred (not started)`. Either way
  a one-line note in README's Known limitations should say which.
- **Prior:** new.

### DOC-3 [MEDIUM] [confirmed] The app's entire cross-app hand-off surface — three user-visible buttons, including the Hele-Shaw producer — is documented in no app-local doc
- **Where:** `app/schwarz/schwarz-export.mjs` (17 exports), wired at `app/schwarz/schwarz-ui.mjs:492,
  500, 516-613`. Absent from `README.md`, `ARCHITECTURE.md`, `THEORY_MAP.md`, `HANDOFF.md`, and
  `app/schwarz/README.md`.
- **What:** The Schwarz tab carries **three** export buttons — φ → Complex Dynamics, σ → Complex
  Dynamics (`form:"schwarz"`, ADR-0009, interchange 1.3.0), and `#schwarz-send-heleshaw`
  *"Send to Hele-Shaw Flow → copy link"* (commit `31fa74e`, retargeted by ADR-0036 `5b69c2a`). The
  app-local docs mention none of them. `grep -in "interchange|hand-off|handoff|complex dynamics"
  README.md ARCHITECTURE.md` returns only the unrelated `HANDOFF #NN` entry tags. `grep -i hele`
  across every app-local doc returns one hit — an unrelated sentence about Polubarinova–Galin blow-up
  in `README.md:956`.
- **Evidence:** `app/schwarz/schwarz-ui.mjs:492`
  `<button … id="schwarz-send-heleshaw" …>Send to Hele-Shaw Flow → copy link</button>`;
  `schwarz-export.mjs:342,361,372,384` `buildHeleShawEnvelope / exportHeleShawLink /
  exportHeleShawDeepLink / explainHeleShawUnavailable`. It *is* documented at repo level
  (`CLAUDE.md`, `docs/INTERCHANGE.md:265-266`, `docs/design/SIGMA-HANDOFF.md`,
  `docs/design/hele-shaw-flow-plan.md`, ADR-0036) — all of which are accurate.
- **Why it matters:** Someone reading the app's own docs to answer "what does QD produce for other
  tools?" gets nothing. `app/schwarz/README.md`'s own file table omits `schwarz-export.mjs` and
  `schwarz-export-plan.mjs` entirely (DOC-10), so the modules are invisible too. This is the single
  largest capability absent from the app's docs.
- **Fix:** One "Cross-app hand-offs" section in `README.md` (three bullets: what each button emits,
  which app consumes it, the golden that pins it) linking `docs/INTERCHANGE.md` and
  `docs/design/SIGMA-HANDOFF.md`, plus the three missing rows in `app/schwarz/README.md`'s file table.
  Do **not** duplicate the wire-format detail — link it.
- **Prior:** new (the Hele-Shaw producer post-dates both prior reviews).

### DOC-4 [MEDIUM] [confirmed] README's Direct-tab coverage is classical-only; eight shipped weighted forward kernels and the QD/PQD/LQD selector are absent
- **Where:** `README.md:338-341` (Supported-families table, four `QD (direct)` rows, weight column all
  `1`), `README.md:789-793` ("Domain type — Bounded / Unbounded / Numerical"), `README.md:836-850`
  (`QD.Direct` API table, 12 entries). Reality: `app/direct/direct-common.mjs:2190-2214` exports 26
  symbols; `app/direct/direct-ui.mjs:292-294` builds a `#dir-dm-weight` segmented control **QD / PQD / LQD**.
- **What:** The Direct tab ships eight weighted forward kernels — `boundedPowerQD`, `boundedLogQD`,
  `boundedPowerQDSingular`, `boundedLogQDSingular`, `unboundedPowerQD`, `unboundedPowerQDSingular`,
  `unboundedLogQD`, `unboundedLogQDSingular` (Thm 4.3.5 / 4.3.7) — none named in the top-level README,
  whose UI section still describes a three-way Bounded/Unbounded/Numerical control that has since
  grown a weight axis and a singular toggle.
- **Evidence:** `grep -n "^\s*Direct\.[A-Za-z0-9_]* *=" app/direct/direct-common.mjs` → 26 symbols;
  README's table has 12. `app/direct/README.md` is **fully correct and complete** on all of it
  (its "Public surface" table has 20 rows including all eight, and a "Weighted families (PQD / LQD)"
  section) — so this is top-level staleness, not a missing investigation.
- **Why it matters:** README is the document with 34 referrers and the one a new reader opens; it
  under-states the app's direct-problem capability by half, and its family table — the app's headline
  "what is supported" artefact — is wrong.
- **Fix:** Add the eight rows to the Supported-families table, replace the `QD.Direct` API table with a
  pointer to `app/direct/README.md`'s (keeping only the four classical entries inline), and update the
  Direct-mode UI bullet to name the weight × domain × singular control.
- **Prior:** new.

### DOC-5 [MEDIUM] [confirmed] Every one of THEORY_MAP's 30 `file:line` references is stale; three point past end-of-file
- **Where:** `apps/quadrature-domains/THEORY_MAP.md` — 30 references. The doc itself says at `:9`
  *"Line numbers are accurate as of the P3 docs pass."*
- **What:** 30 checked, **30 wrong**. Most drift 2–3 lines (still findable by the symbol, as the doc's
  own escape clause says), but seven are badly wrong and three are unreachable:

  | THEORY_MAP | claims | actual | drift |
  |---|---|---|---|
  | `:70` | `solver-qd.mjs:427` (`registerFamily('boundedQD')`) | file is **397 lines** | past EOF |
  | `:194` | `solver-lqd-singular.mjs:549` (`verifyQuadratureIdentity_LQDS`) | file is **464 lines** | past EOF |
  | `:195` | `solver-lqd-singular.mjs:629` (`registerFamily`) | file is **464 lines** | past EOF |
  | `:293` | `solver.mjs:790` (`solveInverseQD`) | `solver.mjs:1463` | **+673** |
  | `:193` | `solver-lqd-singular.mjs:463` (`diverseInitialGuess_LQDS`) | `:309` | −154 |
  | `:69` | `solver-qd.mjs:322` (`verifyQuadratureIdentity_QD`) | `:272` | −50 |
  | `:68` | `solver-qd.mjs:244` (`continuationSolve_QD`) | `:194` | −50 |
  | `:289` | `solver.mjs:195` (`houseQR`) | `solver.mjs:234` | −39 |
- **Evidence:** `scratchpad/scratch/A8/tmap.py` — parses each row, opens the file, checks the named
  symbol against that exact line, and if absent locates the real definition. Output: `rows 30 / bad 30`.
  Cross-checked by hand: `grep -n "function houseQR\|function solveInverseQD" app/solvers/solver.mjs`
  → `234` and `1463`.
- **Why it matters:** THEORY_MAP is the bridge the review brief names as the mathematics' index. A line
  past EOF is not "findable by symbol" — it is a broken promise about where a theorem is implemented,
  and `solveInverseQD` off by 673 lines sends a reader into the middle of an unrelated function.
- **Fix:** Either regenerate the numbers (a 20-line script over the symbol names would do it and could
  run in CI), or — better, and consistent with the doc's own "the symbol name is the source of truth" —
  **drop the line numbers entirely** and keep `file.mjs` + symbol. A stale number is worse than none.
- **Prior:** new (the prior reviews checked THEORY_MAP's *content*, not its line refs).

### DOC-6 [MEDIUM] [confirmed] `ARCHITECTURE.md`'s family-registry row lists 6 of the 10 registered families — the four PQD families are missing
- **Where:** `apps/quadrature-domains/ARCHITECTURE.md:162` ("Family registry | `QD.Family.boundedQD`,
  `unboundedQD`, `boundedLQD`, `boundedLQD_singular`, `unboundedLQD`, `unboundedLQD_singular`").
- **What:** `grep -rn "registerFamily(" app/solvers/*.mjs` registers **ten**: the six above plus
  `powerQD`, `powerQD_singular`, `unboundedPQD`, `unboundedPQD_singular`. README's family table lists
  all ten, CONTRIBUTING says "all 10 families", and `HANDOFF.md:2108` is headed "§3. The ten inverse
  families" — ARCHITECTURE is the one place that contradicts them.
- **Evidence:** `registerFamily` call sites: `solver-qd/-uqd/-lqd/-lqd-singular/-uqd-lqd/
  -uqd-lqd-singular/-pqd/-pqd-singular/-uqd-pqd/-uqd-pqd-singular.mjs`. The same section's Mermaid
  "Solver core" subgraph also omits `solver-pqd*.mjs` / `solver-uqd-pqd*.mjs`, but that diagram is
  explicitly labelled "illustrative, not exhaustive"; the registry table is not.
- **Why it matters:** ARCHITECTURE is the second-most-referenced app doc (29 referrers) and the one
  CONTRIBUTING sends you to before adding a family. The list being a strict subset makes PQD look
  unregistered — the exact question a contributor uses that table to answer.
- **Fix:** Add the four names.
- **Prior:** new.

### DOC-7 [MEDIUM] [confirmed] `TODO.md` — at least five unchecked items are shipped, one of them the app's own share-link
- **Where:** `apps/quadrature-domains/TODO.md`.

  | Item | Marked | Reality at HEAD |
  |---|---|---|
  | `#21` URL state encoding (`:37`) | `[ ]` High priority | **Shipped.** `app/ui/ui-url-state.mjs` (`writeUrlState`/`applyUrlState` over `@cas/interchange` `#vs=`); README:875 documents the 🔗 Copy link button; `vitest/qd-url-state.test.ts` pins it |
  | `#23` High-res Schwarz render (`:100`) | `[ ]` Medium | **Shipped.** `app/schwarz/schwarz-export.mjs` + `schwarz-export-plan.mjs`, 1×/2×/4×/8× with a real re-render (`README:705-714`, HANDOFF entry 66, PR #338) |
  | `#16` Preimage / tile-tree mode (`:85`) | `[ ]` Medium | **Shipped.** `paintPreimageTree` in `schwarz-paint.mjs`; `schwarz-features.mjs:12` "preimage-tree rebuild + stats" |
  | `#18` Domain coloring of σ (`:91`) | `[ ]` Medium | **Shipped.** `_recomputeDomainColoring` in `schwarz-features.mjs`, wired through `schwarz-interaction.mjs` |
  | `#9` Curvature plot along ∂Ω (`:118`) | `[ ]` Low | **Half shipped.** The curvature heat-strip on ∂Ω ships (`ui-domain-plot.mjs:422`, README:499); the κ(θ) side panel does not |
  | `#13` Side-by-side z↔w (`:76`) | `[ ]` Medium | **Half shipped.** z-disk is a *view mode* and there is a z-panel orbit (`schwarz-ui.mjs:167`), but not twin synced panels |
  | `#8` Cusp / corner detector (`:71`) | `[ ]` Medium | **Effectively shipped.** `app/analysis/cusps.mjs` + on-canvas markers (`ui-domain-plot.mjs:432`); self-intersection via `isBoundaryUnivalent` |

  Still genuinely open and correctly unchecked: `#2` (bifurcation diagram — no implementation),
  `#3`, `#7`, `#10`, `#12`, `#15`, `#20`, `#24`, `#27`, `#33`, `#35`, and the two deferred
  mathematical items (`UQDPS-origin-pole`, `PQD-branch-tracking`), both of which I confirmed are still
  refused in code rather than silently wrong.
- **Evidence:** module existence + the README sections that describe each as shipped; commands above.
- **Why it matters:** TODO.md is the app's only forward-looking list. Five of its ~14 open items being
  done makes the remaining backlog unreadable — and `#21`, sitting at the top under **High priority**,
  is the feature the README's own "🔗 Copy link" paragraph describes at length.
- **Fix:** Tick the five, mark `#9`/`#13` partial with what remains, and note that every checked
  item's `Implementation:` path still names pre-ESM `.js` files (16 dead paths; DOC-11).
- **Prior:** new.

### DOC-8 [MEDIUM] [confirmed] `PLAN-SPHERE.md` (387 lines) still reads **"Status: ready for implementation"** for work that shipped and was then architecturally superseded
- **Where:** `apps/quadrature-domains/PLAN-SPHERE.md:3`.
- **What:** The plan's scope line is *"new dedicated tab"*. The sphere shipped (TODO `#14` is `[x] ✅
  shipped`), and **then** HANDOFF #29 folded it into the Schwarz tab's `plane | z-disk | sphere` view
  toggle and *removed the standalone Riemann-sphere tab button from `index.html`* — so the document's
  central architectural decision is not merely done, it is reversed. 23 of its path references are
  pre-ESM `.js` names.
- **Evidence:** `TODO.md:26` (`#14 … ✅ shipped`); `TODO.md:288-299` ("Sphere-tab-merge … the
  standalone Riemann-sphere tab button + panel removed from `index.html`"); README:738-760 documents
  the three-way toggle. `ESM-MIGRATION.md` shows the house style for exactly this situation — a
  four-paragraph "✅ DONE / historical-record boundary" banner — and `PLAN-SPHERE.md` has none.
- **Why it matters:** It is the only app-local doc whose stated status is affirmatively false. A reader
  who opens it (it has 1 referrer, so they arrived by directory listing) is told to build a tab that
  was deliberately removed.
- **Fix:** Add ESM-MIGRATION's banner shape, or move it under a `historical/` heading (see the archive
  table below).
- **Prior:** new.

### DOC-9 [LOW] [confirmed] `CONTRIBUTING.md`'s test-harness section names a file that was split four ways, and its timing claim is 3× off
- **Where:** `apps/quadrature-domains/CONTRIBUTING.md:157` and `:164-165`.
- **What:** (a) `:157` lists the suite as `solvers.test.js, direct.test.js, …` — `solvers.test.js` was
  sharded into `solvers-1..4.test.js` (refactor stage B2, QD-TEST-5), and `node-test.js`'s `TESTS`
  array lists 30 files, not the 9 named. (b) `:164` points readers at `schwarz-ui.test.js` for the
  deferred-click example two sentences after saying that file moved to Vitest — it is now
  `vitest/schwarz-ui.test.ts`. (c) `:165` "Fast (well under 30 s for the full battery + parse-checks)".
- **Evidence:** measured — `{ time node app/node-test.js; }` → **real 1m31.077s** for 2342 assertions
  across 30 files. `ls app/test/` shows `solvers-1..4.test.js` and no `solvers.test.js`.
  `app/node-test.js:22-51` is the authoritative `TESTS` array.
- **Why it matters:** "well under 30 s" sets the expectation that the suite is cheap enough to run in a
  tight loop; at 91 s a contributor who believes it will conclude something has hung. The file name is
  the one a contributor greps for when adding a solver test.
- **Fix:** Point at `node-test.js`'s `TESTS` array instead of duplicating the list (the array is
  already the source of truth and the runner asserts against it); replace the timing with "~90 s" or,
  better, with nothing — the doc already says counts drift.
- **Prior:** new. (The prior finding QD-SOLV-2, a different CONTRIBUTING:84 defect, **is** fixed.)

### DOC-10 [LOW] [confirmed] README's file-layout tree and `app/schwarz/README.md`'s file table each omit real modules
- **Where:** `README.md:242-420` (the tree); `app/schwarz/README.md:14-24` (the table).
- **What:** Diffing the tree against `find app -name '*.mjs' -not -path '*/disabled/*'` (126 files),
  after allowing the tree's deliberate globs (`solver-lqd.mjs / -singular.mjs`, `seeds/`,
  `lazy/*.mjs`, `solver-pqd*.mjs`), **18 real modules are absent**:
  `app/algebra/` ×8 (`algebra-autosave`, `algebra-format`, `algebra-labeling`, `algebra-latex`,
  `algebra-moment-parse`, `algebra-op-runner`, `algebra-picker`, `algebra-results-drawer` — the tree
  lists 8 of the 16 files there), `app/schwarz/` ×5 (`schwarz-analysis`, `schwarz-export`,
  `schwarz-export-plan`, `schwarz-forward`, `schwarz-inverse`), `app/ui/` ×2 (`ui-copy-buttons`,
  `ui-qol-help`), `app/solvers/prewarm.mjs`, `app/workers/` ×2 (`protocol`, `worker-crash-detail`).
  `app/schwarz/README.md`'s table lists the same 8 of 13 — the five export/forward/inverse/analysis
  modules are missing there too, though `schwarz-export-plan.mjs` is discussed in its prose at `:133`.
- **Evidence:** `scratchpad/scratch/A8/readme_files.txt` vs `real_files.txt`.
- **Why it matters:** The two hand-off modules in that list are DOC-3's subject: they are invisible in
  both the tree and the table, which is why the capability went undocumented.
- **Fix:** Regenerate the two lists; the schwarz table is small enough to maintain by hand, and the
  README tree could reasonably compress `app/algebra/` to a pointer + a one-line-per-cluster summary
  rather than trying to stay per-file accurate at 16 files.
- **Prior:** new.

### DOC-11 [LOW] [confirmed] 519 of 1,052 backticked path references across the app-local docs are dead — concentrated in the three archival documents, but 23 are in live ones
- **Where / counts** (`scratchpad/scratch/A8/sweep2.py`, 1,052 tokens checked by basename + suffix
  against `git ls-files`):

  | Doc | dead refs | live? | note |
  |---|---|---|---|
  | `HANDOFF.md` | 451 | archive | pre-ESM `.js` names throughout; the header declares it historical, so this is expected |
  | `PLAN-SPHERE.md` | 23 | **claims live** | DOC-8 |
  | `ESM-MIGRATION.md` | 22 | archive | banner explicitly disclaims its paths |
  | `TODO.md` | 16 | **live** | every checked item's `Implementation:` line names a flat pre-ESM `.js` path (`app/critical-set.js`, `app/qol.js`, `solver-uqd-lqd.js`, `app/test/solvers.test.js`, …) |
  | `HELPTEXT.md` | 5 | **live** | `app/ui-strings.mjs`→`app/ui/ui-strings.mjs`; `app/ui-modes.mjs`, `app/ui-solve.mjs`, `app/qol.mjs`→`app/core/qol.mjs`, `app/thesis-examples.mjs`→`app/analysis/` |
  | `CONTRIBUTING.md` | 2 | **live** | DOC-9 |
  | `README.md`, `ARCHITECTURE.md`, `THEORY_MAP.md`, all 4 per-module READMEs | **0** | live | clean |

- **Why it matters:** `HELPTEXT.md`'s whole purpose is *"where to edit UI text"* — all five of its
  pointers are one directory short, in a doc whose first line offers a single file to open. The
  `HANDOFF`/`ESM-MIGRATION` counts are not defects; they are the cost of keeping archives verbatim,
  and both say so.
- **Fix:** Fix the 23 in the live docs (`sed` over the five HELPTEXT paths and the 16 TODO ones);
  leave the archives alone.
- **Prior:** new.

### DOC-12 [LOW] [confirmed] The 2026-08-23 review's tracker has no follow-up section, and at least two of its six MEDIUMs are fixed — so its "Final tally" now over-states what is open
- **Where:** `docs/review/2026-08-23-comprehensive-review/PROGRESS.md:79-83` ("Final tally … 6 MEDIUM").
- **What:** That review was declared **REPORT ONLY**, so unlike the 2026-08-17 one it has no
  `## Follow-up work` checklist. Verified at HEAD:

  | Finding | Recorded | At HEAD |
  |---|---|---|
  | A2 MED — live/authoritative race | open | **FIXED.** `app/ui/ui-solve.mjs:351-354` does exactly the recommended repair: `solveAndRender` bumps `_liveSolveToken++` and clears `_liveDirty = false` at its top, with a comment naming both lanes |
  | A3 MED — Berlekamp–Zassenhaus uncapped `2^r` | open | **FIXED.** `app/sym/sym-core.mjs:2202-2216` `RECOMBINE_DEADLINE_MS = 2000` + a `recombineCap` "undetermined" signal; pinned by `vitest/sym-factor-recombine-cap.test.ts` |
  | A3 LOW — `sym-worker.mjs` doc "3 ops" vs 14 | open | **FIXED.** `app/algebra/sym-worker.mjs:13` now says "the full `QD.Sym.runJob` dispatch set" |
  | A2 NIT — `monotincreasing` typo | open | **still open** — `app/solvers/solver.mjs:1280` |
  | A7 NIT — "allocation-free" overstated | open | **still open** — `solver-uqd.mjs:361`, `solver-qd.mjs:296`, `app/param-slice/README.md:26` |
  | A11 LOWs (README ADR cap, RM README) | open | **FIXED** (`README.md:157-159`; `apps/riemann-map/README.md` exists) |

  By contrast the 2026-08-17 tracker's follow-up list is **accurate in every QD row I checked**:
  07-#1 M₀ (`vitest/qd-m0-convention.test.ts` present), 07-#2 findCycles 2×2 Jacobian, 07-#3 → ADR-0026
  with both landed action items (`vitest/schwarz-differential.test.ts`), 07-#4 the 81-file header strip
  (`grep -rc "classic stays frozen" app` → **0**, and exactly the 2 genuine "twin of" prose comments
  survive, as its note predicted), 07-#5 houseQR (`solver.mjs:207-215` now says ABSOLUTE-pivot +
  condEst LOWER-BOUND), 07-#6 seeded rng. **07-#7** (share-link `#vs=` with no legacy decoder) appears
  in no follow-up list and is **still open**: `app/ui/ui-url-state.mjs:129` reads only
  `decodeViewState(location.hash)` and returns `false` for anything else.
- **Fix:** Add a short `## Follow-up status` block to the Aug-23 PROGRESS.md with the table above, and
  resolve 07-#7 one way or the other (a one-line note "pre-monorepo QD shipped no hash format, so
  nothing to migrate" would close it, if that is true).
- **Prior:** re-report of `07-#7`, still open (one line, as the brief allows).

### DOC-13 [LOW] [confirmed] Five small drift items, each independently verified
- **`prop463.txt` is an orphan.** 325 lines in the app root, **0 referrers** anywhere in the repo
  (`grep -rl prop463 apps docs README.md CLAUDE.md` → empty). It is page 72 of the thesis PDF,
  re-extracted with a math-preserving tool — almost certainly a workaround for DOC-1 — and nothing
  explains that. *Fix:* one header line saying what it is and why, or fold it into a fixed `thesis.txt`.
- **README says "Three buttons" and lists two.** `README.md:790-793`: *"Three buttons: *Send to
  inverse* …, *Verify* …"*. The code has exactly two (`direct-ui.mjs:986-987`,
  `.dir-send-btn` / `.dir-verify-btn`).
- **One dead intra-doc anchor.** `CONTRIBUTING.md:32` → `ARCHITECTURE.md#script-load-order`; that
  heading was removed at the ESM migration (`grep -n "^#.*[Ll]oad order" ARCHITECTURE.md` → empty).
  It is the link CONTRIBUTING gives for "import order matters", which is load-bearing advice.
  (Of the 4 anchor links in the live docs, this is the only genuinely broken one.)
- **`perf/` is undocumented app-locally.** `perf/drag-bench.mjs` and `perf/live-drag-bench.mjs` exist
  and are named only in `docs/perf/qd-live-solver-review.md:64,511`; the app README documents only
  `perf:measure` (`README.md:66,79-86`). *Fix:* two lines in README's performance section.
- **`package.json`'s `repository.url` points at the pre-monorepo repo** —
  `github.com/ajgraven/Quadrature-Domains-Visualization-Tool` — where every other app in the workspace
  is under `complex-analysis-suite`. It is `private: true` so nothing publishes it, but it is the
  field a tool reads to link "source". *(Recorded, not urgent: it may be a deliberate provenance
  pointer; if so it deserves a comment, since it is the only such field in the monorepo.)*

## Structural observations

- **The per-module READMEs are the best documentation in the app, and the top-level README is the
  weakest link.** `app/direct/README.md` (120 lines) is complete, current, and covers the eight
  weighted kernels the top-level README omits (DOC-4); `app/schwarz/README.md` carries the σ-mask
  invariant and the export-crispness measurement verbatim. Meanwhile README.md is 986 lines carrying
  three responsibilities that pull in different directions — a marketing/overview front page, a
  per-control UI manual (~400 lines of it, e.g. `:527-620`, a single Algebra-tab bullet that is
  itself 90 lines), and an API reference. The UI manual half is what goes stale (DOC-3, DOC-4), because
  nothing in the build touches it. The per-module READMEs stay current because they sit next to the code.
- **Eleven `## (most recent)` headings in `HANDOFF.md`.** `grep -c "^## (most recent)"` → 11. The file
  is otherwise a *well-maintained live changelog* — its numbered entries run to #66, which is PR #338,
  the most recent QD commit — but eleven sections each claiming primacy make it unnavigable, and §7
  "Recent work (this session)" spans lines 2289–5466 (3,177 lines). *Better:* renumber those headings
  by entry number or date, and treat §0's "Current state" (already banner-disclaimed) as the pointer
  it now is. It should stay live, not be archived — see the table below.
- **`docs/refactor/ISSUES.md` is the model.** Append-only entries with a single mutable Status field
  and dated stage rows; every QD item I spot-checked was accurate, including the ones still open
  (QD-ALG-1 — `installAlgebra` still spans `algebra-ui.mjs:718`→end of 4,591 lines; QD-SOLV-5 seeds
  mirror; QD-SOLV-6). `docs/refactor/STATE.md` carries a correct ⛔-complete banner.
  `docs/refactor/ASSESSMENT.md:3` still says "Living document, written during Phase B (Review)" with
  no completion banner, which is the only refactor doc whose status line has not been closed out.
- **The repo-level QD documentation is accurate wherever I checked it**, which is worth recording as
  a negative result: `CLAUDE.md`'s jsdom count (**34**, measured), its `/opt/pw-browsers/chromium`
  claim (`vitest.browser.config.ts:9`), its "QD is deliberately NOT a `@cas/ui` consumer / took
  `@cas/schwarz` as a devDependency only" (`package.json` — devDeps are `@cas/exact` + `@cas/schwarz`,
  no `@cas/ui`), its σ-mask paragraph, and its Hele-Shaw paragraph all hold. `docs/INTERCHANGE.md`'s
  version history matches `packages/interchange/src/schema.ts:29` (`VERSION = "1.4.0"`). ADRs 0003,
  0006, 0008, 0009 and 0026 have every action item's checkbox correct, with ADR-0026 item 3
  legitimately open. `deploy-pages.yml:79` and `.claude/launch.json`'s `qd-esm` entry (port 5199,
  matching `vite.config.mjs:server.port`) are both right. **The drift is entirely inside
  `apps/quadrature-domains/`.**
- **164 of 164 backticked call-identifiers in the live docs resolve to real source** (3 apparent
  misses are the intentional `QD_UI.installSchwarzX` / `installDirectX` placeholders). So the docs'
  *symbols* are trustworthy even where their *paths and line numbers* are not — which is the argument
  for DOC-5's "drop the line numbers" fix rather than "regenerate them".

## Improvement proposals

These are documentation-structure proposals; the brief's "core functionality" proposals belong to the
solver agents.

1. **Give the app a stated reading order, and split README in three. (M, low risk.)** The app has
   ~10.1k lines of app-local Markdown and a navigation block that names 5 of its 12 documents —
   `TODO`, `HANDOFF`, `ESM-MIGRATION`, `PLAN-SPHERE`, `GROEBNER_INVESTIGATION`, `SCHWARZ_FORMULATION`
   and `HELPTEXT` are reachable only by listing the directory (measured referrer counts:
   `PLAN-SPHERE` 1, `GROEBNER_INVESTIGATION` 1, `SCHWARZ_FORMULATION` 1, `thesis.txt` 1,
   `prop463.txt` **0**). Proposed structure, two paths stated at the top of README:

   > **New here?** README (what it is, how to run it, the ten families) → `ARCHITECTURE.md` (the
   > module graph) → the per-module README for the area you are touching → `CONTRIBUTING.md`.
   > **Resuming work?** `HANDOFF.md` §0 + the newest numbered entry → `TODO.md` → `docs/refactor/ISSUES.md`
   > (open QD-* register) → the newest review's follow-up table.
   > **Doing mathematics?** `THEORY_MAP.md` → the thesis PDF (**not** `thesis.txt` until DOC-1 is fixed)
   > → `SCHWARZ_FORMULATION.md` / `AHARONOV_SHAPIRO.md`.

   And move README's ~400-line per-control UI manual into a new `USER-GUIDE.md`, leaving README as
   overview + running + families + conventions + limitations (~450 lines). The UI manual is the half
   that goes stale, and separating it makes that visible rather than buried at line 700 of the front page.
   *Unlocks:* DOC-3 and DOC-4 become one-section edits in a doc whose job is exactly that.

2. **Introduce `apps/quadrature-domains/historical/` and move four documents into it. (S, no risk.)**
   Keep a one-line index in README. The judgement per document:

   | Document | Lines | Verdict | Reason |
   |---|---|---|---|
   | `README.md` | 986 | **live** — split (proposal 1) | front page; 34 referrers |
   | `ARCHITECTURE.md` | 475 | **live** | module graph + contracts; accurate apart from DOC-6 |
   | `CONTRIBUTING.md` | 298 | **live** | the extension recipes are current (DOC-9 aside) |
   | `THEORY_MAP.md` | 313 | **live** | the thesis bridge; needs DOC-5 |
   | `HANDOFF.md` | 5,908 | **live** (with a structural pass) | it is current to PR #338; it is the resume-work document. Fix the eleven "(most recent)" headings |
   | `TODO.md` | 461 | **live** | needs DOC-7 + the 16 path fixes |
   | `HELPTEXT.md` | 57 | **live** | needs 5 path fixes |
   | `AHARONOV_SHAPIRO.md` | 170 | **live** | a verified worked demonstration with a live regression (`app/test/cardioid-uniqueness.test.js`) |
   | `SCHWARZ_FORMULATION.md` | 107 | **live** | documents a shipped, user-selectable formulation |
   | `GROEBNER_INVESTIGATION.md` | 188 | **live-ish** | a research menu whose tiers are partly implemented; it should say which |
   | `ESM-MIGRATION.md` | 197 | **historical** | already banner-perfect; just move it |
   | `PLAN-SPHERE.md` | 387 | **historical** | shipped and superseded (DOC-8) |
   | `prop463.txt` | 325 | **historical or delete** | orphan (DOC-13) |
   | `thesis.txt` | 9,360 | **replace** | unusable as-is (DOC-1) |

3. **Make three of these findings unrepeatable with cheap checks. (S, low risk.)** Each is a script
   the existing lint step could run: (a) resolve every backticked path in the **live** app-local docs
   against `git ls-files` — this sweep found 23 real breaks and would have caught `app/disabled/`;
   (b) assert `thesis.txt` contains Greek characters; (c) assert README's family table row count equals
   the number of `registerFamily(` call sites. None needs new infrastructure — `packages/core`'s
   `convention-neutral.test.ts` is precedent for a source-scanning test that blocks a merge, and the
   comparable QD sweeps in `vitest/` already read source text.

4. **Record the cross-app hand-off contract once, app-locally, and link out. (S.)** DOC-3's fix.
   Worth doing on its own because QD is now a producer for **two** downstream apps and a third
   (`schwarz-export.mjs`'s φ path) — and the only place a QD maintainer can learn that is the root
   `CLAUDE.md`.

5. **Close the Aug-23 review loop. (S.)** DOC-12's table, plus a standing convention that a
   "report-only" review still gets a follow-up section when its findings are later acted on. Two of its
   six MEDIUMs are fixed and nothing says so, which is exactly the "do not re-report closed findings"
   trap the current review brief warns about — this review's own agents were at risk of it.

## Documentation drift

| Doc file:line | Claims | Reality (file:line) | Sev |
|---|---|---|---|
| `thesis.txt` (whole file) | the thesis text; brief calls it "the specification for the mathematics" | 0 Greek / 0 math-alnum / 0 sub-sup chars in 460,147; Thm 3.2.2 reads `= (0) + -1()#.` at `thesis.txt:1745` | HIGH |
| `README.md:311-313, 341, 938-940` | `app/disabled/aqd/` holds AQD Stage-0–2 scaffolding + a re-enable checklist | no such path on disk or in `git ls-files` at HEAD | HIGH |
| `HANDOFF.md:482,2065-7,3947,5171-2,5817-9,5880,5903` | same, 9× incl. §11 index + §12 status | same | HIGH |
| `README.md` (whole) + `ARCHITECTURE.md` (whole) | — (no mention) | 3 hand-off buttons: `schwarz-ui.mjs:492`, `:516-613`; 17 exports in `schwarz-export.mjs` | MED |
| `README.md:338-341` | 4 direct rows, weight column all `1` | 8 weighted forward kernels, `direct-common.mjs:2191-2198` | MED |
| `README.md:789` | Direct "Domain type — Bounded / Unbounded / Numerical" | plus a QD/PQD/LQD weight control + singular toggle, `direct-ui.mjs:292-302` | MED |
| `README.md:836-850` | `QD.Direct` has 12 entries | 26 exports, `direct-common.mjs:2190-2214` | MED |
| `THEORY_MAP.md:9` | "Line numbers are accurate as of the P3 docs pass" | 30/30 references stale | MED |
| `THEORY_MAP.md:70` | `solver-qd.mjs:427` | file is 397 lines | MED |
| `THEORY_MAP.md:194,195` | `solver-lqd-singular.mjs:549`, `:629` | file is 464 lines | MED |
| `THEORY_MAP.md:293` | `solveInverseQD` at `solver.mjs:790` | `solver.mjs:1463` | MED |
| `THEORY_MAP.md:289` | `houseQR` at `solver.mjs:195` | `solver.mjs:234` | LOW |
| `THEORY_MAP.md:68,69,193` | `:244`, `:322`, `:463` | `:194`, `:272`, `:309` | LOW |
| `ARCHITECTURE.md:162` | Family registry = 6 families | 10 `registerFamily(` sites in `app/solvers/` | MED |
| `TODO.md:37` | `#21` URL state encoding — unchecked, High priority | shipped: `app/ui/ui-url-state.mjs`, `vitest/qd-url-state.test.ts` | MED |
| `TODO.md:100` | `#23` high-res Schwarz render — unchecked | shipped: `schwarz-export.mjs` + `schwarz-export-plan.mjs` (PR #338) | MED |
| `TODO.md:85,91` | `#16` preimage tree, `#18` σ domain-coloring — unchecked | shipped: `schwarz-paint.mjs` `paintPreimageTree`; `schwarz-features.mjs:12` | MED |
| `TODO.md:71,118,76` | `#8`, `#9`, `#13` — unchecked | shipped / half-shipped (see DOC-7) | LOW |
| `TODO.md` ×16 lines | `app/critical-set.js`, `app/qol.js`, `solver-uqd-lqd.js`, … | all `.mjs` and folderized since Phase 2 | LOW |
| `PLAN-SPHERE.md:3` | "**Status**: ready for implementation" | shipped (TODO `#14` ✅) and superseded (HANDOFF #29 removed the tab) | MED |
| `PLAN-SPHERE.md` ×23 lines | `sphere-common.js`, `schwarz-webgl.js`, `app/ui.js` | `.mjs`, folderized | LOW |
| `CONTRIBUTING.md:157` | suite files incl. `solvers.test.js` | `solvers-1..4.test.js`; 30 files in `node-test.js:22-51` | LOW |
| `CONTRIBUTING.md:164` | the pin example is in `schwarz-ui.test.js` | `vitest/schwarz-ui.test.ts` (the same sentence says it moved) | LOW |
| `CONTRIBUTING.md:165` | "well under 30 s for the full battery" | **measured 1m31.077s** | LOW |
| `CONTRIBUTING.md:32` | link `ARCHITECTURE.md#script-load-order` | no such heading (removed at the ESM migration) | LOW |
| `HELPTEXT.md:5,50,51,52,54` | `app/ui-strings.mjs`, `app/ui-modes.mjs`, `app/ui-solve.mjs`, `app/thesis-examples.mjs`, `app/qol.mjs` | `app/ui/…` ×3, `app/analysis/…`, `app/core/qol.mjs` | LOW |
| `README.md:242-420` | the file-layout tree | 18 real `.mjs` absent (8 algebra, 5 schwarz, 2 ui, prewarm, 2 workers) | LOW |
| `app/schwarz/README.md:14-24` | 8-row file table | 13 `.mjs` in the directory | LOW |
| `README.md:790` | Direct output card has "Three buttons" | two (`direct-ui.mjs:986-987`) | LOW |
| `README.md:110` | `pnpm … build  # emits app/dist/` | emits `apps/quadrature-domains/dist/` (`vite.config.mjs:build.outDir`); `app/dist` does not exist | LOW |
| `docs/review/2026-08-23…/PROGRESS.md:79-83` | 6 MEDIUM open | A2 fixed (`ui-solve.mjs:351-354`), A3 fixed (`sym-core.mjs:2215`); no follow-up section exists | LOW |
| `docs/review/2026-08-suite-review/findings/07:150` | 07-#7 share-link legacy fallback | still open — `ui-url-state.mjs:129` decodes `#vs=` only | LOW |
| `docs/refactor/ASSESSMENT.md:3` | "Living document, written during Phase B" | the engagement is complete (`STATE.md:1` ⛔) and this is the only refactor doc without a closing banner | LOW |
| `apps/quadrature-domains/package.json:repository.url` | `…/Quadrature-Domains-Visualization-Tool` | the app lives in `complex-analysis-suite` | NIT |
| `prop463.txt` | — | 0 referrers repo-wide | NIT |
| `perf/drag-bench.mjs`, `perf/live-drag-bench.mjs` | — | named only in `docs/perf/qd-live-solver-review.md`, not the app README | NIT |

**Verified-correct, recorded so it is not re-checked:** `CLAUDE.md`'s "34 Quadrature-Domains" jsdom
count (measured 34), `/opt/pw-browsers/chromium` probe, "QD is deliberately NOT a `@cas/ui` consumer",
the σ-mask paragraph, the Hele-Shaw paragraph; `docs/INTERCHANGE.md` version history vs
`schema.ts:29`; ADR-0003/0006/0008/0009/0026 action-item checkboxes; root `README.md`'s
twelve-apps/thirteen-packages line and QD rows; `deploy-pages.yml:79`; `.claude/launch.json`'s
`qd-esm` port 5199; all six 07-#N fixes from the 2026-08-17 follow-up (including
`grep -rc "classic stays frozen"` → 0 with exactly the 2 predicted survivors); every one of
`README.md` / `ARCHITECTURE.md` / `THEORY_MAP.md` / the 4 per-module READMEs' **path** references
(0 dead) and 164/164 of the live docs' symbol references.

## Tests

No vacuous test found in my scope (I did not run mutation sweeps — the code agents own that). Two
test-facing documentation gaps:

- **`app/node-test.js`'s `TESTS` array is the real suite manifest and is self-asserting**
  (`node-test.js:108-114` checks each file contributed at least a per-file floor, and the run's last
  line is `PASS runner: all 30 registered test files ran — ran 30/30`). `CONTRIBUTING.md:157`
  duplicates a stale 9-file subset of it by hand. *Fix:* delete the duplicate list and link the array;
  the assertion already guarantees the array is complete, so a hand copy can only be wrong.
- **Nothing pins the docs.** The three checks in proposal 3 would have caught DOC-2 (dead
  `app/disabled/` path), DOC-1 (symbol-stripped thesis) and DOC-6 (family-count mismatch)
  automatically. The repo already has the idiom — `packages/core/test/convention-neutral.test.ts` is
  a merge-blocking source scan, and `apps/contour-integration`'s vocabulary denylist reads string
  literals out of the TypeScript AST for exactly this purpose.
