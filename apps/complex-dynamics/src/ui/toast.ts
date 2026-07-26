/**
 * Minimal, dependency-free toast notifications — a non-blocking replacement for
 * `window.alert`. Toasts stack in a fixed container, auto-dismiss, and can be
 * dismissed early by clicking.
 */

export type ToastType = "info" | "warn" | "error";

/**
 * An optional button inside the toast — the recovery affordance for an act that just destroyed
 * something ("Deleted view … [Undo]"). Give an action toast a longer timeout than the default:
 * it is only useful while it is on screen.
 */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

/** The toast container (uses #toasts from the markup; creates it if absent). */
function container(): HTMLElement {
  let el = document.getElementById("toasts");
  if (!el) {
    el = document.createElement("div");
    el.id = "toasts";
    el.className = "toasts";
    el.setAttribute("aria-live", "polite");
    document.body.appendChild(el);
  }
  return el;
}

/** Show a transient message. Errors use `role="alert"` so they're announced. */
export function showToast(
  message: string,
  type: ToastType = "info",
  timeoutMs = 5000,
  action?: ToastAction,
): void {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.setAttribute("role", type === "error" ? "alert" : "status");
  toast.textContent = message;

  const remove = (): void => toast.remove();
  if (action) {
    // A real <button>, so it is reachable by keyboard and announced as one. Its own listener runs
    // before the click bubbles to the dismiss handler below, so acting also closes the toast.
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "toast-action";
    btn.textContent = action.label;
    btn.addEventListener("click", action.onClick);
    toast.append(" ", btn);
  }
  toast.addEventListener("click", remove);
  window.setTimeout(remove, timeoutMs);

  container().appendChild(toast);
}
