/**
 * Map a fragment coordinate to a point in the complex plane, given the viewport centre, the world
 * half-height (`halfSpan`), and the framebuffer resolution — the ONE viewport convention the plane
 * renderers share: Riemann Map, the Complex-Function Plotter, and the correspondences dynamical AND
 * parameter planes. Centralised so "which pixel is which complex number" cannot silently drift between
 * the tools that hand views off to one another. Aspect is applied on x so pixels stay square.
 *
 * Returns a `cvec` and uses the `vec_` alias from COMPLEX_SINGLE_GLSL — concatenate this AFTER it. The
 * three call sites' uniforms are named `uCenter` / `uHalfSpan` / `uResolution`, but the function takes
 * them as parameters, so a consumer may pass any equivalents.
 */
export const PLANE_FROM_FRAG_GLSL = /* glsl */ `cvec planeFromFrag(vec2 fragCoord, vec2 center, float halfSpan, vec2 resolution) {
  float aspect = resolution.x / resolution.y;
  return vec_(
    center.x + (fragCoord.x / resolution.x - 0.5) * 2.0 * halfSpan * aspect,
    center.y + (fragCoord.y / resolution.y - 0.5) * 2.0 * halfSpan
  );
}`;
