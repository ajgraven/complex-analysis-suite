import { makeComplexFn, parse, type Node } from "@cas/expr";
import { assembleVerdict, describeLevel, mayReportValue } from "@cas/rigor";
import {
  DEFAULT_VIEW,
  panBy,
  plotToScreen,
  zoomAt,
  type View,
  type Viewport,
} from "../kernel/camera.js";
import type { Cx, Resolved } from "../kernel/geom.js";
import { findPoles, type PoleReport } from "../kernel/poles.js";
import { accumulateForIntegral, type Accumulation } from "../engine/contour/accumulate.js";
import { integrateContour, type ContourIntegral } from "../engine/contour/integrate.js";
import { applyResidueTheorem, type ResidueTheoremResult } from "../engine/residueTheorem.js";
import { evaluateLedger, ledgerHeadline, type LedgerResult } from "../engine/ledger.js";
import { resolveAll, type Contour } from "../engine/contour/model.js";
import {
  circleTemplate,
  rectangleTemplate,
  semicircleTemplate,
} from "../engine/contour/templates.js";
import { GLStage } from "../ui/stage/glStage.js";
import { drawContour, PIECE_COLOURS } from "../ui/stage/ink.js";
import { CONTRAST_LABELS, drawAccumulator, type ContrastMode } from "../ui/accumulator.js";

/**
 * Milestone 1's shell: an integrand, a contour, and the integral accumulating along it.
 *
 * The one thing to notice in the wiring is the order in `recompute`: the integral is asked for, and
 * if it comes back refused **no value is shown at all**. The result card has no "invalid" styling
 * for a number, because there is never a number to style.
 */

const PRESETS: { label: string; src: string }[] = [
  { label: "1/z", src: "1/z" },
  { label: "1/(1+z^2)", src: "1/(1+z^2)" },
  { label: "1/(1+z^4)", src: "1/(1+z^4)" },
  { label: "1/(z-1)^2", src: "1/(z-1)^2" },
  { label: "(3+4i)/(z^3-1)", src: "(3+4i)/(z^3-1)" },
  { label: "z/(z^2+2z+2)", src: "z/(z^2+2z+2)" },
  { label: "exp(i*z)/(1+z^2)", src: "exp(i*z)/(1+z^2)" },
];

type TemplateId = "circle" | "semicircle" | "semicircleDown" | "rectangle";

const TEMPLATES: { id: TemplateId; label: string; build: () => Contour }[] = [
  { id: "circle", label: "circle", build: () => circleTemplate([0, 0], 1.5) },
  { id: "semicircle", label: "semicircle ↑", build: () => semicircleTemplate(3, "upper") },
  { id: "semicircleDown", label: "semicircle ↓", build: () => semicircleTemplate(3, "lower") },
  { id: "rectangle", label: "rectangle", build: () => rectangleTemplate(-1.6, -1.2, 1.6, 1.2) },
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
  if (a !== 0 && (a < 1e-4 || a >= 1e6)) return x.toExponential(4);
  return String(Math.round(x * 1e8) / 1e8);
};
const fmtCx = ([re, im]: Cx): string => `${fmt(re)} ${im < 0 ? "−" : "+"} ${fmt(Math.abs(im))}i`;

