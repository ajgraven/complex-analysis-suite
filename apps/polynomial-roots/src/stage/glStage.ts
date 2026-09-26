// The density stage: points splatted additively into float textures, composited and tone-mapped.
//
// **Additive point accumulation is new to this suite.** Every other renderer here draws a fullscreen
// quad and computes a value per pixel; this one has ten million irreducible POINTS and has to count how
// many land where. So `gl.POINTS` at one pixel with `blendFunc(ONE, ONE)` into a float target, which is
// the only structure in the repo that needs `EXT_color_buffer_float` for its own sake rather than to
// read a result back.
//
// **`EXT_float_blend` is a separate extension and it is the one that matters.** `EXT_color_buffer_float`
// makes a 32-bit float texture RENDERABLE; blending into one additionally needs `EXT_float_blend`, and
// the two are not bundled. Without it the accumulation falls back to `R16F`, which blends in core
// WebGL2 but carries 11 bits of mantissa and saturates at 65504 — real limits at the unit circle, where
// Bousch proved the roots are dense and a pixel can collect tens of thousands. The fallback is taken,
// labelled, and its saturation reported rather than hidden; with neither extension the stage refuses by
// name and the fatal boundary shows it.
//
// **One texture per degree.** The degree scrub then costs a recomposite rather than a re-sweep, and
// colour-by-degree is a second accumulation channel rather than a second pass over the data. The
// textures are `RG32F` (8 B a texel) in the canvas's own shape, capped at 2048 on the longer side — 8 MB
// a degree at 1024², ~21 MB at 2048 × 1280 — and are dropped when the degree leaves the range. The ROOTS
// behind them (12 B each) are what `engine/cost.ts` budgets.
//
// **Egan's hue splats straight into the composite**, the way the limit pass writes into it: the hue
// needs two more channels (the weighted unit vector of the hue angle), and giving every degree an RGBA
// layer would double the app's whole memory budget for one colour mode. So in that mode the selected
// degrees are re-splatted into the one RGBA composite on every change — the scrub costs a re-splat
// there, as a pan already does everywhere — and the per-degree RG layers are left alone.
//
// A view change invalidates every texture, because the points are stored in world coordinates and
// projected when they are drawn. Panning therefore re-splats; scrubbing does not.
import { createProgram } from "@cas/gpu/shader";
import { buildGradientLUT } from "@cas/gpu/colormap";
import { cetC6Bytes } from "@cas/gpu/cet";
import type { ColorStop } from "@cas/gpu/colormap";

/** The world window the stage draws: centre and half-height, with the aspect taken from the canvas. */
export interface StageView {
  readonly cx: number;
  readonly cy: number;
  readonly halfHeight: number;
}

/** One symmetry image to draw the same points under. */
export interface StageTransform {
  readonly neg: boolean;
  readonly rev: boolean;
  readonly conj: boolean;
}

/** What the accumulation buffer turned out to be, for the legend to say so. */
export type Precision = "float32" | "float16";

