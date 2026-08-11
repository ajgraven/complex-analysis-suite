/**
 * Engine-agnostic helpers for high-resolution PNG export. The orchestration
 * lives in {@link ./render/plotView}.exportPng, which renders the fractal to an
 * RGBA8 framebuffer at the requested size (true detail — no render-image cap,
 * since colour output is byte-backed rather than a float texture) and composites
 * the scaled overlay before downloading.
 */

import { injectPngText } from "@cas/export";

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

/**
 * Flip an RGBA8 image's rows **in place** — WebGL reads bottom-up, `ImageData` is top-down.
 *
 * In place, and that is the point. The obvious version allocates a second full-size buffer and
 * copies row by row into it, which doubles peak memory at exactly the moment it is already highest:
 * an 8192² export is 268 MB per buffer, so holding both peaked at 537 MB and put the export within
 * reach of an allocation failure on a modest machine for no reason. Swapping through one row of
 * scratch costs 32 KB at that size. The caller then hands the SAME `ArrayBuffer` to `ImageData` via
 * a `Uint8ClampedArray` view, so there is no copy on that side either. (cd-render-07)
 *
 * `size` is the side length in pixels; `buf.length` must be `size * size * 4`.
 */
export function flipRowsInPlace(buf: Uint8Array, size: number): void {
  const rowBytes = size * 4;
  if (buf.length !== rowBytes * size) {
    throw new Error(`flipRowsInPlace: expected ${rowBytes * size} bytes for ${size}², got ${buf.length}`);
  }
  const scratch = new Uint8Array(rowBytes);
  // A middle row (odd `size`) is already in place, so the loop stops before it.
  for (let top = 0, bottom = size - 1; top < bottom; top++, bottom--) {
    const t = top * rowBytes;
    const b = bottom * rowBytes;
    scratch.set(buf.subarray(t, t + rowBytes));
    buf.copyWithin(t, b, b + rowBytes);
    buf.set(scratch, b);
  }
}

/** Ensure a safe, `.png`-suffixed filename (falling back to `plot.png`). */
export function ensurePngName(name: string): string {
  const cleaned = name.trim().replace(/[\\/:*?"<>|]/g, "_");
  const base = cleaned.length > 0 ? cleaned : "plot";
  return /\.png$/i.test(base) ? base : `${base}.png`;
}

/** Memoized GPU max texture size — the value is fixed per device, and creating a
 *  WebGL context per query leaks contexts (browsers cap live contexts at ~16, so
 *  repeated exports/copies would eventually start failing). */
let cachedMaxTextureSize: number | null = null;

/** Query the GPU's maximum texture size via a throwaway WebGL context (cached). */
export function getMaxTextureSize(): number {
  if (cachedMaxTextureSize !== null) return cachedMaxTextureSize;
  const canvas = document.createElement("canvas");
  const gl =
    (canvas.getContext("webgl2") as WebGL2RenderingContext | null) ??
    (canvas.getContext("webgl") as WebGLRenderingContext | null);
  if (!gl) return DEFAULT_MAX_TEXTURE_SIZE; // don't cache: a real context may appear later
  const max = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  // Release the throwaway context immediately rather than waiting for GC.
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  cachedMaxTextureSize = typeof max === "number" && max > 0 ? max : DEFAULT_MAX_TEXTURE_SIZE;
  return cachedMaxTextureSize;
}

/**
 * Encode a canvas to a PNG and trigger a browser download. When `metadata` is given, its
 * keyword → text pairs are embedded as PNG `tEXt` chunks (invisible reproducibility parameters —
 * no image pixel changes).
 */
export async function downloadCanvas(
  canvas: HTMLCanvasElement,
  filename: string,
  metadata?: Record<string, string>,
): Promise<void> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Failed to encode the PNG");
  let out = blob;
  if (metadata && Object.keys(metadata).length > 0) {
    const stamped = injectPngText(new Uint8Array(await blob.arrayBuffer()), metadata);
    // Copy into a fresh ArrayBuffer-backed view so the Blob part types cleanly (TS 5.7 narrows
    // ArrayBufferLike vs ArrayBuffer); the extra copy is negligible for a one-shot export.
    out = new Blob([new Uint8Array(stamped)], { type: "image/png" });
  }
  const url = URL.createObjectURL(out);
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
}

/**
 * Encode a canvas to a PNG and place it on the system clipboard — the "copy image" twin of
 * {@link downloadCanvas}. `metadata` is embedded best-effort (same tEXt injection), but browsers
 * re-encode clipboard images, so the OS clipboard usually strips custom chunks: the DOWNLOAD path is
 * the reproducible one, this is a convenience for pasting into another app. Rejects when the async
 * Clipboard image API is unavailable (older browsers / insecure context) so the caller can fall back
 * to a download and toast.
 */
export async function copyCanvasToClipboard(
  canvas: HTMLCanvasElement,
  metadata?: Record<string, string>,
): Promise<void> {
  if (typeof ClipboardItem === "undefined" || typeof navigator.clipboard?.write !== "function") {
    throw new Error("The clipboard image API is not available in this browser");
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Failed to encode the PNG");
  let out = blob;
  if (metadata && Object.keys(metadata).length > 0) {
    const stamped = injectPngText(new Uint8Array(await blob.arrayBuffer()), metadata);
    out = new Blob([new Uint8Array(stamped)], { type: "image/png" });
  }
  await navigator.clipboard.write([new ClipboardItem({ "image/png": out })]);
}
