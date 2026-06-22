/**
 * Assembles a complete WebGL2 fragment shader for one plot from compiled
 * `f`/`escape` ASTs: precision stdlib → compiled `fFn`/`escapeFn` → the fixed
 * escape-time loop + `colorFcn`. The iteration count and colouring exactly mirror
 * the old CindyScript `preIter`/`colorFcn` so output matches the previous engine.
 */

import type { Node } from "../expr/ast";
import { compileEscape, compileF } from "../expr/glsl";
import { COMPLEX_SINGLE_GLSL } from "../glsl/complexSingle.glsl";
import { COMPLEX_DERIVED_GLSL } from "../glsl/complexDerived.glsl";

export type Precision = "single" | "df64";

/** Trivial pass-through vertex shader driving a clip-space fullscreen quad. */
export const VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

function baseStdlib(precision: Precision): string {
  // df64 base stdlib arrives in Phase C; single precision is the current path.
  if (precision === "df64") throw new Error("df64 precision not yet implemented");
  return COMPLEX_SINGLE_GLSL;
}

/** Build the fragment shader for a plot. `fractType`: 1 = parameter space, 0 = dynamical. */
export function buildFragmentShader(fAst: Node, escapeAst: Node, precision: Precision): string {
  return `#version 300 es
precision highp float;
precision highp int;

${baseStdlib(precision)}
${COMPLEX_DERIVED_GLSL}

${compileF(fAst)}
${compileEscape(escapeAst)}

uniform vec2 uResolution;
uniform vec2 uCenter;
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
  vec2 plot = uCenter + (uv * 2.0 - 1.0) / uZoom;
  cvec z = vec_(plot.x, plot.y);
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