const VERT_POINTS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
layout(location = 1) in float aWeight;
uniform vec2 uCentre;
uniform vec2 uHalfExtent;   // (halfWidth, halfHeight) in world units
uniform vec3 uFlags;        // neg, rev, conj — the symmetry image being drawn
uniform float uDegree;
out float vWeight;
out float vDegree;
void main() {
  vec2 z = aPos;
  if (uFlags.z > 0.5) z.y = -z.y;
  if (uFlags.y > 0.5) {
    // 1/z. Guarded: a root at the origin cannot happen for a proper polynomial, but a degenerate
    // buffer must not produce a NaN that poisons the whole accumulation.
    float d = dot(z, z);
    z = d > 0.0 ? vec2(z.x, -z.y) / d : vec2(0.0);
  }
  if (uFlags.x > 0.5) z = -z;
  vec2 ndc = (z - uCentre) / uHalfExtent;
  gl_Position = vec4(ndc, 0.0, 1.0);
  gl_PointSize = 1.0;
  vWeight = aWeight;
  vDegree = uDegree;
}`;

const FRAG_POINTS = `#version 300 es
precision highp float;
in float vWeight;
in float vDegree;
out vec4 fragColor;
void main() {
  // R accumulates density; G accumulates degree-weighted density, so G/R is the mean degree per pixel.
  fragColor = vec4(vWeight, vWeight * vDegree, 0.0, 0.0);
}`;

const VERT_QUAD = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/** Sum one degree's texture into the composite (additive blend supplies the accumulation). */
const FRAG_ACCUM = `#version 300 es
precision highp float;
uniform sampler2D uLayer;
in vec2 vUv;
out vec4 fragColor;
// An RG layer samples as (r, g, 0, 1): the alpha must not be summed into the composite's fourth channel.
void main() { fragColor = vec4(texture(uLayer, vUv).rg, 0.0, 0.0); }`;

/**
 * Egan's splat: the same points, with the hue of the symmetry image being drawn. `aHue` is bound at a
 * different OFFSET for each image (`|G|` floats per point in the hue buffer), which is how one draw per
 * image reads its own polynomial's colour without a second copy of the positions.
 */
const VERT_EGAN = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
layout(location = 1) in float aWeight;
layout(location = 2) in float aHue;
uniform vec2 uCentre;
uniform vec2 uHalfExtent;
uniform vec3 uFlags;
uniform float uDegree;
out float vWeight;
out float vDegree;
out float vHue;
void main() {
  vec2 z = aPos;
  if (uFlags.z > 0.5) z.y = -z.y;
  if (uFlags.y > 0.5) {
    float d = dot(z, z);
    z = d > 0.0 ? vec2(z.x, -z.y) / d : vec2(0.0);
  }
  if (uFlags.x > 0.5) z = -z;
  gl_Position = vec4((z - uCentre) / uHalfExtent, 0.0, 1.0);
  gl_PointSize = 1.0;
  vWeight = aWeight;
  vDegree = uDegree;
  vHue = aHue;
}`;

const FRAG_EGAN = `#version 300 es
precision highp float;
in float vWeight;
in float vDegree;
in float vHue;
out vec4 fragColor;
void main() {
  // B, A: the hue as a weighted unit vector. Summed per pixel, its direction is the mean hue and its
  // length over R is how much the pixel's roots AGREE — a circular mean, because the hue is cyclic and
  // an arithmetic mean of 0.95 and 0.05 is 0.5, the opposite colour.
  float a = 6.283185307179586 * vHue;
  fragColor = vec4(vWeight, vWeight * vDegree, vWeight * cos(a), vWeight * sin(a));
}`;

