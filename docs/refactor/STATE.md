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
- **D-ui-seam-2 (ui.mjs geometry seam) — PR #194 OPEN (CI pending).** Extracted the pure geometry pair
  (`boundarySelfIntersectsSimple`/`segmentsIntersect`) → NEW `app/ui-geometry.mjs` + 6-test net (mutation-verified;
  pins the collinear-miss quirk). Behavior-preserving (green 2139/244). On merge → **ui.mjs pure-seam extraction
  COMPLETE** (both pure pieces the map found are out + netted; D-ui-seam #193 did the domain-mode cluster).
- **AWAITING USER DIRECTION after #194 merges** (holding — do not auto-start). ui.mjs's residual bulk is DOM
  wiring; the remaining Group-D monolith is **installAlgebra** (algebra-ui.mjs, ~4.2k-line fn, QD-ALG-1). It's the
  hardest net-first target of the engagement (DOM-heavy: sidebar via one innerHTML string, QD-ALG-2; current tests
  are source-text, QD-ALG-3) — needs a proposed char-strategy + scope agreement FIRST. Options at the gate:
  (a) installAlgebra (I propose a net-first strategy, then implement on your nod); (b) pause here.
- Cadence: merge on green (user delegates; "Proceed with Group D"). `APPROVED: PLAN.md v1`.
  Roadmap §8: A✓ / B✓ / C✓ / **D (ui.mjs seams done on #194; installAlgebra remains)** / E / F.

## Branches / PR
- Integration `refactor/main` @ **c331733** (this STATE commit advances it). Tree clean.
- **PR #194 OPEN (CI pending):** `refactor/D-ui-seam-geometry` (9de3e24) → `refactor/main`.
- Merged stage PRs (16): A1 #178 … C3b-p2 #192, D-ui-seam #193 (29a7f97). (Full list in prior STATE/LOG.)

## Validation state (green bar)
- **D-geometry branch @ 9de3e24 — ALL GREEN:** build/typecheck/lint exit 0; `pnpm test` **2139 passed / 244 files**
  (+6, +1 file); ui-geometry net 6/6, mutation-verified.
- `refactor/main` @ c331733 (post-#193) green: 2133/243.

## Uncommitted / unverified
- None. D-ui-seam-2 committed (9de3e24) + pushed; PR #194 open. This STATE commit direct to `refactor/main`.

## Known blockers / risks
- **Awaiting PR #194 CI green**, then merge (per cadence). Behavior-preserving (pure-logic move + net).
- installAlgebra is the hardest remaining target (DOM-heavy) — warrants a char-strategy proposal + scope agreement
  before any implementation, and likely fresh budget (this session is very long).

## Next concrete steps
1. **When PR #194 CI greens → merge** (title + `(#194)`), pull, re-confirm green (2139/244).
2. Present the installAlgebra decision: (a) propose its net-first char-strategy then implement on a nod, or (b) pause.
3. Group order: A✓ B✓ C✓ → **D (ui.mjs seams done; installAlgebra remains)** → E → F.

## Resume commands
```
git fetch && git checkout refactor/main && git pull        # after #194 merges
pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm lint && pnpm test  # expect 2139/244
```
