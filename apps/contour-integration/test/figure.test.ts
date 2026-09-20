// The exported figure's arithmetic and its wording — the halves that need no canvas.
//
// `test/figureInk.browser.test.ts` covers the drawing, because a 2-D context is the one thing jsdom
// does not have; the split is `ui/accumulator.ts`'s, whose frame fit is a node test and whose ink is
// a Chromium one.
import { describe, expect, it } from "vitest";
import { assembleVerdict, refuse } from "@cas/rigor";
import { PNG_SIGNATURE, injectPngText, pngChunk, readPngText } from "@cas/export";
import { FIGURE_THEMES, figureCaption, figureLayout, figureMetadata } from "../src/shell/figure.js";
import { compile, defaultState, offeredCorpus, resolveState, type ShellState } from "../src/shell/state.js";
import { TEMPLATES } from "../src/shell/templates.js";
import { decodeShell, encodeShell } from "../src/shell/viewState.js";
import type { ContourIntegral } from "../src/engine/contour/integrate.js";

const base = (): ShellState => defaultState(TEMPLATES[0].build());

describe("the plate's layout", () => {
  it("puts the accumulator at the STAGE's width, not its own", () => {
    // On screen the accumulator is 744 px wide against the stage's 1048 — its side panel takes the
    // rest of the strip — so stacking the two at their own sizes would leave a ragged right edge and
    // imply the trail stops early.
    const l = figureLayout({ w: 1048, h: 564 }, { w: 744, h: 255 });
    expect(l.stage.w).toBe(1048);
    expect(l.accumulator.w).toBe(1048);
    // And its own aspect ratio is kept: 255/744 of the new width.
    expect(l.accumulator.h).toBe(Math.round(255 * (1048 / 744)));
  });

  it("is the same figure at every scale, to rounding", () => {
    const one = figureLayout({ w: 1048, h: 564 }, { w: 744, h: 255 }, 1);
    const three = figureLayout({ w: 1048, h: 564 }, { w: 744, h: 255 }, 3);
    expect(three.width / one.width).toBeCloseTo(3, 1);
    expect(three.height / one.height).toBeCloseTo(3, 1);
    // The caption scales with it, or a 3× plate would carry unreadably small type.
    expect(three.captionFont / one.captionFont).toBeCloseTo(3, 0);
  });

  it("leaves room for all three lines of caption, and nothing overlaps", () => {
    const l = figureLayout({ w: 1048, h: 564 }, { w: 744, h: 255 });
    expect(l.stage.y + l.stage.h).toBeLessThanOrEqual(l.accumulator.y);
    expect(l.accumulator.y + l.accumulator.h).toBeLessThanOrEqual(l.caption.y);
    expect(l.caption.y + l.caption.h).toBeLessThanOrEqual(l.height);
    // Three lines at 1.5 / 1.85 line steps from the font size have to fit the caption band.
    expect(l.caption.h).toBeGreaterThan(l.captionFont * 4);
  });

  it("survives a degenerate canvas rather than dividing by zero", () => {
    const l = figureLayout({ w: 0, h: 0 }, { w: 0, h: 0 });
    expect(Number.isFinite(l.width)).toBe(true);
    expect(Number.isFinite(l.height)).toBe(true);
    expect(l.accumulator.h).toBeGreaterThan(0);
  });
});

/** A minimal integral, since the caption reads only two of its fields plus the ledger. */
const integralWith = (verdict: ContourIntegral["verdict"], refusal?: string): ContourIntegral =>
  ({
    verdict,
    value: [1.5, -2.5] as const,
    pieces: [],
    windings: [],
    closed: true,
    ...(refusal === undefined ? {} : { refusal }),
  }) as unknown as ContourIntegral;

