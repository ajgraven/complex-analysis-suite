/**
 * Minimal, dependency-free toast notifications — a non-blocking replacement for
 * `window.alert`. Toasts stack in a fixed container, auto-dismiss, and can be
 * dismissed early by clicking.
 */

export type ToastType = "info" | "warn" | "error";

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
export function showToast(message: string, type: ToastType = "info", timeoutMs = 5000): void {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.setAttribute("role", type === "error" ? "alert" : "status");
  toast.textContent = message;

  const remove = (): void => toast.remove();
  toast.addEventListener("click", remove);
  window.setTimeout(remove, timeoutMs);

  container().appendChild(toast);
}
