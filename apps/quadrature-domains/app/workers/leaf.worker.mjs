// Native ES module worker (Phase 2 proof). Imports the ESM leaf directly — no runtime-Blob
// bundling. This is the pattern the primary-solver and param-slice workers will adopt.
import { Complex } from "../complex.mjs";

self.onmessage = (e) => {
  const { a, b } = e.data;
  self.postMessage(Complex.format(Complex.mul(a, b)));
};
