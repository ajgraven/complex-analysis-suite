// The two alphabets the app writes mathematics in — and the one place they differ.
//
// Every exact value the engine reports is composed by the same small machinery: a coefficient times
// a symbol, a quotient, an exponential, a sum of terms. What differs between the text the app has
// always printed (`π√2/2`, `2^(9/4)·5^(3/4)`, `(π/4)/sin(3π/8)`) and the LaTeX Phase 1 typesets
// (`\frac{\pi\sqrt{2}}{2}`) is not the STRUCTURE but the spelling of each join.
//
// So M8 step 0.4b does not write a second set of formatters. It parameterises the existing ones over
// a {@link Notation} and instantiates it twice, which is the only arrangement in which the two
// cannot drift: a term the text form drops is a term the LaTeX form drops, because it is the same
// line of code. The text output is unchanged by construction and proven so by the ledger dump.
//
// **Bracketing is the one place a spelling difference could become a SHAPE difference**, and the
// interface is arranged so that it does not. `quotient` takes the text notation's bracketing needs
// as flags and a LaTeX `\frac` ignores them, because a fraction bar groups its own parts — so the
// two forms differ in where the parentheses are drawn and never in which terms are inside them.
// `test/formatLatex.test.ts` is what holds that: it strips both forms to a common canonical shape
// and requires them to be EQUAL, over every value in the gallery.

/** How one notation spells each join. */
export interface Notation {
  /** The sign a negative number carries. Text uses a real minus, not a hyphen. */
  readonly minus: string;
  readonly pi: string;
  readonly imaginary: string;
  /** Euler's number as a standalone symbol. */
  readonly e: string;
  /** `1/e`, which `attachExponential` folds into a coefficient. */
  readonly recipE: string;
  /** The multiplication sign between two rendered factors. */
  readonly times: string;
  /**
   * Run rendered symbols together — `π` and `i` into `πi`, `π` and `√2` into `π√2`.
   *
   * **Not string concatenation**, which is what it looks like and is what the first draft did:
   * `\pi` followed by `i` is `\pii`, an undefined control sequence, and KaTeX refuses the whole
   * expression. Every `2πi` in the gallery came out that way. A LaTeX control sequence ends where
   * its letters end, so a space goes in exactly when the next part starts with one.
   */
  juxtapose(...parts: readonly string[]): string;
  /** `√d`. */
  radical(d: bigint): string;
  /** `head / d` for a positive integer `d` — the denominator a coefficient carries. */
  over(head: string, d: bigint): string;
  /**
   * `num / den`.
   *
   * The two flags are the TEXT notation's bracketing needs, computed by the caller so that each call
   * site keeps its own rule; a LaTeX `\frac` is self-delimiting and ignores both.
   */
  quotient(num: string, den: string, bracket: { num: boolean; den: boolean }): string;
  /** `left · right`, bracketing the left factor when the caller says it needs it. */
  product(left: string, right: string, bracketLeft: boolean): string;
  group(inner: string): string;
  /** `e^{x}`. */
  exp(exponent: string): string;
  /** `base^{exponent}` for an already-rendered exponent. */
  power(base: string, exponent: string): string;
  /** `base^{k}` for an integer `k` — where the text notation reaches for a Unicode superscript. */
  intPower(base: string, k: bigint): string;
  /** `ln p`. */
  ln(of: string): string;
  /** `sin(x)`, `coth(x)` — a named function of one argument. */
  call(name: string, arg: string): string;
  /** Whether a rendered value is a SUM, and so needs bracketing before anything multiplies it. */
  isSum(text: string): boolean;
  /**
   * Whether a rendered value is a quotient, which decides two of the formatters' shape choices:
   * whether to bracket it before a `·`, and whether to fold a `1/e` into it.
   *
   * Asked of the notation rather than by a `.includes("/")` at the call site, because a LaTeX
   * quotient is a `\frac` and carries no slash — and answering it wrongly would not misrender
   * anything, it would silently make the two forms choose DIFFERENT shapes for the same value, which
   * is exactly what `test/formatLatex.test.ts` compares them for.
   */
  hasQuotient(text: string): boolean;
}

const SUPERSCRIPT_DIGITS = ["⁰", "¹", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹"];

/** `12` → `¹²`, `-3` → `⁻³`. */
export function superscript(n: bigint | number): string {
  return String(n)
    .split("")
    .map((d) => (d === "-" ? "⁻" : (SUPERSCRIPT_DIGITS[Number(d)] ?? d)))
    .join("");
}

/** What the app has always printed: Unicode mathematics in a monospace-friendly line. */
export const TEXT: Notation = {
  minus: "−",
  pi: "π",
  imaginary: "i",
  e: "e",
  recipE: "1/e",
  times: "·",
  juxtapose: (...parts) => parts.join(""),
  radical: (d) => `√${d}`,
  over: (head, d) => `${head}/${d}`,
  quotient: (num, den, bracket) =>
    `${bracket.num ? `(${num})` : num}/${bracket.den ? `(${den})` : den}`,
  product: (left, right, bracketLeft) => `${bracketLeft ? `(${left})` : left}·${right}`,
  group: (inner) => `(${inner})`,
  exp: (exponent) => `e^(${exponent})`,
  power: (base, exponent) => `${base}^(${exponent})`,
  intPower: (base, k) => (k === 1n ? base : `${base}${superscript(k)}`),
  ln: (of) => `ln ${of}`,
  call: (name, arg) => `${name}(${arg})`,
  isSum: (text) => text.includes(" + ") || text.includes(" − "),
  hasQuotient: (text) => text.includes("/"),
};

/** The same values for KaTeX. */
export const LATEX: Notation = {
  minus: "-",
  pi: "\\pi",
  imaginary: "i",
  e: "e",
  recipE: "\\frac{1}{e}",
  times: " \\cdot ",
  juxtapose: (...parts) =>
    parts.reduce((acc, part) =>
      acc === "" || part === ""
        ? `${acc}${part}`
        : `${acc}${/\\[A-Za-z]+$/.test(acc) && /^[A-Za-z]/.test(part) ? " " : ""}${part}`,
    ""),
  radical: (d) => `\\sqrt{${d}}`,
  over: (head, d) => `\\frac{${head}}{${d}}`,
  // A fraction bar groups both of its parts, so neither flag applies.
  quotient: (num, den) => `\\frac{${num}}{${den}}`,
  product: (left, right, bracketLeft) =>
    `${bracketLeft ? `\\left(${left}\\right)` : left} \\cdot ${right}`,
  group: (inner) => `\\left(${inner}\\right)`,
  exp: (exponent) => `e^{${exponent}}`,
  power: (base, exponent) => `${base}^{${exponent}}`,
  intPower: (base, k) => (k === 1n ? base : `${base}^{${k}}`),
  ln: (of) => `\\ln ${of}`,
  // `\sin` and `\coth` are operators; `csch` is not, and neither is a bare `sin` written as text.
  call: (name, arg) => `${OPERATORS.has(name) ? `\\${name}` : `\\operatorname{${name}}`}${`\\left(${arg}\\right)`}`,
  isSum: (text) => text.includes(" + ") || text.includes(" - "),
  hasQuotient: (text) => text.includes("\\frac"),
};

/** The function names KaTeX has a control sequence for. Everything else takes `\operatorname`. */
const OPERATORS = new Set(["sin", "cos", "tan", "sec", "csc", "cot", "sinh", "cosh", "tanh", "coth", "ln", "log", "exp", "arg", "max", "min"]);
