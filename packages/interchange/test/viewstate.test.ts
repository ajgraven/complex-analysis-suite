import { describe, expect, it } from "vitest";
import { encodeViewState, decodeViewState, VIEWSTATE_VERSION } from "../src/index.js";
import { toBase64Url, fromBase64Url } from "../src/base64url.js";

// The shareable UI view-state codec: transport + versioning shared across the suite, each app owning
// its own state schema. These goldens PIN the forward-compat contract that every future version must
// keep (so a link written today still opens in a newer app).

describe("@cas/interchange view-state codec", () => {
  it("round-trips an app's state object under #vs=", () => {
    const state = { mode: "bounded", h: "1/(w-0.3)", c: 2, agg: "high", nested: { a: 1 } };
    const link = encodeViewState("qd", state);
    expect(link.startsWith("#vs=")).toBe(true);
    const env = decodeViewState(link);
    expect(env).not.toBeNull();
    expect(env!.v).toBe(VIEWSTATE_VERSION);
    expect(env!.app).toBe("qd");
    expect(env!.state).toEqual(state);
  });

  it("is unicode-safe", () => {
    const state = { note: "z²+c — café ∞" };
    expect(decodeViewState(encodeViewState("cd", state))!.state).toEqual(state);
  });

  it("uses #vs= (distinct from the map codec's #s=) and accepts a full URL", () => {
    const link = encodeViewState("cd", { a: 1 });
    expect(decodeViewState(`https://example.com/app/${link}`)!.state).toEqual({ a: 1 });
    // The map codec's key is NOT ours.
    expect(decodeViewState("#s=whatever")).toBeNull();
  });

  it("returns null on absent / malformed input (the seatbelt)", () => {
    expect(decodeViewState("")).toBeNull();
    expect(decodeViewState("#vs=@@@not-base64@@@")).toBeNull();
    expect(decodeViewState("#vs=" + toBase64Url("not json"))).toBeNull();
    expect(decodeViewState("#vs=" + toBase64Url(JSON.stringify({ app: "cd", state: {} })))).toBeNull(); // no v
    expect(decodeViewState("#vs=" + toBase64Url(JSON.stringify({ v: 1, state: {} })))).toBeNull(); // no app
  });

  it("rejects a non-object / array state (a crafted link)", () => {
    // encode is lenient; decode is the seatbelt.
    const bad = (s: unknown) => decodeViewState(encodeViewState("cd", s as Record<string, unknown>));
    expect(bad([1, 2, 3])).toBeNull();
    expect(bad(42)).toBeNull();
    expect(bad("hi")).toBeNull();
    expect(bad(null)).toBeNull();
  });

  it("FORWARD-COMPAT: tolerates a higher version + unknown top-level and state fields", () => {
    // A link written by a FUTURE app version: newer envelope version, an extra top-level key, and
    // extra state fields. A current reader must still decode the state it understands, unchanged.
    const future = {
      v: VIEWSTATE_VERSION + 5,
      app: "cd",
      state: { known: 1, futureField: "x" },
      extraTopLevel: "ignored",
    };
    const env = decodeViewState("#vs=" + toBase64Url(JSON.stringify(future)));
    expect(env).not.toBeNull();
    expect(env!.v).toBe(VIEWSTATE_VERSION + 5); // NOT rejected
    expect(env!.state).toEqual({ known: 1, futureField: "x" }); // unknown state fields preserved
  });

  it("accepts an explicitly bumped version at encode time", () => {
    const env = decodeViewState(encodeViewState("cd", { a: 1 }, VIEWSTATE_VERSION + 1));
    expect(env!.v).toBe(VIEWSTATE_VERSION + 1);
  });

  it("SECURITY: rejects prototype-pollution keys and oversized payloads", () => {
    // __proto__ / constructor as OWN keys (JSON.parse defines them, does not walk the setter) ⇒ null,
    // so the codec never forwards a pollution vector to a consumer that might spread env.state.
    const proto = '{"v":1,"app":"cd","state":{"__proto__":{"polluted":1}}}';
    expect(decodeViewState("#vs=" + toBase64Url(proto))).toBeNull();
    const ctor = '{"v":1,"app":"cd","state":{"nested":{"constructor":{"prototype":{"x":1}}}}}';
    expect(decodeViewState("#vs=" + toBase64Url(ctor))).toBeNull();
    // A __proto__ nested ≥ 9 levels deep: the OLD recursive guard capped at depth 8 and returned false,
    // letting it escape the "rejected anywhere" contract. The iterative walk now catches it. (P2)
    const deep = '{"v":1,"app":"cd","state":' + '{"n":'.repeat(10) + '{"__proto__":1}' + "}".repeat(10) + "}";
    expect(decodeViewState("#vs=" + toBase64Url(deep))).toBeNull();
    // An oversized payload is rejected by the length cap BEFORE any decode work.
    expect(decodeViewState("#vs=" + "A".repeat(70 * 1024))).toBeNull();
  });
});

describe("@cas/interchange base64url transport", () => {
  it("throws on bytes that are not valid UTF-8 (fatal decoder), instead of substituting U+FFFD", () => {
    // base64url "gA" → the single byte 0x80, a lone UTF-8 continuation byte; "_w" → 0xFF, never a
    // valid UTF-8 byte. The fatal decoder must reject both rather than return a garbage replacement
    // string that would then trip JSON.parse with a misleading error.
    expect(() => fromBase64Url("gA")).toThrow();
    expect(() => fromBase64Url("_w")).toThrow();
  });

  it("round-trips valid UTF-8, including multi-byte code points", () => {
    for (const s of ["", "z^2+c", "café ∞ 𝔻", '{"v":1}']) {
      expect(fromBase64Url(toBase64Url(s))).toBe(s);
    }
  });

  it("rejects an oversized payload before decoding", () => {
    expect(() => fromBase64Url("A".repeat(70 * 1024))).toThrow(/too large/);
  });
});
