// render/tooltip.ts — accessible hover/focus tooltips for the control surface.
//
// One small reusable helper covers every button and input. It follows the WAI-ARIA APG "tooltip"
// pattern: a single floating `role="tooltip"` element, revealed on BOTH mouse hover and keyboard focus,
// dismissible with Esc, and linked to its trigger via `aria-describedby` while shown so screen readers
// announce the description. Styling reuses the app's design tokens (see `.control-tip` in
// styles/main.css — a sibling of the `.root-tip` marker tooltip); no new colour, so the CI palette gate
// is untouched. Only hover/focus are bound — never click/touch — so a tap still fires the control's own
// action, and touch (which has no hover) keeps relying on the first-run coach + `?` help.
//
// The copy (CONTROL_TIPS) is plain data so it can be unit-tested (test/tips.test.ts); the DOM wiring is
// verified in the browser.

/** Every tooltip-bearing control, keyed. `move`/`draw`/`isolate` also match the ContourMode ids. */
export type TipKey =
  | "move"
  | "draw"
  | "isolate"
  | "clear"
  | "fit"
  | "reset"
  | "png"
  | "help"
  | "simple"
  | "explore"
  | "theme"
  | "play"
  | "stop"
  | "preset"
  | "expr"
  | "radius"
  | "res"
  | "speed"
  | "chkDomain"
  | "chkImage"
  | "chkVectors";

/** One-line explanations, condensed from the help panel so the wording matches the full guide. */
export const CONTROL_TIPS: Record<TipKey, string> = {
  move: "Place the circular contour (tap) and pan the plane (drag).",
  draw: "Sketch a freehand contour γ by dragging on the z-plane.",
  isolate: "Tap a root to pin a small circle around it — winding = its order.",
  clear: "Discard the drawn or pinned contour and return to the circular γ.",
  fit: "Rescale the image (w) plane so all of f(γ) fits in view.",
  reset: "Restore both planes to the default centre, zoom, and contour.",
  png: "Download this view as a PNG with its permalink embedded.",
  help: "Open the full guide to the argument principle and this tool.",
  simple: "Simple view — hide the advanced ∮ and root-vector layer.",
  explore: "Explore view — show every panel and analytic control.",
  theme: "Cycle the colour theme: auto → dark → light.",
  play: "Animate a point around γ; watch arg f(γ) accumulate below.",
  stop: "Stop the traversal and clear its trace, wedge, and vectors.",
  preset: "Load a ready-made f(z) example.",
  expr: "Type your own f(z): z, i, pi, sin, cos, exp, log, sqrt, ^ and more.",
  radius: "Radius of the circular contour γ.",
  res: "Samples along γ — higher is smoother but slower.",
  speed: "Traversal animation speed.",
  chkDomain: "Show or hide the contour γ in the z-plane.",
  chkImage: "Show or hide the image curve f(γ) in the w-plane.",
  chkVectors: "Draw factor vectors (z − root) from each enclosed zero or pole.",
};

export interface Tooltip {
  /** Wire a control so its tip shows on hover/focus. `el` may be the focusable control or a wrapping
   *  `<label>` (focusin/focusout bubble up from the inner input, so a label target works either way). */
  attach(el: HTMLElement, key: TipKey): void;
}

const HOVER_DELAY_MS = 350; // pointer dwell before a hover tip appears (focus shows immediately)

/** Build the shared tooltip. Call once per app; append happens on `document.body`. */
export function createTooltip(): Tooltip {
  const tip = document.createElement("div");
  tip.className = "control-tip";
  tip.id = "control-tip";
  tip.setAttribute("role", "tooltip");
  tip.hidden = true;
  document.body.append(tip);

  let current: HTMLElement | null = null;
  let hoverTimer = 0;

  const place = (el: HTMLElement): void => {
    tip.hidden = false; // must be laid out to measure
    const r = el.getBoundingClientRect();
    const gap = 8;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    // Below the control by default; flip above when it would spill past the bottom edge.
    let top = r.bottom + gap;
    if (top + th > vh && r.top - gap - th >= 0) top = r.top - gap - th;
    // Centre on the control, clamped horizontally into the viewport.
    const left = Math.max(gap, Math.min(r.left + r.width / 2 - tw / 2, vw - tw - gap));
    tip.style.top = `${Math.round(top)}px`;
    tip.style.left = `${Math.round(left)}px`;
  };

  const show = (el: HTMLElement, key: TipKey): void => {
    current = el;
    tip.textContent = CONTROL_TIPS[key];
    place(el); // unhides + positions (so the aria-describedby target is visible when SR reads it)
    el.setAttribute("aria-describedby", "control-tip");
  };

  const hide = (): void => {
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = 0;
    }
    if (current) {
      current.removeAttribute("aria-describedby");
      current = null;
    }
    tip.hidden = true;
  };

  // Global dismissers: Esc, and any scroll (a fixed tip would otherwise drift off its control).
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hide();
  });
  window.addEventListener("scroll", hide, true);

  const attach = (el: HTMLElement, key: TipKey): void => {
    el.addEventListener("mouseenter", () => {
      if (hoverTimer) clearTimeout(hoverTimer);
      hoverTimer = window.setTimeout(() => show(el, key), HOVER_DELAY_MS);
    });
    el.addEventListener("mouseleave", hide);
    el.addEventListener("focusin", () => show(el, key)); // keyboard focus — immediate, no dwell
    el.addEventListener("focusout", hide);
  };

  return { attach };
}
