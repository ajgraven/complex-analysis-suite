# ui — summary

Covered the share-link codec end to end (current `#vs=` writer/reader, the pre-2026-07-08 format recovered
from GitHub history, boot-time restore ordering, the copy-link path), the QD-tab validity badge and the
algebra → QD hand-off, the solve/try-harder/alt-search lanes, algebra autosave/restore, the Schwarz tab's
share-link entry, a11y of the shared canvas, and dead/stale UI. Ran 13 UI spec files (118 tests, green:
`qd-url-state`, `qd-validity-badge`, `figure-export-ui`, `algebra-autosave`, `ui-*`, `algebra-honest-labels-dom`,
`algebra-results-drawer`, `algebra-op-runner`, `qol-toast-action`) and three node/jsdom probes under
`scratchpad/ui/`. Headline: **the share link is lossy in several ways that matter to a researcher** — the
legacy format is dropped, pasting a link into an open tab is silently discarded and overwritten, a link to the
Schwarz tab opens it empty, the typed h(w) is rounded to 6 significant figures before it is solved, and the
link carries the problem but not the solution. The validity badge gives a sampled numeric check the same
unqualified "✓ Valid" an exact algebraic certificate gets. No leftover nav-header code (ADR-0044): QD was
never a consumer, and `grep -i "nav-header|cas-nav|SUITE_APPS|mountNav"` over `app/` is empty.

## Findings

### UI-1 [P1] Pasting a QD link into an already-open QD tab is ignored, then overwritten by the app

- Category: bug
- Location: `app/ui/ui-url-state.mjs:128` (applyUrlState, called once at boot from `app/ui/ui.mjs:1707`); there is no `hashchange` listener in QD (`grep -rn hashchange apps/quadrature-domains/app` → nothing)
- Claim: A URL that differs only in its fragment is a same-document navigation, so the page does not reload.
  QD reads the hash only at boot, so the pasted state is never applied. The next `writeUrlState` (any solve,
  pan, zoom or figure tweak) then replaces the pasted hash with the current state, so the link is lost from the
  address bar as well. Complex Dynamics handles this case (`apps/complex-dynamics/src/main.ts:5610`, a
  `hashchange` listener with a `lastHashApplied` guard).
- Evidence (measured, `scratchpad/ui/paste-link.mjs`, jsdom over the real `installUrlState`):
  ```
  open tab link   : {"mode":"bounded","h":"1/w","c":0.5,"agg":"standard"}
  pasted link     : {"mode":"unbounded","h":"1/(w-2)+w","c":2} | hashchange fired (probe listener): 1 | applied by app: 0
  after next write: {"mode":"bounded","h":"1/w","c":0.5,"agg":"standard"}
  ```
  README:677-680 promises "paste it to restore the exact state and framing".
- Confidence: high
- Prior review: new
- Fix: add a `hashchange` listener that ignores the app's own writes (keep the last written hash, the CD idiom)
  and re-applies. **applyUrlState must first reset to defaults.** It only overlays keys that are present, and
  the writer omits every default-valued key, so applying a default-look link over a customised state would keep
  the customisations (figure, view, α, w₀). That is the "consistently lossy round trip" trap: every current test
  builds a fresh default harness before applying (`vitest/qd-url-state.test.ts:65`), so it cannot catch this.
  Add a test that applies link A over state B, and B over A, with every field different. (M)

### UI-2 [P1] A share link to the Schwarz tab opens an empty Schwarz tab

- Category: bug
- Location: `app/ui/ui-url-state.mjs:181-185` (deferred `btn.click()`); `app/schwarz/schwarz-ui.mjs:199-238` (tab entry), `:505-514` (`_autoCaptureIfPending`, called only from the export actions at `:524/:567/:604`)
- Claim: Capturing φ into the Schwarz tab is a manual "Use this φ" step. On restore, `tab:"schwarz"` clicks the
  tab at `setTimeout(0)`, before the restore solve has even been scheduled (the solve is debounced 60 ms and also
  waits for mathjs, see UI-6). The tab-entry handler finds `sState.schwarz` null and runs `clearCanvas()`. The
  recipient sees a blank Schwarz tab where the sender saw a fractal. None of the Schwarz render state is in the
  link either: iterations, colormap, escape-time scale, plane/z/sphere view, zoom, or the captured φ, which can
  differ from the inverse tab's current h if the sender re-solved after capturing.
