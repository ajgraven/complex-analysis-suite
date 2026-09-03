// Composite the two transplant panes into one PNG whose tEXt carries this view's permalink — a figure
// that carries its own recipe (@cas/export). Each pane is a STACK of layers (the WebGL field canvas + the
// 2D overlay of obstacle outline + stagnation markers, HD-6.3); the layers are flattened per pane, then
// the panes are placed left-to-right.
import { injectPngText } from "@cas/export";

/**
 * Flatten each pane's layer stack, composite the panes left-to-right into one PNG, and download it,
 * stamping the permalink `url` into the file's `tEXt` metadata (`2dh:url`). Call right AFTER painting so
 * the WebGL drawing buffers are current — they are read in the same synchronous task, before the browser
 * clears them (the panes' GL contexts use `preserveDrawingBuffer`).
 */
export function saveCompositePng(
  panes: readonly (readonly HTMLCanvasElement[])[],
  filename: string,
  url: string,
): void {
  // Each pane's size is its first (field) layer; skip panes whose field canvas is not yet laid out.
  const usable = panes.filter((layers) => layers.length > 0 && layers[0].width > 3 && layers[0].height > 3);
  if (usable.length === 0) return;
  const gap = 2;
  const h = Math.max(...usable.map((layers) => layers[0].height));
  const w = usable.reduce((sum, layers) => sum + layers[0].width, 0) + gap * (usable.length - 1);
  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const ctx = off.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#0f1115"; // the pane background, behind the 2px gutter
  ctx.fillRect(0, 0, w, h);
  let x = 0;
  for (const layers of usable) {
    for (const layer of layers) ctx.drawImage(layer, x, 0); // field, then overlay on top
    x += layers[0].width + gap;
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
