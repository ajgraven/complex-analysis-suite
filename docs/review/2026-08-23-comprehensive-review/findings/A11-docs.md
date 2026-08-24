# A11 — Documentation currency re-review (all docs vs. code at HEAD)

Scope: ALL documentation vs. current code/status at HEAD `2c0c2c4` (= code state `300c775`
+ the review scaffold). Priority on (1) root `CLAUDE.md` Status vs. the post-Aug-17 churn
(#284–#296: perf #292/#294, faber in-panel #293/#295/#296, riemann-map SC studio + exterior-disk
#285/#286/#288); (2) the *unswept* algebra docs (`docs/ALGEBRA_*`, `MULTIVARIATE_FACTORING`,
`NVARIATE_FACTORING`, `docs/algebra-review/*`); (3) `docs/DECISIONS.md` ADR-log integrity
(the renumbered ADR-0025 + new ADR-0026); (4) the core docs (ARCHITECTURE/README/VISION/
MIGRATION/INTERCHANGE/RISKS) + per-package/app READMEs; (5) `docs/perf/*` + `docs/design/*`;
(6) broken links / stale `path:line` / `⚠ verify` markers.

**Headline: the docs are in very good shape.** Every fix the prior review's finding 09 recommended
was applied (verified item-by-item below), the ADR log integrity is fully repaired (no duplicate
ADR-0020; TOC complete through 0026; all `ADR-0025` inbound refs updated; ADR-0013/0014 carry the
supersession back-pointers), and the two big surfaces the prior review admitted it skipped — the
`docs/algebra-review/*` sub-project and the `ALGEBRA_*`/factoring docs — turn out to be
well-maintained, each carrying an explicit COMPLETE/FINAL/SHIPPED/⛔-CLOSED banner and matching the
code I spot-checked (~30 named engine functions confirmed present). The perf docs
(`cd-render-review.md`, `qd-live-solver-review.md`) carry dated "Update — implemented" sections that
accurately match the #292/#294 commits. All remaining findings are **LOW/NIT** — mostly small
residues of the recent churn and one broken relative link.

---

### [LOW] `README.md` doc-map still caps the ADR set at "ADR-0001…0024" — two ADRs now exist beyond it
- **Area:** root · **Location:** `README.md:159`
- **Type:** stale-doc
- **Confidence:** high
- **Fix-safety:** safe-now
- **Evidence:** `README.md:158-159` — "the Architecture Decision Records (**ADR-0001…0024**): one decision each". `docs/DECISIONS.md` now runs through **ADR-0026** (verified: headings for 0001–0019, 0025, 0020–0024, 0026; TOC row 37 + legend "All twenty-six are Accepted"). This is a *residue of the prior review's own fix*: finding 09 recommended "ADR-0001…0024", but the same PR (#283) also renumbered the winding-defer duplicate to **ADR-0025** and added **ADR-0026** (QD schwarz-common deferral), so the range should now read 0026. Off by two.
- **Why it matters:** Understates the decision log; a reader may assume decisions 0025/0026 aren't recorded. Minor, and only in the doc-map summary — the DECISIONS.md TOC itself is correct.
- **Recommendation:** `README.md:159` → "ADR-0001…0026".

### [LOW] Riemann Map exterior-disk gallery + interactive image pane (#288) is undocumented everywhere
- **Area:** app / root · **Location:** feature in `apps/riemann-map/src/presets.ts:39`, `apps/riemann-map/src/main.ts`, `ui/controls.ts` (PR #288, commit `bd0013f`); no doc covers it
- **Type:** stale-doc (missing-doc for recent churn)
- **Confidence:** high
- **Fix-safety:** safe-now
- **Evidence:** #288 added a whole "exterior-disk formula preset gallery" (univalent ψ: 𝔻* = {|z|≥1} → exterior of a compact K) plus a pan/drag/zoom-able image pane. Grepping every doc surface, the phrase "exterior-disk" / "preset gallery" for Riemann Map appears **only** in the source (`presets.ts:39`) and this review's own brief — not in `CLAUDE.md`'s Status (its two Riemann-Map paragraphs cover the SC studio + the CD→RM Böttcher import, not this new source type), not in any `docs/design/` doc (`schwarz-christoffel-plan.md` is SC-only), and there is **no `apps/riemann-map/README.md`** (confirmed: `riemann-map` and `argument-principle` are the only two apps lacking a README, though every other app has one). So a whole new capability landed with zero prose.
- **Why it matters:** Not a *contradiction* (nothing claims otherwise), but it's the largest genuinely-undocumented recent feature, and Riemann Map — one of the most-developed apps — has no README to anchor it. A future agent has no doc path to the exterior-disk mode.
- **Recommendation:** Add a sentence to `CLAUDE.md`'s Riemann-Map Status (or the SC-studio paragraph) noting the exterior-disk preset gallery + interactive image pane; ideally seed a short `apps/riemann-map/README.md` (matching the other apps' pattern).