- Evidence: code path above (inferred; the capture call sites were grepped exhaustively). `grep -n "captureFromInverseTab()\|_autoCaptureIfPending()" app/schwarz/*.mjs` shows capture only inside the export handlers.
- Confidence: high
- Prior review: new
- Fix: when a link restores `tab:"schwarz"`, auto-capture on the first successful `PrimarySolution` publish.
  Add the Schwarz view parameters to the envelope as an `sw` sub-object, validated like `fig`. (M)

### UI-3 [P1] The typed h(w) is silently rounded to 6 significant figures before it is solved

- Category: bug
- Location: `app/ui/ui-h-text.mjs:134-136,148` (`QD.Complex.format(...)` with the default 6 digits); `app/ui/ui.mjs:1785-1797` (`_sendHToInverseTab`) and `:1854-1877` (`loadScenarioIntoQdTab`), both via `QD.Complex.toString(c, 6)`
- Claim: parseAndApplyHText parses the expression exactly and then stores every pole and residue back into
  `state.poles` as a 6-significant-digit string. `buildHData` re-parses those strings, so the solver solves the
  rounded h. `renderPolesList → refreshHText` then rewrites the text box with the rounded h, and that rounded
  text is what the share link carries. No warning is shown. Direct → Inverse and Parameter-slice → QD round the
  same way. This matters for the research uses the app is built for: near a cusp or univalence threshold, or near
  `c*`, a 1e-6 relative change is inside the region being studied. A value like 1/3 stops being 1/3.
- Evidence (measured, `scratchpad/ui/htext-precision.mjs`, which mirrors parseAndApplyHText and buildHData over the real modules):
  ```
  typed   : 0.123456789/(w-0.3)      solver  : C = 0.123457      link h : 0.123457/(w - 0.3)
  typed   : (1/3)/(w - 0.7654321)    solver  : a = 0.765432, C = 0.333333
  ```
- Confidence: high
- Prior review: new
- Fix: store full precision. Use `String(x)` (the shortest string that round-trips) or `Complex.format(c, {digits: 17})` in the three
  reflect sites, and keep the 6-digit form for display labels only. Add a round-trip test: typed h → buildHData
  → bit-identical. (S)

### UI-4 [P1] The QD-tab badge shows the same "✓ Valid quadrature domain" for a sampled numeric check as for an exact certificate, and a weaker algebra certificate gets the ⚠

- Category: labelling
- Location: `app/ui/ui-solve.mjs:35-48` (`qdValidityBadge`); `vitest/qd-validity-badge.test.ts:52-54` pins the solver path at the unqualified ✓
- Claim: For solver output, `univalent` is `isBoundaryUnivalent(phi, samples)`, a self-intersection test on
  sampled boundary points (`app/solvers/solver.mjs:1526,1646,1703`). `identityOK` is a residual under
  `identityTol = 1e-6` (`app/ui/ui.mjs:192`). Both are estimates. The badge prints the unqualified ✓ for them,
  the same badge an algebra hand-off earns only with `rigor === 'exact'`. An algebra hand-off whose verdict was
  `≈` gets "⚠ … univalence ≈ estimated, not certified". That hand-off is still better evidenced than the sampled
  check that earns ✓. The labelling is inverted, on the headline verdict of the main tab. The live-drag lane
  (`method:'live'`, reduced samples) shows the same ✓.
