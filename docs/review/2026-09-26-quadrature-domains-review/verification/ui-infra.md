# Verification: UI and infra slices (adversarial pass)

**Method.** The built `dist/` was copied to scratch, served locally, and driven with Playwright in real Chromium.
Probes and screenshots are in `scratchpad/verify-ui/`. No tracked file was edited.

## Verdicts

| ID | Verdict | Final severity |
|---|---|---|
| UI-1 | CONFIRMED | P1 |
| UI-2 | CONFIRMED, worse than reported | P1 |
| UI-3 | CONFIRMED | P1 |
| UI-4 | CONFIRMED | P1 (arguably P0) |
| UI-5 | CONFIRMED (missing fields); the "different root" claim is PLAUSIBLE | P1 |
| UI-8 | CONFIRMED (the wrong-verdict consequence is inferred) | P1 |
| INF-1 | CONFIRMED (the frequency was overstated) | P1 |
| INF-2 | CONFIRMED | P1 |
| UI-6 | CONFIRMED | P2 |
| UI-7 | CONFIRMED, severity lowered | P3 |

## Evidence

### UI-1: a link pasted into an open tab is lost
Nothing listens for `hashchange`, so `#h-text` keeps the old h. The next wheel-zoom rewrites the hash to the old
state, which erases the pasted link.

### UI-2: a `tab:"schwarz"` link opens the wrong picture
The Schwarz sidebar says "(no φ captured)". Meanwhile the shared canvas shows the QD tab's plot, because the
restore solve renders after the tab switch.

### UI-3: typed coefficients are rounded to 6 significant figures, silently
- `0.123456789/(w-0.3)` is rewritten to `0.123457/(w - 0.3)`, and the link and the hData carry the rounded value.
- `(1/3)/(w-0.7654321)` becomes a = 0.765432, C = 0.333333.
- No message is shown.

### UI-4: the validity badge overclaims
- A sampled polygon test yields an unqualified "✓ Valid quadrature domain".
- The test at `vitest/qd-validity-badge.test.ts:52` pins this byte-identical.
- On the default cardioid, the badge reads ✓ while a tooltip in the same panel says the identity check is unreliable.
- An algebra ≈ result gets ⚠. So the two labels are inverted.

### UI-5: the link carries the problem, not the solution
The writer emits only `mode, h, w0m, w0, c, a, q, agg, tab, fig, view`. There is no selected alternate, no
search options and no φ.

### UI-8: an autosave restore bypasses the stale-seed guard
Across two browser sessions:
- The h₁ seed was restored under an h₂ link. It showed "Ready", and Propagate-all ran.
- Control: a stale seed within one session is refused.
- `_seededHData` is never set on the restore path.

### INF-1: a deploy can break an open page's Algebra tab
- `registerSW.js` is a bare `register('./sw.js')`. `sw.js` calls `skipWaiting`, `clientsClaim` and
  `cleanupOutdatedCaches`.
- In a simulated deploy B, A's files were removed from the server. A page still running A got a 404 on its
  algebra chunk, and the Algebra panel stayed empty. The next reload recovered.
- Vite hashes are content-based, so this needs a deploy that changes QD's output. Not every push to master
  triggers it.

### INF-2: editing during "Estimate max c" gives a wrong answer at high confidence
- A clean run gives c* ≈ 1.4504.
- Pressing Enter in `#h-text` every 150 ms during the estimate gives c* ≈ 1.3939 at 99% confidence.
- Cause: `solver-cmax.mjs:199-206` turns a superseded rejection into `success:false`.

### UI-6: every link restore briefly publishes the default h
The first publish, at t = 302 ms, is the default h = 1/w, while the box already shows the link's h. The link's h
is published at 438 ms.

### UI-7: the old link format is not a back-compat bug
Links in the old format fail and are overwritten. But commit d15f944 records the owner's decision ("no
published links to preserve"). The remaining action is to record that decision in MIGRATION.

## New items
1. **[P1, mainstream] On first open, the Algebra tab says "No classical bounded QD solved yet" when a solve
   exists.**
   - Cause: `PrimarySolution.subscribe` (primary-solution.mjs:97) does not replay the current envelope, and the
     lazily loaded `installAlgebra` never calls `get()`.
   - Measured: the message is still showing 20 s after load.
   - Fix (S): initialise from `get()`, or make `subscribe` replay.
2. **[P2] The QD render paints into the shared canvas while another tab is active.** This is part of UI-2.
   Gate the render on the active tab.
3. **[P2] After "Estimate max c", the app jumps to c* = 1.45044, where the QD tab itself reports failure.**
   - The badge reads "⚠ identity not satisfied" (0.854), while the estimator says "confidence 100%".
   - The cusp readout says "(7,8) cusp · m=6".
   - This is where SOLV-5 (the identity escalation cap) and ANA-11 (the cusp-order labelling) meet.
