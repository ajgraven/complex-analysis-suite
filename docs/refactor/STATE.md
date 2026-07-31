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
  sub-computations, net-first, one PR each. **9 carve-outs (8 merged + #203 in flight):**
  1 classifyVerdict+posDimDesc→NEW algebra-labeling #195✓ · 2 `_verdictBadge` (IIFE lift) #196✓ · 3 exactValueStr+fmtRat→NEW
  algebra-format #197✓ · 4 fmtRatio+ratioStrRec (+format) #198✓ · 5 `_parseMomentToken`+`_parseMomentNum`→NEW algebra-moment-parse
  #199✓ · 6 withGuidance+`_isCapFailure` (+labeling) #200✓ · 7 `_pronyLatex`→NEW algebra-latex #201✓ · 8 valStr (+format;
  substList DEFERRED) #202✓ · 9 buildHForm h(w) LaTeX (+algebra-latex) — **PR #203 OPEN.** 4 pure companion modules
  (labeling/format/moment-parse/latex) + the in-file badge lift; **~69 new char tests** over logic that had ZERO coverage.
- **INFLECTION after carve-out 9:** the census's HIGH-VALUE pure targets (formatters, parser, guidance, LaTeX builders)
  are DONE. What remains is (a) low-value trivial predicates (isForkedColumn/`_relKey`/`_substKey`/refMeaning),
  (b) latexPlain-injection carves (substList/latexOf/reimSafeLatex — signature changes touching the tested PROV_UI
  registry), or (c) the DOM-bound bulk of installAlgebra (QD-ALG-2, the real remaining mass — a jsdom-drive strategy
  shift, NOT pure extraction). Fallback set to STOP + report the milestone after #203, not auto-grind (c).
- **Shape by deps:** a NEW MODULE when the dep is cleanly importable (or a zero-dep leaf; 3/9 side-effect-import the QD
  namespace module for ratApprox/RiemannLatex); an IN-FILE IIFE lift when a dep is woven through installAlgebra (2: `latexPlain` ~50×).
- **QD-ALG-6 DECLINED** (scattered tolerance literals, not a pure computation); `poleCentroid` inline copy = a DEDUP of the tested `QD.poleCentroid`.
- Cadence: merge on green (delegated). `APPROVED: PLAN.md v1`.
  Roadmap §8: A✓ / B✓ / C✓ / **D (ui.mjs seams✓; installAlgebra — 9 carve-outs, 8 merged)** / E / F.

## Branches / PR
- Integration `refactor/main` @ **9508990** (#202 merge; this STATE commit advances it). Tree clean.
- **OPEN PR #203** — `refactor/d-alg-carve-9-hform` @ 8da8e92 (off 9508990): carve-out 9. CI running (both in_progress at
  open); subscribed + fallback armed (21:48Z) that merges on green then STOPS + reports the milestone (does NOT auto-chain).
- Merged stage PRs (25): A1 #178 … D-alg-carve-7 #201, **D-alg-carve-8 #202 (9508990)**.

## Validation state (green bar)
- **`refactor/main` @ 9508990 — ALL GREEN (confirmed by carve-out 9's green bar, which builds on it):** `pnpm test` 2203/252.
- **PR #203 stage branch @ 8da8e92 — ALL GREEN (firsthand):** build/typecheck/lint exit 0; `pnpm test`
  **2208 passed / 253 files** (+5, +1 file — new headless `algebra-hform.test.ts`). Lands on merge.

## Uncommitted / unverified
- None. Carve-out 9 committed to its stage branch (8da8e92) + pushed; this STATE commit direct to `refactor/main`.

## Known blockers / risks
- PR #203 open, CI in progress; drive-to-green posture (my PR). No blockers.
- installAlgebra's remaining bulk is DOM-bound (QD-ALG-2) / store-coupled — after the pure high-value targets (done), the
  residue needs a strategy shift (jsdom-drive), not pure extraction.

## Next concrete steps
1. **Merge #203 on green, then HOLD at the 9-carve-out milestone for user direction** (fallback armed 21:48Z). Present
   the 3 remaining directions (trivial predicates / latexPlain-injection carves / DOM-bound sidebar strategy shift) + pause-to-review.
2. If "keep carving": the cheap predicates (isForkedColumn/`_relKey`/`_substKey` → a new predicates module) are the lowest-risk next.
3. Group order: A✓ B✓ C✓ → **D (installAlgebra — 8 merged + #203; high-value pure targets done)** → E → F.

## Resume commands
```
git fetch && git checkout refactor/main && git pull
pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm lint && pnpm test  # expect 2139/244 (2150/245 after #195)
```
