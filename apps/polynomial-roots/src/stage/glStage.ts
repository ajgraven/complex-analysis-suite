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
// textures are the app's memory budget (a degree is 4 MB at 1024²) and are dropped when the degree
// leaves the range.
//
// A view change invalidates every texture, because the points are stored in world coordinates and
// projected when they are drawn. Panning therefore re-splats; scrubbing does not.
import { createProgram } from "@cas/gpu/shader";
import { buildGradientLUT } from "@cas/gpu/colormap";
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
void main() { fragColor = texture(uLayer, vUv); }`;

/** Tone-map the composite through the equalisation ramp and the colour ramp. */
const FRAG_PRESENT = `#version 300 es
precision highp float;
uniform sampler2D uComposite;
uniform sampler2D uTone;     // width x 1, equalisation in .r
uniform sampler2D uRamp;     // 256 x 1 colour ramp
uniform float uMaxDensity;
uniform float uExposure;
uniform float uDegreeMode;   // 0 density, 1 by degree
uniform vec2 uDegreeRange;   // (min, max) for the degree hue
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec2 acc = texture(uComposite, vUv).rg;
  float d = acc.r;
  if (d <= 0.0 || uMaxDensity <= 0.0) { fragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  float norm = log(1.0 + uMaxDensity * uExposure);
  float t = norm > 0.0 ? clamp(log(1.0 + d * uExposure) / norm, 0.0, 1.0) : 0.0;
  float eq = texture(uTone, vec2(t, 0.5)).r;
  if (uDegreeMode > 0.5) {
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
  readonly texture: WebGLTexture;
  readonly framebuffer: WebGLFramebuffer;
  /** The GPU buffers holding this degree's representative roots, in world coordinates. */
  readonly buffers: WebGLBuffer[];
  /** Points in each buffer. */
  readonly counts: number[];
  /** True once every chunk of this degree has been splatted into the texture for the current view. */
  painted: boolean;
}

/** The stage refused to start, with the reason a reader can act on. */
export class StageUnavailable extends Error {}

export class GlStage {
  readonly gl: WebGL2RenderingContext;
  readonly precision: Precision;
  private readonly pointProgram: WebGLProgram;
  private readonly accumProgram: WebGLProgram;
  private readonly presentProgram: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly emptyVao: WebGLVertexArrayObject;
  private readonly layers = new Map<number, Layer>();
  private composite: { texture: WebGLTexture; framebuffer: WebGLFramebuffer } | null = null;
  private toneTexture: WebGLTexture;
  private rampTexture: WebGLTexture;
  private size = 0;
  private readonly internalFormat: number;

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

    this.pointProgram = createProgram(gl, VERT_POINTS, FRAG_POINTS);
    this.accumProgram = createProgram(gl, VERT_QUAD, FRAG_ACCUM);
    this.presentProgram = createProgram(gl, VERT_QUAD, FRAG_PRESENT);
    const vao = gl.createVertexArray();
    const emptyVao = gl.createVertexArray();
    if (vao === null || emptyVao === null) throw new StageUnavailable("WebGL2 could not allocate a vertex array.");
    this.vao = vao;
    this.emptyVao = emptyVao;
    this.toneTexture = this.makeLut(new Uint8Array([0, 0, 0, 255]), 1);
    this.rampTexture = this.makeLut(new Uint8Array([0, 0, 0, 255]), 1);
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

  /** Match the accumulation resolution to the canvas (capped, since every degree costs one of these). */
  resize(size: number): void {
    const s = Math.max(64, Math.min(2048, Math.floor(size)));
    if (s === this.size) return;
    this.size = s;
    this.dropLayers();
    if (this.composite !== null) {
      this.gl.deleteTexture(this.composite.texture);
      this.gl.deleteFramebuffer(this.composite.framebuffer);
      this.composite = null;
    }
  }

  /** The accumulation resolution in use. */
  get resolution(): number {
    return this.size;
  }

  private target(): { texture: WebGLTexture; framebuffer: WebGLFramebuffer } {
    const gl = this.gl;
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    if (texture === null || framebuffer === null) throw new StageUnavailable("WebGL2 could not allocate a render target.");
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, this.internalFormat, this.size, this.size, 0, gl.RG, gl.FLOAT, null);
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
    const layer: Layer = { texture, framebuffer, buffers: [], counts: [], painted: false };
    this.layers.set(degree, layer);
    return layer;
  }

  /** Add one chunk of a degree's roots. The buffer is `[x, y, weight]` triples in world coordinates. */
  addPoints(degree: number, points: Float32Array): void {
    if (points.length === 0) return;
    const gl = this.gl;
    const layer = this.layerFor(degree);
    const buffer = gl.createBuffer();
    if (buffer === null) return; // out of GPU memory: drop the chunk rather than tearing the page down
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, points, gl.STATIC_DRAW);
    layer.buffers.push(buffer);
    layer.counts.push(points.length / 3);
    layer.painted = false;
  }

  /** Forget every accumulated degree (an alphabet change, or a resolution change). */
  dropLayers(): void {
    const gl = this.gl;
    for (const layer of this.layers.values()) {
      gl.deleteTexture(layer.texture);
      gl.deleteFramebuffer(layer.framebuffer);
      for (const b of layer.buffers) gl.deleteBuffer(b);
    }
    this.layers.clear();
  }

  /** Forget the degrees outside this range; the scrub keeps the rest. */
  dropOutside(minDegree: number, maxDegree: number): void {
    const gl = this.gl;
    for (const [degree, layer] of [...this.layers]) {
      if (degree >= minDegree && degree <= maxDegree) continue;
      gl.deleteTexture(layer.texture);
      gl.deleteFramebuffer(layer.framebuffer);
      for (const b of layer.buffers) gl.deleteBuffer(b);
      this.layers.delete(degree);
    }
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
    gl.viewport(0, 0, this.size, this.size);
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

  /** Sum the selected degrees into the composite target. Returns false when nothing is selected. */
  composeDegrees(minDegree: number, maxDegree: number): boolean {
    const gl = this.gl;
    if (this.composite === null) this.composite = this.target();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.composite.framebuffer);
    gl.viewport(0, 0, this.size, this.size);
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
    const buf = new Float32Array(this.size * this.size * 2);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.composite.framebuffer);
    gl.readPixels(0, 0, this.size, this.size, gl.RG, gl.FLOAT, buf);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const density = new Float32Array(this.size * this.size);
    for (let i = 0, j = 0; i < density.length; i++, j += 2) density[i] = buf[j];
    return density;
  }

  /** Draw the composite to the canvas through the tone ramp and the colour ramp. */
  present(options: {
    maxDensity: number;
    exposure: number;
    byDegree: boolean;
    degreeRange: readonly [number, number];
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
    gl.uniform1f(gl.getUniformLocation(this.presentProgram, "uMaxDensity"), options.maxDensity);
    gl.uniform1f(gl.getUniformLocation(this.presentProgram, "uExposure"), options.exposure);
    gl.uniform1f(gl.getUniformLocation(this.presentProgram, "uDegreeMode"), options.byDegree ? 1 : 0);
    gl.uniform2f(
      gl.getUniformLocation(this.presentProgram, "uDegreeRange"),
      options.degreeRange[0],
      options.degreeRange[1],
    );
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
    gl.deleteProgram(this.pointProgram);
    gl.deleteProgram(this.accumProgram);
    gl.deleteProgram(this.presentProgram);
    gl.deleteVertexArray(this.vao);
    gl.deleteVertexArray(this.emptyVao);
  }
}
