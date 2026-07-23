// Tier 6 — the deferred infrastructure items: the busy-lock's drift (5.9), the sub-AA muted
// token (5.5), and export identity (5.8). Dark mode (5.2) is deliberately out of scope.
//
// Node environment, source-only: jsdom breaks fileURLToPath via import.meta.url.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const UI = readFileSync(
  fileURLToPath(new URL("../app/algebra/algebra-ui.mjs", import.meta.url)), "utf8");
const CSS = readFileSync(
  fileURLToPath(new URL("../app/style.css", import.meta.url)), "utf8");
const CODE = UI
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/(^|[^:])\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, " "));

/** WCAG relative luminance / contrast, so the threshold is computed rather than asserted. */
const rgb = (h: string) => {
  const x = h.replace("#", "");
  const f = x.length === 3 ? x.split("").map((c) => c + c).join("") : x;
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16));
};
const lum = (c: number[]) => {
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [la, lb] = [lum(rgb(a)), lum(rgb(b))];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};
const token = (name: string) => {
  const m = CSS.match(new RegExp("--" + name + ":\\s*(#[0-9a-fA-F]{3,6});"));
  expect(m, "--" + name + " not declared").toBeTruthy();
  return (m as RegExpMatchArray)[1];
};

describe("5.5 — the muted token clears WCAG AA", () => {
  it("is readable on both surfaces it is used against", () => {
    // It carries most of the app's explanatory prose plus the algebra status line, at 11px (70%
    // inside #controls-algebra) — normal text, so AA is 4.5:1, not the 3:1 large-text allowance.
    const muted = token("c-muted");
    expect(ratio(muted, token("c-surface"))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(muted, token("c-bg"))).toBeGreaterThanOrEqual(4.5);
  });

  it("the darker readouts token stays at least as readable", () => {
    // --c-muted-2 is the deliberately-stronger sibling; if muted ever overtook it the pair would
    // have swapped meaning.
    expect(ratio(token("c-muted-2"), token("c-surface")))
      .toBeGreaterThanOrEqual(ratio(token("c-muted"), token("c-surface")));
  });
});

describe("5.9 — the busy lock cannot drift", () => {
  it("setBusy selects by marker class, not a hand-maintained id array", () => {
    // The array sat ~700 lines from the buttons it named. The marker now sits on the control.
    expect(CODE).toMatch(/querySelectorAll\('\.js-busy-lock'\)/);
    expect(CODE, "the id array should be gone").not.toMatch(/'alg-prove',\s*'alg-groebner'/);
  });

  it("the two controls that had drifted out are locked", () => {
    // Both RE-SEED. Neither was in the array nor self-guarded, so either could drop a fresh system
    // on top of an in-flight worker derivation — the exact thing this lock exists to prevent.
    for (const id of ["alg-seed-moment", "alg-w0-fix"]) {
      const tag = UI.match(new RegExp('<[a-z]+[^>]*id="' + id + '"[^>]*>'))
                || UI.match(new RegExp('<[a-z]+[^>]*class="[^"]*"[^>]*id="' + id + '"[^>]*>'));
      expect(tag, id + " not found in the markup").toBeTruthy();
      expect((tag as RegExpMatchArray)[0], id + " must carry js-busy-lock").toMatch(/js-busy-lock/);
    }
  });

  it("every heavy (worker-backed) control is locked", () => {
    // heavy-op means it starts a worker; a second run must not be startable. This is the derivable
    // half of the invariant — the non-heavy mutators still need marking by hand.
    //
    // It earned its keep immediately: alg-import-rctd was heavy and unlocked. It self-guards via
    // busyGuard(), so it was not silently broken — but it was the one heavy control whose
    // unavailability you discovered by clicking rather than by seeing. Marked; the runtime guard
    // stays as the backstop that dynamically-created controls still depend on.
    for (const m of UI.matchAll(/<[a-z]+\b[^>]*class="([^"]*heavy-op[^"]*)"[^>]*>/g)) {
      expect(m[1], "a heavy-op control is missing js-busy-lock: " + m[0].slice(0, 80))
        .toMatch(/js-busy-lock/);
    }
  });

  it("the dynamically-created locked controls get the marker too", () => {
    // These are rebuilt on render, so they cannot be marked in the static markup.
    expect(CODE).toMatch(/elimBtn\.classList\.add\('js-busy-lock'\)/);
    expect(CODE).toMatch(/gbBtn\.classList\.add\('js-busy-lock'\)/);
    expect(CODE).toMatch(/b\.classList\.add\('js-busy-lock'\)/);   // the toolbar factory (undo/redo)
  });
});

describe("5.9 addendum — Undo cannot be re-enabled mid-operation", () => {
  // Two writers own alg-undo/alg-redo's `disabled`: setBusy (via .js-busy-lock) and
  // refreshUndoButtons (from undo depth). doAutoSolve calls rerender() — hence refreshUndoButtons —
  // several times INSIDE the busy window, and each call used to flip Undo back on because
  // undoDepth() was already > 0. Clicking it then rolled the graph back under a pending worker,
  // whose result rendered as a verdict about a system that no longer existed. Verified in-browser:
  // across the whole auto-solve window Undo now stays disabled.
  it("refreshUndoButtons honours _busy", () => {
    // Asserted against raw UI, not comment-blanked CODE: the exact strings below appear only in the
    // function body (no comment contains `u.disabled = _busy`), and the multi-line rationale comment
    // above the function confuses CODE's line-based blanking.
    expect(UI).toMatch(/u\.disabled = _busy \|\| !ud/);
    expect(UI).toMatch(/r\.disabled = _busy \|\| !rd/);
  });

  it("the toolbar undo/redo handlers busyGuard, matching the keyboard path", () => {
    // Belt and braces: even if a mid-op repaint momentarily clears `disabled`, the handler refuses.
    const undo = CODE.slice(CODE.indexOf("'Undo (Ctrl+Z)'"), CODE.indexOf("'Undo (Ctrl+Z)'") + 160);
    expect(undo).toMatch(/busyGuard\(\)/);
    const redo = CODE.slice(CODE.indexOf("'Redo (Ctrl+Shift+Z)'"), CODE.indexOf("'Redo (Ctrl+Shift+Z)'") + 160);
    expect(redo).toMatch(/busyGuard\(\)/);
  });
});

describe("5.8 — exports carry an identity", () => {
  it("the DAG download and the proof export are both stamped", () => {
    expect(CODE).toMatch(/session: exportStamp\(\)/);
    const stamped = [...CODE.matchAll(/session: exportStamp\(\)/g)];
    expect(stamped.length, "both exports should be stamped").toBe(2);
  });

  it("the stamp identifies the sitting, the moment, and the source solve", () => {
    const body = CODE.slice(CODE.indexOf("function exportStamp()"), CODE.indexOf("function exportJson()"));
    expect(body).toMatch(/sessionId/);
    expect(body).toMatch(/exportedAt/);
    expect(body).toMatch(/mode/);
    expect(body).toMatch(/poles/);
  });

  it("the source is null rather than invented when nothing was solved", () => {
    // Reporting a mode with no h-data behind it would be a fabricated provenance line — worse than
    // an absent one, because it reads as a fact about a solve that never happened.
    const body = CODE.slice(CODE.indexOf("function exportStamp()"), CODE.indexOf("function exportJson()"));
    expect(body).toMatch(/hd \?/);
    expect(body).toMatch(/:\s*null/);
  });
});
