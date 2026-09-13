// The GLSL twin of `kernel/branch/declared.ts` — the declared branch product, per pixel.
//
// Emitted rather than fixed, because the factor list is the RECORD's: how many branch points, where,
// at which exponents, in which windows and written which way round. A fixed shader with a uniform
// array would work too and is worse for one reason — the exponents and the orientations would become
// runtime data, and a record declaring `(b − z)^ν` would be one wrong uniform away from being drawn
// as `(z − b)^ν`, which is the same number and not the same power. Generated code puts the record's
// own declaration in the program text, where the compile fails if it is malformed rather than the
// picture being quietly wrong.
//
// Concatenate AFTER `COMPLEX_SINGLE_GLSL` and `CUT_GLSL` (it needs `cvec`, `cmul` and `cpowCut`).
import { windowOrigin, type DeclaredProduct } from "../../kernel/branch/declared.js";

/**
 * A float literal with every bit a float32 can hold — the exponents decide the picture.
 *
 * `toPrecision(17)` always yields a decimal point or an exponent for a finite number (`0` becomes
 * `0.0000000000000000`, `1e30` becomes `1.0000000000000000e+30`), both of which are valid GLSL
 * float literals, so there is no integer case to patch up. A bare `2` would be an `int` in GLSL and
 * a type error where a `float` is wanted, which is why this is not `String(x)`.
 */
const f = (x: number): string => x.toPrecision(17);

/**
 * `cvec casDeclared(cvec z)` — `c · ∏ⱼ (sⱼ(z − bⱼ))^{αⱼ}`, each factor in its own window.
 *
 * The rational cofactor is NOT included: it is single-valued, so it comes from `@cas/expr`'s
 * compiled AST exactly as the whole integrand used to, and the two are multiplied in `main`. That
 * split is the point — the branch half is generated from the declaration and the single-valued half
 * stays on the shared compile path, so `@cas/expr` keeps being the one source of truth for
 * everything that has no determination to choose.
 */
export function declaredProductGlsl(product: DeclaredProduct): string {
  const lines: string[] = [];
  for (let k = 0; k < product.factors.length; k++) {
    const factor = product.factors[k];
    const theta0 = f(windowOrigin(factor));
    const b = `vec_(${f(factor.at[0])}, ${f(factor.at[1])})`;
    // `sⱼ(z − bⱼ)`: for sⱼ = −1 the record wrote `(bⱼ − z)`, so the subtraction runs the other way
    // rather than the result being negated — `−(z − b)` and `(b − z)` are the same number, and
    // taking a power of one is not taking a power of the other.
    const d = factor.kind === "power" && factor.sign === -1 ? `csub(${b}, z)` : `csub(z, ${b})`;
    lines.push(
      factor.kind === "power"
        ? `  acc = cmul(acc, cpowCut(${d}, ${f(factor.alpha)}, ${theta0}));`
        : // log^m, by repeated multiplication: an integer power of the logarithm in the declared
          // window, never exp(m·log(log z)), which would choose a branch the record did not.
          `  { cvec l = clogCut(${d}, ${theta0}); cvec p = vec_(1.0, 0.0);\n` +
          `${"    "}for (int i = 0; i < ${factor.power}; ++i) p = cmul(p, l);\n` +
          `${"    "}acc = cmul(acc, p); }`,
    );
  }
  return `
// c * prod_j (s_j (z - b_j))^{alpha_j}, generated from the record's own declaration.
cvec casDeclared(cvec z) {
  cvec acc = vec_(${f(product.constant[0])}, ${f(product.constant[1])});
${lines.join("\n")}
  return acc;
}
`;
}
