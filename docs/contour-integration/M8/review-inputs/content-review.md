## Scope: what actually reaches the screen

Before the per-record pass, the rendering path matters, because most of the prose in the record files is **not** displayed. From `apps/contour-integration/src/shell/app.ts`:

| Record field | Where it appears | Line |
|---|---|---|
| `id` (slug) | the record `<select>` (grouped "tier A" … "tier G") and the record card head | 512, 2285 |
| `title` | record card, under the tier/slug head | 2286 |
| `targets[]` → `targetText()` | record card + derivation "setup" statement, e.g. `∫ (0 → 2π)  1/(a + b*cos(theta))  dtheta` | 226–232, 2289, 1723 |
| `convergence` | `converges conditionally` / `converges as a principal value` | 2292 |
| `auxiliary.integrand` or `targets[0].substitution` → `contourIntegrandText()` | `Contour integrand:` line — raw expression syntax | 2254–2264 |
| `auxiliary.note` → `relationText()` | `the target is ${relation} of ∮ f dz — ${note}` (or `${id} is a TERM of the residue sum, not a functional of ∮ f dz — ${note}`) | 244–253 |
| `closedForm.simplified ?? expr` | `the record claims  ${claim}` | 2316–2317 |
| `golden[k].params` → `fixtureLabel()` | fixture `<select>`: `a = 2, b = 1`, `no parameters`, and variants suffixed ` — alternative derivation, not executable` | 212–217, 2196 |
| `golden[k].method` | folded `<details>` "how the golden value was verified" | 2366 |
| `pieces[].name` | every KILL ledger row (`${piece.name} is the target — …`, `${piece.name} reproduces the target, as a multiple the solve reads off the family`, `${piece.name} must vanish, but …`) and the derivation | ledger.ts 1018, 1111, 1204 |
| `knownValue.method`, `prerequisites.from`, `restrictions` | KILL row `… — imported, not derived here — ${method}`; borrowed-value line; restriction paragraphs | ledger.ts 1137–1138; app.ts 2353, 2371 |
| `hypotheses[].statement`, `traps[].message`, `vanishingLemmas[].sideCondition/discharge`, `residueSelection.set`, `collisions[].note`, `parameters[].constraints` | **not rendered anywhere** (grep over `src/` outside `records/` finds no reader of `.statement`, `.message`, `.sideCondition`) | — |

So the user-facing record text is: slug, title, the composed target line, the contour-integrand line, the relation line, the "record claims" line, piece names, fixture labels, and the folded verification paragraph. I flag those exhaustively below. The unrendered fields (hypotheses statements, trap messages) are quoted only where they contain a mathematical error worth fixing in the data.

Four cross-cutting findings apply to nearly every record and are stated once here rather than 28 times:

**X1 — `the record claims …` prints a fixture-specific or sign-restricted closed form and contradicts the engine's number at several fixtures.** `renderRecordCard` prints `closedForm.simplified` verbatim. For A1 the card says `the record claims 2*pi/sqrt(a^2 - b^2)` at the fixture `a = -2, b = 1`, where the engine (correctly) prints `−2π/√3`. A2 says `2*pi/(1 - a^2)` at `a = 2` (engine: `2π/3`; the form gives `−2π/3`). A3 says `pi/6` at every `n` (engine at `n = 0`: `2π/3`). D4 says `T1 = -pi/4 and T0 = pi/4 for R = 1/(1+x^2)^2` at `p = 1` (engine: `0`). D5 says `T2 = pi^3/8 for R = 1/(1+x^2), given T0 = pi/2` at `p = 2` (engine: `π³/16`). A mathematician will read "the record claims X" beside "= Y" as a bug. Fix: print `closedForm.expr` (the parameter-general form), or evaluate the general form at the binding, or suppress the line when `simplified` is not general.

**X2 — the relation line is false for every record whose target is not a real-linear functional of ∮.** `relationText` composes `the target is ${aux.relation} of ∮ f dz` for all non-sum records. That is true for B1–B3 (arc vanishes, target = Re/Im of the real-axis piece = of ∮). It is **false** on screen for C1 (`the target is Im/2 of ∮ f dz` — ∮ is exactly 0, target π/2), C2 (`Re/2 of ∮` — same), D1–D3/D6/D7/E1/E2/F1 (`Re of ∮` — the target is ∮ divided by `1 + Σ c_j`, e.g. ∮/(1 − e^{2πiα})), D4/D5/E3/F2 (`components of ∮ f dz`, which is not a sentence). CLAUDE.md records this bug as fixed for tier G only. Fix: drop the composed prefix and print the record's own relation sentence, or compose from the solve: "target = (∮ − Σ known limits)/(1 + Σ c_j), then Re".

**X3 — machine expression syntax on screen.** `targetText`, `contourIntegrandText`, `the record claims` all print `@cas/expr` source: `1/(a + b*cos(theta))`, `exp(i*a*z)/(z^2 + b^2)`, `pi*sech(pi*xi/2)`, `(pi/n)/sin(pi/n)`, `d theta`. This is the single largest "amateurish look" item and is uniform across records. Typeset forms are proposed per record below (the LaTeX column).

**X4 — internal research-document citations and house pass numbers appear in on-screen method/provenance text**: `research 06 §2.1, decided over ℚ …` (admissibility.ts 192), `research 06 §3.4: log(x − i0) = log(x + i0) + 2πi` (monodromy.ts 92), `research 03 §8 states this bound without the π … (finding D-2)` (squareSide.ts 195), `Pass 5: a·t = ∮ − Σbᵢ solved in units of π, then Re applied` (solveTarget.ts 241), `the coefficient enters Pass 5's M rather than the right-hand side` (ledger.ts 1114), `declared by \`residueSelection.targetTerms\`` (ledger.ts 1265). Readers have no "research 06"; replace with textbook references or delete.

---

## 1. The 28 records

Format per record: current on-screen strings (quoted exactly) → flags [(a) math/overclaim/ambiguity, (b) jargon/essay voice, (c) notation] → proposal (title; four-line description; LaTeX; reference). References I could not confirm to section/exercise number are marked [verify].

### A1 — `circle-linear-cos`

- Title: `∫₀^{2π} dθ/(a + b cos θ) — the reciprocal-root pair`
- Target line: `∫ (0 → 2π)  1/(a + b*cos(theta))  dtheta`
- Contour integrand: `1/(a + b*cos(theta))   with  z = exp(i*theta),  dtheta = 1/(i*z) dz`
- Piece name: `the unit circle |z| = 1`
- Fixtures: `a = 2, b = 1` · `a = 5, b = 3` · `a = 2, b = -1` · `a = -2, b = 1` · `a = 10, b = -9.5`
- Record claims: `2*pi/sqrt(a^2 - b^2)`
- Verification (fixture 1): `exact residue −i/√(a²−b²) at the enclosed root of the reciprocal pair, in ℚ(i)(√3); cross-checked against a small-circle quadrature at r = 1e-4 and against the contour quadrature`; fixture 4: `the sign case, and the fixture that guards traps.textbook-form-drops-sign: the residue route returns the correct negative value while the textbook closed form returns its positive negation`

Flags: (a) X1 — `2*pi/sqrt(a^2 - b^2)` is wrong at `a = −2`; the general form is `2π sgn(a)/√(a²−b²)`. (b) "the reciprocal-root pair" is house shorthand; the verification note references `traps.textbook-form-drops-sign` (an internal id). (c) X3.

Proposal — Title: **∫₀^{2π} dθ/(a + b cos θ) by the unit circle**.
1. \(\displaystyle\int_0^{2\pi}\frac{d\theta}{a+b\cos\theta}=\frac{2\pi\,\operatorname{sgn}a}{\sqrt{a^2-b^2}},\quad |a|>|b|\).
2. Contour: the unit circle, \(z=e^{i\theta}\), \(d\theta = dz/(iz)\).
3. The two poles are reciprocal, so exactly one lies inside \(|z|=1\); which one depends on the sign of \(a\), and the familiar form \(2\pi/\sqrt{a^2-b^2}\) holds only for \(a>|b|\).
4. Ahlfors, Ch. 4 §5.3 (type (i)); Stein & Shakarchi, Ch. 3, Exercise 8 [verify]; Brown & Churchill, §85 [verify].

### A2 — `circle-poisson`

- Title: `∫₀^{2π} dθ/(1 + a² − 2a cos θ) — the Poisson kernel and its |a| ≶ 1 switch`
- Target line: `∫ (0 → 2π)  1/(1 + a^2 - 2*a*cos(theta))  dtheta`; contour integrand as A1 pattern.
- Fixtures: `a = 0.5` · `a = -0.5` · `a = 2` · `a = -3` · `a = 0` · `a = 0.9`
- Record claims: `2*pi/(1 - a^2)`
- Verification (fixture 3): `|a| > 1, so the ENCLOSED pole is now z = 1/a = 1/2 and Res = i/(1−a²) = −i/3 — the fixture that catches an unconditional 'take z = a', which returns −2π/3 for a squared modulus`

Flags: (a) X1 — `2*pi/(1 - a^2)` is negative at `a = 2`, `a = −3` where the card prints it beside a positive engine value. (b) "its |a| ≶ 1 switch", "catches", ALL-CAPS. (c) X3.

Proposal — Title: **∫₀^{2π} dθ/(1 − 2a cos θ + a²) by the unit circle**.
1. \(\displaystyle\int_0^{2\pi}\frac{d\theta}{1-2a\cos\theta+a^2}=\frac{2\pi}{|1-a^2|},\quad |a|\ne1\).
2. Contour: the unit circle, \(z=e^{i\theta}\).
3. The integrand is \(|1-ae^{i\theta}|^{-2}\); the poles \(a\) and \(1/a\) exchange roles as \(|a|\) crosses 1, and the enclosed one must be decided, not assumed.
4. Ahlfors, Ch. 4 §6.3 (the Poisson kernel) [verify]; Conway, Ch. V §2, Exercises [verify].

### A3 — `circle-cos-n-theta`

- Title: `∫₀^{2π} cos nθ/(5 − 4 cos θ) dθ — the order-n pole the substitution manufactures at z = 0`
- Fixtures: `n = 2` · `n = 0` · `n = 1` · `n = 3` · `n = 4`
- Record claims: `pi/6`
- Verification (n = 2): `Σ over the two ENCLOSED poles: Res(f,1/2) = −17i/24 and the order-2 origin Res(f,0) = 5i/8, giving Σ = −i/12; cross-checked against a small-circle quadrature at r = 1e-4 (0.624999999999944 i at the origin) and against the contour quadrature`; (n = 4): `… makes 'the manufactured order equals the harmonic index' a tested statement rather than an anecdote`

Flags: (a) X1 — `pi/6` shown at all `n`; general form `(2π/3)·2^{−n}`. (b) "manufactures", "anecdote". (c) X3.

Proposal — Title: **∫₀^{2π} cos nθ dθ/(5 − 4 cos θ) by the unit circle**.
1. \(\displaystyle\int_0^{2\pi}\frac{\cos n\theta}{5-4\cos\theta}\,d\theta=\frac{2\pi}{3}\,2^{-n},\quad n\ge0\).
2. Contour: the unit circle, \(z=e^{i\theta}\).
3. The substitution introduces a pole of order \(n\) at \(z=0\) that the real integrand does not show; omitting it gives \(17\pi/12\) at \(n=2\) in place of \(\pi/6\).
4. Brown & Churchill, §85, Exercises [verify]; Marsden & Hoffman, §4.3, Exercises [verify].

### A4 — `circle-cif-taylor`

- Title: `∫₀^{2π} e^{cos θ} cos(sin θ − nθ) dθ = 2π/n! — an entire integrand with no residue of its own`
- Contour integrand line: `exp(z)/z^n`
- Relation line: `the target is Re of ∮ f dz — e^{cos θ}cos(sin θ − nθ) = Re[e^{e^{iθ}} e^{−inθ}]; the imaginary part is the free companion ∫ e^{cos θ}sin(sin θ − nθ) dθ = 0`
- Fixtures: `g = exp(z), n = 0` · `…, n = 1` · `…, n = 2` · `…, n = 3` · `…, n = 5`
- Record claims: `2*pi/factorial(n)`
- Verification (n = 0): `the manufactured pole is SIMPLE here, so Res = g(0)/i = −i and 2πi·Res = 2π — the mean-value property of a harmonic function over a circle, and the base case of the order ladder`

Flags: (a) The "Contour integrand" line prints `exp(z)/z^n`, which is the pre-Jacobian auxiliary; the contour integrand actually integrated is \(e^z/(iz^{n+1})\). As printed the line contradicts the pole order shown in the CATCH rows (order \(n+1\)). (a) "the free companion" ∫ e^{cos θ} sin(sin θ − nθ) dθ = 0 is correct. (b) "manufactured", "order ladder", "free companion". (c) fixture label `g = exp(z)` exposes an internal symbol.

