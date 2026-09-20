# A7 — App shell: Inverse-tab UI, state, presets, URL state, figure export, strings, and the two cross-app hand-offs

## Scope covered

**Read end to end:** `app/index.html`, `app/main.mjs`, `app/lazy-features.mjs`, `app/ui/*.mjs`
(all 19; `ui-solve.mjs` read for its DOM/render half only — A5 owns its state machine),
`app/schwarz/schwarz-export.mjs` (the whole hand-off producer) and the hand-off call sites in
`app/schwarz/schwarz-ui.mjs:526-630`, `vite.config.mjs`, `public/`,
`packages/interchange/src/{schema,viewstate,validate,goldens}.ts`, and — far enough to check the
contract — `apps/hele-shaw-flow/src/{importHeleShaw,heleShawOnePoint}.ts` and
`apps/complex-dynamics/src/interchange/importMap.ts`. Docs: `HELPTEXT.md`, `TODO.md`,
`ARCHITECTURE.md` §"URL/hash state (B1)", `README.md` file index. Tests read: `vitest/ui-*.test.ts`
(5), `vitest/qd-url-state.test.ts`, `vitest/browser/boot.browser.test.ts`,
`app/test/h-text-roundtrip.test.js`.

**Ran in headless Chromium** (built `dist/`, `python3 -m http.server`, Playwright +
`/opt/pw-browsers/chromium`, SwiftShader): a full 10-mode × 41-preset solve sweep with an
encode→reload→re-solve round trip on every one (82 page loads); all four tabs at 1440×900 and
390×844; the accessibility tree over CDP `Accessibility.getFullAXTree` on 8 page states; four
fatal-path variants (no `Worker`, no `localStorage`, no WebGL2, baseline); the figure PNG export
(downloaded and chunk-parsed) and the clipboard copy; all four copy buttons; and the three
hand-off buttons on six domains, decoding the produced links and running the real consumers.

**Not covered honestly:** the Schwarz/param-slice/algebra tab UIs beyond boot + a11y + their export
buttons (out of my scope, and A3/A4 own them); `ui-domain-plot.mjs`'s drawing internals below the
chrome cache and hit-test; the drag-precision question (I checked hit-testing is screen-space and
correct under zoom, but did not measure drag round-off); `parse-check.test.js`; the PWA
update-UX hazard is reported from code + the built `sw.js`, not from a staged two-deploy experiment.

## Health

| command | result |
|---|---|
| `pnpm --filter quadrature-domains build` | exit 0, `dist/` 3.9 MB assets |
| Boot at 1440×900 and 390×844, 4 tabs each | **0 console errors, 0 warnings, 0 pageerrors, 0 failed requests** |
| CDP `Accessibility.getFullAXTree`, 8 states | 77 / 87 / 46 / 43 interactive nodes, **0 unnamed** in every state |
| Horizontal overflow | `scrollWidth == clientWidth` at 1440 **and 390** — no phone-width overflow |
| Preset sweep, 10 modes × 41 presets | 40/41 solve; `lqd-s-thm-562` reports `⚠ Quadrature identity not satisfied` (honest, and it is the "dial q" preset at q = 0) |
| `vitest run` on the 9 UI/export/hand-off specs | **131 passed** — green with UI-1 present (see Tests) |
| `git status --short` at finish | empty |

---

## Findings

### UI-1 [HIGH] [confirmed] A pure-polynomial `h(w)` is corrupted by `parseAndApplyHText`, so every poly-part preset's share link (the deltoid included) opens as "No quadrature domain found"

- **Where:** `app/ui/ui-h-text.mjs:119-122` (the placeholder row) → `app/ui/ui.mjs:240-269`
  `buildHData` (no zero-residue filter) → `app/ui/ui-url-state.mjs:160-163` (`applyUrlState` step 3
  calls `parseAndApplyHText`) and `app/index.html:186` (the **Parse** button).
- **What:** When `QD.parseH` returns no finite poles — i.e. `h` is a pure polynomial —
  `parseAndApplyHText` writes a placeholder grid row `{a:'0', order:1, residues:['0']}` "so the user
  can extend it". `buildHData` passes every grid row to the solver verbatim, so that placeholder
  becomes a **real order-1 quadrature node at the origin** with residue 0. For an unbounded family
  (0 ∉ Ω̄) the system is then unsolvable. Five shipped presets are pure-polynomial —
  `unb-deltoid` (h = w²), `upqd-const-a2` (h = 0.3), `upqd-mono-a2` (h = w), `upqd-mono2-a2`
  (h = 0.9w²), `upqds-mono-a2` (h = 1) — and all five are hit. The same defect fires on the plain
  **Parse** button, so typing `w^2` by hand is equally broken.
