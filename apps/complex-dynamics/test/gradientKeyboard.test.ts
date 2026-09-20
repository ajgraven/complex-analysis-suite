// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { setupGradientEditor } from "../src/ui/gradient";

// WP11/U10 (review 2026-09-16). The stop handles were focusable, named buttons with NO keyboard
// behaviour: moving a stop needed a pointer drag and adding one needed a pointer click on the bar,
// so the custom gradient — the whole point of the "Custom…" palette — was pointer-only.

function editor(): { host: HTMLElement; stops: () => { t: number }[] } {
  const host = document.createElement("div");
  document.body.append(host);
  let latest: { t: number }[] = [];
  const ed = setupGradientEditor(
    host,
    [
      { t: 0, color: [0, 0, 0] },
      { t: 0.5, color: [128, 0, 128] },
      { t: 1, color: [255, 255, 255] },
    ],
    (s) => {
      latest = s.map((x) => ({ t: x.t }));
    },
  );
  latest = ed.getStops().map((x) => ({ t: x.t }));
  return { host, stops: () => latest };
}

const handles = (host: HTMLElement): HTMLElement[] => [
  ...host.querySelectorAll<HTMLElement>(".gradient-handle"),
];
const key = (el: HTMLElement, k: string, shift = false): void =>
  void el.dispatchEvent(new KeyboardEvent("keydown", { key: k, shiftKey: shift, bubbles: true }));

describe("the gradient editor is usable from the keyboard", () => {
  it("exposes each stop as a slider with its position as the value", () => {
    const { host } = editor();
    const hs = handles(host);
    expect(hs.length).toBeGreaterThanOrEqual(2);
    for (const h of hs) {
      expect(h.getAttribute("role")).toBe("slider");
      expect(h.getAttribute("aria-valuemin")).toBe("0");
      expect(h.getAttribute("aria-valuemax")).toBe("100");
      expect(Number(h.getAttribute("aria-valuenow"))).not.toBeNaN();
      expect((h.getAttribute("aria-label") ?? "").length).toBeGreaterThan(0);
    }
  });

  it("arrows move a stop, and Shift moves it ten times as far", () => {
    const { host, stops } = editor();
    const start = stops()[1].t;
    key(handles(host)[1], "ArrowRight");
    const oneStep = stops()[1].t - start;
    expect(oneStep).toBeCloseTo(0.01, 9);
    key(handles(host)[1], "ArrowRight", true);
    expect(stops()[1].t - start).toBeCloseTo(0.11, 9);
    key(handles(host)[1], "ArrowLeft", true);
    expect(stops()[1].t - start).toBeCloseTo(0.01, 9);
  });

  it("Home and End send it to the ends", () => {
    // Counting, not `some`: the fixture already HAS a stop at each end, so "some stop is at 0"
    // is true before a key is pressed — the first draft of this passed with the handler removed.
    const { host, stops } = editor();
    expect(stops().filter((s) => s.t === 0)).toHaveLength(1);
    key(handles(host)[1], "Home"); // the middle one
    expect(stops().filter((s) => s.t === 0)).toHaveLength(2);
    key(handles(host)[0], "End");
    expect(stops().filter((s) => s.t === 1)).toHaveLength(2);
  });

  it("Insert adds a stop and Delete removes one, down to the two-stop floor", () => {
    const { host, stops } = editor();
    const n = stops().length;
    key(handles(host)[0], "Insert");
    expect(stops().length).toBe(n + 1);
    key(handles(host)[0], "Delete");
    expect(stops().length).toBe(n);
    // …and it refuses to go below two, the same floor the Remove button enforces.
    while (stops().length > 2) key(handles(host)[0], "Delete");
    key(handles(host)[0], "Delete");
    expect(stops().length).toBe(2);
  });

  it("keeps focus on the handle across a move — otherwise one press is all you get", () => {
    // `render()` rebuilds the handle DOM, so without restoring focus the second arrow press goes
    // to the body. The keyboard path would have been unusable, not merely awkward.
    const { host } = editor();
    const h = handles(host)[1];
    h.focus();
    expect(document.activeElement).toBe(h);
    key(h, "ArrowRight");
    const after = document.activeElement as HTMLElement;
    // A DIFFERENT element, because `render()` rebuilt the row — which is the whole point: focus was
    // restored rather than merely never lost. Asserting only "still a handle" passes with the
    // keyboard path removed, since nothing re-renders and the original node keeps focus.
    expect(after).not.toBe(h);
    expect(after.classList.contains("gradient-handle")).toBe(true);
    key(after, "ArrowRight");
    const second = document.activeElement as HTMLElement;
    expect(second).not.toBe(after);
    expect(second.classList.contains("gradient-handle")).toBe(true);
  });

  it("the value follows the position, so a reader is told where it went", () => {
    // ⚠ The third vacuous one in this file, and the same trap as the two the commit message says it
    // fixed: the fixture ships a stop at t = 1, so a handle reading `aria-valuenow="100"` EXISTS
    // before any key is pressed. Measured — disabling the whole keydown handler with an early
    // `return` turned 4 of 6 red and left this one green. Count, don't find. (Review follow-up C.)
    const { host } = editor();
    const at100 = (): HTMLElement[] =>
      handles(host).filter((h) => h.getAttribute("aria-valuenow") === "100");
    expect(at100(), "one stop starts at the end").toHaveLength(1);

    key(handles(host)[0], "End");
    const moved = at100();
    expect(moved, "and now the moved handle is there too").toHaveLength(2);
    for (const h of moved) expect(h.getAttribute("aria-valuetext")).toBe("100%");
  });
});
