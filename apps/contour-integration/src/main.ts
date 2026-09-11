// Entry point. Milestone 0's gate: type a rational function, see its phase portrait and its poles.
// See docs/contour-integration/PLAN.md §7 for what each milestone adds.
import { mountApp } from "./shell/app.js";

const root = document.querySelector("#app");
if (root) mountApp(root);