- **Evidence:** sweep of 41 presets, each solved then reloaded from its own `#vs=` hash
  (`scratch/A7/sweep.mjs`, `sweep.json`): exactly those 5 regressed, every other preset round-tripped
  to an identical badge and geometry block. Isolated with `scratch/A7/ctrl2.mjs` — after pressing
  Parse on the *identical* text, the **only** state field that changed is `poles`:

  ```
  A preset:  poles=[]                                   _ok=true
  B parsed:  poles=[{a:"0",order:1,residues:["0"]}]      _ok=false
    DIFF poles [] -> [{"a":"0","order":1,"residues":["0"]}]
    DIFF _ok  true -> false          (mode, c, polyDegree, polyCoeffs, w0Mode, q, alpha, agg all identical)
  ```

  **Negative control both directions** (`scratch/A7/ctrl3.mjs` — remove/replace the row, forcing a
  full re-solve through `#aggressiveness`, which does not touch `state.poles`):

  ```
  1 preset            poles=[]                                ok=true
  2 after #h-parse    poles=[{a:"0",order:1,residues:["0"]}]   ok=false
  3 poles=[] resolve  poles=[]                                ok=true      <- recovers
  4 placeholder back  poles=[{a:"0",...,residues:["0"]}]       ok=false     <- fails again
  ```

  The user-visible text on the failed reload is *"No quadrature domain found. Suggestions: try the
  'Try harder (exhaustive search)' button or raise Aggressiveness; move poles away from each other
  and the boundary…"* — advice about poles the user never entered.
- **Why it matters:** The deltoid is CLAUDE.md's named ground-truth milestone and the headline of
  the QD → CD σ hand-off (`QD_TO_CD_DELTOID_SIGMA_LINK`). Its share link does not reproduce it, so a
  reader who follows a deltoid link cannot capture φ and cannot export σ at all. It also breaks the
  CLAUDE.md guardrail "preserve or migrate each app's existing share-link URL formats" in the
  strongest form: the link is well-formed, is accepted, and quietly yields a different (empty)
  result. Status-panel honesty is *not* violated — `updateStatusPanelVisibility` correctly hides the
  ✓ badge and `#fig-univalence-note` reverts to "No solved boundary yet" (measured,
  `scratch/A7/fail-ui.mjs`).
- **Fix:** smallest correct change is in `buildHData` (`ui.mjs:241-253`): skip a pole whose whole
  principal part is exactly zero — a zero residue is not a quadrature node, and this also covers a
  user who types `0/(w-1) + w^2`. Guarding only the insertion
  (`if (parsed.poles.length === 0 && !polyCoeffs.length)`) fixes the five presets but leaves the
  hand-typed case. Pin it by **verdict**: extend `app/test/h-text-roundtrip.test.js` past the
  engine layer — for each preset, run `formatH → parseAndApplyHText → buildHData` and assert the
  resulting `hData` equals the preset's own, which is the layer its existing assertions stop one
  short of (see Tests).
- **Prior:** new.

---

### UI-2 [HIGH] [confirmed] [cross-app] The QD → Hele-Shaw hand-off is under-determined for a negative charge: QD and Hele-Shaw pick different roots of the same quartic and draw domains 32 % apart in area

- **Where:** producer `app/schwarz/schwarz-export.mjs:340-372` (`hDataToMapSpec` /
  `buildHeleShawEnvelope` carry only α and w₀) and `:413-427` (`explainHeleShawUnavailable`);
  consumer `apps/hele-shaw-flow/src/importHeleShaw.ts:32-63`; the branch choice
  `apps/hele-shaw-flow/src/heleShawOnePoint.ts:64-85` (`realRootGeq1`, `physical[0]`).
- **What:** The shipped preset `unb-1pt-neg` (h = −0.5/(w−2), c = 0.7) sits in a region where the
  Eq-3.11 quartic `c²z₀⁴ − 2c z₀³ − α z₀² − 2c z₀ + 4 = 0` has **two** roots ≥ 1 and **both** pass
  the thesis's secondary selector `φ(1) < w₀`. QD's solver returns z₀ = 2.2538537169, Hele-Shaw's
  `realRootGeq1` returns the smaller z₀ = 1.8477597125 (it takes `physical[0]`). The two are
  genuinely different domains: π-normalized areas **t = 0.4549 vs 0.3438** (32 % apart), min |φ′| on
  |z| = 1 of 0.2138 vs 0.5845, and φ values differing by up to **37 % relative** on |z| ≥ 1.
  `heleShawOnePoint.ts:62` states the selector "disambiguates when several roots ≥ 1 exist" —
  measured, here it does not.
- **Evidence:** QD's own φ read out of the live app and compared against `onePointMap(α, c)` in node
  (`scratch/A7/handoff.mjs` + `hs.ts`). Two of three classical presets agree to float precision, the
  third does not:

  ```
  unb-1pt-pos  α=1     c=2    QD z0 1.3282927327  HS z0 1.3282927327  worst rel 3.6e-14
  unb-1pt-imag α=i     c=0.8  QD z0 2.1364845260  HS z0 2.1364845259  worst rel 6.5e-11
  unb-1pt-neg  α=-0.5  c=0.7  QD z0 2.2538537169  HS z0 1.8477597125  worst rel 3.7e-01   <-- 37%
  ```

  **Both are real quadrature domains**, so this is a branch choice and not a solver bug on either
  side — checked independently of both apps by evaluating the QD identity as a boundary integral
  (`scratch/A7/qdid.mjs`, g = 1/(w−b)², b = 0, 200 000-point trapezoid):

  ```
  HS z0=1.84776   I/pi = -0.125000000049   alpha*g(w0) = -0.125   ratio 1.000000000
  QD z0=2.25385   I/pi = -0.125000000019   alpha*g(w0) = -0.125   ratio 1.000000000
  ```

  **Boundary of the defect** (`scratch/A7/scan.mjs`, c ∈ [0.05, 3.0] step 0.01): the ambiguity is
  confined to a negative charge — `α = +1` and `α = +0.5`: 0/296 ambiguous c-values; `α = −0.25`:
  14/296 (c ∈ [0.99, 1.12]); **`α = −0.5`: 29/296 (c ∈ [0.05, 0.75]) — the shipped preset's c = 0.7
  is inside it**; `α = −0.75`: 40/296. (`α ≤ −1` fails admissibility, correctly.)
