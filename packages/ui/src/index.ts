// @cas/ui — the suite's shared browser SHELL (ADR-0028).
//
// THREE primitives, each ported from a proven Complex Dynamics pattern, so every TS app in the suite gets
// the product shell it currently omits (UX audit): accessibility, a fatal-error boundary and
// off-main-thread compute. There was a fourth — a suite navigation header, with `SUITE_APPS` beneath it —
// withdrawn from the package and from every app by ADR-0044: the launcher is the unified menu, and a bar
// adopted by five of twelve apps advertised a suite two-thirds of them did not have. Consumed via SOURCE by the suite's Vite/Vitest bundlers (no dist
// build), like @cas/schwarz and @cas/conformal. QD is deliberately NOT a consumer (allowJs/vanilla and
// already product-mature — ADR-0002 / ADR-0008 precedent). Adoption is app-by-app (U1 CD → U6), so U0
// ships the package and its tests with no app touched.

export { mountCanvas, attachCanvasA11y } from "./mountCanvas.js";
export type {
  MountCanvasOptions,
  MountedCanvas,
  AttachCanvasOptions,
  AttachedCanvas,
  CanvasKeyAction,
} from "./mountCanvas.js";

export { runWithFatalBoundary, showFatalBanner } from "./fatalBoundary.js";
export type { FatalBoundaryOptions } from "./fatalBoundary.js";

export { createComputeClient } from "./computeClient.js";
export type { ComputeClient, ComputeClientOptions } from "./computeClient.js";

export { drawDirectionTicks } from "./canvasOverlay.js";
export type { DirectionTicksOptions, Vec2 } from "./canvasOverlay.js";

// The keyed DOM builder — a description of the DOM and a `patch` that reconciles it without replacing a
// node whose key persists. Moved from Contour Integration's M8 shell when Polynomial Root Analysis
// became its second consumer (ADR-0047).
export { h, patch, text } from "./dom.js";
export type { Child, Desc } from "./dom.js";

// The modal mechanics — focus trap, `inert` page, Escape, focus returned. Moved from Contour
// Integration's M8 shell when Polynomial Root Analysis's front door became its second consumer
// (ADR-0047 PRA-10, ADR-0007).
export { createModal } from "./modal.js";
export type { Modal, ModalInput } from "./modal.js";