describe("the plate's caption", () => {
  it("prints ⚠ Refused and NO NUMBER when the app withholds one", () => {
    // The whole reason `integralRefusal` was lifted out of the result card: a caption that
    // re-derived the question would be one edit away from printing a number on a shareable image
    // that the app itself refuses to show.
    const c = figureCaption({
      title: "t",
      integral: integralWith(assembleVerdict([refuse("nope", "because")]), "the quadrature refused"),
      theorem: null,
      ledger: null,
      solved: null,
    });
    expect(c.value).toBe("⚠ Refused");
    expect(c.value).not.toMatch(/[0-9]/);
    expect(c.level).toBe("⚠");
  });

  it("prints NO NUMBER when there is no quadrature to print one from", () => {
    // **The caption used to read `≈ 0.0000000 + 0.0000000i` here**, from an `integral.value ?? [0, 0]`
    // — a fabricated second opinion, on a shareable image, agreeing with nothing. The result card
    // already states the rule in as many words; the caption now does too. (Found by review, and then
    // by a mutation sweep, which is the order that tells you the test was missing rather than wrong.)
    const noValue = {
      verdict: assembleVerdict([]),
      pieces: [],
      windings: [],
      closed: true,
      quadratureSkipped: "a cut runs vertically through a piece, so no side pins a limit",
    } as unknown as ContourIntegral;
    const c = figureCaption({ title: "t", integral: noValue, theorem: null, ledger: null, solved: null });
    expect(c.value).toBe("no quadrature to report");
    expect(c.value).not.toMatch(/[0-9]/);
    // And the reason travels with it, rather than a headline about a number that was never computed.
    expect(c.verdict).toContain("vertically");
  });

  it("says so when there is no integrand at all", () => {
    const c = figureCaption({ title: "t", integral: null, theorem: null, ledger: null, solved: null });
    expect(c.value).toBe("no integrand");
    expect(c.verdict).toContain("Nothing");
  });
});

describe("the plate's metadata", () => {
  it("carries `Software`, the permalink under @cas/export's DOCUMENTED key, and the verdict", () => {
    const meta = figureMetadata("https://example/#vs=abc", {
      title: "t", value: "= 2πi", verdict: "The argument is complete.", level: "=",
    });
    expect(meta.Software).toContain("Contour Integration");
    // `cas:state`, which the package's README and its own tests specify. Of its six consumers only
    // Riemann Map uses it; the other four minted their own prefix before the package existed.
    expect(meta["cas:state"]).toBe("https://example/#vs=abc");
    expect(meta["cas:verdict"]).toBe("= The argument is complete.");
    expect(meta["cas:value"]).toBe("= 2πi");
  });

  it("omits the permalink rather than inventing one when the state cannot be linked to", () => {
    const meta = figureMetadata(null, { title: "t", value: "⚠ Refused", verdict: "x", level: "⚠" });
    expect("cas:state" in meta).toBe(false);
    // The verdict is still there: a figure with no link must still say what it claims.
    expect(meta["cas:verdict"]).toBe("⚠ x");
  });
});

describe("the gate: a figure's metadata agrees with the session it came from", () => {
  it("for every record — the caption's level is the verdict the engine computed", () => {
    const families = offeredCorpus().tiers.flatMap((t) => t.families);
    expect(families).toHaveLength(28);
    for (const fam of families) {
      const state: ShellState = { ...base(), mode: "gallery", record: fam.id, fixture: 0 };
      const res = resolveState(state, null);
      if (res.kind !== "gallery" || res.run === null) continue;
      const caption = figureCaption({
        title: fam.id,
        integral: res.run.integral,
        theorem: res.run.theorem,
        ledger: res.run.ledger,
        solved: res.solved,
      });
      const meta = figureMetadata(null, caption);

      // **The claim: the stamped verdict is the ledger's own, not a restatement.** A figure whose
      // metadata said `=` where the ledger said `⚠` is exactly the dishonesty this key exists to
      // prevent, and it is the half of M6.3's gate that needs no browser.
      const closes = res.run.ledger.closes;
      expect(meta["cas:verdict"], fam.id).toContain(
        closes ? "The argument is complete." : "does not close",
      );
      if (closes) {
        // And when it closes, the value printed is the one the app prints: the solved form for a
        // record that has one, never a decimal standing in for it.
        expect(meta["cas:value"], fam.id).toContain(res.solved?.text ?? "∮");
      }
    }
  });

  it("round-trips: the stamped permalink decodes and re-runs to the SAME caption", () => {
    // M6.3's gate, minus the PNG bytes (which the browser suite carries): stamp → decode → re-run →
    // the same verdict. The decode lands in a FRESH default, per M6.1's finding.
    for (const id of ["circle-linear-cos", "log-cubed-keyhole", "series-cot-kernel", "wedge-fresnel"]) {
      const before: ShellState = { ...base(), mode: "gallery", record: id, fixture: 0 };
      const res = resolveState(before, null);
      if (res.kind !== "gallery" || res.run === null) throw new Error(`${id} did not run`);
      const caption = figureCaption({
        title: id, integral: res.run.integral, theorem: res.run.theorem,
        ledger: res.run.ledger, solved: res.solved,
      });
      const enc = encodeShell(before);
      expect(enc.ok, id).toBe(true);
      if (!enc.ok) continue;
      const meta = figureMetadata(`https://example/${enc.hash}`, caption);

      const link = meta["cas:state"].slice("https://example/".length);
      const dec = decodeAndCaption(link, id);
      expect(dec, id).toEqual({ value: caption.value, verdict: caption.verdict, level: caption.level });
      expect(meta["cas:verdict"], id).toBe(`${caption.level} ${caption.verdict}`);
    }
  });
});

