// The keyed builder's own contract — moved from Contour Integration's test/shell2.test.ts with the
// module (ADR-0047: Polynomial Root Analysis is its second consumer). Every case below was a real
// defect in that app's shell; see the header of src/dom.ts.
import { describe, expect, it } from "vitest";
import { h, patch } from "../src/index.js";

const q = <T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string): T => {
  const e = root.querySelector<T>(sel);
  if (e === null) throw new Error(`no ${sel}`);
  return e;
};

describe("the keyed builder", () => {
  it("keeps the same NODE when a key persists, even across a reorder", () => {
    // The rule M7.2's sweep bought: `replaceChildren` destroys the buttons, so a reader who has
    // tabbed to one loses focus. Identity is the property; text is only how it is observed.
    const host = document.createElement("div");
    patch(host, [h("button", { key: "a" }, "A"), h("button", { key: "b" }, "B")]);
    const [a, b] = [...host.children];
    patch(host, [h("button", { key: "b" }, "B"), h("button", { key: "a" }, "A2")]);
    expect(host.children[0]).toBe(b);
    expect(host.children[1]).toBe(a);
    expect(host.children[1].textContent).toBe("A2");
    // And a key that goes away takes its node with it.
    patch(host, [h("button", { key: "b" }, "B")]);
    expect([...host.children]).toEqual([b]);
  });

  it("writes an `aria-*` boolean as a WORD, not as presence or absence", () => {
    // HTML's boolean attributes are present-or-absent and `true` means the empty string; ARIA's are
    // values. `aria-pressed="false"` says *this toggle is off* where an absent one says *this is not
    // a toggle*, and `aria-pressed=""` is read as undefined rather than as pressed — so the general
    // rule got BOTH directions wrong, invisibly, since `theme.css` styles `[aria-pressed="true"]`
    // and that selector simply never matched.
    const host = document.createElement("div");
    patch(host, [
      h("button", { key: "off", "aria-pressed": false }),
      h("button", { key: "on", "aria-pressed": true }),
      h("div", { key: "hidden", hidden: true }),
      h("div", { key: "shown", hidden: false }),
    ]);
    expect(host.children[0].getAttribute("aria-pressed")).toBe("false");
    expect(host.children[1].getAttribute("aria-pressed")).toBe("true");
    // And the ordinary rule is untouched: a non-ARIA boolean is still presence-or-absence.
    expect(host.children[2].getAttribute("hidden")).toBe("");
    expect(host.children[3].hasAttribute("hidden")).toBe(false);
  });

  it("REFUSES two children of one parent that share a key", () => {
    // A duplicate key is a caller's bug that used to be silent and permanent: the map holds one node
    // per key, so the first is never matched and never removed, and the app draws it twice forever.
    // Step 1.4 shipped exactly that for one render — a card's table taking the `<h2>`'s key.
    const host = document.createElement("div");
    expect(() => patch(host, [h("h2", { key: "t" }, "A"), h("table", { key: "t" })])).toThrow(/share the key 't'/);
  });

  it("OWNS its parent's children: anything it did not put there is removed", () => {
    // Removal by "what is left in the key map" misses a node that has no key at all, so a stray
    // appended into a patched parent lives there forever. Removing by "not wanted" makes the
    // contract statable: a patched parent is the patch's, and the shell appends to its own hosts.
    const host = document.createElement("div");
    patch(host, [h("p", { key: "a" }, "A")]);
    host.append(document.createElement("hr"));
    expect(host.children.length).toBe(2);
    patch(host, [h("p", { key: "a" }, "A")]);
    expect(host.children.length, "a foreign node survived a patch").toBe(1);
  });

  it("removes a node whose key another child TOOK, rather than stranding it", () => {
    // The other half of the same defect: removal used to be "whatever is left in the key map", and a
    // node that had been displaced from that map was in neither list.
    const host = document.createElement("div");
    patch(host, [h("h2", { key: "t" }, "A")]);
    patch(host, [h("p", { key: "t" }, "B")]);
    expect(host.children.length).toBe(1);
    expect(host.children[0].tagName).toBe("P");
  });

  it("leaves a FOCUSED input focused, with its caret, across a patch", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const draw = (value: string, label: string): void => {
      patch(host, [h("input", { key: "expr", type: "text", value, "aria-label": label })]);
    };
    draw("1/z", "integrand f(z)");
    const input = q<HTMLInputElement>(host, "input");
    input.focus();
    input.setSelectionRange(1, 1);
    expect(document.activeElement).toBe(input);

    // A patch that changes a NEIGHBOURING attribute must not touch the value, and so must not move
    // the caret. This is the case that actually happens: the reader types, and something else on
    // the card re-renders.
    draw("1/z", "cofactor R(z)");
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(1);
    expect(input.getAttribute("aria-label")).toBe("cofactor R(z)");
    // The node was never re-created, which is what makes the above true rather than lucky.
    expect(q<HTMLInputElement>(host, "input")).toBe(input);
  });

  it("REPLACES a listener rather than adding one, so a button fires once", () => {
    const host = document.createElement("div");
    let first = 0;
    let second = 0;
    patch(host, [h("button", { key: "go", onClick: () => (first += 1) }, "go")]);
    patch(host, [h("button", { key: "go", onClick: () => (second += 1) }, "go")]);
    patch(host, [h("button", { key: "go", onClick: () => (second += 1) }, "go")]);
    q<HTMLButtonElement>(host, "button").click();
    // Three renders, one click: the first handler is gone and the current one ran exactly once.
    expect(first).toBe(0);
    expect(second).toBe(1);
  });

  it("removes a listener the description drops, and one it sets to undefined", () => {
    // TWO paths, and the sweep found only one of them covered. A card that writes
    // `onClick: enabled ? fn : undefined` keeps the KEY and drops the function, which the removal
    // loop over the previous props never sees — so it is the second loop's `else` that must clear it.
    const host = document.createElement("div");
    let fired = 0;
    const on = (): number => (fired += 1);

    patch(host, [h("button", { key: "go", onClick: on }, "go")]);
    patch(host, [h("button", { key: "go" }, "go")]);
    q<HTMLButtonElement>(host, "button").click();
    expect(fired, "dropped from the props entirely").toBe(0);

    patch(host, [h("button", { key: "go", onClick: on }, "go")]);
    patch(host, [h("button", { key: "go", onClick: undefined }, "go")]);
    q<HTMLButtonElement>(host, "button").click();
    expect(fired, "present but not a function").toBe(0);
  });

  it("writes a property only when it DIFFERS — counted, not inferred", () => {
    // **The first draft of this rule was tested vacuously and a sweep found it.** The caret test
    // above patches twice with the same string, and jsdom does not move the selection on a
    // same-value write — so "unconditional" survived it. What the guard actually does is skip the
    // WRITE, and a write is countable.
    const host = document.createElement("div");
    patch(host, [h("input", { key: "i", type: "text", value: "1/z" })]);
    const input = q<HTMLInputElement>(host, "input");
    const writes: string[] = [];
    const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    Object.defineProperty(input, "value", {
      configurable: true,
      get: () => proto?.get?.call(input) as string,
      set: (v: string) => {
        writes.push(v);
        proto?.set?.call(input, v);
      },
    });
    patch(host, [h("input", { key: "i", type: "text", value: "1/z" })]);
    expect(writes).toEqual([]);
    patch(host, [h("input", { key: "i", type: "text", value: "1/(1+z^2)" })]);
    expect(writes).toEqual(["1/(1+z^2)"]);
  });

  it("clears an attribute the description drops", () => {
    const host = document.createElement("div");
    patch(host, [h("input", { key: "i", type: "checkbox", checked: true, "data-x": "1" })]);
    const input = q<HTMLInputElement>(host, "input");
    expect(input.checked).toBe(true);
    expect(input.getAttribute("data-x")).toBe("1");
    patch(host, [h("input", { key: "i", type: "checkbox", checked: false })]);
    expect(input.checked).toBe(false);
    expect(input.hasAttribute("data-x")).toBe(false);
  });
});
