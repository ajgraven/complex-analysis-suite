// The summation kernels — `π cot(πz)` and `π csc(πz)`, and the sums they turn into residues.
//
// **THE ALTERNATION IS CARRIED BY THE KERNEL, NOT BY `f`.** `π cot(πz)` has a simple pole at every
// `n ∈ ℤ` with residue exactly `1`; `π csc(πz)` has one at every `n ∈ ℤ` with residue exactly
// `(−1)ⁿ`. So `Res(K·f, n) = Res(K, n)·f(n)` is `f(n)` or `(−1)ⁿ f(n)` — which is the whole reason
// `Σ(−1)ⁿ/n²` costs nothing once `Σ1/n²` exists: the same `f`, the other kernel, and no new
// machinery anywhere (`tier-efg.md` §6).
//
// The residue rule is a THEOREM, not a computation, and this file does not pretend otherwise. What
// it computes is `f(n)`, exactly, by evaluating the cofactor's numerator and denominator over ℚ(i);
// what it asserts is the kernel's own residue, with the derivation in the certificate. Deriving `1`
// from `lim (z−n)·π cos(πz)/sin(πz)` numerically would be a worse claim about a better-known fact.
//
// **A COLLISION IS NAMED, NOT SUMMED.** When `f` itself has a pole at an integer, the kernel's pole
// and the cofactor's merge into one of higher order and `Res(K·f, n) = f(n)` is simply false —
// G1's `f = 1/z²` at `n = 0` is exactly this, where the true residue is `−π²/3` and the naive rule
// would divide by zero. The merged residue needs the Laurent expansion and lands in ℚ(i)(π) rather
// than the exponential basis (`π²` has no seat there, which is the same wall the log families met);
// it is M5.7's subject. Here the collision is DETECTED and reported by name, so a sum can never
// quietly omit or mis-weight the one term the record is usually about.
import { Frac, Gauss, QiPoly } from "@cas/exact";
import type { Node } from "@cas/expr";
import { exact, refuse, type Certificate } from "@cas/rigor";
import { toExactRational } from "./exactRational.js";
import { splitFactors } from "./exponentialFactor.js";
import { formatGauss } from "./formatExact.js";

export type KernelKind = "cot" | "csc";

/** `π cot(πz)·f` or `π csc(πz)·f`, with `f` read as an exact rational function. */
export interface SummationKernel {
  readonly kind: KernelKind;
  /** The cofactor `f`, exactly. Its own poles are separate from the kernel's — see the header. */
  readonly num: QiPoly;
  readonly den: QiPoly;
}

/**
 * The kernel's residue at the integer `n`: `1` for `cot`, `(−1)ⁿ` for `csc`.
 *
 * Stated rather than derived, and the header says why. It is the one place in the file where a
 * number is asserted, so it is the one worth reading twice.
 */
export function kernelResidue(kind: KernelKind, n: bigint): Gauss {
  if (kind === "cot") return Gauss.ONE;
  return ((n % 2n) + 2n) % 2n === 0n ? Gauss.ONE : Gauss.ONE.neg();
}

/** `π cot(π·z)` / `π csc(π·z)` exactly, or null — the argument must be `π` times the variable. */
function asKernelFactor(node: Node): KernelKind | null {
  if (node.kind !== "call") return null;
  if (node.name !== "cot" && node.name !== "csc") return null;
  if (node.args.length !== 1) return null;
  // The argument must be exactly `π·z`: `cot(2πz)` has poles every half-integer and `cot(z)` every
  // `π`, and neither residue is 1. Read through the exact rational reader so `pi*z`, `z*pi` and
  // `(2*pi*z)/2` all work, and a constant term does not.
  const arg = node.args[0];
  if (arg === undefined) return null;
  if (!isPiTimesVariable(arg)) return null;
  return node.name;
}

/** `π·z` with no constant term and no other factor. */
function isPiTimesVariable(arg: Node): boolean {
  const { num, den } = splitFactors(arg);
  if (den.length !== 0) return false;
  let sawPi = false;
  let sawVar = false;
  for (const factor of num) {
    if (factor.kind === "const" && factor.name === "pi") {
      if (sawPi) return false;
      sawPi = true;
      continue;
    }
    if (factor.kind === "var" && factor.name === "z") {
      if (sawVar) return false;
      sawVar = true;
      continue;
    }
    return false;
  }
  return sawPi && sawVar;
}

