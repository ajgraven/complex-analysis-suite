import { describe, it, expect } from "vitest";
import indexHtml from "../index.html?raw";
import { encodeState, decodeState, SHARE_IDS, type AppState } from "../src/state/appState";

describe("app-state permalink codec", () => {
  it("round-trips a state object", () => {
    const state: AppState = {
      inpf: "z^2+c",
      inpc: "-.7-.4*i",
      inpparamcenter: "-0.75,0",
      inpparamzoom: "0.75",
      mode: "smooth",
      aa: "2",
      light: true,
      perturbation: false,
      "param-a": "1.5",
    };
    expect(decodeState(encodeState(state))).toEqual(state);
  });

  it("handles unicode and expression characters", () => {
    const state: AppState = { inpf: "z²+c — café", inpme: "abs(z)>2" };
    expect(decodeState(encodeState(state))).toEqual(state);
  });

  it("returns null on corrupt or empty input", () => {
    expect(decodeState("")).toBeNull();
    expect(decodeState("@@@not-base64@@@")).toBeNull();
  });

  it("rejects valid base64 of non-object JSON (array / primitive / null)", () => {
    // typeof [] === "object", so an array must be explicitly rejected.
    expect(decodeState(encodeState([1, 2, 3] as unknown as AppState))).toBeNull();
    expect(decodeState(encodeState(42 as unknown as AppState))).toBeNull();
    expect(decodeState(encodeState("hi" as unknown as AppState))).toBeNull();
    expect(decodeState(encodeState(null as unknown as AppState))).toBeNull();
  });
});

