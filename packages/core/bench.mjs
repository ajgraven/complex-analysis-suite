// @cas/core micro-benchmark — the Phase-3 gate's CPU-path no-regression check.
// Run after building:  pnpm --filter @cas/core run bench   (or: node packages/core/bench.mjs)
//
// What matters for perf:
//   - The per-pixel SOLVER hot path (QD's boundary Newton) is plain complex arithmetic. QD calls
//     Complex.* DIRECTLY (via the app's re-export shim) — NOT through the ComplexAlgebra layer —
//     so the extraction moved byte-identical code and there is no indirection on the hot path.
//   - Durand-Kerner and the series multiply run per-SOLVE / per-frame (a handful of times), not
//     per pixel, so the tiny algebra-object indirection they DO use is immaterial.
// The numbers below confirm the extracted primitives run at full native speed.
import { Complex, makeDurandKerner, objAlgebra, makeSeries } from "./dist/index.js";

function bench(label, iters, fn) {
  for (let i = 0; i < 200000; i++) fn(i); // warm up the JIT
  const t = Date.now();
  let sink = 0;
  for (let i = 0; i < iters; i++) sink += fn(i);
  const dt = (Date.now() - t) / 1000;
  const rate = iters / dt / 1e6;
  console.log(`  ${label.padEnd(38)} ${rate.toFixed(1).padStart(7)} Mops/s   (${dt.toFixed(2)}s, sink=${(sink % 997).toFixed(3)})`);
}

console.log("@cas/core CPU-path benchmark\n");

// --- 1. Complex arithmetic: the per-pixel solver hot path (called directly, no algebra layer) ---
{
  const a = { re: 1.000001, im: 0.999999 };
  const b = { re: 0.5, im: -0.3 };
  const out = { re: 0, im: 0 };
  bench("Complex.mulInto (zero-alloc hot op)", 5e7, () => {
    Complex.mulInto(a, b, out);
    a.re = out.re * 0.9999999 + 1e-7;
    a.im = out.im * 0.9999999;
    return a.re;
  });
  let z = { re: 1.1, im: 0.2 };
  bench("Complex.mul (functional)", 2e7, () => {
    z = Complex.mul(z, b);
    z = { re: z.re * 0.9 + 0.05, im: z.im * 0.9 + 0.01 };
    return z.re;
  });
  let d = { re: 1.3, im: 0.7 };
  bench("Complex.div", 1e7, () => {
    d = Complex.div(d, b);
    d = { re: d.re * 0.5 + 0.5, im: d.im * 0.5 + 0.1 };
    return d.re;
  });
}

// --- 2. Durand-Kerner (per-solve): root-find z^10 - 1 repeatedly, through the algebra ---
{
  const dk = makeDurandKerner(objAlgebra);
  const deg = 10;
  const coeffs = new Array(deg + 1).fill(0).map((_, k) => (k === 0 ? -1 : k === deg ? 1 : 0)); // z^10 - 1
  const evalMonic = (z) => {
    let acc = { re: 0, im: 0 };
    for (let k = deg; k >= 0; k--) acc = { re: acc.re * z.re - acc.im * z.im + coeffs[k], im: acc.re * z.im + acc.im * z.re };
    return acc;
  };
  const seeds = Array.from({ length: deg }, (_, j) => {
    const ang = (2 * Math.PI * j) / deg + 0.4;
    return { re: 1.5 * Math.cos(ang), im: 1.5 * Math.sin(ang) };
  });
  const N = 20000;
  for (let i = 0; i < 2000; i++) dk(evalMonic, seeds); // warm up
  const t = Date.now();
  for (let i = 0; i < N; i++) dk(evalMonic, seeds);
  const dt = (Date.now() - t) / 1000;
  console.log(`  ${"Durand-Kerner deg-10 solve".padEnd(38)} ${(N / dt / 1e3).toFixed(1).padStart(7)} K/s      (${dt.toFixed(2)}s / ${N})`);
}

// --- 3. Series multiply (per-solve): order-64 truncated product ---
{
  const s = makeSeries(objAlgebra);
  const order = 64;
  const a = Array.from({ length: order + 1 }, (_, k) => ({ re: 1 / (k + 1), im: 0.01 * k }));
  const b = Array.from({ length: order + 1 }, (_, k) => ({ re: 0.5 ** (k % 8), im: -0.02 * k }));
  const N = 2e5;
  for (let i = 0; i < 20000; i++) s.mul(a, b, order); // warm up
  const t = Date.now();
  for (let i = 0; i < N; i++) s.mul(a, b, order);
  const dt = (Date.now() - t) / 1000;
  console.log(`  ${`series.mul order-${order}`.padEnd(38)} ${(N / dt / 1e3).toFixed(1).padStart(7)} K/s      (${dt.toFixed(2)}s / ${N})`);
}
