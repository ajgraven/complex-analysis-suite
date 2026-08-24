import { describe, it, expect, beforeEach } from "vitest";
import { runWithFatalBoundary, showFatalBanner } from "../src/fatalBoundary.js";

// jsdom. Asserts CD's boundary behavior: boot overlay always removed; a throw shows a role=alert banner
// with WebGL2-aware copy; a missing banner element is created (the newest apps have none).

beforeEach(() => {
  document.body.innerHTML = "";
});

function withBoot(): HTMLElement {
  const boot = document.createElement("div");
  boot.id = "boot-loading";
  document.body.appendChild(boot);
  return boot;
}

describe("runWithFatalBoundary", () => {
  it("removes the boot overlay on success and leaves no banner", () => {
    withBoot();
    let ran = false;
    runWithFatalBoundary(() => {
      ran = true;
    });
    expect(ran).toBe(true);
    expect(document.getElementById("boot-loading")).toBeNull();
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  it("on a generic throw: creates a role=alert banner, generic copy, boot removed", () => {
    withBoot();
    runWithFatalBoundary(
      () => {
        throw new Error("kaboom");
      },
      { onError: () => {} },
    );
    const banner = document.getElementById("app-error");
    expect(banner?.getAttribute("role")).toBe("alert");
    expect(banner?.hidden).toBe(false);
    expect(banner?.textContent).toMatch(/Something went wrong/i);
    expect(document.getElementById("boot-loading")).toBeNull();
  });

  it("detects a WebGL2 failure and shows tailored copy", () => {
    runWithFatalBoundary(
      () => {
        throw new Error("WebGL2 is not available");
      },
      { onError: () => {} },
    );
    expect(document.getElementById("app-error")?.textContent).toMatch(/WebGL2/);
  });

  it("awaits an async init and shows the banner on rejection", async () => {
    withBoot();
    runWithFatalBoundary(() => Promise.reject(new Error("late failure")), { onError: () => {} });
    // Let the rejection microtask settle.
    await Promise.resolve();
    await Promise.resolve();
    expect(document.getElementById("app-error")?.textContent).toMatch(/Something went wrong/i);
    expect(document.getElementById("boot-loading")).toBeNull();
  });

  it("showFatalBanner reuses an existing banner element", () => {
    const existing = document.createElement("div");
    existing.id = "app-error";
    existing.hidden = true;
    document.body.appendChild(existing);
    showFatalBanner("hello");
    expect(document.querySelectorAll("#app-error")).toHaveLength(1);
    expect(existing.textContent).toBe("hello");
    expect(existing.hidden).toBe(false);
  });

  it("forces a CSS-hidden banner visible (the plotter's #error is visibility:hidden)", () => {
    // Clearing the `hidden` attribute alone can't override a stylesheet `visibility:hidden` — so a fatal
    // banner would stay invisible. showFatalBanner must set inline visibility.
    const banner = document.createElement("div");
    banner.id = "error";
    banner.style.visibility = "hidden"; // stands in for the app's CSS rule
    document.body.appendChild(banner);
    showFatalBanner("boom", { bannerId: "error" });
    expect(banner.style.visibility).toBe("visible");
    expect(banner.textContent).toBe("boom");
  });
});