describe("SHARE_IDS DOM coverage", () => {
  // Guards that every serialized control (permalink / saved view / undo) has a real
  // element — so adding an id to SHARE_IDS without a matching control fails CI.
  it("every SHARE_IDS id exists in index.html", () => {
    const missing = SHARE_IDS.filter((id) => !indexHtml.includes(`id="${id}"`));
    expect(missing).toEqual([]);
  });

  // …and the FORWARD direction, which is the one that actually drifts. CONTRIBUTING.md's live-control
  // rule says a new toggle / select / slider must be added to SHARE_IDS so permalinks, saved views and
  // undo round-trip it; nothing enforced that, and ten controls had accumulated outside the list
  // (cd-shell-07). Every control in the markup must now be either shared or explicitly opted out here,
  // so forgetting shows up as a failure naming the id rather than as a silently degraded share link.
  const NOT_SHARED: Record<string, string> = Object.fromEntries(
    (
      [
        // Persisted UI preferences — deliberately per-device, not per-view. Sharing them would let a
        // link re-open someone else's sidebar and badge settings.
        [["suggestions", "legend-toggle", "bla-toggle", "orbit-preview-toggle"], "persisted pref"],
        // Export settings: properties of the file you are about to write, not of the view.
        [
          [
            "paramExportSize",
            "dynExportSize",
            "paramExportOverlay",
            "dynExportOverlay",
            "paramExportScaleBar",
            "dynExportScaleBar",
            "mImageName",
            "jImageName",
            // σ PNG export (S5-A1): size + which overlays to bake into the file — file properties, not the view.
            "schwarz-export-size",
            "schwarz-export-scalebar",
            "schwarz-export-orbit",
            // σ export file name (D2): the name of the file you're about to write, not part of the view.
            "schwarz-export-name",
          ],
          "export setting",
        ],
        // Riemann-sphere view: documented MVP exclusion (the 3D camera is not serialized).
        [["sphere-param", "sphere-dyn", "sphere-light"], "sphere MVP exclusion"],
        // Inputs to a one-shot tool: they parameterise a button press, and the RESULT is what the
        // view carries. Re-running the tool on load would be a side effect, not a restored view.
        [
          [
            "component-period",
            "misiur-per",
            "misiur-pre",
            "addr-angle",
            "strip-address",
            "spider-angle",
            "siegel-theta",
            "note-text",
            "view-name",
            "mate-a",
            "mate-b",
            "mate-gen-a",
            "mate-gen-b",
            "mate-render",
            "mate-render-pq",
          ],
          "tool input",
        ],
        // Native σ builder: inputs to the one-shot "Generate σ" button. The RESULT (the σ view) is what a
        // link carries — as the `_sigma` state layer (ADR-0009 item 2), NOT these ids; re-running Generate
        // on load would be a side effect, not a restored view — same rule as the one-shot tools above.
        [["schwarz-preset", "schwarz-family", "schwarz-c", "schwarz-F", "schwarz-w0", "schwarz-poles"], "σ builder input (one-shot tool; view travels as _sigma)"],
        // σ coloring (ADR-0009 item 3): colormap + escape-scale for the σ pane. Part of the σ view, which
        // travels via the `_sigma` state layer (item 2) — not as its own shared control, the same way the
        // standard-fractal `palette` is opted out (SHARE_IDS omission).
        [
          [
            "schwarz-colormap",
            "schwarz-scale",
            "schwarz-colormode",
            "schwarz-trapshape",
            "schwarz-rotation",
            "schwarz-gamma",
            "schwarz-vignette",
          ],
          "σ coloring (travels inside _sigma, not as a control id)",
        ],
        // σ render knobs (Phase B): AA supersample + the escape budget (iterations + escape radius) are
        // properties of the σ view, carried by the `_sigma` state layer — not shared controls in their own
        // right, the same way the σ coloring above travels inside _sigma.
        [["schwarz-aa", "schwarz-iters", "schwarz-escaper"], "σ render setting (travels inside _sigma)"],
        // σ relief lighting (C2): on/off + light az / el / depth — a σ-view coloring property carried by _sigma.
        [
          ["schwarz-light", "schwarz-light-az", "schwarz-light-el", "schwarz-light-depth"],
          "σ relief lighting (travels inside _sigma)",
        ],
        // σ precise-nav fields mirror the live σ view (centre + zoom) and apply back to it. The window is a
        // property of the σ view and travels inside `_sigma` (item 2) — not as a shared control in its own
        // right, the same way the standard plots' centre/zoom travel via the view, not these input ids.
        [["schwarz-center-re", "schwarz-center-im", "schwarz-zoom"], "σ view nav (mirrors the view; travels inside _sigma)"],
        // Panel readout parameters — they change a text list inside a card, nothing on the plots.
        // (Contrast `laurent-n`, which IS shared: it sets a boundary curve drawn on both planes.)
        [["exterior-n"], "panel readout parameter"],
        // Visible re/im boxes that mirror the hidden "x,y" centre fields already in SHARE_IDS.
        [["param-center-re", "param-center-im", "dyn-center-re", "dyn-center-im"], "mirror of a shared field"],
        // Pickers that APPLY a state rather than being one. (`profile` travels as `_profile`.)
        [["fractal_presets", "places", "saved-views", "profile"], "picker"],
        // Transient playback position; the keyframe list itself is not serialized.
        [["kf-scrub"], "transient"],
      ] as [string[], string][]
    ).flatMap(([ids, why]) => ids.map((id) => [id, why] as const)),
  );

  it("every control in index.html is either in SHARE_IDS or explicitly opted out", () => {
    // Attribute values may contain ">" (titles, expressions), so consume quoted runs whole.
    const tags = [...indexHtml.matchAll(/<(input|select|textarea)\b((?:[^>"]|"[^"]*")*)>/gi)];
    const shared = new Set<string>(SHARE_IDS);
    const unaccounted: string[] = [];
    for (const [, , attrs] of tags) {
      const id = /id="([^"]+)"/.exec(attrs)?.[1];
      if (!id) continue;
      const type = /type="([^"]+)"/.exec(attrs)?.[1]?.toLowerCase();
      if (type === "button" || type === "submit" || type === "file") continue; // actions, not state
      if (!shared.has(id) && !(id in NOT_SHARED)) unaccounted.push(id);
    }
    expect(unaccounted).toEqual([]);
  });

  it("the opt-out list has no stale entries", () => {
    // A removed or renamed control must not leave a phantom exemption behind, which would let a
    // NEW control reusing that id slip past the guard above.
    const stale = Object.keys(NOT_SHARED).filter((id) => !indexHtml.includes(`id="${id}"`));
    expect(stale).toEqual([]);
  });
});
