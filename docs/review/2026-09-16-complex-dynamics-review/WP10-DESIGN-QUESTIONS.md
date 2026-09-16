# WP10 — the three design questions, with measurements

[WP10](REMEDIATION-PLAN.md) is the shell-UX package of the Complex Dynamics remediation plan. Three of
its changes are judgement calls rather than defect fixes, so they need a decision before the package is
written. This document states each question, gives the measured evidence, lays out the options with
what each costs and breaks, and recommends one.

Everything below was measured against the built app in headless Chromium (SwiftShader WebGL2) at
1440 × 900 and 1280 × 720, or computed in node. No estimates.

---

## Q1 — What should the app open on?

### What is wrong now

The default is `c = −0.7 − 0.4i`. **It is not in the Mandelbrot set.** The critical orbit escapes at
iteration 10, so the dynamical plane opens on a Cantor dust: a scatter of filaments with no interior
anywhere. Measured over the app's own default dynamical window (centre 0, zoom 0.65):

| default                | in M? | attracting cycle      | interior, % of the default view |
| ---------------------- | ----- | --------------------- | ------------------------------- |
| **current, −0.7−0.4i** | no    | — (escapes at n = 10) | **0.0 %**                       |

Three things follow, and all three are visible in the first screenshot a new user sees:

1. **The legend contradicts the picture.** The dynamical plane's key shows a black swatch labelled
   "filled Julia set" pointing at an interior that does not exist at this `c`.
2. **The coupling is not demonstrated.** The app's whole idea is that the left plot chooses `c` and the
   right plot shows its dynamics. Opening on a dust shows one half of the dichotomy and never hints
   there is another.
3. **Nothing on screen says the set is disconnected** until you open the Julia-properties panel.

### A warning that changes how this is decided

I tested the parameters people reach for when they want "a nice Julia set". **Most classic ones are
deliberately just outside M** — that is exactly why they look spectacular — and would reproduce the
current bug:

| candidate                       | in M?  | cycle                | interior % |
| ------------------------------- | ------ | -------------------- | ---------- |
| −0.7 + 0.27015i                 | **no** | escapes at n = 95    | 0.7 %      |
| −0.8 + 0.156i                   | **no** | —                    | 4.2 %      |
| 0.285 + 0.01i                   | **no** | —                    | 0.0 %      |
| −0.4 + 0.6i                     | **no** | —                    | 0.7 %      |
| −0.1 + 0.651i                   | **no** | —                    | 6.1 %      |
| **rabbit, −0.122561+0.744862i** | yes    | period 3, λ = 0      | **13.6 %** |
| **basilica, −1**                | yes    | period 2, λ = 0      | **14.7 %** |
| period-4 centre, −1.3107        | yes    | period 4, λ = 0      | 4.2 %      |
| c = i (dendrite)                | yes    | preperiodic, λ = 5.7 | 0.0 %      |

`−0.7 + 0.27015i` is the value I recommended in the first draft of the plan. It escapes at n = 95. I
had not measured it. Whatever is chosen, **WP10 pins it with a test** that asserts the critical orbit
stays bounded and the interior fraction is above 10 %, so a future edit cannot quietly reintroduce this.

### Options

**A — the Douady rabbit, `c = −0.122561 + 0.744862i`.** Period 3, superattracting, 13.6 % interior.
Sits in the 1/3 bulb on the upper edge of the main cardioid, plainly visible in the default parameter
view. _For:_ it is already this app's flagship parameter — the external-angle panel snaps 1/7 to it, the
Yoccoz puzzle documentation uses its α triangle {1/7, 2/7, 4/7}, and the lamination README uses it as
the worked example. Period 3 is visually interesting (three lobes) and still instantly readable. The
white point sits where a small drag crosses ∂M, so the dichotomy is one gesture away. _Against:_ the `c`
input opens with an eight-digit value rather than a round number.

**B — the basilica, `c = −1`.** Period 2, superattracting, 14.7 % interior (the most of any candidate).
Sits on the real axis in the big circular bulb, the single most recognisable feature of M after the
cardioid. _For:_ the simplest possible `c` to read and to type; the largest interior; the period-2 story
is the easiest first lesson. _Against:_ less visually striking; a drag along the real axis to −2 passes
through a lot of structure but the picture stays symmetric, so the "watch it change" effect is weaker.

**C — keep the dust; fix the legend instead.** Leave `c = −0.7 − 0.4i` and make the legend honest: when
connectivity reports disconnected, the swatch reads "Julia set (no interior)" and the caption says so.
_For:_ zero change to anyone's muscle memory or to the app's existing screenshots; closes the strictly
false part of the finding. _Against:_ the app still opens on its least representative picture, and the
coupling still is not demonstrated. This fixes the lie, not the first impression.

**D — A or B, plus a first-run parameter-plane nudge.** The chosen default, and the onboarding card
gains one line: "drag the white point outside the black set and watch the right plot shatter." _For:_
turns the default into the lesson. _Against:_ one more sentence on a card people dismiss.

### Recommendation

