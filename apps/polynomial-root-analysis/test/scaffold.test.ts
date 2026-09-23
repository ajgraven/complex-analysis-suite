// @vitest-environment jsdom
//
// PRA-0's gate test: the scaffold mounts inside the fatal boundary, and the page carries M6.4's
// structural invariants from its first commit — one `<main>`, one `<h1>`, every canvas named — which
// are asserted here because the a11y CI job does not block.
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountScaffold, NOTICE, PANES } from "../src/shell/scaffold.js";

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function host(): HTMLElement {
  const el = document.createElement("div");
  el.id = "app";
  document.body.append(el);
  return el;
}

describe("mountScaffold", () => {
  it("builds one <main> and one <h1>, and says nothing is computed", () => {
    const s = mountScaffold(host());
    expect(document.querySelectorAll("main")).toHaveLength(1);
    const h1s = document.querySelectorAll("h1");
    expect(h1s).toHaveLength(1);
    expect(h1s[0]?.textContent).toBe("Polynomial Root Analysis");
    expect(s.main.querySelector(".notice")?.textContent).toBe(NOTICE);
  });

  it("names every canvas as a static image and titles each pane by its own heading", () => {
    const s = mountScaffold(host());
    const canvases = document.querySelectorAll("canvas");
    expect(canvases).toHaveLength(PANES.length);
    const panes = [s.roots, s.coefficients];
    PANES.forEach((spec, i) => {
      const p = panes[i];
      expect(p?.section.dataset.pane).toBe(spec.id);
      expect(p?.canvas.getAttribute("role")).toBe("img");
      expect(p?.canvas.getAttribute("aria-label")).toBe(spec.label);
      // A static image is not a tab stop: a focusable canvas with nothing to operate is exactly the
      // unnamed-control trap the accessibility-tree walk exists to catch.
      expect(p?.canvas.hasAttribute("tabindex")).toBe(false);
      const labelledBy = p?.section.getAttribute("aria-labelledby") ?? "";
      expect(document.getElementById(labelledBy)?.textContent).toBe(spec.heading);
    });
  });

  it("puts every canvas inside the landmark and replaces, rather than appends to, the host", () => {
    const el = host();
    mountScaffold(el);
    const s = mountScaffold(el);
    expect(document.querySelectorAll("main")).toHaveLength(1);
    expect(document.querySelectorAll("canvas")).toHaveLength(PANES.length);
    for (const c of document.querySelectorAll("canvas"))
      expect(s.main.contains(c)).toBe(true);
  });
});

describe("main.ts inside the fatal boundary", () => {
  it("mounts into #app and removes the boot overlay", async () => {
    const boot = document.createElement("div");
    boot.id = "boot-loading";
    document.body.append(boot);
    host();
    vi.resetModules();
    await import("../src/main.js");
    expect(document.querySelectorAll("main")).toHaveLength(1);
    expect(document.getElementById("boot-loading")).toBeNull();
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  it("turns a missing host into a banner, not a blank page", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.resetModules();
    await import("../src/main.js");
    expect(document.querySelector("main")).toBeNull();
    const banner = document.querySelector('[role="alert"]');
    expect(banner?.textContent).toMatch(/Something went wrong/);
  });
});
