// **THE DECLARED DETERMINATION, ON THE GPU** — M4.7c's gate.
//
// `kernel/branch/declared.ts` builds the record's declared branch product; `ui/stage/declared.glsl
// .ts` emits the same product as GLSL, per record, into the program text. Three things have to be
// true for that to be worth anything, and none of them can be checked without a real context:
//
//  1. **Every generated program builds.** The emitter writes different code for each record — a
//     reversed subtraction for a factor the record wrote `(b − z)`, an integer loop for `log^m` —
//     and the node suite's string assertions cannot tell you any of it compiles or links.
//  2. **It agrees with its CPU twin.** Same discipline as `cutParity.browser.test.ts`, and the same
//     floor: anything passing through `sin`/`cos` is bounded by GLSL ES §4.5.1's absolute `2^-11`,
//     not by float32's eps. A product of `n` factors carries `n` of those.
//  3. **`|f|` does not move**, for a power product — which is research 06 §5.1's device #2, the
//     claim the app makes to the reader when it draws modulus contours through a phase seam.
//     Executed here against the PRINCIPAL program: two programs, two determinations, one modulus.
//     And for a `log^m` record the same comparison must FAIL, because a log's monodromy is additive
//     and the modulus really does jump — so the assertion is in both directions.
import { describe, expect, it } from "vitest";
import { compileF, makeComplexFn } from "@cas/expr";
import { COMPLEX_DERIVED_GLSL, COMPLEX_SINGLE_GLSL, createProgram } from "@cas/gpu";
import { buildPhaseFrag, PHASE_VERT } from "../src/ui/stage/phase.glsl.js";
import { CUT_GLSL } from "../src/ui/stage/cut.glsl.js";
import { declaredProductGlsl } from "../src/ui/stage/declared.glsl.js";
import { evaluateDeclared, type DeclaredProduct } from "../src/kernel/branch/declared.js";
import { offeredFamilies, primaryGolden, runFamily, type FamilyRun } from "../src/families/runFamily.js";
import type { Cx } from "../src/kernel/geom.js";

/**
 * The parity bound, per factor — `cutParity.browser.test.ts`'s `POW_RELATIVE`, for the same reason.
 *
 * GLSL ES 3.0 §4.5.1 requires only an ABSOLUTE error below `2^-11` of `sin` and `cos`; `cpowCut`
 * multiplies that by its modulus, so the honest comparison is relative and bounded by the sin/cos
 * error itself. A product of `n` factors multiplies `n` such factors together, and relative errors
 * add, so the bound is per-factor and the caller scales it.
 */
const PER_FACTOR = Math.SQRT2 * 2 ** -11 + 1e-4;

function context(): WebGL2RenderingContext {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const gl = canvas.getContext("webgl2");
  if (!gl) throw new Error("no WebGL2 context — headless Chromium should provide one via SwiftShader");
  if (!gl.getExtension("EXT_color_buffer_float")) {
    throw new Error("EXT_color_buffer_float unavailable — cannot read float results back");
  }
  return gl;
}

/** Exactly the stdlib `GLStage.setIntegrand` assembles, CUT_GLSL included. */
const STDLIB = `${COMPLEX_SINGLE_GLSL}\n${COMPLEX_DERIVED_GLSL}\nuniform vec2 uA;\n${CUT_GLSL}\n`;

/** The program `GLStage.setIntegrand(cofactor, product)` builds, for a link assertion. */
const phaseProgram = (gl: WebGL2RenderingContext, run: FamilyRun): WebGLProgram => {
  const declared = run.declared;
  if (declared === undefined) throw new Error("not a branch record");
  return createProgram(
    gl,
    PHASE_VERT,
    buildPhaseFrag(STDLIB, compileF(declared.cofactor), declaredProductGlsl(declared.product)),
  );
};

/**
 * Run one `vec4` expression of `z` over `samples` and read the results back.
 *
 * A value probe rather than the phase program, because the phase program outputs a COLOUR and a
 * parity claim about a colour is a claim about the colour map. `extra` carries whatever function
 * bodies the expression needs.
 */
