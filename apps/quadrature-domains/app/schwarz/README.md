# Schwarz dynamics (`app/schwarz/`)

Visualises the dynamics of σ(w) — the Schwarz reflection extended
meromorphically into Ω. Iterating σ from any w₀ partitions the plane
into the "tiling set" (orbits stay bounded forever) and its complement
(orbits escape after `n` steps). Colouring by `n` produces the classic
escape-time fractal.

## Files

| File | Role |
| --- | --- |
| `schwarz-common.mjs` | Pure math kernel + per-family CPU adapters (`adaptBounded`, `adaptUnbounded`, `adaptBoundedLQD`, …). |
| `schwarz-webgl.mjs` | WebGL 2 fragment-shader renderer; same σ-iteration on the GPU. |
| `schwarz-cpu-worker.mjs` | `QD.SchwarzCpuWorker` — dedicated Web Worker that computes the CPU escape-time field off the main thread (rebuilds the Schwarz handle from the serializable φ + boundary samples, streams a transferable field snapshot per pyramid pass). Falls back to the in-page renderer when Web Workers are unavailable. |
| `schwarz-ui.mjs` | Schwarz-tab UI hub: source-φ capture, card builders, `setMode` / view-toggle to Sphere mode, coordinate transforms, and the `sCtx` injection + the four module installs below. |
| `schwarz-paint.mjs` | 2D-canvas output layer: field / boundary / orbit / preimage-tree / limit-set painters + colormaps. `QD_UI.installSchwarzPaint(sCtx)`. |
| `schwarz-render.mjs` | Progressive escape-time renderer: debounced `requestRecompute` + GPU one-frame path + CPU 4×4→2×2→1×1 pyramid. `QD_UI.installSchwarzRender(sCtx)`. |
| `schwarz-features.mjs` | Per-feature compute routines for the analysis / limit-set / forward-dynamics cards: domain-coloring, preimage-tree rebuild, limit-set chaos game, σ level curves, critical orbits, cycle finder, orbit sweep, z-panel pullback, PNG export. `QD_UI.installSchwarzFeatures(sCtx)`. |
| `schwarz-interaction.mjs` | Canvas hover / wheel / click / dblclick / pin handlers + `attachCanvasHandlers`. `QD_UI.installSchwarzInteraction(sCtx)`. |

The last four are the Phase-3 (item E) factory-module split of the former
2477-line `schwarz-ui.mjs`; see [ARCHITECTURE.md](../../ARCHITECTURE.md) for the
`installSchwarzX(sCtx)` pattern and install order.

## Public surface (`QD.Schwarz.*`)

| Function | Use |
| --- | --- |
| `buildSchwarzFromPhi(phi, hData, boundaryPts)` | Build `{ sigma, psi, evalPhi, evalF, isInOmega, escapeR, family, unbounded, adapter }` from an inverse-solver φ (any of the ten families). |
| `buildSchwarzFromRational(phi, boundaryPts)` | Same builder for a Direct-tab rational `φ = P/Q`. |
| `escapeTime(w₀, schwarz, {maxIter, escapeR})` | Iterate σ from w₀ until it lands in Ω^c, diverges, or hits `maxIter`. Returns `{kind, n, lastW, firstZ}`. `kind ∈ {'fundamental' (σⁿ left Ω), 'escaped' (diverged / |σⁿ|>escapeR), 'invalid' (σ undefined), 'interior' (still in Ω after maxIter)}`. |
| `makeOrbit(w₀, schwarz, {maxIter})` | Orbit polyline for the click-to-orbit overlay. |
| `pointInPolygon(pt, polyPts)` | Even-odd boundary-curve in-Ω test. |
| `createGPURenderer(canvas)` | WebGL 2 renderer. Returns `{ setPhi, setColormap, render, destroy, capacityError }` or `null` if WebGL 2 is unavailable / shader compile fails. |
| `_gpuCaps` | Object with `{ MAX_BRANCHES: 12, MAX_K: 8, MAX_LAURENT: 12, MAX_BETA: 16 }` — caps the shader uniform allocations. φ exceeding any cap falls back to the CPU path. |

## CPU vs GPU

| Path | When used | Notes |
| --- | --- | --- |
| **GPU** (`createGPURenderer`) | Default when WebGL 2 + caps OK. | Full 1024² frame at `maxIter=128` in ~150 ms. Float32 precision; banding at zoom > 1e6. |
| **CPU** (`escapeTime` per pixel) | Fallback when no WebGL 2, caps exceeded, or explicitly chosen in the UI. | Progressive 4×4 → 2×2 → 1×1. Computed off-thread in `QD.SchwarzCpuWorker` when available (one transferable field snapshot per pass), else in-page chunked across `requestAnimationFrame` ticks. Always available. |

### The in-Ω mask, and the invariant it has to keep

