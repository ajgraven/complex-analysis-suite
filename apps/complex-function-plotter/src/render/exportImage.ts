/**
 * Pure geometry + naming helpers for the hi-resolution PNG export (catalog K1). The plotter's WebGL2
 * context is created with `preserveDrawingBuffer`, so a hi-res export is just "size the drawing buffer
 * up, paint the current mode, read it back" — no off-screen FBO or tiling needed (contrast the
 * Complex-Dynamics fractal export, which streams strips into one full-size framebuffer). These helpers
 * are the size algebra around that, factored out so they can be unit-tested without a GL context.
 */

/** The smallest export long-edge we allow (a hi-res export below the live view would be pointless). */
export const EXPORT_MIN = 256;

/** The selectable long-edge sizes (px) offered in the UI; 2000 is a sensible publication default. */
export const EXPORT_SIZES = [1000, 2000, 4000] as const;

/**
 * Clamp a requested long-edge (px) into `[EXPORT_MIN, max]` (round to an integer), reporting whether it
 * was clamped so the caller can flag a silently-reduced export. `max` is the GL device's
 * `MAX_TEXTURE_SIZE` (a hi-res buffer can't exceed it).
 */
export function clampLongEdge(
  requested: number,
  max: number,
): { size: number; clamped: boolean } {
  const hi = Math.max(EXPORT_MIN, Math.floor(max) || EXPORT_MIN);
  const want = Math.round(requested);
  const size = Math.min(hi, Math.max(EXPORT_MIN, want));
  return { size, clamped: size !== want };
}

/**
 * The drawing-buffer dimensions for an export whose LONG edge is `longEdge` px, preserving the live
 * `aspect` (= width / height). Landscape pins the width, portrait pins the height; both dimensions floor
 * at 1. Keeping the aspect identical to the live view is what lets the 3D / sphere camera render at the
 * export size unchanged (its projection reads the same width÷height).
 */
export function exportDims(aspect: number, longEdge: number): { w: number; h: number } {
  const a = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
  const edge = Math.max(1, Math.round(longEdge));
  if (a >= 1) return { w: edge, h: Math.max(1, Math.round(edge / a)) };
  return { w: Math.max(1, Math.round(edge * a)), h: edge };
}

/**
 * Sanitise a user-supplied filename into a safe, `.png`-suffixed basename: collapse whitespace to `-`,
 * drop characters outside `[A-Za-z0-9._-]`, trim stray separators, and fall back to `plot` when nothing
 * usable remains. An existing (case-insensitive) `.png` extension is preserved rather than doubled.
 */
export function ensurePngName(name: string): string {
  const base = name
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9._-]/g, "")
    .replace(/-{2,}/g, "-") // collapse runs left by dropped characters (e.g. " / " → "-")
    .replace(/^[.-]+|[.-]+$/g, "");
  const stem = base.replace(/\.png$/i, "") || "plot";
  return `${stem}.png`;
}