function probe(
  gl: WebGL2RenderingContext,
  extra: string,
  body: string,
  samples: readonly Cx[],
): Float32Array[] {
  const frag = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2 uZ;
uniform vec2 uParamC;
${STDLIB}
${extra}
void main() { fragColor = ${body}; }
`;
  const program = createProgram(gl, PHASE_VERT, frag);
  const vao = gl.createVertexArray();
  const buffer = gl.createBuffer();
  const texture = gl.createTexture();
  const fbo = gl.createFramebuffer();
  try {
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 1, 1, 0, gl.RGBA, gl.FLOAT, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, 1, 1);
    gl.useProgram(program);
    gl.uniform1i(gl.getUniformLocation(program, "uCutCount"), 0);
    gl.uniform2f(gl.getUniformLocation(program, "uCutBase"), 0, 1);
    gl.uniform2f(gl.getUniformLocation(program, "uParamC"), 0, 0);

    const uZ = gl.getUniformLocation(program, "uZ");
    const out: Float32Array[] = [];
    for (const z of samples) {
      gl.uniform2f(uZ, z[0], z[1]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const px = new Float32Array(4);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, px);
      out.push(px);
    }
    return out;
  } finally {
    gl.deleteProgram(program);
    gl.deleteVertexArray(vao);
    gl.deleteBuffer(buffer);
    gl.deleteTexture(texture);
    gl.deleteFramebuffer(fbo);
  }
}

/** Every branch record, at its primary fixture. */
function branchRuns(): { id: string; run: FamilyRun; product: DeclaredProduct }[] {
  const out: { id: string; run: FamilyRun; product: DeclaredProduct }[] = [];
  for (const family of offeredFamilies().tiers.flatMap((t) => t.families)) {
    const r = runFamily(family, primaryGolden(family));
    if (r.ok && r.run.declared !== undefined) {
      out.push({ id: family.id, run: r.run, product: r.run.declared.product });
    }
  }
  return out;
}

/**
 * A grid, clear of every branch point and of the point where a `log` factor vanishes.
 *
 * Both exclusions are about the VALUE, not the branch: at `bⱼ` a negative exponent is infinite and
 * at `bⱼ + 1` the logarithm is zero, and a relative comparison against 0 or ∞ measures the float
 * format rather than the shader. A phase portrait paints those white and black respectively, which
 * is the same admission made in colour.
 */
function gridFor(product: DeclaredProduct, step = 0.53, reach = 3): Cx[] {
  const out: Cx[] = [];
  for (let x = -reach; x <= reach + 1e-9; x += step) {
    for (let y = -reach; y <= reach + 1e-9; y += step) {
      const z: Cx = [x, y];
      let ok = true;
      for (const factor of product.factors) {
        if (Math.hypot(x - factor.at[0], y - factor.at[1]) < 0.3) ok = false;
        if (factor.kind === "log" && Math.hypot(x - factor.at[0] - 1, y - factor.at[1]) < 0.3) ok = false;
      }
      if (ok) out.push(z);
    }
  }
  return out;
}

const abs = (z: readonly [number, number]): number => Math.hypot(z[0], z[1]);

/**
 * One PIXEL of the real phase program at one point — the colour, end to end.
 *
 * The value probes above cannot see a `buildPhaseFrag` that emits `casDeclared` and then never
 * calls it: an unused function links perfectly. This renders the actual fragment program the stage
 * runs and reads the colour back, so the only thing that can make the two programs agree below the
 * cut is the stage drawing the principal branch after all.
 *
 * The viewport is 1×1, so `vUv` is (0.5, 0.5) and the sampled point is the range's centre.
 */
function pixelAt(gl: WebGL2RenderingContext, program: WebGLProgram, z: Cx, iso = 0): Float32Array {
  const vao = gl.createVertexArray();
  const buffer = gl.createBuffer();
  const texture = gl.createTexture();
  const fbo = gl.createFramebuffer();
  try {
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 1, 1, 0, gl.RGBA, gl.FLOAT, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, 1, 1);
    gl.useProgram(program);
    const d = 0.01;
    gl.uniform4f(gl.getUniformLocation(program, "uRange"), z[0] - d, z[0] + d, z[1] - d, z[1] + d);
    gl.uniform2f(gl.getUniformLocation(program, "uParamC"), 0, 0);
    gl.uniform2f(gl.getUniformLocation(program, "uA"), 0, 0);
    gl.uniform1f(gl.getUniformLocation(program, "uModulusDepth"), 1);
    // Grid and isolines off: both paint in lightness, and a line under the sample would make the
    // comparison about the overlay rather than about the determination.
    gl.uniform1f(gl.getUniformLocation(program, "uGridStrength"), 0);
    gl.uniform1f(gl.getUniformLocation(program, "uIsoStrength"), iso);
    gl.uniform1i(gl.getUniformLocation(program, "uCutCount"), 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const px = new Float32Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, px);
    return px;
  } finally {
    gl.deleteVertexArray(vao);
    gl.deleteBuffer(buffer);
    gl.deleteTexture(texture);
    gl.deleteFramebuffer(fbo);
  }
}

describe("every branch record's generated program builds", () => {
  const cases = branchRuns();

  it("covers all seven", () => {
    expect(cases).toHaveLength(7);
  });

  it.each(cases.map((c) => [c.id, c] as const))("%s compiles and links", (_id, { run }) => {
    const gl = context();
    expect(() => phaseProgram(gl, run)).not.toThrow();
  });
});

describe("casDeclared agrees with its CPU twin", () => {
  it.each(branchRuns().map((c) => [c.id, c] as const))("%s, over a grid", (_id, { product }) => {
    const gl = context();
    const samples = gridFor(product);
    expect(samples.length).toBeGreaterThan(100);
    const got = probe(gl, declaredProductGlsl(product), "vec4(casDeclared(uZ), 0.0, 1.0)", samples);
    // Relative errors multiply out to a sum, so the bound scales with the factor count. `log^m` is
    // `m` multiplications of one value, so it carries `m` of them too.
    const depth = product.factors.reduce((n, f) => n + (f.kind === "log" ? f.power : 1), 0);
    const tolerance = depth * PER_FACTOR;
    for (let k = 0; k < samples.length; k++) {
      const want = evaluateDeclared(product, samples[k]);
      const err = Math.hypot(got[k][0] - want[0], got[k][1] - want[1]) / abs(want);
      expect({ z: samples[k], ok: err < tolerance }).toEqual({ z: samples[k], ok: true });
    }
  });
});

describe("the declared picture and the principal one", () => {
  // The two programs differ ONLY in which determination they evaluate: `declared` builds the branch
  // half from the record's declaration, `principal` is `@cas/expr`'s compile of the whole contour
  // integrand, which is what the stage drew before M4.7c. Comparing them on the GPU is comparing
  // the picture the reader used to see with the one they see now.
  const cases = branchRuns();
  const powers = cases.filter((c) => c.product.factors.every((f) => f.kind === "power"));
  const logs = cases.filter((c) => !c.product.factors.every((f) => f.kind === "power"));

  const compare = (
    kase: { run: FamilyRun; product: DeclaredProduct },
  ): { ratios: number[]; phases: number[] } => {
    const gl = context();
    const samples = gridFor(kase.product);
    const declared = kase.run.declared;
    if (declared === undefined) throw new Error("not a branch record");
    const mine = probe(
      gl,
      `${declaredProductGlsl(kase.product)}\n${compileF(declared.cofactor)}`,
      "vec4(cmul(casDeclared(uZ), fFn(uZ, uParamC)), 0.0, 1.0)",
      samples,
    );
    const theirs = probe(gl, compileF(kase.run.ast), "vec4(fFn(uZ, uParamC), 0.0, 1.0)", samples);
    const ratios: number[] = [];
    const phases: number[] = [];
    for (let k = 0; k < samples.length; k++) {
      const a = abs([mine[k][0], mine[k][1]]);
      const b = abs([theirs[k][0], theirs[k][1]]);
      if (!Number.isFinite(a) || !Number.isFinite(b) || b < 1e-6 || b > 1e6) continue;
      ratios.push(a / b);
      phases.push(
        Math.abs(
          Math.atan2(mine[k][1], mine[k][0]) - Math.atan2(theirs[k][1], theirs[k][0]),
        ),
      );
    }
    expect(ratios.length).toBeGreaterThan(100);
    return { ratios, phases };
  };

  it.each(powers.map((c) => [c.id, c] as const))(
    "%s — a power product: SAME modulus everywhere, so the modulus contours run through the seam",
    (_id, kase) => {
      const { ratios } = compare(kase);
      // float32 through two different expression trees, so not bit-equal — but the claim is that the
      // determination does not enter the modulus at all, and 1e-3 is three orders below the phase
      // difference below the cut.
      for (const r of ratios) expect(Math.abs(r - 1)).toBeLessThan(1e-3);
    },
  );

  it.each(logs.map((c) => [c.id, c] as const))(
    "%s — a log: the modulus JUMPS, so the app must not claim the contours are continuous",
    (_id, kase) => {
      const { ratios } = compare(kase);
      const moved = ratios.filter((r) => Math.abs(r - 1) > 0.01);
      // Roughly half the grid — the half below the cut. Not "at least one": a log's additive
      // monodromy moves every point on the far side, and a handful would mean something else.
      expect(moved.length).toBeGreaterThan(ratios.length * 0.3);
      expect(Math.max(...ratios)).toBeGreaterThan(5);
    },
  );

  it("and the two determinations genuinely differ in PHASE, or none of this is doing anything", () => {
    for (const kase of cases) {
      const { phases } = compare(kase);
      const moved = phases.filter((p) => p > 1e-3);
      expect({ id: kase.id, someMoved: moved.length > phases.length * 0.2 }).toEqual({
        id: kase.id,
        someMoved: true,
      });
    }
  });
});

describe("the STAGE's own pixels change, which is the only claim a reader can see", () => {
  // Everything above probes the value. This renders the real `buildPhaseFrag` program — colour map,
  // lightness bands and all — and compares the pixel the reader looks at, above and below the cut.
  // It is the one assertion that fails if `buildPhaseFrag` emits `casDeclared` and then forgets to
  // call it, which links without complaint and draws the old picture.
  const ABOVE_CUT: Cx = [0.45, 1.2];
  const BELOW_CUT: Cx = [0.45, -1.2];

  it.each(branchRuns().map((c) => [c.id, c] as const))("%s", (_id, { run }) => {
    const gl = context();
    const declared = phaseProgram(gl, run);
    const principal = createProgram(gl, PHASE_VERT, buildPhaseFrag(STDLIB, compileF(run.ast)));
    const diff = (z: Cx): number => {
      const a = pixelAt(gl, declared, z);
      const b = pixelAt(gl, principal, z);
      return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
    };
    // Above the cut the two determinations coincide, so the pixel must be the SAME — which is what
    // rules out "the declared program just draws something else".
    expect({ where: "above", same: diff(ABOVE_CUT) < 2e-3 }).toEqual({ where: "above", same: true });
    // Below it they do not, and the reader sees a different colour. 0.05 in linear sRGB is a change
    // nobody could miss; the actual differences are far larger.
    expect({ where: "below", changed: diff(BELOW_CUT) > 0.05 }).toEqual({
      where: "below",
      changed: true,
    });
  });
});

describe("the modulus contours sit in the SAME places in both determinations", () => {
  // **THE APP'S OWN SENTENCE, AS AN ASSERTION.** With the overlay on, a power record's card tells
  // the reader the contours "run straight through any cut". The mutation sweep found that nothing
  // checked it: an overlay driven by `fract(hue)` rather than `fract(log2|f|)` would trace the seam
  // instead of crossing it, and every other test in this file passes because they all switch the
  // overlay off.
  //
  // **THE POINTS COME FROM THE CPU, AND THEY HAVE TO.** The probe renders a 1×1 viewport, so
  // `fwidth(t)` is the change in `log2|f|` across a pixel 0.02 wide — for these records about 0.01,
  // which makes the isoline a hair. A grid lands on one only by luck: the first draft of this block
  // compared the two determinations over a grid and passed while measuring ZERO ink at every
  // sample, which is agreement about nothing. So the sample points are solved for.
  //
  // And solved for in `t`, not in `fract(t)`. `fract` is a sawtooth, so the sign of `fract(t) − 1/2`
  // flips both at a real crossing and at the `1 → 0` wrap, and a bisection on it converges happily
  // onto the wrap — where `fract` is 0, the shader correctly inks nothing, and the test reports a
  // defect that is not there. `t` along a ray is continuous and monotone, so bisecting `t − (k+½)`
  // finds the crossing and bisecting `t − k` finds the band edge that serves as the control.
  const powers = branchRuns().filter((c) => c.product.factors.every((f) => f.kind === "power"));

  /** The overlay's darkening at `z`, as a fraction of the pixel it darkens. */
  const inkAt = (gl: WebGL2RenderingContext, program: WebGLProgram, z: Cx): number => {
    const off = pixelAt(gl, program, z, 0);
    const on = pixelAt(gl, program, z, 1);
    const base = Math.hypot(off[0], off[1], off[2]);
    if (base < 1e-6) return 0;
    return Math.hypot(on[0] - off[0], on[1] - off[1], on[2] - off[2]) / base;
  };

  it.each(powers.map((c) => [c.id, c] as const))("%s", (_id, { run, product }) => {
    const gl = context();
    const declared = phaseProgram(gl, run);
    const principal = createProgram(gl, PHASE_VERT, buildPhaseFrag(STDLIB, compileF(run.ast)));
    const co = makeComplexFn(run.declared?.cofactor ?? run.ast);

    // A ray out from the first branch point, angled off the axis so it clears the cut, sampled in
    // `log r` so `t = log2|f|` sweeps several bands however fast the record's modulus moves.
    const at = (u: number): Cx => {
      const r = Math.exp(u);
      return [product.factors[0].at[0] + r * Math.cos(0.9), product.factors[0].at[1] + r * Math.sin(0.9)];
    };
    const tAt = (u: number): number => {
      const z = at(u);
      const b = evaluateDeclared(product, z);
      const c = co(z as [number, number], [0, 0]) as Cx;
      return Math.log2(abs([b[0] * c[0] - b[1] * c[1], b[0] * c[1] + b[1] * c[0]]));
    };

    const U0 = Math.log(0.12);
    const U1 = Math.log(6);
    const STEPS = 240;
    /** Bisect for `t = target` on a window where `t − target` changes sign. `t` is continuous here. */
    const solve = (lo: number, hi: number, target: number): number => {
      let a = lo;
      let b = hi;
      for (let k = 0; k < 80; k++) {
        const m = (a + b) / 2;
        if ((tAt(a) - target) * (tAt(m) - target) <= 0) b = m;
        else a = m;
      }
      return (a + b) / 2;
    };
    const crossings = (offset: number): number[] => {
      const out: number[] = [];
      for (let k = 0; k < STEPS; k++) {
        const lo = U0 + ((U1 - U0) * k) / STEPS;
        const hi = U0 + ((U1 - U0) * (k + 1)) / STEPS;
        const a = tAt(lo);
        const b = tAt(hi);
        if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
        // Every half-integer (or integer) strictly between the two endpoint values is crossed once
        // on a monotone stretch; take the first, which is all this needs.
        for (let n = Math.ceil(Math.min(a, b) - offset); n <= Math.floor(Math.max(a, b) - offset); n++) {
          const target = n + offset;
          if (target <= Math.min(a, b) || target >= Math.max(a, b)) continue;
          out.push(solve(lo, hi, target));
          break;
        }
      }
      return out;
    };

    const halves = crossings(0.5);
    const edges = crossings(0);
    // A record whose modulus were flat over these five octaves would have none of either, and then
    // this test measures nothing — so both lists are required to be populated rather than iterated
    // over whatever happens to be there. Two is the floor because two is what D2 has: `α = 1/2`
    // against a quadratic cofactor moves `log2|f|` by about 2.4 across the whole ray, which is a
    // fact about that record and not a weakness here (two crossings, checked in both
    // determinations, plus two band edges, is eight assertions).
    expect(halves.length).toBeGreaterThanOrEqual(2);
    expect(edges.length).toBeGreaterThanOrEqual(2);

    for (const u of halves.slice(0, 5)) {
      const z = at(u);
      // At a half-band `dIso` is 0, so `iso` is 1 and the shader multiplies the colour by 0.6 — a
      // darkening of roughly 40%, which no float32 tolerance can blur away.
      const mine = inkAt(gl, declared, z);
      expect({ z, inks: mine > 0.1 }).toEqual({ z, inks: true });
      // **AND THE SAME IN THE OTHER DETERMINATION.** `|f|` cannot see the determination for a power
      // product, so this point is a half-band for the principal program too and it must ink there
      // by the same amount. This is the claim the card makes, and the one that fails the moment the
      // overlay depends on anything but the modulus.
      expect({ z, same: Math.abs(mine - inkAt(gl, principal, z)) < 0.02 }).toEqual({ z, same: true });
    }
    for (const u of edges.slice(0, 5)) {
      const z = at(u);
      // Half a band away, with `fwidth` a hair: no ink, in either determination.
      expect({ z, inks: inkAt(gl, declared, z) > 0.1 }).toEqual({ z, inks: false });
      expect({ z, inks: inkAt(gl, principal, z) > 0.1 }).toEqual({ z, inks: false });
    }
  });
});
