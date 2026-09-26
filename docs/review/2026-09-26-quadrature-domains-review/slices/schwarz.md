# schwarz — summary

Covered `app/schwarz/*` (all 13 modules + README), `app/sphere/*`, `SCHWARZ_FORMULATION.md`, the three
interchange producers in `schwarz-export.mjs` (φ → CD, σ → CD, one-point QD → Hele-Shaw), and the ADR-0026
drift guard. Ran the QD browser suite, targeted node specs, about 20 node/vite-node probes, a 5-mutant sweep on
`schwarz-common.mjs` (applied to a scratch copy, never the tree), and a scratch browser probe comparing GPU and
CPU across families. **Headline:** the classical σ and Hele-Shaw hand-offs are numerically correct, with no π
or 2πi error. But **the four unbounded WEIGHTED families (LQD, singular LQD, PQD, singular PQD) are exported as
classical Laurent maps with no warning** (P0). Singular-LQD presets and off-axis bounded PQDs paint 11–100% of
Ω as "invalid". The in-Ω defect is closed on the GPU but not on the CPU path. Most σ tests are vacuous: 7 of 11
"σ ≈ id on ∂Ω" checks test zero points, and no fixture has complex data, so five conjugation mutants survive
all 116 Schwarz tests.

Scratch probes: `/tmp/claude-0/-home-user-complex-analysis-suite/7d83a4a1-9cc2-5097-8eba-a8efea56452d/scratchpad/schwarz/qd/`
(`famexport.mjs`, `hsfam.mjs`, `hsprobe.mjs`, `sigprobe3.mjs`, `pqd2.mjs`, `lqdinv2.mjs`, `cpuinv2.mjs`, `cplxprobe.mjs`,
`diffprobe.mjs`, `vitest/probe/lqd.browser.test.ts`). The copy links `node_modules`; `.ts` imports run through
`node …/vite-node/vite-node.mjs <probe>`.

**QD browser suite (`cd apps/quadrature-domains && pnpm test:browser`), verbatim result:**

```
 ✓ |quadrature-domains-browser| vitest/browser/boot.browser.test.ts (6 tests) 1070ms
 ✓ |quadrature-domains-browser| vitest/browser/smoke.browser.test.ts (2 tests) 17ms
 ✓ |quadrature-domains-browser| vitest/browser/schwarz-export.browser.test.ts (6 tests) 24882ms
 ✓ |quadrature-domains-browser| vitest/browser/schwarz-mask.browser.test.ts (3 tests) 23371ms
 Test Files  4 passed (4)
      Tests  17 passed (17)
   Duration  52.36s
EXIT 0
```

## Findings

### SCH-1 [P0] Unbounded weighted QDs (LQD, singular LQD, PQD, singular PQD) are handed off to CD and Hele-Shaw as the wrong map, tagged CANONICAL, with no warning

