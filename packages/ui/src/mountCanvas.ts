// @cas/ui — accessible canvas: mount a fresh one, or attach the a11y layer to an existing canvas.
//
// Ports Complex Dynamics' proven pattern (apps/complex-dynamics/index.html:194-200): a focusable overlay
// canvas (`role="application"`, `tabindex=0`) with a descriptive `aria-label` and a keyboard map (arrows
// pan, +/− zoom, Enter/Space commit), plus a polite `aria-live` status region for `announce()`; an
// `aria-hidden` render canvas sits behind it. Six of seven apps ship a bare <canvas> a screen reader
// cannot see and a keyboard cannot drive (UX audit finding #2).
//
// Two entry points, ONE code path (`applyCanvasA11y`), so mount and attach can never drift:
//   • `mountCanvas`     — builds the render+overlay+live-region DOM (for apps starting fresh).
//   • `attachCanvasA11y`— applies the a11y contract to a canvas the app already built and lays out itself
//     (Faber, Correspondences, … build their own `gl`+`ov` panes; forcing a fresh mount would fight their
//     CSS). Discovered while proving the primitive against Faber (ADR-0028, U2).

/** A keyboard interaction, translated from a key press. The app applies the semantics (how far to pan,
 *  what "commit" means for this tool). */
export type CanvasKeyAction =
  | { readonly kind: "pan"; readonly dx: number; readonly dy: number }
  | { readonly kind: "zoom"; readonly direction: 1 | -1 }
  | { readonly kind: "commit" };

const PAN_STEP = 1;

// Visually hidden, still announced to assistive tech.
function styleVisuallyHidden(el: HTMLElement): void {
  el.style.position = "absolute";
  el.style.width = "1px";
  el.style.height = "1px";
  el.style.overflow = "hidden";
  el.style.clipPath = "inset(50%)";
  el.style.whiteSpace = "nowrap";
}

// The single shared implementation. Sets `role` + label, appends a polite live region to `liveHost`, and
// — for an INTERACTIVE (`role="application"`) surface only — makes it focusable and wires the keyboard map.
// A static visualization (`role="img"`) is named but not focusable and drives no keyboard: giving a
// non-interactive canvas `role="application"` is an a11y anti-pattern (it tells assistive tech the element
// handles keyboard when it does not). Returns announce + a teardown that reverses exactly what it added.
function applyCanvasA11y(
  doc: Document,
  overlay: HTMLCanvasElement,
  liveHost: HTMLElement,
  role: "application" | "img",
  label: string,
  onKey?: (action: CanvasKeyAction, ev: KeyboardEvent) => void,
): { announce: (message: string) => void; teardown: () => void } {
  const interactive = role === "application";
  overlay.setAttribute("role", role);
  overlay.setAttribute("aria-label", label);
  if (interactive) overlay.tabIndex = 0;

  const status = doc.createElement("div");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  styleVisuallyHidden(status);
  liveHost.appendChild(status);

  let onKeyDown: ((ev: KeyboardEvent) => void) | null = null;
  if (interactive) {
    onKeyDown = (ev: KeyboardEvent): void => {
      if (!onKey) return;
      let action: CanvasKeyAction | null = null;
      switch (ev.key) {
        case "ArrowLeft":
          action = { kind: "pan", dx: -PAN_STEP, dy: 0 };
          break;
        case "ArrowRight":
          action = { kind: "pan", dx: PAN_STEP, dy: 0 };
          break;
        case "ArrowUp":
          action = { kind: "pan", dx: 0, dy: -PAN_STEP };
          break;
        case "ArrowDown":
          action = { kind: "pan", dx: 0, dy: PAN_STEP };
          break;
        case "+":
        case "=":
          action = { kind: "zoom", direction: 1 };
          break;
        case "-":
        case "_":
          action = { kind: "zoom", direction: -1 };
          break;
        case "Enter":
        case " ":
          action = { kind: "commit" };
          break;
        default:
          return;
      }
      ev.preventDefault();
      onKey(action, ev);
    };
    overlay.addEventListener("keydown", onKeyDown);
  }

  return {
    announce: (message: string): void => {
      status.textContent = message;
    },
    teardown: (): void => {
      if (onKeyDown) overlay.removeEventListener("keydown", onKeyDown);
      overlay.removeAttribute("role");
      overlay.removeAttribute("aria-label");
      status.remove();
    },
  };
}

