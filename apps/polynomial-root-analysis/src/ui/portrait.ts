// The root pane's WebGL2 backdrop: a phase portrait of p, drawn from its ROOT form.
//
// arg p(z) = arg aₙ + Σ arg(z − rᵢ) and log|p(z)| = log|aₙ| + Σ log|z − rᵢ| are stable in float32 at
// any degree this app allows, where Horner on the coefficients in float32 is noise for Wilkinson's
// polynomial long before degree 20. So the picture is of `aₙ ∏(z − r̃ᵢ)` with r̃ᵢ the plotted
// approximations — within each certified disc of p itself, and labelled `≈` once, in the legend.
//
// Hue is CET-C6 (`@cas/gpu/cet`, a 256×1 texture) at arg p; the modulus is a sawtooth on log₂|p| that
// DARKENS in linear light (one band per doubling), which stays inside the gamut where lightening a
// table that rides the sRGB boundary would not (Contour Integration's `phase.glsl.ts` measures why).
//
// The pseudozero layer (PRA-2) draws f(z) = log₁₀(|p(z)| / w(z)), w(z) = Σ|aₖ||z|ᵏ, with |p| from the
// root form above and w by log-sum-exp over log|aₖ| + k·log|z| (so no power of |z| is ever formed). The
// set Λ_ε = { f ≤ log₁₀ ε } is greyed, its edge stroked, and every decade of f above it drawn faint —
// the ladder of nested sets as ε grows. f ≤ 0 everywhere (|p| ≤ w), so the ladder is finite. This
// picture is `≈`; the certificate is the Analysis card's, over grid cells that contain it.
//
// `uProbe` replaces the colour with f itself — 16 bits of (f + 40)/50 in R and G, the inside flag in
// B — so the browser suite can compare the shader's f against a float64 evaluation pixel by pixel.
import { createProgram } from "@cas/gpu";
import { cetC6Bytes } from "@cas/gpu/cet";
import { MAX_DEGREE, type Cx } from "../engine/polynomial.js";

export const PORTRAIT_VERT = `#version 300 es
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

export const PORTRAIT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform vec4 uRange;               // xmin, xmax, ymin, ymax
uniform vec2 uRoots[${MAX_DEGREE}];
uniform int uN;
uniform vec2 uLead;
uniform float uBands;              // 0 = phase only
uniform sampler2D uRamp;
uniform float uLogA[${MAX_DEGREE + 1}];  // log|aₖ|, −1e30 for a zero coefficient
uniform int uDeg;
uniform float uPz;                 // 1 = draw the pseudozero layer
uniform float uLogEps;             // log₁₀ ε
uniform float uProbe;              // 1 = write f, not colour

vec3 srgbToLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c)); }
vec3 linearToSrgb(vec3 c) { c = clamp(c, 0.0, 1.0); return mix(12.92 * c, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }

float pzF = 1.0;

void main() {
  vec2 z = vec2(mix(uRange.x, uRange.y, vUv.x), mix(uRange.z, uRange.w, vUv.y));
  // Unit phase as a running product of unit vectors; log-modulus as a running sum.
  vec2 u = normalize(uLead);
  float lm = log(length(uLead));
  for (int i = 0; i < ${MAX_DEGREE}; i++) {
    if (i >= uN) break;
    vec2 d = z - uRoots[i];
    float r = length(d);
    if (r == 0.0) { fragColor = vec4(1.0); return; }
    vec2 e = d / r;
    u = normalize(vec2(u.x * e.x - u.y * e.y, u.x * e.y + u.y * e.x));
    lm += log(r);
  }
  if (uPz > 0.5 || uProbe > 0.5) {
    float lr = log(max(length(z), 1e-30));
    float m = -1e30;
    for (int k = 0; k <= ${MAX_DEGREE}; k++) {
      if (k > uDeg) break;
      m = max(m, uLogA[k] + float(k) * lr);
    }
    float s = 0.0;
    for (int k = 0; k <= ${MAX_DEGREE}; k++) {
      if (k > uDeg) break;
      s += exp(uLogA[k] + float(k) * lr - m);
    }
    float f = (lm - (m + log(s))) * 0.43429448190;   // log₁₀(|p| / w)
    if (uProbe > 0.5) {
      float t = floor(clamp((f + 40.0) / 50.0, 0.0, 1.0) * 65535.0 + 0.5);
      fragColor = vec4(floor(t / 256.0) / 255.0, mod(t, 256.0) / 255.0, f <= uLogEps ? 1.0 : 0.0, 1.0);
      return;
    }
    pzF = f;
  }
  float hue = atan(u.y, u.x);
  vec3 lin = srgbToLinear(texture(uRamp, vec2(hue * 0.15915494309 + 0.5, 0.5)).rgb);
  float t = fract(lm * 1.44269504089);   // log2|p|, one band per doubling
  lin *= mix(1.0, 0.62 + 0.38 * (1.0 - t), uBands);
  if (uPz > 0.5) {
    // Clamped: a quad holding a root sees f fall by tens of decades, and an unclamped fwidth there
    // would stroke the ε-edge (and a decade line) one pixel from EVERY root, whatever ε is.
    float g = clamp(fwidth(pzF), 1e-6, 0.25);
    // Inside: grey and lightened. Lightening alone is lost on CET-C6, whose colours are already light;
    // the loss of HUE is what reads as "a set" over a phase portrait.
    if (pzF <= uLogEps) lin = mix(vec3(dot(lin, vec3(0.2126, 0.7152, 0.0722))), vec3(1.0), 0.3);
    else {
      // The ladder: one faint line per decade of f between ε and 1.
      float dd = abs(pzF - floor(pzF + 0.5)) / g;
      lin *= 1.0 - 0.35 * (1.0 - smoothstep(0.5, 1.5, dd));
    }
    float de = abs(pzF - uLogEps) / g;
    lin *= 1.0 - 0.9 * (1.0 - smoothstep(0.75, 2.0, de));
  }
  fragColor = vec4(linearToSrgb(lin), 1.0);
}
`;

