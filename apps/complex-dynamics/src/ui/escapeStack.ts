/**
 * One Escape key, one layer at a time.
 *
 * The app grew six independent `document`-level Escape handlers — the mobile controls sheet, the
 * onboarding card, the expanded-plot mode, the glossary, the keyboard-reference modal and the σ
 * peer view — each of which tested its own visibility and closed itself. Escape is not a broadcast:
 * with the glossary open over an expanded plot, one press closed BOTH, and the reader who wanted to
 * shut a definition lost their layout with it. The σ handler already carried a hand-written special
 * case for exactly one of the five pairs ("a modal reachable from σ must close WITHOUT also exiting
 * σ") — five more of those would have been needed to finish the job, which is the shape of a problem
 * that wants a stack rather than more cases. (WP8/S5, review 2026-09-16.)
 *
 * A layer registers when it OPENS and releases when it closes, by any route — its own button, a
 * backdrop click, or Escape. Escape closes the top layer only, and stops there.
 */

/** A registered layer: the callback that closes it, newest last. */
const stack: (() => void)[] = [];

let installed = false;

function install(): void {
  if (installed) return;
  installed = true;
  // Capture phase, so this runs before any surviving element-level handler and before the app's own
  // σ keyboard listener — which reads arrows and +/- and must not see an Escape the stack consumed.
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Escape" || stack.length === 0) return;
      const close = stack[stack.length - 1];
      e.preventDefault();
      e.stopPropagation();
      close();
    },
    true,
  );
}

/**
 * Register `close` as the topmost Escape layer. Returns a release function that removes it —
 * idempotent, and safe to call from inside `close` itself, which is the usual arrangement (the
 * layer's own close routine releases, so every route out goes through one place).
 */
export function pushEscapeLayer(close: () => void): () => void {
  install();
  const entry = (): void => close();
  stack.push(entry);
  return () => {
    const i = stack.lastIndexOf(entry);
    if (i >= 0) stack.splice(i, 1);
  };
}

/** How many layers are open. For tests; the app never asks. */
export function escapeLayerCount(): number {
  return stack.length;
}

/** Drop every layer. Only for tests, which mount the app repeatedly into one document. */
export function resetEscapeLayers(): void {
  stack.length = 0;
}
