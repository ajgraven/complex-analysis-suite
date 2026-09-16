// The modal mechanics: a focus trap, `inert`, Escape, and focus returned where it came from.
//
// M8 step 1.8, extracted from `contrasts.ts` on the second-consumer rule (ADR-0007). The contrast
// ladder built these at step 1.7 and the front door is the second panel that needs every one of
// them; the alternative is two copies of a forty-line trap, which is how two dialogs come to
// disagree about what Escape does.
//
// **What is here is what has no opinion about content.** The heading, the controls and what a click
// means are the consumer's; the container, the keyboard and the page behind it are this file's. The
// split is testable rather than stylistic: everything below can be asserted against a panel whose
// body is a single button.
//
// **A `<div role="dialog">` rather than `<dialog>.showModal()`**, deliberately, and this is the
// reason it is worth forty lines. The native element would supply the trap, the backdrop and the top
// layer; what it would not supply is a testable `aria-modal` (it is implied by the top layer rather
// than carried as an attribute) — and jsdom implements neither `showModal` nor the top layer, so
// every property asserted below would have to be asserted in a browser instead, which puts the a11y
// contract of a panel into the one suite the node gate structurally cannot run.
//
// **Why any of it at all.** `shell/app.ts` drew its grid into a `hidden` `<section>` laid over the
// page. That already did the two easy halves — it remembers `document.activeElement` and closes on
// Escape — and it is still not a modal, because the app underneath stays in the tab order and stays
// in the accessibility tree. A reader who Tabs past the last control lands on the record picker
// behind the panel, with the panel still covering it; a screen reader walks straight out into a rail
// that is not visible. The three things that fix that are `aria-modal`, `inert` on the page, and a
// trap that makes Tab cycle — and a trap is the one of the three no browser will do for you inside a
// plain `<div>`.

// **Three equivalent mutants came with the mechanics, kept with their reasons** (step 1.7's sweep,
// 38 mutants, 33 killed). The `:not([disabled])` clauses in {@link FOCUSABLE} are unreachable while
// nothing in a dialog is disabled; the empty-`items` branch of `cycle` is unreachable while every
// dialog has at least one control, and prevents `items[next].focus()` throwing if one ever does
// not; and `dialog.tabIndex = -1` versus `0` is genuinely unobservable, since `dialog.querySelectorAll`
// never returns the dialog itself, so the value cannot change the cycle. It is `-1` because a
// container is not a control, and because the page-level tab order it would otherwise join is
// covered by `inert` anyway.

/**
 * Everything Tab may land on, in document order.
 *
 * No visibility filter. Every control in these dialogs is visible by construction, and the filter
 * that would be written for one — `offsetParent !== null` — is `null` for everything in jsdom, so a
 * trap guarded by it would pass its tests by having nothing to cycle through.
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Distinguishes one mounted dialog's heading id from another's, so `aria-labelledby` resolves. */
let SEQ = 0;

export interface ModalInput {
  /** Where the backdrop is appended. Deliberately NOT the shell — see {@link createModal}. */
  readonly host: HTMLElement;
  /** The element made `inert` while the dialog is up. The page the dialog is covering. */
  readonly page: HTMLElement;
  /** The backdrop's class. The consumer's, because the visual system is scoped to it. */
  readonly backdropClass: string;
  /** The dialog's own class. */
  readonly dialogClass: string;
  /**
   * Fill the dialog in, ONCE, on the first open.
   *
   * Lazy because a panel's content can be expensive — the ladder is five full solves — and most
   * readers never open it. `titleId` is generated here and must be put on the heading the dialog is
   * named by, or `aria-labelledby` resolves to nothing.
   */
  readonly build: (dialog: HTMLElement, titleId: string) => void;
  /**
   * The dialog is going away. The consumer clears whatever session flag it renders from.
   *
   * Called on every dismissal — Escape, the backdrop, a control that calls {@link Modal.dismiss} —
   * so the consumer and this file cannot disagree about whether the panel is up.
   */
  readonly onClose: () => void;
}

export interface Modal {
  /** Show it. Traps focus, makes the page `inert`, remembers what to return focus to. */
  readonly open: () => void;
  /** Hide it, restore `inert`, and put focus back where it was. Idempotent. */
  readonly close: () => void;
  /** Hide it AND tell the consumer — what a control inside the dialog calls. */
  readonly dismiss: () => void;
  readonly isOpen: boolean;
  /** The dialog element, for a consumer that patches its own content into it. */
  readonly dialog: HTMLElement;
  readonly destroy: () => void;
}

