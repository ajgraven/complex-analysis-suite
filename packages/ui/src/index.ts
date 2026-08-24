// @cas/ui — the suite's shared browser SHELL (ADR-0028).
//
// Four primitives, each ported from a proven Complex Dynamics pattern, so every TS app in the suite gets
// the product shell it currently omits (UX audit): accessibility, a fatal-error boundary, off-main-thread
// compute, and cross-app navigation. Consumed via SOURCE by the suite's Vite/Vitest bundlers (no dist
// build), like @cas/schwarz and @cas/conformal. QD is deliberately NOT a consumer (allowJs/vanilla and
// already product-mature — ADR-0002 / ADR-0008 precedent). Adoption is app-by-app (U1 CD → U6), so U0
// ships the package and its tests with no app touched.

export { mountCanvas } from "./mountCanvas.js";
export type { MountCanvasOptions, MountedCanvas, CanvasKeyAction } from "./mountCanvas.js";

export { runWithFatalBoundary, showFatalBanner } from "./fatalBoundary.js";
export type { FatalBoundaryOptions } from "./fatalBoundary.js";

export { createComputeClient } from "./computeClient.js";
export type { ComputeClient, ComputeClientOptions } from "./computeClient.js";

export { mountNavHeader } from "./navHeader.js";
export type { NavHeaderOptions, NavHeader, HandoffConfig } from "./navHeader.js";

export { SUITE_APPS } from "./apps.js";
export type { SuiteApp } from "./apps.js";