/** Decode a permalink, re-run it from scratch, and caption the result. */
function decodeAndCaption(hash: string, title: string): { value: string; verdict: string; level: string } {
  const dec = decodeShellSync(hash);
  const res = resolveState(dec, dec.mode === "sandbox" ? compile(dec.expr) : null);
  if (res.kind !== "gallery" || res.run === null) throw new Error("re-run failed");
  const c = figureCaption({
    title, integral: res.run.integral, theorem: res.run.theorem, ledger: res.run.ledger, solved: res.solved,
  });
  return { value: c.value, verdict: c.verdict, level: c.level };
}

function decodeShellSync(hash: string): ShellState {
  const r = decodeShell(hash);
  if (r === null || !r.ok) throw new Error("decode refused");
  return r.state;
}

describe("the metadata survives the PNG", () => {
  /** A structurally-walkable PNG, so the round trip can be tested without a canvas. */
  function makePng(): Uint8Array {
    const parts = [
      PNG_SIGNATURE,
      pngChunk("IHDR", Uint8Array.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0])),
      pngChunk("IDAT", Uint8Array.from([1, 2, 3])),
      pngChunk("IEND", new Uint8Array(0)),
    ];
    const out = new Uint8Array(parts.reduce((n, q) => n + q.length, 0));
    let off = 0;
    for (const q of parts) { out.set(q, off); off += q.length; }
    return out;
  }

  it("carries EVERY record's caption through the PNG intact, mathematics and all", () => {
    // **This is the guard for a defect that shipped in six apps.** PNG `tEXt` is Latin-1, so before
    // `@cas/export` grew `iTXt` the em-dash in `Software` became `?` and `= 2π√3/3` became
    // `= 2??3/3` — the mathematical content of the one field whose job is to say what the figure
    // claims. Asserted over the whole corpus, because the symbols vary by record: `π`, `√`, `∮`,
    // `Σ`, `⁻`, `ₖ`, `≈`, `⚠`.
    const families = offeredCorpus().tiers.flatMap((t) => t.families);
    let withMaths = 0;
    for (const fam of families) {
      const res = resolveState({ ...base(), mode: "gallery", record: fam.id, fixture: 0 }, null);
      if (res.kind !== "gallery" || res.run === null) continue;
      const meta = figureMetadata("https://example/#vs=abc", figureCaption({
        title: fam.id, integral: res.run.integral, theorem: res.run.theorem,
        ledger: res.run.ledger, solved: res.solved,
      }));
      expect(readPngText(injectPngText(makePng(), meta)), fam.id).toEqual(meta);
      if ([...Object.values(meta).join("")].some((c) => (c.codePointAt(0) ?? 0) > 255)) withMaths += 1;
    }
    // And the guard is not vacuous: most records' metadata genuinely needs more than Latin-1.
    expect(withMaths).toBeGreaterThan(20);
  });
});

describe("the three plates", () => {
  /** WCAG's relative luminance, and its contrast ratio. The one arithmetic a palette claim needs. */
  const luminance = (hex: string): number => {
    const n = Number.parseInt(hex.replace("#", ""), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const contrast = (a: string, b: string): number => {
    const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };

  it("captions each plate in ink its own ground can carry", () => {
    // **The dark plate reads its colours off the shell's computed style and the other two cannot**:
    // a light plate captioned in `--g-text` is near-white text on paper. These are the palettes that
    // replace them, and the claim about them is the one a palette can be wrong about — WCAG AA for
    // the value line, and the 3:1 a secondary line needs to stay legible.
    for (const [name, t] of Object.entries(FIGURE_THEMES)) {
      expect(contrast(t.text, t.background), `${name}: the caption's value line`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.muted, t.background), `${name}: the caption's title and verdict`).toBeGreaterThanOrEqual(3);
    }
  });

  it("stamps which plate it is, and defaults to the one the reader is looking at", () => {
    const caption = { title: "t", value: "= 2πi", verdict: "v", level: "=" } as const;
    expect(figureMetadata(null, caption)["cas:theme"]).toBe("dark");
    expect(figureMetadata(null, caption, "light")["cas:theme"]).toBe("light");
    expect(figureMetadata(null, caption, "print")["cas:theme"]).toBe("print");
    // Everything else is the plate's argument, not its treatment, so it does not move.
    const without = (plate: "dark" | "print"): Record<string, string> => {
      const all = { ...figureMetadata("https://e/#vs=a", caption, plate) };
      delete all["cas:theme"];
      return all;
    };
    expect(without("print")).toEqual(without("dark"));
  });
});
