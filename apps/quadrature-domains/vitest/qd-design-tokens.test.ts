// Design-token hygiene for the QD stylesheet.
//
// Eight custom properties (--c-error{,-bg,-text}, --c-info-{bg,text}, --c-link, --c-danger,
// --danger) were REFERENCED but never declared, so every use silently rendered its inline fallback
// and sat outside the token system — unthemeable, and a hard blocker for dark mode.
//
// The inline fallbacks were also how the drift happened: `var(--c-accent, #2b7)` kept a GREEN
// literal at 19 sites long after --c-accent became blue, and --c-border-soft accumulated SEVEN
// different fallbacks. Since every token is declared, a fallback is pure duplication that will
// drift again — so they are gone, and these tests are what makes that safe.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RAW = readFileSync(fileURLToPath(new URL("../app/style.css", import.meta.url)), "utf8");
const CSS = RAW.replace(/\/\*[\s\S]*?\*\//g, "");        // comments mention tokens; scan code only

const declared = (() => {
  const m = /:root\s*\{([\s\S]*?)\}/.exec(CSS);
  expect(m, ":root block must exist").toBeTruthy();
  return new Set([...(m as RegExpExecArray)[1].matchAll(/(--[a-z0-9-]+)\s*:/g)].map((x) => x[1]));
})();
const used = new Set([...CSS.matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map((x) => x[1]));

describe("every referenced custom property is declared", () => {
  it("no var(--x) refers to a token missing from :root", () => {
    expect([...used].filter((t) => !declared.has(t)).sort()).toEqual([]);
  });

  it("all custom properties are declared in :root (nothing scoped elsewhere)", () => {
    // Dropping fallbacks is only safe while :root is the single source. A token declared inside
    // some other selector would resolve to nothing outside it, and now with no fallback to catch it.
    const blocks = [...CSS.matchAll(/([^{}]*)\{([^{}]*)\}/g)];
    const offenders = blocks
      .filter(([, , body]) => /--[a-z0-9-]+\s*:/.test(body))
      .map(([, sel]) => sel.trim().split("\n").pop()!.trim())
      .filter((sel) => sel !== ":root");
    expect(offenders).toEqual([]);
  });
});

describe("no inline fallbacks — they are how the palette drifted", () => {
  it("var(--x, …) does not appear", () => {
    const withFallback = [...CSS.matchAll(/var\(\s*(--[a-z0-9-]+)\s*,([^)]*)\)/g)]
      .map((m) => `var(${m[1]},${m[2]})`);
    expect(withFallback).toEqual([]);
  });
});

describe("semantically opposite states are visually distinct", () => {
  const colorOf = (token: string) => {
    const m = new RegExp(token + "\\s*:\\s*([^;]+);").exec(CSS);
    return m ? m[1].trim().toLowerCase() : null;
  };
  const ruleColor = (selector: string) => {
    const m = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{([^}]*)\\}").exec(CSS);
    if (!m) return null;
    const c = /color\s*:\s*var\(\s*(--[a-z0-9-]+)\s*\)/.exec(m[1]);
    return c ? colorOf(c[1]) : null;
  };

  // `real` and `imaginary` are opposite assumptions about a variable. The real chip was written as
  // var(--c-accent, #1a7f37) — a GREEN fallback, i.e. green-for-real was the intent — and turned
  // blue when --c-accent was introduced as a blue, colliding with the imaginary chip's blue.
  it("the real and imaginary hypothesis chips are not the same colour", () => {
    const real = ruleColor("#controls-algebra .algebra-hyp-chip.h-real");
    const imag = ruleColor("#controls-algebra .algebra-hyp-chip.h-imag");
    expect(real).toBeTruthy();
    expect(imag).toBeTruthy();
    expect(real).not.toBe(imag);
  });

  it("the five rigor levels keep distinct colours (honest-labeling legibility)", () => {
    // Guarded in algebra-rigor-badge.test.ts against rigorMeta; asserted here so a palette edit
    // cannot quietly collapse two of them either.
    const levels = ["--c-ok", "--c-warn", "--c-err", "--c-accent", "--c-muted"];
    const cols = levels.map(colorOf);
    expect(cols.every(Boolean)).toBe(true);
    expect(new Set(cols).size).toBe(levels.length);
  });
});