- **Why it matters:** Hele-Shaw's twist page labels this family closed-form `=` (its own header:
  "Everything here is CLOSED FORM (`=`)"). Two exact closed forms for the same declared datum, with
  the consumer silently choosing the other one, is the honest-labelling guardrail failing across the
  wire. `QD_TO_HELESHAW_LINK` pins only the recovered (α, w₀), so no test in either repo can see it.
- **Fix:** carry the branch. The cheapest correct wire change is to add the prevertex (or
  equivalently the conformal radius c and the prevertex sign) to the `quadrature-domain` payload —
  it is already on `phi.branches[0].z`, which the envelope **already carries and the consumer
  already ignores**, so this needs no schema bump at all: `heleShawFromLink` should read
  `payload.phi.branches[0].z` and seed `solveZ0`'s Newton from it (the function already takes a
  `seed`). Second, replace `physical[0]` with an explicit refusal when `physical.length > 1` and no
  seed was supplied. A golden should pin the `unb-1pt-neg` case end to end by the recovered z₀, not
  by α.
- **Prior:** new.

---

### UI-3 [HIGH] [confirmed] [cross-app] The four weighted UNBOUNDED families cross the wire as classical `form:"laurent"` maps; both consumers accept them, and nothing on the wire could refuse — *cross-ref WGT-1*

- **Where:** producer `app/schwarz/schwarz-export.mjs:31-41` (`phiToMapSpec` — no `phi.family`
  guard, unlike `boundedClassicalMapSpec` at `:57`); schema
  `packages/interchange/src/schema.ts:163-172`; consumers
  `apps/complex-dynamics/src/interchange/importMap.ts:48-74` and
  `apps/hele-shaw-flow/src/importHeleShaw.ts:32-63`.
- **What (consumer side — what A2 asked me to close):** I confirmed the producer emits and then ran
  the real consumers on the emitted links.
  **(i) Nothing on the wire names the weight.** The `quadrature-domain` payload carries
  `phi, bounded, conventions` and **`weight = undefined`**; the `schwarz-reflection` payload carries
  `sigma, conventions` with **`sourceDomain = ABSENT`**. `conventions` is `{area:"standard",
  contour:"standard"}` on all of them — the ADR-0006 tag is correct and therefore useless here: the
  wire is canonical, and the thing that differs is the *family*, not the convention.
  **(ii) Complex Dynamics accepts all four, silently.** `schwarzPhiFromMapSpec` /
  `schwarzEngineFromMapSpec` return `family: "unbounded"` and a working evaluator. Consumer-side
  error at z = 2, CD's reconstruction against QD's own `QD.evalPhi` on the same φ:

  | preset | QD family | CD φ(2) | QD φ(2) | rel |
  |---|---|---|---|---|
  | `upqds-1pt-a2` | `unboundedPQD_singular` | 0.4299015085 | 0.4207611943 | 2.2 % |
  | `upqd-1pt-a2` | `unboundedPQD` | 3.1008657157 | 3.5218550310 | **12.0 %** |
  | `lqd-u-1pt` | `unboundedLQD` | 0.1283143162 | 1.0340695530 | **87.6 %** |
  | `unb-1pt-pos` (control) | classical | 3.5438449694 | 3.5438449694 | 0 |

  **(iii) Hele-Shaw accepts three of four**, and the one refusal is an accident: `upqd-1pt-a2` is
  refused only because its node is 2.5 ("the twist engine is normalized to the node w₀ = 2"), not
  because it is weighted. `upqds-1pt-a2` (power-weighted, α = 2) is accepted with α = 0.5 and drives
  the **classical** Graven–Makarov family from the residue of a *power-weighted* quadrature identity.
  Hele-Shaw never reads `payload.phi`, so the wrong φ does not reach its picture — the wrong
  *reading of α* does. Sharpest consequence: the classical `unb-1pt-pos` and the log-weighted
  `lqd-u-1pt` both have h = 1/(w−2) and produce **indistinguishable imports** — same α = 1, same node,
  same driven area t = 0.96410291 at c = 1 — for two different QD families.
