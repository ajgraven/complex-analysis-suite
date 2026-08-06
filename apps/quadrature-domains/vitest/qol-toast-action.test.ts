// @vitest-environment jsdom
//
// Q3 — a destructive action's toast can now host an "Undo" button. The toast was text-only
// (t.textContent = msg), so a delete's recovery affordance was invisible exactly when the user needed it.
// _showToast gained an optional { label, onClick } action; this pins that it renders a clickable button,
// runs onClick, and that a plain toast still renders text only.
import { describe, it, expect, beforeAll } from "vitest";

let QoL: any;
beforeAll(async () => {
  const QD: any = (await import("../app/solvers/solver.mjs")).default;
  await import("../app/core/qol.mjs");   // populates QD.QoL
  QoL = QD.QoL;
});

describe("QoL.toast — an action toast hosts a clickable button (Q3)", () => {
  it("renders the message + an action button, and clicking it fires onClick then dismisses", () => {
    let fired = 0;
    QoL.toast("Deleted 3 node(s)", { action: { label: "Undo", onClick: () => { fired++; } } });
    const toast = document.querySelector(".copy-toast.toast-action");
    expect(toast, "an action toast should render with the toast-action class").toBeTruthy();
    expect(toast!.textContent).toContain("Deleted 3 node(s)");
    const btn = toast!.querySelector("button.copy-toast-action") as HTMLButtonElement | null;
    expect(btn, "the toast should host an action button").toBeTruthy();
    expect(btn!.textContent).toBe("Undo");
    btn!.click();
    expect(fired, "clicking the button runs onClick").toBe(1);
    expect(toast!.classList.contains("fade"), "the toast begins dismissing after the action fires").toBe(true);
  });

  it("a plain toast (no action) renders text only — no button", () => {
    QoL.toast("Copied ✓");
    const plain = [...document.querySelectorAll(".copy-toast")].find((t) => (t.textContent || "").includes("Copied"));
    expect(plain, "a plain toast should render").toBeTruthy();
    expect(plain!.querySelector("button"), "a plain toast must not host a button").toBeNull();
    expect(plain!.classList.contains("toast-action")).toBe(false);
  });
});
