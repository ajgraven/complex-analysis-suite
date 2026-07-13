#!/usr/bin/env python3
# =============================================================================
# gen-cas-corpus.py -- generate the EXTERNAL-CAS golden corpus (cas-corpus.json)
# that sym-core-cas-corpus.test.ts checks the QD exact engine against.
#
# This is the one oracle in the suite that is independent of QD's whole code path:
# values are computed by Sympy (a mature, separately-implemented CAS), serialized
# to a static JSON corpus, and committed. CI does NOT run this script (no Python
# dependency) -- it only consumes the committed JSON. Re-run this by hand to extend
# or refresh the corpus:  python gen-cas-corpus.py  (writes cas-corpus.json alongside).
#
# Conventions were checked to match QD before authoring (resultant sign/arg order,
# realRootCount = DISTINCT real roots via the square-free part, grevlex + variable
# order). Coefficients are kept in ZZ so everything stays exact-integer.
# =============================================================================
import json, os
import sympy as sp

x, y, z, a, b, c = sp.symbols('x y z a b c')


def poly_terms(expr, gens):
    """Serialize a Sympy expr to [[coeffInt, {var: exp}], ...] over `gens`."""
    expr = sp.expand(expr)
    if expr == 0:
        return []
    if not gens:  # a bare constant
        return [[int(expr), {}]]
    P = sp.Poly(expr, *gens)
    out = []
    for monom, coeff in P.terms():
        mono = {str(g): int(e) for g, e in zip(gens, monom) if e != 0}
        out.append([int(coeff), mono])
    return out


def leading_monomial(expr, gens):
    """The grevlex leading monomial of expr as {var: exp}."""
    P = sp.Poly(expr, *gens)  # `order` is a METHOD kwarg in this Sympy, not a constructor kwarg
    lm = P.monoms(order='grevlex')[0]  # monoms() is descending in the order ⇒ [0] is leading
    return {str(g): int(e) for g, e in zip(gens, lm) if e != 0}


# ---- resultants: Res_var(f, g) as a polynomial (or constant) over the remaining vars ----
RES_CASES = [
    (x**2 - 2, x - 1, x, [x]),
    (x**2 - 1, x**2 - x, x, [x]),               # common factor ⇒ 0
    (x**3 - x, x**2 - 1, x, [x]),               # common factor ⇒ 0
    (x**2 + 1, x**2 - 1, x, [x]),
    (x**4 - 1, x**2 + 1, x, [x]),               # ⇒ 0
    (2*x**2 - 3, 5*x - 1, x, [x]),              # non-monic
    (x**2 - 5*x + 6, sp.diff(x**2 - 5*x + 6, x), x, [x]),   # Res(p, p') (discriminant-like)
    (x**3 - 2, sp.diff(x**3 - 2, x), x, [x]),
    (x**2 - y, x - 3, x, [x, y]),               # ⇒ 9 - y (parameter)
    (x**2 - y*x + 1, x - 2, x, [x, y]),         # ⇒ poly in y
    (x**2 - y, x**2 + y - 2, x, [x, y]),        # ⇒ poly in y
]

# ---- real-root counts (DISTINCT real roots = count on the square-free part) ----
RRC_CASES = [
    x**2 - 2, x**2 + 1, x**3 - x, (x - 1)**2 * (x + 2), x**4 - 1, x**4 + 1,
    x**5 - x, x**2 - 4*x + 4, x*(x + 2)*(x - 1), (x - 1)*(x - 2)*(x - 3),
    2*x**2 + 3, x**6 - 1, x**3 - 6*x**2 + 11*x - 6, x**4 - 5*x**2 + 4,
]

# ---- Gröbner (grevlex): leading-monomial set + monic reduced basis ----
GB_CASES = [
    ([x**2 - y, x*y - 1], [x, y]),
    ([x**2 - 1, y**2 - 1], [x, y]),
    ([x**2 + y**2 - 1, x - y], [x, y]),
    ([a + b + c, a*b + b*c + c*a, a*b*c - 1], [a, b, c]),      # cyclic-3
    ([x + y + z - 1, x**2 + y**2 - z, x*z - y], [x, y, z]),
    ([x**3 - 1, x**2 + x*y + y**2], [x, y]),
]

# ---- bivariate factorization over ℚ(i) (roadmap #19): Sympy factor(..., gaussian=True) is the external
# oracle for QD.Sym.factorBivariate. Each factor is canonicalized monic-in-x (divide by its x-leading coeff)
# to match the engine's _canonicalFactor. Note x²−2y² STAYS irreducible over ℚ(i) (splits only over ℚ(√2)).
FACTOR_CASES = [
    x**2 - y**2, x**2 + y**2, x**2 - 2*y**2, x**4 - y**4,
    (x - y)*(x + y)*(x + 2*y), x**2 + y**2 - 1, x**3 + x - y**2,
    (x - sp.I*y)*(x + sp.I*y + 1),          # ℚ(i) round-trip (two distinct ℚ(i) factors)
    (x - 2*y + 3)*(x + y - 1),              # real round-trip
    x**4 + y**4 - 1,                        # irreducible quartic
    (x**2 - 2*y**2)*(x - y),                # ℚ(i)-irreducible quadratic × a linear factor
]