**A (the rabbit), with C's legend fix landing anyway.** The legend must stop claiming an interior that
is absent regardless of the default, because a user can always drag to a dust — that part is a defect,
not a preference. The rabbit is the better default because the app already treats it as its canonical
example everywhere else, so the default view and the documentation would finally agree.

### A sub-question that comes with it

The same `c` is printed three ways on screen at once: the caption says `c = −0.7 − 0.4i`, the overlay
label says `c=-0.7-i*0.4`, and the input holds `-.7-.4*i`. WP10 routes all _display_ through one
`formatComplexDisplay` (the input keeps the parseable form, which must stay). **No decision needed** —
this is a defect — but say if you want a particular convention (`a + bi` vs `a + i·b`).

---

## Q2 — What shape should the sidebar be?

### What is wrong now

Measured, default disclosure state, nothing opened:

| viewport   | sidebar width | sidebar scroll height | as screens | groups | open by default |
| ---------- | ------------- | --------------------- | ---------- | ------ | --------------- |
| 1440 × 900 | 346 px        | **2,091 px**          | **2.3**    | 15     | 1               |
| 1280 × 720 | 307 px        | **2,127 px**          | **3.0**    | 15     | 1               |

Eighteen top-level sections in one flat column, holding 59 inputs, 9 selects and 64 buttons. The page
has 292 focusable elements. The order is the order things were built in, so:

- The **Point inspector** sits at the very top with its Siegel-`c`, Misiurewicz and Pin-note inputs
  _visible before anything has been inspected_ — controls that act on a report that is not there yet.
- **Seven** of the fifteen collapsible groups are `z²+c`-only instruments (external angle, angles of a
  point, component data, Yoccoz, lamination, symbolic console, mating), and one more is rational-only
  (Herman ring). For any other `f` that is half the sidebar, fully enabled, toasting only on use.
- The **citation block and BibTeX** sit below "Save & animate", so the last thing in the scroll is
  boilerplate.
- Everything is peers: `coloring` (changes every pixel) has the same visual weight as
  `Component data (z²+c)`.

### Options

**A — Tabs.** Five tabs across the top of the pane: _Function · Look · Precision · Instruments ·
Studio_. Each tab is one screen or less.

- _For:_ collapses 2.3 screens to under 1; puts the `z²+c` instruments behind one door that can carry a
  single visible gating line ("needs f = z²+c — current f: …") instead of seven; gives the phone sheet
  an obvious structure.
- _Against, and this is the serious one:_ **tabs hide state, and in this app state changes the
  picture.** Anti-aliasing, refine-while-idle, perturbation, relief lighting, auto-iterations and the
  colouring mode all silently alter what is rendered. A user on the _Instruments_ tab cannot see that
  perturbation is on and is degrading their colouring mode to discrete escape — which is report finding
  S4, made structurally worse. Mitigable with a status strip that shows active non-default settings,
  but that is more work and more surface.
- _Cost:_ **L.** New markup, CSS, roles (`tablist`/`tab`/`tabpanel`), keyboard support, a tab in
  `ShellState` (or deliberately not, and then a share link cannot restore which tab), the mobile sheet,
  and rewriting whatever WP3's shell test asserts about panel structure.

**B — Two-level grouping, still one scroll.** Keep the `<details>` accordion but nest it under four
non-collapsing section headers with rules between them: _Function · Appearance · Precision &
Instruments · Studio & Export_. Reorder so the inspector's action inputs move into the inspector report
(WP10 does that anyway), the instruments sit together, and the citation moves to the footer.

- _For:_ everything stays visible and scannable, so no setting can hide; a third to a half of the
  height comes off through reordering and the citation move; roughly a tenth the risk of A.
- _Against:_ still a scroll — better organised, not shorter in kind.
- _Cost:_ **M.** Markup and CSS only; no new state; existing tests unaffected.

**C — Keep flat, add a filter box.** One text input at the top of the pane filters groups by name, plus
an "only what applies to this `f`" toggle that collapses the inapplicable instruments.

- _For:_ cheapest real improvement; helps most at the moment of actual pain (hunting for a control).
- _Against:_ a search box over 15 groups is a workaround for an ordering problem; discoverability by
  browsing does not improve.
- _Cost:_ **S.**

**D — Do nothing structural.** Only fix the two placement defects: move the inspector's action inputs
into the report, and move the citation to the footer.

- _For:_ closes the sharpest part of the finding for almost nothing.
- _Against:_ leaves 2.3 screens of flat list.
- _Cost:_ **S**, and it is a subset of B, so it is not wasted work if you later want B.

### Recommendation

**B, with D as its first commit.** Tabs are the tempting answer and the wrong one _for this app_
specifically: its settings change the rendered picture, and A makes the already-real problem of silent
state changes worse. B buys most of the benefit at a fraction of the risk, and if you later want A, B's
grouping is exactly the tab boundary, so nothing is thrown away.

If you would rather have A, it is a defensible call — but then S4 (visible reasons for silent mode
changes, WP8) should ship **before** it, and A should carry a persistent "active settings" strip.

---

## Q3 — Should the σ view stay a full takeover?

### What is wrong now

