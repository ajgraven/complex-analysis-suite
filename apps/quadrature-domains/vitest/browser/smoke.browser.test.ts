import { describe, expect, it } from "vitest";

// Infra premise-guard: proves the browser project runs in a real Chromium and that a FRESH canvas
// gets a WebGL2 context (via SwiftShader in headless CI). This is not redundant with boot.browser —
// it is what keeps boot.browser's `#canvas.getContext('webgl2') === null` assertion meaningful: that
// null is only proof "DomainPlot claimed #canvas with a 2D context" if an unclaimed canvas would
// otherwise HAND BACK a WebGL2 context. If WebGL2 were unavailable, the fresh canvas here returns
// null too, this test fails loudly at the infra, and we're warned instead of the boot check passing
// vacuously. (The real boot coverage is boot.browser.test.ts.)
describe("QD browser harness infra", () => {
  it("runs in a real browser (document + window present)", () => {
    expect(typeof document).toBe("object");
    expect(typeof window).toBe("object");
  });

  it("has a WebGL2 context (otherwise the boot test's canvas check is vacuous)", () => {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    expect(gl, "headless Chromium should provide WebGL2 via SwiftShader").not.toBeNull();
  });
});
