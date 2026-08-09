// Complex Function Plotting Tool — Phase 1, Milestone 1A: a live 2D domain-coloring plotter.
//
// Type a function f(z); it is parsed and compiled by @cas/expr (to GLSL for the render and, later, to
// JS for the instruments), typeset live with KaTeX (toLatex), and drawn by the layered coloring engine
// with pan / zoom-to-cursor / progressive rendering. Navigation polish, legends, the cursor probe,
// presets, and share-links follow in Milestone 1B.
import "katex/dist/katex.min.css";
import katex from "katex";
import { parse } from "@cas/expr/parser";
import { toLatex } from "@cas/expr/latex";
import { ExprError } from "@cas/expr/ast";
import { Plot } from "./render/plot.js";
import { COLORMAPS } from "./render/colormaps.js";

function main(): void {
  const canvas = document.getElementById("view");
  const exprInput = document.getElementById("expr");
  const previewEl = document.getElementById("preview");
  const errorEl = document.getElementById("error");
  const colormapSel = document.getElementById("colormap");
  const modulusSel = document.getElementById("modulus");
  const homeBtn = document.getElementById("home");
  if (!(canvas instanceof HTMLCanvasElement)) return;

  const setError = (msg: string): void => {
    if (errorEl) {
      errorEl.textContent = msg;
      errorEl.style.visibility = msg ? "visible" : "hidden";
    }
  };

  let plot: Plot;
  try {
    plot = new Plot(canvas, "z^2");
  } catch (err) {
    setError(err instanceof Error ? err.message : String(err));
    return;
  }
  const home = { ...plot.view };

  const renderPreview = (src: string): void => {
    if (!(previewEl instanceof HTMLElement)) return;
    try {
      katex.render(`w = ${toLatex(parse(src))}`, previewEl, {
        throwOnError: false,
        displayMode: false,
      });
    } catch {
      previewEl.textContent = "";
    }
  };

  const applyExpr = (src: string): void => {
    try {
      plot.setFunction(src);
      setError("");
      renderPreview(src);
      plot.draw(false);
    } catch (err) {
      if (err instanceof ExprError) {
        setError(err.pos >= 0 ? `${err.message} (position ${err.pos})` : err.message);
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    }
  };

  if (colormapSel instanceof HTMLSelectElement) {
    COLORMAPS.forEach((cm, i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = cm.label;
      colormapSel.appendChild(opt);
    });
    colormapSel.value = String(plot.color.colormap);
    colormapSel.addEventListener("change", () => {
      plot.color.colormap = Number(colormapSel.value);
      plot.draw(false);
    });
  }

  if (modulusSel instanceof HTMLSelectElement) {
    modulusSel.value = String(plot.color.modulus);
    modulusSel.addEventListener("change", () => {
      plot.color.modulus = Number(modulusSel.value);
      plot.draw(false);
    });
  }

  if (exprInput instanceof HTMLTextAreaElement || exprInput instanceof HTMLInputElement) {
    exprInput.value = "z^2";
    exprInput.addEventListener("input", () => applyExpr(exprInput.value));
  }
  renderPreview("z^2");

  if (homeBtn instanceof HTMLElement) {
    homeBtn.addEventListener("click", () => {
      plot.view = { ...home };
      plot.draw(false);
    });
  }

  // Pan (grab-and-drag) + zoom-to-cursor, with a fast half-res pass while dragging.
  let grabWorld: [number, number] | null = null;
  canvas.addEventListener("pointerdown", (e) => {
    grabWorld = plot.screenToWorld(e.clientX, e.clientY);
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!grabWorld) return;
    plot.setCenterAtScreen(e.clientX, e.clientY, grabWorld);
    plot.draw(true);
  });
  const endPan = (): void => {
    if (grabWorld) {
      grabWorld = null;
      plot.draw(false);
    }
  };
  canvas.addEventListener("pointerup", endPan);
  canvas.addEventListener("pointercancel", endPan);
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      plot.zoomAt(e.clientX, e.clientY, Math.pow(1.0015, e.deltaY));
      plot.draw(false);
    },
    { passive: false },
  );

  const observer = new ResizeObserver(() => plot.draw(false));
  observer.observe(canvas);
  plot.draw(false);
}

main();
