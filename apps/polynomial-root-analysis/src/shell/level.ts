// The level glyph (`=`, `≈`, `⚠`) with its meaning spelled out for a screen reader — shared by the
// rails and the Analysis card, so it lives beneath both (the card is itself built by the right rail).
import { describeLevel, type Certificate } from "@cas/rigor";
import { h, type Desc } from "@cas/ui";

export function level(cert: Certificate, key: string): Desc {
  return h(
    "span",
    { key, class: "level", "data-level": cert.level },
    h("span", { key: "g", "aria-hidden": "true" }, cert.level),
    h("span", { key: "t", class: "sr" }, `${describeLevel(cert.level)}: `),
  );
}
