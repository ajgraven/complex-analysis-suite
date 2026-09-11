# Interaction & presentation design for `apps/contour-integration`

Research track 7. Surveyed 2026-09-10. Primary sources read, not skimmed; every rule below is
tied to evidence and every anti-pattern names the thing that failed. Companion to
[`01-prior-art-tools.md`](01-prior-art-tools.md) (which supplies the incumbent's failure modes) and
[`02-pedagogy-misconceptions.md`](02-pedagogy-misconceptions.md).

---

## 1. What the explorable-explanation canon actually says

Victor's *Explorable Explanations* names three patterns, and only three: **reactive documents**
(the reader plays with the author's assumptions and sees the consequences — Prop. 21), **explorable
examples** (an abstract illustration becomes manipulable, with *multiple synchronised
representations* updating together — the filter demo shows "six different ways of characterizing the
filter" at once), and **contextual information** (look a thing up without leaving the page). The
load-bearing caveat is his own: *"the author holds up their end of the conversation."* An explorable
is not an abandoned sandbox. `Tangle` is the mechanism — a number in prose carries
`class="TKAdjustableNumber" data-var="…"`, you drag *the number itself*, and every dependent value in
the text recomputes.

*Up and Down the Ladder of Abstraction* is more directly applicable to us than anything else in the
canon, because contour integration is literally a one-parameter family of states. Victor's rungs:
(1) control time by hand rather than watching it; (2) **draw the whole trajectory statically** —
"all time, instead of some particular time"; (3) **overlay many runs** to abstract over a parameter;
(4) step back *down* by clicking a point in the abstract view to recover the concrete state. His
claim: insight lives "in the transitions between them." Our accumulator strip, R-sweep and homotopy
scrubber are rungs 1–3 of that ladder; clicking a point on the accumulator to jump the integration
marker is rung 4.

Nicky Case supplies the sequencing. Across both essays the durable rules are: **Do & Show & Tell**
(use interactivity for *processes and systems*, text for abstraction, don't make everything
interactive); **Start Small, Build Big** (isolate each mechanic, then compose); **Place Your Bets**
(make the reader predict before revealing — cheap, and the strongest single lever she names); and
crucially **Sandbox Mode comes *last***, because "complex simulations lacking prerequisite knowledge
cause cognitive overload and abandonment." Her stated failure mode is hands-on activity that
requires no thinking — the chemistry-lab problem — and explorables as "glorified flash cards."

Distill's *Communicating with Interactive Articles* is the only source with real empirical
discipline, and it is the most sobering. Its five affordances (connect people to data, make systems
playful, prompt self-reflection, personalise reading, **reduce cognitive load** via
details-on-demand) come with two findings we must design around: *"there is limited empirical
evaluation of the effectiveness of interactive articles"*, and the New York Times' internal
observation that **only a fraction of readers interact with non-static content**. The design
consequence is not "don't be interactive" — it is that **the default, untouched state must already
carry the message**. Their named techniques we will use directly: details-on-demand, linked
representations (mouseover connecting mathematical notation to text and visual encodings),
segmentation with reader-controlled pacing, and "you draw it" prediction. Their explicit warning:
*"Not everything needs to be interactive… interactivity may be distracting or go unused."*

Mathigon's gate is the sharpest version of segmentation: *students must actively participate at
every step before the next one is revealed*. `Immersive Linear Algebra`'s figures progress through
states **with captions that progress with them** — a caption per state, not one caption for a movie.
Observable's `viewof` makes a control and its value the *same object* — exactly the binding we want
between a canvas handle and the `R` in the derivation.

---

## 2. Direct manipulation of mathematical objects

**Paths.** Every vector editor teaches the same grammar and we should not invent a new one: click =
corner node, click-drag = smooth node with handles, click the start node (or right-click / Enter) =
finish, Backspace = drop the last node, Esc = abort, Ctrl = constrain angle. Inkscape additionally
warns against node proliferation: *"When a path contains too many nodes, this will make working with
it more difficult."* Figma's **vector networks** are the transferable idea: they drop the constraint
that a path is a single directed chain, allow several edges at a node, and let you bend an edge
*directly* without touching handles. For us the analogue is that a contour is a **set of semantic
pieces joined at shared endpoints**, not one polyline — so "the R→∞ semicircle" is an object with its
own parameters, and dragging its rim changes `R` rather than editing anonymous control points.

**Snapping and constraints.** Bier & Stone's snap-dragging (SIGGRAPH '86) is still the right model:
"a compromise between the convenience of grids and the power of constraints," where the cursor snaps
to *interesting points in the scene* — intersections, vertices — not to a grid. Our interesting
points are poles, branch points, the real axis, the origin, and existing endpoints. The follow-on
literature (snap-and-go; "Beyond Snapping: Persistent, Tweakable Alignment") is unanimous that the
failure of naive snapping is its **modality** — the user cannot tell whether a snap fired, or undo
it. So: show the constraint that fired, and let a modifier suppress it.

**Parameter binding.** Desmos's rule is worth copying verbatim: a point whose coordinates are
*defined by a parameter* becomes draggable in exactly the directions that parameter allows, and the
slider and the point are two views of one number. Our `R`, `ε`, pole locations and cut endpoints get
both a canvas handle and an inline scrubbable number, bound to one store field.

**Undo and selection.** Selective-undo research distinguishes the *script model* (skip the undone op
on replay) from the *inverse model* (append an inverse); for a geometric editor the script model on
an **object-level** history is right — "move the ε-indent" is one entry however many pointermove
events it spanned. Overlapping objects (a pole sitting on the contour) need a disambiguation
gesture: repeated click / Alt-click cycling, with the candidate named in the status line.

---

## 3. Presenting a derivation

`integral-calculator.com` is the benchmark and its architecture is the lesson: the Risch algorithm
is *"hard to understand for humans"*, so they wrote **>17 000 lines of Maxima** implementing the
techniques a human would apply, purely so the steps are recognisable. Correctness of the answer and
legibility of the derivation are different programs. Rubi generalises this — its `Steps[]` returns
rule objects carrying *Derivation* and *Basis* metadata, i.e. each step knows **why it is allowed**,
not just what it did. That is precisely our honest-labelling requirement in structural form: a step
with a justification field can carry `=`/`≤`/`≈`.

Wolfram|Alpha's step UI, post-2017, is: **one step at a time by default**, "show all steps" as an
escape, optional intermediate expansions per step, and hints. Symbolab and Mathigon agree. Lean's
infoview is the proof-state analogue — it shows the *goal at the cursor*, and ProofWidgets lets a
widget run tactics interactively; the recent *Explorable Theorems* work adds bidirectional
navigation between prose and formal object, hover-revealed definitions, and progressive disclosure of
formal complexity. The repo already owns this idiom (QD's ProofTree, pool-then-quotient).

The linking mechanism is well-studied. Head, Xie & Hearst's CHI'22 *Math Augmentation* coded **1.1k
augmentations across 281 formulas** and devoted nine of their forty-three coding dimensions to *"the
use of color as a visual link between formulas and other content"* and one more to arrows connecting
formulas to content — i.e. **colour-linking a symbol to the thing it denotes is the dominant
author-invented practice**, and authors do it despite LaTeX making it painful. Combined with
brushing-and-linking (select in one view, highlight in all), this gives us the single most valuable
interaction in the app: *hover a term in the derivation → the arc it came from lights up on the
plane and its segment lights up in the accumulator.*

---

## 4. Typesetting and performance

MathJax 3.1 is now only marginally slower than KaTeX and has materially better accessibility;
KaTeX's advantages are bundle size, font loading, and **synchronous rendering without a reflow
round-trip**. For a 60 fps app neither matters much, because the correct strategy is *not to run
either engine per frame*:

> **Render the formula's *shape* once with KaTeX; update its *digits* with `textContent`.**
> Emit each live formula as a static KaTeX skeleton containing `<span class="slot">` placeholders,
> then write numbers into the slots in the rAF loop. Use `font-variant-numeric: tabular-nums` and
> reserve the slot width so no layout is invalidated. Re-run KaTeX only when the *structure* changes
> (a new step, a different integrand) — that is a user-speed event, not a frame-speed event.

Maths on canvas: **don't**. A DOM overlay positioned by `transform: translate3d(...)` from the same
view matrix gives selection, copy, CSS theming and accessibility for free. The counter-argument
(Quadratic's spreadsheet renderer) only bites at 10⁴ simultaneous elements; we have ~10². MSDF text
in the shader is justified only for the small repeating glyph set (axis ticks) if profiling demands,
since MSDF's real win is crisp glyphs under deep zoom.

Accessibility is the uncomfortable part. KaTeX emits MathML alongside its HTML, but its own
maintainers' thread concedes screen readers *"can't see the rendered math"*, that prior a11y hacks
"used to work but don't anymore", and that **nobody is actively working on it**. Meanwhile the
platform improved: NVDA 2025.1+ and JAWS 2026 read MathML in Firefox; VoiceOver and Orca already do.
So: render with `output: "htmlAndMathml"`, *additionally* attach `aria-label` from KaTeX's
`render-a11y-string` on each step container, and ship a **"derivation as prose"** toggle. The canvas
needs its own text equivalent — Desmos's precedent is *audio trace* plus screen-reader-navigable
math; ours is a keyboard-navigable contour-piece list whose rows announce "arc 2 of 4, semicircle
radius R, partial integral ≈ 0.0041, contributes → 0".

---

## 5. Colour and legibility

The HSV phase wheel is indefensible as a default. Kovesi's *Good Colour Maps: How to Design Them*
shows the hue circle "passes through colours of vastly different perceived brightness", creating
**false features** — apparent structure that is an artefact of the colour map. His cyclic
requirement is an even number of control points with lightness rising to the middle and falling
back, matched in pairs, so there is no perceptual anchor. Petroff's CAM02-UCS discernibility study
calls HSV *"severely flawed"*, finds sinebow smoother but still bad under CVD, and finds `twilight`
*"much more consistent and colorblind-friendly… at the expense of average discernibility."*
Kovesi's catalogue gives us the menu: **CET-C6** (six colours, primaries and secondaries
lightness-matched) as the phase-portrait default; **CET-C2** (magenta–yellow–green–blue) for the
familiar four-quadrant reading; **CET-CBC1** (blue–white–yellow–black) and **CET-CBC2** as the
colour-blind-safe options; **CET-C5** (cyclic greyscale) for print figures. All are even-spaced RGB
stop tables — the shape `@cas/gpu`'s `buildColormapLUT` already consumes, so this is data, not
machinery.

Drawing a contour legibly over a saturated background is a solved cartographic problem. Halos beat
outlines because they sit *behind* the mark and never eat into it; the print-era technique was
**variable-depth masking** — knock out competing symbology while leaving background colour intact.
Red Blob Games' SDF treatment is the shader form: map signed distance to colour (`d<0` = stroke,
`0–0.1` = hard casing, beyond = feathered halo), and — the good part — **read the background and
suppress the halo where contrast is already sufficient**, so the halo appears only where it is
earned. Because our background is generated in the same fragment pass, we can do better than any
DOM overlay could: desaturate the domain colouring (chroma × ~0.35, lightness untouched) inside the
halo radius rather than painting over it, keeping the phase readable *through* the contour.

---

## 6. Onboarding, animation, share links

**Onboarding.** PhET's *implicit scaffolding* is the target: guidance built into the design so
students are *"guided without feeling guided"*, validated by think-aloud interviews on every single
sim. Their named strategies are directly actionable — limit controls, visual cues, affordances,
layout and prominence, prior-knowledge anchoring, **removal of unnecessary features**, positive
feedback, productive constraints. No modal tutorial appears anywhere in that list.

**Animation.** Tversky, Morrison & Bétrancourt is the standing rebuttal to reflexive animation:
animated graphics beat static ones only where the comparison was unfair ("the animated graphics
convey more information or involve interactivity"). Their *Apprehension Principle* — graphics must
be accurately perceived — fails for animation on three counts: too fast, too complex, **transient**.
Their remedy is user control: pause, rewind, step, re-inspect, set the pace. Grant Sanderson's rule
from the other direction: every movement should be deliberate and identifiable, reinforcing the
narration rather than competing with it. So animate exactly three things — the accumulation along
the contour, the **homotopy** between two contours (which *is* the theorem), and the R→∞ /
ε→0 limits — and make each a scrubber over a statically-drawn whole trace.

**Share links.** The transport is already ours: `encodeViewState("contour", state)` →
`#vs=<url-safe-base64-json>`, whose forward-compat contract (validate only the envelope, preserve
unknown `state` fields, never reject a higher `v`) lives in `packages/interchange/src/viewstate.ts`.
Two rules on top. **Store semantics, not samples**: the contour serialises as its piece list
(`{kind:"segment",from,to}`, `{kind:"arc",c,r,a0,a1}`, `{kind:"indent",at,eps}`), never as sampled
points — far smaller, resolution-independent, and it survives a schema bump. **Presets are named**:
a gallery link is `?ex=fresnel` and a deviation stores only the diff against it — the pattern QD's
figure card already ships. Round floats to displayed precision; warn past ~2 kB.

---

## 7. The specification

### 7.1 Screen layout

A full-bleed **Stage** with two collapsible rails and one bottom strip. Rails are named for the
**job**, not the technique — the correction QD's own sidebar review had to make (*"organized around
the wrong axis… it weights escape hatches like the main road"*).

| Region | Panel | Contents |
|---|---|---|
| Centre | **Stage** | WebGL2 domain-coloured plane; contour with SDF halo + direction arrowheads; poles (with order); branch cuts; the moving integration marker; hover readout `z =`, `f(z) =`. |
| Left, top | **Gallery** | Preset worked examples, grouped by **the real integral they evaluate** (∫₀^∞ sin x/x, Fresnel, ∫₀^{2π} dθ/(a+b cos θ), keyhole ∫₀^∞ x^{s−1}/(1+x)), each card = thumbnail + the real integral in KaTeX + one line of what it demonstrates. This is the app's front door. |
| Left, below | **Function** | Integrand expression (`@cas/expr`), auto-detected poles/branch points listed with order and residue, each row hover-linked to the plane. |
| Left, below | **Contour** | **The piece list.** Ordered rows, one per semantic piece: type icon, editable name ("the R→∞ semicircle"), its parameters as bound scrubbers, its own partial ∫ with a rigour badge, a colour chip. Reorder, duplicate, delete, "close the path". |
| Left, below | **Cuts** | Branch-cut objects: base point, direction, draggable; a warning row when the contour crosses one. |
| Bottom | **Accumulator** | Two linked traces over the parameter: value trace (Re/Im vs arclength) and the **Argand trail** (the partial sum walking in ℂ, ending at the answer). Doubles as the scrubber; segments tinted by piece colour. |
| Right, top | **Derivation** | Generated proof as a folded step list; one step revealed at a time by default with "show all"; each step carries its justification and a badge; terms tinted to match their contour piece. |
| Right, middle | **Result** | The headline value, its `=`/`≤`/`≈` badge, and a disclosure explaining the badge. Also the residue ledger: `2πi Σ Res` decomposed per pole with winding number. |
| Right, bottom | **Figure & share** | Permalink, PNG/SVG export, element toggles — mirroring QD's shipped figure-export card. |

### 7.2 The ten interaction rules

1. **Example-first, sandbox last.** Cold start opens a *solved* preset, not an empty plane; the
   sandbox is reachable but never the landing state. *(Case: sandbox mode last; Distill: only a
   fraction of readers interact, so the untouched view must carry the message.)*
2. **Every contour piece is a first-class object** with a name, a handle, a term and a badge. No
   anonymous polylines. *(Figma vector networks; QD's task-vs-technique IA lesson.)*
3. **One hover, three highlights.** Pointing at an arc, a derivation term, or an accumulator segment
   highlights the other two — bidirectionally. *(Distill "linked representations"; Head et al.,
   colour-as-visual-link is the dominant author practice.)*
4. **The slider and the handle are one number.** `R`, `ε`, poles and cut endpoints are draggable on
   the plane *and* scrubbable inline in the derivation prose ("let R → ∞"), bound to one store
   field. *(Victor/Tangle; Desmos; Observable `viewof`.)*
5. **Snap with intent, never silently.** Snap to poles, axes, radii and existing endpoints; name the
   constraint that fired in a transient badge; a modifier suppresses it. *(Bier & Stone; the
   snapping-modality critique.)*
6. **Modeless drawing with the pen-tool grammar everyone already knows.** Click = corner, drag =
   arc, click-the-start = close, Backspace = drop last, Esc = abort, Ctrl = constrain. Live preview
   of the pending segment. *(Inkscape/Illustrator/Figma.)*
7. **Time is scrubbed, never inflicted.** Every animation has a draggable timeline and the whole
   trace drawn statically beside it; autoplay at most once on preset load, interruptible; honour
   `prefers-reduced-motion` by starting paused. *(Tversky's apprehension principle; Victor's rung 2.)*
8. **The badge attaches to the number, not the page.** Every displayed quantity carries `=`/`≤`/`≈`
   inline and explains itself on click; numeric quadrature never prints `=`. *(Repo guardrail;
   Rubi's per-step justification metadata is the structural form.)*
9. **Degenerate states are named and refused, not computed.** Contour through a pole, contour
   crossing a cut, unclosed contour where closure is assumed → a named state plus a suggested repair
   ("add an ε-indent at z = 0"); never a number. *(The incumbent printed `6.71197 + 0.46361i` for a
   contour through the pole of 1/z — track 1, §1.)*
10. **Undo is object-level and covers geometry.** One drag = one undo entry; the URL updates on
    settle, not per frame; Ctrl+Z is always available and never silently no-ops. *(Selective-undo
    script model; QD's Ctrl+Z gap was a verified workspace-review defect.)*

### 7.3 Colour and typography direction

- **Phase:** CET-C6 default, CET-C2 alternate, **CET-CBC1/CBC2** colour-blind-safe, CET-C5 greyscale
  for print. Never HSV, not even as an option labelled "classic" without a caveat.
- **Modulus:** `log₂|f|` banding expressed as bounded lightness modulation (≈ ±12 % L*) of the
  cyclic hue, so it never out-contrasts the contour.
- **Contour:** stroke + SDF halo in the same fragment pass; halo strength driven by *local
  background contrast*; background desaturated (chroma × 0.35, lightness preserved) inside the halo
  radius so phase stays readable through it. Direction by arrowheads, never by dashes alone —
  dashes are already spent in the suite's visual vocabulary on "not certified".
- **Semantic colour:** a 6-entry categorical ramp, one colour per contour piece, reused to tint that
  piece's term in the derivation and its segment in the accumulator. Cap at six; beyond that use
  position and label, not more hues. Colour is never the *only* channel for a distinction.
- **Theme:** UI chrome tokenised (`--c-*`, as QD); the domain colouring is **data and does not
  theme-swap**; only halo polarity flips.
- **Type:** KaTeX default (Computer Modern) for display maths so it matches the textbook; a humanist
  sans for derivation prose; **tabular figures for every live-updating number** so digits do not
  jitter at 60 fps.

### 7.4 Anti-patterns, each with its evidence

| Anti-pattern | Evidence |
|---|---|
| Opening on an empty plane and a blinking cursor | Case: sandbox last, overload causes abandonment; Distill: most readers never interact |
| HSV phase wheel as default | Kovesi: false features from unequal lightness; Petroff: HSV "severely flawed", fails CVD |
| A one-shot contour that cannot be re-grabbed | Track 1 §1 — the incumbent resets its mode after the drag; deformation is the whole point |
| Printing a value for a singular/ill-posed contour | Track 1 §1 — `6.71197 + 0.46361i`, confidently wrong to 6 s.f., uncaveated |
| Autoplay animation without a scrubber | Tversky et al.: transience + speed defeat apprehension; remedy is user pacing |
| Morphing formulas as the *primary* explanation | Congruence principle — a substitution is not a motion; Sanderson: no movement without purpose |
| Re-running KaTeX/MathJax per frame | Structure vs digits split; layout invalidation, not glyph cost, is the killer |
| Maths rendered into the WebGL canvas | Loses selection, copy, CSS, a11y; DOM overlay is free below ~10³ elements |
| A modal "here's how it works" tutorial | PhET implicit scaffolding — guidance lives in affordances, layout and constraints |
| A twenty-knob control panel | PhET: limit controls, remove unnecessary features; Case: cognitive overload |
| Sidebar grouped by technique | The repo's own SIDEBAR_IA finding: escape hatches weighted like the main road |
| Wall-of-algebra derivation dumped at once | Wolfram/Symbolab/Mathigon all default to one step with an escape hatch |
| Colour as the sole carrier of meaning | CVD: deuteranomaly is the common case; pair every hue with shape/label |
| Contour serialised as sampled points in the URL | Bloats the link, resolution-bound, breaks on schema bump; store the piece list |
| Silent snapping | Snapping's failure mode is modality — the user cannot tell it fired or undo it |
| Relying on KaTeX MathML alone for screen readers | KaTeX maintainers: NVDA "can't see the rendered math", no active a11y work |

---

## Sources

- https://worrydream.com/ExplorableExplanations/ — Victor's three patterns; "the author holds up their end of the conversation".
- https://worrydream.com/LadderOfAbstraction/ — controlling time, drawing the whole trajectory, overlaying runs, stepping back down.
- https://worrydream.com/Tangle/ and https://worrydream.com/Tangle/guide.html — `TKAdjustableNumber`, drag-the-number-in-prose binding.
- https://worrydream.com/TenBrighterIdeas/ — the reactive-document prototype Tangle was extracted from.
- https://blog.ncase.me/explorable-explanations/ — Do & Show & Tell; Interest Curves; Start Small, Build Big; Cognitive Gates; the "glorified flash cards" failure mode.
- https://blog.ncase.me/explorable-explanations-4-more-design-patterns/ — Puzzle It Out; Place Your Bets; Role Play; Sandbox Mode (and why it goes last).
- https://blog.ncase.me/how-i-make-an-explorable-explanation/ — start on the ground, climb, end with open questions.
- https://explorabl.es/ — the collection and its play-based framing.
- https://distill.pub/2020/communicating-with-interactive-articles/ — five affordances; linked representations; details-on-demand; the NYT "fraction of readers interact" finding; "not everything needs to be interactive"; authoring burden; accessibility and preservation challenges.
- https://distill.pub/guide/ — Distill's article/technical conventions (D3 for dynamic figures, KaTeX/MathJax for equations).
- https://immersivemath.com/ila/ch00_preface/preface.html — interactive figure per chapter opening; concrete example before formalism.
- https://seeing-theory.brown.edu/ — the "missing mental image" premise; D3 direct-manipulation distributions.
- https://mathigon.org/about — active participation gated at every step before the next is revealed.
- https://observablehq.com/@observablehq/reactive-dataflow — `viewof`: the control and its value as one object.
- https://help.figma.com/hc/en-us/articles/360040450213-Vector-networks — paths without a single-chain constraint; multiple edges per node; bend an edge directly.
- https://inkscape-manuals.readthedocs.io/en/latest/pen-tool.html — click vs click-drag nodes; path modes; the "too many nodes" warning.
- https://help.desmos.com/hc/en-us/articles/202529069-Sliders-and-Movable-Points-in-a-Graph — parameter-defined points become draggable in exactly the allowed directions.
- https://dl.acm.org/doi/pdf/10.1145/15886.15912 — Bier & Stone, *Snap-Dragging* (SIGGRAPH '86): snap to scene features, not a grid.
- https://dl.acm.org/doi/10.1145/2984511.2984577 — *Beyond Snapping*: persistent, tweakable alignment; the modality critique.
- https://dl.acm.org/doi/10.1145/2702123.2702543 — selective undo; script vs inverse models.
- https://www.integral-calculator.com/ — >17 000 lines of Maxima implementing *human* techniques so steps are readable; browser-side parse → LaTeX for instant feedback.
- https://rulebasedintegration.org/ — Rubi `Steps[]` rule objects carrying Derivation/Basis justification metadata.
- https://blog.wolfram.com/2017/09/07/a-new-level-of-step-by-step-solutions-in-wolframalpha/ and https://blog.wolfram.com/2019/07/17/enhanced-step-by-step-solutions-now-on-mobile-announcing-wolframalpha-2-0-for-ios/ — one step at a time by default, "show all steps", intermediate steps and hints.
- https://github.com/leanprover/vscode-lean4/tree/master/lean4-infoview and https://github.com/leanprover-community/ProofWidgets4 — goal-at-cursor proof state; interactive widgets running tactics.
- https://arxiv.org/pdf/2604.02598 — *Explorable Theorems*: bidirectional prose↔formal navigation, hover-revealed definitions, progressive disclosure of formal complexity.
- https://dl.acm.org/doi/10.1145/3491102.3501932 — Head, Xie & Hearst, *Math Augmentation* (CHI '22): 1.1k augmentations / 281 formulas; nine coding dimensions for colour as a formula↔content link; arrows and labels.
- https://en.wikipedia.org/wiki/Brushing_and_linking — the canonical statement of select-here-highlight-there.
- https://arxiv.org/abs/1509.03700 — Kovesi, *Good Colour Maps: How to Design Them*: lightness-increment uniformity; CIELAB's low-spatial-frequency assumption; cyclic requirements; false features from the hue circle.
- https://colorcet.com/ and https://colorcet.com/gallery.html — "the standard colour circle is not a good map"; CET-C1…C7, CET-CBC1/CBC2 colour-blind cyclic, CET-C5 cyclic greyscale.
- https://mpetroff.net/2019/08/discernibility-of-rainbow-colormaps/ — CAM02-UCS discernibility: HSV "severely flawed"; sinebow smoother but CVD-poor; twilight most consistent and colourblind-friendly.
- https://matplotlib.org/stable/users/explain/colors/colormaps.html — HSV's wide L* variation; twilight as the cyclic recommendation.
- https://bottosson.github.io/posts/oklab/ — Oklab hue/chroma prediction quality, for the desaturate-under-halo operation.
- https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0199239 — optimising colormaps for CVD; deuteranomaly as the common case.
- https://www.redblobgames.com/blog/2024-12-08-sdf-halos/ — SDF halos: distance→colour bands, contrast-aware halo suppression, background blur/tint; overlap artefacts.
- https://www.esri.com/arcgis-blog/products/arcgis-living-atlas/mapping/polishing-your-halo and http://nyalldawson.net/2017/04/about-label-halos/ — halos behind vs outlines over; blend modes; variable-depth masking from print cartography.
- https://arxiv.org/pdf/1306.6544 — PhET, *Implicit scaffolding in interactive simulations*: limited controls, visual cues, affordances, layout/prominence, prior-knowledge anchoring, feature removal, productive constraints.
- https://pubs.aip.org/aip/acp/article/1513/1/302/877085/ — "Guiding without feeling guided"; think-aloud interviews on every sim.
- https://hci.stanford.edu/courses/cs448b/papers/Tversky_AnimationFacilitate_IJHCS02.pdf — Congruence and Apprehension principles; animation failures (speed, complexity, transience); user control of pacing/stepping/re-inspection as the remedy.
- https://github.com/3b1b/manim and https://www.3blue1brown.com/about/ — deliberate motion; visuals reinforcing rather than competing with narration.
- https://github.com/KaTeX/KaTeX/discussions/3120 — KaTeX a11y state: screen readers "can't see the rendered math"; `render-a11y-string`; no active maintainer work.
- https://docs.mathjax.org/en/v4.1/basic/accessibility.html — MathJax's MathML + ARIA generation and explorer.
- https://w3c.github.io/mathml-docs/gap-analysis/ — MathML accessibility gap analysis; NVDA 2025.1+/JAWS 2026 MathML support in Firefox.
- https://css-tricks.com/techniques-for-rendering-text-with-webgl/ and https://webglfundamentals.org/webgl/lessons/webgl-text-html.html — MSDF vs DOM overlay trade-offs; "use the browser's features when appropriate".
- https://www.quadratichq.com/blog/building-a-high-performance-spreadsheet-renderer-why-we-chose-webgl-over-html — the 10⁴-element threshold where DOM overlay stops working.
- https://alfy.blog/2025/10/31/your-url-is-your-state.html — URL-as-state practice and the 2 000–8 000 character practical ceiling.
- https://www.nngroup.com / https://en.wikipedia.org/wiki/Progressive_disclosure — Nielsen's 1995 definition: defer advanced features to a secondary surface to make an application easier to learn and less error-prone.
- `packages/interchange/src/viewstate.ts` (this repo) — the `#vs=` envelope, its versioning and forward-compat contract.
- `packages/gpu/src/colormap.ts` (this repo) — `buildColormapLUT` even-spaced RGB tables; the shape the CET cyclic maps drop into.
- `docs/algebra-review/SIDEBAR_IA.md` (this repo) — organised by technique rather than task; escape hatches weighted like the main road.
