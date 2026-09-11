import { parse, type Node } from "@cas/expr";
import { assembleVerdict, describeLevel, mayReportValue } from "@cas/rigor";
import {
  DEFAULT_VIEW,
  panBy,
  plotToScreen,
  zoomAt,
  type View,
  type Viewport,
} from "../kernel/camera.js";
import { findPoles, type PoleReport } from "../kernel/poles.js";
import { GLStage } from "../ui/stage/glStage.js";

/**
 * Milestone 0's shell: an integrand, its phase portrait, and its poles.
 *
 * This is the M0 gate and nothing more. There is no contour, no accumulator and no ledger — those
 * are M1 and M3. What it does establish is the spine every later milestone hangs on: one AST driving
 * both the GPU and the CPU, a camera, and a pole report that already carries its own rigor verdict
 * rather than printing bare numbers.
 */

const PRESETS: { label: string; src: string }[] = [
  { label: "1/z", src: "1/z" },
  { label: "1/(1+z^2)", src: "1/(1+z^2)" },
  { label: "1/(1+z^4)", src: "1/(1+z^4)" },
  { label: "1/(1+z^2)^2", src: "1/(1+z^2)^2" },
  { label: "(3+4i)/(z^3-1)", src: "(3+4i)/(z^3-1)" },
  { label: "z/(z^2+2z+2)", src: "z/(z^2+2z+2)" },
];

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const fmt = (x: number): string => {
  if (Object.is(x, -0)) return "0";
  const a = Math.abs(x);
  if (a !== 0 && (a < 1e-4 || a >= 1e6)) return x.toExponential(3);
  return String(Math.round(x * 1e6) / 1e6);
};

const fmtCx = ([re, im]: readonly [number, number]): string =>
  `${fmt(re)} ${im < 0 ? "−" : "+"} ${fmt(Math.abs(im))}i`;