/** Tone-map the composite through the equalisation ramp and the colour ramp. */
const FRAG_PRESENT = `#version 300 es
precision highp float;
uniform sampler2D uComposite;
uniform sampler2D uTone;     // width x 1, equalisation in .r
uniform sampler2D uRamp;     // 256 x 1 colour ramp
uniform sampler2D uHueRamp;  // CET-C6, 256 x 1, REPEAT — Egan's hue
uniform float uEganMode;     // 1: hue by the circular mean of B, A; saturation by its length
uniform float uMaxDensity;
uniform float uExposure;
uniform float uDegreeMode;   // 0 density, 1 by the per-pixel mean of G/R
uniform vec2 uDegreeRange;   // (min, max) for that hue
uniform vec3 uExcluded;      // the neutral for a pixel the limit walk did not enter
uniform vec3 uExhausted;     // the neutral for a pixel whose walk ran out of nodes
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec4 acc = texture(uComposite, vUv);
  float d = acc.r;
  // A count is never negative, so the limit pass uses negative R as a STATUS. An uncomputed pixel must
  // not be painted as an empty one — that is the difference between "there is nothing here" and "this
  // was not looked at", and it is the whole point of the annulus policy.
  if (d < -1.5) { fragColor = vec4(uExhausted, 1.0); return; }
  if (d < -0.5) { fragColor = vec4(uExcluded, 1.0); return; }
  if (d <= 0.0 || uMaxDensity <= 0.0) { fragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  float norm = log(1.0 + uMaxDensity * uExposure);
  float t = norm > 0.0 ? clamp(log(1.0 + d * uExposure) / norm, 0.0, 1.0) : 0.0;
  float eq = texture(uTone, vec2(t, 0.5)).r;
  if (uEganMode > 0.5) {
    // The mean resultant length is the pixel's COHERENCE: 1 when every root here shares its prefix, 0
    // when the prefixes are evenly mixed. It is shown as saturation — mixed toward the hue's own luma, so
    // a muddy pixel keeps its brightness — because a mean hue over disagreeing roots is not a colour
    // anything in the picture has, and painting it at full chroma would claim an agreement that is not
    // there. The mean is read in texture space, so the seam at 0 = 1 is CET-C6's own and invisible.
    vec2 v = acc.ba / max(d, 1e-9);
    float coherence = clamp(length(v), 0.0, 1.0);
    float u = fract(atan(v.y, v.x) / 6.283185307179586 + 1.0);
    vec3 hue = texture(uHueRamp, vec2(u, 0.5)).rgb;
    float luma = dot(hue, vec3(0.2126, 0.7152, 0.0722));
    fragColor = vec4(mix(vec3(luma), hue, coherence) * (0.25 + 0.75 * eq), 1.0);
  } else if (uDegreeMode > 0.5) {
    // Hue from the mean degree at this pixel; the equalised density becomes the brightness, so a
    // thinly-populated degree is still placed on the ramp rather than being washed out.
    float meanDegree = acc.g / max(d, 1e-9);
    float span = max(1.0, uDegreeRange.y - uDegreeRange.x);
    float u = clamp((meanDegree - uDegreeRange.x) / span, 0.0, 1.0);
    vec3 hue = texture(uRamp, vec2(u, 0.5)).rgb;
    fragColor = vec4(hue * (0.25 + 0.75 * eq), 1.0);
  } else {
    fragColor = vec4(texture(uRamp, vec2(eq, 0.5)).rgb, 1.0);
  }
}`;

/** One degree's accumulation target. */
interface Layer {
  /** Rebuilt on a resize; the buffers below are kept, because they are in world coordinates. */
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  /** The GPU buffers holding this degree's representative roots, in world coordinates. */
  readonly buffers: WebGLBuffer[];
  /** Egan's hues for each buffer, `|G|` floats per point, or null for a chunk swept without them. */
  readonly hues: (WebGLBuffer | null)[];
  /** Points in each buffer. */
  readonly counts: number[];
  /** True once every chunk of this degree has been splatted into the texture for the current view. */
  painted: boolean;
}

/**
 * The two neutrals the limit-set engine paints with, and the reason there are two.
 *
 * Cool grey: the excluded band — the walk was not run here, and the root engine is the one that covers
 * it. Warm grey: the node budget ran out, so the walk WAS run and did not finish. Both differ from
 * black, which means "run, and nothing found". Three different statements; three different colours.
 */
export const NEUTRAL_EXCLUDED: readonly [number, number, number] = [0.16, 0.19, 0.23];

/** The neutral for a pixel whose walk ran out of nodes. */
export const NEUTRAL_EXHAUSTED: readonly [number, number, number] = [0.26, 0.21, 0.15];

/**
 * A render target's size: a number for a square one (the browser suites), or its two sides. What the
 * passes that write the composite take, so the stage's non-square target reaches them unchanged.
 */
export type TargetSize = number | { readonly width: number; readonly height: number };

/** The two sides of a `TargetSize`. */
export function targetDims(size: TargetSize): { width: number; height: number } {
  return typeof size === "number" ? { width: size, height: size } : { width: size.width, height: size.height };
}

/** The stage refused to start, with the reason a reader can act on. */
export class StageUnavailable extends Error {}