export function mountApp(root: Element): void {
  let view: View = DEFAULT_VIEW;
  let ast: Node | null = null;
  let f: ((z: Cx) => Cx) | null = null;
  let poles: PoleReport | null = null;
  let contour: Contour = TEMPLATES[0].build();
  let resolved: Resolved[] = resolveAll(contour);
  let integral: ContourIntegral | null = null;
  let theorem: ResidueTheoremResult | null = null;
  let ledger: LedgerResult | null = null;
  let acc: Accumulation | null = null;
  let scrub = 1;
  let contrast: ContrastMode = "none";
  let highlight = -1;

  // --- layout -------------------------------------------------------------------------------
  const shell = el("div", "shell");
  const bar = el("header", "bar");
  const stageWrap = el("div", "stage");
  const glCanvas = el("canvas", "gl");
  const inkCanvas = el("canvas", "ink");
  const overlay = el("div", "overlay");
  const rail = el("aside", "rail");
  const strip = el("footer", "strip");
  stageWrap.append(glCanvas, inkCanvas, overlay);
  shell.append(bar, stageWrap, rail, strip);
  root.replaceChildren(shell);

  // Bar: the integrand.
  const input = el("input", "expr");
  input.type = "text";
  input.spellcheck = false;
  input.setAttribute("aria-label", "integrand f(z)");
  input.value = "1/z";
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
  bar.append(el("span", "brand", "Contour Integration"), el("span", "flabel", "f(z) ="), input, presetWrap);

  // Rail cards.
  const errorBox = el("div", "error");
  errorBox.hidden = true;
  const ledgerCard = el("section", "card");
  const resultCard = el("section", "card");
  const contourCard = el("section", "card");
  const poleCard = el("section", "card");
  rail.append(errorBox, ledgerCard, resultCard, contourCard, poleCard);

  // Strip: the accumulator.
  // The canvas needs a containing block with a definite size of its own. A `height: 100%` canvas
  // whose grid track is content-sized feeds back on itself: each resize measures the canvas, grows
  // the track, and re-measures — it reached 173,922 px tall before this wrapper was added.
  const accWrap = el("div", "accWrap");
  const accCanvas = el("canvas", "accCanvas");
  accWrap.append(accCanvas);
  const accSide = el("div", "accSide");
  strip.append(accWrap, accSide);

  const accTitle = el("h2", undefined, "Partial sum Σ f(zₖ)·Δzₖ");
  const accValue = el("p", "num accValue", "—");
  const scrubber = el("input", "scrub");
  scrubber.type = "range";
  scrubber.min = "0";
  scrubber.max = "1000";
  scrubber.value = "1000";
  scrubber.setAttribute("aria-label", "position along the contour");
  const contrastWrap = el("div", "contrasts");
  accSide.append(accTitle, accValue, scrubber, contrastWrap);

  const contrastLabel = el("span", "muted small", "compare with:");
  contrastWrap.append(contrastLabel);
  for (const mode of ["none", "sumZ", "sumFz", "sumDz"] as ContrastMode[]) {
    const b = el("button", "preset", CONTRAST_LABELS[mode]);
    b.type = "button";
    b.dataset.mode = mode;
    b.addEventListener("click", () => {
      contrast = mode;
      for (const other of contrastWrap.querySelectorAll("button")) {
        other.classList.toggle("on", other.dataset.mode === mode);
      }
      drawAcc();
    });
    if (mode === "none") b.classList.add("on");
    contrastWrap.append(b);
  }

  // --- rendering ----------------------------------------------------------------------------
  let stage: GLStage | null = null;
  try {
    stage = new GLStage(glCanvas);
  } catch (e) {
    errorBox.hidden = false;
    errorBox.textContent = e instanceof Error ? e.message : String(e);
  }

  const viewport = (): Viewport => ({
    width: stageWrap.clientWidth || 1,
    height: stageWrap.clientHeight || 1,
  });

  function sizeCanvas(canvas: HTMLCanvasElement, w: number, h: number): CanvasRenderingContext2D | null {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pw = Math.max(1, Math.round(w * dpr));
    const ph = Math.max(1, Math.round(h * dpr));
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  let frame = 0;
  const requestDraw = (): void => {
    if (frame !== 0) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const vp = viewport();
      stage?.render(view, vp);
      const ctx = sizeCanvas(inkCanvas, vp.width, vp.height);
      if (ctx) {
        drawContour(ctx, resolved, view, vp, {
          colours: contour.pieces.map((p) => p.colour),
          highlight,
          marker: acc && acc.steps.length > 0 ? scrub : undefined,
          refused: integral?.refusal !== undefined,
        });
      }
      drawPoleMarkers();
    });
  };

  function drawPoleMarkers(): void {
    overlay.replaceChildren();
    if (!poles) return;
    const vp = viewport();
    for (const pole of poles.poles) {
      const [sx, sy] = plotToScreen(pole.at[0], pole.at[1], view, vp);
      if (sx < -40 || sy < -40 || sx > vp.width + 40 || sy > vp.height + 40) continue;
      const mark = el("div", pole.possiblyRemovable ? "pole uncertain" : "pole");
      mark.style.left = `${sx}px`;
      mark.style.top = `${sy}px`;
      if (pole.order > 1) mark.append(el("span", "poleOrder", `order ${pole.order}`));
      overlay.append(mark);
    }
  }

  function drawAcc(): void {
    const w = accWrap.clientWidth || 1;
    const h = accWrap.clientHeight || 1;
    const ctx = sizeCanvas(accCanvas, w, h);
    if (!ctx) return;
    if (!acc) {
      ctx.clearRect(0, 0, w, h);
      accValue.textContent = integral?.refusal === undefined ? "—" : "refused";
      return;
    }
    drawAccumulator(ctx, acc, w, h, {
      upTo: scrub,
      contrast,
      pieceColours: contour.pieces.map((p) => p.colour),
    });
    const count = Math.max(1, Math.round(scrub * acc.steps.length));
    const at = acc.steps[count - 1];
    accValue.textContent = at ? fmtCx(at.running) : "—";
  }

  // --- computation --------------------------------------------------------------------------
  function recompute(): void {
    resolved = resolveAll(contour);
    if (!f) {
      integral = null;
      theorem = null;
      ledger = null;
      acc = null;
    } else {
      const singular = (poles?.poles ?? []).map((p) => ({ at: p.at, order: p.order }));
      integral = integrateContour(f, resolved, singular);
      // Null when the integral was refused — a partial sum through a singularity is meaningless,
      // not merely rough, and showing one beside a refusal hands back the withheld number.
      acc = accumulateForIntegral(f, resolved, integral);
      // The residue theorem is applied from the exact data, then CHECKED against the quadrature.
      // Two routes that share no machinery agreeing is the strongest evidence the app can offer.
      theorem = poles ? applyResidueTheorem(poles, integral) : null;
      ledger =
        ast && poles && theorem
          ? evaluateLedger({ ast, pieces: resolved, spec: contour.pieces, poles, integral, theorem })
          : null;
    }
    renderLedger();
    renderResult();
    renderContourCard();
    drawAcc();
    requestDraw();
  }

  function applyExpression(): void {
    try {
      ast = parse(input.value.trim());
      const fn = makeComplexFn(ast);
      f = (z: Cx) => fn(z as [number, number], [0, 0]) as Cx;
      stage?.setIntegrand(ast);
      errorBox.hidden = true;
    } catch (e) {
      ast = null;
      f = null;
      poles = null;
      errorBox.hidden = false;
      errorBox.textContent = e instanceof Error ? e.message : String(e);
      renderPoles();
      recompute();
      return;
    }
    poles = findPoles(ast);
    renderPoles();
    recompute();
  }

  // --- rail rendering -----------------------------------------------------------------------
  function badge(level: string): HTMLElement {
    return el("span", "badge", level);
  }

  const STATUS_GLYPH: Record<string, string> = {
    satisfied: "✓",
    failed: "✗",
    unknown: "?",
  };

  /**
   * The Closing Ledger. The headline is a SENTENCE, not a number: "does this argument finish" is the
   * question a number cannot answer, and it is the one thing this app offers that nothing else does.
   */
  function renderLedger(): void {
    ledgerCard.replaceChildren(el("h2", undefined, "Does the argument close?"));
    if (!ledger) {
      ledgerCard.append(el("p", "muted", "No integrand."));
      return;
    }

    const head = el("p", ledger.closes ? "headline closes" : "headline open");
    head.textContent = ledgerHeadline(ledger);
    ledgerCard.append(head);

    if (ledger.closes && ledger.value) {
      const v = el("p", "resultValue exactValue");
      v.append(badge("="), ` ${ledger.value.text}`);
      ledgerCard.append(v);
    }

    const list = el("ul", "ledger");
    for (const row of ledger.rows) {
      const li = el("li", `ledgerRow ${row.status}`);
      li.append(
        el("span", "constraint", row.constraint),
        el("span", "glyph", STATUS_GLYPH[row.status] ?? "?"),
        el("span", "ledgerClaim", row.claim),
      );
      if (row.repair !== undefined) li.append(el("span", "repair", row.repair));
      list.append(li);
    }
    ledgerCard.append(list);
  }

  function renderResult(): void {
    resultCard.replaceChildren(el("h2", undefined, "∮ f(z) dz"));
    if (!integral) {
      resultCard.append(el("p", "muted", "No integrand."));
      return;
    }

    if (integral.refusal !== undefined || !mayReportValue(integral.verdict)) {
      // No number. Not a greyed-out number, not a number with a warning beside it — none.
      const row = el("p", "refusal");
      row.append(badge("⚠"), " Refused");
      resultCard.append(row, el("p", "muted", integral.refusal ?? "the result was refused"));
      const repair = integral.verdict.certificates
        .flatMap((c) => c.provenance)
        .find((s) => s.text.startsWith("suggested repair"));
      if (repair) resultCard.append(el("p", "repair", repair.text));
      return;
    }

    // The exact value, when the residue theorem could supply one, is the headline — it comes from a
    // formula rather than from integrating, and the quadrature below it is the corroboration.
    if (theorem?.exactValue) {
      const head = el("p", "resultValue exactValue");
      head.append(badge("="), ` ${theorem.exactValue.text}`);
      resultCard.append(head);
      const field =
        poles?.radicand === null || poles?.radicand === undefined
          ? "ℚ(i)"
          : `ℚ(i)(√${poles.radicand})`;
      resultCard.append(
        el("p", "muted small", `2πi Σ n(γ,aₖ)·Res(f,aₖ), from exact residues over ${field}`),
      );
      const check = el("p", theorem.agrees === true ? "crosscheck" : "restriction");
      check.append(
        theorem.agrees === true ? badge("≤") : badge("⚠"),
        theorem.agrees === true
          ? ` quadrature agrees to ${(theorem.disagreement ?? 0).toExponential(2)}`
          : ` the quadrature DISAGREES by ${(theorem.disagreement ?? 0).toExponential(2)} — one of them is wrong`,
      );
      resultCard.append(check);
    }

    const value = integral.value ?? [0, 0];
    const head = el("p", theorem?.exactValue ? "num numericValue" : "resultValue num");
    head.append(badge(integral.verdict.level), ` ${fmtCx(value)}`);
    resultCard.append(head);
    if (!theorem?.exactValue) {
      resultCard.append(el("p", "muted small", describeLevel(integral.verdict.level)));
    }

    for (const r of integral.verdict.restrictions) {
      resultCard.append(el("p", "restriction", r));
    }

    if (integral.windings.length > 0) {
      const list = el("ul", "windings");
      for (const w of integral.windings) {
        const li = el("li");
        li.append(
          el("span", "num", `n(γ, ${fmtCx(w.at)})`),
          el("span", w.decided ? "tag" : "tag warn", w.decided ? `= ${w.n}` : "undecided"),
        );
        list.append(li);
      }
      resultCard.append(el("p", "muted small", "Winding numbers (exact):"), list);
    }
    resultCard.append(
      el("p", "muted small", `${integral.closed ? "Closed" : "Not closed"} contour.`),
    );
  }

  function renderContourCard(): void {
    contourCard.replaceChildren(el("h2", undefined, "Contour"));

    const picker = el("div", "presets");
    for (const t of TEMPLATES) {
      const b = el("button", "preset", t.label);
      b.type = "button";
      b.addEventListener("click", () => {
        contour = t.build();
        recompute();
      });
      picker.append(b);
    }
    contourCard.append(picker);

    for (const p of Object.values(contour.params)) {
      const wrap = el("label", "paramRow");
      const slider = el("input", "slider");
      slider.type = "range";
      slider.min = "0";
      slider.max = "1000";
      const [lo, hi] = p.range;
      const toSlider = (v: number): number =>
        p.scale === "log"
          ? (1000 * (Math.log(v) - Math.log(lo))) / (Math.log(hi) - Math.log(lo))
          : (1000 * (v - lo)) / (hi - lo);
      const fromSlider = (s: number): number =>
        p.scale === "log"
          ? Math.exp(Math.log(lo) + (s / 1000) * (Math.log(hi) - Math.log(lo)))
          : lo + (s / 1000) * (hi - lo);
      slider.value = String(Math.round(toSlider(p.value)));
      const readout = el("span", "num", `${p.name} = ${fmt(p.value)}`);
      slider.addEventListener("input", () => {
        const v = fromSlider(Number(slider.value));
        contour = {
          ...contour,
          params: { ...contour.params, [p.name]: { ...p, value: v } },
        };
        readout.textContent = `${p.name} = ${fmt(v)}`;
        recompute();
      });
      wrap.append(readout, slider);
      contourCard.append(wrap);
    }

    const list = el("ul", "pieces");
    contour.pieces.forEach((piece, k) => {
      const li = el("li");
      const swatch = el("span", "chip");
      swatch.style.background = PIECE_COLOURS[piece.colour % PIECE_COLOURS.length];
      const pieceIntegral = integral?.pieces[k];
      li.append(swatch, el("span", "pieceName", piece.name), el("span", "tag", piece.role));
      if (pieceIntegral) {
        const v = el("span", "num pieceValue", fmtCx(pieceIntegral.value));
        li.append(v);
        if (pieceIntegral.capped) li.append(el("span", "tag warn", "resolution capped"));
      }
      li.addEventListener("pointerenter", () => {
        highlight = k;
        requestDraw();
      });
      li.addEventListener("pointerleave", () => {
        highlight = -1;
        requestDraw();
      });
      list.append(li);
    });
    contourCard.append(list);
  }

  function renderPoles(): void {
    poleCard.replaceChildren(el("h2", undefined, "Poles"));
    if (!poles) {
      poleCard.append(el("p", "muted", "No integrand."));
      return;
    }
    const verdict = assembleVerdict(poles.certificates);
    const head = el("p", "verdict");
    head.append(badge(verdict.level), ` ${describeLevel(verdict.level)}`);
    poleCard.append(head);

    if (!poles.rational) {
      poleCard.append(
        el("p", "muted", "f is not a rational function of z, so no poles are claimed."),
      );
      return;
    }
    if (poles.poles.length === 0) {
      poleCard.append(el("p", "muted", "No poles."));
      return;
    }
    const list = el("ul", "poles");
    for (const pole of poles.poles) {
      const li = el("li");
      li.append(el("span", "num", fmtCx(pole.at)));
      if (pole.order > 1) li.append(el("span", "tag", `order ${pole.order}`));
      if (!pole.orderCertain) li.append(el("span", "tag warn", "order uncertain"));
      if (pole.possiblyRemovable) li.append(el("span", "tag warn", "may be removable"));
      if (pole.residue) {
        const res = el("span", "num residueText");
        res.append(badge("="), ` Res = ${pole.residue.text}`);
        li.append(res);
      } else if (pole.isExact === false) {
        li.append(el("span", "tag warn", "≈ located numerically"));
      }
      list.append(li);
    }
    poleCard.append(list);
    if (poles.exactResidueSum) {
      poleCard.append(el("p", "muted small", `Σ Res = ${poles.exactResidueSum.text} (exact, over every pole)`));
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
      view = zoomAt(view, Math.exp(-ev.deltaY * 0.0015), ev.clientX - rect.left, ev.clientY - rect.top, viewport());
      requestDraw();
    },
    { passive: false },
  );

  scrubber.addEventListener("input", () => {
    scrub = Number(scrubber.value) / 1000;
    drawAcc();
    requestDraw();
  });

  input.addEventListener("change", applyExpression);
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") applyExpression();
  });
  window.addEventListener("resize", () => {
    drawAcc();
    requestDraw();
  });

  applyExpression();
}
