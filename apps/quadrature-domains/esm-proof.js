// Phase 2 proof entry. Demonstrates, under Vite, the two mechanisms the full port depends on:
//   (1) importing an ESM leaf directly on the page, and
//   (2) a native ES module worker importing that same leaf.
import { Complex } from "./app/complex.mjs";

const out = () => document.getElementById("out");

// (1) Page-side leaf use.
const page = Complex.format(Complex.mul({ re: 1, im: 2 }, { re: 3, im: 4 })); // "-5+10i"

// (2) Native module worker — Vite bundles this via the new Worker(new URL(...)) pattern.
const worker = new Worker(new URL("./app/workers/leaf.worker.mjs", import.meta.url), {
  type: "module",
});
worker.onmessage = (e) => {
  if (out()) out().textContent = `page: ${page}\nworker: ${e.data}`;
};
worker.postMessage({ a: { re: 1, im: 2 }, b: { re: 3, im: 4 } });
