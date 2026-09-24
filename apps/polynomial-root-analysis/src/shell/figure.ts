// The figure: the panes as drawn, side by side, stamped with the permalink and the headline verdict —
// in the PNG's text chunks (`Software`, `cas:state` — the documented @cas/export keys — and
// `cas:verdict`) AND in a caption under the picture, because nobody reads metadata and a picture of
// roots looks the same whether the discs were certified or not.
import { injectPngText } from "@cas/export";
import { APP_NAME } from "../engine/vocabulary.js";
import type { Resolution } from "./state.js";

interface FigurePane {
  readonly gl: HTMLCanvasElement | null;
  readonly ink: HTMLCanvasElement;
}

/** The headline verdict, as one line — the same sentence the Roots card leads with. */
export function verdictLine(res: Resolution): string {
  const p = res.poly;
  if (!p) return `No polynomial: ${res.refusal ?? "nothing to analyse"}.`;
  if (!res.discs?.ok)
    return `Degree ${p.degree}; no discs certified (${res.discs?.reason ?? "not computed"}).`;
  const k = res.discs.components;
  return k === p.degree
    ? `= degree ${p.degree}: every root in its own disc, each holding exactly one root (proved in exact arithmetic); coordinates ≈.`
    : `= degree ${p.degree}: ${k} separate groups of discs, each holding exactly as many roots as discs (proved in exact arithmetic); coordinates ≈.`;
}

export async function figureBytes(
  doc: Document,
  panes: readonly FigurePane[],
  res: Resolution,
  link: string,
): Promise<Uint8Array | null> {
  const caption = verdictLine(res);
  const w = panes.reduce((acc, p) => acc + p.ink.width, 0) + 16 * (panes.length + 1);
  const out = doc.createElement("canvas");
  const probe = out.getContext("2d");
  if (!probe) return null;
  probe.font = "13px ui-sans-serif, system-ui, sans-serif";
  const lines = wrap(probe, caption, w - 32);
  const h = Math.max(...panes.map((p) => p.ink.height)) + 16 * 2 + 18 * lines.length + 6;
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#0b0d12";
  ctx.fillRect(0, 0, w, h);
  let x = 16;
  for (const p of panes) {
    if (p.gl) ctx.drawImage(p.gl, x, 16, p.ink.width, p.ink.height);
    ctx.drawImage(p.ink, x, 16);
    x += p.ink.width + 16;
  }
  ctx.fillStyle = "#e6e9f0";
  ctx.font = "13px ui-sans-serif, system-ui, sans-serif";
  const top = Math.max(...panes.map((p) => p.ink.height)) + 16 + 22;
  lines.forEach((line, i) => ctx.fillText(line, 16, top + 18 * i));
  const blob: Blob | null = await new Promise((resolve) =>
    out.toBlob(resolve, "image/png"),
  );
  if (!blob) return null;
  const png = new Uint8Array(await blob.arrayBuffer());
  return injectPngText(png, {
    Software: `${APP_NAME} — Complex Analysis Suite`,
    "cas:state": link,
    "cas:verdict": caption,
  });
}

/** Greedy word wrap to `width` pixels — the caption is a sentence and must not be cut off. */
export function wrap(
  ctx: { measureText(t: string): { width: number } },
  text: string,
  width: number,
): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}
