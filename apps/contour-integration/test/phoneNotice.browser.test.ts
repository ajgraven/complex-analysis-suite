// **THE PHONE NOTICE, MEASURED IN A REAL BROWSER** — M8 step 1.12.
//
// It replaces `test/narrowLayout.browser.test.ts`, and inherits its harness for the reason that file
// gives: under jsdom `scrollWidth` is a hard-coded 0 and no grid track is ever resolved, so a layout
// claim made in the node suite is a claim about nothing. Its finding is also why this exists — at
// 400 px the old shell laid out 656 px of content, 352 of rigid rail plus 304 of rigid readout, and
// relaxing those tracks was a layout nobody had designed. The owner's decision is desktop and
// laptop, so below 900 px the app says so.
//
// **In an IFRAME of a declared width**, because that is the only way to give a media query something
// to resolve against: Vitest's browser mode does not resize the window from inside a test, and a
// 400 px-wide div inside a 1280 px window is still a desktop as far as the stylesheet is concerned.
// The frame loads the app's own `index.html`, so the `<meta viewport>`, the stylesheet links and
// `main.ts`'s boot are all the real ones — which is what makes this a test of the shipped page
// rather than of a mount this file arranged.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** The phone the old shell's defect was found on. */
const W = 400;
const H = 800;
/** A laptop, for the control. Above the 900 px breakpoint and below the smallest desktop. */
const WIDE = 1024;

const settle = (win: Window): Promise<void> =>
  new Promise((res) => win.requestAnimationFrame(() => win.requestAnimationFrame(() => res())));

async function open(width: number): Promise<{ doc: Document; win: Window; frame: HTMLIFrameElement }> {
  const frame = document.createElement("iframe");
  frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;height:${H}px;border:0`;
  frame.src = "/index.html";
  document.body.append(frame);
  await new Promise<void>((res) => {
    frame.addEventListener("load", () => res(), { once: true });
  });
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (doc === null || win === null) throw new Error("the app frame did not open");
  // `mountShell2` runs inside the fatal boundary and builds a WebGL2 stage; give the module graph
  // and the first layout a moment rather than racing them.
  for (let i = 0; i < 40 && doc.querySelector(".phoneNotice") === null; i++) await settle(win);
  if (doc.querySelector(".phoneNotice") === null) {
    throw new Error(`the app did not mount: ${doc.body.innerHTML.slice(0, 400)}`);
  }
  await settle(win);
  return { doc, win, frame };
}

let phone: { doc: Document; win: Window; frame: HTMLIFrameElement };
let wide: { doc: Document; win: Window; frame: HTMLIFrameElement };

beforeAll(async () => {
  phone = await open(W);
  wide = await open(WIDE);
});

afterAll(() => {
  phone.frame.remove();
  wide.frame.remove();
});

const shown = (frameOf: { doc: Document; win: Window }, sel: string): boolean => {
  const el = frameOf.doc.querySelector(sel);
  return el !== null && frameOf.win.getComputedStyle(el).display !== "none";
};

describe("the phone notice", () => {
  it("SWAPS with the grid below 900 px, and back above it", () => {
    // Both halves, in both frames: a stylesheet that hid the grid everywhere would satisfy the
    // first pair alone, and one that hid neither would satisfy the second.
    expect(shown(phone, "main.shell2"), "the grid is laid out on a phone").toBe(false);
    expect(shown(phone, ".phoneNotice"), "the notice is missing on a phone").toBe(true);
    expect(shown(wide, "main.shell2"), "the grid is missing on a laptop").toBe(true);
    expect(shown(wide, ".phoneNotice"), "the notice is shown on a laptop").toBe(false);
  });

  it("does not scroll SIDEWAYS, which is the defect it replaces", () => {
    // The old shell's own number: `documentElement.scrollWidth` 656 against a `clientWidth` of 400.
    const el = phone.doc.documentElement;
    expect({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }).toEqual({
      scrollWidth: el.clientWidth,
      clientWidth: el.clientWidth,
    });
  });

  it("says WHAT to do, and carries the address as text to copy", () => {
    const text = phone.doc.querySelector(".phoneNotice p")?.textContent ?? "";
    expect(text).toBe(
      "Contour Integration is built for a desktop or laptop screen. Open this link on one to explore it.",
    );
    const link = phone.doc.querySelector(".phoneLink");
    expect(link?.textContent, "the notice offers no link to copy").toBe(phone.win.location.href);
    // Text, not an anchor: the reader is already at it, so there is nothing to follow.
    expect(link?.tagName).toBe("CODE");
    expect(phone.doc.querySelector(".phoneNotice a")).toBeNull();
  });

  it("styles the DOCUMENT, which `app.css` used to and nothing did after it went", () => {
    // **The regression this step nearly shipped.** Every rule in `theme.css` is scoped under
    // `.shell2`, which was right while two shells shared a page — and left `body` on the browser's
    // serif the moment `app.css` was deleted, so the notice, which is outside the grid by
    // construction, was drawn in it. Asserted on the frame's own `body` rather than on an element,
    // because what was missing was the document's own typography.
    const body = phone.win.getComputedStyle(phone.doc.body);
    expect(body.fontFamily, "the document has no font of its own").toContain("Inter");
    expect(body.margin).toBe("0px");
    // The notice inherits it rather than declaring one, which is what makes the fix a document rule
    // and not a patch on this one element.
    const p = phone.doc.querySelector(".phoneNotice p");
    if (p === null) throw new Error("no notice paragraph");
    expect(phone.win.getComputedStyle(p).fontFamily).toBe(body.fontFamily);
  });

  it("KEEPS the link current, not only correct at boot", () => {
    // Two writers: one at construction, one in `writeHash`. Dropping the second leaves the notice
    // showing the address the reader arrived on — which on a phone is the one thing it is for, and
    // is wrong the moment anything moves. Driven on the WIDE frame, because the media query decides
    // what is displayed and not what is written.
    const link = (): string => wide.doc.querySelector(".phoneLink")?.textContent ?? "";
    const before = link();
    const record = wide.doc.querySelector<HTMLButtonElement>('[data-testid="record"]');
    expect(record, "no record button to move the state with").not.toBeNull();
    const sandbox = wide.doc.querySelector<HTMLButtonElement>('[data-testid="sandbox"]');
    sandbox?.click();
    return new Promise<void>((res) => {
      // `syncHash` coalesces on a 250 ms timer (M6.2's first finding), so the wait is the app's own.
      wide.win.setTimeout(() => {
        expect(link(), "the notice's link did not follow the state").not.toBe(before);
        expect(link()).toBe(wide.win.location.href);
        res();
      }, 500);
    });
  });

  it("puts NO second `<h1>` in the document", () => {
    // `display: none` takes the hidden half out of the accessibility tree, so only one heading is
    // ever exposed — but `test/shell2.test.ts` asserts the outline structurally over the DOM, and a
    // heading here would break it whichever half is showing.
    expect(phone.doc.querySelectorAll("h1")).toHaveLength(1);
    expect(phone.doc.querySelector(".phoneNotice :is(h1, h2, h3)")).toBeNull();
  });
});
