// The engine's leaf types, imported by everything and importing nothing — so the solver can name a
// complex number without importing the module that calls it (dependency-cruiser's no-circular).
export type Ring = "C" | "R" | "Q";
export type Cx = readonly [re: number, im: number];