export class GlStage {
  readonly gl: WebGL2RenderingContext;
  readonly precision: Precision;
  private readonly pointProgram: WebGLProgram;
  private readonly eganProgram: WebGLProgram;
  private hueTexture: WebGLTexture;
  private readonly accumProgram: WebGLProgram;
  private readonly presentProgram: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly emptyVao: WebGLVertexArrayObject;
  private readonly layers = new Map<number, Layer>();
  private composite: { texture: WebGLTexture; framebuffer: WebGLFramebuffer } | null = null;
  private toneTexture: WebGLTexture;
  private rampTexture: WebGLTexture;
  /** The accumulation targets' shape — the canvas's own, capped (see `resize`). */
  private width = 0;
  private height = 0;
  private readonly internalFormat: number;
  /** The composite's format: four channels, because Egan's hue needs two beyond density and degree. */
  private readonly compositeFormat: number;

  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      // The PNG export reads the drawing buffer back after the browser has composited; without this the
      // read returns an empty buffer (the Contour Integration M6.3 finding, measured there at 1 distinct
      // colour against 601).
      preserveDrawingBuffer: true,
      antialias: false,
      alpha: false,
    });
    if (gl === null) throw new StageUnavailable("This page needs WebGL2, which this browser did not provide.");
    this.gl = gl;
    if (gl.getExtension("EXT_color_buffer_float") === null) {
      throw new StageUnavailable(
        "This page needs the WebGL2 extension EXT_color_buffer_float to accumulate root density, and this browser does not offer it.",
      );
    }
    // Blending into a 32-bit float target is a SECOND extension. Without it, 16-bit floats blend in core
    // WebGL2 but saturate at 65504 — enough for most of the plane, not for the band at the unit circle.
    const floatBlend = gl.getExtension("EXT_float_blend") !== null;
    this.precision = floatBlend ? "float32" : "float16";
    this.internalFormat = floatBlend ? gl.RG32F : gl.RG16F;
    this.compositeFormat = floatBlend ? gl.RGBA32F : gl.RGBA16F;

    this.pointProgram = createProgram(gl, VERT_POINTS, FRAG_POINTS);
    this.eganProgram = createProgram(gl, VERT_EGAN, FRAG_EGAN);
    this.accumProgram = createProgram(gl, VERT_QUAD, FRAG_ACCUM);
    this.presentProgram = createProgram(gl, VERT_QUAD, FRAG_PRESENT);
    const vao = gl.createVertexArray();
    const emptyVao = gl.createVertexArray();
    if (vao === null || emptyVao === null) throw new StageUnavailable("WebGL2 could not allocate a vertex array.");
    this.vao = vao;
    this.emptyVao = emptyVao;
    this.toneTexture = this.makeLut(new Uint8Array([0, 0, 0, 255]), 1);
    this.rampTexture = this.makeLut(new Uint8Array([0, 0, 0, 255]), 1);
    // CET-C6 wraps: REPEAT, so linear filtering across the seam blends entry 255 into entry 0 (the step
    // there is an ordinary one — `@cas/gpu/cet` pins it) instead of clamping to one end.
    this.hueTexture = this.makeLut(cetC6Bytes(), 256);
    gl.bindTexture(gl.TEXTURE_2D, this.hueTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  }

  /** Upload a colour ramp (the reader's choice of `RAMPS`). */
  setRamp(stops: readonly ColorStop[]): void {
    this.gl.deleteTexture(this.rampTexture);
    this.rampTexture = this.makeLut(buildGradientLUT(stops, 256), 256);
  }

  /** Upload this frame's equalisation ramp. */
  setTone(lut: Uint8Array, width: number): void {
    this.gl.deleteTexture(this.toneTexture);
    this.toneTexture = this.makeLut(lut, width);
  }

  private makeLut(data: Uint8Array, width: number): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture();
    if (tex === null) throw new StageUnavailable("WebGL2 could not allocate a lookup texture.");
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  /**
   * Match the accumulation targets to the canvas — its SHAPE, not only its longer side — capped at 2048
   * on the longer side, since every degree costs one of these. `height` defaults to `width` (a square
   * target, which the browser suites use).
   *
   * **The targets were square and the canvas is not**, so a 1600 × 1032 stage accumulated into a
   * 1600 × 1600 texture carrying the world RECT and the present pass sampled it NEAREST onto 1032 rows:
   * 568 of every 1600 texture rows were never shown, so about a third of the accumulated density — and a
   * third of the roots of a sparse degree — never reached the screen, while the equalisation histogram
   * counted all of it (2026-09-26 review). A target of the canvas's own shape has square texels in world
   * units, one per screen pixel below the cap.
   */
  resize(width: number, height: number = width): void {
    const scale = Math.min(1, 2048 / Math.max(width, height, 1));
    const w = Math.max(64, Math.min(2048, Math.floor(width * scale)));
    const h = Math.max(64, Math.min(2048, Math.floor(height * scale)));
    if (w === this.width && h === this.height) return;
    this.eganKey = "";
    this.width = w;
    this.height = h;
    // **Keep the points; rebuild only the textures.** This called `dropLayers()`, which deletes the
    // vertex buffers too, and nothing re-swept — so resizing the window blanked the root cloud while the
    // statistics went on describing it (measured in the 2026-09-26 review: 286,856 lit pixels before a
    // 1280 → 1100 width change, 0 after, until the next pan). The buffers hold world coordinates, so a
    // new resolution needs new textures and one re-splat, never a new sweep.
    const gl = this.gl;
    for (const layer of this.layers.values()) {
      gl.deleteTexture(layer.texture);
      gl.deleteFramebuffer(layer.framebuffer);
      const fresh = this.target();
      layer.texture = fresh.texture;
      layer.framebuffer = fresh.framebuffer;
      layer.painted = false;
    }
    if (this.composite !== null) {
      this.gl.deleteTexture(this.composite.texture);
      this.gl.deleteFramebuffer(this.composite.framebuffer);
      this.composite = null;
    }
  }

  /** The accumulation targets' longer side (0 before the first `resize`). */
  get resolution(): number {
    return Math.max(this.width, this.height);
  }

  /** The accumulation targets' width in texels. */
  get targetWidth(): number {
    return this.width;
  }

  /** The accumulation targets' height in texels — the one a texel's world size is read from. */
  get targetHeight(): number {
    return this.height;
  }

  private target(rgba = false): { texture: WebGLTexture; framebuffer: WebGLFramebuffer } {
    const gl = this.gl;
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    if (texture === null || framebuffer === null) throw new StageUnavailable("WebGL2 could not allocate a render target.");
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      rgba ? this.compositeFormat : this.internalFormat,
      this.width,
      this.height,
      0,
      rgba ? gl.RGBA : gl.RG,
      gl.FLOAT,
      null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new StageUnavailable("This browser could not create a float render target for the root density.");
    }
    return { texture, framebuffer };
  }

  private layerFor(degree: number): Layer {
    const existing = this.layers.get(degree);
    if (existing !== undefined) return existing;
    const { texture, framebuffer } = this.target();
    const layer: Layer = { texture, framebuffer, buffers: [], hues: [], counts: [], painted: false };
    this.layers.set(degree, layer);
    return layer;
  }

  /**
   * Add one chunk of a degree's roots. The buffer is `[x, y, weight]` triples in world coordinates;
   * `hues`, when the sweep computed them, is `|G|` floats per point.
   */
  addPoints(degree: number, points: Float32Array, hues?: Float32Array): void {
    if (points.length === 0) return;
    const gl = this.gl;
    const layer = this.layerFor(degree);
    const buffer = gl.createBuffer();
    if (buffer === null) return; // out of GPU memory: drop the chunk rather than tearing the page down
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, points, gl.STATIC_DRAW);
    layer.buffers.push(buffer);
    layer.counts.push(points.length / 3);
    let hueBuffer: WebGLBuffer | null = null;
    if (hues !== undefined && hues.length > 0) {
      hueBuffer = gl.createBuffer();
      if (hueBuffer !== null) {
        gl.bindBuffer(gl.ARRAY_BUFFER, hueBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, hues, gl.STATIC_DRAW);
      }
    }
    layer.hues.push(hueBuffer);
    this.epoch++;
    layer.painted = false;
  }

  /** Forget every accumulated degree (an alphabet change, or a resolution change). */
  dropLayers(): void {
    const gl = this.gl;
    this.epoch++;
    for (const layer of this.layers.values()) {
      gl.deleteTexture(layer.texture);
      gl.deleteFramebuffer(layer.framebuffer);
      for (const b of layer.buffers) gl.deleteBuffer(b);
      for (const b of layer.hues) if (b !== null) gl.deleteBuffer(b);
    }
    this.layers.clear();
  }

  /** Forget the degrees outside this range; the scrub keeps the rest. */
  dropOutside(minDegree: number, maxDegree: number): void {
    this.keepDegrees((d) => d >= minDegree && d <= maxDegree);
  }

  /** Forget every degree `keep` does not admit — the scrub also drops a degree a cancelled sweep left partial. */
  keepDegrees(keep: (degree: number) => boolean): void {
    const gl = this.gl;
    this.epoch++;
    for (const [degree, layer] of [...this.layers]) {
      if (keep(degree)) continue;
      gl.deleteTexture(layer.texture);
      gl.deleteFramebuffer(layer.framebuffer);
      for (const b of layer.buffers) gl.deleteBuffer(b);
      for (const b of layer.hues) if (b !== null) gl.deleteBuffer(b);
      this.layers.delete(degree);
    }
  }

  /** True when every chunk loaded so far carries Egan's hues — the mode can draw only then. */
  hasHues(): boolean {
    for (const layer of this.layers.values()) if (layer.hues.some((h) => h === null)) return false;
    return true;
  }

  /**
   * Egan's mode: re-splat the selected degrees, with each image's hue, straight into the composite.
   * Returns false when nothing was drawn. A chunk without hues is skipped rather than drawn in a
   * guessed colour; the shell re-sweeps when the mode is chosen (`hasHues`).
   */
  paintEgan(
    view: StageView,
    aspect: number,
    transforms: readonly StageTransform[],
    minDegree: number,
    maxDegree: number,
  ): boolean {
    const gl = this.gl;
    // Re-splatting every loaded point on every frame would make a hover or a tone change cost a whole
    // sweep's worth of draws; the composite is kept while nothing it depends on has moved. Anything
    // else that writes the composite clears the key.
    const key = `${view.cx},${view.cy},${view.halfHeight},${aspect},${minDegree},${maxDegree},${this.epoch},${this.width}x${this.height}`;
    if (this.composite !== null && key === this.eganKey) return this.eganDrawn;
    if (this.composite === null) this.composite = this.target(true);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.composite.framebuffer);
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.eganProgram);
    gl.bindVertexArray(this.vao);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.uniform2f(gl.getUniformLocation(this.eganProgram, "uCentre"), view.cx, view.cy);
    gl.uniform2f(gl.getUniformLocation(this.eganProgram, "uHalfExtent"), view.halfHeight * aspect, view.halfHeight);
    const uFlags = gl.getUniformLocation(this.eganProgram, "uFlags");
    const uDegree = gl.getUniformLocation(this.eganProgram, "uDegree");
    const stride = 4 * transforms.length;
    let drawn = 0;
    for (const [degree, layer] of this.layers) {
      if (degree < minDegree || degree > maxDegree) continue;
      gl.uniform1f(uDegree, degree);
      for (let i = 0; i < layer.buffers.length; i++) {
        const hue = layer.hues[i];
        if (hue === null) continue;
        gl.bindBuffer(gl.ARRAY_BUFFER, layer.buffers[i]);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 12, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 12, 8);
        gl.bindBuffer(gl.ARRAY_BUFFER, hue);
        gl.enableVertexAttribArray(2);
        for (let g = 0; g < transforms.length; g++) {
          const t = transforms[g];
          // The image's own hue: the g-th of the point's |G| floats.
          gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 4 * g);
          gl.uniform3f(uFlags, t.neg ? 1 : 0, t.rev ? 1 : 0, t.conj ? 1 : 0);
          gl.drawArrays(gl.POINTS, 0, layer.counts[i]);
        }
        drawn++;
      }
    }
    gl.disableVertexAttribArray(2);
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindVertexArray(null);
    this.eganKey = key;
    this.eganDrawn = drawn > 0;
    return drawn > 0;
  }

  /** What the composite last held from `paintEgan`, or "" once anything else has written it. */
  private eganKey = "";
  private eganDrawn = false;
  /** Bumped whenever the loaded points change — a chunk added, a degree or every layer dropped. */
  private epoch = 0;

  /** The loaded points' version — part of the shell's composite key (`main.ts` `compositeKey`). */
  get pointsEpoch(): number {
    return this.epoch;
  }

  /** Which degrees currently hold points. */
  loadedDegrees(): number[] {
    return [...this.layers.keys()].sort((a, b) => a - b);
  }

  /** Mark every degree as needing a re-splat — the view moved, so the projection changed. */
  invalidate(): void {
    for (const layer of this.layers.values()) layer.painted = false;
  }

  /** Re-splat every degree whose texture is stale under `view`. */
  paint(view: StageView, aspect: number, transforms: readonly StageTransform[]): void {
    const gl = this.gl;
    gl.useProgram(this.pointProgram);
    gl.bindVertexArray(this.vao);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.viewport(0, 0, this.width, this.height);
    const uCentre = gl.getUniformLocation(this.pointProgram, "uCentre");
    const uHalf = gl.getUniformLocation(this.pointProgram, "uHalfExtent");
    const uFlags = gl.getUniformLocation(this.pointProgram, "uFlags");
    const uDegree = gl.getUniformLocation(this.pointProgram, "uDegree");
    gl.uniform2f(uCentre, view.cx, view.cy);
    gl.uniform2f(uHalf, view.halfHeight * aspect, view.halfHeight);

    for (const [degree, layer] of this.layers) {
      if (layer.painted) continue;
      gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uDegree, degree);
      for (let i = 0; i < layer.buffers.length; i++) {
        gl.bindBuffer(gl.ARRAY_BUFFER, layer.buffers[i]);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 12, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 12, 8);
        for (const t of transforms) {
          gl.uniform3f(uFlags, t.neg ? 1 : 0, t.rev ? 1 : 0, t.conj ? 1 : 0);
          gl.drawArrays(gl.POINTS, 0, layer.counts[i]);
        }
      }
      layer.painted = true;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  /**
   * The composite render target, created on demand.
   *
   * The limit-set pass writes STRAIGHT into it instead of summing per-degree layers, so that everything
   * downstream — the equalisation read-back, the tone ramp, the present pass, the PNG export — is the
   * same code for both engines and a difference between their pictures can only come from the walk.
   */
  compositeTarget(): { framebuffer: WebGLFramebuffer; size: TargetSize } {
    this.eganKey = "";
    if (this.composite === null) this.composite = this.target(true);
    return { framebuffer: this.composite.framebuffer, size: { width: this.width, height: this.height } };
  }

  /** Sum the selected degrees into the composite target. Returns false when nothing is selected. */
  composeDegrees(minDegree: number, maxDegree: number): boolean {
    const gl = this.gl;
    this.eganKey = "";
    if (this.composite === null) this.composite = this.target(true);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.composite.framebuffer);
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.accumProgram);
    gl.bindVertexArray(this.emptyVao);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    let drawn = 0;
    for (const [degree, layer] of this.layers) {
      if (degree < minDegree || degree > maxDegree) continue;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, layer.texture);
      gl.uniform1i(gl.getUniformLocation(this.accumProgram, "uLayer"), 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      drawn++;
    }
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindVertexArray(null);
    return drawn > 0;
  }

  /** Read the composite's density channel back, for the equalisation histogram. */
  readDensity(): Float32Array {
    const gl = this.gl;
    if (this.composite === null) return new Float32Array(0);
    // RGBA/FLOAT is the one read-back combination WebGL2 guarantees for a float colour buffer.
    const buf = new Float32Array(this.width * this.height * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.composite.framebuffer);
    gl.readPixels(0, 0, this.width, this.height, gl.RGBA, gl.FLOAT, buf);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const density = new Float32Array(this.width * this.height);
    for (let i = 0, j = 0; i < density.length; i++, j += 4) density[i] = buf[j];
    return density;
  }

  /** Clear the canvas to the empty background — nothing is drawn, and nothing claims to be. */
  clear(): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  /** Draw the composite to the canvas through the tone ramp and the colour ramp. */
  present(options: {
    maxDensity: number;
    exposure: number;
    byDegree: boolean;
    /** Egan's hue — the composite must have been filled by `paintEgan`. */
    egan?: boolean;
    degreeRange: readonly [number, number];
    excluded?: readonly [number, number, number];
    exhausted?: readonly [number, number, number];
  }): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (this.composite === null) return;
    gl.useProgram(this.presentProgram);
    gl.bindVertexArray(this.emptyVao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.composite.texture);
    gl.uniform1i(gl.getUniformLocation(this.presentProgram, "uComposite"), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.toneTexture);
    gl.uniform1i(gl.getUniformLocation(this.presentProgram, "uTone"), 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.rampTexture);
    gl.uniform1i(gl.getUniformLocation(this.presentProgram, "uRamp"), 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.hueTexture);
    gl.uniform1i(gl.getUniformLocation(this.presentProgram, "uHueRamp"), 3);
    gl.uniform1f(gl.getUniformLocation(this.presentProgram, "uEganMode"), options.egan === true ? 1 : 0);
    gl.uniform1f(gl.getUniformLocation(this.presentProgram, "uMaxDensity"), options.maxDensity);
    gl.uniform1f(gl.getUniformLocation(this.presentProgram, "uExposure"), options.exposure);
    gl.uniform1f(gl.getUniformLocation(this.presentProgram, "uDegreeMode"), options.byDegree ? 1 : 0);
    gl.uniform2f(
      gl.getUniformLocation(this.presentProgram, "uDegreeRange"),
      options.degreeRange[0],
      options.degreeRange[1],
    );
    const excluded = options.excluded ?? NEUTRAL_EXCLUDED;
    const exhausted = options.exhausted ?? NEUTRAL_EXHAUSTED;
    gl.uniform3f(gl.getUniformLocation(this.presentProgram, "uExcluded"), excluded[0], excluded[1], excluded[2]);
    gl.uniform3f(gl.getUniformLocation(this.presentProgram, "uExhausted"), exhausted[0], exhausted[1], exhausted[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  /** Release everything. */
  dispose(): void {
    const gl = this.gl;
    this.dropLayers();
    if (this.composite !== null) {
      gl.deleteTexture(this.composite.texture);
      gl.deleteFramebuffer(this.composite.framebuffer);
      this.composite = null;
    }
    gl.deleteTexture(this.toneTexture);
    gl.deleteTexture(this.rampTexture);
    gl.deleteTexture(this.hueTexture);
    gl.deleteProgram(this.pointProgram);
    gl.deleteProgram(this.eganProgram);
    gl.deleteProgram(this.accumProgram);
    gl.deleteProgram(this.presentProgram);
    gl.deleteVertexArray(this.vao);
    gl.deleteVertexArray(this.emptyVao);
  }
}
