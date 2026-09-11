# 02 — Pedagogy, cognition, and misconceptions

> Research track 2 for `apps/contour-integration`. Evidence base for the app's teaching design.
> **Evidence labelling** (matching the repo's honest-labelling guardrail): **[R]** = peer-reviewed
> empirical finding I read in full text; **[R-abs]** = peer-reviewed, abstract/snippet only;
> **[E]** = expository/practitioner source (textbook, lecture notes) — real, but not an
> empirical claim about students. Do not upgrade **[E]** to **[R]** downstream.

## 1. The headline finding: there is no shared intuition for ∮f dz — not even among experts

This is the single most important input to the design, and it is unusually well evidenced.

Hanke (2024, *ZDM*) interviewed three research mathematicians about how they personally make sense of
the complex path integral. He reconstructed nine "discursive images" (interpretations) governed by
eight "discursive frames" — **(F1)** restriction of generality, **(F2)** theorematic, **(F3)** vector
analysis, **(F4)** tool, **(F5)** no meaning, **(F6)** area, **(F7)** mean value, **(F8)**
holomorphicity *ex machina*. The decisive result: **not one of the nine interpretations occurred
across experts.** Only F1, F2 and F3 recurred at all; the rest were idiosyncratic to one individual.
One expert (F6) explicitly tried to transfer the real "area under the graph" picture, drew it, and
abandoned it because the values are complex and the vertical axis would have to carry ℂ. Two others
stated flatly that no area interpretation exists. Hanke frames this against Knopp's textbook claim
that a simple geometric interpretation as in the real case is impossible. **[R]**

Soto & Oehrtman (2022, *JMB* 66) is the student-side complement. Undergraduates with no prior
exposure to complex integration were asked to interpret ∫_C f(z) dz. They productively imported
geometric and visual resources, conveyed with diagrams and gesture — and then **collapsed under the
load of coordinating multiple quantitative relationships, reverting to summing z, or f(z), or Δz**.
They could not hold onto the *product* f(z)·Δz. The paper also documents the belief that complex
integration exists only to compute a weighted sum of residues. **[R-abs]**

**Design consequence.** The app is not "adding a visual to a topic that has one". It is supplying a
referent that the discipline demonstrably lacks. That raises the stakes on getting the referent
right, and it kills the most tempting design: **there must be no area-under-a-curve rendering of
∮f dz anywhere in the app.** It is the one picture experts tried and rejected, and it is also the
least productive conception in the real-integral literature (§3).

## 2. What students bring in that is already broken

- **Representation non-fluency.** Soto-Johnson & Troup (2014, *JMB* 36, 109–125) found students
  struggle to switch between Cartesian and polar forms, and between symbolic inscription and points
  in the plane; gesture and bodily activity measurably support the switching. Danenhower's earlier
  work reports students treating algebraic and geometric representations as separate, autonomous
  systems. **[R-abs]**
- **Rotation is missing from multiplication.** Conner, Rasmussen, Zandieh & Smith (RUME 2007): asked
  to explain multiplication, **none of ten interviewees mentioned rotation**, even for ×(−1); after
  instruction only three did. **[R-abs]** Since f(z)·Δz *is* a rotation-and-scaling of Δz, the whole
  accumulation picture rests on a conception most students do not have.
- **Conception mismatch across one expression.** Jones (2020, *JMB* 59) found students reason about
  *parts* of a line-integral expression with one conception (adding up pieces) while reasoning about
  the *whole* with another (area) — producing locally correct, globally incoherent accounts. **[R-abs]**
- **The differential is a formal token.** Garcia & Ross (2017) name this directly: students may have
  only a symbol-pushing understanding of dx, dy, dx dy, which "threatens to make their understanding
  of Cauchy's Theorem incomplete and shallow". **[R]** Oehrtman & Simmons (2023) show the integration
  *measure* is an essential component of students' local model, not an afterthought. **[R-abs]**

## 3. The integral-concept literature that transfers

Jones (2013; 2015a,b) identifies three student conceptions of ∫: **perimeter/area**, **function
matching** (antiderivative), and **adding up pieces** (later: multiplicatively-based summation).
Area and antiderivative conceptions *dominate* student explanations yet are **unproductive** in
applied contexts; only adding-up-pieces generalises. **[R-abs]**

Dray & Manogue (2023, *IJRUME*) generalise this to **chop, multiply, add (CMA)** and add a fourth
characterisation, **parametric integrals (PI)**. Their textbook analysis is directly relevant: the
*mathematics* textbook tradition makes the parameterised form iconic, while upper-division physics is
"pure CMA". They warn that reducing a line integral to separate dx, dy, dz integrals "may prevent
students from realizing that they are still line integrals". **[R]**

**Design consequence.** ∫_a^b f(γ(t))γ′(t) dt is the *computational* form, not the *conceptual* one.
The app must make the CMA form primary — chop the contour, multiply f(zₖ)·Δzₖ, add head-to-tail —
and present the parameterised integral as a derived evaluation route, reachable but never the first
thing a learner sees.

## 4. Where the textbooks actually differ (and why it matters here)

Garcia & Ross (2017, *PRIMUS* 27(8–9), 758–765) survey the approaches to Cauchy's theorem and open
with the finding that **there is no standard approach**; the choice depends on prerequisites and
intended rigour. **[R]**

| Approach | Texts | Pro | Con (their words, paraphrased) |
|---|---|---|---|
| **Green's theorem** | Brown & Churchill; Hoffman & Marsden; Krantz; Howell & Matthews (hybrid) | short, no real analysis, actually *uses* C–R | needs continuity of f′ — and that rests on the Cauchy integral formula, so it is circular until patched; subordinates complex analysis to multivariable calculus |
| **Goursat's lemma** | Ahlfors; Boas; Conway; Sarason | drops continuity of f′; elegant fractal-like construction | heavy analysis; after much board work you have only triangles/rectangles |
| **Leibniz' rule** | — | short, calculus-only, goes straight to the integral formula | "where is the geometric intuition?"; feels like a trick |
| **Homotopy / deformation** | — | **"physically motivated, visual, and intuitive"**; gives a taste of topology | the intuitive version hand-waves about conservative vector fields from C–R; the rigorous version needs Cauchy-for-a-disc first, which looks circular |

Their own recommendation is Green's theorem for accessibility with supplementary Goursat for strong
students. **[R]**

**Design consequence — this is the app's niche.** The deformation view is simultaneously *the most
visual* and *the hardest to make rigorous*. That is exactly the gap an interactive tool fills, and
exactly where the project's `=` / `≤` / `≈` labelling must be loudest: the app should let a learner
drag a contour through a homotopy and watch the value not move, while stating plainly that what they
are seeing is a demonstration, not the proof.

**The geometric strand.** Needham's *Visual Complex Analysis* gives the Pólya vector field
H = (u, −v): Re ∮f dz is the **work/flow along** the contour, Im ∮f dz is the **flux across** it;
holomorphy makes H source-free and irrotational, so Cauchy's theorem becomes a statement about a
field with no sources and no circulation. **[E]** Wegert's *Visual Complex Functions* supplies the
other half — enhanced phase portraits, in which analytic and meromorphic functions are determined up
to a positive constant by phase alone and zeros/poles are visible as points where all colours meet.
Wegert's own caution matters: that uniqueness holds for analytic functions, *not* for general ones.
**[E]**

Note that Hanke's F3 ("vector analysis") was one of only three frames that recurred across experts —
the Pólya work/flux reading is the closest thing the field has to a *shared* intuition. It should be
a first-class view in the app, not an easter egg.

## 5. Misconception inventory → counter-move

Research-documented (**[R]**/**[R-abs]**):

| # | Misconception | App counter-move |
|---|---|---|
| M1 | Accumulates z, f(z) or Δz instead of f(z)·Δz | Accumulation panel shows **all four running sums** simultaneously; ΣΔz visibly closes to **0** on any closed contour — a free, striking contrast |
| M2 | "Contour integration just computes Σ residues" | Ship worked examples where residues are *not* the route: ML bounds, deformation, symmetry, non-closed contours |
| M3 | ∮f dz is an area | Never draw it. Two linked planes (z-plane + accumulation plane), never a third axis |
| M4 | Cartesian↔polar / symbol↔picture non-fluency | Every quantity readable in both forms; hovering a term highlights its geometric referent |
| M5 | Multiplication has no rotation | Show f(zₖ)·Δzₖ explicitly as Δzₖ **rotated by arg f and scaled by \|f\|** (amplitwist), animated per step |
| M6 | Part/whole conception mismatch | One consistent CMA story from chop to total; no mixed metaphors between panels |
| M7 | Parameterised form hides that it is a line integral | CMA primary; parameterisation as a derived, opt-in view |

Practitioner/expository-documented (**[E]** — real traps, but treat as design hypotheses to be
user-tested, not as established findings):

- All closed contour integrals vanish (the analyticity hypothesis is dropped).
- Path-independence conflated with the FTC; not seeing that an antiderivative *fails to exist* for
  1/z on ℂ∖{0} precisely because ∮ = 2πi ≠ 0.
- ∮dz/z = 2πi read as a fact about the *circle* rather than about the *enclosed pole*.
- Winding number conflated with the count of enclosed poles (breaks on multiplicity, on multiple
  loops, and on n = 0 with poles present but cancelling).
- Orientation/sign errors; forgetting a clockwise traversal negates.
- Jordan's lemma applied to the wrong half-plane — the half-plane is **forced** by the sign of a in
  e^{iaz} so that the exponential decays; it is not a free choice.
- Branch cuts: crossing a cut without changing sheet; assuming log(ab) = log a + log b for principal
  values (it fails exactly when arg(ab) crosses the cut).
- Principal value treated as an ordinary convergent integral; forgetting the half-residue (θ/2π in
  general) from an indented pole on the contour.
- Residue at infinity: sign confusion, because it is a residue of a *differential form* —
  Res_∞ f = −Res_{z=0}[z^{−2}f(1/z)] — and the sum of all residues including ∞ is zero.

## 6. Does interactive visualisation help? Conditionally, and the conditions are known

- **Animation per se does not help.** Tversky, Morrison & Bétrancourt (2002) reviewed the evidence
  and found it "not encouraging": where animation appeared superior, the comparison was confounded
  (the animation carried more information, or added interactivity). They give two design constraints:
  the **congruence principle** (graphic structure must match conceptual structure) and the
  **apprehension principle** (it must be perceivable — animations are often too fast/complex). **[E/R-abs]**
- **Decoration actively harms novices.** The seductive-details literature shows extraneous
  interesting-but-irrelevant content depresses learning, most strongly for low-prior-knowledge
  learners; decorative animations impair recall of STEM content. **[R-abs]**
- **Unguided exploration fails.** Kirschner, Sweller & Clark (2006) is the standard citation: for
  novices, minimal guidance underperforms direct instruction. **[R-abs]**
- **But guidance can be built into the artefact.** PhET's *implicit scaffolding* — affordances and
  constraints that cue productive interaction while preserving learner agency — was developed over
  125 sims and 600+ student interviews. This is the resolution: guided, not narrated. **[R-abs]**
- **Worked examples, faded, with self-explanation prompts.** Meta-analytic effect of worked examples
  on mathematics performance ≈ g 0.48; fading worked steps supports the transition to independent
  problem solving, and **fading combined with principle-identification prompts yields medium-to-large
  effects on near *and* far transfer**. Kalyuga's expertise reversal effect means the support must
  fade, or it will hurt the students who progress. **[R-abs]**
- **Comparison.** Rittle-Johnson & Star: contrasting worked examples reliably improve procedural
  knowledge and flexibility — but comparison needs careful support to work. **[R-abs]**
- **Predict-observe-explain.** Prompting a prediction *before* manipulating a simulation improves
  conceptual outcomes; the cognitive conflict at the observe step is the active ingredient. **[R-abs]**
- **DGS meta-analyses are positive but should be discounted.** Chan & Leung (2014) SMD ≈ 1.02;
  Ji, Guo & Song (2024) three-level, 107 studies, d = 0.632. These are overwhelmingly school-level
  geometry; treat as encouragement, not as a transferable effect size. **[R-abs]**

## 7. Teaching contour *choice* — the crux

**State of the evidence, honestly:** I found **no published decision tree for choosing a contour**,
and no mathematics-education study of contour choice at all. What exists is a *taxonomy by integrand
family* in exposition (Orloff's MIT 18.04 notes are the cleanest open example: rational → semicircle;
oscillatory → e^{iz} + Jordan; branch cut → keyhole/Hankel; pole on the axis → indentation +
principal value). A taxonomy is not a procedure, and pattern-matching on integrand shape is precisely
what makes students helpless on an unseen integral. **This is a genuine gap the app can fill.**

**Proposed answer: teach contour choice as constraint satisfaction with a live "closing ledger",
not as pattern recognition.** Four constraints; a contour is a *candidate solution* to them.

1. **COVER** — the target real integral must appear as a labelled piece of the closed contour
   (possibly after a substitution, e.g. z = e^{iθ} turns a [0,2π] trig integral into a unit-circle
   rational integral).
2. **KILL** — every *other* piece must vanish in the limit, be computable, or reproduce the target
   times a known constant.
3. **CATCH** — the enclosed singular set must be finite, identified, and its residues computable.
4. **LEGALITY** — the contour must not cross a branch cut, and its orientation must be declared.

**The one generalisation worth teaching.** The eight-contour bestiary collapses to a two-case
classification under KILL:

- **Vanishing closure** — the extra piece goes to zero (semicircle + ML/Jordan; small indentation
  arc). *Which* half-plane is then forced, never chosen: it is where the integrand decays.
- **Reproducing closure** — the extra piece returns c·(the target), so you solve for the target.
  Rectangle (periodicity: the far side gives e^{2πia}× on ∫e^{ax}/(1+e^x)); sector of angle 2π/n
  (for x^n); keyhole (the two sides of a log or z^α cut differ by a known factor).

"Pick a contour such that the pieces you cannot compute either **vanish** or **give you back what you
want times a constant**" is short, true, covers essentially every standard example, and is
*checkable* — which makes it implementable.

**Mechanics that make it teachable.**

- **Live ledger panel.** For any user-drawn closed contour, decompose into named arcs and show
  COVER/KILL/CATCH/LEGALITY per arc with honest labels: `=` when the arc integral is exact (rational
  residue core), `≤` when only a rigorous ML/Jordan bound exists (**show the bound**), `≈` when only
  numeric. The argument *closes* only when every arc is `=` or `≤`-to-zero — and the app must say
  that in words, not merely emit a number.
- **Let wrong contours fail informatively.** Draw the lower half-plane semicircle for ∫cos x/(1+x²)
  and watch the arc bound **diverge** instead of vanish. Static text can only assert this; the app can
  demonstrate it. This is the strongest single argument for interactivity in the whole product, and it
  is the POE + contrasting-cases design executed literally.
- **Radius slider as a manipulable limit.** Dragging R shows the rigorous arc bound trending to 0 —
  converting an asserted inequality into an observed trend, without ever claiming the observation is
  the proof.
- **Faded contour-choice drill.** (i) contour given + ledger filled; (ii) contour given + learner
  fills the ledger; (iii) learner picks from a menu; (iv) learner draws freely. Fading plus "which
  constraint did that choice satisfy?" prompts — the empirically supported combination.
- **Contrasting triads.** ∫1/(1+x²), ∫cos x/(1+x²), ∫sin x/x side by side: near-identical integrands,
  three different ledger outcomes (plain ML; Jordan; indentation + PV).

## 8. Prioritised design requirements

**P0 — do these or the app teaches the wrong thing**

1. **No area rendering of ∮f dz, ever.** (§1, §3)
2. **Accumulation panel is a head-to-tail vector sum of f(zₖ)·Δzₖ in its own plane**, with the three
   documented wrong sums (Σz, Σf(z), ΣΔz) toggleable as contrasts. (M1)
3. **Show the amplitwist on each step**: Δz rotated by arg f, scaled by |f|. (M5)
4. **Two linked planes, never a 3-D surface** for the integral itself. (§1)
5. **CMA primary; parameterisation derived and opt-in.** (§3, M7)
6. **Honest `=`/`≤`/`≈` on every reported quantity**, including per-arc bounds, and an explicit
   "this argument does / does not close" verdict. (§4, §7)
7. **Winding number and enclosed-pole count are separate, separately labelled readouts** — never one
   number implying the other. (M-winding)
8. **Orientation always visible** (animated arrowheads) and sign consequences shown live.

**P1 — the teaching layer**

9. **The four-constraint ledger** (COVER/KILL/CATCH/LEGALITY) as the app's organising UI for the
   definite-integral gallery. (§7)
10. **Wrong contours must fail visibly and diagnostically**, naming the failing constraint.
11. **Faded worked examples with self-explanation / principle-identification prompts**; support fades
    with progress (expertise reversal). (§6)
12. **Prediction prompt before each first manipulation** of a new example. (§6)
13. **Contrasting pairs/triads** as a first-class gallery structure, not incidental. (§6)
14. **Pólya work/flux view** as a named toggle: Re = flow along, Im = flux across; Cauchy's theorem
    as source-free + irrotational. (§4)
15. **Branch cuts are drawn objects with sheet state**: dragging a contour across a cut must either
    be refused or explicitly change sheet and say so. (M-branch)
16. **Deformation/homotopy mode**: drag the contour, watch the value hold, with an explicit
    "demonstration, not proof" label. (§4)

**P2 — valuable, not blocking**

17. Phase-portrait domain colouring with Wegert's caveat surfaced (uniqueness is for analytic f).
18. Gesture-friendly direct manipulation (drag the contour, drag poles) — the embodied-cognition
    strand suggests manipulation beats watching.
19. Residue-at-infinity view on the sphere, with the form/sign explained rather than asserted.
20. A "why this contour?" explainer generated from the ledger, exportable with the example.

**Explicit non-goals / things to avoid**

- No auto-playing animation as the default entry state; no decorative motion. (§6)
- No free-exploration sandbox as the *only* entry point — pair it with tasks. (§6)
- Do not let GPU domain colouring dominate: it is a picture of *f*, not of the integral, and a
  beautiful background is a textbook seductive detail.
- Do not claim rigour from a dragged slider, a pixel count, or a numeric quadrature.
- Do not invent a "geometric meaning" for ∮f dz beyond what Pólya/CMA actually license; three experts
  could not, and a confident-but-wrong referent is worse than an honest absence.

## Sources

- https://link.springer.com/article/10.1007/s11858-024-01610-x — Hanke (2024), *ZDM* 56(7) 1403–1416, experts' intuitive discourses about complex path integrals (publisher landing page; gated).
- https://d-nb.info/1343791294/34 — open-access full text of the above; source of the eight discursive frames (F1–F8) and the abandoned area attempt. **Read in full.**
- https://eric.ed.gov/?q=called&ff1=eduHigher+Education&id=EJ1450557 — ERIC record (EJ1450557) confirming the ZDM citation details.
- https://media.suub.uni-bremen.de/entities/publication/72ce8b75-1c62-4b1a-8d38-a0d274685e99 — Hanke (2022) Bremen dissertation record: four aspects + nine images of complex path integrals.
- https://doi.org/10.26092/elib/1964 — DOI/PDF for that dissertation (19.4 MB).
- https://hal.science/hal-03754865/document — Hanke, "Aspects of complex path integrals" (CERME12); open PDF, blocked by bot protection at time of access.
- https://www.sciencedirect.com/science/article/abs/pii/S0732312322000311 — Soto & Oehrtman (2022), *JMB* 66, "Undergraduates' exploration of contour integration: What is accumulated?" (gated).
- https://www.researchgate.net/publication/360399033_Undergraduates'_exploration_of_contour_integration_What_is_Accumulated — same paper; source of the "reverted to summing z, f(z), or Δz" finding.
- https://experts.okstate.edu/michael.oehrtman/publications — Oehrtman's publication list; used to verify exact citations for the 2016/2019/2022/2023 papers.
- https://link.springer.com/article/10.1007/s40753-019-00092-7 — Oehrtman, Soto-Johnson & Hancock (2019), *IJRUME* 5(3) 394–423, experts' meaning for derivatives/integrals of complex-valued functions.
- https://link.springer.com/article/10.1007/s40753-023-00223-1 — Troup et al., *IJRUME*, geometric reasoning about Cauchy–Riemann via dynamic geometry; embodied→symbolic→formal shifts, amplitwist.
- https://www.sciencedirect.com/science/article/abs/pii/S0732312314000558 — Soto-Johnson & Troup (2014), *JMB* 36 109–125, inscriptions and gesture on the complex plane; representation-switching difficulty.
- https://maa.org/math-values/embodied-cognition-with-hortensia-soto/ — Soto on the embodied-cognition framework and gesture as evidence of reasoning.
- http://sigmaa.maa.org/rume/crume2007/papers/conner-rasmussen-zandieh-smith.pdf — Conner, Rasmussen, Zandieh & Smith (RUME 2007), student understanding of complex numbers; rotation absent from multiplication (expired TLS cert at time of access).
- https://www.academia.edu/26387792/Student_Understanding_of_Complex_Numbers — secondary source citing Danenhower on students' separation of algebraic and geometric representations.
- https://www.sciencedirect.com/science/article/abs/pii/S0732312315000024 — Jones (2015a), *JMB* 38 9–28: area/antiderivative conceptions unproductive; adding-up-pieces productive.
- https://www.sciencedirect.com/science/article/abs/pii/S0732312320300651 — Jones (2020), *JMB* 59, scalar and vector line integrals; part/whole conception mismatch.
- https://link.springer.com/article/10.1007/s40753-022-00206-8 — Dray & Manogue (2023), *IJRUME*, vector line integrals in mathematics and physics.
- https://bridge.math.oregonstate.edu/papers/IJRUMEintegrals.pdf — open PDF of the above; source of chop-multiply-add (CMA), parametric integrals (PI), and the learning trajectory. **Read in full.**
- https://link.springer.com/article/10.1007/s40753-022-00203-x — Jones & Ely (2023), adding up pieces vs accumulation from rate.
- https://stephangarcia.sites.pomona.edu/PAPERS/ACT.pdf — Garcia & Ross (2017), *PRIMUS* 27(8–9) 758–765, "Approaching Cauchy's Theorem". **Read in full**; source of the four-approach comparison and the textbook attributions.
- https://www.tandfonline.com/doi/abs/10.1080/10511970.2016.1234525 — publisher record for the same paper.
- https://www.tandfonline.com/doi/full/10.1080/10511970.2017.1312652 — PRIMUS "Revitalizing Complex Analysis" special-issue editorial (gated).
- https://global.oup.com/academic/product/visual-complex-analysis-9780192868916 — Needham, *Visual Complex Analysis* 25th anniversary ed.; Pólya vector field, work/flux reading of ∮f dz.
- https://www.mdpi.com/2227-7390/9/16/1890 — open-access paper classifying holomorphic functions as Pólya vector fields; div/curl = 0 ⇒ Cauchy.
- https://www.academia.edu/89808713/Visualization_of_Complex_Integration_using_Polya_Vector_Fields — expository treatment of Pólya fields as a teaching tool for complex integration.
- https://math.okstate.edu/people/scurry/5283/sp21/17_Wegert2016_Chapter_VisualExplorationOfComplexFunctions.pdf — Wegert, visual exploration of complex functions via phase portraits.
- https://complex-analysis.com/content/domain_coloring.html — Ponce Campuzano's interactive complex analysis text; phase-portrait section and the "analytic functions are *almost* uniquely determined" caveat.
- https://www.dynamicmath.xyz/domain-coloring/ — the companion interactive domain-colouring tool (prior art for the visual layer).
- https://ocw.mit.edu/courses/18-04-complex-variables-with-applications-spring-2018/f69bc227ae476839819fb18e5b283072_MIT18_04S18_topic9.pdf — Orloff, definite integrals by residues; the integrand-family taxonomy (semicircle / Jordan / keyhole / indented).
- https://ocw.mit.edu/courses/18-04-complex-variables-with-applications-spring-2018/44f1db513a6a17d655abe0b6ff7748fc_MIT18_04S18_topic11.pdf — Orloff, argument principle and winding number.
- https://math.libretexts.org/Bookshelves/Analysis/Complex_Variables_with_Applications_(Orloff)/09:_Residue_Theorem/9.06:_Residue_at — residue at infinity, Orloff's treatment.
- https://en.wikipedia.org/wiki/Residue_at_infinity — why the sign: residues are taken of differential forms, not functions.
- https://en.wikipedia.org/wiki/Jordan%27s_lemma — the half-plane is forced by the sign of a in e^{iaz}.
- https://en.wikipedia.org/wiki/Contour_integration — standard contour taxonomy; deformation invariance away from singularities and cuts.
- https://www.johndcook.com/blog/2022/07/19/keyhole-contour-integrals/ — keyhole/Hankel contour, why it wraps the cut.
- https://www1.spms.ntu.edu.sg/~ydchong/teaching/08_branch_cuts.pdf — Chong's branch-cut notes; principal value is not "the" value, multiplicity of equally legitimate branches.
- https://hci.stanford.edu/courses/cs448b/papers/Tversky_AnimationFacilitate_IJHCS02.pdf — Tversky, Morrison & Bétrancourt (2002), congruence and apprehension principles; animation evidence "not encouraging".
- https://pmc.ncbi.nlm.nih.gov/articles/PMC10176302/ — seductive details hamper learning even without disrupting.
- https://journals.physiology.org/doi/full/10.1152/advan.00102.2019 — decorative animations impair recall and add extraneous load.
- https://itgs.ict.usc.edu/papers/Constructivism_KirschnerEtAl_EP_06.pdf — Kirschner, Sweller & Clark (2006), minimal guidance fails for novices.
- https://arxiv.org/pdf/1306.6544 — Podolefsky et al., implicit scaffolding in PhET sims; guiding without feeling guided.
- https://phet.colorado.edu/en/research — PhET's design-research programme.
- https://link.springer.com/article/10.1007/s10648-023-09745-1 — meta-analysis of the worked-example effect on mathematics performance (g ≈ 0.48).
- https://mrbartonmaths.com/resourcesnew/8.%20Research/Making%20the%20most%20of%20examples/Fading%20out%20and%20Prompts.pdf — Atkinson/Renkl, fading worked steps + self-explanation prompts; near and far transfer.
- https://www.uky.edu/~gmswan3/EDC608/Kalyuga2007_Article_ExpertiseReversalEffectAndItsI.pdf — Kalyuga (2007), expertise reversal; why support must fade.
- https://cdn.vanderbilt.edu/vu-my/wp-content/uploads/sites/3147/2020/01/21230240/RittleJohnson_Star_Durkin_2017_ComparisonChapter.pdf — Rittle-Johnson, Star & Durkin on comparison and contrasting cases.
- https://www.tandfonline.com/doi/abs/10.1080/02635143.2023.2296458 — predict–observe–explain supported by simulations; experimental study.
- https://journals.sagepub.com/doi/10.1177/07356331241226594 — Ji, Guo & Song (2024) three-level meta-analysis of dynamic mathematics software (d = 0.632, 107 studies).
- https://journals.sagepub.com/doi/10.2190/EC.51.3.c — Chan & Leung (2014), DGS systematic review and meta-analysis (SMD ≈ 1.02).
- https://pubs.ams.org/ebooks/stml/076 — Goodman, *Winding Around*; winding number as the organising idea across topology, geometry and analysis.