export function createModal(input: ModalInput): Modal {
  const { host, page, backdropClass, dialogClass, build, onClose } = input;
  const titleId = `cas-dialog-title-${++SEQ}`;

  const backdrop = document.createElement("div");
  backdrop.className = backdropClass;
  const dialog = document.createElement("div");
  dialog.className = dialogClass;
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", titleId);
  // **Focusable, but never in the tab order.** `-1` is what lets `open()` put focus on the dialog
  // itself rather than on a control — see below — while leaving Tab to cycle the controls alone.
  dialog.tabIndex = -1;
  backdrop.append(dialog);

  let opened = false;
  /** What to give focus back to. Captured on the open that shows it, and only that one. */
  let returnTo: HTMLElement | null = null;
  /** Whether the page already carried `inert` when we arrived, so restoring restores rather than clears. */
  let pageWasInert = false;
  let built = false;

  function focusables(): HTMLElement[] {
    return [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
  }

  /**
   * Tab, both ways, entirely by hand.
   *
   * **Every Tab is intercepted, not only the two at the ends.** Letting the browser do the interior
   * moves and stepping in at the wrap would be less code and would be untestable: jsdom implements
   * no tab traversal at all, so a trap written that way would have exactly one observable behaviour
   * in the node gate — the wrap — and the interior would be asserted nowhere. Driving it from the
   * index also means the dialog itself (`tabIndex = -1`, so not in the list) is handled by the same
   * branch that handles the ends: Tab from it goes to the first control, Shift+Tab to the last.
   */
  function cycle(event: KeyboardEvent): void {
    const items = focusables();
    // No controls at all: there is nowhere to send focus, so hold it on the dialog rather than let
    // Tab walk out into a page that is `inert` and cannot be interacted with anyway.
    if (items.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const at = items.indexOf(document.activeElement as HTMLElement);
    const last = items.length - 1;
    const next = event.shiftKey ? (at <= 0 ? last : at - 1) : at === -1 || at === last ? 0 : at + 1;
    event.preventDefault();
    items[next].focus();
  }

  /**
   * Shut it and tell the consumer, in that order.
   *
   * Both halves, every time: `close()` takes the DOM down and gives focus back, `onClose()` clears
   * whatever the consumer renders from. **Calling only the second would leave the dialog standing
   * whenever the consumer did not re-render** — a modal that outlives its own Escape key has trapped
   * the reader, which is the failure this whole file exists to prevent.
   */
  function dismiss(): void {
    closeDialog();
    onClose();
  }

  backdrop.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      // Stopped here: the stage's own Escape abandons a half-drawn pen path, and a reader shutting
      // a dialog over the stage did not ask for that.
      event.stopPropagation();
      dismiss();
      return;
    }
    if (event.key === "Tab") cycle(event);
  });

  // A click on the backdrop and not on the dialog is a click on the page the dialog is covering,
  // which is the gesture every modal reads as "shut this". `event.target` rather than a bubbling
  // check, so a click that began inside the dialog and ended outside it does not close anything.
  backdrop.addEventListener("click", (event: MouseEvent) => {
    if (event.target === backdrop) dismiss();
  });

  function openDialog(): void {
    // **A second `open()` must not re-capture the return target.** It would capture whatever is
    // focused now — which, the dialog being up, is a control inside it — and closing would then put
    // focus on a node that has just been removed from the document, dropping the reader at the top
    // of the page with no announcement at all.
    if (opened) return;
    opened = true;
    if (!built) {
      built = true;
      build(dialog, titleId);
    }
    returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // `inert` is written as an ATTRIBUTE. The property reflects it in every engine that implements
    // the feature, and jsdom implements neither — measured: `"inert" in document.createElement("div")`
    // is false and there is no accessor on `HTMLElement.prototype`, so `el.inert = true` merely
    // creates an expando that reflects nowhere and tells a test nothing. The attribute is the one
    // write that is true in a browser and observable in the gate.
    pageWasInert = page.hasAttribute("inert");
    if (!pageWasInert) page.setAttribute("inert", "");

    host.append(backdrop);

    // **Focus lands on the DIALOG, not on its first control.** A panel's first control is typically
    // `Close`, and a reader who opens it and presses Space — to scroll, which is the natural next
    // keystroke — would shut it again immediately. Focusing the container announces the dialog by
    // its `aria-labelledby` heading, puts nothing under the space bar, and leaves the very next Tab
    // landing on that first control anyway, which is where focusing it would have started.
    dialog.focus();
  }

  function closeDialog(): void {
    // Idempotent, and the guard is what makes it so: a second call must not move focus a second
    // time. `dismiss()` is reached from Escape, from a control, from the backdrop AND from the
    // consumer's own re-render, so being called twice about one gesture is the normal case rather
    // than the defensive one.
    if (!opened) return;
    opened = false;

    backdrop.remove();
    if (!pageWasInert) page.removeAttribute("inert");

    // Back where it came from. `isConnected` because the state behind the dialog may have changed
    // while it was up; focusing a detached node silently does nothing in a browser and leaves the
    // reader on `<body>`, so the null case is at least honest about having nowhere to go.
    //
    // **The `isConnected` check is an EQUIVALENT mutant, kept.** Dropping it changes nothing a test
    // can observe: `.focus()` on a detached node is silently ignored in jsdom and in every browser,
    // so the reader lands on `<body>` either way. It stays because the two spellings say different
    // things — this one declines to move focus when there is nowhere to move it to, and the other
    // attempts a move and relies on the platform to swallow it — and because the day this wants a
    // fallback, the branch that needs one already exists. Sweep 17/18, this the one survivor.
    //
    // **`returnTo` is deliberately NOT cleared here.** Clearing it would be a second guard against
    // the same defect — a second close moving focus a second time — and `open()` reassigns it
    // anyway, so the only thing it would buy is that neither guard could be removed observably.
    // Two sufficient guards for one property is how a mutation sweep comes back with two equivalent
    // mutants and no information; the idempotency is stated once, above, where a test can reach it.
    if (returnTo !== null && returnTo.isConnected) returnTo.focus();
  }

  return {
    open: openDialog,
    close: closeDialog,
    dismiss,
    get isOpen(): boolean {
      return opened;
    },
    dialog,
    destroy: (): void => {
      closeDialog();
      backdrop.remove();
    },
  };
}
