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
- **ui.mjs pure-seam extraction COMPLETE** — D-ui-seam (#193) + D-ui-seam-2 (#194) both MERGED (netted
  `ui-domain-mode.mjs` + `ui-geometry.mjs`; ui.mjs's first executable coverage, 25 tests).
- **installAlgebra decomposition UNDERWAY** (QD-ALG-1; user: "Carve-outs" + "keep carving") — extract its PURE
  sub-computations, net-first, one PR each. **8 carve-outs (7 merged + #202 in flight):**
  1 classifyVerdict+posDimDesc→NEW algebra-labeling #195✓ · 2 `_verdictBadge` (IIFE lift) #196✓ · 3 exactValueStr+fmtRat→NEW
  algebra-format #197✓ · 4 fmtRatio+ratioStrRec (+format) #198✓ · 5 `_parseMomentToken`+`_parseMomentNum`→NEW algebra-moment-parse
  #199✓ · 6 withGuidance+`_isCapFailure` (+labeling) #200✓ · 7 `_pronyLatex`→NEW algebra-latex #201✓ · **8 valStr (+format;
  substList DEFERRED) — PR #202 OPEN.** 4 pure companion modules (labeling/format/moment-parse/latex) + the in-file badge lift; ~64 new char tests.
- **Shape by deps:** a NEW MODULE when the dep is cleanly importable (or a zero-dep leaf); an IN-FILE IIFE lift when a dep
  is woven through installAlgebra (carve-out 2: `latexPlain` ~50×). **latexPlain-dependent helpers deferred** (substList,
  friendlyReim) — moving them needs `latexPlain` injected as a param (a signature change), not a verbatim carve.
- **Census:** a read-only scan found ~16 cleanly-pure + ~4 pure-if-injected helpers; **~12 pure left** after #202. Ranked
  next: substList (latexPlain-injection), buildHForm (LaTeX→algebra-latex), isForkedColumn/`_relKey`/`_substKey` (cheap
  predicates), then latexOf(+reimSafeLatex) pure-if-injected.
- **QD-ALG-6 DECLINED** (scattered tolerance literals, not a pure computation); `poleCentroid` inline copy = a DEDUP of the tested `QD.poleCentroid`.
- Cadence: merge on green (delegated); the merge-on-green fallbacks chain to the next carve-out. `APPROVED: PLAN.md v1`.
  Roadmap §8: A✓ / B✓ / C✓ / **D (ui.mjs seams✓; installAlgebra — 8 carve-outs, 7 merged)** / E / F.

## Branches / PR
- Integration `refactor/main` @ **fb3a60a** (#201 merge; this STATE commit advances it). Tree clean.
- **OPEN PR #202** — `refactor/d-alg-carve-8-valstr` @ 3f29626 (off fb3a60a): carve-out 8. CI running
  (both in_progress at open); subscribed + fallback armed (21:26Z) that merges on green AND continues to carve-out 9.
- Merged stage PRs (24): A1 #178 … D-alg-carve-6 #200, **D-alg-carve-7 #201 (fb3a60a)**.

## Validation state (green bar)
- **`refactor/main` @ fb3a60a — ALL GREEN (confirmed by carve-out 8's green bar, which builds on it):** `pnpm test` 2197/251.
- **PR #202 stage branch @ 3f29626 — ALL GREEN (firsthand):** build/typecheck/lint exit 0; `pnpm test`
  **2203 passed / 252 files** (+6, +1 file — new headless `algebra-valstr.test.ts`). Lands on merge.

## Uncommitted / unverified
- None. Carve-out 8 committed to its stage branch (3f29626) + pushed; this STATE commit direct to `refactor/main`.

## Known blockers / risks
- PR #202 open, CI in progress; drive-to-green posture (my PR). No blockers.
- installAlgebra's remaining bulk is DOM-bound (QD-ALG-2) / store-coupled; after the census's ~12-remaining pure candidates
  are worked through, the residue is DOM/store readouts + builders — those need a strategy shift (jsdom-drive), not pure extraction.

## Next concrete steps
1. **Merge #202 on green → continue to carve-out 9** (fallback armed 21:26Z; "keep carving"). Carve-out 9 = the next
   CLEAN pure target: buildHForm (LaTeX → algebra-latex.mjs) or the cheap predicates (isForkedColumn/`_relKey`/`_substKey`);
   AVOID substList/friendlyReim (latexPlain-injection — deferred). Firsthand-verify, net-first, own PR.
2. **Carve-outs 10+** — work down the census; then substList (latexPlain-injection) + latexOf(+reimSafeLatex) pure-if-injected.
3. Group order: A✓ B✓ C✓ → **D (installAlgebra — 7 merged + #202; census: ~12 pure left)** → E → F.

## Resume commands
```
git fetch && git checkout refactor/main && git pull
pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm lint && pnpm test  # expect 2139/244 (2150/245 after #195)
```