The two paths answer *"is w ∈ Ω?"* differently, and that difference is load-bearing.
The CPU tests the sampled ∂Ω polygon exactly (`pointInPolygonIndexed`); the GPU cannot
walk a 1024-gon per fragment per iterate, so `inOmega()` reads a **rasterised R8 mask**
built once per φ by `buildMaskTexture`. A mask texel is a finite world distance, so the
mask is an approximation of ∂Ω — but `ψ = φ⁻¹` is **exact**, and exists only on `φ(𝔻*)`
(unbounded) / `φ(𝔻)` (bounded). The invariant the shader depends on is therefore:

> **the mask says "in Ω"  ⟹  ψ has an admissible preimage.**

Break it and `sigma()` is asked for a point outside σ's domain. Newton does not diverge
there — it converges, to a preimage on the **wrong sheet**, `acceptZ` correctly refuses
it, and the pixel comes back `kind: 'invalid'`. Because the tiles are `σ⁻ⁿ(∂Ω)`, an orbit
grazing ∂Ω is exactly a pixel *on a tile boundary*, so the failures read as speckle along
every tile edge — and get worse zoomed in, the mask's error being fixed in world units
while the screen pixel shrinks. (Measured on the cusped deltoid: 796 / 810,000 pixels at
1×, 2,764 at 30×, of which 90.8% reached an orbit point with no `|z| > 1` preimage at all.
HANDOFF entry 65.)

`buildMaskTexture` keeps the invariant with two properties, and both are required:

