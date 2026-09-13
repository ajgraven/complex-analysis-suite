// @vitest-environment jsdom
// **THE FIRST TEST THAT REACHES `src/shell/app.ts`.**
//
// 2,500 lines of it had no test at all, which is not an oversight so much as a consequence: the
// stage is WebGL2, so the only way in looked like the browser suite. It is not. `mountApp` builds
// its stage inside a `try`, the fatal boundary catches WebGL2's absence, and everything else — the
// bar, the rail's seven cards, the strip, and every handler on them — is ordinary DOM that jsdom
// runs perfectly well. jsdom has no canvas either, so `getContext` is stubbed to `null` up front
// and the drawing code takes the guarded path it already has for a context it could not get.
//
// What that buys is a test over the app as a USER reaches it: set the box, fire `change`, click the
// template, read the rail. No seam between what is asserted and what is shown.
import { describe, expect, it } from "vitest";
import { mountApp } from "../src/shell/app.js";

/** Mount a fresh app. jsdom has no canvas, and the shell already handles not getting a context. */
export function mount(): HTMLElement {
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  mountApp(root);
  return root;
}

const q = <T extends Element>(root: Element, sel: string): T => {
  const e = root.querySelector<T>(sel);
  if (e === null) throw new Error(`no ${sel}`);
  return e;
};
const byLabel = <T extends Element>(root: Element, label: string): T =>
  q<T>(root, `[aria-label="${label}"]`);
const fire = (e: Element, kind: string): void => {
  e.dispatchEvent(new Event(kind, { bubbles: true }));
};
function clickIn(host: Element, text: string): void {
  const b = [...host.querySelectorAll("button")].find((x) => x.textContent === text);
  if (b === undefined) {
    throw new Error(`no "${text}": ${[...host.querySelectorAll("button")].map((x) => x.textContent).join(" | ")}`);
  }
  b.click();
}
/** The CONTOUR card's template picker — the first `.presets` in the rail, before the branch card's. */
const templates = (root: Element): HTMLElement => q(root, ".rail .presets");
/** What a reader can actually see: hidden cards contribute nothing, as on screen. */
const visibleText = (root: Element, sel: string): string =>
  [...root.querySelectorAll<HTMLElement>(`${sel} > *`)]
    .filter((e) => !e.hidden)
    .map((e) => e.textContent ?? "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

/** Type an integrand, pick the keyhole, and declare a factor on the point it seeds. */
function declaredKeyhole(root: Element): void {
  const input = byLabel<HTMLInputElement>(root, "integrand f(z)");
  input.value = "1/(1+z)";
  fire(input, "change");
  clickIn(templates(root), "keyhole");
  const declare = [...root.querySelectorAll<HTMLButtonElement>(".declaration button")].find((b) =>
    (b.textContent ?? "").startsWith("declare a factor on"));
  if (declare === undefined) throw new Error("no declare button");
  declare.click();
}

describe("the argument window", () => {
  // **The declaration used to VANISH when the window changed**, and nothing in the app said so.
  // `buildDeclaration`'s canonical system carries the point id `"b"` while the reader's is `"b1"`,
  // and the shell adopted that system wholesale — so `declaredOrder()` went null, the card reverted
  // to "declare a factor on …", and the integrand box went on holding the COFACTOR under its
  // `R(z) =` label. The app then integrated `R(z)` as the whole integrand and printed a plausible
  // number beside it: the same defect the "undeclare" button exists to prevent, through a different
  // door. It also meant M5.1c's own demonstration — switch to the principal window and watch
  // LEGALITY refuse — did not happen at all.
  it("keeps the declared factor when the determination changes", () => {
    const root = mount();
    declaredKeyhole(root);
    expect(visibleText(root, ".rail")).toContain("Declared factor");

    const window = byLabel<HTMLSelectElement>(root, "argument window of the declared factor");
    window.value = [...window.options][1].value;
    fire(window, "change");

    const rail = visibleText(root, ".rail");
    expect(rail).toContain("Declared factor");
    expect(rail).not.toContain("declare a factor on");
    // The box still holds the cofactor, and its label still says so — which is only honest while
    // the factor is still declared.
    expect(byLabel<HTMLInputElement>(root, "rational cofactor R(z)").value).toBe("1/(1+z)");
  });

  it("moves the cut, so LEGALITY refuses and no ∮ is printed", () => {
    const root = mount();
    declaredKeyhole(root);
    // The keyhole's determination: the cut is on ℝ₊, down the middle of the two lips, and the
    // argument closes.
    expect(visibleText(root, ".rail")).not.toContain("⚠ Refused");

    const window = byLabel<HTMLSelectElement>(root, "argument window of the declared factor");
    window.value = [...window.options][1].value;
    fire(window, "change");

    // Principal: the cut swings onto ℝ₋, straight through the R → ∞ circle, which declares no side.
    const rail = visibleText(root, ".rail");
    expect(rail).toContain("crosses the cut");
    expect(rail).toContain("without declaring which side it runs on");
    expect(rail).toContain("⚠ Refused");
    // **AND the factor is still declared**, which is the half a mutation sweep says this test needs.
    // The pre-fix app ALSO refused here — its orphaned cut still crossed the circle — so a refusal
    // on its own passes for the wrong reason. The claim is that the determination the reader chose
    // moved the cut, not that something somewhere is broken.
    expect(rail).toContain("Declared factor");
  });
});