def gauss_termlist(expr, gens):
    """Serialize a ℚ(i) expr to the engine's MPoly.fromTermList format:
    [{coeff:{re:[num,den], im:[num,den]}, mono:{var:exp}}, ...]."""
    expr = sp.expand(expr)
    if expr == 0:
        return []
    P = sp.Poly(expr, *gens)
    out = []
    for monom, coeff in P.terms():
        ce = coeff.as_expr() if hasattr(coeff, "as_expr") else sp.sympify(coeff)
        re = sp.Rational(sp.re(ce))
        im = sp.Rational(sp.im(ce))
        mono = {str(g): int(e) for g, e in zip(gens, monom) if e != 0}
        out.append({"coeff": {"re": [int(re.p), int(re.q)], "im": [int(im.p), int(im.q)]}, "mono": mono})
    return out


def monic_in_x(fac):
    """Divide a factor by its leading coefficient in x (matches the engine's monic-in-x canonicalization)."""
    lc = sp.LC(sp.Poly(fac, x))
    return sp.expand(fac / lc)


def build():
    corpus = {"_generatedBy": "gen-cas-corpus.py (sympy %s)" % sp.__version__,
              "_note": "external-CAS golden values; CI consumes this JSON, does not run the generator",
              "resultants": [], "realRootCounts": [], "groebner": [], "bivariateFactorizations": []}

    for f, g, var, gens in RES_CASES:
        res = sp.expand(sp.resultant(f, g, var))
        res_gens = [gg for gg in gens if gg != var and res.has(gg)]
        corpus["resultants"].append({
            "f": poly_terms(f, gens), "g": poly_terms(g, gens), "var": str(var),
            "vars": [str(v) for v in gens], "result": poly_terms(res, res_gens),
        })

    for p in RRC_CASES:
        sqf = sp.sqf_part(sp.Poly(p, x)).as_expr()   # distinct real roots = roots of the radical
        cnt = sp.Poly(sqf, x).count_roots(-sp.oo, sp.oo)
        corpus["realRootCounts"].append({"p": poly_terms(p, [x]), "var": "x", "count": int(cnt)})

    for polys, gens in GB_CASES:
        G = sp.groebner(polys, *gens, order='grevlex')
        basis = [sp.expand(p) for p in G.exprs]
        lms = sorted((leading_monomial(p, gens) for p in basis), key=lambda m: json.dumps(m, sort_keys=True))
        # monic reduced basis over QQ (divide each by its grevlex leading coeff) for a full-poly check
        monic = []
        for p in basis:
            P = sp.Poly(p, *gens)
            lc = P.LC(order='grevlex')
            monic.append(poly_terms_q(sp.expand(p / lc), gens))
        corpus["groebner"].append({
            "polys": [poly_terms(p, gens) for p in polys], "vars": [str(v) for v in gens],
            "order": "grevlex", "leadingMonomials": lms, "monicBasis": monic,
        })

    for f in FACTOR_CASES:
        fac = sp.factor(f, gaussian=True)
        facs = fac.args if isinstance(fac, sp.Mul) else [fac]
        facs = [monic_in_x(ff) for ff in facs if ff.free_symbols]   # drop constant units, canonicalize
        corpus["bivariateFactorizations"].append({
            "poly": gauss_termlist(f, [x, y]), "vars": ["x", "y"],
            "factors": [gauss_termlist(ff, [x, y]) for ff in facs],
        })

    return corpus


def poly_terms_q(expr, gens):
    """Like poly_terms but coeffs may be rationals ⇒ [num, den]."""
    expr = sp.expand(expr)
    if expr == 0:
        return []
    P = sp.Poly(expr, *gens)
    out = []
    for monom, coeff in P.terms():
        q = sp.nsimplify(coeff)
        r = sp.Rational(q)
        mono = {str(g): int(e) for g, e in zip(gens, monom) if e != 0}
        out.append([[int(r.p), int(r.q)], mono])
    return out


if __name__ == "__main__":
    corpus = build()
    out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cas-corpus.json")
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(corpus, fh, indent=1, sort_keys=True)
        fh.write("\n")
    print("wrote", out_path,
          "(%d resultants, %d root-counts, %d groebner, %d factorizations)" %
          (len(corpus["resultants"]), len(corpus["realRootCounts"]), len(corpus["groebner"]),
           len(corpus["bivariateFactorizations"])))
