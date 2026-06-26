/**
 * Curated "places" — famous locations in the Mandelbrot (z²+c) parameter plane,
 * as partial {@link AppState} objects. Selecting one sets f = z²+c and flies the
 * parameter plane to that centre/zoom (leaving the colouring and the dynamical view
 * as they are); it goes through `applyFullState`, so it is undoable like any other
 * view change. Each value is a control-input string, matching the DOM inputs.
 */

import type { AppState } from "./appState";

export interface Place {
  name: string;
  state: AppState;
}

const M = (center: string, zoom: string, iter: string): AppState => ({
  inpf: "z^2+c",
  inpme: "abs(z)>2",
  inpje: "abs(z)>2",
  inpparamcenter: center,
  inpparamzoom: zoom,
  inpmn: iter,
});

export const PLACES: Place[] = [
  { name: "Home (whole set)", state: M("-0.75,0", "0.75", "100") },
  { name: "Seahorse Valley", state: M("-0.745,0.1", "25", "350") },
  { name: "Elephant Valley", state: M("0.275,0.006", "40", "400") },
  { name: "Triple Spiral", state: M("-0.0865,0.653", "90", "400") },
  { name: "Feigenbaum Point", state: M("-1.401155,0", "150", "500") },
  { name: "Misiurewicz Point", state: M("-0.77568377,0.13646737", "500", "600") },
  { name: "Scepter Valley", state: M("-1.25,0.02", "60", "400") },
];
