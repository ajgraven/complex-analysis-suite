// The PRA-1 sandbox corpus (DESIGN §8): thirty polynomials chosen for what each one stresses.
import type { Ring } from "../../src/engine/polynomial.js";

export interface SandboxCase {
  readonly id: string;
  readonly text: string;
  readonly ring: Ring;
  /** Every root's multiplicity, sorted descending — the claim ℚ mode must DECIDE. */
  readonly multiplicities: readonly number[];
}

const wilkinson = Array.from({ length: 20 }, (_, i) => `(z-${i + 1})`).join("*");

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Ten random integer polynomials, degree 6–12, fixed seeds. */
const random: SandboxCase[] = Array.from({ length: 10 }, (_, k) => {
  const rnd = lcg(1000 + k);
  const n = 6 + Math.floor(rnd() * 7);
  const terms: string[] = [];
  for (let j = n; j >= 0; j--) {
    let c = Math.floor(rnd() * 19) - 9;
    if (j === n && c === 0) c = 1;
    if (j === 0 && c === 0) c = 3; // keep the constant term, so 0 is never a spurious double root
    if (c !== 0) terms.push(`${c < 0 ? "-" : "+"}${Math.abs(c)}*z^${j}`);
  }
  return {
    id: `random-${k}`,
    text: terms.join("").replace(/^\+/, ""),
    ring: "Q" as Ring,
    multiplicities: Array<number>(n).fill(1),
  };
});

const simple = (n: number): number[] => Array<number>(n).fill(1);

export const SANDBOX: readonly SandboxCase[] = [
  { id: "wilkinson-20", text: wilkinson, ring: "Q", multiplicities: simple(20) },
  { id: "unity-24", text: "z^24 - 1", ring: "Q", multiplicities: simple(24) },
  { id: "double-triple", text: "(z-1)^2*(z+2)^3", ring: "Q", multiplicities: [3, 2] },
  {
    id: "cluster-3",
    text: "(z-1)*(z-1.0001)*(z-1.0002)",
    ring: "Q",
    multiplicities: simple(3),
  },
  {
    id: "littlewood-a",
    text: "z^8+z^7-z^6+z^5-z^4-z^3+z^2-z+1",
    ring: "Q",
    multiplicities: simple(8),
  },
  {
    id: "littlewood-b",
    text: "z^11-z^10-z^9+z^8+z^7+z^6-z^5+z^4-z^3-z^2+z+1",
    ring: "Q",
    multiplicities: simple(11),
  },
  {
    id: "littlewood-c",
    text: "z^14+z^13+z^12-z^11+z^10-z^9-z^8+z^7-z^6+z^5+z^4-z^3+z^2+z-1",
    ring: "Q",
    multiplicities: simple(14),
  },
  { id: "quintic-s5", text: "z^5 - z - 1", ring: "Q", multiplicities: simple(5) },
  { id: "quintic-a5", text: "z^5 + 20z + 16", ring: "Q", multiplicities: simple(5) },
  { id: "quintic-d5", text: "z^5 - 5z + 12", ring: "Q", multiplicities: simple(5) },
  { id: "quintic-f20", text: "z^5 - 2", ring: "Q", multiplicities: simple(5) },
  {
    id: "quintic-c5",
    text: "z^5 + z^4 - 4z^3 - 3z^2 + 3z + 1",
    ring: "Q",
    multiplicities: simple(5),
  },
  { id: "trinks", text: "z^7 - 7z + 3", ring: "Q", multiplicities: simple(7) },
  {
    id: "real-quartic",
    text: "(z^2+2z+5)*(z^2-z+1)",
    ring: "R",
    multiplicities: simple(4),
  },
  { id: "degree-1", text: "3z - 2", ring: "Q", multiplicities: [1] },
  { id: "degree-2", text: "z^2 + 1", ring: "Q", multiplicities: [1, 1] },
  { id: "zero-root", text: "z^4 - 2z", ring: "Q", multiplicities: simple(4) },
  { id: "non-monic", text: "7z^3 - 2z + 5", ring: "Q", multiplicities: simple(3) },
  { id: "decimal", text: "0.1z^2 - 1", ring: "Q", multiplicities: [1, 1] },
  { id: "gaussian", text: "z^3 - (1+2i)*z + i", ring: "C", multiplicities: simple(3) },
  ...random,
];