Entering the Schwarz-reflection view sets `.workspace.schwarz-active`, which hides `#param-plot`,
`#dyn-plot` **and** `.controls-pane` (`src/styles/main.css:450-458`). The σ pane is substantial in its
own right: 681 lines of markup, 13 control groups, 28 inputs, 9 selects, 28 buttons.

**It contradicts its own ADR.** [ADR-0009](../../DECISIONS.md#adr-0009-schwarz-reflection-is-a-first-class-peer-view-in-complex-dynamics)
decided σ would be "a Schwarz-reflection pane **alongside** Parameter Space and Dynamical Plane, with
its own canvas, its own controls section, and its own persistent lifecycle". The shipped view hides
both of the planes it was meant to sit alongside.

Separately, three concrete defects ride on the takeover, and these are **not** preferences:

1. **The mobile "Controls" button is dead in σ mode.** The pane it opens is `display: none`, but the
   floating button lives at body level and stays visible. Tapping it does nothing.
2. **Every σ analysis overlay is dropped from share links** — orbit family, level curves, cycles,
   forward curves, limit set, preimage tree are all marked transient (`main.ts:3123-3160`). A
   researcher shares exactly the thing they built and it arrives empty.
3. **Re-entering always regenerates from the builder fields**, discarding the σ window you had.

### What a third pane would cost, measured

| viewport   | plots pane | two panes (today) | three panes     |
| ---------- | ---------- | ----------------- | --------------- |
| 1440 × 900 | 999 px     | 492 px each       | **322 px each** |
| 1280 × 720 | 878 px     | 431 px each       | **282 px each** |

A 282-px fractal on a 1280-wide laptop is not a usable instrument. **This rules out showing all three
planes at once** at any realistic width, so that option is dropped rather than offered.

### One thing worth knowing before choosing

σ's map comes from its own φ recipe. **It is not a function of `c` or of the app's `f`.** So "peer" here
cannot mean "linked, watch it update as you drag `c`" the way the two existing planes are linked. It
means a third independent dynamical system sharing the app's engine, colouring and export. That weakens
the case for keeping the other planes on screen: there is nothing to watch co-vary.

### Options

**A — Keep the takeover; fix the three defects.** σ stays full-screen. The mobile button is hidden in
σ mode (or opens the σ controls). The σ overlays move into `schwarzState` so links carry them.
Re-entry restores the previous σ session unless the builder fields changed.

- _For:_ fixes everything that is actually broken; the takeover is defensible on its own terms, since
  in σ mode the sidebar's `f`, presets, colouring and `z²+c` instruments are all irrelevant, and the app
  bar (Theme, Glossary, Share, Views, Profiles) stays visible throughout.
- _Against:_ leaves ADR-0009's "alongside" promise unmet; you still cannot compare σ with a Julia set.
- _Cost:_ **S.**

**B — True peer: σ replaces the dynamical plane.** Parameter plane and sidebar stay; σ takes the right
half. A segmented control on the right pane switches _Dynamical plane | Schwarz σ_. σ's 13 control
groups go into the sidebar as a section that appears in σ mode.

- _For:_ delivers ADR-0009 as written; at 1440 both panes keep their current 492 px; you can hold a
  Julia set and a σ field side by side.
- _Against:_ the two panes are _not_ coupled (previous section), so the arrangement implies a
  relationship that is not there; the sidebar must host two disjoint control sets; more state in the
  permalink.
- _Cost:_ **M**, and it lands on top of A's three fixes rather than instead of them.

**C — Takeover, but keep the sidebar,** with σ's controls rendered into it.

- _For:_ the smallest change that fixes the mobile button honestly (the pane exists, so the button
  works) and keeps global controls reachable.
- _Against:_ the sidebar in σ mode would show `f`, presets and the `z²+c` instruments, none of which
  apply — so it either shows irrelevant controls or needs the same conditional rendering as B, at which
  point B is the better buy.
- _Cost:_ **S–M.**

### Recommendation

**A.** It closes all three real defects for a small cost, and the takeover is genuinely defensible once
you know σ is not coupled to `c`. ADR-0009's "alongside" wording should then be **narrowed by a short
follow-on note** rather than left contradicted — the shipped shape is a reasonable reading of "first
class, own lifecycle, own controls, serialisable", and the plain reading of "alongside" is the part that
did not survive contact with the width budget.

Choose **B** instead if being able to see a Julia set and its σ together is something you actually want
to do; the width budget allows it, and it is the only option that does.

---

## Summary

| #   | question     | recommended                                | cost | the deciding evidence                                                      |
| --- | ------------ | ------------------------------------------ | ---- | -------------------------------------------------------------------------- |
| 1   | default view | **A** rabbit, + C's legend fix regardless  | S    | current default escapes at n = 10; 0.0 % interior                          |
| 2   | sidebar      | **B** grouped accordion, D first           | M    | 2.3–3.0 screens, 15 groups, 1 open; tabs would hide picture-changing state |
| 3   | σ view       | **A** keep takeover, fix the three defects | S    | three panes give 282 px each at 1280; σ is not coupled to `c`              |

Each recommendation is reversible and none blocks the other eleven work packages. If you pick
differently on any of them, only WP10 changes — WP1–WP9, WP11 and WP12 are unaffected.