- Evidence: code as cited (inferred from code; the badge unit test asserts this behaviour on purpose).
- Confidence: high
- Prior review: the algebra half was `qd-ui-algebra-badge-01` (fixed, #155). The solver half is new.
- Fix: three tiers. "✓ Quadrature domain (certified)" only for `rigor==='exact'`. "≈ Quadrature domain —
  numerical (N-point boundary check, identity to 1e-6)" for solver output. Keep ⚠ for failures. The tooltip
  should name the sample count and tolerance actually used. Update the test to pin the new wording. (S)

### UI-5 [P1] The link carries the problem, not the solution: a shared link can open a different domain than the sender saw

- Category: bug
- Location: `app/ui/ui-url-state.mjs:80-114` (the written keys); `app/ui/ui-solve.mjs:406-445` (the full solve warm-starts from the previous φ); `app/ui/ui-state.mjs:118-160` (`selectedSolutionIdx`, `searchOptions` including `seed` and `identityTol`)
- Claim: The envelope holds `{mode,h,w0m,w0,c,a,q,agg,tab,fig,view}`. Not carried:
  - the chosen alternate (`selectedSolutionIdx`), which is the whole point of the alternates panel;
  - `searchOptions`: seed, identityTol, univalenceSamples, show-non-univalent, phases;
  - the overlays: vector field, critical set, curvature, phenomena, Faber roots;
  - `autoSwitchSingular`;
  - the inverse/direct view mode and the Direct tab's φ;
  - a φ rendered through "View in the QD plot" (`ui.mjs:1624`). That link reopens the numeric primary, not the
    algebra-selected domain.

  The sender's primary also depends on history: `solveAndRender` warm-starts from the previous φ whenever the
  structures match, while the recipient's restore solve is cold. On any h with several quadrature domains, the
  recipient can land on another root. Nothing tells the recipient, and the badge says ✓ either way.

- Evidence: field list from code (measured by reading both sides and `qd-url-state.test.ts:167` `WRITE_KEYS`).
  That the history-dependence changes the root is inferred, not reproduced.
- Confidence: medium (for the different-root consequence); high (for the list of missing fields)
- Prior review: new. TODO.md #21 anticipated `iter`/view fields for the Schwarz tab.
- Fix: carry a compact φ (branch parameters, w₀, c, α, family tag) plus `sel` and a `so` diff. On restore,
  warm-start from the carried φ, check it converges to the same φ (a residual on the carried parameters), and say
  so when it does not. The encoded payload stays under 2 kB for realistic pole counts. (M)

### UI-6 [P2] On every link restore, the default h = 1/w is solved and displayed before the link's h, beside the link's h text

- Category: bug
- Location: `app/ui/ui.mjs:1707-1710`; `app/ui/ui-h-text.mjs:96-106`; `app/core/vendor-globals.mjs:18-37`
- Claim: mathjs is lazy, loaded through an idle prefetch with `timeout: 3000`, so it is never ready while
  `applyUrlState` runs synchronously during module evaluation. parseAndApplyHText defers itself to
  `ensureMath().then(...)` and returns. `restoredFromUrl` is true, so `ui.mjs:1709` calls `scheduleSolve()`,
  which solves the **default** `state.poles` (1/w) in the link's mode, c and α 60 ms later. Until mathjs arrives,
  the canvas and "✓ Valid" badge describe the unit disk (or a failure message in PQD/LQD modes), while the text
  box shows the link's h. That solve is also published to the other tabs (the tab switch fires first), and its φ
  becomes the warm seed for the real solve whenever the structure matches.
- Evidence: inferred from code. The source comment at `ui-h-text.mjs:96-99` names this path ("a zero-click
  share-link `h` restore that fires before the idle prefetch lands").
- Confidence: high
- Prior review: new
- Fix: make restore `await window.ensureMath()` before applying the link, and skip the unconditional
  `scheduleSolve()` when `h` is present. Alternatively, keep a "Restoring link…" busy state until the parse has run. (S)

### UI-7 [P2] The legacy share-link format (`#mode=…&h=…`) that QD shipped until 2026-07-08 no longer opens, and the app overwrites it

- Category: bug (back-compat)
- Location: `app/ui/ui-url-state.mjs:129-130`
- Claim: The pre-monorepo writer (subtree import `e94af769`, `app/ui-url-state.js`) wrote
  `'#' + new URLSearchParams({mode,h,w0m,w0,c,a,q,agg,tab})`. Commit `d15f944` (2026-07-08) replaced it with
  `#vs=` and said in its message "no published links to preserve". `deploy-pages.yml` did not exist before
  2026-07-10, so no suite-hosted link was lost. Pre-monorepo local, bookmarked or original-repo links were lost
  silently, and the decision appears nowhere except that commit message (not in MIGRATION, not in an ADR). Such a
  link returns `false`. On a first visit it opens the cardioid preset, and the first write then replaces the hash,
  so the link is gone from the address bar too. The key names are identical to today's state keys, so a fallback
  costs about 10 lines.
- Evidence (measured, `scratchpad/ui/legacy-link.mjs`):
  ```
  legacy hash: #mode=unbounded&h=1%2F(w-2)&w0m=auto&w0=0&c=2&agg=thorough&tab=schwarz
  applyUrlState() -> false
  state after: {"mode":"bounded","c":0.5,"aggressiveness":"standard"} h-text: "" calls: []
  ```
- Confidence: high that the format existed and fails. Whether any such link is in circulation cannot be determined.
- Prior review: reported in `docs/review/2026-08-suite-review/findings/07-quadrature-domains.md:150` ("could not
  verify a prior format existed"). **Still open**, and now resolved as to fact: the format did exist.
- Fix: when `decodeViewState` returns null and the hash parses as URLSearchParams carrying `mode` or `h`, map it
  onto the same state object. Pin it with a legacy-link golden in `qd-url-state.test.ts`. Record the decision in
  MIGRATION. (S)

### UI-8 [P1] Restoring an autosaved algebra derivation bypasses the A4 stale-seed guard, so ops mix the old session's system with the current h

- Category: bug
- Location: `app/algebra/algebra-ui.mjs:896-916` (offerRestore → `store.importDAG`, which never sets `_seededHData`); `:1371-1377` (`ensureSeed`); `:4548` (the subscribe-time stale check); `:3288-3300` (✦ Prove)
- Claim: The autosave payload (`algebra-autosave.mjs:35`) records no h-data provenance. After **Restore**,
  `_seededHData` is still `null`, and both staleness checks short-circuit on it (`activeEnv && _seededHData && …`).
  `ensureSeed()` therefore returns true for a derivation seeded from last session's h₁ while the QD tab holds h₂,
  for example when the page was opened from a share link. ✦ Prove then takes `hData = activeEnv.hData` (h₂), may
  `assumeReal` on h₁'s variables because h₂ is real-symmetric (`:3292-3293`), and runs the certify plan with h₂'s
  context and pinned data against h₁'s system. "View in the QD plot" then pairs h₁'s φ with h₂'s hData. The
  reference panel shows h₂ throughout.
- Evidence: code path (measured by reading; not reproduced in a mount). `grep -n _seededHData` finds no
  assignment on the restore path.
- Confidence: medium (the guard bypass is certain; the size of the wrong-verdict consequence is inferred)
- Prior review: new. The A4 guard was added by an earlier review; this is a hole in it.
- Fix: store the seed's hData, or a canonical hash of it, in the autosave payload. On restore, set
  `_seededHData` to a sentinel that never equals a live hData, so `ensureSeed` prompts a re-seed. Better, show in
  the restore strip which h the derivation belongs to, and offer "restore and switch the QD tab to that h". (S)

### UI-9 [P2] `showQDSolution` and "Try harder" write `state.current` without taking ownership of the solve lanes

- Category: bug (race)
- Location: `app/ui/ui.mjs:1624-1642` (showQDSolution), `:1469-1521` (try-harder); cf. `app/ui/ui-solve.mjs:1257-1317` (the alt-search loop reads and appends to `state.current` every chunk)
- Claim: Neither path bumps `state.altSearchToken`, and showQDSolution does not bump `_solveAndRenderToken` either.
  A background alternate search that is still running (`keepSearching` makes it unbounded) appends numeric
  alternates to the algebra-sourced envelope and republishes it. An in-flight authoritative solve that finishes
  after "View in the QD plot" overwrites the algebra φ with no notice. Try-harder likewise leaves a running
  alt-search attached to its new envelope.
- Evidence: code as cited (inferred).
- Confidence: medium
- Prior review: new
- Fix: one `adoptExternalSolution(env)` helper that bumps every token, cancels the alt search and the worker, and
  is the only path that writes `state.current` from outside `ui-solve`. (S)

### UI-10 [P2] The share link serialises the raw text box, not the h that was solved

- Category: bug
- Location: `app/ui/ui-url-state.mjs:82-83`; parse only on Enter or click (`app/ui/ui.mjs:991-992`)
- Claim: `writeUrlState` also fires on pan, zoom and every figure-card tick. It reads `#h-text` as typed. An edited
  but unparsed expression, or one that failed to parse, goes into the copied link while the canvas still shows the
  previous domain. The recipient then solves something the sender never saw.
- Evidence: code (inferred).
- Confidence: high
- Prior review: new
- Fix: serialise `formatH(state)` of the last _applied_ data, at full precision (see UI-3). (S)

### UI-11 [P2] The main canvas has no accessible name and no keyboard pan or zoom; the a11y roster sees only the default tab

- Category: structure (a11y)
- Location: `app/index.html:768` (`<canvas id="canvas"></canvas>`, which carries no role, label or tabindex); `scripts/a11y-baseline.json` (`quadrature-domains`: 4 accepted `nested-interactive`, 1 `color-contrast`)
- Claim: The canvas that carries every tab's primary output has no name. Pan and zoom are mouse-only (no
  `keydown` in `ui-domain-plot.mjs` or `schwarz-interaction.mjs`). The status panel is `aria-live`, which helps
  on the QD tab only. The roster audits the default state, so the lazily mounted Algebra, Schwarz and Parameter-
  slice panels have never been audited. QD is deliberately not a `@cas/ui` consumer, but `attachCanvasA11y` is the
  suite's answer for this and would not pull in the rest of the shell. The sphere view's `r` shortcut
  (`sphere-ui.mjs:466`) also fires while the user types in an input.
- Evidence: grep (measured).
- Confidence: high
- Prior review: new for QD
- Fix: `role="img"` plus a generated description of the solved domain, keyboard pan and zoom on the canvas, and
  roster entries that open each tab via `#vs=…tab=…`. (M)

### UI-12 [P2] God modules and ad-hoc writers of shared state

- Category: structure
- Location: `app/algebra/algebra-ui.mjs` (4591 lines; `installAlgebra` at `:718` is one closure with 148 inner `function`s and 20 closure `let`s); `app/ui/ui.mjs` (1901 lines; `bootQdUi` is one closure feeding a `uiCtx` bag of about 40 injected functions)
- Claim: Four sites write `state.current` (`ui-solve.mjs:250,477`, `ui.mjs:1500,1628`), each with its own partial
  invariants. There are three copies of "reflect hData into state.poles/polyCoeffs": parseAndApplyHText, the
  Direct and slice hooks at `ui.mjs:1784` and `:1853`, which disagree on precision (UI-3), and one calls
  `setMode` where another calls `applyModeVisuals`. There are seven escape helpers with divergent fallbacks
  (`ui.mjs:345,391`, `direct-ui.mjs:759`, `ui-faber.mjs:26`, `ui-thesis.mjs:23`, `ui-qd-equations.mjs:31`,
  `param-slice-ui.mjs:851`; `algebra-ui.mjs:1190` falls back to _no_ escaping). The "verbatim extraction"
  factories kept the coupling and changed only where the closures come from.
- Evidence: counts measured with grep and awk.
- Confidence: high
- Prior review: the D1/D2 decomposition was reported earlier and is partly done.
- Fix: one `applyScenario({mode, hData, norm, source})` reflector, one `adoptSolution` writer (UI-9), and one
  exported `escapeHTML`. Split algebra-ui along its existing section boundaries (Prove, Reduce, Eliminate, drawer). (L)

### UI-13 [P3] Dead or stale UI and docs

- Category: stale-doc
- Location and claim:
  - `app/index.html:888-897` populates `#app-version` from `window.QD_ASSET_MANIFEST`, which was retired at the
    ESM flip (375185a). The label is always empty.
  - `app/index.html:872-878`: `#sw-update-banner` is never wired. `vite.config.mjs:36` uses
    `registerType:"autoUpdate"` and nothing references the banner ids.
  - `app/index.html:812-815` says the "CDN math/katex tags in <head> are parser-blocking". They are self-hosted now.
  - `app/test.html:24-26` loads `complex.js`, `taylor.js` and `solver.js`, all deleted. The page is dead, yet
    README:134 still advertises it.
  - `HELPTEXT.md` points at `app/ui-strings.mjs`, `app/ui-modes.mjs`, `app/ui-solve.mjs`, `app/thesis-examples.mjs`
    and `app/qol.mjs`. These now live under `ui/`, `analysis/` and `core/`.
  - `ARCHITECTURE.md:219` says "`ui.mjs` serializes"; it is `ui/ui-url-state.mjs`.
  - `lazy-features.mjs:10,39-50` keeps a `direct` loader keyed on a `tab-changed` id that no longer exists. It is
    harmless, since view-mode drives it.
- Evidence: grep and ls (measured). `ls app/complex.js` → "No such file".
- Confidence: high
- Prior review: new, apart from the header-staleness class noted in the 2026-08 review.
- Fix: delete or repoint. (S)

## Improvements

- **IMP-1: A reproducible link (carry φ and verify it).** Value: high, since a permalink is what gets cited in a
  paper or lecture note. The fix for UI-5 turns the link into a certificate: "this link reproduces φ to residual
  r". Cost M.
- **IMP-2: The figure carries its recipe.** Embed the permalink and the verdict in the exported PNG's text chunks
  (`cas:state`, via `@cas/export`, the key the suite documents), so a figure in a paper can be reopened. QD
  already writes PNGs (`ui-figure-export.mjs`). Cost S.
- **IMP-3: Schwarz and Parameter-slice state in the link** (a `sw`/`ps` sub-object: iterations, colormap, view,
  zoom, slice axes and ranges), with auto-capture on restore. Cost M.
- **IMP-4: Copy link says what it cannot carry.** When an alternate is selected, an algebra φ is shown, or an
  unparsed h sits in the box, the toast should say so ("link reproduces h, not the selected alternate #3").
  Cost S.
- **IMP-5: Tie the algebra session to its h.** Autosave keyed by a canonical h-hash, a "derivation for h = …"
  label, and one-click "load this h into the QD tab". This removes UI-8 and makes derivations shareable next to
  links. Cost S–M.

## Coverage

- Read closely: `ui-url-state`, `ui-state`, `ui-h-text`, `ui-copy-buttons`, the `ui.mjs` boot and cross-tab hooks
  (`:1530-1901`), `solveAndRender`, try-harder, alt search and the badge in `ui-solve`, `algebra-autosave` plus
  its wiring, the seeding, `ensureSeed`, ✦ Prove and the "View in QD plot" parts of `algebra-ui`, the Schwarz tab
  lifecycle and capture, `main.mjs`, `lazy-features.mjs`, and the `index.html` shell and tab script.
- Skimmed only: `ui-domain-plot`, `ui-figure-export`, `ui-qd-equations`, `ui-thesis`, `ui-faber`, `direct-ui`,
  `param-slice-ui`, `sphere-ui`, `algebra-canvas`, `algebra-results-drawer`, `algebra-picker`, `domain-mini-plot`,
  and most of `algebra-ui` outside the paths named above (its verdict wording belongs to the algebra slice).
  `style.css` was not reviewed.
- Not run: the full QD vitest project, the browser suite, and a real-browser boot. UI-2, UI-6 and UI-9 are code
  inferences that a browser pass should confirm. Git history is shallow locally (99 commits), so the legacy format
  came from GitHub (`e94af769`, `d15f944`).
