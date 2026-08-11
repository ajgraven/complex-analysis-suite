/**
 * HSV → RGB, the standard smooth branchless hue-wheel conversion (`c` = (hue, saturation, value), all
 * in [0,1]). Shared by the phase / domain colouring in Complex Dynamics and Riemann Map. Pure — no
 * uniforms and no complex stdlib — so it drops into any fragment program by concatenation.
 */
export const HSV2RGB_GLSL = /* glsl */ `vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}`;
