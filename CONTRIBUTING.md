# Contributing

This guide is for anyone extending the tool — adding a fractal, a control, a math
function, or working on the renderer. It assumes you've read the [README](README.md)
(especially the **Architecture** section) and have the dev server running:

```bash
npm install
npm run dev
```

## Before you open a PR

All of these must pass:

```bash
npm test          # Vitest unit suite
npm run lint      # ESLint
npm run typecheck # tsc --noEmit
npm run build     # production build succeeds
npm run format    # Prettier (run it; commit the result)
```

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs the same checks on
every push and PR.

Pure logic — the expression compiler (lexer/parser/evaluator), the df64
primitives, transforms, presets — is unit-tested. The WebGL render itself can't
be unit-tested (no GPU in the test env), so **verify rendering by hand** in
`npm run dev`: both plots draw, dragging the `c` point updates the dynamical
plane, panning/zoom/presets work, a deep zoom stays sharp, and export works.

## How the renderer fits together

`f` and `escape` are arbitrary expressions. The compiler in [`src/expr/`](src/expr/)
parses each into one AST and emits **two backends**:

- **GLSL** ([`glsl.ts`](src/expr/glsl.ts)) — used to build the fragment shader
  ([`render/shaderBuilder.ts`](src/render/shaderBuilder.ts)) that does the
  per-pixel iteration on the GPU.
- **A JS evaluator** ([`evaluate.ts`](src/expr/evaluate.ts) + [`complexJs.ts`](src/expr/complexJs.ts))
  — used to compute the orbit polyline and as the reference in unit tests.

Both are written in terms of abstract complex ops (`cmul`, `cexp`, …). The GLSL
stdlib supplies those ops in **two precisions** behind the same names — single
([`complexSingle.glsl.ts`](src/glsl/complexSingle.glsl.ts)) and df64
([`df64.glsl.ts`](src/glsl/df64.glsl.ts) + [`complexDf64.glsl.ts`](src/glsl/complexDf64.glsl.ts)) —
plus a precision-agnostic derived layer ([`complexDerived.glsl.ts`](src/glsl/complexDerived.glsl.ts)).
[`GLPlot`](src/render/glPlot.ts) compiles the single-precision program eagerly and
the df64 one lazily and **asynchronously** (it can be huge), switching to df64 past
a zoom threshold once it's ready — so the first deep zoom shows single precision and
upgrades when the build finishes, never freezing the interaction.

Rendering is progressive (coarse → fine), HiDPI-aware, and reduces resolution/
iterations during drag; see the `render`/`applyRenderSize`/`setupDraw` flow in
`GLPlot`.

## Three gotchas

1. **Keep the GLSL and JS backends in agreement.** If you change how a function
   is computed, change it in both `src/expr/glsl.ts` (or the GLSL stdlib) **and**
   `src/expr/complexJs.ts`, or the orbit will disagree with the shader. The
   `evaluate.ts` tests are the safety net.

2. **df64 has a JS reference.** The df64 GLSL ([`df64.glsl.ts`](src/glsl/df64.glsl.ts))
   is a line-for-line transliteration of [`df64Ref.ts`](src/glsl/df64Ref.ts),
   which is unit-tested. Edit the reference first, get the test passing, then port.
   Note the `* uOne` optimization barriers on the error-free transforms — without
   them the shader compiler reassociates the math and df64 silently collapses to
   single precision.

3. **Off-screen passes: bind the FBO, then detach the texture.** Histogram
   colouring, the post-processing pass, and PNG export each render into a
   texture-backed framebuffer (`GLPlot.updateCdf` / `ensureSceneTarget` /
   `renderToImageData`). Two rules for these paths: **(a)** bind the framebuffer
   _before_ `framebufferTexture2D`, or the attachment silently targets the default
   framebuffer (`INVALID_OPERATION`) and the FBO renders black; **(b)** the shader
   declares a `uCdf` sampler (default texture unit 0), so after attaching, detach
   the target with `bindTexture(TEXTURE_2D, null)` — otherwise the render target is
   also bound as a sampler (a feedback loop) and the draw comes out black.

## Common tasks

### Add a fractal preset

1. Add an entry — keyed by the new name — to **both** `paramPresets` and
   `dynPresets` in [`src/presets.ts`](src/presets.ts). Dynamical presets also need a `z0`.
2. Add the name to the `PresetName` union in the same file.
3. Add an `<option value="your name">` to the `#fractal_presets` `<select>` in
   [`index.html`](index.html).

