/**
 * Engine-agnostic helpers for high-resolution PNG export. The orchestration
 * lives in {@link ./render/plotView}.exportPng, which renders the fractal to an
 * RGBA8 framebuffer at the requested size (true detail — no render-image cap,
 * since colour output is byte-backed rather than a float texture) and composites
 * the scaled overlay before downloading.
 */

/** Smallest export size we allow, in pixels. */
const MIN_EXPORT_SIZE = 256;
/** Fallback when no WebGL context is available to query the real limit. */
const DEFAULT_MAX_TEXTURE_SIZE = 4096;

/**
 * Clamp a requested export size to `[MIN_EXPORT_SIZE, maxTextureSize]` and to an
 * integer. `clamped` is true when the integer request fell outside that range.
 */
export function clampExportSize(
  requested: number,
  maxTextureSize: number,
): { size: number; clamped: boolean } {
  const max = Math.max(MIN_EXPORT_SIZE, Math.floor(maxTextureSize));
  const wanted = Math.floor(requested);
  const size = Math.min(max, Math.max(MIN_EXPORT_SIZE, wanted));
  return { size, clamped: size !== wanted };
}

/** Ensure a safe, `.png`-suffixed filename (falling back to `plot.png`). */
export function ensurePngName(name: string): string {
  const cleaned = name.trim().replace(/[\\/:*?"<>|]/g, "_");
  const base = cleaned.length > 0 ? cleaned : "plot";
  return /\.png$/i.test(base) ? base : `${base}.png`;
}

/** Query the GPU's maximum texture size via a throwaway WebGL context. */
export function getMaxTextureSize(): number {
  const gl =
    (document.createElement("canvas").getContext("webgl2") as WebGL2RenderingContext | null) ??
    (document.createElement("canvas").getContext("webgl") as WebGLRenderingContext | null);
  if (!gl) return DEFAULT_MAX_TEXTURE_SIZE;
  const max = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  return typeof max === "number" && max > 0 ? max : DEFAULT_MAX_TEXTURE_SIZE;
}

/** Encode a canvas to a PNG and trigger a browser download (off the main thread). */
export function downloadCanvas(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to encode the PNG"));
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      window.setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(url);
      }, 1000);
      resolve();
    }, "image/png");
  });
}
