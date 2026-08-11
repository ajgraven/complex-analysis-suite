/**
 * Recursive-descent / precedence parser for the expression language.
 *
 * Precedence (low → high): comparison `> < ==` ; `+ -` ; `* /` ; unary `-` ;
 * `^` (right-associative). A program is a `;`-separated list of statements, each
 * either an assignment `name = expr` or a bare expression; the last statement's
 * value is the program's result.
 */

import {
  BINARY_FUNCTIONS,
  COMPLEX_FUNCTIONS,
  ExprError,
  type ArithOp,
  type CompareOp,
  type ConstName,
  type Node,
} from "./ast";
import { tokenize, type Token } from "./lexer";

const CONSTS = new Set<ConstName>(["i", "e", "pi", "tau", "phi", "γ"]);

class Parser {
  private pos = 0;
  private depth = 0;
  // Cap nesting recursion so a pathologically nested input can't overflow the stack. 256 levels is far
  // beyond any real map expression yet well under the engine's stack limit (~7 frames per level). See
  // parseExpr. (EXPR-5, defense-in-depth — call sites already catch, this just makes it a clean error.)
  private static readonly MAX_DEPTH = 256;
  constructor(private readonly tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.pos];
  }
  private next(): Token {
    return this.tokens[this.pos++];
  }
  private expect(type: Token["type"], what: string): Token {
    const tok = this.peek();
    if (tok.type !== type) throw new ExprError(`Expected ${what}`, tok.pos);
    return this.next();
  }

  parseProgram(): Node {
    const stmts: Node[] = [];
    while (this.peek().type !== "eof") {
      if (this.peek().type === "semi") {
        this.next();
        continue;
      }
      stmts.push(this.parseStatement());
      // A statement must be followed by ';' or end-of-input. Without this, two
      // adjacent expressions ("z c", "1.2.3", "1 e") silently parse as a multi-
      // statement sequence whose value is the last one — a typo becoming a wrong
      // result instead of an error.
      const after = this.peek();
      if (after.type === "semi") {
        this.next();
      } else if (after.type !== "eof") {
        throw new ExprError(`Expected ';' or end of input`, after.pos);
      }
    }
    if (stmts.length === 0) throw new ExprError("Empty expression", 0);
    return stmts.length === 1 ? stmts[0] : { kind: "seq", stmts };
  }

  private parseStatement(): Node {
    const tok = this.peek();
    if (tok.type === "ident" && this.tokens[this.pos + 1]?.type === "assign") {
      const name = this.next().value;
      this.next(); // '='
      return { kind: "assign", name, value: this.parseExpr() };
    }
    return this.parseExpr();
  }

  /**
   * Run `body` one nesting level deeper, refusing past MAX_DEPTH.
   *
   * This has to wrap EVERY self-recursive descent, not just the primary one. The guard used to live
   * only in `parseExpr` — so parenthesis nesting was covered, but `parseUnary` recursing on itself for
   * each leading `-` was not, and neither was `parsePower` re-entering it for an exponent. A long run
   * of minus signs therefore blew the JS stack and surfaced a positionless "Maximum call stack size
   * exceeded" instead of the clean, positioned ExprError this guard exists to produce. Nothing is
   * lexer-side to bound the chain. (expr-parser-01)
   */
  private nested<T>(body: () => T): T {
    if (this.depth >= Parser.MAX_DEPTH) {
      throw new ExprError("Expression nested too deeply", this.peek().pos);
    }
    this.depth++;
    try {
      return body();
    } finally {
      this.depth--;
    }
  }

  private parseExpr(): Node {
    // The primary recursion path: parens and call args re-enter here.
    return this.nested(() => this.parseComparison());
  }

  private parseComparison(): Node {
    const left = this.parseAdditive();
    const tok = this.peek();
    if (tok.type === "cmp") {
      this.next();
      return {
        kind: "compare",
        op: tok.value as CompareOp,
        left,
        right: this.parseAdditive(),
      };
    }
    return left;
  }

  private parseAdditive(): Node {
    let left = this.parseMultiplicative();
    while (
      this.peek().type === "op" &&
      (this.peek().value === "+" || this.peek().value === "-")
    ) {
      const op = this.next().value as ArithOp;
      left = { kind: "arith", op, left, right: this.parseMultiplicative() };
    }
    return left;
  }

  private parseMultiplicative(): Node {
    let left = this.parseUnary();
    while (
      this.peek().type === "op" &&
      (this.peek().value === "*" || this.peek().value === "/")
    ) {
      const op = this.next().value as ArithOp;
      left = { kind: "arith", op, left, right: this.parseUnary() };
    }
    return left;
  }

  private parseUnary(): Node {
    if (this.peek().type === "op" && this.peek().value === "-") {
      this.next();
      // Counted: `-----…-z` recurses once per sign, and `parsePower` reaches this for an exponent too,
      // so both of the paths the old guard missed are now bounded.
      return this.nested((): Node => ({ kind: "neg", operand: this.parseUnary() }));
    }
    return this.parsePower();
  }

  private parsePower(): Node {
    const base = this.parsePrimary();
    if (this.peek().type === "op" && this.peek().value === "^") {
      this.next();
      // Right-associative; exponent may carry its own unary minus. Counted here rather than by wrapping
      // all of parseUnary, because `z^z^z^…` recurses through parseUnary's NON-minus branch (straight
      // back into parsePower) — and wrapping the whole of parseUnary would charge every plain operand a
      // level, halving the effective cap for parenthesis nesting.
      return this.nested((): Node => ({
        kind: "arith",
        op: "^",
        left: base,
        right: this.parseUnary(),
      }));
    }
    return base;
  }

  private parsePrimary(): Node {
    const tok = this.peek();
    switch (tok.type) {
      case "number":
        this.next();
        return { kind: "num", value: Number.parseFloat(tok.value) };
      case "imag": {
        // An imaginary literal `<num>i` desugars to `<num> * i` (B5). Returning it from parsePrimary makes
        // the whole product the atomic base of any following `^`, so `2i^2` = `(2i)^2` (not `2·(i^2)`).
        this.next();
        return {
          kind: "arith",
          op: "*",
          left: { kind: "num", value: Number.parseFloat(tok.value) },
          right: { kind: "const", name: "i" },
        };
      }
      case "lparen": {
        this.next();
        const inner = this.parseExpr();
        this.expect("rparen", "')'");
        return inner;
      }
      case "ident":
        return this.parseIdent();
      default:
        throw new ExprError(`Unexpected token '${tok.value || tok.type}'`, tok.pos);
    }
  }

  private parseIdent(): Node {
    const tok = this.next();
    const name = tok.value;
    const isCall = this.peek().type === "lparen";

    if (!isCall) {
      if (name === "true") return { kind: "bool", value: true };
      if (name === "false") return { kind: "bool", value: false };
      if (CONSTS.has(name as ConstName))
        return { kind: "const", name: name as ConstName };
      return { kind: "var", name };
    }

    const args = this.parseArgs();
    if (name === "if") {
      if (args.length !== 3) throw new ExprError("if(...) takes 3 arguments", tok.pos);
      return { kind: "if", cond: args[0], then: args[1], otherwise: args[2] };
    }
    if (name === "not") {
      if (args.length !== 1) throw new ExprError("not(...) takes 1 argument", tok.pos);
      return { kind: "not", operand: args[0] };
    }
    if (COMPLEX_FUNCTIONS.has(name)) {
      if (args.length !== 1)
        throw new ExprError(`${name}(...) takes 1 argument`, tok.pos);
    } else if (BINARY_FUNCTIONS.has(name)) {
      if (args.length !== 2)
        throw new ExprError(`${name}(...) takes 2 arguments`, tok.pos);
    } else if (name === "f") {
      if (args.length !== 2) throw new ExprError("f(...) takes 2 arguments", tok.pos);
    } else {
      throw new ExprError(`Unknown function '${name}'`, tok.pos);
    }
    return { kind: "call", name, args };
  }

  private parseArgs(): Node[] {
    this.expect("lparen", "'('");
    const args: Node[] = [];
    if (this.peek().type !== "rparen") {
      args.push(this.parseExpr());
      while (this.peek().type === "comma") {
        this.next();
        args.push(this.parseExpr());
      }
    }
    this.expect("rparen", "')'");
    return args;
  }
}

/** Parse an expression-language program into an AST (throws {@link ExprError}). */
export function parse(src: string): Node {
  return new Parser(tokenize(src)).parseProgram();
}
