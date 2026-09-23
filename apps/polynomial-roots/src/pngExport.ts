// Save the stage as a PNG whose metadata carries the permalink that produced it.
//
// The keys are `Software` and `cas:state`, which is what `@cas/export`'s README and tests document and
// what Complex Dynamics, Riemann Map and Contour Integration write. Three of the suite's apps invented
// private keys instead (`ap:url`, `2de:url`, `2dh:url`, `cdjs:state`); this one writes the documented
// pair so a single reader can open any figure in the suite.
//
// The GL context is created with `preserveDrawingBuffer`, so the canvas can be read after the browser
// has composited. Everything the caption claims is read BEFORE the first `await`: a recompute landing
// between the capture and the encode would otherwise stamp a permalink that does not describe the
// picture in the file.
import { injectPngText } from "@cas/export";

/** Save the stage, stamping `url` into the file's metadata. */
export function savePng(canvas: HTMLCanvasElement, filename: string, url: string, caption: string): void {
  if (canvas.width < 4 || canvas.height < 4) return;
  const plate = document.createElement("canvas");
  const pad = 34;
  plate.width = canvas.width;
  plate.height = canvas.height + pad;
  const ctx = plate.getContext("2d");
  if (ctx === null) return;
  ctx.fillStyle = "#07080c";
  ctx.fillRect(0, 0, plate.width, plate.height);
  ctx.drawImage(canvas, 0, 0);
  ctx.fillStyle = "#9aa3b2";
  ctx.font = "14px ui-sans-serif, system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText(caption, 12, canvas.height + pad / 2);

  plate.toBlob((blob) => {
    if (blob === null) return;
    void blob.arrayBuffer().then((buf) => {
      const stamped = injectPngText(new Uint8Array(buf), {
        Software: "Polynomial Roots — Complex Analysis Suite",
        "cas:state": url,
      });
      const ab = new ArrayBuffer(stamped.byteLength);
      new Uint8Array(ab).set(stamped);
      const href = URL.createObjectURL(new Blob([ab], { type: "image/png" }));
      const a = document.createElement("a");
      a.href = href;
      a.download = filename;
      document.body.append(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 1000);
    });
  }, "image/png");
}

/** The caption stamped under the plate — what the picture is, in one line. */
export function captionFor(opts: {
  alphabet: string;
  minDegree: number;
  maxDegree: number;
  roots: number;
  complete: boolean;
}): string {
  const degrees =
    opts.minDegree === opts.maxDegree ? `degree ${opts.minDegree}` : `degrees ${opts.minDegree}–${opts.maxDegree}`;
  const count = opts.roots > 0 ? `${Math.round(opts.roots).toLocaleString("en-US")} roots` : "no roots yet";
  // "≈" throughout: a finite degree, numerically solved. The honest-labelling guardrail applies to a
  // shareable image more than to anything on screen, because the image outlives the page that made it.
  const partial = opts.complete ? "" : " (partial sweep)";
  return `≈ ${count} · ${opts.alphabet} · ${degrees}${partial} · Complex Analysis Suite`;
}
