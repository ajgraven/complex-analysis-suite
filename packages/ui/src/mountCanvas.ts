// @cas/ui — accessible canvas mount.
//
// Ports Complex Dynamics' proven pattern (apps/complex-dynamics/index.html:194-200): a drawing canvas
// marked `aria-hidden` beneath a focusable OVERLAY canvas (`role="application"`, `tabindex=0`) that
// carries a descriptive `aria-label` and a keyboard map (arrows pan, +/− zoom, Enter/Space commits),
// plus a polite `aria-live` status region for `announce()`. Six of seven apps ship a bare <canvas> a
// screen reader cannot see and a keyboard cannot drive (UX audit finding #2); this hands them CD's
// accessibility uniformly. The mount is framework-free DOM and injectable with a `doc` for tests.

/** A keyboard interaction, translated from a key press. The app applies the semantics (how far to pan,
 *  what "commit" means for this tool). */
export type CanvasKeyAction =
  | { readonly kind: "pan"; readonly dx: number; readonly dy: number }
  | { readonly kind: "zoom"; readonly direction: 1 | -1 }
  | { readonly kind: "commit" };

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

const PAN_STEP = 1;

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
  overlay.tabIndex = 0;
  overlay.setAttribute("role", "application");
  overlay.setAttribute("aria-label", opts.label);

  // Visually hidden but announced to assistive tech.
  const status = doc.createElement("div");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.style.position = "absolute";
  status.style.width = "1px";
  status.style.height = "1px";
  status.style.overflow = "hidden";
  status.style.clipPath = "inset(50%)";
  status.style.whiteSpace = "nowrap";

  root.appendChild(render);
  if (useOverlay) root.appendChild(overlay);
  root.appendChild(status);
  container.appendChild(root);

  const onKeyDown = (ev: KeyboardEvent): void => {
    const cb = opts.onKey;
    if (!cb) return;
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
    cb(action, ev);
  };
  overlay.addEventListener("keydown", onKeyDown);

  return {
    render,
    overlay,
    root,
    announce(message: string): void {
      status.textContent = message;
    },
    destroy(): void {
      overlay.removeEventListener("keydown", onKeyDown);
      root.remove();
    },
  };
}
