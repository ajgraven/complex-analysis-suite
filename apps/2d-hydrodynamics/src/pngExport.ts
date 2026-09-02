// Composite the two transplant panes into one PNG whose tEXt carries this view's permalink — a figure
// that carries its own recipe (@cas/export). Shared by the airfoil and gallery pages (HD-3).
import { injectPngText } from "@cas/export";

/**
 * Composite `sources` left-to-right into a single PNG and download it, stamping the permalink `url` into
 * the file's `tEXt` metadata (`2dh:url`). Call right AFTER painting so the source drawing buffers are
 * current — WebGL canvases are read in the same synchronous task, before the browser clears them.
 */
export function saveCompositePng(sources: readonly HTMLCanvasElement[], filename: string, url: string): void {
  const usable = sources.filter((c) => c.width > 3 && c.height > 3);
  if (usable.length === 0) return;
  const gap = 2;
  const h = Math.max(...usable.map((c) => c.height));
  const w = usable.reduce((sum, c) => sum + c.width, 0) + gap * (usable.length - 1);
  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const ctx = off.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#0f1115"; // the pane background, behind the 2px gutter
  ctx.fillRect(0, 0, w, h);
  let x = 0;
  for (const c of usable) {
    ctx.drawImage(c, x, 0);
    x += c.width + gap;
  }
  off.toBlob((blob) => {
    if (!blob) return;
    void blob.arrayBuffer().then((buf) => {
      const stamped = injectPngText(new Uint8Array(buf), {
        Software: "2D Hydrodynamics — Complex Analysis Suite",
        "2dh:url": url,
      });
      const ab = new ArrayBuffer(stamped.byteLength);
      new Uint8Array(ab).set(stamped);
      const dl = URL.createObjectURL(new Blob([ab], { type: "image/png" }));
      const a = document.createElement("a");
      a.href = dl;
      a.download = filename;
      document.body.append(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(dl), 1000);
    });
  }, "image/png");
}