Proposal — Title: **∫₀^{2π} e^{cos θ} cos(sin θ − nθ) dθ by Cauchy's integral formula**.
1. \(\displaystyle\int_0^{2\pi}e^{\cos\theta}\cos(\sin\theta-n\theta)\,d\theta=\frac{2\pi}{n!}\).
2. Contour: the unit circle; the integrand is \(\operatorname{Re}\bigl[e^{e^{i\theta}}e^{-in\theta}\bigr]\), so \(\oint e^{z}\,dz/(iz^{n+1})\).
3. The only singularity is supplied by \(dz/(iz)\) and the factor \(z^{-n}\); the residue is the \(n\)-th Taylor coefficient of \(e^z\), i.e. Cauchy's formula for derivatives.
4. Ahlfors, Ch. 4 §2.3 (Cauchy's integral formula, higher derivatives); Brown & Churchill, §85, Exercises [verify].

### A5 — `semicircle-order2`

- Title: `∫_ℝ dx/(1+x²)² = π/2 — the large semicircle and an order-2 pole`
- Contour integrand: `1/(1 + x^2)^2   read in z — the real axis IS a piece of the contour`
- Pieces: `the real segment [−R, R]` · `the R → ∞ semicircle`
- Fixtures: `no parameters` · `halfRange = true — alternative derivation, not executable`
- Record claims: `pi/2`
- Verification: `exact residue by the order-2 derivative formula, cross-checked by the Laurent series in w = z−i (which needs no factorial) and by a small-circle quadrature at r = 1e-4`

Flags: (b) "read in z — the real axis IS a piece of the contour" (caps, aside). (c) `∫_ℝ` vs `∫ (−∞ → ∞)`; the fixture label `halfRange = true` is an internal flag name; "the R → ∞ semicircle" should be \(\Gamma_R\).

Proposal — Title: **∫_{−∞}^{∞} dx/(1+x²)² by a semicircle**.
1. \(\displaystyle\int_{-\infty}^{\infty}\frac{dx}{(1+x^2)^2}=\frac{\pi}{2}\).
2. Contour: \([-R,R]\) closed by \(\Gamma_R\), the upper semicircle \(|z|=R\).
3. A double pole at \(i\): the residue needs the derivative formula (or the Laurent series); the simple-pole quotient \(P/Q'\) is \(0/0\) there.
4. Ahlfors, Ch. 4 §5.3 (type (ii)); Brown & Churchill, §79, Exercises [verify]; Conway, Ch. V §2, Exercise 1 [verify].

### A6 — `semicircle-quartic`

- Title: `∫_ℝ dx/(1+x⁴) = π/√2 — algebraic poles, P·(Q′)⁻¹ mod Q, and the half-plane ladder`
- Fixtures: `no parameters` · `closeDown = true — alternative derivation, not executable`
- Record claims: `pi/sqrt(2)`
- Verification: `Res ≡ −z/4 in ℚ(i)[z]/⟨z⁴+1⟩ (verified by 4z³·(−z/4) = −z⁴ ≡ 1) summed over the rung-2 radical split, cross-checked against the two upper roots' numeric residues to 12 s.f. and against a contour quadrature`

Flags: (b) "P·(Q′)⁻¹ mod Q", "half-plane ladder", "rung-2 radical split" are engine internals. (c) `closeDown` label.

Proposal — Title: **∫_{−∞}^{∞} dx/(1+x⁴) by a semicircle**.
1. \(\displaystyle\int_{-\infty}^{\infty}\frac{dx}{1+x^4}=\frac{\pi}{\sqrt2}\).
2. Contour: \([-R,R]\) closed by \(\Gamma_R\) in the upper half-plane.
3. Only the two poles \(e^{i\pi/4},e^{3i\pi/4}\) in the upper half-plane are summed; the sum over all four residues is \(0\).
4. Brown & Churchill, §79, Exercise 4 [verify]; Marsden & Hoffman, §4.3, Example [verify]; Stein & Shakarchi, Ch. 3 §2.1 [verify].

### A7 — `semicircle-order3`

- Title: `∫_ℝ x² dx/(1+x²)³ = π/8 — an order-3 pole and why the series route wins`
- Fixtures: `no parameters` · `halfRange = true — …`
- Record claims: `pi/8`
- Verification: `the Laurent route (c₋₁ of the truncated series in w = z−i, no factorial anywhere) cross-checked against the (m−1)-derivative route (1/2!)·d²[z²(z+i)⁻³]|_{z=i} and against a small-circle quadrature at r = 1e-4 — two routes that share no arithmetic, which is what makes the factorial trap detectable`

Flags: (b) "why the series route wins", "factorial trap". (c) as A5.

Proposal — Title: **∫_{−∞}^{∞} x² dx/(1+x²)³ by a semicircle**.
1. \(\displaystyle\int_{-\infty}^{\infty}\frac{x^2\,dx}{(1+x^2)^3}=\frac{\pi}{8}\).
2. Contour: \([-R,R]\) closed by \(\Gamma_R\).
3. A pole of order 3 at \(i\): \(\operatorname{Res}(f,i)=\tfrac1{2!}\frac{d^2}{dz^2}\bigl[(z-i)^3f\bigr]_{z=i}\); omitting the \(1/2!\) doubles the answer.
4. Brown & Churchill, §79, Exercises [verify]; Marsden & Hoffman, §4.3 [verify].

### B1 — `jordan-cosine-kernel`

- Title: `∫_ℝ cos(ax)/(x²+b²) dx = (π/b) e^{−ab} — Jordan, and the sign of a as a hard branch`
- Contour integrand: `exp(i*a*z)/(z^2 + b^2)`
- Relation: `the target is Re of ∮ f dz — cos(ax) = Re e^{iax}; the contour sees the exponential and the target takes the real part at the end`
- Pieces: `the real segment [−R, R]` · `the R → ∞ semicircle (upper when a > 0, lower when a < 0)`
- Fixtures: `a = 1, b = 1` · `a = 2, b = 3` · `a = 0.5, b = 2` · `a = -1, b = 1` · `a = 3, b = 0.5` · `a = 0, b = 1`
- Record claims: `(pi/abs(b))*exp(-abs(a)*abs(b))`
- Verification (a = −1): `THE SIGN CASE: a < 0 closes through the LOWER half-plane, the enclosed pole becomes −i, the closed path runs clockwise, and the two sign flips cancel to the same π/e — which is what \`derived.sgnA\` exists to make executable rather than commented`; (a = 0): `THE DEGENERATION: at a = 0 the exponential is 1, Jordan's π/|a| is infinite and says nothing, and plain ML discharges the arc instead — the fixture that catches an engine treating π/0 as a failure`

Flags: (a) Title states `(π/b) e^{−ab}` without `a, b > 0`; the record's own general form has absolute values. (b) "a hard branch", "the contour sees", `derived.sgnA`. (c) X3; the record claims line is the general form, which is good, but in expression syntax.

Proposal — Title: **∫_{−∞}^{∞} cos(ax) dx/(x²+b²) by Jordan's lemma**.
1. \(\displaystyle\int_{-\infty}^{\infty}\frac{\cos ax}{x^2+b^2}\,dx=\frac{\pi}{|b|}e^{-|ab|}\).
2. Contour: \([-R,R]\) closed by \(\Gamma_R\) in the half-plane \(a\operatorname{Im}z\ge0\); integrand \(e^{iaz}/(z^2+b^2)\).
3. \(\cos ax\) is replaced by \(e^{iax}\), whose modulus is bounded in one half-plane only; the sign of \(a\) fixes the side of closure, and Jordan's lemma disposes of \(\Gamma_R\).
4. Ahlfors, Ch. 4 §5.3 (type (iii)) and Exercise 5 [verify]; Brown & Churchill, §80–81; Stein & Shakarchi, Ch. 3, Exercise 3 [verify].

### B2 — `jordan-strict`

- Title: `∫_ℝ x sin x/(1+x²) dx = π/e — where ML is not merely loose but useless`
- Relation: `the target is Im of ∮ f dz — sin x = Im e^{ix}; the IMAGINARY part is the target here, and the real part is the free companion ∫ x cos x/(1+x²) = 0`
- Pieces: `the real segment [−R, R]` · `the R → ∞ semicircle (upper: a = 1 > 0)`
- Fixtures: `no parameters` · `companion = re — alternative derivation, not executable`
- Record claims: `pi/exp(1)`
- Verification: `Res(z e^{iz}/(1+z²), i) = i e^{−1}/(2i) = e^{−1}/2 exactly in the exponential basis, so 2πi·Res = iπ/e and the IMAGINARY part is the target; cross-checked against a small-circle quadrature (0.183939720585720) and the contour quadrature to 7.7e-16 relative`

Flags: (b) "not merely loose but useless" is essay voice. (c) "ML" unexplained; `companion = re` label.

Proposal — Title: **∫_{−∞}^{∞} x sin x dx/(1+x²) by Jordan's lemma**.
1. \(\displaystyle\int_{-\infty}^{\infty}\frac{x\sin x}{1+x^2}\,dx=\frac{\pi}{e}\) (conditionally convergent).
2. Contour: \([-R,R]\) closed by \(\Gamma_R\), integrand \(ze^{iz}/(1+z^2)\).
3. \(\deg Q-\deg P=1\), so the \(ML\)-estimate on \(\Gamma_R\) tends to \(\pi\), not \(0\); Jordan's lemma, which needs only \(\max_{\Gamma_R}|z/(1+z^2)|\to0\), is required.
4. Ahlfors, Ch. 4 §5.3, Exercise 6 [verify]; Brown & Churchill, §81 (Jordan's lemma); Marsden & Hoffman, §4.3 [verify].

### B3 — `jordan-quartic`

- Title: `∫_ℝ cos x/(1+x⁴) dx — algebraic poles with transcendental residues`
- Relation: `the target is Re of ∮ f dz — cos x = Re e^{ix}; the imaginary part is the free companion ∫ sin x/(1+x⁴) = 0, by parity`
- Fixtures: `no parameters` · `companion = sin — …`
- Record claims: `(pi/sqrt(2))*exp(-1/sqrt(2))*(cos(1/sqrt(2)) + sin(1/sqrt(2)))`
- Verification: `the two upper residues are −α e^{iα}/4 at α = e^{±iπ/4}, carried exactly as (π√2/4 ∓ πi√2/4)·e^{−√2/2 ± i√2/2}; the form is \`=\` and the decimal is \`≈\` because certifying exp/cos/sin at 1/√2 needs enclosures PLAN §3.2 deferred to tier 3. Cross-checked against the contour quadrature`

Flags: (b) `PLAN §3.2`, "tier 3" on screen. (c) X3.

Proposal — Title: **∫_{−∞}^{∞} cos x dx/(1+x⁴) by Jordan's lemma**.
1. \(\displaystyle\int_{-\infty}^{\infty}\frac{\cos x}{1+x^4}\,dx=\frac{\pi}{\sqrt2}e^{-1/\sqrt2}\Bigl(\cos\tfrac1{\sqrt2}+\sin\tfrac1{\sqrt2}\Bigr)\).
2. Contour: \([-R,R]\) closed by \(\Gamma_R\), integrand \(e^{iz}/(1+z^4)\).
3. The residues at \(e^{i\pi/4},e^{3i\pi/4}\) carry \(e^{iz_k}\); the identity \(\sum\text{all residues}=0\) of the rational case no longer holds, since \(e^{iz}\) is essentially singular at \(\infty\).
4. Brown & Churchill, §80, Exercises [verify]; Marsden & Hoffman, §4.3, Exercises [verify].

### C1 — `indented-sinc`

- Title: `Dirichlet integral: ∫₀^∞ sin x / x dx = π/2, by the indented semicircle`
- Target line: `∫ (0 → ∞)  sin(x)/x  dx` + `converges conditionally`
- Relation: `the target is Im/2 of ∮ f dz — sin x = Im e^{ix} on ℝ; the real part ∫cos x/x diverges at the origin, which is why the auxiliary needs a principal value and the target does not`
- Pieces: `the real axis, left of the indentation` · `the ρ → 0 indentation over z = 0` · `the real axis, right of the indentation` · `the R → ∞ semicircle`
- Fixtures: `no parameters` · `form = pv — alternative derivation, not executable`
- Record claims: `pi/2`
- Verification: `the residue sum is EMPTY and the whole value is L4's iα·Res at α = −π: Res(e^{iz}/z, 0) = 1, so p.v.∫_ℝ e^{ix}/x dx = iπ and the target is Im(iπ)/2 = π/2. Independently verified two ways in research: (a) half-period decomposition …; (b) 64-point Gauss–Legendre per half period to A = 40π plus the alternating asymptotic tail — both give 1.5707963267948961, relative 2.8e-16`

Flags: (a) X2 — `the target is Im/2 of ∮ f dz` is false: \(\oint=0\). (b) "L4", "in research". (c) `form = pv`.

Proposal — Title: **∫₀^{∞} sin x dx/x by an indented semicircle**.
1. \(\displaystyle\int_0^{\infty}\frac{\sin x}{x}\,dx=\frac{\pi}{2}\) (conditionally convergent).
2. Contour: \([-R,-\rho]\cup\gamma_\rho\cup[\rho,R]\cup\Gamma_R\), \(\gamma_\rho\) the small semicircle over \(0\); integrand \(e^{iz}/z\).
3. No pole is enclosed, so \(\oint=0\); the answer comes entirely from the indentation, \(\int_{\gamma_\rho}\to-i\pi\operatorname{Res}(f,0)\), a half of \(2\pi i\operatorname{Res}\).
4. Brown & Churchill, §82 (indented paths); Conway, Ch. V §2, Example 2.9 [verify]; Stein & Shakarchi, Ch. 2, Exercise 2 [verify].

### C2 — `removable-one-minus-cos`

- Title: `∫₀^∞ (1 − cos x)/x² dx = π/2 — removability detected, indentation not needed`
- Contour integrand: `(1 - exp(i*z) + i*z)/z^2`
- Relation: `the target is Re/2 of ∮ f dz — Re(f|_ℝ) = (1 − cos x)/x² exactly; the added i·z contributes only to the odd imaginary part on ℝ and so cancels over a symmetric range`
- Pieces: `the real axis, undivided` · `the R → ∞ semicircle`
- Fixtures: `no parameters` · `route = indented — …`
- Record claims: `pi/2`
- Verification: `the residue sum is EMPTY (the auxiliary is entire, verified by an exact Taylor expansion at the origin) and the whole value is L5's iα·L with L = i, α = π: ∮ = 0 gives ∫_ℝ = π and the target is Re(π)/2 = π/2. Independently verified in research two ways …`

Flags: (a) X2 — `Re/2 of ∮` is false (∮ = 0; the arc contributes \(-\pi\)). (b) "detected", "L5". (c) `route = indented`.

Proposal — Title: **∫₀^{∞} (1 − cos x) dx/x² by a semicircle**.
1. \(\displaystyle\int_0^{\infty}\frac{1-\cos x}{x^2}\,dx=\frac{\pi}{2}\).
2. Contour: \([-R,R]\) closed by \(\Gamma_R\); integrand \((1-e^{iz}+iz)/z^2\), which is entire.
3. Subtracting the principal part \(i/z\) removes the singularity at \(0\), so no indentation is needed; the subtracted term reappears on \(\Gamma_R\), where \(zf(z)\to i\) and \(\int_{\Gamma_R}\to-\pi\).
4. Stein & Shakarchi, Ch. 2 §1, Example 2 [verify] (same integral, by the indented route); Brown & Churchill, §82, Exercises [verify].

### C3 — `pv-sine-over-x-times-quadratic`

- Title: `∫_ℝ sin x/(x(x²+b²)) dx = (π/b²)(1 − e^{−b}) — a real pole and a complex pole together`
- Relation: `the target is Im of ∮ f dz — sin x = Im e^{ix}; the REAL part ∫cos x/(x(x²+b²)) diverges at the origin, so the auxiliary needs a principal value while the target does not`
- Pieces: `the real axis, x < −ρ` · `the indentation over the real pole z = 0` · `the real axis, x > ρ` · `the R → ∞ semicircle`
- Fixtures: `b = 1` · `b = 2`
- Record claims: `(pi/b^2)*(1 - exp(-b))`
- Verification (b = 1): `BOTH mechanisms: the enclosed pole at i contributes 2πi·Res = −iπ/e and the indented pole at 0 contributes −iπ·Res = −iπ, and Im of their difference is π(1 − 1/e). …`

Flags: (a) X2 — `Im of ∮` omits the indentation term. (b) "BOTH mechanisms". (c) X3.

Proposal — Title: **∫_{−∞}^{∞} sin x dx/(x(x²+b²)) by an indented semicircle**.
1. \(\displaystyle\int_{-\infty}^{\infty}\frac{\sin x}{x(x^2+b^2)}\,dx=\frac{\pi}{b^2}\bigl(1-e^{-b}\bigr),\quad b>0\).
2. Contour: real axis indented over \(0\), closed by \(\Gamma_R\); integrand \(e^{iz}/(z(z^2+b^2))\).
3. The pole at \(ib\) contributes \(2\pi i\operatorname{Res}\); the pole at \(0\), on the path, contributes \(-i\pi\operatorname{Res}\) through the indentation. The principal value belongs to the auxiliary integral; the target converges absolutely.
4. Brown & Churchill, §82, Exercises [verify]; Marsden & Hoffman, §4.3, Exercises [verify].

### D1 — `mellin-keyhole`

- Title: `∫₀^∞ x^(α−1)/(1+x) dx = π/sin(πα): the keyhole and Euler reflection`
- Contour integrand: `z^(alpha-1)/(1+z)`
- Relation: `the target is Re of ∮ f dz — the upper edge is the target itself; the lower edge is the target times −e^{2πi(α−1)}, and the two together multiply the unknown by 1 − e^{2πiα}`
- Pieces: `the upper edge of the cut` · `the R → ∞ circle` · `the lower edge of the cut` · `the ε → 0 circle`
- Fixtures: `alpha = 0.3` · `alpha = 0.5` · `alpha = 0.75` · `alpha = 0.1` · `alpha = 0.9`
- Record claims: `pi/sin(pi*alpha)`
- Verification (α = 0.3): `double-exponential (exp-sinh) quadrature on (0, inf), which absorbs the x^(alpha-1) endpoint singularity; all five points agree with pi/sin(pi alpha) to <= 7e-16 relative. Contour bookkeeping verified independently: … — the inner circle is still 1.1e-2 at eps=1e-9, since it vanishes only like eps^0.3, which is a good live demonstration of a slow limit`

Flags: (a) X2 (target is \(\oint/(1-e^{2\pi i\alpha})\), not `Re of ∮`). (a) "Euler reflection" is fine but the record never displays the identity \(\Gamma(\alpha)\Gamma(1-\alpha)=\pi/\sin\pi\alpha\); either state it or drop the phrase. (b) "a good live demonstration". (c) `alpha` spelled out; `x^(α−1)` mixed.

Proposal — Title: **∫₀^{∞} x^{α−1} dx/(1+x) by a keyhole**.
1. \(\displaystyle\int_0^{\infty}\frac{x^{\alpha-1}}{1+x}\,dx=\frac{\pi}{\sin\pi\alpha},\quad 0<\alpha<1\).
2. Contour: the keyhole about \([0,\infty)\) — both edges of the cut, the circle \(|z|=R\), the circle \(|z|=\varepsilon\); branch \(\arg z\in[0,2\pi)\).
3. The lower edge returns \(-e^{2\pi i(\alpha-1)}\) times the target, so \((1-e^{2\pi i\alpha})I=2\pi i\operatorname{Res}(f,-1)\) with \((-1)^{\alpha-1}=e^{i\pi(\alpha-1)}\) in the chosen branch; the two circles are disposed of by \(\alpha<1\) and \(\alpha>0\) respectively.
4. Brown & Churchill, §84 (integration along a branch cut); Conway, Ch. V §2, Exercise 2.12 [verify]; Marsden & Hoffman, §4.3 [verify]; Ahlfors, Ch. 4 §5.3 (the \(x^{\alpha}R(x)\) case) [verify].

### D2 — `keyhole-two-poles`

- Title: `∫₀^∞ x^(s−1)/((x+p)(x+q)) dx = (π/sin πs)·(p^(s−1) − q^(s−1))/(q − p)`
- Relation: `the target is Re of ∮ f dz — the upper edge is the target itself; the lower edge is the target times −e^{2πi(s−1)}, which at s = 3/2 is +1 — so the two edges ADD rather than fight`
- Pieces: `the upper edge, arg z = 0+` · `the R → ∞ circle` · `the lower edge, arg z = 2π−` · `the ε → 0 circle`
- Fixtures: `s = 1.5, p = 2, q = 4` · `s = 1.5, p = 1, q = 3`
- Record claims: `(pi/sin(pi*s)) * (p^(s-1) - q^(s-1))/(q - p)`
- Verification: `(a) exp-sinh DE quadrature on (0, inf) -> 0.92015118451061029 (rel 0.0e0); (b) x = t^2 to remove the sqrt, then a split at t = 1 with t -> 1/u on (1, inf), composite 60-pt Gauss-Legendre -> 0.92015118451059041 (rel 2.2e-14). Contour: … c recovered as +1 to 2.2e-5 (the edge truncation, not the factor)`; fixture 2: `… the second fixture exists because p = 1 makes ln p = 0, so it is the one that would still pass if the pole modulus were dropped from the OTHER pole only`

Flags: (a) X2. (b) "ADD rather than fight". (c) X3.

Proposal — Title: **∫₀^{∞} x^{s−1} dx/((x+p)(x+q)) by a keyhole**.
1. \(\displaystyle\int_0^{\infty}\frac{x^{s-1}\,dx}{(x+p)(x+q)}=\frac{\pi}{\sin\pi s}\cdot\frac{p^{s-1}-q^{s-1}}{q-p},\quad 0<s<2,\ p,q>0\).
2. Contour: the keyhole about \([0,\infty)\), \(\arg z\in[0,2\pi)\).
3. Two poles on the negative axis, \(-p=pe^{i\pi}\), \(-q=qe^{i\pi}\): each \((-p)^{s-1}=p^{s-1}e^{i\pi(s-1)}\) carries both the modulus and the branch argument.
4. Brown & Churchill, §84, Exercises [verify]; Ahlfors, Ch. 4 §5.3 [verify].

### D3 — `keyhole-x-to-the-n`

- Title: `∫₀^∞ x^(a−1)/(1+xⁿ) dx = (π/n)/sin(πa/n): the two-parameter keyhole`
- Relation: `the target is Re of ∮ f dz — the residue sum over the n-th roots of −1 is a geometric series in e^{2πia/n}, and the (1 − e^{2πia}) it produces is the SAME factor the two edges contribute — so the two cancel and what is left is sin(πa/n)`
- Fixtures: `a = 1.5, n = 4` · `a = 0.5, n = 2` · `a = 2.3, n = 5` · `a = 3, n = 7` · `a = 1, n = 3`
- Record claims: `(pi/n)/sin(pi*a/n)`
- Verification (a = 3, n = 7): `INTEGER a: the VALUE is right and the keyhole DERIVATION is degenerate. This entry must appear in refusals.json as well as here`
- Record note (printed as a "repair" paragraph when a fixture refuses): `keyhole-x-to-the-n: Pass 5 refused — …` (from `runFamily`)

Flags: (a) X2. (a) The integer-`a` fixtures are offered in the picker and refuse on selection; the on-screen note is engine-internal (`Pass 5 refused`). The mathematics is right (the keyhole degenerates; the wedge, F1, does not) but the reader should see "at integer \(a\) the integrand is single-valued and the keyhole gives no information; see the wedge contour" rather than a refusal string. (b) "refusals.json". (c) X3.

Proposal — Title: **∫₀^{∞} x^{a−1} dx/(1+xⁿ) by a keyhole**.
1. \(\displaystyle\int_0^{\infty}\frac{x^{a-1}}{1+x^n}\,dx=\frac{\pi/n}{\sin(\pi a/n)},\quad 0<a<n\).
2. Contour: the keyhole about \([0,\infty)\), \(\arg z\in[0,2\pi)\).
3. The residues at the \(n\) roots of \(-1\) form a geometric progression whose sum carries the factor \(1-e^{2\pi ia}\) that also multiplies the unknown, so it cancels; at integer \(a\) the keyhole argument collapses and the wedge of angle \(2\pi/n\) must be used.
4. Conway, Ch. V §2, Exercises [verify]; Marsden & Hoffman, §4.3, Exercises [verify].

### D4 — `log-squared-keyhole`

- Title: `∫₀^∞ R(x) log x dx by the log² keyhole — and ∫₀^∞ R(x) dx for free`
- Target lines (three): `∫ (0 → ∞)  1/(1+x^2)^p  dx`, `∫ (0 → ∞)  log(x)/(1+x^2)^p  dx`, `∫ (0 → ∞)  log(x)^2/(1+x^2)^p  dx`
- Contour integrand: `log(z)^2/(1+z^2)^p`
- Relation: `the target is components of ∮ f dz — the upper edge carries log²x; the lower edge carries (log x + 2πi)², so the log² terms cancel and the remainder is affine in ∫R log x and ∫R`
- Pieces: `the upper edge, log z = log x` · `the R → ∞ circle` · `the lower edge, log z = log x + 2πi` · `the ε → 0 circle`
- Fixtures: `p = 2` · `p = 1`
- Record claims: `T1 = -pi/4 and T0 = pi/4 for R = 1/(1+x^2)^2`
- Bonus lines: `${targetText} — from the same contour`; invisible: `?`-badged sentences from `solveTarget` (e.g. that `T2`'s column is zero).
- Verification (p = 2): `(a) exp-sinh DE quadrature … (b) the fold x -> 1/x onto (0,1), giving int_0^1 log u (1-u^2)/(1+u^2)^2 du, tanh-sinh … Contour bookkeeping verified independently: the keyhole total = 2 pi i Sigma to 1.0e-14 …`

Flags: (a) X1 (wrong at `p = 1`), X2 (`components of ∮ f dz` is not a sentence). (a) Title `R(x)` but the record only varies `p`; on screen the reader sees `1/(1+x^2)^p`. (b) "for free". (c) X3; "T0/T1/T2" ids surface in bonus lines.

Proposal — Title: **∫₀^{∞} log x dx/(1+x²)² by a keyhole with (log z)²**.
1. \(\displaystyle\int_0^{\infty}\frac{\log x}{(1+x^2)^2}\,dx=-\frac{\pi}{4}\), and from the same identity \(\displaystyle\int_0^{\infty}\frac{dx}{(1+x^2)^2}=\frac{\pi}{4}\).
2. Contour: the keyhole about \([0,\infty)\); integrand \((\log z)^2/(1+z^2)^2\), \(\arg z\in[0,2\pi)\).
3. With \(\log z\) alone the log-integral cancels between the two edges; with \((\log z)^2\) the \((\log x+2\pi i)^2\) on the lower edge leaves an identity linear in \(\int R\log x\) and \(\int R\), whose real and imaginary parts determine both.
4. Stein & Shakarchi, Ch. 3, Exercise 10 [verify]; Ahlfors, Ch. 4 §5.3 (the \(R(x)\log x\) case, by the upper half-plane) [verify]; Brown & Churchill, §83 [verify].

### D5 — `log-cubed-keyhole`

- Title: `∫₀^∞ R(x) (log x)² dx by the log³ keyhole — which does not close alone`
- Four target lines (`1/(1+x^2)^p`, `log(x)/…`, `log(x)^2/…`, `log(x)^3/…`)
- Relation: `the target is components of ∮ f dz — the upper edge carries log³x; the lower edge carries (log x + 2πi)³, so the log³ terms cancel and all THREE lower powers survive the binomial`
- Borrowed line: `T0 = π/2, borrowed from 'log-squared-keyhole'` / `… resolved by running that record at the same bindings; its own verdict is =`
- Fixtures: `p = 1` · `p = 2`
- Record claims: `T2 = pi^3/8 for R = 1/(1+x^2), given T0 = pi/2`
- Verification (p = 1): `exp-sinh DE quadrature on (0, inf) via x = e^t -> 3.8757845850373167 (rel 4.2e-14); and the classical Mellin route M''(1) for M(s) = (pi/2)csc(pi s/2). Contour bookkeeping: Sigma3 = 13 pi^3/8 is purely REAL, which is also the consistency check Im Sigma3 = 0 <=> T1 = 0`

Flags: (a) X1 (wrong at `p = 2`), X2. (b) "does not close alone", "survive the binomial". (c) as D4.

Proposal — Title: **∫₀^{∞} (log x)² dx/(1+x²) by a keyhole with (log z)³**.
1. \(\displaystyle\int_0^{\infty}\frac{(\log x)^2}{1+x^2}\,dx=\frac{\pi^3}{8}\).
2. Contour: the keyhole about \([0,\infty)\); integrand \((\log z)^3/(1+z^2)\).
3. The identity gives two real equations in three unknowns; \(\int(\log x)^2R\) is determined only modulo \(\int R\,dx=\pi/2\), which must be supplied separately.
4. Brown & Churchill, §83, Exercises [verify]; Conway, Ch. V §2, Exercises [verify].

### D6 — `dogbone-inverse-sqrt`

- Title: `∫₋₁¹ dx/((x²+a²)√(1−x²)) = π/(a√(1+a²))`
- Contour integrand: `1/((z^2+a^2)*sqrt(1-z^2))`
- Relation: `the target is Re of ∮ f dz — the upper edge is the target itself; the lower edge is the target times +1, because W changes SIGN across the cut and the traversal is reversed — two minus signs, and the edges ADD`
- Pieces: `the upper edge of the cut, left to right` · `the η-circle round z = 1, upper lip to lower` · `the lower edge of the cut, right to left` · `the η-circle round z = −1, lower lip to upper`
- Fixtures: `a = 1` · `a = 2` · `a = 0.5` · `a = 3.7`
- Record claims: `pi/(a*sqrt(1+a^2))`
- Verification (a = 3.7): `… 1 + a^2 = 1469/100 = (13 * 113)/(2^2 * 5^2), the fixture that exercises the trial division rather than a prime anyone would have guessed`
- Solve statement (derivation): `∮ f dz = 2πi [ Σₖ (n(γ,aₖ) − σ)·Res(f,aₖ) − σ·Res(f,∞) ],  σ = n(γ, branch point)`

Flags: (a) X2 (target = ∮/2). (a) "W" in the relation line is undefined on screen (it is the record's internal name for \(\sqrt{1-z^2}\)). (b) "ADD", "trial division". (c) X3; "η-circle round z = 1, upper lip to lower" → \(|z-1|=\eta\).

Proposal — Title: **∫_{−1}^{1} dx/((x²+a²)√(1−x²)) by a dogbone**.
1. \(\displaystyle\int_{-1}^{1}\frac{dx}{(x^2+a^2)\sqrt{1-x^2}}=\frac{\pi}{a\sqrt{1+a^2}},\quad a>0\).
2. Contour: the dogbone about the cut \([-1,1]\) — both edges and the circles \(|z\mp1|=\eta\); \(\sqrt{1-z^2}\) taken positive on the upper edge.
3. The contour encloses no pole, yet \(\oint\ne0\): the integrand is not holomorphic inside because the cut is. The exterior form of the residue theorem applies, with \(\operatorname{Res}(f,\infty)=0\) here.
4. Marsden & Hoffman, §4.3, Exercises [verify]; Ahlfors, Ch. 4 §5.3 (compare the substitution \(x=\sin\theta\), which reduces it to a unit-circle integral).

### D7 — `dogbone-two-fractional-powers`

- Title: `∫₀^b x^μ (b−x)^(1−μ)/(c−x) dx = (π/sin πμ)·(c − (1−μ)b − c^μ(c−b)^(1−μ))`
- Relation: `the target is Re of ∮ f dz — the upper edge is the target itself; the lower edge is the target times −e^{2πiμ}, which at μ = 3/4 is +i — so the two edges neither cancel nor add, and the solve divides by 1 + i`
- Pieces: `the upper edge, left to right (arg z = 0, arg(b−z) = 0)` · `the η-circle round z = b, upper lip to lower` · `the lower edge, right to left (arg z = 2π)` · `the η-circle round z = 0, lower lip to upper`
- Fixtures: `mu = 0.75, b = 3, c = 5` · `mu = 0.25, b = 3, c = 5` · `mu = 0.5, b = 2, c = 7` · `mu = 0.25, b = 4, c = 10`
- Record claims: `(pi/sin(pi*mu)) * ( c - (1-mu)*b - c^mu*(c-b)^(1-mu) )`

Flags: (a) X2. (b) "the solve divides by 1 + i". (c) X3, `mu`.

Proposal — Title: **∫₀^{b} x^{μ}(b−x)^{1−μ} dx/(c−x) by a dogbone**.
1. \(\displaystyle\int_0^{b}\frac{x^{\mu}(b-x)^{1-\mu}}{c-x}\,dx=\frac{\pi}{\sin\pi\mu}\Bigl(c-(1-\mu)b-c^{\mu}(c-b)^{1-\mu}\Bigr),\quad 0<\mu<1,\ c>b>0\).
2. Contour: the dogbone about \([0,b]\); \(\arg z\in[0,2\pi)\), \(\arg(b-z)\in(-\pi,\pi]\).
3. The exponents sum to \(1\), so the bounded cut is admissible; \(f\to e^{i\pi\mu}\ne0\) at \(\infty\), and \(\operatorname{Res}(f,\infty)\) is the larger part of the answer.
4. No standard text treats this exact integral; the method is Ahlfors, Ch. 4 §5.1–5.3 (residue at infinity) [verify] and Marsden & Hoffman, §4.3 (dogbone) [verify].

### E1 — `strip-exponential-quasiperiod`

- Title: `∫ℝ e^(ax)/(1+e^x) dx = π/sin(πa): the quasi-periodic strip`
- Contour integrand: `exp(a*z)/(1 + exp(z))`
- Relation: `the target is Re of ∮ f dz — the bottom side is the target itself; the top side is the target times −e^{2πia}, and the two together multiply the unknown by 1 − e^{2πia}`
- Pieces: `the real axis` · `the right vertical x = R` · `the line Im z = 2π` · `the left vertical x = −R`
- Fixtures: `a = 0.3` · `a = 0.5` · `a = 0.91` · `a = 0.05`
- Record claims: `pi/sin(pi*a)`

Flags: (a) X2. (b) "quasi-periodic strip" is acceptable but non-standard; "rectangle of height 2π" is what texts say. (c) `∫ℝ` (missing subscript), `e^(ax)`.

Proposal — Title: **∫_{−∞}^{∞} e^{ax} dx/(1+eˣ) by a rectangle**.
1. \(\displaystyle\int_{-\infty}^{\infty}\frac{e^{ax}}{1+e^{x}}\,dx=\frac{\pi}{\sin\pi a},\quad 0<a<1\).
2. Contour: the rectangle with vertices \(\pm R,\ \pm R+2\pi i\).
3. \(f(z+2\pi i)=e^{2\pi ia}f(z)\), so the top side returns \(-e^{2\pi ia}\) times the target; one pole, \(i\pi\), lies inside. The substitution \(x=\log t\) turns this into the keyhole integral \(\int_0^\infty t^{a-1}dt/(1+t)\).
4. Conway, Ch. V §2, Exercise [verify]; Freitag & Busam, Ch. III §7 [verify]; Marsden & Hoffman, §4.3, Exercises [verify].

### E2 — `strip-sech-fourier`

- Title: `∫ℝ sech(x)e^(iξx) dx = π sech(πξ/2): a Fourier transform by one strip`
- Relation: `the target is Re of ∮ f dz — the bottom side is the target itself; the top side is the target times +e^{−πξ}, the tier's only positive factor, because the reversal's minus and sech's own cancel`
- Pieces: as E1 with `the line Im z = π`
- Fixtures: `xi = 2` · `xi = 0` · `xi = 1` · `xi = -1.5`
- Record claims: `pi*sech(pi*xi/2)`

Flags: (a) X2 (target = ∮/(1+e^{−πξ})). (b) "the tier's only positive factor" refers to gallery tiers. (c) `xi`.

Proposal — Title: **∫_{−∞}^{∞} e^{iξx} sech x dx by a rectangle**.
1. \(\displaystyle\int_{-\infty}^{\infty}\frac{e^{i\xi x}}{\cosh x}\,dx=\pi\operatorname{sech}\frac{\pi\xi}{2},\quad \xi\in\mathbb R\).
2. Contour: the rectangle with vertices \(\pm R,\ \pm R+i\pi\).
3. \(\cosh(z+i\pi)=-\cosh z\), so the top side returns \(e^{-\pi\xi}\) times the target; the only pole inside is \(i\pi/2\). The transform of \(\operatorname{sech}\) is again a \(\operatorname{sech}\).
4. Stein & Shakarchi, Ch. 3 §2.1, Example 3 [verify] (in the normalisation \(\int e^{-2\pi ix\xi}/\cosh\pi x\,dx=1/\cosh\pi\xi\)).

### E3 — `gaussian-shift-zero-residue`

- Title: `∫ℝ e^(−x²)cos(bx) dx = √π e^(−b²/4): a shifted rectangle with an EMPTY singular set`
- Target lines: `∫ (−∞ → ∞)  exp(-x^2)*cos(b*x)  dx`, `∫ (−∞ → ∞)  exp(-x^2)*sin(b*x)  dx`
- Relation: `the target is components of ∮ f dz — cos(bz) grows like e^{|b||y|} in BOTH half-planes, so the verticals would not vanish for it; the contour carries e^{ibz} and the cosine target is recovered from the real row, with the sine on the imaginary one`
- Pieces: `the real axis` · `the right vertical x = R` · `the saddle line Im z = b/2` · `the left vertical x = −R`
- KILL row (imported piece): `the saddle line Im z = b/2 is e^(−289/400)·√π — imported, not derived here` with method `on Im z = b/2 the integrand collapses to e^{−x²−b²/4}; the remaining ∫ℝe^{−x²}dx = Γ(1/2) = √π is IMPORTED, not derived here`
- Fixtures: `b = 1` · `b = 1.7` · `b = 3` · `b = 6.5`
- Record claims: `sqrt(pi)*exp(-b^2/4)`

Flags: (a) X2. (b) "EMPTY singular set", "saddle line", "IMPORTED". (c) `∫ℝ`.

Proposal — Title: **∫_{−∞}^{∞} e^{−x²} cos bx dx by a rectangle**.
1. \(\displaystyle\int_{-\infty}^{\infty}e^{-x^2}\cos bx\,dx=\sqrt{\pi}\,e^{-b^2/4}\).
2. Contour: the rectangle with vertices \(\pm R,\ \pm R+ib/2\); integrand \(e^{-z^2+ibz}\), entire.
3. Cauchy's theorem, not a residue: on \(\operatorname{Im}z=b/2\) the integrand reduces to \(e^{-b^2/4}e^{-x^2}\), and \(\int e^{-x^2}dx=\sqrt\pi\) is taken as known.
4. Stein & Shakarchi, Ch. 2 §1, Example 1 (Fourier transform of the Gaussian); Needham, Ch. 9, Exercises [verify].

### F1 — `wedge-rational-power`

- Title: `∫₀^∞ dx/(1+xⁿ) = (π/n)/sin(π/n): the 2π/n wedge`
- Relation: `the target is Re of ∮ f dz — the return ray is the outgoing ray rotated by ω = e^{2πi/n}, and since f(ωz) = f(z) it contributes −ω times the target — so the solve divides by 1 − ω, whose |1 − ω| = 2 sin(π/n) is the sin(π/n) of the answer`
- Pieces: `the positive real axis` · `the R → ∞ sector arc` · `the return ray arg z = 2π/n`
- Fixtures: `n = 3` · `n = 2` · `n = 5` · `n = 7`
- Record claims: `(pi/n)/sin(pi/n)`

Flags: (a) X2. (b) "the solve divides by". (c) X3.

Proposal — Title: **∫₀^{∞} dx/(1+xⁿ) by a sector of angle 2π/n**.
1. \(\displaystyle\int_0^{\infty}\frac{dx}{1+x^n}=\frac{\pi/n}{\sin(\pi/n)},\quad n\ge2\).
2. Contour: the sector \(0\le\arg z\le2\pi/n\), \(|z|\le R\).
3. \(f(\omega z)=f(z)\) for \(\omega=e^{2\pi i/n}\), so the return ray gives \(-\omega\) times the target; a single pole \(e^{i\pi/n}\) lies inside. No branch cut is needed, unlike the keyhole for \(x^{a-1}/(1+x^n)\).
4. Freitag & Busam, Ch. III §7 [verify]; Marsden & Hoffman, §4.3, Exercises [verify]; Conway, Ch. V §2, Exercises [verify].

### F2 — `wedge-fresnel`

- Title: `∫₀^∞ cos(xⁿ)dx = Γ(1+1/n)·cos(π/(2n)) — Fresnel at n = 2, with the hand-waved arc bound discharged`
- Target lines: `∫ (0 → ∞)  cos(x^n)  dx` + `converges conditionally`, `∫ (0 → ∞)  sin(x^n)  dx`
- Relation: `the target is components of ∮ f dz — the outgoing ray is ∫₀^R e^{ixⁿ}dx = C + iS, so one contour computes both real integrals at once; the return ray is where e^{izⁿ} becomes the real e^{−tⁿ}`
- Pieces: `the positive real axis` · `the R → ∞ sector arc, angle π/(2n)` · `the return ray arg z = π/(2n)`
- KILL row: `the return ray arg z = π/(2n) is … — imported, not derived here — on this ray e^{izⁿ} = e^{−tⁿ}; ∫₀^∞e^{−tⁿ}dt = Γ(1+1/n) is IMPORTED (the real substitution u = tⁿ), and the leading minus is the reversed traversal`
- Fixtures: `n = 2` · `n = 3`
- Record claims: `exp(i*pi/(2*n))*Gamma(1 + 1/n)` (the complex combined value, not the cosine integral)

Flags: (a) The "record claims" line prints the complex value \(e^{i\pi/2n}\Gamma(1+1/n)\) while the primary target is the real cosine integral; readers will read this as a mismatch. (b) "hand-waved" is the tone the owner wants gone; "discharged". (c) X3.

Proposal — Title: **∫₀^{∞} cos(x²) dx and ∫₀^{∞} sin(x²) dx by a sector of angle π/4** (general \(n\): angle \(\pi/2n\)).
1. \(\displaystyle\int_0^{\infty}\cos(x^n)\,dx=\Gamma\!\bigl(1+\tfrac1n\bigr)\cos\frac{\pi}{2n},\quad \int_0^{\infty}\sin(x^n)\,dx=\Gamma\!\bigl(1+\tfrac1n\bigr)\sin\frac{\pi}{2n}\); at \(n=2\) both equal \(\sqrt{\pi/8}\). Conditionally convergent.
2. Contour: the sector \(0\le\arg z\le\pi/2n\), \(|z|\le R\); integrand \(e^{iz^n}\), entire.
3. On the arc \(|e^{iz^n}|=e^{-R^n\sin n\theta}\) and Jordan's inequality \(\sin\phi\ge2\phi/\pi\) on \([0,\pi/2]\) gives \(\int_{\Gamma_R}=O(R^{1-n})\); on the return ray \(e^{iz^n}=e^{-t^n}\), and \(\int_0^\infty e^{-t^n}dt=\Gamma(1+1/n)\) is taken as known.
4. Stein & Shakarchi, Ch. 2, Exercise 1 [verify]; Brown & Churchill, §81, Exercises [verify]; Remmert, Ch. 14 (Fresnel integrals) [verify].

### G1 — `series-cot-collision`

- Title: `Σ_{n≥1} 1/n² = π²/6: the π cot(πz) kernel, where its pole and f's COLLIDE`
- Target line: `Σ n (1 → ∞)  1/n^2`
- Contour integrand: `pi*cot(pi*z)/z^2`
- Relation: `S is a TERM of the residue sum, not a functional of ∮ f dz — the summand is not integrated at all: the kernel's residue at every integer IS the summand, and at n = 0 the two poles MERGE into one of order 3 whose residue is -pi^2/3`
- Pieces: `the right side x = N+½` · `the top side y = N+½` · `the left side x = −(N+½)` · `the bottom side y = −(N+½)`
- Fixtures: `no parameters` · `sided = two — alternative derivation, not executable`
- Record claims: `pi^2/6`
- CATCH rows: `every enclosed residue is known exactly — the kernel's at each integer, and the MERGED one from the Laurent route`; `a stated hypothesis FAILS and a stronger argument applies: merge-collision, over 1 declared collision`
- Solve provenance (on screen, audit trail): `the kernel's Laurent expansion at an integer is EVEN, so a merged residue is a rational multiple of an even power of π — this ring, and not the exponential basis G2 solves in`

Flags: (a) **The provenance sentence is mathematically wrong as written.** \(\pi\cot\pi z=1/z-(\pi^2/3)z-(\pi^4/45)z^3-\cdots\) is an **odd** function of \(z\); its Laurent expansion about each integer contains only odd powers. What the argument uses is that \(u\,\pi\cot(\pi(n+u))\) is even in \(u\) (equivalently, the coefficient of \(u^{2k-1}\) is a rational multiple of \(\pi^{2k}\)). Same sentence appears in `solveResidueTerm.ts` line 363 and in G3. (a) `merge-collision` and "a stated hypothesis FAILS" are engine outcomes, not mathematics; on screen this reads as if something went wrong. (b) "COLLIDE", "MERGE", "kernel" (fine in texts, but "cofactor" is not). (c) `1/n^2`.

Proposal — Title: **Σ_{n≥1} 1/n² by π cot πz on squares**.
1. \(\displaystyle\sum_{n=1}^{\infty}\frac1{n^2}=\frac{\pi^2}{6}\).
2. Contour: the squares \(\Gamma_N\) with vertices \((\pm1\pm i)(N+\tfrac12)\); integrand \(\pi\cot(\pi z)/z^2\).
3. \(\pi\cot\pi z\) has residue \(1\) at every integer; at \(0\) the kernel's pole and that of \(1/z^2\) combine into a pole of order \(3\) with residue \(-\pi^2/3\), and \(\oint_{\Gamma_N}\to0\) gives \(2\sum_{n\ge1}n^{-2}=\pi^2/3\).
4. Marsden & Hoffman, §4.4 (summation of series) [verify]; Freitag & Busam, Ch. III §7 [verify]; Conway, Ch. V §2, Exercises [verify].

### G2 — `series-cot-kernel`

- Title: `Σ_{n∈ℤ} 1/(n²+a²) = (π/a)coth(πa): the π cot(πz) kernel on half-integer squares`
- Target line: `Σ n (−∞ → ∞)  1/(n^2 + a^2)`
- Relation: `S is a TERM of the residue sum, not a functional of ∮ f dz — the summand is not integrated at all: \`π cot(πz)\` has residue exactly 1 at every integer, so Res(K·f, n) = f(n) and the series appears inside the residue sum rather than on the contour`
- Fixtures: `a = 0.75` · `a = 1` · `a = 2.3` · `a = 0.2` · `a = 0.75, sided = one — alternative derivation, not executable`
- Record claims: `(pi/a)*coth(pi*a)`
- Verification: `direct summation to n = 200000 plus a 4-term Euler–Maclaurin tail; and independently, the engine's own contour quadrature over the four sides of Γ_N`

Flags: (b) backticks in prose (`\`π cot(πz)\``), "K·f". (c) X3.

Proposal — Title: **Σ_{n∈ℤ} 1/(n²+a²) by π cot πz on squares**.
1. \(\displaystyle\sum_{n=-\infty}^{\infty}\frac1{n^2+a^2}=\frac{\pi}{a}\coth\pi a,\quad a>0\) (hence \(\sum_{n\ge1}=\tfrac12\bigl[\tfrac{\pi}{a}\coth\pi a-\tfrac1{a^2}\bigr]\)).
2. Contour: the squares \(\Gamma_N\), \(N+\tfrac12\) half-width; integrand \(\pi\cot(\pi z)/(z^2+a^2)\).
3. \(|\cot\pi z|\le\coth(\pi/2)\) on every \(\Gamma_N\), so \(\oint_{\Gamma_N}\to0\); the residues at \(\pm ia\) are equal, not opposite, and their sum is minus the series.
4. Marsden & Hoffman, §4.4, Example [verify]; Freitag & Busam, Ch. III §7 [verify].

### G3 — `series-csc-kernel-collision`

- Title: `Σ_{n≥1} (−1)ⁿ/n² = −π²/12: the π csc(πz) kernel, same collision`
- Relation: `S is a TERM of the residue sum, not a functional of ∮ f dz — the summand is not integrated at all: the kernel's residue at every integer IS the summand, and at n = 0 the two poles MERGE into one of order 3 whose residue is pi^2/6`
- Fixtures: `no parameters` · `sided = two — …`
- Record claims: `-pi^2/12`

Flags: (a) In the record data (not rendered, but wrong) the hypothesis `kernel-uniformly-bounded` and every `sideCondition` are copied from G1 and state `sup_{Γ_N}|cot πz| = coth(π(N+½)) …` for the **csc** kernel; the on-screen square-side certificate is correct for csc (`sup|csc πz| = 1 on Γ_N …`). (a) The "EVEN" misstatement as in G1. (b) "same collision".

Proposal — Title: **Σ_{n≥1} (−1)ⁿ/n² by π csc πz on squares**.
1. \(\displaystyle\sum_{n=1}^{\infty}\frac{(-1)^n}{n^2}=-\frac{\pi^2}{12}\).
2. Contour: the squares \(\Gamma_N\); integrand \(\pi\csc(\pi z)/z^2\).
3. \(\pi\csc\pi z\) has residue \((-1)^n\) at \(n\), so the alternation belongs to the kernel; at \(0\) the merged pole of order \(3\) has residue \(+\pi^2/6\).
4. Marsden & Hoffman, §4.4 (the \(\pi\csc\pi z\) kernel) [verify].

---

## 2. Ledger, derivation and analysis strings

`analyse.ts` composes no user-facing text (its strings are code comments); everything below is from `engine/ledger.ts`, `engine/derivation.ts`, and the certificate builders they surface.

### 2.1 Mapping of the four constraint names

Proposed mapping (display labels only; keep `ConstraintId` values, since contrast row keys like `KILL/vanish#0` and permalinks depend on them):

| Internal | Screen label | What the rows check |
|---|---|---|
| `LEGALITY` | **Hypotheses** | closed contour; no singularity on the path; cut system admissible; every piece meeting a cut declares its side; monodromy along γ trivial |
| `CATCH` | **Residues** | winding numbers decided; every enclosed residue (or the sum) exact |
| `KILL` | **Boundary terms** | each non-target piece vanishes, contributes a known limit, or reproduces the target |
| `COVER` | **Target** | the target appears on the contour (or as a term of the residue sum) |

Derivation stage titles (`derivation.ts` 57–93) follow: `The problem` · `Hypotheses` · `Residues` · `Boundary terms` · `Target` · `Solution` · `Conclusion`. Contrast row labels `KILL · vanish #1` → `Boundary terms · vanishing piece 2`; drill legend "its KILL column" → "the boundary terms".

### 2.2 Row templates — quoted, flagged, replaced

**ledger.ts**

| Line | Current text | Flag | Replacement |
|---|---|---|---|
| 553, 556 | `the contour must avoid every singularity of the integrand` / repair `indent the contour around the singularity, or move it` | ok | keep; repair: `Indent around the singularity, or move the contour.` |
| 574 | `the contour is closed and its orientation is declared` / `the contour does not close` | ok | `the contour is closed (orientation as drawn)` / `the contour is not closed` |
| 577, 579 | `the residue theorem applies to closed contours`; `join the last piece back to the first` | ok | keep |
| 602 | `every singularity is clear of the contour (nearest at 0.0500)` | (a) "every singularity" means every pole the engine located; fine once CATCH row qualifies | `no singularity lies on the contour (nearest distance 0.0500)` |
| 617 | `the integrand is entire, so there is no singularity for the contour to be clear of` | ok | `the integrand is entire; there are no singularities` |
| 632, 635, 638 | `the kernel has a pole at every integer, and this contour reaches too many of them to check` … `listing a prefix of an infinite pole set would report a contour as clear of poles it passes through`; repair `shrink the contour, or reduce the limit parameter` | (b) | `π cot πz has a pole at every integer; the contour is too large for them to be enumerated` / `Reduce N.` |
| 657–658 | `the cut system is admissible — ${detail}` / `the cut system is not admissible: ${detail}` — `detail` from admissibility.ts 187–188: `every cut reaches infinity, so no bounded component can carry monodromy` / `every bounded component has Σα ∈ ℤ ({-1, 1})`; method (192): `research 06 §2.1, decided over ℚ: every genuine branch point is on the forest, every bounded component sums to an integer, and no log is bounded` | (b) X4, "forest" | `the branch cuts make the integrand single-valued off the cuts` with method `each bounded cut joins branch points whose exponents sum to an integer; every logarithmic branch point is joined to ∞` |
| 717–721, 730–731 | `the contour's total monodromy is e^(2πi·J) ≠ 1: …, and Σ n(γ,bⱼ)·αⱼ = J is not an integer, so the integrand does not return to the value it started with and no single sheet carries the answer`; `the contour winds about a branch point and does not close on one sheet (…)`; repair `indent the contour around the branch point (a keyhole), or take in the whole bounded component so the exponents sum to an integer (a dogbone)` | (a) correct; (b) "no single sheet carries the answer" | `the integrand is not single-valued along the contour: Σ Ind_γ(b_j)·α_j = J ∉ ℤ` / repair `Exclude the branch point (keyhole) or enclose the whole cut (dogbone).` |
| 719 | `the contour winds about the logarithmic branch point b: one turn adds 2πi to log(z − b), and no winding but zero brings it back` | ok (a) | `the contour winds about a logarithmic branch point; log(z − b) changes by 2πi per turn` |
| 762, 764–772 | `the contour winds about a branch point and still closes on one sheet (Σ n(γ,bⱼ)·αⱼ = 1 ∈ ℤ)`; provenance `this is the dogbone's licence: it winds about both ends of a bounded cut, and the two turns cancel in the exponent`; method `… — the admissibility arithmetic of research 06 §2.1(b), read along the contour` | (b) X4, "licence" | `the integrand is single-valued along the contour: Σ Ind_γ(b_j)·α_j = 1 ∈ ℤ` |
| 820–824 | `no piece of the contour meets a branch cut, except where it ends on one`; `every piece that meets a branch cut declares the side it runs on (2 pieces)`; `${label} grazes the cut 'Γ', so it has no side to declare`; `${label} crosses the cut 'Γ' without declaring which side it runs on`; repairs `move the cut clear of the contour, or move the contour` / ``tag this segment `above` or `below`, or move the cut`` | (b) backticks | `no piece crosses a branch cut` / `each piece along a cut is assigned a side (2 pieces)` / `${label} touches the cut 'Γ' tangentially` / `${label} crosses the cut 'Γ' with no side assigned`; repair `Assign the piece to the upper or lower side of the cut, or move the cut.` |
| 874 | `∮ is unchanged by moving this cut, while they stay clear of the contour` (+ monodromy.ts 160–167: `∮ is invariant under any deformation of the cut system that keeps it clear of the contour`; `so dragging a cut moves the picture's seam and not the answer — until it crosses the contour, where the factor above applies`) | (a) correct; (b) "picture's seam" | `∮_γ f dz does not depend on the position of the cut while the cut avoids γ` |
| 901–903 | `1 singularity is enclosed, with an exactly decided winding number` / `n singularities are enclosed, each with an exactly decided winding number` / `a winding number could not be decided`; repair `move the contour clear of the pole` | (a) "enclosed" means Ind ≠ 0 — fine | `Ind_γ(a) ≠ 0 for 1 singularity, decided exactly` / `Ind_γ(a) could not be decided (a pole is too close to γ)` |
| 937–944 | `every enclosed residue is known exactly` / `… — the kernel's at each integer, the cofactor's as an exact quotient` / `… and the MERGED one from the Laurent route` / `Σ Res is known exactly, though no individual residue is expressible` / `not every residue is known exactly, so the total is an estimate` | (a) "expressible" needs its field named; (b) caps | `every enclosed residue is exact` / `the residue sum is exact (the individual poles lie outside ℚ(i)(√d), the sum does not)` / `some residues are numerical; the total is an estimate` |
| 951–952, 957, 962 | method `Res(K·f, n) is f(n) over ℚ(i) at every integer (the kernel's own residue is exactly 1 or exactly (−1)ⁿ); Res(K·f, zⱼ) is K(zⱼ)·Res(f,zⱼ), exact because cot and csc are Möbius functions of e^{2πiz₀}`; `… where the cofactor has one too the orders ADD and the merged residue is the z⁻¹ coefficient of the product's Laurent series, exact in ℚ(i)(π)`; `the structural route: the roots of a rotated regular n-gon …`; `a fifth or seventh root of −1 needs a degree-4 or degree-6 field — which is why the per-pole route declined, and why this one is not the same claim` | (a) correct; (b) "declined", "structural route", "cofactor" | `Res(π cot(πz)f, n) = f(n); Res(π csc(πz)f, n) = (−1)ⁿ f(n); at a pole z_j of f, Res = K(z_j)Res(f, z_j)` / `the residue sum over the n-th roots of −1 is computed as a geometric sum without naming the roots (for n = 5, 7 they generate a field of degree 4 or 6 over ℚ)` |
| 974–975 | `some poles are not expressible in ℚ(i)(√d); the numeric value stands` / `f could not be read exactly, so no pole list was established — which is not the same as there being no poles` | ok | `some poles lie outside ℚ(i)(√d); their residues are numerical` / `f was not recognised as rational; its poles were not located` |
| 989, 992, 997 | `a stated hypothesis FAILS and a stronger argument applies: merge-collision, over 1 declared collision`; method `the hypothesis 'f has no pole at an integer' is SUFFICIENT for the clean form of the theorem and not NECESSARY for the contour argument — the product is meromorphic there, orders ADD, and the merged residue is computed exactly`; `refusing would be wrong (the answer is correct) and warning would be wrong (nothing is uncertain); what the escalation costs the record is a DECLARED merged order and residue, both checked against the engine's own` | (a) mathematically right, but reads as a failure; (b) caps, "escalation", "record" | `f has a pole at an integer (z = 0); the kernel's pole and f's combine into one pole of order 3, whose residue is computed from the Laurent expansion of the product` |
| 1018 | `${piece.name} is the target — it is what the argument solves for` | (b) | `${piece.name}: the target` |
| 1047, 1050 | `${piece.name} is an indentation, but L4 does not apply here`; repair `L4 needs a simple pole at the centre of the arc; at order ≥ 2 no limit exists and no principal value does either` | (b) "L4" | `${piece.name}: the indentation lemma does not apply` / `The indentation lemma requires a simple pole; for a pole of order ≥ 2 the limit does not exist, and neither does the principal value.` |
| 1068–1069, 1091, 1094 | `${piece.name} is declared L5, but f could not be read as (Σ Nₖ e^{iaₖz})/D`; `… but z·f(z) has no limit along it`; repair `L5 needs z·f(z) → L uniformly; without it the arc's contribution is not a number the argument can use` | (b) "L5" | `${piece.name}: z f(z) has no limit on the arc` / `The large-arc lemma requires z f(z) → L uniformly on the arc.` |
| 1111, 1113–1114 | `${piece.name} reproduces the target, as a multiple the solve reads off the family`; method `declared by its role; the coefficient enters Pass 5's M rather than the right-hand side` | (b) X4 | `${piece.name}: a constant multiple of the target (coefficient c = …)` — and print the coefficient, which is the whole mechanism |
| 1137–1138, 1153–1154 | `${piece.name} is ${text} — imported, not derived here`; method `imported, not derived here — ${method}`; `an independent check: the quadrature of this piece is … away (…% of it) — at a finite limit parameter that gap is the piece's own tail` | (a) fine; (b) "imported" | `${piece.name} = ${text} (a known integral, not derived here)` |
| 1168 | `${piece.name} is computed directly (3.00 long)` | (b) "long" | `${piece.name}: evaluated numerically (length 3.00)` |
| 1204–1205, 1209–1217 | `${piece.name} must vanish, but its sweep is not an exact multiple of π and no bound can be stated` / `… but no lemma here applies to this integrand`; `every certified arc bound here reasons on |z| = R about the ORIGIN, and this arc is centred elsewhere — a dogbone's end caps need the bound taken about their own branch point instead`; `an ML bound is the sweep times the radius times max|f|, so the sweep enters the number: it is read as an exact p/q·π with q ≤ 12, and this arc's is not one — a degenerate sweep included, whose bound would be a vacuous ≤ 0`; `the certified bounds cover a rational integrand, one times e^{iaz}, λ·e^{w zⁿ} on a wedge measured from the positive real axis, or e^{az}·N(e^z)/D(e^z) on a vertical side of a strip; this is none of them`; repair `the numeric value still stands, but the limit is not established` | (b) | `${piece.name}: no bound is available (the arc's angle is not a rational multiple of π with denominator ≤ 12)` / `${piece.name}: no bound is available for this integrand` |
| 1235–1236 | repairs `close the contour through the other half-plane` / `this lemma is too weak here — a sharper one may still apply` | ok | keep; second: `The ML-estimate does not vanish; Jordan's lemma or an indentation may still apply.` |
| 1255–1259, 1265, 1267 | `the target appears as a labelled piece of the closed contour` / `S is a TERM of the residue sum — the kernel's poles at the integers — not a piece of the contour, at weight 2` / `no piece is marked as the target, so the ledger reports the closed-contour value itself`; methods ``declared by `residueSelection.targetTerms`: the contour's own sides all vanish, so ∮ → 0 and the identity is read backwards as a statement about the sum``; `sandbox mode: there is no real integral being solved for` | (b) X4, caps | `the target is a piece of the contour` / `the target is the sum of residues at the integers (weight 2: Σ_{n∈ℤ} = 2Σ_{n≥1})` / `no target is designated; the closed-contour integral is reported` |
| 1350–1354 | `This argument closes.` / `The closed-contour value is established exactly.` / `This argument is incomplete.` / `This argument does not close: KILL fails.` | (b) house idiom | `The argument is complete.` / `∮_γ f dz is established exactly.` / `The argument is incomplete.` / `The argument is incomplete: a boundary term does not vanish.` (map the failed constraint to a phrase: Hypotheses → `the residue theorem does not apply`; Residues → `a residue is not determined`; Target → `the target is not on the contour`) |

**derivation.ts**

| Line | Current | Flag | Replacement |
|---|---|---|---|
| 61 | `What is being integrated, and over what. The contour integrand is not the posed integrand whenever the substitution has a Jacobian, and conflating the two is the single commonest error in the subject.` | (b) exactly the commentary to remove | `The integral to be evaluated, the integrand on the contour, and how the two are related.` |
| 66 | `The right to print anything at all: no piece may pass through a singularity, the contour must close, and its orientation must be declared. Run first, because everything downstream is meaningless if it fails.` | (b) | `The contour is closed and meets no singularity; with a branch cut, the integrand is single-valued along it.` |
| 71 | `The singular set and the residue sum. The winding number and the enclosed-pole count are separate rows on purpose — one number implying the other is the conflation the dogbone exists to break.` | (b) | `The singularities, their winding numbers Ind_γ(a), and their residues.` |
| 76 | `Per-piece disposal. A vanishing piece owes two distinct statements: a bound at the finite limit parameter, and the limit itself. Only the second enters the solve.` | (b) "disposal", "owes" | `Each piece other than the target: a bound at finite R (or ε), and its limit.` |
| 81 | `The target appears as a labelled piece, under the declared substitution. In the sandbox there is no target, COVER is vacuous, and the closed-contour value is the result.` | (b) | `The target integral as a piece of the contour.` |
| 86 | `The contour identity, solved for the real integral it was built to find. Worked in units of π throughout, so π is never evaluated and π/2 stays π/2.` | (b) | `The residue theorem, solved for the target.` |
| 91 | `The label is the meet over every step's certificate — computed from what was established, never chosen. One unknown step makes the whole claim unknown; one refusal refuses it.` | (b) "meet", "certificate" | `The rigor of the conclusion is the weakest of its steps: = exact, ≤ rigorous bound, ≈ numerical.` |
| 279–280 | label `the residue theorem`, text `∮ f dz = 2πi Σₖ n(γ,aₖ)·Res(f,aₖ)` (residueTheorem.ts 77) | (c) house notation | `∮_γ f(z) dz = 2πi Σ_k Ind_γ(a_k) Res(f, a_k)`; exterior identity (exteriorTheorem.ts 72) → `∮_γ f(z) dz = 2πi [ Σ_k (Ind_γ(a_k) − σ) Res(f, a_k) − σ Res(f, ∞) ], σ = Ind_γ(b)`; summation identity (summationTheorem.ts 45) → `∮_{Γ_N} K f dz = 2πi [ Σ_{|n|≤N} Res(Kf, n) + Σ_j Res(Kf, z_j) ], K = π cot πz or π csc πz` |
| 283 | `∮ f dz = ${text}` | (c) | `∮_γ f(z) dz = ${text}` |
| 291–295 | label `independent cross-check`; `${claim} — corroboration` / `the quadrature DISAGREES by … — one of them is wrong, so no value is reported` (residueTheorem.ts 111–113: `the quadrature agrees with it to 2.7e-15`; restriction `agreement is evidence, not proof — the two share no machinery, which is the point`) | (b) | `numerical check: Gauss–Legendre quadrature agrees to 2.7e-15` / `numerical check: quadrature differs by …; no value is reported` |
| 309–310 | label `from KILL · ${piece}`, text `contributes π·(…) — a known limit, not zero` | (b) "from KILL" | label `boundary term · ${piece}`, text `contributes −iπ Res(f, 0)` (see smallArc note below) |
| 316–317 | label `the system`, text `Σᵢ (aᵢ·t + bᵢ) = ∮ f dz, solved for t — worked in units of π, so π is never evaluated and π/2 stays π/2` | (b) | `Σ_i (a_i t + b_i) = ∮_γ f dz, solved for t` |
| 323–324 | `the integral ≈ ${value}` / `the integral = ${text}` | ok | `I = ${text}` |
| 352 | `the closed-contour value is established, but a piece carries a known non-zero limit and Pass 5 did not run — so the target was never extracted from it` | (b) X4 | `∮_γ f dz is established, but the target was not solved for` |
| 369, 373 | `this argument closes` / `this argument does not close`; method `the meet over 7 certificates — the weakest step in the argument, not the label of the answer` | (b) | `the argument is complete` / `incomplete`; method `rigor: the weakest of 7 steps` |
| 392–394 | conclusion labels `the integral` / `∮ f dz` | (c) | `I` / `∮_γ f dz` |

**Certificate text surfaced through the ledger (bound modules)** — the mathematically load-bearing sentences:

- mlRational.ts 177–183: `|∫ over the arc| ≤ 2.515e-5 at R = 50, and → 0 as R → ∞, because deg Q − deg P = 4 ≥ 2 makes the bound O(R^-3)` / `…, but it does NOT vanish: deg Q − deg P = 1, so the bound is O(1) and this lemma establishes nothing in the limit` / `…, and it DIVERGES as R → ∞: deg Q − deg P = 0, so the bound is O(R^1)`. Mathematics correct (bound is \(\pi R\max|f|=O(R^{1+\deg P-\deg Q})\)). Replace caps: `|∫_{Γ_R} f dz| ≤ 2.515e-5 at R = 50, and → 0 as R → ∞ since deg Q − deg P = 4 ≥ 2 (bound O(R^{−3}))`.
- mlRational.ts 306–307, 312–313 (Jordan): `|∫ over the upper semicircle| ≤ (π/|a|)·max|g| ≤ 1.257e-3 at R = 50, and → 0 as R → ∞ since max|g| = O(R^-2)`; provenance `the bound is independent of R, beating plain ML by the factor |a|R`. Correct. Drop "beating plain ML"; write `|∫_{Γ_R} g(z)e^{iaz} dz| ≤ (π/|a|) max_{Γ_R}|g| (Jordan's lemma)`.
- mlRational.ts 242–243: `the upper semicircle DIVERGES for a = -1`; method `|e^{iaz}| = e^{−a·Im z} is bounded only where a·Im z ≥ 0, so on the upper half-plane it grows like e^{1R} — the arc cannot be closed this way, and the failing constraint is KILL`. Correct; replace `e^{1R}` → `e^{|a|R}`, drop "the failing constraint is KILL".
- smallArc.ts 134–135: `the indentation contributes iα·Res = π·(−1·i·…), swept angle α = −1π`; method `L4 at a simple pole; the sign comes from the signed swept angle (θ₁ − θ₀), which is the i·ε prescription in geometric form`. (c) `−1π` and `π·(…)` formatting; (b) "L4". Replace: `∫_{γ_ρ} f dz → iα Res(f, 0) = −iπ Res(f, 0), α = −π (clockwise)`; method `a simple pole on the path; the small-arc lemma`.
- smallArc.ts 113: `the indented pole has order 2, and L4 is FALSE for order ≥ 2 — ∫ over the ρ-arc grows like ρ^{1−m}, so the limit does not exist and no principal value does either`. Correct; reword without caps.
- largeArcLimit.ts 138–140: `z·f(z) → i, so the arc contributes iα·L = π·(…) — NOT zero`; method `L5: a uniform limit of z·f(z) along an arc of angle 1π`. Replace `1π` → `π`; `∫_{Γ_R} f dz → iαL = −π`.
- wedgeArc.ts 193: `|∫ over the wedge| ≤ |λ|·1/1·π/(n·c·R^{n−1}) ≤ … at R = 6, and → 0 as R → ∞ since n = 2 > 1`. Correct (the bound \(\pi/(2nR^{n-1})\) for \(e^{iz^n}\) on \([0,\pi/2n]\)). Tidy: `|∫_{Γ_R} e^{iz^n} dz| ≤ π/(2n R^{n−1})`.
- linearMinorant.ts 103, 166: `Jordan's inequality sin ψ ≥ 2ψ/π on [0, π/2]` — correct and standard.
- squareSide.ts 172–195: `|∫ over this side| ≤ … at N = 4, and → 0 as N → ∞, because the bound is O((N+½)^-1)`; method `ML on one side of Γ_N: sup|K|·length·max|f| = π·coth(π/2) · 2(N+½) · max|f| …`; provenance `research 03 §8 states this bound without the π from π cot(πz), and it is then not an upper bound at all — 3.392 against a measured 3.567 at N = 3 (finding D-2)`. The bound is correct; the last provenance step is an internal erratum and must go (X4).
- stripSide.ts, gaussianSide.ts, branchArc.ts, logArc.ts claim templates (`|∫ over the right side| ≤ … and → 0 as R → ∞, because the bound is O(e^{(a−1)R}) and that exponent is negative`, etc.) are correct; the provenance lines `e^{κR} is transcendental, so the bound's VALUE is a float — the limit is what the lemma needs, and that rests on the sign alone` should be shortened to `the limit depends only on the sign of the exponent`.
- admissibility.ts 155–176 refusals (`… is a genuine branch point and no cut reaches it`; `a log branch point sits on a component that does not reach infinity`; `the component {0, b} is bounded and its exponents sum to 3/4, which is not an integer`) are correct; replace "component"/"forest" with "cut".
- monodromy.ts 103–104, 125: `crossing 'Γ' multiplies the integrand by e^(2πi·(α−1)) = …, which is e^(2πi·α) with the integer part of J dropped`; `… because e^(−2πi) = 1 — the same number, and the literal form is the one the integrand's exponent gives`. Correct; method `research 06 §3.4, from the arc's jump weight J = Σα over one side` → `the jump across the cut is e^{2πi Σα}`.
- collisionCheck.ts 94–100 (surfaces in the record's borrowed/certificate text): `1 declared collision reproduces the engine's own merged residue`; `the record's \`collisions[]\` carries the order arithmetic …` — X4 jargon; replace with `the residue at the merged pole z = 0 (order 3) is −π²/3, confirmed by the Laurent expansion`.
- solveTarget.ts 241, 248: `Pass 5: a·t = ∮ − Σbᵢ solved in units of π, then Re applied`; `the solved value carries an exponential with a COMPLEX exponent, so e^{β} contributes cos and sin of an irrational and the real part is not in this basis; the decimal stands` → `solved from (1 + Σ c_j) I = ∮ − Σ b_i, then Re` / `the closed form involves e^{β} with complex β; only the decimal is given`.
- solveResidueTerm.ts 352–369, 416–429: `S = −(Σ Res at the merged poles)/2 = π²/6`; method `Pass 5 with the unknown INSIDE the residue sum, over ℚ(i)(π): every side of the contour vanishes, so 0 = 2πi[w·T + Σ merged] and the 2πi divides out`; provenance includes the **EVEN** misstatement (see §3). Replace: `Σ_{n≠0} f(n) + Res(Kf, 0) = 0, so S = −Res(Kf, 0)/2`.
- residueTheorem.ts 249: method `exact residues over ℚ(i), exact winding numbers, and the residue theorem` — fine.

### 2.3 Other shell strings tied to the ledger

- app.ts 2404: card heading `Does the argument close?` → `Is the argument complete?`
- 2427–2428 (live-region sentence): `The closed contour is worth ${∮}, and the integral is ${I}.` → `∮_γ f dz = …; I = …`.
- 2455: `∮ f dz — the closed contour. The integral it is being used to find is above.` → `∮_γ f dz (the target integral is reported in the record card)`.
- 2504–2505: `Derivation — 9 steps, each with its evidence` / `Derivation — where it stops: KILL` → `Derivation (9 steps)` / `Derivation — incomplete at: Boundary terms`.
- 2538: `per pole — the winding number and the count are separate facts:` → `singularities:`; tags `n(γ) = 1` → `Ind_γ = 1`.
- 2583: result heading `∮ f(z) dz` → `∮_γ f(z) dz`; 2630: `${identity}, from exact residues over ℚ(i)` fine with new identity; 2641–2642: `quadrature agrees to …` / `the quadrature DISAGREES by … — one of them is wrong` → `numerical check: agrees to …` / `numerical check: differs by …`.
- 2682: `Closed contour.` / `Not closed contour.` → `closed contour` / `open path`.
- 3354, 3360: `No poles: f is entire, so the singular set is empty and Σ Res is the empty sum.` (fine, drop "the empty sum"); `f could not be read exactly, so no poles are claimed — which is not the same as there being none.` → `f was not recognised as rational; poles were not located.`
- 2297: `Contour integrand:` fine; 2317 `the record claims` → `closed form:`; 2326–2327 `agrees with the golden value to …` / `DISAGREES with the golden value by … — one of them is wrong` → `agrees with the reference value to …`; 2366 `how the golden value was verified` → `verification of the reference value`; 2382 `28 records loaded · 0 dropped` — remove from the reader-facing card (it is a loader diagnostic).
- Record picker: option text is the slug (`fam.id`, app.ts 512) and the fixture options are `a = 2, b = 1` — the picker should show the proposed titles; fixture variants (`halfRange = true — alternative derivation, not executable`, `companion = re`, `form = pv`, `route = indented`, `sided = two`) should read e.g. `∫₀^∞ (half range) — not executable`, `real part (= 0) — not executable`, `p.v. ∫ e^{ix}/x — not executable`, `by indentation — not executable`, `two-sided sum — not executable`.

---

## 3. Mathematical checks of what is said on screen

Verified correct (the derivations behind the displayed claims check out): A1 \(2\pi\operatorname{sgn}a/\sqrt{a^2-b^2}\); D1's phase bookkeeping \((1-e^{2\pi i\alpha})I=2\pi i e^{i\pi(\alpha-1)}\Rightarrow\pi/\sin\pi\alpha\); D2 at \(s=3/2,p=2,q=4\); D4's identity \(-4\pi iT_1+4\pi^2T_0=2\pi i\Sigma\) and the extraction \(T_1=-\operatorname{Re}\Sigma/2,\ T_0=-\operatorname{Im}\Sigma/2\pi\); D5's \((\log x+2\pi i)^3\) expansion and \(T_2=(4\pi^2T_0-\operatorname{Re}\Sigma_3)/3\) (checks at \(p=1\)); D7 at the flagship fixture (1.2158); E1, E2 residues and factors; F1 \((\pi/n)/\sin(\pi/n)\); F2's arc bound and return ray; G1/G3 Laurent coefficients \(-\pi^2/3\), \(+\pi^2/6\); G2's equal residues at \(\pm ia\) and \(\sup_{\Gamma_N}|\cot\pi z|=\coth(\pi(N+\tfrac12))\le\coth(\pi/2)\); the ML degree statement (bound \(O(R^{1+\deg P-\deg Q})\), vanishing iff \(\deg Q\ge\deg P+2\), \(O(1)\) at gap 1); Jordan's hypotheses (closing half-plane \(a\operatorname{Im}z\ge0\), \(\max_{\Gamma_R}|g|\to0\), bound \((\pi/|a|)\max|g|\)); the small-arc lemma statement (simple pole, contribution \(i\alpha\operatorname{Res}\), false for order \(\ge2\)); the large-arc lemma (\(zf\to L\) uniformly \(\Rightarrow\int\to i\alpha L\)); C1/C3's principal-value attribution (auxiliary needs p.v., target does not); B2/C1/F2 labelled conditionally convergent; admissibility rule (bounded cut needs \(\sum\alpha\in\mathbb Z\); a logarithm needs a cut to \(\infty\)); the monodromy-along-γ test on the sum \(\sum\operatorname{Ind}_\gamma(b_j)\alpha_j\).

Things a referee would object to:

1. **"the kernel's Laurent expansion at an integer is EVEN"** (solveResidueTerm.ts 363, G1/G3 headers, CLAUDE.md). \(\pi\cot\pi z\) and \(\pi\csc\pi z\) are odd about each integer (only odd powers of \(u=z-n\)). The correct statement is that \(u\cdot K(n+u)\) is even, so the coefficient of \(u^{2k-1}\) is a rational multiple of \(\pi^{2k}\); that is what makes the merged residue a rational multiple of an even power of \(\pi\).
2. **Relation lines (X2)** assert `the target is Re of ∮ f dz` for records where the target is \(\oint/(1-e^{2\pi i\alpha})\), \(\oint/2\), or where \(\oint=0\) (C1, C2). On C1 this is the exact wrong answer the record exists to prevent, printed in the record card.
3. **`the record claims` (X1)** contradicts the computed value at five records' fixtures.
4. **A4's "Contour integrand: exp(z)/z^n"** is not the contour integrand (the Jacobian \(1/(iz)\) is missing), so the displayed integrand has a pole of order \(n\) while the CATCH row reports order \(n+1\).
5. **B1's title** states \((\pi/b)e^{-ab}\) without \(a,b>0\); the general form is \((\pi/|b|)e^{-|ab|}\).
6. **G3's record data** copies G1's `sup|cot πz|` bound into a csc record (hypothesis and side conditions). Not rendered today, but wrong in the specification; the on-screen certificate for csc is correct.
7. **D1's "Euler reflection"** in the title is never connected on screen to \(\Gamma(\alpha)\Gamma(1-\alpha)\); either state it in the description or drop the phrase.
8. **F2's "record claims"** prints the complex \(e^{i\pi/2n}\Gamma(1+1/n)\) against a real primary target.
9. **"a stated hypothesis FAILS and a stronger argument applies: merge-collision"** (ledger 989) reads as an error condition; mathematically the situation is simply a pole of \(f\) at an integer, handled by the Laurent expansion of the product.
10. **"every singularity is clear of the contour"** is a claim about the poles the engine located; in the sandbox with a transcendental integrand the row is suppressed correctly, but the wording should say "no located singularity lies on the contour".
11. Minor: `α = −1π`, `angle 1π`, `e^{1R}` formatting; `n(γ, ·)` where the house wants \(\operatorname{Ind}_\gamma\); `∮ f dz` without the \(\gamma\).

---

## 4. Taxonomy for the gallery front door

**Front row (eight classics):** A1 · A6 · B1 · C1 · D1 · D4 · F2 · G1.

1. **Trigonometric integrals over [0, 2π]** (unit circle, \(z=e^{i\theta}\)): A1 ★, A2, A3, A4.
2. **Rational functions on ℝ** (semicircle \(\Gamma_R\), \(\deg Q\ge\deg P+2\)): A5, A6 ★, A7.
3. **Fourier-type integrals and Jordan's lemma**: B1 ★, B2, B3.
4. **Principal values and indented contours**: C1 ★, C3; with C2 as the companion where no indentation is needed.
5. **Multivalued integrands — keyholes**: D1 ★, D2, D3 (powers); D4 ★, D5 (logarithms).
6. **Multivalued integrands — dogbones and the residue at infinity**: D6, D7.
7. **Rectangles and sectors** (periodicity and rotational symmetry): E1, E2, E3 (rectangles); F1, F2 ★ (sectors).
8. **Series by the residue theorem** (\(\pi\cot\pi z\), \(\pi\csc\pi z\) on squares): G1 ★, G2, G3.

The current picker groups by internal tier ("tier A" … "tier G"); the groups above are the textbook-facing replacement and keep the same record ids.

---

## 5. Drill and contrast strings

**contrastGrid.ts**

| Line | Current | Flag | Replacement |
|---|---|---|---|
| 104–105 | label `∫ dx/(x²+1)`; note `the rational case: no frequency, so the arc dies by plain ML` | (b) "dies" | note `rational integrand; the arc vanishes by the ML-estimate` |
| 110–111, 119–120 | `∫ cos x/(x²+1) dx`; `the same integrand times a kernel — and the same contour`; because `the arc's lemma, and only that: plain ML → Jordan`; answer `π/e` | (b) "kernel" (here it means \(e^{ix}\), not the summation kernel — ambiguous with tier G) | note `the same contour, integrand multiplied by e^{ix}`; because `only the arc estimate changes: ML-estimate → Jordan's lemma` |
| 124–125, 132, 134 | `… closed downward`; `the same integrand, the arc taken through the other half-plane`; alsoDiffers why `the sandbox's template names the piece \`the real axis\`, the record \`the real segment\``; because `the same row, now DIVERGING — the bound is the thing that chooses the half-plane` | (b) caps | because `the same estimate now diverges: the sign of the exponent chooses the half-plane` |
| 141–142, 149 | `∫ cos x/(x²+1) dx, a < 0`; `downward is now the RIGHT way — forced by the sign of a, never chosen`; because ``the same row satisfied again, on the lower arc — `sgnA` derives the side from `a` `` | (b) internals | note `a < 0: the closing half-plane is the lower one`; because `the same estimate holds on the lower arc` |
| 156–157, 174, 176 | `∫ sin x/x dx`; `the pole moves onto the contour, and ∮ stops being the answer`; why `the row quotes the distance to the nearest singularity: 1.00, then 0.0500`; because `no pole is enclosed at all: the whole value comes from the indentation's iα·Res` | ok (b) | label `∫₀^∞ sin x/x dx`; because `no pole is enclosed; the value comes from the indentation, −iπ Res(f, 0)` |
| 330 | row label `KILL · vanish #1` | (b) | `Boundary terms · vanishing piece 2` (role words: target → `target`, vanish → `vanishing piece`, argument → `—`) |

app.ts contrast panel: 766 `One step at a time` → `Contrasting arguments`; 769 legend `Each column differs from the one on its left in the highlighted row, and in nothing else.` (fine); 719 `⚠ does not close (KILL)` → `incomplete (boundary terms)`; 746 `this argument has no such row` fine; 554 aria `compare five arguments that differ one step at a time` fine.

**drill.ts**

| Line | Current | Flag | Replacement |
|---|---|---|---|
| 98–102 | `is the target` / `vanishes in the limit` / `contributes a known limit` / `reproduces the target` / `cannot be disposed of` | (b) "disposed of" | `the target` / `→ 0` / `a known limit` / `a constant multiple of the target` / `no estimate` |
| 291 | `the winding number about ${at} could not be decided — the contour passes too close to it` | ok | `Ind_γ(${at}) could not be decided; the contour passes too close` |
| 303–306 | `no singularity is enclosed, so the residue theorem has nothing to give back` / `2 singularities are enclosed — their residues cancel here, and the target is not what is left` / `the contour winds 2 times about ${at}; once is what the argument uses` | (a) "their residues cancel here" is true only for this task's integrand \(1/(z^2+1)\); the sentence is generic | `no singularity is enclosed` / `both singularities are enclosed; for this integrand their residues cancel` / `Ind_γ(${at}) = 2; the argument needs 1` |
| 325–326, 337–338 | `${at} is a singularity of the worked integrand and is not one of this contour's — the enclosure cannot be compared`; `${at} is not one of the singularities the worked contour was measured against`; `the contour winds ${got} times about ${at}, where the argument needs ${want}` | ok (b) | `Ind_γ(${at}) = ${got}; the argument needs ${want}` |
| 411–414 | `C1 encloses no singularity at all — its whole value comes from the indentation's iα·Res, which is a limit a fixed drawn curve cannot take. There is nothing here to check about the enclosure that any loop missing the origin would not also satisfy.` | (b) record id "C1", "iα·Res" | `This integral encloses no singularity; its value comes from a limit (the indentation) that a fixed drawn curve cannot take, so there is nothing to check here.` |

app.ts drill panel: 884 `Choosing a contour` fine; 887–888 legend `Four rungs, each supplying less: the worked argument, then its KILL column to fill in, then a choice of contour, then a blank plane. Where you start is where you left off.` → `Four stages: the worked argument; the boundary terms to fill in; a choice of contour; a blank plane.`; 893 `${label} — rung 2 of 4` → `stage 2 of 4`; 969 `The worked argument, as the gallery gives it: the contour, the ledger and the value.` → `The worked argument: contour, checks and value.`; 1014–1015 `The contour is given. Say what each piece is FOR — the pieces you cannot compute must either vanish or give you back the target times a constant.` → `State the role of each piece of the contour.`; 1055 aria `check the KILL column against the ledger` → `check the boundary terms`; 1068 `Every piece, as the ledger has it.` / `Not every piece — the ledger's own claim is under each one.` → `All correct.` / `Not all correct; the established statement is shown under each piece.`; 1089–1090 `Only the integral is given — the contour is not drawn. Pick one to close over; the ledger will say whether

-----

the argument closes and whether the target is on it.` → `Only the integral is given. Choose a contour; the checks report whether the argument is complete and whether the target lies on it.`; 1121–1124 `The argument closes and the target is a piece of it.` / `${failedAt}: ${why}` / `The argument closes, but no piece of this contour is the target — so it is not the integral you were asked for.` → `Complete; the target is a piece of the contour.` / `Incomplete (${mapped label}): ${why}` / `Complete, but the target is not a piece of this contour.`; 1140–1143 `Draw a closed contour that encloses exactly ONE of the singularities — either one, either way round.` / `Draw a closed contour that winds about the singularities exactly as the worked one does.` / `Draw a closed contour. There is nothing here to check about the enclosure:` → drop the caps, keep the sentences; 1156–1157 `A drawn contour is a fixed curve, so the ledger certifies ∮ over it — not the limit the target integral is defined by.` → `A drawn contour is fixed, so only ∮_γ f dz over it is checked, not the limit defining the target.`; 1177 `Exactly that, and the winding numbers are decided exactly.` → `Correct.`; 2412 `Masked: the drill is asking which contour closes this integral.` → `Hidden until a contour is chosen.`; templates.ts labels `semicircle ↑` / `semicircle ↓` / `strip (2π)` / `wedge (2π/3)` / `square (N+½)` → `upper semicircle` / `lower semicircle` / `rectangle of height 2π` / `sector of angle 2π/3` / `square Γ_N`.

---

## 6. Summary of findings

Genuine on-screen mathematical defects (fix before sharing):
1. **X1** — `the record claims …` prints `closedForm.simplified`, which is fixture-specific or sign-restricted for A1, A2, A3, D4, D5 and contradicts the engine's number at those fixtures (app.ts 2316–2317).
2. **X2** — `relationText` composes `the target is ${relation} of ∮ f dz` for every non-sum record; false for C1, C2, C3, D1–D7, E1–E3, F1, F2 (app.ts 244–253). On C1 it prints the exact wrong answer the record teaches against.
3. **"the kernel's Laurent expansion at an integer is EVEN"** — the kernels are odd about each integer; the true statement is that \(u\,K(n+u)\) is even (solveResidueTerm.ts 363; G1/G3 headers; CLAUDE.md M5.7 paragraph).
4. A4's "Contour integrand" line omits the Jacobian (app.ts 2255 prints the pre-Jacobian `auxiliary.integrand`).
5. G3's record data copies G1's `sup|cot πz|` bound into a csc record (hypothesis `kernel-uniformly-bounded`, all four `sideCondition`s) — unrendered but wrong.
6. B1's title omits `a, b > 0`; F2's "record claims" prints the complex combined value against a real target.

Tone/notation, uniform across the app: machine expression syntax on every target/integrand/closed-form line (X3); research-document and "Pass N" citations in on-screen method text (X4: admissibility.ts 192, monodromy.ts 92/115, squareSide.ts 195, solveTarget.ts 241, ledger.ts 1114/1265, derivation.ts 352, B3's verification note); ALL-CAPS emphasis in ~40 strings; house names LEGALITY/CATCH/KILL/COVER in ledger rows, derivation headings, headline, contrast row labels, drill legend and menu verdicts; lemma ids L4/L5/L6 in ledger rows; slugs as picker labels; fixture variants labelled by internal flags; `∮ f dz` / `n(γ, a)` where the house wants \(\oint_\gamma f(z)\,dz\) / \(\operatorname{Ind}_\gamma(a)\); "the single commonest error in the subject" (derivation.ts 61) and "hand-waved" (F2 title).

Unrendered fields (`hypotheses[].statement`, `traps[].message`, `vanishingLemmas[].sideCondition`) carry the same voice; if any are ever surfaced they need the same pass, but they do not affect the current screen.

Files: `apps/contour-integration/src/families/records/*.ts` (28), `src/families/schema.ts`, `src/engine/ledger.ts`, `src/engine/derivation.ts`, `src/engine/analyse.ts`, `src/engine/contrast.ts`, `src/engine/residueTheorem.ts`, `src/engine/exteriorTheorem.ts`, `src/engine/summationTheorem.ts`, `src/families/solveTarget.ts`, `src/families/solveResidueTerm.ts`, `src/families/collisionCheck.ts`, `src/kernel/bounds/{mlRational,smallArc,largeArcLimit,wedgeArc,squareSide,linearMinorant,stripSide,gaussianSide,branchArc,logArc}.ts`, `src/kernel/branch/{admissibility,monodromy}.ts`, `src/shell/{app,contrastGrid,drill,templates,state}.ts` — all under `/home/user/complex-analysis-suite/apps/contour-integration/`.