/**
 * Read `π cot(πz)·f(z)` or `π csc(πz)·f(z)`, or report that it is neither.
 *
 * The leading `π` is REQUIRED and not absorbed into `f`: `cot(πz)` has residue `1/π` at each
 * integer, so an integrand written without it is a different sum by a factor of π at every term.
 * Research 03 §8's bound drops exactly this π and stops being a bound (finding D-2), which is the
 * same mistake one level up.
 */
export function asSummationKernel(ast: Node): SummationKernel | null {
  const { num, den } = splitFactors(ast);
  if (den.some((d) => asKernelFactor(d) !== null)) return null; // a kernel in the denominator
  // `toExactRational` refuses a `pi` constant BY NAME — "'pi' is not a Gaussian rational" — so the
  // π never reaches the polynomials and there is nothing to divide out of them. It is counted here
  // instead, which is also what makes "exactly one π, in the numerator" a check rather than a hope:
  // `2*pi*cot(pi*z)` and `cot(pi*z)/pi` are different sums and neither is this one.
  const isPi = (n: Node): boolean => n.kind === "const" && n.name === "pi";
  if (den.some(isPi)) return null;

  let kind: KernelKind | null = null;
  let pis = 0;
  const rest: Node[] = [];
  for (const factor of num) {
    if (isPi(factor)) {
      pis += 1;
      continue;
    }
    const k = asKernelFactor(factor);
    if (k === null) {
      rest.push(factor);
      continue;
    }
    if (kind !== null) return null; // two kernels is not a shape this reads
    kind = k;
  }
  if (kind === null || pis !== 1) return null;

  // Everything else is `f`, read through the exact rational reader — so `pi*cot(pi*z)/z^2`,
  // `cot(pi*z)*pi/z^2` and `(pi/z^2)*cot(pi*z)` are one case rather than three patterns.
  const cofactor = rationalOf(rest, den);
  if (cofactor === null) return null;
  // **REDUCE, BECAUSE THE COLLISION TEST ASKS THE DENOMINATOR.** `toExactRational` does not cancel
  // common factors, so `z/(z(z²+1))` arrives with `den` vanishing at 0 while `f = 1/(z²+1)` is
  // perfectly regular there — and `kernelResidues` would then refuse it saying "the cofactor has a
  // pole at z = 0", which is false. A conservative refusal would be tolerable; a refusal that names
  // a pole that is not there is the kind of row this whole arc has been removing.
  const g = cofactor.num.gcd(cofactor.den);
  if (g.degree() < 1) return { kind, num: cofactor.num, den: cofactor.den };
  return { kind, num: cofactor.num.divExact(g), den: cofactor.den.divExact(g) };
}

/** The remaining factors as one exact rational function, or null. */
function rationalOf(num: readonly Node[], den: readonly Node[]): { num: QiPoly; den: QiPoly } | null {
  let n = QiPoly.fromCoeffs([Gauss.ONE]);
  let d = QiPoly.fromCoeffs([Gauss.ONE]);
  for (const factor of num) {
    const r = toExactRational(factor);
    if (!r.ok) return null;
    n = n.mul(r.value.num);
    d = d.mul(r.value.den);
  }
  for (const factor of den) {
    const r = toExactRational(factor);
    if (!r.ok) return null;
    n = n.mul(r.value.den);
    d = d.mul(r.value.num);
  }
  return { num: n, den: d };
}

export type KernelResidues =
  | {
      readonly ok: true;
      /** `(n, Res(K·f, n))` for every integer in the band, each exact over ℚ(i). */
      readonly terms: readonly { readonly n: bigint; readonly residue: Gauss }[];
      readonly certificate: Certificate;
    }
  | { readonly ok: false; readonly reason: string; readonly certificate: Certificate };

