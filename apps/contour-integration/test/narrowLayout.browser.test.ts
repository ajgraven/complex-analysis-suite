// **THE PAGE DOES NOT SCROLL SIDEWAYS ON A PHONE, MEASURED IN A REAL BROWSER.**
//
// `test/shell.test.ts` runs under jsdom, which does no layout at all: `scrollWidth` there is a
// hard-coded `0` and every grid track is a string nobody resolves. So the defect this file guards was
// invisible to the whole node suite — at a 400 px viewport `document.documentElement.scrollWidth` was
// 656 against a `clientWidth` of 400, and it had been for as long as the accumulator's readout had
// been `19rem` wide.
//
// The number is not a mystery: 656 = 352 + 304, the shell's `var(--rail)` column plus the strip's
// readout column. Both are rigid `rem` tracks, both are declared on a CONTAINER, and that is why
// `display: none` on the `.rail` element changed nothing — an item can vanish and leave its track
// exactly where it was. `src/ui/app.css`'s two narrow-viewport media queries relax them.
//
// Measured through the app as it is actually served — its own `index.html`, in an iframe of a
// declared width — rather than by mounting the shell into the tester document, so the `<link>` to
// `app.css`, `main.ts`'s boot and the suite nav are all the real ones.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** The phone the bug was found on. */
const W = 400;
const H = 800;

interface Frame {
  readonly doc: Document;
  readonly win: Window;
}

let host: HTMLIFrameElement;
let frame: Frame;

/** Settle two animation frames, which is one more than a style recalc and a layout need. */
function settle(win: Window): Promise<void> {
  return new Promise((res) => win.requestAnimationFrame(() => win.requestAnimationFrame(() => res())));
}