/** The pseudozero layer's inputs: the coefficients (for w) and log₁₀ ε; `probe` writes f instead. */
export interface PortraitPseudozero {
  readonly coeffs: readonly Cx[];
  readonly log10eps: number;
  readonly probe?: boolean;
}

/** Decode one probe pixel: f = log₁₀(|p|/w) to 50/65535 ≈ 7.6e-4, and whether the shader called it inside. */
export function decodeProbe(
  r: number,
  g: number,
  b: number,
): { f: number; inside: boolean } {
  return { f: ((r * 256 + g) / 65535) * 50 - 40, inside: b > 127 };
}

export class Portrait {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly loc: Record<string, WebGLUniformLocation | null> = {};
  private readonly roots = new Float32Array(2 * MAX_DEGREE);
  private readonly logA = new Float32Array(MAX_DEGREE + 1);

  constructor(readonly canvas: HTMLCanvasElement) {
    // preserveDrawingBuffer: the figure export reads this canvas after the browser has composited it
    // (Contour Integration's M6.3 finding — without it the read returns an empty buffer).
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error("WebGL2 is not available in this browser.");
    this.gl = gl;
    this.program = createProgram(gl, PORTRAIT_VERT, PORTRAIT_FRAG);
    for (const n of [
      "uRange",
      "uRoots",
      "uN",
      "uLead",
      "uBands",
      "uRamp",
      "uLogA",
      "uDeg",
      "uPz",
      "uLogEps",
      "uProbe",
    ])
      this.loc[n] = gl.getUniformLocation(this.program, n);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      256,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      cetC6Bytes(),
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  render(
    range: readonly [number, number, number, number],
    roots: readonly Cx[],
    lead: Cx,
    bands: boolean,
    pseudozero: PortraitPseudozero | null = null,
  ): void {
    const { gl } = this;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.program);
    this.roots.fill(0);
    roots.forEach(([x, y], i) => {
      this.roots[2 * i] = x;
      this.roots[2 * i + 1] = y;
    });
    gl.uniform4f(this.loc.uRange, range[0], range[1], range[2], range[3]);
    gl.uniform2fv(this.loc.uRoots, this.roots);
    gl.uniform1i(this.loc.uN, roots.length);
    gl.uniform2f(this.loc.uLead, lead[0], lead[1]);
    gl.uniform1f(this.loc.uBands, bands ? 1 : 0);
    gl.uniform1i(this.loc.uRamp, 0);
    this.logA.fill(-1e30);
    if (pseudozero) {
      pseudozero.coeffs.forEach(([x, y], k) => {
        const a = Math.hypot(x, y);
        this.logA[k] = a > 0 ? Math.log(a) : -1e30;
      });
    }
    gl.uniform1fv(this.loc.uLogA, this.logA);
    gl.uniform1i(this.loc.uDeg, pseudozero ? pseudozero.coeffs.length - 1 : 0);
    gl.uniform1f(this.loc.uPz, pseudozero && !pseudozero.probe ? 1 : 0);
    gl.uniform1f(this.loc.uProbe, pseudozero?.probe ? 1 : 0);
    gl.uniform1f(this.loc.uLogEps, pseudozero?.log10eps ?? 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
