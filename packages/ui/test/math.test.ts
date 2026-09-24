// The typesetting helpers' own contract — moved from Contour Integration with the module (ADR-0047).
// That app's suites pin its uses (the denylist, the spoken forms, the cards); this pins what a second
// consumer relies on.
import { describe, expect, it } from "vitest";
import { patch } from "../src/index.js";
import { math, mathPlain, mathText, renderedCount, splitMath } from "../src/math.js";

describe("math", () => {
  it("typesets once per distinct formula, however often it is described", () => {
    const before = renderedCount();
    const a = math("\\Delta = 2869");
    const b = math("\\Delta = 2869");
    expect(renderedCount()).toBe(before + 1);
    expect(a.props.html).toBe(b.props.html);
    expect(String(a.props.html)).toContain("katex");
  });

  it("names a formula by the plain text the caller supplies, and never by its LaTeX", () => {
    const host = document.createElement("div");
    patch(host, [
      math("x^2", { label: "x squared", key: "a" }),
      math("\\sqrt{2}", { key: "b" }),
    ]);
    const [a, b] = host.children;
    expect(a.getAttribute("aria-label")).toBe("x squared");
    expect(a.getAttribute("role")).toBe("math");
    expect(b.getAttribute("aria-label")).toBeNull();
    expect(host.innerHTML).not.toContain('encoding="application/x-tex"');
  });

  it("splits a sentence on $…$ and leaves the prose alone", () => {
    expect(splitMath("the root $z_1$ is simple")).toEqual([
      "the root ",
      "z_1",
      " is simple",
    ]);
    expect(mathText("a $b$ c")).toHaveLength(3);
    expect(mathPlain("the root $z_1$ is simple")).not.toContain("$");
  });
});