/**
 * `Res(K·f, n)` at every integer `n` with `|n| ≤ bound`, exactly.
 *
 * Refuses a COLLISION by name rather than dividing by zero, and refuses rather than skipping,
 * because a sum missing the term the record is about is the failure this whole tier could have and
 * not notice. The cofactor is reduced by {@link asSummationKernel}, so a denominator root here is a
 * genuine pole of `f` rather than a factor that cancels.
 *
 * **Its consumer is M5.6**, where Pass 5 gains an unknown INSIDE the residue sum. Until then it is
 * exercised only by the suite — said out loud so it does not become another export that is dead and
 * quiet about it.
 */
/**
 * The integers in the band at which the cofactor ALSO has a pole — the collisions.
 *
 * Split out so the theorem and Pass 5 read one list rather than each deciding for itself what a
 * collision is. Exact: the denominator is evaluated over ℚ(i) and `isZero` is a decision.
 */
export function collisionsOf(kernel: SummationKernel, bound: bigint): readonly bigint[] {
  const out: bigint[] = [];
  for (let n = -bound; n <= bound; n++) {
    if (kernel.den.eval(new Gauss(Frac.of(n), Frac.ZERO)).isZero()) out.push(n);
  }
  return out;
}

export function kernelResidues(
  kernel: SummationKernel,
  bound: bigint,
  /**
   * Integers to leave out — the COLLISIONS, whose residues `mergedResidue` supplies instead.
   *
   * Empty by default, which is the shape this had before G1: a collision then refuses here, and the
   * refusal is still what a caller that has not handled them gets. Passing the set is a caller
   * saying it HAS, so the two cannot disagree about which integers were summed.
   */
  skip: ReadonlySet<bigint> = new Set(),
): KernelResidues {
  const terms: { n: bigint; residue: Gauss }[] = [];
  for (let n = -bound; n <= bound; n++) {
    if (skip.has(n)) continue;
    const at = new Gauss(Frac.of(n), Frac.ZERO);
    const d = kernel.den.eval(at);
    if (d.isZero()) {
      const reason =
        `the cofactor has a pole at z = ${n}, where the kernel has one too: the two merge into a ` +
        "pole of higher order and Res(K·f, n) = Res(K, n)·f(n) is false there — the merged residue " +
        "needs the Laurent expansion and lands in ℚ(i)(π), which is a different computation";
      return { ok: false, reason, certificate: refuse(`Res(K·f, ${n})`, reason) };
    }
    const value = kernel.num.eval(at).div(d).mul(kernelResidue(kernel.kind, n));
    terms.push({ n, residue: value });
  }
  return {
    ok: true,
    terms,
    certificate: exact(
      `Res(K·f, n) = ${kernel.kind === "cot" ? "f(n)" : "(−1)ⁿ·f(n)"} at each of the ${terms.length} integers with |n| ≤ ${bound}`,
      `$\\pi\\${kernel.kind}(\\pi z)$ has a simple pole at every integer with residue $${kernel.kind === "cot" ? "1" : "(-1)^n"}$, and $f$ is regular there, so the residue of the product is the product of the two`,
      {
        provenance: [
          {
            ok: true,
            text: "the kernel's residue is a theorem and is asserted; what is computed is $f(n)$, exactly, over $\\mathbb{Q}(i)$",
          },
          {
            ok: true,
            text: `f(0) = ${kernel.den.eval(Gauss.ZERO).isZero() ? "—" : formatGauss(kernel.num.eval(Gauss.ZERO).div(kernel.den.eval(Gauss.ZERO)))}, and no cofactor pole lies on an integer in the band`,
          },
        ],
      },
    ),
  };
}

/**
 * The kernel's poles in `[−bound, bound]`, as positions — what LEGALITY could not see.
 *
 * `findPoles` reports ZERO poles for `π cot(πz)/z²`: the readers cannot see a transcendental, so a
 * square at an INTEGER half-width runs its vertical sides exactly through `z = ±N` and the ledger
 * says "every singularity is clear of the contour". Handing the list over makes that refusal happen
 * for the right reason, and it is the same shape `expLattice.ts` takes for the strip: a declared
 * band of an infinite set, because a list of infinitely many is not a list.
 */
export function kernelPoles(bound: bigint): readonly { readonly at: readonly [number, number]; readonly order: number }[] {
  const poles: { at: readonly [number, number]; order: number }[] = [];
  for (let n = -bound; n <= bound; n++) poles.push({ at: [Number(n), 0], order: 1 });
  return poles;
}
