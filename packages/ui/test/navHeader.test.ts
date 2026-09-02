import { describe, it, expect, afterEach } from "vitest";
import { mountNavHeader } from "../src/navHeader.js";
import { SUITE_APPS, type SuiteApp } from "../src/apps.js";

// jsdom. Asserts the suite nav: a back-to-launcher link, sibling links relative to the deployed layout,
// the current app marked aria-current and unpublished apps shown but not linked, and the optional (U7)
// hand-off picker filtering targets by the caller-supplied accepts().

let host: HTMLElement | null = null;
function container(): HTMLElement {
  host = document.createElement("div");
  document.body.appendChild(host);
  return host;
}
afterEach(() => {
  host?.remove();
  host = null;
});

describe("mountNavHeader", () => {
  it("renders a back-to-launcher link and sibling links", () => {
    const { el } = mountNavHeader(container(), { current: "faber-transform" });
    expect(el.getAttribute("aria-label")).toBe("Suite navigation");
    const home = el.querySelector<HTMLAnchorElement>("a.cas-nav-home");
    expect(home?.getAttribute("href")).toBe("../");
    expect(home?.getAttribute("aria-label")).toBe("Back to the suite launcher");
    // Siblings are ../<id>/ links.
    const cd = Array.from(el.querySelectorAll<HTMLAnchorElement>(".cas-nav-apps a")).find(
      (a) => a.textContent === "Complex Dynamics",
    );
    expect(cd?.getAttribute("href")).toBe("../complex-dynamics/");
  });

  it("marks the current app and does not link it", () => {
    const { el } = mountNavHeader(container(), { current: "riemann-map" });
    const current = el.querySelector('[aria-current="page"]');
    expect(current?.textContent).toBe("Riemann Map");
    expect(current?.tagName).toBe("SPAN");
    const links = Array.from(el.querySelectorAll<HTMLAnchorElement>(".cas-nav-apps a")).map(
      (a) => a.textContent,
    );
    expect(links).not.toContain("Riemann Map");
  });

  it("shows an unpublished (soon) app but does not link it", () => {
    const { el } = mountNavHeader(container(), { current: "complex-dynamics" });
    const disabled = el.querySelector('[aria-disabled="true"]');
    expect(disabled?.textContent).toBe("Correspondences");
    const links = Array.from(el.querySelectorAll<HTMLAnchorElement>(".cas-nav-apps a")).map(
      (a) => a.textContent,
    );
    expect(links).not.toContain("Correspondences");
  });

  it("no hand-off picker is rendered without a handoff config (U0 default)", () => {
    const { el } = mountNavHeader(container(), { current: "complex-dynamics" });
    expect(el.querySelector(".cas-nav-handoff")).toBeNull();
  });

  it("hand-off picker lists only accepted, non-current, non-soon targets (U7 shape)", () => {
    const accept = new Set(["riemann-map", "complex-function-plotter"]);
    const { el } = mountNavHeader(container(), {
      current: "complex-dynamics",
      handoff: {
        accepts: (a: SuiteApp) => accept.has(a.id),
        hrefFor: (a: SuiteApp) => `../${a.id}/#s=demo`,
      },
    });
    const targets = Array.from(
      el.querySelectorAll<HTMLAnchorElement>(".cas-nav-handoff-target"),
    ).map((a) => a.getAttribute("href"));
    expect(targets).toEqual(["../riemann-map/#s=demo", "../complex-function-plotter/#s=demo"]);
  });

  it("SUITE_APPS covers the eleven apps in launcher order", () => {
    expect(SUITE_APPS.map((a) => a.id)).toEqual([
      "complex-dynamics",
      "quadrature-domains",
      "riemann-map",
      "complex-function-plotter",
      "argument-principle",
      "faber-transform",
      "2d-electrostatics",
      "2d-hydrodynamics",
      "hele-shaw-flow",
      "potential-theory",
      "correspondences",
    ]);
    expect(SUITE_APPS.find((a) => a.id === "correspondences")?.soon).toBe(true);
  });
});
