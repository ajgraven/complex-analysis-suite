/**
 * Function / constant / parameter name autocomplete for the expression box (catalog A5). As you type an
 * identifier, a small menu below the box offers matching names — the `@cas/expr` builtins (`sin`, `exp`,
 * …), the constants (`pi`, `tau`, `γ`, …), the reserved `z`/`c`, and the map's live parameters. Accepting
 * a function inserts `name(`; a bare name inserts as-is. Keyboard: ↑/↓ to move, Enter/Tab to accept, Esc
 * to dismiss.
 *
 * The token logic is the pure {@link wordAt} / {@link filterCandidates} (unit tested); the menu DOM and
 * keyboard wiring are verified headlessly.
 */

/** A completion candidate. `fn` names insert a trailing `(` (they take arguments). */
export interface Candidate {
  name: string;
  fn: boolean;
}

// Identifier characters, matching the lexer (adds `γ`, the Euler–Mascheroni constant).
const IDENT = /[A-Za-z0-9_γ]/;

/** The identifier being typed immediately before `caret` — its text and start index. Empty when the
 *  character before the caret isn't part of an identifier. */
export function wordAt(text: string, caret: number): { word: string; start: number } {
  let start = caret;
  while (start > 0 && IDENT.test(text[start - 1])) start--;
  return { word: text.slice(start, caret), start };
}

/** Candidates whose name has `word` as a case-insensitive prefix (sorted, capped at `limit`). Empty when
 *  `word` is empty or the only match is exactly what's already typed (nothing to add). */
export function filterCandidates(
  word: string,
  candidates: Candidate[],
  limit = 8,
): Candidate[] {
  if (!word) return [];
  const lw = word.toLowerCase();
  const hits = candidates
    .filter((c) => c.name.toLowerCase().startsWith(lw))
    .sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name));
  if (hits.length === 1 && hits[0].name === word) return [];
  return hits.slice(0, limit);
}

/**
 * Wire the autocomplete menu to a text input. `getCandidates` is called per keystroke (so it can include
 * the map's current parameters); `onAccept` is invoked after an insertion so the host can re-run its
 * input handling (a programmatic value change fires no `input` event).
 */
export function createAutocomplete(
  input: HTMLTextAreaElement | HTMLInputElement,
  menu: HTMLElement,
  getCandidates: () => Candidate[],
  onAccept: () => void,
): { close: () => void } {
  let items: Candidate[] = [];
  let hi = 0;

  const close = (): void => {
    items = [];
    menu.hidden = true;
    menu.replaceChildren();
  };

  const render = (): void => {
    menu.replaceChildren();
    items.forEach((c, idx) => {
      const el = document.createElement("div");
      el.className = "ac-item" + (idx === hi ? " active" : "");
      el.textContent = c.fn ? `${c.name}()` : c.name;
      // mousedown (not click) so it fires before the input's blur closes the menu.
      el.addEventListener("mousedown", (e) => {
        e.preventDefault();
        accept(c);
      });
      menu.append(el);
    });
    menu.hidden = false;
    menu.style.top = `${input.offsetTop + input.offsetHeight + 4}px`;
  };

  const accept = (cand: Candidate): void => {
    const caret = input.selectionStart ?? input.value.length;
    const { start } = wordAt(input.value, caret);
    const insert = cand.fn ? `${cand.name}(` : cand.name;
    input.value = input.value.slice(0, start) + insert + input.value.slice(caret);
    const next = start + insert.length;
    input.setSelectionRange(next, next);
    close();
    input.focus();
    onAccept();
  };

  const refresh = (): void => {
    const caret = input.selectionStart ?? 0;
    const { word } = wordAt(input.value, caret);
    items = filterCandidates(word, getCandidates());
    if (!items.length) {
      close();
      return;
    }
    hi = 0;
    render();
  };

  const move = (d: number): void => {
    if (!items.length) return;
    hi = (hi + d + items.length) % items.length;
    render();
  };

  // Attach via the HTMLElement base: the typed `keydown` → KeyboardEvent overload doesn't survive the
  // `HTMLTextAreaElement | HTMLInputElement` union, but it does on the single base type. Value access
  // (`.value` / `.selectionStart` / …) still goes through `input`, which both members share.
  const el: HTMLElement = input;
  el.addEventListener("input", refresh);
  el.addEventListener("keydown", (e) => {
    if (menu.hidden || !items.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      accept(items[hi]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  });
  // Let a menu click land before blur closes it.
  el.addEventListener("blur", () => window.setTimeout(close, 120));

  return { close };
}