- Category: maths / convention (silent wrong hand-off)
- Location: `app/schwarz/schwarz-export.mjs:31` (`phiToMapSpec`'s Laurent branch tests only `phi.unbounded`, never `phi.family`); `:102` `explainSigmaUnavailable`; `:342` `buildHeleShawEnvelope`; `app/schwarz/schwarz-ui.mjs:527,570,605` (no family gate in the UI either)
- Claim: every unbounded-family φ carries `unbounded:true` plus `branches`/`polyA`, so it is serialised as a classical Laurent map `c·z + Σ F_l/z^l + Σ conj(A)·u^k`. The export drops the `exp(…)` or `(·)^{1/α}` wrapper and discards `lqdBeta`, `lqdGamma`, `z0` and `alpha`. For PQDs, `polyA` holds the Gₗ of r#, not Laurent coefficients of φ. The UI offers "Export σ", "Export φ" and the Hele-Shaw twist link, and the explain-functions return `null` ("available"). Complex Dynamics then renders a different domain and σ. Hele-Shaw builds the UNWEIGHTED family QD(α/(w−2)) from a log- or power-weighted domain's residue. Bounded weighted φ are refused correctly, because `boundedClassicalMapSpec` checks `phi.family`.
- Evidence (measured, `famexport.mjs`: QD solve → `exportSigmaLink` → `decodeLink` → CD's own `schwarzEngineFromMapSpec`):
  ```
  unboundedLQD       σ link? true φ link? true | why: null | max|φ_QD − φ_wire|=9.52e-1 max|σ_QD − σ_CD|=4.43e+0
  unboundedLQD poly  σ link? true φ link? true | why: null | CD reconstruction THREW: Cannot read properties of undefined (reading '0')  wire={"form":"laurent","c":{"re":1,"im":0},"F":[]}
  unboundedLQD_sing  σ link? true φ link? true | why: null | max|φ_QD − φ_wire|=8.70e-1 max|σ_QD − σ_CD|=6.22e-1
  unboundedPQD       σ link? true φ link? true | why: null | max|φ_QD − φ_wire|=6.25e-1 max|σ_QD − σ_CD|=1.78e+0
  unboundedPQD_sing  σ link? true φ link? true | why: null | max|φ_QD − φ_wire|=1.46e+0 max|σ_QD − σ_CD|=1.37e+0
  ```
  `hsfam.mjs`: `unboundedLQD 1pt | HS unavailable reason: null | link? true`, and the same for `unboundedPQD 1pt`.
  `vitest/schwarz-export.test.ts:152-173,265` covers weighted _bounded_ φ only.
- Confidence: high
- Prior review: the risk was named as untested in `docs/algebra-review/IMPROVEMENTS.md:197` ("safety rests on the asserted claim that weighted/LQD φ return null … untested") and is still open. That claim is now measured false for the unbounded families. `2026-08-suite-review/findings/07-quadrature-domains.md:167` called the export "CORRECT and well-tested".
- Fix (S): in `phiToMapSpec`'s Laurent branch and in `buildHeleShawEnvelope`, return `null` when `phi.family` is set. Give `explainSigmaUnavailable`, `explainPhiUnavailable` and `explainHeleShawUnavailable` a "weighted unbounded" reason. Add one producer test per family (all eight), asserting `null` or refusal. Separately, CD should refuse a `laurent` φ with `F=[]` and no branches rather than throw.

### SCH-2 [P1] Bounded PQD with an off-axis pole: the Schwarz adapter runs on the wrong αth-root sheet, and 50–100% of Ω paints "invalid"

- Category: maths / bug
- Location: `app/schwarz/schwarz-common.mjs:723-777` (`adaptPowerQD`, principal `cRoot`); the claim in the comment at `:700-721`
- Claim: `evalPhi` uses the principal root of R#, while the solver and the ∂Ω polygon use the branch anchored at φ(0)=w₀ (`PqdCommon.phiAnchored`). When the pole angle exceeds about π/α, the adapter's φ is a rotated copy of Ω. ψ(w) then fails for points of the true Ω, and every such pixel is 'invalid'. The GPU refuses PQDs, so the CPU path is all the user sees. The comment says sheet flips are tolerated, that "the escape-time field still classifies correctly", and that only advanced visualisations "may sit on a rotated sheet". Measurement contradicts both.
- Evidence (measured, `pqd2.mjs`: one pole |a|=2, residue 1, w₀=1; 80² grid over Ω's bbox, maxIter 24):
  ```
  α=2  ∠0°/60°: max|φ_adapter(e^iθ) − ∂Ω_anchored| ≈ 5e-16, invalid 0%
  α=2  ∠120°/150°/180°: max|…| = 4.90e+0, CPU invalid 100.0%
  α=1.5 ∠120°: 50.0%   ∠150°/180°: 100.0%
  α=3  ∠60°: 50.1%    ∠120°/150°/180°: 100.0%
  ```
  Unbounded PQD is unaffected (0% at every angle, because r#(∞)=c^α>0).
- Confidence: high
- Prior review: new
- Fix (M): see IMP-2. A cheap stop-gap is to detect `|φ_adapter(e^{iθ_k}) − bdy_k| > tol` at build time, refuse with a stated reason, and show "not available off-axis yet" rather than a salmon field.

### SCH-3 [P1] Singular-LQD presets: ψ Newton fails for points genuinely in Ω, and 11–61% of Ω paints "invalid"

- Category: bug / labelling
- Location: `app/schwarz/schwarz-common.mjs:881-884` and `:979-988` (seeds), `:1096-1106` (`psi`: one warm seed plus one fresh seed, no ladder); the claims in `app/schwarz/README.md:80-82` and `schwarz-webgl.mjs:575-578`
- Claim: `adaptBoundedLQD_singular.seedFor` returns the constant (0.3, 0.3), and the CPU `psi` retries once, so ψ misses the basin. The GPU's four-seed ladder helps but not enough. The README says 'invalid' "should not arise … measured, Newton never did [fail]", which is false for these families.
- Evidence (measured). App presets from `ui-presets.mjs`, 200² frame, scratch browser probe `vitest/probe/lqd.browser.test.ts`:
  ```
  lqd-1pt-medium       GPU invalid 0     CPU invalid 0
  lqd-s-thm-562 q=0.3  inΩ 12534  GPU invalid 1336 (10.7%)  CPU invalid 2151 (17.2%)  agree 94.7%
  lqd-u-1pt            GPU invalid 0     CPU invalid 0
  lqd-us-1pt q=0.2     inΩ 36040  GPU invalid 10257 (28.5%) CPU invalid 22094 (61.3%) agree 70.4%
  ```
  `lqdinv2.mjs`: for 100% of CPU-invalid pixels (429/429 and 992/992), the iterate where σ failed has an admissible root of φ(z)=t, found by a 24-angle × 6-radius Newton seed search. This is a seeding failure, not a domain or mask issue. Both solves report `univalent=true`. An ad-hoc non-singular bounded LQD (a=2, α=1, w₀=1) also gave 20% (570/2902), so the fault is not confined to singular families.
- Confidence: high
- Prior review: new
- Fix (S): give CPU `psi` the GPU's retry ladder, and seed from the nearest ∂Ω sample: `sampleBoundaryAdaptive` returns θ, so seed at (1∓ε)e^{iθ} (IMP-3). Change the README to say 'invalid' can come from Newton.

### SCH-4 [P1] The σ-mask defect is closed on the GPU but not on the CPU path: the chord polygon is anti-conservative on unbounded Ω

- Category: bug
- Location: `app/schwarz/schwarz-common.mjs:1134-1143` (`isInOmega` = exact point-in-polygon on the chord polygon), `:1187,1198` (`escapeTime`); inherited by `schwarz-cpu-worker.mjs`, hover readout, orbits, the CPU export field, and every PQD render
- Claim: CLAUDE.md's invariant is "mask says in Ω ⟹ ψ admissible". On the CPU the "mask" is the sampled polygon (512 adaptive samples). Where K is locally convex, the chords lie inside K, so a sliver of K is classified in-Ω. There ψ has no admissible root, and the pixel is 'invalid' on ∂Ω and on every σ-preimage of it. The GPU is safe only because its 1-texel conservative stroke (≈1e-3·polyHalf) is far wider than the sagitta. The browser anti-vacuity test uses the deltoid, whose concave sides keep the chords conservative.
- Evidence (measured, `cpuinv.mjs` / `cpuinv2.mjs`: 64² windows centred on 8 boundary samples, UI sampling `sampleBoundaryAdaptive(φ,512,800)`):
  ```
  unb-1pt α=1 c=0.6 : CPU invalid 546/98304 (0.56%); unb 2-pt complex: 416 (0.42%); bounded cardioid-ish: 15 (0.02%)
  unb-1pt by window half-width 1e-2 / 1e-3 / 1e-4 : 85 / 226 / 235 of 32768  (worse with zoom)
  every "polygon says in-Ω, ψ has no admissible root" point lies ≤ 8.85e-6 from the polygon
  ```
- Confidence: high
- Prior review: new (the GPU half was fixed in #337)
- Fix (S): ψ-existence is the exact criterion (φ univalent ⇒ w∈Ω ⟺ an admissible root exists). In `escapeTime`, when the polygon says "in" and ψ returns no admissible root after the ladder, classify the pixel as 'fundamental' rather than 'invalid'. Or erode by a stated band (IMP-1).

### SCH-5 [P1] Most "σ(w) ≈ w on ∂Ω" checks in the node suite test zero points

- Category: test (vacuous on the defining property)
- Location: `app/test/schwarz.test.js:63-72, 247-260, 518-527, 845-855, 898, 922, 992, 1041, 1111, 1176, 1205, 1244` (each is `if (sv) maxBdyErr = …`)
- Claim: the probes sit exactly on |z|=1. Newton lands at |z|=1±1e-16, `acceptZ` requires |z| ≷ 1±1e-9 and rejects it, `sigma` returns null, the `if (sv)` guard skips it, and `maxBdyErr` stays 0. The README's "HANDOFF #26 added 5 round-trip tests asserting σ(w) ≈ w on ∂Ω at 3e-13" (`app/schwarz/README.md:95-97`) therefore rests mostly on zero samples.
- Evidence (measured; a counter added to a scratch copy of the test):
  ```
  unit-disk nulls=16 | cardioid 31/32 | deltoid 31/32 | unb-1pt 32/32 | boundedLQD 32/32 | boundedLQD_singular 32/32
  unboundedLQD 32/32 | unboundedLQD_singular 32/32 | polyPart h=1 31/32 | polyPart+1pole 32/32 | singular+γ 32/32
  ```
  Seven checks evaluated no point at all, and the other four evaluated one point each.
- Confidence: high
- Prior review: new
- Fix (S): probe at r = 1 ∓ 1e-4 (inside for bounded, outside for unbounded) and assert |σ(w)−w| ≲ 2|φ′|·1e-4. Count nulls as failures. Pin a minimum evaluated-point count.

### SCH-6 [P1] No Schwarz test has complex data, so conjugation errors in σ are invisible, including to the ADR-0026 drift guard

- Category: test
- Location: `vitest/schwarz-differential.test.ts:91-138` (all three fixtures have real A, real z_j, w₀=0, order 1); the node suite; `vitest/browser/schwarz-mask.browser.test.ts` (deltoid and cardioid only)
- Claim: with conj-symmetric data, `conj()` on A, z_j, w₀ or F_l is a no-op. The guard also never exercises pole order ≥2 or w₀≠0, so it cannot see the drift it exists to catch. Its "single exterior pole" fixture has z_j=0.2 ∈ 𝔻, which puts a pole of φ at z=5 ∈ 𝔻*. That is not a quadrature domain. Real unbounded QDs have |z_j|>1: measured `z=4.05451` and `2.94501+1.59741i` from `solveInverseQD`.
- Evidence (measured: mutants applied to a scratch copy of `schwarz-common.mjs`, then the 13 Schwarz spec files — 116 tests, including the drift guard and `node/schwarz` — were run on that copy):
  ```
  M1 φ uses A not conj(A)            13 files / 116 tests PASS
  M2 u_j uses z_j not conj(z_j)      PASS
  M3 bounded F uses w0 not conj(w0)  PASS
  M5 unbounded F uses F_l not conj   PASS
  M6 F branch uses conj(A)           PASS
  ```
  A single complex-coefficient σ≈id check near ∂Ω (`cplxprobe.mjs`) kills all five. Baseline errors are 1.6–4.3e-4. Mutant errors are M1 0.19–0.55, M2 0.13–0.43, M3 0.20, M5 0.64, M6 0.19–0.55.
- Confidence: high
- Prior review: new (ADR-0026 AI-2 is marked done, but it does not detect drift)
- Fix (S): add one non-symmetric fixture per family: complex node, complex residue, order-2 pole, w₀≠0, and |z_j|>1 for unbounded. Use it in the drift guard, the node suite, and the browser class-agreement test. Replace the z_j=0.2 fixture (it also appears in the `QD_TO_HELESHAW` golden's φ, which is harmless there).

### SCH-7 [P2] QD reimplements the shared conservative mask and the classical σ, and patches the builder by monkey-patching

- Category: structure
- Location: `app/schwarz/schwarz-webgl.mjs:789-880` vs `packages/gpu/src/maskTexture.ts:100-160`; `app/schwarz/schwarz-inverse.mjs:548-571`; `app/schwarz/README.md:163-167`
- Claim: (a) `buildMaskTexture` is line-for-line `buildPolygonMaskTexture(gl, pts, {padFactor:1.05, size:2048, conservativeOmega: unbounded?'outside':'inside'})`. QD already depends on `@cas/gpu`, so the README's "the shared one is not a second consumer of it" gets the dependency backwards. (b) The classical σ, preimage tree, limit set, level curves, forward dynamics and singularities are duplicated with `@cas/schwarz`. ADR-0026 defers this deliberately, but SCH-6 shows the drift guard is not biting. (c) `schwarz-inverse.mjs` wraps `QD.Schwarz.buildSchwarzFromPhi` at import time to attach `_boundaryPts` and `_phi`, so `findCycles` and `sigmaInverse` depend on module load order. The worker entry never loads it.
- Evidence: code read (inferred). The mask bodies differ only in names and defaults.
- Confidence: high
- Prior review: (b) was reported in `2026-08-suite-review/findings/07-quadrature-domains.md:76` and is still open, deferred by ADR-0026. (a) and (c) are new.
- Fix: (a) S. (c) S: return `boundaryPts` and `phi` from `buildFromAdapter`. (b) L, as per ADR-0026.

### SCH-8 [P2] The GLSL for families 2–5 (bounded, unbounded and singular LQD) has no numeric test

- Category: test
- Location: `app/schwarz/schwarz-webgl.mjs:299-420`; `vitest/browser/*` use only the deltoid (family 1) and the cardioid (family 0); `vitest/schwarz-shader-parity.test.ts` checks the source text, and the node "σ-agreement" re-uses the CPU φ and F
- Claim: the LQD shader branches are hand transliterations that nothing compiles and compares numerically. I measured them once, and they currently agree where both engines succeed: families 0, 1 and 4 at 99.86–99.92% class agreement on complex data, with the remainder the conservative-margin `fundamental→outside`. Families 3 and 5 disagree only through SCH-3's 'invalid'. Nothing keeps that true.
- Evidence (measured, scratch browser probe): `unbQD 2pt complex agree 99.860%`, `bddQD order2 complex 99.885%`, `unboundedLQD complex 99.918%`, `unboundedLQD poly 99.907%`; the only confusions are `fundamental->outside`.
- Confidence: high
- Prior review: new
- Fix (S): promote the probe (`scratchpad/schwarz/qd/vitest/probe/lqd.browser.test.ts`) into `vitest/browser/`, one case per family.

### SCH-9 [P3] Stale or false comments and docs

- Category: stale-doc
- Location and claim:
  - `app/schwarz/schwarz-common.mjs:291-294`: "for unbounded … z_j ∈ 𝔻 stays in 𝔻". Unbounded z_j satisfy |z_j|>1 (measured above).
  - `app/schwarz/schwarz-common.mjs:700-721`: "escape-time field still classifies correctly" (SCH-2).
  - `app/schwarz/README.md:80-82`: "should not arise … Newton never did" (SCH-3).
  - `app/schwarz/README.md:95-97`: "5 round-trip tests … at 3e-13" (SCH-5).
  - `app/sphere/sphere-webgl.mjs:413-417`: "sphere-ui calls setPhi WITHOUT an escapeR, so this fallback is live". But `sphere-ui.mjs:189-199` builds a Schwarz handle and passes `sw.escapeR`.
  - `SCHWARZ_FORMULATION.md:14-21`: uses σ for the Schwarz _function_ (σ(w)=w̄ on ∂Ω), where the Schwarz tab, its README and `@cas/schwarz` use σ for the _reflection_ conj(S). A reader moving between the two gets conj-flipped formulas. I re-derived the residue claim `C_{1,1}=A·φ′(z_j)=|A|²/(1−|z_j|²)²` and it is correct.
- Confidence: high
- Prior review: new
- Fix (S): edit each passage.

### SCH-10 [P3] Dead or unreachable export code

- Category: structure
- Location: `app/schwarz/schwarz-export.mjs:231` `exportPhiJSON` (no caller); the rational branches `:24-26`, `:81`, `:111-113` (`classifyPhiForExport` "rational" and its messages); `schwarz-common.mjs:1085` `buildSchwarzFromRational` (test-only; README :191 says there is no Direct-tab wiring)
- Claim: the Schwarz tab captures only Inverse-tab φ, which is never `{P,Q}`, so the rational paths cannot run from the UI.
- Evidence: grep, measured (`exportPhiJSON`: 0 references outside its definition).
- Confidence: high
- Prior review: `exportPhiJSON` was reported in `docs/review/RAW_FINDINGS_2026-07.md:2275` and is still open. The rest is new.
- Fix (S): delete `exportPhiJSON`. Either wire the Direct tab to send φ to Schwarz, or drop the rational branches.

### Verified correct (no finding)

- **Hele-Shaw hand-off, α and conventions** (measured, `hsprobe.mjs`): for α ∈ {1, 0.5+0.4i, 0.8−0.6i} at w₀=2, c=0.6, the Schwarz-function residue gives Res_{w=2} S = α to 1e-10. The wire carries `num=[α], den=[−2,1]`, `conventions={"area":"standard","contour":"standard"}`, and `max|φ_QD − φ_HS| ≤ 6.7e-13` against Hele-Shaw's own `onePointMap(α, c)`. The residue of h is the residue of the Schwarz function, which is invariant under the area and contour normalisations, so no π or 2πi can enter. (Suggestion for INTERCHANGE.md §4: state the defining identity ∫∫g dx dy = (1/2i)∮ g h dw, so a third consumer does not assume the (1/2πi) form and pick up a factor of π.)
- **Classical σ hand-off** (measured, `sigprobe3.mjs`, on solved non-symmetric QDs with complex nodes and residues, order 2, poles plus a polynomial part): QD's σ and CD's reconstructed σ both match conj(F(z)) to ≤2.7e-12, with no nulls. The earlier large disagreements I found came from non-univalent hand-built fixtures with |z_j|<1 (SCH-6), not from the engine.
- **Maths re-derived:** conj(u_j)=1/(z−z_j) on |z|=1. For bounded, F(z)=conj φ(1/z̄); for unbounded, F(z)=c/z+Σconj(F_l)z^l+R##. The same holds for the Blaschke identity b#, for r#(∞)=Σconj(A)(−1)^k/z̄_j^k, and for the β-reflection of the unbounded LQD. The GLSL (families 0–5) matches the JS term for term. Stereographic projection delegates to `@cas/core`'s kernel. The sphere uses the same conservative `buildMaskTexture`.
- **Prior finding fixed:** the `findCycles` anti-holomorphic Newton (2026-08 07 MEDIUM) now uses the 2×2 real Jacobian, and the UI labels results "≈ … (advisory)".

## Improvements

- **IMP-1 Certified in-Ω by ψ-existence (value: high, cost: M).** φ is univalent, so w∈Ω exactly when φ(z)=w has a root on the admissible side. Keep the mask or polygon as a fast pre-filter away from ∂Ω, using a distance band (a mask texel, or the polygon's sagitta). Inside the band, decide by ψ. This closes SCH-4 on the CPU and removes the mask-resolution ceiling on the GPU near ∂Ω. That ceiling is a texel of 1.05·polyHalf/1024: boundary staircasing appears near 10³× zoom and in 4× and 8× exports of a fitted view, which the export status line does not mention.
- **IMP-2 Sheet-correct PQD evaluator (value: high, cost: M).** Factor R# = K·Π(1 − z/r_i)/Π(1 − z/p_j), with roots and poles outside 𝔻̄. Every principal power (1 − z/r)^{1/α} is then analytic on 𝔻, which gives the anchored branch in closed form at per-pixel cost. It fixes SCH-2 and makes a GPU PQD path possible, since the shader needs only a principal cpow per factor. F uses the reflected factors.
- **IMP-3 Robust ψ seeding (value: high, cost: S).** Seed from the nearest ∂Ω sample: take its θ from `sampleBoundaryAdaptive` and place the seed at r=1∓ε, then fall back to the GPU's ladder on the CPU too. This fixes SCH-3, and should cut Newton iterations for every family.
- **IMP-4 Weighted σ export done properly (value: medium, cost: L).** After SCH-1 is fixed, lift the LQD adapters into `@cas/schwarz` (ADR-0026's trigger) and use the interchange `weight` field that `QuadratureDomain` already declares. Complex Dynamics and Correspondences could then explore log-weighted σ-dynamics.
- **IMP-5 df64 deep zoom (value: medium, cost: M–L).** `@cas/gpu/df64` exists. With IMP-1 removing the mask near ∂Ω, the plane view could zoom past float32's ~1e5–1e6. That is where the σ-tiling's self-similar boundary detail lives.
- **IMP-6 Consume `@cas/gpu`'s mask builder (value: low, cost: S).** See SCH-7(a). It is one call, and the shared builder's tests then cover QD.

## Coverage: not reviewed or not run

- The full 1285-test QD project: I ran only the 13 Schwarz-related spec files (plus mutants) and the browser suite.
- `schwarz-paint.mjs`, `schwarz-interaction.mjs`, `schwarz-features.mjs` beyond the cycle finder and export, and `schwarz-analysis.mjs`: skimmed for dead functions only, with no line-by-line review.
- The sphere UI camera and hover path; the mesh builder (`buildSphereMesh`) was not checked numerically.
- The singular PQD families: my probe parameters failed to solve, so they were not probed.
- CD's crash on a `laurent` φ with `F=[]` (SCH-1) is a CD-side robustness issue. I did not investigate CD further.
