# STATE — refactor engagement

> Living control file. Always current; keep under 100 lines. Committed directly to `refactor/main`
> at every checkpoint (it describes not-yet-merged work, so it must not sit behind an unmerged PR).
> Git and the working tree are authoritative for *what is true*; this file is authoritative only for
> *where we are*. On disagreement, trust git and correct this file.

## Objective
Multi-session architectural refactor of `complex-analysis-suite` — prioritizing maintainability/
extensibility, conceptual clarity, reliability/testability, and architectural coherence.
Behavior-preserving by default; no behavioral change without an explicit approval token.

## Phase / stage
- **Phase D — Execute. Groups A + B + C COMPLETE. Group D in progress.**
- **ui.mjs pure-seam extraction COMPLETE** — D-ui-seam (#193, domain-mode algebra) + D-ui-seam-2 (#194, geometry
  pair) both MERGED. Both pure pieces the map found are now in small netted modules (`ui-domain-mode.mjs`,
  `ui-geometry.mjs`); ui.mjs got its first executable coverage (25 tests). ui.mjs's residual bulk is DOM wiring
  (its other logic already lives in sibling modules — installX factories).
- **AWAITING USER DIRECTION** (holding — do not auto-start). The one remaining big Group-D target is
  **installAlgebra** (algebra-ui.mjs, ~4.2k-line fn, QD-ALG-1) — the hardest net-first target of the engagement:
  DOM-heavy (sidebar = one innerHTML string wired by stringly-typed ids, QD-ALG-2), current tests source-text
  (QD-ALG-3). Needs a char-strategy + scope agreement FIRST. Candidate approaches: (i) incremental pure-helper
  carve-outs to netted modules (the ui.mjs seam pattern); (ii) jsdom-drive the sidebar build + assert DOM/handlers;
  (iii) convert the source-text algebra tests to behavioral. Options at the gate: **(a) installAlgebra** (I propose
  a strategy, implement on a nod — likely wants fresh budget); **(b) pause** at this ui.mjs-seams-done milestone.
- Cadence: merge on green (user delegates; "Proceed with Group D"). `APPROVED: PLAN.md v1`.
  Roadmap §8: A✓ / B✓ / C✓ / **D (ui.mjs seams✓; installAlgebra remains)** / E / F.

## Branches / PR
- Integration `refactor/main` @ **43bd5c4** (D-ui-seam-2 merge; this STATE commit advances it). Tree clean. **No open PR.**
- Merged stage PRs (17): A1 #178 … C3b-p2 #192, D-ui-seam #193, **D-ui-seam-2 #194 (43bd5c4)**.

## Validation state (green bar)
- **`refactor/main` @ 43bd5c4 — ALL GREEN (re-confirmed post-merge):** build/typecheck/lint exit 0; `pnpm test`
  **2139 passed / 244 files**. ui.mjs seam nets: ui-domain-mode 19/19 + ui-geometry 6/6.

## Uncommitted / unverified
- None. D-ui-seam-2 merged; this STATE commit direct to `refactor/main`.

## Known blockers / risks
- No open PR; **holding for the installAlgebra decision**. No blockers.
- installAlgebra is the single hardest remaining target (DOM-heavy, source-text tests) — warrants a char-strategy
  proposal + scope agreement before implementation, and fresh budget (this session is very long).

## Next concrete steps
1. **HOLD** — await user's choice: (a) installAlgebra (I propose its net-first strategy, then implement on a nod) /
   (b) pause at the ui.mjs-seams-done milestone.
2. Whichever: net-first, behavior-preserving, own PR(s) → refactor/main; merge on green.
3. Group order: A✓ B✓ C✓ → **D (ui.mjs seams done; installAlgebra remains)** → E (state+folderize) → F (dep-cruiser).

## Resume commands
```
git fetch && git checkout refactor/main && git pull
pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm lint && pnpm test  # expect 2139/244
```