* **Resolution.** The mask spans the polygon's bbox × `MASK_PAD` (1.05) and no more. The
  pad exists only so the polygon cannot touch the `CLAMP_TO_EDGE` border — `inOmega()`
  already answers correctly for any uv outside `[0,1]` — so any larger factor is spent
  precision. Its half-extent is consequently a **resolution** figure: a caller needing a
  world size (an escape radius; the sphere view's fractal coverage) must take
  `polyHalfExtent` and apply its own factor.
* **Conservatism.** After the fill the outline is re-stroked in the colour that means
  NOT-in-Ω — white when the polygon is K (unbounded), black when it is Ω (bounded) — so
  the rasteriser's own half-texel error is resolved *against* Ω. The cost is a ≤1-texel
  outward bias of ∂Ω, which is the accuracy the mask had in any case; the fix gives it a
  known sign. (A Canvas-2D path fill is anti-aliased and `imageSmoothingEnabled` does not
  change that — it governs `drawImage` — so the fill's own edge is ~½ a texel wide.)

`kind: 'invalid'` is deliberately kept and still painted (`rgb(180,90,90)`): under a
conservative mask it should not arise, and must stay visible if it ever does. It does NOT
mean "Newton diverged" — measured, Newton never did.

Both properties are pinned by
[`vitest/browser/schwarz-mask.browser.test.ts`](../../vitest/browser/schwarz-mask.browser.test.ts),
which runs the real GLSL and asserts zero `invalid` pixels *and* class agreement with the
float64 engine — the second clause because zero is also what a grossly over-dilated mask
gives, and that answer is wrong. Two source-contract specs in
[`vitest/schwarz-shader-parity.test.ts`](../../vitest/schwarz-shader-parity.test.ts) guard
the stroke and `acceptZ`'s band from the node gate, since CI's browser job does not block.

CPU↔GPU parity (for the six classical/LQD families; the four PQD families
are CPU-only): both adapters consume the same `phi` shape (with the
`lqdBeta`/`lqdGamma` fields carried through for unbounded LQDs).
HANDOFF #26 added 5 round-trip tests asserting σ(w) ≈ w on ∂Ω at
3e-13 for the previously-broken unbounded-LQD polyPart case; those
live in [`app/node-test.js`](../node-test.js).

## Image export (high resolution)

The **Export image** card writes the current view to a PNG at 1× / 2× / 4× / 8× the
display size, for all three view modes. It is its own card, deliberately NOT
`.view-2d`: the export covers the sphere as well, and while it lived inside the
2D-gated Dynamics card its control was simply absent in sphere mode.

Three properties it has to hold, each measured rather than assumed:

* **Re-render, always.** Both GL contexts are created with
  `preserveDrawingBuffer: false`, so a canvas that the browser has composited reads
  back EMPTY — measured 1 distinct colour against 26 (Schwarz) and 1 against 2858
  (sphere). The export therefore renders synchronously and copies before yielding,
  at *every* multiplier. There is no re-render-free fast path; the one that used to
  exist at 1× is what made "1× (display)" save a picture with no fractal in it.
  Anything between the render and the `drawImage` — an `await`, a `toBlob`
  callback — loses the frame.
* **The view mode is part of the frame.** The z-disk view has its own camera
  (`sState.zView`) and its own shader branch (`viewMode: 'z'`); passing neither
  exports the plane at the plane's camera, which looks entirely plausible and is a
  different picture from the one on screen.
* **Overlays are re-drawn, not upscaled.** This is the difference between a
  high-resolution export and a big screenshot. `worldToPixel` yields display-space
  coordinates and no painter touches the transform, so ONE `setTransform(mult)` on
  a capture context makes every existing painter draw vector-crisp at size with no
  change to any of them — `getCtx()` returns that context while
  `setOverlayCapture` is armed (and a `finally` always disarms it, since leaving it
  set would send the live app's painting into a detached canvas). The painters
  clear their whole canvas, so the overlay gets its own layer composited over the
  field. Measured by blockiness — a nearest-neighbour N× upscale makes every pixel
  equal its N×N block's top-left, scoring 1.000, where the re-render scores 0.548.
  Note that line *width* cannot check this: a figure drawn 4× bigger has 4× wider
  strokes either way.

`schwarz-export-plan.mjs` is the DOM-free half — the size plan and the honest
label — so the node gate can hold both. The size is capped at the renderer's own
`maxOutputSize()` (`MAX_VIEWPORT_DIMS` / `MAX_RENDERBUFFER_SIZE`), because a
request past it fails the render rather than shrinking it; the effective
multiplier stays fractional so the exported frame keeps the aspect ratio on screen.

What cannot be sharpened is said rather than implied: a CPU escape-time field
exists only at the resolution slider's size and is upscaled into the export, and
the sphere's fractal arrives as a `texSize`-square texture mapped onto geometry —
its silhouette, boundary curve and markers do sharpen with the frame, its surface
detail does not. The card's status line names the real numbers in both cases, and
reports the cap when it binds.

Tests: [`vitest/schwarz-export-plan.test.ts`](../../vitest/schwarz-export-plan.test.ts)
(node — the plan, the labels, and the two source invariants the design rests on) and
[`vitest/browser/schwarz-export.browser.test.ts`](../../vitest/browser/schwarz-export.browser.test.ts)
(real GLSL — the readback window, `pixelSize`, the cap, the sphere, and the
overlay-crispness measurement with its upscale control).

## Source-φ capture (P0.1a integration)

Schwarz pulls its source φ from the Inverse tab via `QD.PrimarySolution`:

```js
const envelope = QD.PrimarySolution.get();
if (envelope && envelope.success) {
  const phi = clonePhi(envelope.primary.phi);
  const hData = envelope.hData;
  // ...
}
```

See [`schwarz-ui.mjs`](schwarz-ui.mjs) `captureFromInverseTab` for the
canonical reader. The legacy `state.current` path is kept as a
fallback for the rare case where `QD.PrimarySolution` is unavailable.

## Family coverage

All ten inverse families are supported. The six classical/LQD families
ship CPU + GPU support:

- `boundedQD` / `unboundedQD` (classical)
- `boundedLQD` / `boundedLQD_singular`
- `unboundedLQD` / `unboundedLQD_singular`

The four power-weighted families are **CPU-only** — `createGPURenderer`'s
`setPhi` refuses them and the UI falls back to the CPU `escapeTime` path
(the GPU shader has no non-integer αth-root power):

- `powerQD` / `powerQD_singular`
- `unboundedPQD` / `unboundedPQD_singular`

Bounded-rational direct φ is supported via `buildSchwarzFromRational`
(no Direct-tab "Send to Schwarz" wiring yet — pipe `phi` in manually).

## View modes (plane / z-disk / sphere)

A three-way segmented control in the sidebar switches between three views of the
same σ-iteration:

- **plane** — the w-plane escape-time tiling on Ω (default).
- **z-disk** — the SAME tiling uniformized onto 𝔻 (or 𝔻* for unbounded Ω): each
  pixel takes `z`, lifts `w = φ(z)` (the shader already evaluates `evalPhi`), and
  runs the existing σ escape-time. Renders on the GPU for the six classical/LQD
  families via the `u_viewMode` shader branch (PQDs fall back to CPU, like the
  plane view); the 2-D overlay canvas stays transparent so the GL field shows
  through. See HANDOFF #59 (CPU view) / #60 (GPU). `paintZView(overlayOnly)`
  derives overlay-only mode from `activeRenderer()`.
- **sphere** — the iteration textured onto a Riemann sphere; that adapter lives
  in [`app/sphere/`](../sphere/README.md) and is lazy-mounted on first toggle.

Captured φ + render params (maxIter / colormap / scale / modK) are shared across
all three views, so toggling never re-captures.

## Where it's called from

| Caller | What it uses |
| --- | --- |
| `schwarz-ui.mjs` (tab activation) | the full module (capture, render, controls) |
| `sphere/sphere-ui.mjs` | `_gpuCaps`, the shared GPU shader source via `_shaders` / `_glHelpers` |
| `node-test.js` | `buildSchwarzFromPhi`, `escapeTime`, `makeOrbit` (CPU round-trip tests) |
