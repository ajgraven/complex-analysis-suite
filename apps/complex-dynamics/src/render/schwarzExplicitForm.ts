// schwarzExplicitForm.ts — the explicit closed form of the σ recipe (F4i), as Unicode-math text derived from
// CD's own φ recipe (SchwarzPhi). CD has no KaTeX, so this renders plain readable text in the same idiom as
// the σ readouts (σ, φ, conj, superscripts). The map φ and its Schwarz extension F ARE closed-form; the
// reflection σ(w) = conj(F(φ⁻¹(w))) is NOT — φ⁻¹ is solved numerically — so the σ line is symbolic and the
// note flags that everything σ-derived is `≈`. Ported (the text branch) from QD's schwarz-analysis.mjs
// `explicitSigmaForm`, restricted to CD's two families (unbounded-Laurent + bounded).
import type { SchwarzPhi } from "./schwarzPhiForm";
import type { Complex } from "@cas/schwarz";

const conj = (z: Complex): Complex => [z[0], -z[1]];
const isZero = (z: Complex): boolean => z[0] === 0 && z[1] === 0;

const SUP = ["⁰", "¹", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹"] as const;
/** Superscript exponent, but exponents 0 and 1 render as nothing (z¹ → z, (…)⁰ → (…)). */
function pow(n: number): string {
  if (n <= 1) return "";
  return n < 10 ? SUP[n] : `^${n}`;
}

/** A real number to ≤6 significant decimals, trailing zeros trimmed (`0.5`, `1`, `-2.25`). */
function fmtReal(x: number): string {
  return String(Math.round(x * 1e6) / 1e6);
}

/** A complex number as `a`, `bi`, or `a+bi` (± folded, unit imaginary as `i`/`-i`). */
function fmtC(z: Complex): string {
  const re = Math.round(z[0] * 1e6) / 1e6;
  const im = Math.round(z[1] * 1e6) / 1e6;
  if (im === 0) return fmtReal(re);
  const absI = Math.abs(im);
  const imPart = absI === 1 ? "i" : `${fmtReal(absI)}i`;
  if (re === 0) return im < 0 ? `-${imPart}` : imPart;
  return `${fmtReal(re)}${im >= 0 ? "+" : "-"}${imPart}`;
}

/** A bare literal: real → unparenthesised (`0.3`); complex → parenthesised (`(0.3+0.1i)`). */
function lit(z: Complex): string {
  return z[1] === 0 ? fmtReal(z[0]) : `(${fmtC(z)})`;
}

/** A coefficient MULTIPLYING a factor: `1·x` → `x`, `-1·x` → `-x`, real → `0.5·x`, complex → `(a+bi)·x`. */
function timesFactor(c: Complex, factor: string): string {
  if (c[1] === 0) {
    if (c[0] === 1) return factor;
    if (c[0] === -1) return `-${factor}`;
    return `${fmtReal(c[0])}·${factor}`;
  }
  return `(${fmtC(c)})·${factor}`;
}

/** Join non-zero terms with ` + `; if every term vanished, the whole expression is `0`. */
function join(terms: string[]): string {
  const nz = terms.filter((t) => t !== "0");
  return nz.length ? nz.join(" + ") : "0";
}

/** The finite-pole branch terms, shared by both families. `phiSide` gives the φ terms
 *  conj(A_{j,k})·zᵏ/(1−conj(z_j)·z)ᵏ; otherwise the F terms A_{j,k}/(z−z_j)ᵏ. */
function branchTerms(branches: SchwarzPhi["branches"], phiSide: boolean): string[] {
  const out: string[] = [];
  for (const br of branches) {
    for (let k = 1; k <= br.A.length; k++) {
      const A = br.A[k - 1];
      if (isZero(A)) continue;
      if (phiSide) {
        const num = timesFactor(conj(A), `z${pow(k)}`);
        out.push(`${num}/(1−${lit(conj(br.z))}·z)${pow(k)}`);
      } else {
        out.push(`${lit(A)}/(z−${lit(br.z)})${pow(k)}`);
      }
    }
  }
  return out;
}

export interface ExplicitSigmaForm {
  /** Human title of the family. */
  title: string;
  /** φ(z) = … (the conformal map, closed form). */
  phi: string;
  /** F(z) = … (its Schwarz extension, closed form). */
  F: string;
  /** σ(w) = conj(F(ψ(w))), ψ = φ⁻¹ (symbolic — φ⁻¹ has no closed form). */
  sigma: string;
  /** The honesty note: φ⁻¹ is numerical, so σ-derived values are ≈. */
  note: string;
}

const SIGMA_LINE = "σ(w) = conj(F(ψ(w))),  ψ = φ⁻¹";
const SIGMA_NOTE = "ψ = φ⁻¹ is solved numerically (no closed form), so σ and everything derived from it are ≈.";

/**
 * Render the explicit φ / F / σ closed form for a CD σ recipe. The unbounded-Laurent family (default) reads
 * `c` + `F` (+ `branches`); the bounded family reads `w0` (+ `branches`). Zero coefficients are dropped for
 * readability. Pure — golden-tested.
 */
export function explicitSigmaForm(phi: SchwarzPhi): ExplicitSigmaForm {
  if (phi.family === "bounded") {
    const w0 = phi.w0 ?? [0, 0];
    return {
      title: "Bounded map (φ: 𝔻 → Ω, interior branch)",
      phi: `φ(z) = ${join([fmtC(w0), ...branchTerms(phi.branches, true)])}`,
      F: `F(z) = ${join([fmtC(conj(w0)), ...branchTerms(phi.branches, false)])}`,
      sigma: SIGMA_LINE,
      note: SIGMA_NOTE,
    };
  }

  // Unbounded-Laurent: φ(z) = c·z + Σₗ F[l]/zˡ + branches; F(z) = conj(c)/z + Σₗ conj(F[l])·zˡ + branches.
  const c = phi.c;
  const cc = conj(c);
  // The F(z) leading term conj(c)/z: real → `1/z` / `2/z`; complex → `(1-0.5i)/z`.
  const fLead = cc[1] === 0 ? (cc[0] === 1 ? "1/z" : `${fmtReal(cc[0])}/z`) : `(${fmtC(cc)})/z`;
  const phiTerms: string[] = [timesFactor(c, "z")];
  const fTerms: string[] = [fLead];
  for (let l = 0; l < phi.F.length; l++) {
    const Fl = phi.F[l];
    if (isZero(Fl)) continue;
    if (l === 0) {
      phiTerms.push(fmtC(Fl)); // constant term F₀
      fTerms.push(fmtC(conj(Fl)));
    } else {
      phiTerms.push(`${lit(Fl)}/z${pow(l)}`);
      fTerms.push(timesFactor(conj(Fl), `z${pow(l)}`));
    }
  }
  phiTerms.push(...branchTerms(phi.branches, true));
  fTerms.push(...branchTerms(phi.branches, false));
  return {
    title: "Unbounded-Laurent map (φ: 𝔻* → Ω, exterior branch)",
    phi: `φ(z) = ${join(phiTerms)}`,
    F: `F(z) = ${join(fTerms)}`,
    sigma: SIGMA_LINE,
    note: SIGMA_NOTE,
  };
}