`presetNames` is derived from the dictionary keys, so the integrity test in
`test/presets.test.ts` checks your entry is well-formed, and `test/expr.test.ts`
checks the `f`/`escape` strings parse.

```ts
// src/presets.ts
"my fractal": { f: "z^3+c", c: "-.5+.2*i", n: "100", nplot: "6", escape: "abs(z)>2", zoom: 0.7, center: [0, 0] },
```

### Add a function to the expression language

1. Add it to the AST function sets in [`src/expr/ast.ts`](src/expr/ast.ts) and
   parse it in [`src/expr/parser.ts`](src/expr/parser.ts) if it isn't a plain call.
2. Implement it for the JS backend in [`src/expr/complexJs.ts`](src/expr/complexJs.ts)
   and dispatch it in [`evaluate.ts`](src/expr/evaluate.ts); add a parity test.
3. Implement it for GLSL: map the name in [`src/expr/glsl.ts`](src/expr/glsl.ts)
   and add the `c…` op to **both** precision stdlibs (single + df64), or to the
   derived layer if it's expressible in terms of existing ops.

### Change the colouring

Colouring is driven by shader uniforms set in
[`src/render/shaderBuilder.ts`](src/render/shaderBuilder.ts): `uMode` (escape /
smooth / histogram / distance / orbit-trap / stripe / triangle / decomposition /
domain), `uPalette` (classic / viridis / magma / grayscale / custom), `uAA`
(supersampling), and the gradient-rotation / lighting / post / outline uniforms. The
per-pixel logic lives in `colorAt` (and `distanceColor` for the edge mode);
`palette(t)` maps a scalar to RGB. To add a **mode**, add a branch in `colorAt`, an
`<option>` to `#mode`, and an entry in `MODES` ([`src/main.ts`](src/main.ts)).
Histogram is special: it needs the CPU CDF pre-pass in `GLPlot.updateCdf` (an
escape-time render → readback → lookup texture).

Built-in **palettes** live in `palette()`; the **Custom gradient** (`uPalette == 4`)
samples a 256×1 ramp texture built by [`src/palettes.ts`](src/palettes.ts)
(`buildGradient`) from the colour stops the editor
([`src/ui/gradient.ts`](src/ui/gradient.ts)) emits via `GLPlot.setGradient`. The
gradient texture is on texture unit 1 (`uCdf` keeps unit 0).

The **dynamics overlays** live in [`src/render/overlay.ts`](src/render/overlay.ts):
`classifyOrbit` determines an orbit's fate (escape / fixed point / cycle / bounded) and
`drawOverlay` renders the white-point and (optional, dashed) critical orbit colour-coded
by fate; the critical-orbit toggle is held on `PlotView` (`setCriticalOrbit`). The
**equipotential** overlay is instead a shader stage (`uEquipotential` in
`shaderBuilder.ts`, driven by `GLPlot.setEquipotential`).

Relief lighting and post-processing are separate shader stages, not palette/mode
branches: lighting is applied in `main()` after the per-pixel colour
(`reliefHeight`/`applyLighting` in `shaderBuilder.ts`, driven by `GLPlot.setLighting`),
and post-processing is a second fullscreen pass (`POST_FRAGMENT_SHADER`) over the
rendered scene texture (`GLPlot.drawPost`, driven by `setPost`).

### Add a control input

1. Add the field markup in [`index.html`](index.html) with a unique `id` and a
   matching `<label for="…">`.
2. Register the id in `INPUT_IDS` in [`src/ui/controls.ts`](src/ui/controls.ts)
   and add a getter/setter; if a preset should set it, handle it in `populateInputs`.
3. Consume it in [`src/main.ts`](src/main.ts) — usually in `readPresetsFromInputs`
   or the button wiring.

### Coordinate transforms

The canvas↔plot transforms live in [`src/transforms.ts`](src/transforms.ts) (used
by the overlay and interaction). The shader does its own pixel→plot mapping in
[`render/shaderBuilder.ts`](src/render/shaderBuilder.ts); if you change the
coordinate convention, change both. The JS pair's inverse property is asserted in
`test/transforms.test.ts`.

## Code style

- TypeScript, strict mode; module scope (no globals).
- Formatting and linting are enforced by Prettier + ESLint — run `npm run format`
  before committing.
- Add unit tests for any new pure function (expression eval, complex/df64 math,
  transforms, preset shape). Keep tests in `test/` mirroring the `src/` layout.