export interface MountCanvasOptions {
  /** `aria-label` for the interactive surface — describe the plot AND its keyboard map. */
  readonly label: string;
  /** Stack a focusable overlay over an `aria-hidden` render canvas (default true). When false, a single
   *  focusable canvas is used (for tools that draw and interact on one surface). */
  readonly overlay?: boolean;
  /** Keyboard action handler. The mount maps arrows/±/Enter/Space to actions; the app applies them. */
  readonly onKey?: (action: CanvasKeyAction, ev: KeyboardEvent) => void;
  /** Extra class on the wrapper element. */
  readonly className?: string;
  /** Document to build in (default the container's / the global). Injectable for tests. */
  readonly doc?: Document;
}

export interface MountedCanvas {
  /** The drawing surface — `aria-hidden` when an overlay is used, otherwise the focusable canvas. */
  readonly render: HTMLCanvasElement;
  /** The focusable, screen-reader-visible interaction surface (=== `render` when `overlay` is false). */
  readonly overlay: HTMLCanvasElement;
  /** The wrapper element appended to the container. */
  readonly root: HTMLElement;
  /** Announce a message in the polite live region (e.g. "recompute done", a coordinate readout). */
  announce(message: string): void;
  /** Remove listeners and DOM nodes. */
  destroy(): void;
}

/** Mount an accessible canvas (render + focusable overlay + live region) into `container`. */
export function mountCanvas(container: HTMLElement, opts: MountCanvasOptions): MountedCanvas {
  const doc = opts.doc ?? container.ownerDocument;
  const useOverlay = opts.overlay ?? true;

  const root = doc.createElement("div");
  root.className = ["cas-canvas", opts.className].filter(Boolean).join(" ");
  root.style.position = "relative";

  const render = doc.createElement("canvas");
  const overlay = useOverlay ? doc.createElement("canvas") : render;

  if (useOverlay) {
    render.setAttribute("aria-hidden", "true");
    overlay.style.position = "absolute";
    overlay.style.inset = "0";
  }

  root.appendChild(render);
  if (useOverlay) root.appendChild(overlay);
  container.appendChild(root);

  const a11y = applyCanvasA11y(doc, overlay, root, "application", opts.label, opts.onKey);

  return {
    render,
    overlay,
    root,
    announce: a11y.announce,
    destroy(): void {
      a11y.teardown();
      root.remove();
    },
  };
}

export interface AttachCanvasOptions {
  /** `aria-label` for the surface — describe the plot (and, when interactive, its keyboard map). */
  readonly label: string;
  /** ARIA role: `"application"` (default) for a keyboard-interactive surface — focusable, keyboard wired;
   *  `"img"` for a STATIC visualization — named for a screen reader, not focusable, no keyboard. */
  readonly role?: "application" | "img";
  /** Keyboard action handler (arrows/±/Enter/Space → actions). Ignored when `role` is `"img"`. */
  readonly onKey?: (action: CanvasKeyAction, ev: KeyboardEvent) => void;
  /** A render canvas behind the overlay to mark `aria-hidden` (so a screen reader names only the overlay). */
  readonly render?: HTMLCanvasElement;
  /** Where to append the live region (default the overlay's parent, else the overlay). */
  readonly liveRegionHost?: HTMLElement;
  /** Document (default the overlay's). Injectable for tests. */
  readonly doc?: Document;
}

export interface AttachedCanvas {
  /** The canvas that received the a11y contract. */
  readonly overlay: HTMLCanvasElement;
  announce(message: string): void;
  /** Remove the listener + live region and the a11y attributes this added. */
  destroy(): void;
}

/**
 * Apply the accessible-overlay contract to a canvas the app already created and lays out — the same
 * role/label/keyboard/live-region wiring `mountCanvas` uses, without building or replacing any DOM.
 */
export function attachCanvasA11y(
  overlay: HTMLCanvasElement,
  opts: AttachCanvasOptions,
): AttachedCanvas {
  const doc = opts.doc ?? overlay.ownerDocument;
  if (opts.render) opts.render.setAttribute("aria-hidden", "true");
  const host = opts.liveRegionHost ?? overlay.parentElement ?? overlay;
  const a11y = applyCanvasA11y(doc, overlay, host, opts.role ?? "application", opts.label, opts.onKey);
  return {
    overlay,
    announce: a11y.announce,
    destroy: a11y.teardown,
  };
}