beforeAll(async () => {
  host = document.createElement("iframe");
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${W}px;height:${H}px;border:0`;
  // The app's own page. Vite serves it at the browser project's root, so this is the same document a
  // phone would get, `<meta viewport>` and stylesheet link included.
  host.src = "/index.html";
  document.body.append(host);
  await new Promise<void>((res) => {
    host.addEventListener("load", () => res(), { once: true });
  });
  const doc = host.contentDocument;
  const win = host.contentWindow;
  if (doc === null || win === null) throw new Error("the app frame did not open");
  // `mountApp` runs inside the fatal boundary and builds a WebGL2 stage; give the module graph and
  // the first layout a moment rather than racing them.
  for (let i = 0; i < 30 && doc.querySelector(".shell") === null; i++) await settle(win);
  if (doc.querySelector(".shell") === null) {
    throw new Error(`the app did not mount: ${doc.body.innerHTML.slice(0, 400)}`);
  }
  await settle(win);
  frame = { doc, win };
});

afterAll(() => {
  host.remove();
});

/**
 * Put the app in one of its two problem sources and let the bar re-lay-out.
 *
 * The two modes' bar controls are both in the DOM at once with one `hidden` (`.barGroup[hidden]`), so
 * this changes which set is measured without rebuilding anything.
 */
async function setMode(mode: "sandbox" | "gallery"): Promise<void> {
  const buttons = Array.from(frame.doc.querySelectorAll<HTMLButtonElement>(".sourceToggle button"));
  const button = buttons.find((b) => b.dataset.mode === mode);
  if (button === undefined) throw new Error(`no ${mode} button in the source toggle`);
  button.click();
  await settle(frame.win);
  await settle(frame.win);
}

/**
 * A rule that carries a condition (`@media`, `@supports`), or `null`.
 *
 * Duck-typed rather than `instanceof CSSMediaRule`, because the rules being inspected belong to the
 * FRAME's realm and its constructors are not this realm's — an `instanceof` here is false for every
 * one of them, and reaching for `frame.win.CSSMediaRule` is not typed on `Window`.
 */
function asConditionRule(rule: CSSRule): CSSConditionRule | null {
  const maybe = rule as Partial<CSSConditionRule>;
  return typeof maybe.conditionText === "string" ? (rule as CSSConditionRule) : null;
}

/** The page's own horizontal overflow: zero when nothing is wider than the viewport. */
function overflow(doc: Document): { scrollWidth: number; clientWidth: number } {
  const de = doc.documentElement;
  return { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth };
}

describe(`the page fits a ${W} px viewport`, () => {
  it("does not scroll horizontally", () => {
    const { scrollWidth, clientWidth } = overflow(frame.doc);
    expect({ scrollWidth, clientWidth }).toEqual({ scrollWidth: clientWidth, clientWidth });
  });

  it("and neither does any region inside it — in EITHER mode", async () => {
    // `scrollWidth === clientWidth` on the document would also be satisfied by a region that hid its
    // own overflow — `.bar`, `.stage`, `.rail` and `.accSide` all carry `overflow: hidden`, so the
    // page can be honest while a panel is quietly clipping its contents away. Each region is checked
    // on its own so that a "fix" of THAT shape fails here.
    //
    // Both modes, because the bar holds a different set of controls in each and they clipped
    // INDEPENDENTLY: making the bar wrap left gallery's two pickers on one unbreakable flex line, so
    // the fixture picker was off the right edge while the sandbox's integrand field was reachable.
    // A one-mode check would have called that fixed.
    for (const mode of ["sandbox", "gallery"] as const) {
      await setMode(mode);
      for (const sel of [".shell", "header.bar", "footer.strip", ".accSide", "aside.rail"]) {
        const e = frame.doc.querySelector(sel);
        if (e === null) throw new Error(`${sel} is missing in ${mode} mode`);
        expect({ mode, sel, clipped: e.scrollWidth > e.clientWidth }).toEqual({
          mode,
          sel,
          clipped: false,
        });
      }
      // And DOWN, for the two regions that hold flowing controls. Wrapping the bar moves the problem
      // into the other axis unless its row is allowed to grow with it: `height: var(--bar)` plus
      // `overflow: hidden` leaves every wrapped row after the first clipped off the bottom, which no
      // width measurement can see (the bar is 134 px tall at 400 px against a 48 px `--bar`).
      for (const sel of ["header.bar", ".accSide"]) {
        const e = frame.doc.querySelector(sel);
        if (e === null) throw new Error(`${sel} is missing in ${mode} mode`);
        expect({ mode, sel, clippedDown: e.scrollHeight > e.clientHeight }).toEqual({
          mode,
          sel,
          clippedDown: false,
        });
      }
      const { scrollWidth, clientWidth } = overflow(frame.doc);
      expect({ mode, scrollWidth }).toEqual({ mode, scrollWidth: clientWidth });
    }
    await setMode("sandbox");
  });

  it("with the accumulator still a panel and not a sliver", () => {
    // The fix must not buy the width back out of the thing the strip exists to show — which rules out
    // the two shortcuts that would also make the page fit: squeezing the canvas to a sliver, or
    // dropping the readout. Measured at 400 px the canvas is 400 × 162 with the readout underneath it
    // at the full width; the floors are well inside that and well outside either shortcut.
    //
    // The canvas floor is 100 and not 150 on purpose. `.accSide`'s flex layout is worth about 20 px of
    // canvas height here (162 against 142 laid out as a block) and rather more at 320 px, where the
    // contrast buttons wrap — it is a refinement, not the thing that makes this work, and a floor
    // tuned to kill it would be a floor that fails on a narrower phone for no reason.
    const wrap = frame.doc.querySelector(".accWrap");
    const side = frame.doc.querySelector(".accSide");
    if (wrap === null || side === null) throw new Error("the strip is missing a half");
    const canvas = wrap.getBoundingClientRect();
    const readout = side.getBoundingClientRect();
    expect({
      canvasW: canvas.width >= 0.9 * W,
      canvasH: canvas.height >= 100,
      readoutW: readout.width >= 0.9 * W,
      readoutH: readout.height >= 40,
    }).toEqual({ canvasW: true, canvasH: true, readoutW: true, readoutH: true });
  });

  it("and everything below the fold can actually be reached", async () => {
    // Stacking the rail under the stage makes the page taller than the viewport — the ledger, the
    // result and the derivation are all down there — and `body` carries `overflow: hidden` at every
    // other width, so the stack has to lift it or the rail is laid out correctly and then hidden.
    const de = frame.doc.documentElement;
    const rail = frame.doc.querySelector("aside.rail");
    const shell = frame.doc.querySelector(".shell");
    if (rail === null || shell === null) throw new Error("the page is missing its stacked regions");
    expect(de.scrollHeight).toBeGreaterThan(de.clientHeight);

    // **`window.scrollTo` does NOT test this, and the first draft of this assertion was vacuous
    // because of it.** An `overflow: hidden` box is still scrollable programmatically — `hidden`
    // suppresses the user's scrolling mechanism, not the scroll position — so restoring
    // `overflow: hidden` here left `scrollY` moving happily and the test green. The used value is the
    // only thing that separates them: `html` is `visible`, so the viewport takes its overflow from
    // `body`, and `hidden` there is what makes the bottom of the page unreachable by hand.
    expect({
      html: frame.win.getComputedStyle(de).overflowY,
      body: frame.win.getComputedStyle(frame.doc.body).overflowY,
    }).toEqual({ html: "visible", body: "auto" });

    // The shell's own box has to grow with its rows too, or its panel background stops at 100vh while
    // the rail carries on past it. `height: auto` is what does that; the fixed height it replaces is
    // invisible to every other assertion here.
    const shellBox = shell.getBoundingClientRect();
    const railBottom = rail.getBoundingClientRect().bottom;
    expect(shellBox.bottom).toBeGreaterThanOrEqual(railBottom - 1);

    // And it does reach: scrolled to the end, the last thing on the page is on screen.
    frame.win.scrollTo(0, de.scrollHeight);
    await settle(frame.win);
    const bottomWhenScrolled = rail.getBoundingClientRect().bottom;
    frame.win.scrollTo(0, 0);
    await settle(frame.win);
    expect(bottomWhenScrolled).toBeLessThanOrEqual(de.clientHeight + 1);
  });
});

describe("and the guard has teeth", () => {
  it("the same page overflows to exactly 656 px with the narrow-viewport rules switched off", async () => {
    // The assertions above pass for a page with no layout problem AND for a test that is measuring the
    // wrong document, or one where the app never mounted. Switching off exactly the rules that fix it
    // — and nothing else — is what tells those apart: the number that comes back is the bug's own.
    //
    // By DELETING the two `@media` blocks and re-inserting them from their own `cssText`, because
    // `CSSConditionRule.conditionText` is getter-only in Chromium — the obvious "set the condition to
    // something nothing matches" throws.
    const sheet = Array.from(frame.doc.styleSheets).find((s) => {
      try {
        return Array.from(s.cssRules).some((r) => /^\.shell/.test((r as CSSStyleRule).selectorText ?? ""));
      } catch {
        return false; // A cross-origin sheet, which none of ours is.
      }
    });
    if (sheet === undefined) throw new Error("the app's stylesheet is not readable from the frame");

    // Indices descend so that each removal leaves the earlier ones where they were.
    const folds: { index: number; cssText: string }[] = [];
    for (let i = sheet.cssRules.length - 1; i >= 0; i--) {
      const rule = sheet.cssRules[i];
      const condition = asConditionRule(rule);
      if (condition === null) continue;
      if (!/max-width/.test(condition.conditionText)) continue;
      if (!/\.strip|\.shell/.test(condition.cssText)) continue;
      folds.push({ index: i, cssText: condition.cssText });
    }
    // One for the strip's readout, one for the shell's rail. Fewer means the selector above stopped
    // finding them and the rest of this test would be measuring nothing.
    expect(folds).toHaveLength(2);

    for (const f of folds) sheet.deleteRule(f.index);
    await settle(frame.win);
    const broken = overflow(frame.doc);
    for (const f of [...folds].reverse()) sheet.insertRule(f.cssText, f.index);
    await settle(frame.win);
    const fixed = overflow(frame.doc);

    // 656 = 352 (the rail track) + 304 (the readout track), which is the whole diagnosis as one
    // number. Asserted exactly, so a future change to either track has to come past this line.
    expect({ scrollWidth: broken.scrollWidth, clientWidth: broken.clientWidth }).toEqual({
      scrollWidth: 656,
      clientWidth: W,
    });
    // And it is the rules that put it back, not the reload that never happened.
    expect(fixed.scrollWidth).toBe(fixed.clientWidth);
  });
});