- **Evidence:** `scratch/A7/weighted.mjs` (drives the four families through
  capture → Export φ / Export σ / Send to Hele-Shaw; every one copies a link and reports success,
  none warns) and `scratch/A7/consumer.run.ts` (decodes each link, runs CD's real
  `schwarzEngineFromMapSpec` and Hele-Shaw's real `heleShawFromLink`), plus `scratch/A7/truth.mjs`
  for QD's own φ(2). Full transcript in `scratch/A7/weighted-links.json`.
- **Answer to (b) — does the schema have a seat?** Partly, and not enough. `QuadratureDomain.weight?:
  "unweighted" | "log" | "power"` exists (`schema.ts:167`, since 1.0.0) and QD has **never** emitted
  it. But three gaps remain even if it did: a PQD also needs **α**, for which there is no field; no
  `MapSpec` form can express a weighted φ at all (it is `(R#)^{1/α}` / `z·(r#)^{1/α}` / Blaschke-
  weighted, none of them Laurent), so a correctly tagged payload still carries no `phi` a consumer
  could rebuild; and `SchwarzReflection` has **no** weight field — only the optional `sourceDomain`,
  which QD omits.
- **Fix (the honest one is to refuse, not to serialise):** mirror `boundedClassicalMapSpec`'s
  `phi.family` guard into `phiToMapSpec`, and extend the three explainers to name the reason with the
  sentence the BOUNDED branch already uses ("weighted (log-/power-weighted) … not reconstructable
  yet"). Then, as defence in depth — because a link outlives the build that minted it — emit
  `weight` on every `quadrature-domain` payload (optional field, no schema bump) and have
  `heleShawFromLink` refuse `weight !== "unweighted"`; a producer-side guard alone cannot protect a
  consumer from links already in the wild.
- **Prior:** new here; the producer half is A2's WGT-1 (not re-derived).

---

### UI-4 [MEDIUM] [confirmed] The exported figure PNG carries no reproducibility metadata at all — QD is the one figure-producing app not on `@cas/export`

- **Where:** `app/ui/ui-figure-export.mjs:253-273` (`exportPng`).
- **What:** The "Figure & export" card exists to make publication figures, and the downloaded PNG
  contains **IHDR + IDAT + IEND and nothing else** — no `tEXt`, no `iTXt`, no `zTXt`. No h(w), no
  mode, no permalink, no `Software` string. `@cas/export` (the PNG text-chunk reproducibility
  package) has **seven** consumers per CLAUDE.md and QD is not one of them; QD is also the app whose
  figures are most likely to end up in a thesis.
- **Evidence:** downloaded through the real button and chunk-parsed (`scratch/A7/actions.mjs`):
  `quadrature-domain-2074x1800.png, 125258 bytes, chunks: IHDR(13) IDAT(4096)×… ` →
  `metadata chunks: NONE`. The clipboard copy (same `renderToCanvas` path) is identical.
  The filename is `quadrature-domain-<W>x<H>.png` — two figures of different domains at the same
  export size collide.
- **Why it matters:** "Which h produced this figure?" is unanswerable from the file. CLAUDE.md's M6.3
  finding is exactly this in Contour Integration, resolved there by stamping `Software` + `cas:state`
  through `@cas/export`. This is the same gap with the same fix, and it is independent of QD's
  deliberate non-adoption of `@cas/ui` (ADR-0032) — `@cas/export` is a different package with no DOM
  surface.
- **Fix:** call `injectPngText` on the blob with `Software` and `cas:state` (the documented keys; QD
  already maintains `location.hash` continuously, so `cas:state` is one read away), and put the mode
  + a short preset/h slug in the filename. A test can assert the two keys round-trip through
  `readPngText`.
- **Prior:** new. Adjacent to `TODO.md:94` "#22 — PNG / SVG export · **PNG shipped**", which does not
  mention metadata.

---

### UI-5 [MEDIUM] [confirmed] The service-worker "new version available" banner is dead markup — nothing can ever show it, and a mid-session deploy silently breaks the lazy tabs

- **Where:** `app/index.html:877-883` (the banner) + `app/style.css:496-522` (its styles); **no JS
  anywhere in the repo references `sw-update-banner` / `sw-update-refresh` / `sw-update-dismiss`**.
  Loader: `app/lazy-features.mjs:17-31`; config `vite.config.mjs` (`registerType: "autoUpdate"`).
- **What:** The banner element and its CSS ship in every build; a repo-wide grep over
  `apps/**` + `packages/**` for those three ids returns only `index.html` and `style.css`. The comment
  beside it still says "PWA service-worker registration is added by vite-plugin-pwa **in a follow-up
  step**" — it was added. The generated `dist/registerSW.js` is the bare
  `navigator.serviceWorker.register('./sw.js')` form with no `updateSW` and no `updatefound`
  listener, and `dist/sw.js` carries `self.skipWaiting` + `clientsClaim`: a new SW therefore takes
  over the **open page** without reloading it. The page's JS is then the old build while the new
  precache has different content hashes, so a subsequent `import('./lazy/schwarz.mjs')` — the
  Schwarz / Param-slice / Algebra tabs are all demand-loaded — requests a hashed chunk that
  `cleanupOutdatedCaches()` has deleted and the server no longer has. `lazy-features.mjs:36-42`
  catches that rejection with `.catch(() => {})`, so the tab simply shows nothing.
- **Evidence:** `grep -rn "sw-update" apps/ packages/ --include=*.{mjs,js,ts}` → no hits outside
  `style.css`; `grep -o "skipWaiting\|clientsClaim" dist/sw.js` → one each; `cat dist/registerSW.js`
  → the one-line bare registration. The banner's own HTML comment states the intended trigger
  ("Hidden until an updated SW finishes installing while a previous version is in control"), which is
  precisely the event nothing listens for.
- **Why it matters:** Deploys are automatic on every push to `master`, so the window is real; the
  failure mode is a blank tab with a console line, which is the worst kind. And the app ships dead
  UI that a reader of `index.html` will reasonably believe is wired.
- **Fix:** either wire it (import `registerSW` from `virtual:pwa-register` with
  `onNeedRefresh` → unhide the banner, `#sw-update-refresh` → `updateSW(true)`; that also means
  dropping `registerType: "autoUpdate"` for `"prompt"`, which is what a banner is *for*), or delete
  the element, its CSS and the stale comment. Pick one; shipping both halves is the current state.
  Separately, `lazy-features.mjs`'s `.catch(() => {})` should surface *something* — a chunk that
  cannot load is not a no-op.
- **Prior:** new.

---

### UI-6 [MEDIUM] [confirmed] The domain plot canvas is invisible to assistive technology and has no keyboard path — the app's primary interactive surface

- **Where:** `app/index.html:768` `<canvas id="canvas">`; `app/ui/ui-domain-plot.mjs` (pointer
  handlers at `:172, :216, :268`).
- **What:** The canvas carries **no `tabindex`, no `role`, no `aria-label`, no `aria-hidden`**. It is
  therefore not in the accessibility tree at all — which is why my "0 unnamed interactive nodes"
  result is *not* a clean bill of health for it: it is absent, not named. It is also the app's main
  interaction: poles are dragged on it (`_hitTestPole`), it pans, it wheel-zooms, and the readout
  and the status badge are overlaid on it. There is no keyboard route to any of that.
- **Evidence:** `scratch/A7/fatal.mjs` probe →
  `canvasFocusable: {"tabindex":null,"role":null,"label":null,"hidden":null}` in all four runs;
  the CDP full AX tree (`scratch/A7/a11y.mjs`) lists 77 interactive nodes on the QD tab and the
  canvas is not among them.
- **Why it matters:** The other apps closed exactly this with `@cas/ui`'s
  `mountCanvas`/`attachCanvasA11y` (ADR-0032). QD is deliberately **not** a `@cas/ui` consumer and I
  am not proposing it adopt one — but the *gap* is the same one, and the remedy is ~15 lines of local
  code: `role="application"` (interactive) or `role="img"` (if keyboard control is out of scope for
  now), plus an `aria-label` and a generated description of the solved domain. The rest of the page
  audits clean (0 unnamed nodes across 8 states, no phone-width overflow), which makes this the one
  outstanding a11y item I found.
- **Fix:** minimum honest step is `role="img"` + an `aria-label` refreshed on each solve (piece
  counts, the validity verdict, the node positions) — the Contour-Integration M6.4 pattern of
  generating the description from the engine rather than hand-writing it. Keyboard pole-nudging is a
  larger follow-on.
- **Prior:** new.

---

### UI-7 [MEDIUM] [code] `#app-version` can never populate — the build/cache label is permanently blank

- **Where:** `app/index.html:759-764` and `:888-896` (the inline script reading
  `window.QD_ASSET_MANIFEST.CACHE_VERSION`).
- **What:** `QD_ASSET_MANIFEST` was produced by the `asset-manifest.js` generator, which
  `app/main.mjs:5-9` states was **retired at the Vite flip**. The global is now defined nowhere —
  `grep -rn QD_ASSET_MANIFEST app/ public/ vite.config.mjs` returns only the three `index.html`
  occurrences — so the inline script's `if (el && m && m.CACHE_VERSION)` never fires and the
  sidebar's version footer is always empty. Both the comment at `:759` ("populated from
  QD_ASSET_MANIFEST.CACHE_VERSION") and the one at `:889` ("asset-manifest.js is the first static
  `<script>`, so QD_ASSET_MANIFEST is already available here") describe a loader that no longer
  exists.
- **Why it matters:** the element's own stated purpose is to answer "which build are you seeing?"
  without DevTools — the exact question UI-5's stale-build hazard raises.
- **Fix:** replace with a Vite `define` (e.g. `__APP_VERSION__` from the package version + a short
  git sha) or delete the element and its script. One line either way.
- **Prior:** new.

---

### UI-8 [LOW] [confirmed] A share link or a reload always reports "— custom —", losing the preset's provenance

- **Where:** `app/ui/ui-h-text.mjs:155` (`ui.markAsCustom()` is called unconditionally at the end of
  `parseAndApplyHText`), reached from `app/ui/ui-url-state.mjs:160-163`.
- **What:** The URL carries `h` text but no preset id, and the restore path goes through
  `parseAndApplyHText`, which marks the config custom. So a "Cardioid" link reopens with the dropdown
  reading "— custom —" beside the cardioid's exact text.
- **Evidence:** `scratch/A7/ls.mjs`:
  `baseline {"presetSel":"cardioid","presetLabel":"Cardioid:  h = 1.5/w + 0.5/w²"}` vs
  `second-visit {"presetSel":"","presetLabel":"— custom —","h":"1.5/w + 0.5/w^2"}`.
- **Why it matters:** the preset labels carry the provenance (thesis example, A&S figure); a shared
  link is exactly where that label is worth keeping. Cheap, but it makes every shared link look like
  a hand-edit.
- **Fix:** carry the preset id in the view-state (`s.p`), and after the h-parse restore it and
  re-select the option if the text still matches `formatH` of that preset — matching on the *text*
  keeps the claim falsifiable rather than trusting the link.
- **Prior:** new.

---

### UI-9 [LOW] [confirmed] Blocked `localStorage` silently changes the first-visit domain

- **Where:** `app/ui/ui.mjs:1712-1721`.
- **What:** `firstVisit` is initialised `false` and set inside a `try`; when `localStorage` throws
  (private mode, blocked site data) the catch comment says "treat as returning", so a genuinely new
  user in private mode never gets the cardioid onboarding domain and lands on the bare unit disk with
  no console output of any kind.
- **Evidence:** `scratch/A7/ls.mjs` — baseline `presetSel: "cardioid"`, `h: "1.5/w + 0.5/w^2"`;
  with `localStorage` throwing, `presetSel: "unit-disk"`, `h: "1/w"`. The dropdown label *does* stay
  in step (it reads "Unit disk"), so nothing dishonest is shown — this is a degraded onboarding, not
  a wrong label.
- **Fix:** initialise `firstVisit = true` and let the catch leave it true (an unreadable store means
  "cannot know", and the cheap wrong answer is the welcoming one).
- **Prior:** new.

---

### UI-10 [LOW] [code] The boundary polyline is never re-sampled on zoom; past ~2× the default scale the "curve" is a visible polygon

- **Where:** `app/ui/ui-domain-plot.mjs:410-412` (`drawBoundary` consumes
  `this.data.boundaryPts` verbatim) and `:250-286` (wheel zoom clamps scale to `[1e-3, 1e7]`).
- **What:** `boundaryPts` is sampled once per solve in *world* space (`state.samples` = 500 base,
  plus up to 750 adaptive near a cusp). For the default cardioid that is 500 points over a perimeter
  of 7.9747, i.e. a mean spacing of **1.598e-2** world units. At the default scale of 100 px/unit
  that is 1.6 CSS px per segment, so **any** zoom past the default makes segments coarser than 2 px;
  at the clamp's 1e7 a segment is ~1.6e5 px. Nothing re-samples φ on a view change.
- **Evidence:** measured in the live app via `QD.sampleBoundary(phi, state.samples)`
  (`scratch/A7/zoom2.mjs`): `{"n":500,"perimeter":7.974731958728269,"mean":0.015981426770998536}`;
  the zoom clamp is read off the wheel handler and confirmed by `ui-url-state.mjs:196`
  (`Math.max(1e-3, Math.min(1e7, scale))`).
- **Why it matters:** the plot is the app's primary output and its figure export re-renders through
  the same points, so a zoomed publication figure of a cusp is a polygon. This is presentation, not
  mathematics — but a reader zooming to inspect a cusp is looking at exactly the region where the
  chord error is largest.
- **Fix:** re-sample on view change when the mean on-screen segment exceeds ~1.5 px, over the visible
  parameter interval only, reusing the existing adaptive sampler with a zoom-derived budget; cache
  per `(phi, view)` the way `drawStaticChrome` caches its layer.
- **Prior:** new.

---

### UI-11 [LOW] [confirmed] Prior finding, still open and still unverifiable here

Re-report of the Aug-17 review's **[LOW] "Share-link uses `#vs=` with no legacy-format fallback"**
(`docs/review/2026-08-suite-review/findings/07-quadrature-domains.md:150`) — **still open**.
`applyUrlState` reads only `decodeViewState` and returns `false` otherwise; there is no legacy
decoder. I could not close it either: this checkout is **shallow** (`.git/shallow` present,
`git rev-list --count HEAD` = 105), so the pre-monorepo QD source is not reachable and `git log -S`
over `apps/quadrature-domains` bottoms out at the `.js → .mjs` rename. Closing it needs the
pre-migration `QD_SRC` tree, not this repo.

---

## Structural observations

- **`buildHData` trusts the grid unconditionally** (`ui.mjs:241-253`). It is the single funnel from
  UI state into the solver, and it neither drops zero rows nor validates that a node lies where the
  family requires. UI-1 is the consequence; a filter there is one guard covering every entry path
  (preset, grid, h-text, share link, thesis example).

- **Two "can this φ be exported?" decisions are written twice, and only one has the family guard.**
  `boundedClassicalMapSpec` (`schwarz-export.mjs:57`) opens with
  `if (!phi || phi.unbounded || phi.family) return null;` while `phiToMapSpec` (`:31`) has no
  `phi.family` test at all. The file's own doc-comment for the bounded helper explains exactly why
  the guard is needed ("the classical families leave `phi.family` UNSET … so an untagged,
  non-unbounded φ … is exactly the partial-fraction bounded QD"), and the unbounded twin was written
  before that reasoning existed. The explainers then "defer the null-decision to the real builders …
  so this stays in lockstep" — which is a good discipline that propagates the omission verbatim into
  three user-facing messages (UI-3).

- **The hand-off drops data the envelope already carries.** `buildHeleShawEnvelope` serialises `phi`
  "for provenance / a future geometric cross-check", and `heleShawFromLink` discards it. That field
  is exactly the branch information UI-2 needs (`phi.branches[0].z` is the prevertex the consumer
  re-derives by root-finding). Better looks like: the consumer seeds `solveZ0` from the wire and
  *verifies* rather than re-deriving — the CD_TO_RM pattern of pinning both sides.

- **`ui.mjs` is still the hub for two unrelated things.** Post-split it is 1,901 lines, of which the
  genuinely central part is the `uiCtx` assembly (`:1546-1608`) and the rest is ~40 ad-hoc
  `addEventListener` blocks (`:1283-1500`) that each mutate one `state` field and schedule a solve.
  A table (`id → state key → coercion → solve|render`) would replace most of them and would have made
  the `#samples`-doesn't-re-solve / `#aggressiveness`-does asymmetry I tripped over explicit rather
  than discoverable.

- **`installCopyLink` copies `location.href`** (`ui-copy-buttons.mjs:18`) while `writeUrlState` is
  double-rAF-coalesced (`ui-url-state.mjs:66-76`). The two are 32 ms apart in the worst case, so a
  click within one frame of a control change copies the previous hash. This is the M6.2 finding in
  CLAUDE.md in a milder form (QD writes the hash at the *start* of the solve, so it reflects the
  inputs, not a stale result). Cheapest fix: have the copy callback flush the pending rAF first.

- **Dead-string scan: clean.** I loaded the real `QD.Strings` object (197 leaves) and matched every
  dotted path against the whole `app/` corpus — 7 apparent misses, all in `blurbs.*`, are reached by
  the dash-case→camelCase lookup in `thesis-examples.mjs:41-45`; I verified all 7 ids map to existing
  keys. No dead strings, and no `data-str*` key in `index.html` (41 of them) resolves to `undefined`.
  Reporting the negative because it is the kind of drift that is worth knowing is *absent*.

---

## Improvement proposals (core functionality)

1. **Make the share link reproduce the *solution*, not just the inputs — S.** Today the hash carries
   mode / h / gauges / tab / figure / view but **not `state.selectedSolutionIdx`**
   (`ui-url-state.mjs:80-96`). QD ships a preset whose entire point is non-uniqueness
   (`unb-2pt-nonuniq`, "Two-point non-uniqueness"), and the Alternates card lets the user view
   alternate branches — yet a link from an alternate reopens on the primary, with no indication.
   Add `s.sel` and restore it after the solve settles; refuse (name it) if the restored index exceeds
   the alternate count found on this machine, since the search is seeded and the count is not
   guaranteed reproducible. *Unlocks:* sharing a specific branch is the only way to discuss
   non-uniqueness in writing. *Prereq:* none. *Risk:* low (the refusal path keeps it honest).

2. **Carry the prevertex across the Hele-Shaw wire and verify on arrival — S/M.** UI-2's fix,
   stated as a capability: the consumer seeds from `phi.branches[0].z` and then checks
   `recoverCharge` against the wire's α, so a mismatch is reported rather than silently resolved.
   *Unlocks:* the negative-charge one-point family (a third of the shipped `unb-1pt-*` presets) can
   be handed off at all. *Prereq:* none — the field is already on the wire. *Risk:* low; it is
   strictly more information than today.

3. **Refuse weighted exports, then give the weighted families a wire of their own — M/L.** Stage 1 is
   UI-3's guard (hours). Stage 2 is the interesting one: a `form:"weighted-laurent"` MapSpec carrying
   `{alpha, inner: LaurentMap, weight: "power"|"log"}`, which is a faithful description of
   φ = z·(r#)^{1/α} and is what `@cas/schwarz` would need to reconstruct σ for a PQD/LQD.
   *Unlocks:* the σ dynamics of the *weighted* families — four of QD's ten modes, and the part of
   the thesis (Ch. 4–5) that Complex Dynamics currently cannot see at all. *Prereq:* stage 1, and a
   σ engine for the weighted branch in `@cas/schwarz` (ADR-0007: Correspondences would be the second
   consumer). *Risk:* medium — it is a real schema addition, so it wants an ADR.

4. **Stamp the figure with its own recipe — S.** UI-4's fix, framed as the capability: `Software` +
   `cas:state` via `@cas/export`, so any QD figure in a paper can be reopened. *Unlocks:* the
   reproducibility claim the Figure card implicitly makes. *Prereq:* none (`@cas/export` has no DOM
   surface, so QD's non-adoption of `@cas/ui` does not apply). *Risk:* none — additive chunks.

5. **A verdict-level round-trip test for the whole share-link path — S.** The existing
   `qd-url-state.test.ts` is 455 lines of careful *field* coverage over a stubbed
   `parseAndApplyHText`, and it is green with UI-1 present. Replace the stub with the real function
   over the real preset table and assert the rebuilt `hData` equals the preset's own, for all 41
   presets. *Unlocks:* the class of bug UI-1 belongs to — a link that is accepted and yields a
   different domain. *Prereq:* none. *Risk:* none.

---

## Documentation drift

| doc file:line | claims | reality (file:line) | severity |
|---|---|---|---|
| `TODO.md:40-43` | `- [ ] **#21 — URL state encoding**` — unchecked, in the **High priority** section | Fully implemented: `app/ui/ui-url-state.mjs` serialises mode / h / w₀ / c / α / q / aggressiveness / tab / figure diff / viewport through `@cas/interchange`'s `#vs=` codec. The neighbouring `#22` got a "**PNG shipped**" note; `#21` got none | MEDIUM |
| `app/ui/ui-strings.mjs:36` | "After editing ANY app/ file: run `npm run version:sync` (then lint + test)." | No such script — `package.json` has `test / test:browser / lint / lint:fix / typecheck / build / perf:measure / dev / preview`. `HELPTEXT.md:36-38` already records that "the old `version:sync` cache-versioning step was retired at the ESM flip"; this file was missed | MEDIUM |
| `HELPTEXT.md:5` heading + `:47-57` table, 5 of 7 rows | `app/ui-strings.mjs`, `app/ui-modes.mjs`, `app/ui-solve.mjs`, `app/thesis-examples.mjs`, `app/qol.mjs` | All five **do not exist**; the E2 folderization moved them to `app/ui/ui-strings.mjs`, `app/ui/ui-modes.mjs`, `app/ui/ui-solve.mjs`, `app/analysis/thesis-examples.mjs`, `app/core/qol.mjs`. Only the `ui/ui-domain-plot.mjs` and `algebra/algebra-ui.mjs` rows are right. (Verified by `test -f` on each) | MEDIUM |
| `app/index.html:885-886` | "PWA service-worker registration is added by vite-plugin-pwa **in a follow-up step**; the hand-rolled sw.js registration was removed for the ESM flip validation." | `vite.config.mjs` has had `VitePWA({ registerType:"autoUpdate", injectRegister:"auto" })` for some time; `dist/registerSW.js` and `dist/sw.js` are emitted | LOW |
| `app/index.html:759-761`, `:889-890` | `#app-version` is "populated from `QD_ASSET_MANIFEST.CACHE_VERSION`"; "asset-manifest.js is the first static `<script>`, so `QD_ASSET_MANIFEST` is already available here" | The generator was retired (`app/main.mjs:5-9`); the global exists nowhere. See UI-7 | LOW |
| `ARCHITECTURE.md:218` | "`ui.mjs` serializes the user-meaningful config … into `location.hash`" | It is `app/ui/ui-url-state.mjs` (`ui.mjs:1578` only installs it). The section's *contents* list is otherwise accurate and up to date, including `fig` and `view` | NIT |
| `ARCHITECTURE.md` (whole) | brief asked for "cross-tab contracts" and "namespace map" sections | No sections by those names; the nearest are §"Key cross-cutting contracts (P0/P1 work)" (`:161`) and §"Public `QD.*` surface" (`:130`). Both are current | NIT |

---

## Tests

**A vacuous-by-omission test that let UI-1 ship green.** `vitest/qd-url-state.test.ts` (455 lines,
25 `it`s) is careful and well-motivated — its header names the exact guardrail — but its harness
**stubs `parseAndApplyHText` with a call counter** (`:56, :80`). The codec's job is verified
field-by-field ("restores every field through write → apply", "every key the write side can emit is
consumed by the read side"), which is precisely the *field equality, not verdict* posture CLAUDE.md's
M6.2 finding warns about. The defect lives one layer below the stub, so all 25 pass.

Confirmed rather than argued — the whole UI/export/hand-off set is green on the clean tree with UI-1
present:

```
$ pnpm --filter quadrature-domains exec vitest run \
    vitest/qd-url-state.test.ts vitest/ui-boot-seam.test.ts vitest/ui-domain-mode.test.ts \
    vitest/ui-domain-plot.test.ts vitest/ui-geometry.test.ts vitest/ui-solve-orchestration.test.ts \
    vitest/figure-export-ui.test.ts vitest/schwarz-export.test.ts vitest/schwarz-handoff-link.test.ts
 Test Files  9 passed (9)
      Tests  131 passed (131)
```

**The guard that stops one layer short.** `app/test/h-text-roundtrip.test.js` exists *for this exact
class of bug* — its header says the previous instance was "opening any of their share links silently
dropped the whole quadrature datum" — and it checks `formatH → QD.parseH` at the **engine** layer
(`:64-77`), asserting `res.polyCoeffs.some(nonzero)` survived. For a pure-polynomial preset
`res.poles` is `[]`, which is correct at that layer; the placeholder row is added afterwards, in the
UI layer the test never reaches. Extending it by one call — `parseAndApplyHText` then `buildHData`,
compared against the preset's own `hData` — would have caught UI-1 and would catch the next one.

**Coverage gaps that matter.**
- Nothing exercises the share-link path **by verdict**. 41 presets round-tripped in a browser took
  ~8 minutes; a node-level equivalent over `formatH → parseAndApplyHText → buildHData` would be
  seconds and would be strictly stronger than the current field diff.
- `QD_TO_HELESHAW_LINK` pins the wire format and the recovered `(α, w₀)` and **nothing geometric**.
  No test compares QD's solved φ to Hele-Shaw's `onePointMap` at the same charge — which is why UI-2
  (a 37 % φ disagreement on a shipped preset) is invisible to both suites. The CD hand-off does
  better: `QD_TO_CD_DELTOID_PHI_AT_2 = 2.125` pins a value on both sides. The Hele-Shaw golden should
  pin z₀ or the area t the same way.
- No test asserts an exported PNG's metadata (there is none to assert — UI-4), and none asserts that
  the SW update banner is reachable (it is not — UI-5).
- `vitest/browser/boot.browser.test.ts` (7 `it`s) does pin the two copy-button lifts and "boots with
  no console.error", which matched my measurement exactly (0 errors across 8 page states). It does
  not touch the canvas's accessibility attributes, which is where UI-6 hides.

**Positive controls worth recording**, so the boundaries of the above are known: the same sweep that
found UI-1's five failures round-tripped the other 36 presets to a byte-identical badge and geometry
block; the same φ comparison that found UI-2's 37 % gap agreed to 3.6e-14 and 6.5e-11 on the other
two classical one-point presets; and the same CDP audit that found the canvas absent found **0
unnamed interactive nodes** in all 8 states, at both viewport widths.
