# @cas/gpu

The suite's **WebGL2 substrate**: the double-float (**df64**) deep-zoom kernel, a
complex-number GLSL standard library, the shader compile/link plumbing, and the
**dual-backend harness** that proves single-precision GLSL agrees with float64 JS. Extracted
from the Complex Dynamics app in
[Phase 5](../../docs/MIGRATION.md#phase-5--extract-gpu-and-promote-expr) — the hardest
extraction, so it was sequenced late and pulled by the correspondence tool's real need.

Sits in the foundation layer; depends only on [`@cas/expr`](../expr) (for the dual-backend
harness's probe shaders).

## Install

```jsonc
"dependencies": { "@cas/gpu": "workspace:*" }
```

Consumed **from source** — the `exports` map points at `./src/*.ts`, one sub-path per
concern; the consumer's bundler transpiles what it imports.

## API

```ts
import { createProgram, compileShader, linkProgram } from "@cas/gpu/shader";
import {
  DF64_GLSL,
  COMPLEX_SINGLE_GLSL,
  COMPLEX_DF64_GLSL,
  COMPLEX_DERIVED_GLSL,
} from "@cas/gpu/glsl";
import { df, dfAdd, dfMul, dfExp, toNumber } from "@cas/gpu/df64";
import {
  DUAL_BACKEND_CORPUS,
  buildProbeGLSL,
  jsReference,
  runGLSL,
  compareResults,
} from "@cas/gpu/dual-backend";
import {
  sampleStops,
  buildGradientLUT,
  buildColormapLUT,
  makeColormapTexture,
} from "@cas/gpu/colormap";
import { CET_C6, cetC6Bytes } from "@cas/gpu/cet";
import { equalizedCdfLut } from "@cas/gpu/histogram";
```

**Colormaps** (`./colormap`) — `sampleStops(stops, t)` interpolates a `ColorStop[]` ramp;
`buildGradientLUT` / `buildColormapLUT` bake one into a lookup table; `makeColormapTexture(gl, …)`
uploads it as a GL texture. Extracted once it had its second consumer per ADR-0007 — Complex
Dynamics (`src/palettes.ts`) and the Quadrature app's Schwarz renderer both use it, and Polynomial Roots
builds its ramps with `buildGradientLUT`.

**Histogram equalisation** (`./histogram`) — `equalizedCdfLut(hist, maxWidth)` turns a histogram into
an inclusive-CDF lookup table (`{ data, width }`, RGBA8, `width ≤ maxWidth`), the arithmetic an
equalised tone map needs. Complex Dynamics (escape counts) and Polynomial Roots (log-density) are its
two consumers; each keeps its own binning, which is why only the CDF-and-resample half was extracted.
The width cap samples each texel's CENTRE bin, so the last texel tops out at 254/255 — recorded in
ADR-0046 action item 2 rather than changed, since changing it would alter both consumers' output.

**CET-C6** (`./cet`) — `CET_C6`, Peter Kovesi's cyclic perceptually-uniform colour map as 256 sRGB
triples (CC-BY 4.0; cite Kovesi, arXiv:1509.03700), and `cetC6Bytes()`, the same table as 256 opaque
RGBA8 texels ready for a 256×1 texture. Contour Integration's phase portrait and Polynomial Roots' Egan
hue both read it; it moved from the former byte for byte when the latter became its second consumer.

**Shader plumbing** (`./shader`) — `compileShader(gl, type, src)`, `linkProgram(gl, vs, fs)`,
and `createProgram(gl, vsSource, fsSource)` (compile + link in one call), each throwing with
the driver's log on failure.

**GLSL standard library** (`./glsl`) — source-string constants you concatenate into a
fragment shader: `DF64_GLSL` (double-float primitive ops), `COMPLEX_SINGLE_GLSL` (`vec2`
complex arithmetic), `COMPLEX_DF64_GLSL` (`vec4` df64 complex arithmetic), and
`COMPLEX_DERIVED_GLSL` (transcendentals built on the stdlib). Plus four small building blocks
every renderer otherwise re-declares (ADR-0016): `FULLSCREEN_VERTEX_GLSL` (the trivial
fullscreen-triangle vertex program, `layout(location = 0) in vec2 aPos`), `HSV2RGB_GLSL` (the
HSV→RGB hue-wheel helper), `PLANE_FROM_FRAG_GLSL` (a `planeFromFrag()` mapping a fragment
coordinate to a complex-plane point — concatenate it **after** `COMPLEX_SINGLE_GLSL`, which
defines the `cvec` / `vec_` aliases it uses), and `PHASE_COLORING_GLSL` (the phase-portrait
domain-coloring core `colorAt`, shared with the Faber Transform app).

**df64 reference** (`./df64`) — the JS mirror of the shader's double-float math (`DF =
[hi, lo]` float32 pair): `df · toNumber · dfAdd · dfSub · dfMul · dfDiv · dfSqrt · dfExp ·
dfLog · dfNeg`. Error-free Dekker/Knuth transforms give ≈46–48 mantissa bits vs. single's
24 — enough to push deep-zoom well past the float32 limit. It exists so the GLSL df64 path
can be unit-tested against a JS oracle in Node, without a GPU.

**Dual-backend harness** (`./dual-backend`) — the machinery behind the **GLSL ≈ JS**
invariant: `buildProbeGLSL(source)` assembles a self-contained probe shader from an
[`@cas/expr`](../expr) source string, `jsReference(...)` evaluates the same expression on the
float64 JS backend, `runGLSL(gl, ...)` runs it in a live WebGL2 context, and
`compareResults(...)` returns `{ maxError, meanError, errors }`. `DUAL_BACKEND_CORPUS` is a
ready set of holomorphic, anti-holomorphic, rational, and transcendental cases; single-GLSL
matches float64 JS to ≈1.5e-7 relative error across them.

**Polygon mask** (`./mask`) — `polygonMaskFrame(polygon, padFactor)` gives the world-space
square a mask covers; `buildPolygonMaskTexture(gl, polygon, opts)` rasterises the polygon into
an R8 texture (1 inside, 0 outside, NEAREST + CLAMP_TO_EDGE) so a shader can classify a
fragment against a region with one texture read instead of an O(n) crossing count.

Two things about it are load-bearing, and both were learned the expensive way:

* **`halfExtent` is a RESOLUTION figure, not a coverage one.** It is the bbox times
  `padFactor`, so how much world the texture spans — hence how fine a texel is. A caller that
  reads a world-space size off it (an escape radius, another texture's extent) couples that
  size to the pad, and it shrinks silently the moment the pad is tuned. Quadrature Domains had
  exactly that coupling in two places in its own equivalent.
* **`conservativeOmega`** re-strokes the outline in the colour meaning NOT-in-Ω, so the
  rasteriser's half-texel edge error is resolved *against* Ω. Pass it whenever a shader will
  feed masked-in points to a **partial** function — an inverse map that exists only on part of
  the plane. Where the mask and that function disagree, the shader asks about a point outside
  the domain and gets a numerical failure back: measured on Complex Dynamics' σ view, 1.14% of
  a 512² frame at 30× zoom, of which 99.9% traced to a point the mask called in-Ω where no
  preimage existed, against 0 of 3000 control pixels. It costs a ≤1-texel bias of the boundary
  — the accuracy the mask had anyway, now with a known sign. Omit it for a mask nothing
  inverts through, and the classification keeps its unbiased error.

A large pad is not headroom. A shader reads the mask only to classify, and out-of-`[0,1]` uv
already classifies correctly, so every factor above ~1 is spent boundary resolution. Both known
consumers measured this and dropped to 1.05; the default stays 4 for callers that have not.

## Tests

`test/maskTexture.test.ts` (the mask frame's geometry, plus source guards bounding the
conservative margin at ±1 texel — the GL upload half needs a WebGL2 context and a DOM, so the
end-to-end assertions live in the consumer's browser suite: Complex Dynamics'
`schwarzMask.browser.test.ts` pins zero invalid pixels, and `schwarzGL.browser.test.ts` pins the
classification per pixel against the float64 CPU engine — the clause that stops "no invalid
pixels" from being bought by over-dilating the mask. That second one bites once ∂Ω moves by about
one screen pixel, 38.7× the margin shipped), `test/df64.test.ts` (the double-float ops vs. an IEEE
reference) and
`test/dualBackend.test.ts` (`buildProbeGLSL` / `jsReference` / `compareResults` in Node), plus
`colormap`, `histogram`, `cetC6` (the table's FNV-1a pinned), `complexDf64`, `glslCoverage` and
`phaseColoring`. `runGLSL` needs a real WebGL2 context (with `EXT_color_buffer_float` for float
readback), so the end-to-end GPU leg is `test/dualBackend.browser.test.ts`, run by `pnpm test:browser`
here and in CI's `browser` job.

## Not yet here

Per the extraction's demand-driven scope: the full escape-time **program scaffold**,
sphere/projection remaps, and per-program compile caching remain in
the apps until a second consumer needs them
([ADR-0007](../../docs/DECISIONS.md#adr-0007-incremental-extraction-driven-by-real-need)).
This package is the shared _substrate_ (df64 + complex GLSL + compile/link + the dual-backend
proof), not a turnkey renderer.