### [LOW] `docs/refactor/STATE.md` only partially brought current — "Always current" header + a stale "▶ NEXT" while ~13 later PRs go unmentioned
- **Area:** docs / refactor control file · **Location:** `docs/refactor/STATE.md:3` (header), `:92` ("▶ NEXT" marker)
- **Type:** stale-doc
- **Confidence:** medium
- **Fix-safety:** needs-review
- **Evidence:** Finding 09 flagged STATE.md as behind and recommended "brought current or explicitly marked archived." It was *partially* patched: `:95` was updated to "**✅ S4b + S5 SHIPPED to master**" (good). But the file still opens (`:3`) with "**Living control file. Always current; keep under 100 lines.**", still carries "**▶ NEXT — σ hand-off (APPROVED 2026-08-07)**" at `:92` (whose own sub-items are all ✅, so the σ hand-off is *done*, not "NEXT"), and never mentions any post-refactor work (Argument-Principle #271–#284, Faber #278–#296, Riemann-map SC studio + exterior-disk #285–#288, perf #292/#294). So the file claims to be "always current" while frozen at the σ-handoff era. (Defensible reading: the *refactor engagement* ended at the σ hand-off and later app-dev is out of its charter — but then the "Always current" / "▶ NEXT" language is what's wrong.)
- **Why it matters:** A control file that asserts "Always current" but is ~13 PRs behind will mislead a resuming agent about where the work stands — exactly finding 09's concern, only half-addressed.
- **Recommendation:** Either add a one-line "⛔ refactor engagement complete — see root README/CLAUDE.md Status for current state" banner (the pattern `docs/algebra-review/STATE.md:3` already uses cleanly), or drop the "▶ NEXT" marker and soften the "Always current" preamble.

### [NIT] Broken relative link in `docs/refactor/LOG.md` — `design/SIGMA-HANDOFF.md` should be `../design/…`
- **Area:** docs / refactor log · **Location:** `docs/refactor/LOG.md:1751`
- **Type:** stale-doc (broken link)
- **Confidence:** high
- **Fix-safety:** safe-now
- **Evidence:** `:1751` — "Updated [SIGMA-HANDOFF.md](design/SIGMA-HANDOFF.md) …". From `docs/refactor/`, `design/SIGMA-HANDOFF.md` resolves to the non-existent `docs/refactor/design/SIGMA-HANDOFF.md`; the file is at `docs/design/SIGMA-HANDOFF.md`. Sibling refs use the correct form (`docs/refactor/PHASE-F.md:188` → `../design/SIGMA-HANDOFF.md`; `LOG.md:1412`/`ISSUES.md:530` use the full `docs/design/…`). This was the *only* broken relative `.md` link in the whole doc tree (a scripted scan of `CLAUDE.md` + `README.md` + `docs/**/*.md` excluding `review/` found exactly this one).
- **Why it matters:** Low — it's a historical log entry — but it's a dead link in an otherwise link-clean tree.
- **Recommendation:** `LOG.md:1751` → `[SIGMA-HANDOFF.md](../design/SIGMA-HANDOFF.md)`.

### [NIT] `ALGEBRA_MODULE.md` §8 says `sym-core.mjs` "imports only `./solver.mjs`" — the path is `../solvers/solver.mjs`
- **Area:** docs · **Location:** `docs/ALGEBRA_MODULE.md:221`
- **Type:** stale-doc
- **Confidence:** high
- **Fix-safety:** safe-now
- **Evidence:** `:221` — "`sym-core.mjs` imports only `./solver.mjs` and does not build on `@cas/exact`." The file's sole import (confirmed: exactly one `import` line) is `import _QD from '../solvers/solver.mjs';` — the target lives in `app/solvers/`, not co-located, so `./solver.mjs` is a stale relative path (predates the `solvers/` reorg). The *substance* of the claim (single import; does not build on `@cas/exact`; independent exact stacks) is correct.
- **Why it matters:** Trivial; only the path token is wrong, and the architectural point it supports still holds.
- **Recommendation:** `./solver.mjs` → `../solvers/solver.mjs` (or drop the path and keep "imports only its own numeric `solver.mjs`").

---

## Confirmed clean (checked, current — do not re-flag)

- **ADR-log integrity (was the MEDIUM in finding 09): fully repaired.** No duplicate ADR number remains — the winding-defer ADR is now **ADR-0025** (`DECISIONS.md:1737`), the SC-engine keeps **ADR-0020** (`:1813`); all inbound `ADR-0025` refs updated (`docs/design/argument-principle-plan.md` ×5, `apps/argument-principle/src/winding.ts:15`, DECISIONS body refs); the SC-engine `ADR-0020` inbound refs (`CLAUDE.md:134/158/181`, `packages/conformal/README.md:22/60`) all still resolve to the SC ADR; TOC lists 0001–0026 with the legend "All twenty-six are Accepted"; ADR-0013 (`:1140`) carries "narrowed in part by ADR-0017" and ADR-0014 (`:1249`) "RM-consumer premise superseded by ADR-0017".
- **All other finding-09 fixes applied:** `CLAUDE.md` opening now "seven apps … riding ten shared `@cas/*` packages"; σ hand-off paragraph reads "merged" (not "awaiting review"); Correspondences Status names the mating visualizer. `ARCHITECTURE.md` §8 lists all six deployed subpaths (`:327-329`), §11 "all seven apps" (`:410`), `:17` "across four apps". `ci.yml:102` "Five harnesses". `packages/conformal/README.md` exterior SC moved out of Deferred (`:75-76`) + Faber consumer added (`:88-89`). `packages/core/README.md:55` "either coordinate layout … the apps use". `README.md:80-82` dist claim corrected ("source `exports` for `@cas/expr`/`@cas/gpu` (no `dist/`), built `dist/` for the other eight"). `RISKS.md:178` "RESOLVED → Node 22 LTS". `SIGMA-HANDOFF.md:380` "merged to master".
- **Counts vs. tree (all match):** 10 `@cas/*` packages; 8 app dirs (7 riding + launcher); `@cas/export` = 4 app consumers (CD, plotter, RM, AP); `@cas/dynamics` = CD only; `@cas/conformal` = RM + Faber; `.nvmrc`/engines = Node 22; deploy-pages.yml subpaths (6 apps under launcher) match `CLAUDE.md` locked-decision 11 verbatim; `@cas/interchange` `VERSION = "1.3.0"` matches `CLAUDE.md`/`INTERCHANGE.md`; RM and Faber `package.json` `@cas/*` deps match `CLAUDE.md`'s riding claims exactly.
- **Algebra docs (the unswept gap) — accurate.** `ALGEBRA_MODULE.md` §4–§9: ~26 claimed engine functions all present (`saturateMobius`, `schurCohnAtBox`/`schurCohnInterval`, `foldCertifiedAtRoot`, `boundaryCertifiedAtRoot`, `rurFromJSON`, `verifySolutionExact`, `factorMultivariate`, `mvHenselLift`, `henselFactorBivariate`, `bivariateAbsFactorCount`, `curveGenus`, `verifySOS`, `radicalZeroDim`, `shapeFromMoments`, `hankelRank`, `pronyPolynomial`, `parametricRealCount1D`, `discriminantVariety`, `solveRealCertified`, `rationalUnivariateRep`, `triangularDecomposition`, `minimalPrimes`, …). `MULTIVARIATE_FACTORING.md` / `NVARIATE_FACTORING.md` both "Status: COMPLETE"; `ALGEBRA_EXTENSIONS.md` is a dated (2026-07) roadmap snapshot with truthful ✅/◐/◻ flags. `docs/algebra-review/*` all carry clear status banners: `STATE.md` ⛔ CLOSED → redirects to `WORKSPACE_REVIEW.md`; `WORKSPACE_REVIEW.md` is a fully-populated live status table (rows #101–#118, only 5.4 ◐ deliberately partial); `X1_BOUNDARY.md` "✅ COMPLETE — all six X1 slices shipped (#146–#151)"; `RATIONAL_MOMENT_C2.md` "C2 route SHIPPED" + C3 shipped; `ORCHESTRATOR_REDESIGN.md`/`AUDIT.md`/`PLAN.md`/`FINAL_REPORT.md` all COMPLETE/FINAL. Spot-checked C2/C3/X1 function refs (`rationalMomentSystem`, `triangleMomentSystem`, `multiNodeTriangleData`, `nodeInsideDisk`, `rationalCertifyLeaf`) — all present in code.
- **Perf docs match the shipped PRs.** `docs/perf/cd-render-review.md` has dated "Update — P1 batch implemented (2026-08-22)" + "Update — Fix L (two-pass recolour) implemented" sections that match #294's sqrt-free hot loop / appearance drafting / two-pass recolour. `docs/perf/qd-live-solver-review.md` has "Update — Tier 1 / Tier 2 O5 implemented" plus honest ❌-reverted (S1), ✅-with-correction (O4), 🟡-partial (S4) markers matching the #292 commit series (incl. the S1 revert `7348e32`).
- **Faber docs current after churn.** `apps/faber-transform/README.md` documents in-panel vertex editing / `handleEdit.ts` / draggable handles on the K panel (#295) and `Q_{n,m}` (M3); `docs/design/faber-polygonal-sc-plan.md` marks M0–M3 all DONE (matches `CLAUDE.md` "T2.3 = DONE").

## Coverage

Read in full or near-full: `CLAUDE.md` (Status + locked decisions vs. tree), `README.md` (doc-map + dist + counts), `docs/ALGEBRA_MODULE.md`, `docs/ALGEBRA_EXTENSIONS.md` (status table + build-status block), `docs/perf/{cd-render-review,qd-live-solver-review}.md`, `docs/DECISIONS.md` (TOC + all ADR headings/status lines + the 0013/0014/0017/0020/0024/0025/0026 supersession-relevant bodies), `docs/refactor/STATE.md`, and the `docs/algebra-review/*` headers/status banners (all 10 top-level files + the `audit/` listing). Verified against code: package/app counts, `@cas/*` consumer sets, `engines`/`.nvmrc`, deploy-pages subpaths, interchange VERSION, RM/Faber deps, ~30 algebra-engine function names, and a scripted broken-`.md`-link scan across the whole doc tree (one hit).

**Not fully covered (honest gaps):** `docs/DECISIONS.md` ADR *bodies* were read only for the supersession/renumber-relevant ADRs and the ones governing recent work — a stale claim buried inside an accepted body I didn't open could remain (though the headers/status/TOC are all consistent). `docs/ARCHITECTURE.md`, `MIGRATION.md`, `INTERCHANGE.md`, `VISION.md` were checked at the header/§-level and against finding-09's flagged lines, not paragraph-by-paragraph. `docs/design/*` (SC plan, argument-principle plan, complex-function-plotter plan/research, faber research/roadmap) and the QD app's `HANDOFF.md` (4100+ lines) / `ARCHITECTURE.md` / `THEORY_MAP.md` were grep-sampled for status markers and link/ref targets, not read end-to-end. Numeric claims inside docs (test counts like "2846 tests", perf millisecond tables) were **not** re-derived — read-only, no builds/tests run per the brief. I did not exhaustively verify every `path:line` reference inside the perf/design review docs (sampled only).
