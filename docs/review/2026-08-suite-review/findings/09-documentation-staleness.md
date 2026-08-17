# 09 — Cross-cutting documentation staleness

Scope: the whole repo's prose currency — root `CLAUDE.md` + `README.md`; `docs/` (VISION,
ARCHITECTURE, DECISIONS, MIGRATION, INTERCHANGE, RISKS, plus `design/`, `refactor/`); the two
CI workflow comment blocks; and per-app/per-package `README.md` files. Every claim below was
checked against the actual tree at HEAD (`claude/complex-analysis-suite-review-f9ytea`, which
carries PRs through #282; note the local `master` ref is stale at #260 but HEAD is the current
state and what I reviewed). Counts I verified true: **10** `@cas/*` packages, **7** riding apps
+ launcher (8 app dirs), deploy list, Node 22 pin, and all `pnpm`/script/config paths named in
`CLAUDE.md`. The staleness is concentrated in specific paragraphs, not the headline counts.

---

### [HIGH] CLAUDE.md still calls the QD→CD σ hand-off "awaiting review" on a feature branch — it shipped to master
- **Area:** root / refactor+design docs · **Location:** `CLAUDE.md:145` (primary); duplicated verbatim at `docs/refactor/STATE.md:95` and `docs/design/SIGMA-HANDOFF.md:380`
- **Type:** stale-doc
- **Confidence:** high
- **Fix-safety:** safe-now
- **Evidence:** `CLAUDE.md:145` heads the milestone paragraph **"QD → CD σ hand-off (QD-HANDOFF-2 + S5, on `claude/repository-refactor-project-pg5ktu`, awaiting review):"**, yet the *body* of that same paragraph (`:147-150`) describes the GPU peer view and the bounded family in the present tense as done. The work is in fact merged and on master/HEAD:
  - `git log` shows the σ peer view (`4005d42` "CD: native GPU Schwarz reflection σ → a first-class peer view (ADR-0009) **(#246)**") and the multi-view explorer (`607b5b7` "σ multi-view explorer — Phase F **(#255)**"), plus `8230ac1` "docs(refactor): STATE — QD-HANDOFF-2 (σ hand-off) **SHIPPED to master**".
  - `packages/interchange/src/schema.ts:27` → `export const VERSION = "1.3.0"` with the `schwarz` and `bounded` forms present; `packages/schwarz/src/bounded.ts` exists; `apps/complex-dynamics/src/render/schwarzView.ts` (the GPU peer view) is git-tracked at `607b5b7`.
  - `docs/refactor/STATE.md:95`: "**▶ S4b + S5 BUILT on `claude/repository-refactor-project-pg5ktu` (awaiting review; NOT yet on master).**" `docs/design/SIGMA-HANDOFF.md:380`: "**S5 — polish + families (on `claude/repository-refactor-project-pg5ktu`, awaiting review).**"
  - Sibling docs already know it shipped: `docs/INTERCHANGE.md:18-23` documents 1.1.0/1.2.0/**1.3.0** as implemented, and `docs/MIGRATION.md` treats phases 0–6 as complete.
- **Why it matters:** `CLAUDE.md` is the authoritative session-start brief. A future agent reading it will believe the σ hand-off (and the whole S4b GPU peer view + S5 bounded family) is unmerged and try to re-land it, or avoid building on it. The claim is also internally self-contradictory within its own paragraph.
- **Recommendation:** Rewrite the `CLAUDE.md:145` header to "merged" and drop the branch/awaiting-review clause (attribute to the peer-view arc #244–#255; interchange 1.3.0). Do the same at `STATE.md:95` and `SIGMA-HANDOFF.md:380`. `refactor/STATE.md`'s own preamble says "Living control file. Always current" — it is 6 PRs behind, so it should either be brought current or explicitly marked archived.

### [MEDIUM] Duplicate ADR-0020 — two different decisions share the same identifier
- **Area:** docs / ADR log · **Location:** `docs/DECISIONS.md:1732` and `docs/DECISIONS.md:1803`
- **Type:** stale-doc (log integrity)
- **Confidence:** high
- **Fix-safety:** needs-review
- **Evidence:** Two headings both claim the number: `:1732` "## ADR-0020: Defer the winding / singularity primitive extraction (second consumer noted)" and `:1803` "## ADR-0020: Schwarz-Christoffel engine: lightning-seeded, disk-canonical, two-mode". Both are `Status: Accepted, Date: 2026-08`; the next ADR is 0021, so the sequence reads 0019, 0020, 0020, 0021. The two auto-generated GitHub anchors differ, so cross-links still resolve, but the human-facing ID "ADR-0020" is genuinely ambiguous and is referenced by number in many places pointing at *different* ADRs — the SC-engine one from `CLAUDE.md:131`, `CLAUDE.md:164`, `docs/ARCHITECTURE.md:177`, `packages/conformal/README.md:22,60,83,84`, `packages/conformal/src/{scMap.ts,index.ts}`; the winding-defer one from `docs/design/argument-principle-plan.md:8,177,194,263` and `apps/argument-principle/src/winding.ts:15`.
- **Why it matters:** The ADR log's core invariant is unique, sequential IDs. "Supersede via a new ADR" (CLAUDE.md locked-decisions preamble) is unworkable if two ADRs answer to the same number; any future "see ADR-0020" is ambiguous.
- **Recommendation:** Renumber one of them (the SC-engine ADR is the natural candidate to become the next free number, e.g. ADR-0025, since ADR-0021–0024 already exist above it and it is the later topic) and update its ~10 inbound references, or, if renumbering is undesirable, at minimum add a disambiguation note under each 0020 heading. Marked needs-review because the renumbering scheme and its cross-reference sweep is a judgment call, not a one-line auto-fix.

### [MEDIUM] CLAUDE.md opening still says the suite "unifies two mature apps … and will host a third"
- **Area:** root · **Location:** `CLAUDE.md:12-13`
- **Type:** stale-doc
- **Confidence:** high
- **Fix-safety:** safe-now
- **Evidence:** `:12` "It currently unifies two mature apps (Complex Dynamics; Quadrature Domains) and will host a third (anti-holomorphic correspondences)." The tree has **7 riding apps** + launcher, and correspondences already exists (built-but-unpublished). Every sibling top-level doc was reframed: `README.md:13` "hosts **seven** applications riding **ten** shared `@cas/*` packages"; `docs/VISION.md:4` "The plan it motivates has since been executed: seven apps now ride ten shared…"; `docs/MIGRATION.md` "✅ Status: executed". Only `CLAUDE.md`'s "What this repository is" section was left at the day-one description.
- **Why it matters:** The authoritative brief's opening paragraph describes a two-app prototype that hasn't existed for many milestones; it contradicts `CLAUDE.md`'s own Status section (`:91` "Seven apps … ride the ten shared `@cas/*` packages").
- **Recommendation:** Update to "seven apps riding ten shared `@cas/*` packages" (matching `README.md:13` / `VISION.md:4`), keeping the north-star sentence.

### [MEDIUM] ARCHITECTURE.md has a cluster of stale app counts (three deploy/launcher/consumer descriptions predate the plotter, riemann-map, argument-principle, faber apps)
- **Area:** docs · **Location:** `docs/ARCHITECTURE.md:17`, `:327-328`, `:408`
- **Type:** stale-doc
- **Confidence:** high
- **Fix-safety:** safe-now
- **Evidence:**
  - `:327-328` (§8 Build & deployment): "one combined Pages site: `apps/launcher/dist` at the root, with `complex-dynamics/` and `quadrature-domains/` beneath it." The actual publish (`.github/workflows/deploy-pages.yml:77-82` and `README.md:87-88`) puts **six** apps beneath the launcher (complex-dynamics, quadrature-domains, complex-function-plotter, riemann-map, argument-principle, faber-transform). No local "as built" note corrects §8.
  - `:408` (§11 launcher): "The launcher is a static stub (`apps/launcher`) listing all **three** apps". The launcher's `index.html` lists all seven apps plus a "Coming soon" correspondences card (grep of `apps/launcher/index.html`).
  - `:17` (the "✅ As built" note): "`@cas/export`: PNG `tEXt` metadata across **three apps**, ADR-0016". `@cas/export` is now a dependency of **four** apps (`grep '"@cas/export"' apps/*/package.json` → complex-dynamics, complex-function-plotter, riemann-map, **argument-principle**), which `README.md:109` already states correctly ("CD + plotter + Riemann Map + Argument Principle").
- **Why it matters:** ARCHITECTURE.md is the "where things live" reference (README doc-map item 2). Its intro carries an "✅ As built" reframe for the *package* list but the §8/§11 bodies and one consumer count were never updated as apps 3–7 landed.
- **Recommendation:** §8 → list all six deployed subpaths (mirror `deploy-pages.yml`); §11 → "listing all seven apps (plus a 'Coming soon' correspondences card)"; `:17` → "across four apps".

### [MEDIUM] ci.yml browser-job comment says "Two harnesses" but `pnpm test:browser` runs five
- **Area:** CI · **Location:** `.github/workflows/ci.yml:102` (bullets `:103-114`)
- **Type:** stale-doc
- **Confidence:** high
- **Fix-safety:** safe-now
- **Evidence:** `:102` "Two harnesses, both under `pnpm test:browser`:", then bullets for only `@cas/gpu` (`:103`) and `complex-dynamics` (`:108`). The root `package.json` `test:browser` script actually chains **five**: `pnpm -C packages/gpu … && pnpm -C packages/schwarz … && pnpm -C apps/complex-dynamics … && pnpm -C apps/complex-function-plotter … && pnpm -C apps/quadrature-domains … run test:browser`. I confirmed all five have a `"test:browser"` script. So `@cas/schwarz`, `complex-function-plotter`, and `quadrature-domains` are missing from the comment.
- **Why it matters:** The comment is the only documentation of what the WebGL2 backstop covers; undercounting it by three hides real coverage and misleads anyone reasoning about the gate.
- **Recommendation:** Change "Two harnesses" → "Five harnesses" and add bullets (or a compact list) for schwarz's CPU↔GPU σ parity net and the plotter/QD real-shader compiles.

### [MEDIUM] @cas/conformal README lists the exterior SC engine as "Deferred" and omits Faber Transform as a consumer
- **Area:** package · **Location:** `packages/conformal/README.md:75` and the Consumers list `:80-88`
- **Type:** stale-doc
- **Confidence:** high
- **Fix-safety:** safe-now
- **Evidence:** `:75` "Deferred (roadmap): CRDT for elongated/crowded polygons, **exterior**/unbounded/circular-arc variants, and `@cas/interchange` serialization." The exterior SC engine has shipped: `packages/conformal/src/exteriorSchwarzChristoffel.ts` + `exteriorScParameterProblem.ts` exist (Faber M1b, PR #279), and `README.md:110` / `CLAUDE.md:160` / `docs/DECISIONS.md:2069` (ADR-0024) all describe it as `@cas/conformal`'s "second SC family". The Consumers section (`:81-88`) lists only Riemann Map, Schwarz–Christoffel (self), and "Anticipated: AAA, zipper" — it never lists **Faber Transform**, the actual current consumer of the exterior engine. (The CRDT, *unbounded/circular-arc*, and interchange-serialization items on `:75` are still genuinely deferred; only "exterior" is stale.)
- **Why it matters:** The package README understates the package's own shipped surface and misses a real dependency edge, which is exactly the reuse map ADR-0007/0018 want kept honest.
- **Recommendation:** Remove "exterior" from the Deferred line (leave unbounded/circular-arc/CRDT/interchange), and add a Faber Transform consumer bullet noting it drives the exterior builder.

### [LOW] CLAUDE.md Status omits the Correspondences mating visualizer entirely
- **Area:** root · **Location:** `CLAUDE.md:89-90` (and the Deferred list `:173-176`)
- **Type:** stale-doc
- **Confidence:** high
- **Fix-safety:** safe-now
- **Evidence:** `:89` "Phase 6 (`apps/correspondences`) is complete through **Milestone C**:" then lists only σ, the deleted correspondence, the family plane, and the parabolic-Tricorn coordinate. The string "mating" does not appear anywhere in `CLAUDE.md`. But the mating visualizer is shipped and prominent: `apps/correspondences/mating.html` + `apps/correspondences/src/mating/{matingMain,matingView}.ts` exist; `README.md:19` ("an interactive **mating visualizer**"), `README.md:40` ("plus a complete interactive mating visualizer"), `README.md:70` (`/mating.html`), and `docs/MIGRATION.md:11` ("plus a follow-on interactive mating visualizer in the Correspondences app") all document it.
- **Why it matters:** The authoritative brief undersells the correspondences app; a reader can't tell the mating explorer exists or whether it's in-scope/deferred.
- **Recommendation:** Add the mating visualizer to `CLAUDE.md`'s correspondences Status sentence (as README/MIGRATION already do).

### [LOW] ADR-0013 and ADR-0014 aren't marked superseded/narrowed, though ADR-0017 forward-references them
- **Area:** docs / ADR log · **Location:** `docs/DECISIONS.md:1137` (ADR-0013 Status) and `:1246` (ADR-0014 Status)
- **Type:** stale-doc
- **Confidence:** medium
- **Fix-safety:** safe-now
- **Evidence:** `ADR-0017` (`:1457`) is correctly headed "**supersedes the RM-consumer premise of ADR-0014, narrows ADR-0013**", and `CLAUDE.md:111` records the same. But the two affected ADRs carry a bare "**Status:** Accepted" with no back-pointer: `:1137` (ADR-0013) and `:1246` (ADR-0014). The doc's own status legend (`:34`) defines "Superseded/Deprecated" as a valid status, and ADR-0021 (`:1900`) *does* carry an inline "Superseded in part by ADR-0022" note — so the convention exists and these two just weren't updated.
- **Why it matters:** A reader landing on ADR-0014 will take "RM is a live `@cas/dynamics` consumer" at face value, when RM shed `@cas/dynamics` (ADR-0017); the supersession is only discoverable from the newer ADR, not the stale one.
- **Recommendation:** Append "— Superseded in part by [ADR-0017]" (ADR-0014) and "— Narrowed by [ADR-0017]" (ADR-0013) to their Status lines, matching the ADR-0021 pattern.

### [LOW] README documentation-map calls the ADR set "ADR-0001…0007"
- **Area:** root · **Location:** `README.md:158`
- **Type:** stale-doc
- **Confidence:** high
- **Fix-safety:** safe-now
- **Evidence:** `:158` "the Architecture Decision Records (**ADR-0001…0007**): one decision each". `docs/DECISIONS.md` runs through **ADR-0024** (plus the duplicate 0020). The same doc-map bullet is otherwise current.
- **Why it matters:** Understates the decision log by 17+ ADRs; a reader may assume decisions past 0007 aren't recorded.
- **Recommendation:** "ADR-0001…0024".

### [LOW] RISKS.md open-question #8 still pins "Node 20 LTS" (superseded by Node 22)
- **Area:** docs · **Location:** `docs/RISKS.md:178`
- **Type:** stale-doc
- **Confidence:** high
- **Fix-safety:** safe-now
- **Evidence:** `:178` "**Node version pin.** The plan pins **Node 20 LTS** (`.nvmrc`, `engines`). Confirm, or prefer a different baseline?" The decision resolved to **22**: `CLAUDE.md:46` (locked decision 10, "This supersedes the '20' mentioned in some docs"), `.nvmrc` = `22`, root+QD `package.json` `engines.node` = `>=22`, both workflows `node-version: 22`. `README.md:166` frames RISKS's questions as "(now-resolved)", but this line isn't marked resolved inline and still states 20.
- **Why it matters:** This is precisely the "Node 20 in some docs" the locked decision warns about; the risk register reads as if the baseline is undecided at 20.
- **Recommendation:** Mark #8 resolved → Node 22 (or add a "RESOLVED: Node 22" annotation consistent with README's "now-resolved" framing).

### [LOW] README "consume the packages' built `dist/`" is still inaccurate for @cas/expr and @cas/gpu (unfixed prior-review finding)
- **Area:** root · **Location:** `README.md:80-82`
- **Type:** stale-doc
- **Confidence:** high
- **Fix-safety:** safe-now
- **Evidence:** `:81` "apps and tests consume the packages' **built `dist/`**". `@cas/expr` and `@cas/gpu` have **no `build` script and no `dist/`**; their `exports` point straight at `./src/*.ts` (verified: `packages/expr/package.json` → `"./ast": "./src/ast.ts"`, `packages/gpu/package.json` → `"./df64": "./src/glsl/df64Ref.ts"`, neither has `dist/`). This is the same inaccuracy the prior review flagged at `README.md:74` (`docs/review/CODEBASE_REVIEW_2026-07.md:637-641`, "false for two of the five packages"); the text moved to `:80-82` but the claim was not corrected. Still open.
- **Why it matters:** A contributor debugging a stale build will assume every package emits `dist/`; two of ten are consumed from source.
- **Recommendation:** Soften to "consume the packages' build output (source-`exports` for `@cas/expr`/`@cas/gpu`, built `dist/` for the rest)", as the prior review recommended.

### [NIT] @cas/core README "either layout the two apps use"
- **Area:** package · **Location:** `packages/core/README.md:55`
- **Type:** stale-doc
- **Confidence:** low
- **Fix-safety:** safe-now
- **Evidence:** `:55` "either layout the **two apps** use". `@cas/core` is now consumed by all seven apps; the phrase means the two *representation layouts* (QD's `{re,im}` obj vs CD/schwarz's `[re,im]` tuple), but reads as a global app count. (`packages/exact/README.md:48` "so the two apps" is fine — `@cas/exact` genuinely has exactly two consumers, CD + Correspondences.)
- **Why it matters:** Minor; potential to mislead a skimmer into thinking core still serves two apps.
- **Recommendation:** "either coordinate layout (`{re,im}` or `[re,im]`) the apps use", or leave as-is if read as layouts.

### [NIT] QD HANDOFF.md changelog entry records "engines>=20"
- **Area:** app · **Location:** `apps/quadrature-domains/HANDOFF.md:479`
- **Type:** stale-doc
- **Confidence:** medium
- **Fix-safety:** safe-now
- **Evidence:** `:479` "…deploy `version:sync` docs, `engines>=20`, a non-blocking `npm audit` CI step…" — inside a dated "Tech-debt Phase 1 (PR #45)" changelog bullet. The current pin is `>=22`. This is a historical log entry (accurate as a record of what PR #45 did), so it's borderline; flagged only because it's another "Node 20" residue and HANDOFF.md is a long-lived per-app doc.
- **Why it matters:** Low — historical, not a current-state claim. Included for completeness of the Node-20 sweep.
- **Recommendation:** Leave as history, or append "(later raised to >=22)" if the maintainer prefers no bare 20s anywhere.

---

## Cross-reference with the prior review (`docs/review/CODEBASE_REVIEW_2026-07.md`)

Prior doc-staleness findings — regression status:
- **0-7** (README test count "1550+" stale) — **fixed, no regression.** `README.md:41` now reads "2846 Vitest tests across 337 files" (I did not re-run to verify the number itself; out of read-only scope).
- **cd-doc-09** (`@cas/core` README "error-free splits for accuracy") — **fixed, not regressed.** `packages/core/README.md:69` now explicitly says "It does **not** use error-free splits, as this line previously [claimed]".
- **corr-readme-stale-10** (correspondences README omitted `@cas/exact`, listed only four packages) — **fixed.** `apps/correspondences/README.md:6-7` now lists `@cas/core, @cas/exact, @cas/expr, @cas/gpu, @cas/interchange, @cas/schwarz`.
- **README `dist/` claim** (prior review §0, `README.md:74`) — **still open**; see the LOW finding above (`README.md:80-82`).

## Coverage

Examined in full for currency: root `CLAUDE.md` (all sections) and `README.md`; both workflow
files (`ci.yml`, `deploy-pages.yml`); `docs/ARCHITECTURE.md` (intro + §8/§11 + the "As built"
note), `docs/INTERCHANGE.md` (header/version note), `docs/MIGRATION.md` (header), `docs/RISKS.md`
(open-questions block), `docs/VISION.md` (header framing); `docs/DECISIONS.md` ADR **headers +
status lines** for all ADRs and the ADR-0013/0014/0017/0020/0024 bodies relevant to supersession
and the duplicate-number check; `docs/refactor/STATE.md` (full) + `LOG.md` (tail); `docs/design/
SIGMA-HANDOFF.md` (status), plus `schwarz-christoffel-plan.md` / `argument-principle-plan.md` /
`faber-*` only via targeted greps. Package/app READMEs: `packages/{core,exact,conformal}` read
directly; `interchange`/`schwarz`/`export`/`faber`/`gpu`/`expr`/`dynamics` and the app READMEs
covered by targeted greps (package/app counts, Node, "deferred", consumer lists). Verified against
code: package.json names (10 pkgs / 8 app dirs), `engines`/`.nvmrc`, `@cas/export` + `@cas/dynamics`
consumer sets, `test:browser` fan-out, the σ-handoff merge evidence (interchange VERSION,
`bounded.ts`, `schwarzView.ts`, PR log), the exterior-SC files, the mating-visualizer files, and
that all commands/paths named in `CLAUDE.md` exist (`dep:check`, `.dependency-cruiser.cjs`,
`scripts/bootstrap-subtrees.sh`).

**Not fully covered (honest gaps):** `docs/DECISIONS.md` ADR *bodies* were not each read end-to-end
(2110 lines) — I checked headers/status and the supersession-relevant sections, so an internal
stale claim buried inside an accepted ADR body could remain. The `docs/algebra-review/*` and
`docs/{ALGEBRA_*,MULTIVARIATE_FACTORING,NVARIATE_FACTORING}.md` set (a QD-Algebra sub-project,
~1400 lines) was not reviewed for currency — likely a separate stale-doc surface worth a pass.
`apps/quadrature-domains/HANDOFF.md` (4100+ lines) and per-app READMEs were grep-sampled, not
read in full. Numeric claims (test counts) were not re-derived (read-only; no builds run).
