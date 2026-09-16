/**
 * Browser entry point: run {@link init} inside @cas/ui's shared fatal-error boundary (ADR-0028, U1),
 * so a throw shows the WebGL2-aware banner in `#webgl-error` and the boot overlay is always removed.
 *
 * This is a separate module from `main.ts` purely so that importing the app does not BOOT it. That
 * is what lets `test/shell.test.ts` mount the real shell under jsdom — until WP3 the 6,900 lines of
 * `main.ts` were imported by no test, because importing the module ran the whole application.
 */
import { runWithFatalBoundary } from "@cas/ui";
import { init } from "./main";

runWithFatalBoundary(init, {
  bannerId: "webgl-error",
  bootOverlayId: "boot-loading",
  onError: (err) => console.error("Failed to initialize the visualizer:", err),
  webglMessage:
    "This visualizer needs WebGL2, which isn't available in your browser. " +
    "Try a recent version of Chrome, Firefox, Edge, or Safari 15+, and make sure " +
    "hardware acceleration is enabled.",
  genericMessage: "Something went wrong starting the visualizer. See the browser console for details.",
});
