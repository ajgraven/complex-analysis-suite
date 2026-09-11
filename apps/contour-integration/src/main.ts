// Entry point. Milestone 0 is the scaffold: the app is wired into lint, typecheck, test and build
// before any mathematics lands, so every later commit has a gate to be green against.
// See docs/contour-integration/PLAN.md §7 for what each milestone adds.
const root = document.querySelector("#app");
if (root) {
  const wrap = document.createElement("div");
  wrap.className = "scaffold";

  const h1 = document.createElement("h1");
  h1.textContent = "Contour Integration";

  const blurb = document.createElement("p");
  blurb.textContent =
    "A sandbox for contour integration and the residue theorem — draw a contour, watch the integral accumulate, and see whether the argument closes.";

  const status = document.createElement("p");
  status.append(
    Object.assign(document.createElement("strong"), { textContent: "Milestone 0: scaffold." }),
    " Nothing is drawn yet. The plane, the contour and the ledger arrive in M1–M3; see ",
    Object.assign(document.createElement("code"), {
      textContent: "docs/contour-integration/PLAN.md",
    }),
    ".",
  );

  wrap.append(h1, blurb, status);
  root.replaceChildren(wrap);
}
