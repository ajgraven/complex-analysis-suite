/**
 * Assembles a complete WebGL2 fragment shader for one plot from compiled
 * `f`/`escape` ASTs at a chosen precision: stdlib → compiled `fFn`/`escapeFn` →
 * the fixed escape-time loop + `colorFcn`. The iteration count and colouring
 * mirror the old CindyScript `preIter`/`colorFcn`.
 *
 * Single precision uses a `vec2` complex type and a `vec2` centre uniform. The
 * df64 build uses a `vec4` complex type (re/im as hi+lo float pairs) and a
 * split centre (`uCenterX`/`uCenterY` as df64), so the per-pixel coordinate keeps
 * ~double precision at deep zoom.
 */

import type { Node } from "../expr/ast";
import { compileEscape, compileF } from "../expr/glsl";
import { COMPLEX_SINGLE_GLSL } from "../glsl/complexSingle.glsl";
import { COMPLEX_DF64_GLSL } from "../glsl/complexDf64.glsl";
import { COMPLEX_DERIVED_GLSL } from "../glsl/complexDerived.glsl";
import { DF64_GLSL } from "../glsl/df64.glsl";

export type Precision = "single" | "df64";

/** Trivial pass-through vertex shader driving a clip-space fullscreen quad. */
export const VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

/** Build the fragment shader for a plot. `fractType`: 1 = parameter space, 0 = dynamical. */
export function buildFragmentShader(fAst: Node, escapeAst: Node, precision: Precision): string {
  const isDf64 = precision === "df64";
  const baseStdlib = isDf64 ? DF64_GLSL + COMPLEX_DF64_GLSL : COMPLEX_SINGLE_GLSL;
  const centerUniforms = isDf64
    ? "uniform vec2 uCenterX;\nuniform vec2 uCenterY;"
    : "uniform vec2 uCenter;";
  const coordinate = isDf64
    ? `  vec2 off = (uv * 2.0 - 1.0) / uZoom;
  cvec z = vec4(df_add(uCenterX, vec2(off.x, 0.0)), df_add(uCenterY, vec2(off.y, 0.0)));`
    : `  vec2 plot = uCenter + (uv * 2.0 - 1.0) / uZoom;
  cvec z = vec_(plot.x, plot.y);`;

  return `#version 300 es
precision highp float;
precision highp int;

${baseStdlib}
${COMPLEX_DERIVED_GLSL}

${compileF(fAst)}
${compileEscape(escapeAst)}

uniform vec2 uResolution;
${centerUniforms}
uniform float uZoom;
uniform int uN;
uniform vec2 uC;
uniform int uFractType; // 1 = parameter space, 0 = dynamical plane
out vec4 fragColor;

vec3 colorFcn(int u) {
  if (u == uN) return vec3(0.0);
  float t = float(u) / float(uN);
  t = 3.0 * t / (2.0 * t + 1.0);
  return vec3(4.0 * t, 1.3 * t, (1.0 - t) * (1.0 - t) * 0.7);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
${coordinate}
  cvec cc = (uFractType == 1) ? z : vec_(uC.x, uC.y);
  int kmax = 0;
  for (int k = 0; k < uN; k++) {
    if (escapeFn(z, cc)) break;
    z = fFn(z, cc);
    kmax = k + 1;
  }
  fragColor = vec4(colorFcn(kmax), 1.0);
}
`;
}