export function mountApp(root: Element): void {
  let view: View = DEFAULT_VIEW;
  let ast: Node | null = null;
  let report: PoleReport | null = null;

  // --- layout -------------------------------------------------------------------------------
  const shell = el("div", "shell");
  const bar = el("header", "bar");
  const stageWrap = el("div", "stage");
  const canvas = el("canvas", "gl");
  const overlay = el("div", "overlay");
  const rail = el("aside", "rail");
  stageWrap.append(canvas, overlay);
  shell.append(bar, stageWrap, rail);
  root.replaceChildren(shell);

  const title = el("span", "brand", "Contour Integration");
  const input = el("input", "expr");
  input.type = "text";
  input.spellcheck = false;
  input.setAttribute("aria-label", "integrand f(z)");
  input.value = "1/(1+z^2)";
  const fLabel = el("span", "flabel", "f(z) =");
  const presetWrap = el("span", "presets");
  for (const p of PRESETS) {
    const b = el("button", "preset", p.label);
    b.type = "button";
    b.addEventListener("click", () => {
      input.value = p.src;
      applyExpression();
    });
    presetWrap.append(b);
  }
  bar.append(title, fLabel, input, presetWrap);

  const errorBox = el("div", "error");
  errorBox.hidden = true;
  const poleBox = el("section", "card");
  rail.append(errorBox, poleBox);

  // --- rendering ----------------------------------------------------------------------------
  let stage: GLStage | null = null;
  try {
    stage = new GLStage(canvas);
  } catch (e) {
    errorBox.hidden = false;
    errorBox.textContent = e instanceof Error ? e.message : String(e);
  }

  const viewport = (): Viewport => ({
    width: stageWrap.clientWidth || 1,
    height: stageWrap.clientHeight || 1,
  });

  let frame = 0;
  const requestDraw = (): void => {
    if (frame !== 0) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      stage?.render(view, viewport());
      drawOverlay();
    });
  };

  function drawOverlay(): void {
    overlay.replaceChildren();
    if (!report) return;
    const vp = viewport();
    for (const pole of report.poles) {
      const [sx, sy] = plotToScreen(pole.at[0], pole.at[1], view, vp);
      if (sx < -40 || sy < -40 || sx > vp.width + 40 || sy > vp.height + 40) continue;
      const mark = el("div", pole.possiblyRemovable ? "pole uncertain" : "pole");
      mark.style.left = `${sx}px`;
      mark.style.top = `${sy}px`;
      const caption = pole.order > 1 ? `order ${pole.order}${pole.orderCertain ? "" : "?"}` : "";
      if (caption) mark.append(el("span", "poleOrder", caption));
      overlay.append(mark);
    }
  }

  // --- expression ---------------------------------------------------------------------------
  function applyExpression(): void {
    const src = input.value.trim();
    try {
      ast = parse(src);
      stage?.setIntegrand(ast);
      errorBox.hidden = true;
      errorBox.textContent = "";
    } catch (e) {
      // Show it. A stale portrait under a new caption is the failure mode to avoid.
      ast = null;
      report = null;
      errorBox.hidden = false;
      errorBox.textContent = e instanceof Error ? e.message : String(e);
      renderPoles();
      requestDraw();
      return;
    }
    report = findPoles(ast);
    renderPoles();
    requestDraw();
  }

  function renderPoles(): void {
    poleBox.replaceChildren();
    poleBox.append(el("h2", undefined, "Poles"));

    if (!report) {
      poleBox.append(el("p", "muted", "No integrand."));
      return;
    }

    const verdict = assembleVerdict(report.certificates);
    const head = el("p", "verdict");
    head.append(
      el("span", `badge lv-${verdict.level === "≈" ? "approx" : "other"}`, verdict.level),
      ` ${describeLevel(verdict.level)}`,
    );
    poleBox.append(head);

    if (!report.rational) {
      poleBox.append(
        el(
          "p",
          "muted",
          "f is not a rational function of z, so no poles are claimed. The numeric pole search (AAA) arrives in M2.",
        ),
      );
    } else if (report.poles.length === 0) {
      poleBox.append(el("p", "muted", "No poles."));
    } else {
      const list = el("ul", "poles");
      for (const pole of report.poles) {
        const li = el("li");
        li.append(el("span", "num", fmtCx(pole.at)));
        if (pole.order > 1) li.append(el("span", "tag", `order ${pole.order}`));
        if (!pole.orderCertain) li.append(el("span", "tag warn", "order uncertain"));
        if (pole.possiblyRemovable) li.append(el("span", "tag warn", "may be removable"));
        list.append(li);
      }
      poleBox.append(list);
    }

    for (const c of report.certificates) {
      const note = el("p", "cert");
      note.append(el("span", "badge small", c.level), ` ${c.claim} — ${c.method}`);
      poleBox.append(note);
    }
    if (!mayReportValue(verdict)) {
      poleBox.append(el("p", "muted", "Refused: no value is being reported."));
    }
  }

  // --- interaction --------------------------------------------------------------------------
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  stageWrap.addEventListener("pointerdown", (ev) => {
    dragging = true;
    lastX = ev.clientX;
    lastY = ev.clientY;
    stageWrap.setPointerCapture(ev.pointerId);
  });
  stageWrap.addEventListener("pointermove", (ev) => {
    if (!dragging) return;
    view = panBy(view, ev.clientX - lastX, ev.clientY - lastY, viewport());
    lastX = ev.clientX;
    lastY = ev.clientY;
    requestDraw();
  });
  const endDrag = (ev: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    stageWrap.releasePointerCapture(ev.pointerId);
  };
  stageWrap.addEventListener("pointerup", endDrag);
  stageWrap.addEventListener("pointercancel", endDrag);

  stageWrap.addEventListener(
    "wheel",
    (ev) => {
      ev.preventDefault();
      const rect = stageWrap.getBoundingClientRect();
      const factor = Math.exp(-ev.deltaY * 0.0015);
      view = zoomAt(view, factor, ev.clientX - rect.left, ev.clientY - rect.top, viewport());
      requestDraw();
    },
    { passive: false },
  );

  input.addEventListener("change", applyExpression);
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") applyExpression();
  });
  window.addEventListener("resize", requestDraw);

  applyExpression();
}
