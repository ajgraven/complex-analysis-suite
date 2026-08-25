// apps/2d-electrostatics — the potential-theory view (M3.1): a compact set K as a grounded CONDUCTOR.
// One pane in the z-plane shows K with (a) its EQUILIBRIUM CHARGE — the dots Ψ(e^{iθ}) at uniform θ,
// crowding where the charge concentrates (corners, tips), coloured by local density; (b) the GREEN
// EQUIPOTENTIALS g_K = t, the images Ψ(|w| = eᵗ) nested around K; (c) faint FIELD LINES orthogonal to
// them. The capacity cap(K) = |leading coeff of Ψ| is read out. Every quantity is `=` for the closed-form
// and Schwarz–Christoffel domain classes. This is the electrostatic lens of the paper: μ_K is literally
// the charge on a conductor, cap(K) its capacitance, g_K its exterior potential. Fourth page of the app.
import "./styles/main.css";
import { runWithFatalBoundary, attachCanvasA11y } from "@cas/ui";
import type { NetCurve, Pt } from "./transplant.js";
import {
  diskDomain,
  ellipseDomain,
  segmentDomain,
  deltoidDomain,
  polygonDomain,
  equilibriumDots,
  chargeDensity,
  greenCurve,
  fieldLine,
  type ExteriorDomain,
} from "./potentialDomain.js";
import { POLYGON_PRESETS } from "./transplantPresets.js";
import { Net2D, boundsOf } from "./render/net2d.js";
import { faberZeros } from "./faberZeros.js";
import { lejaPoints, transfiniteDiameter } from "./feketePoints.js";

interface DomainEntry {
  readonly id: string;
  readonly name: string;
  make(): ExteriorDomain;
}

const DOMAINS: readonly DomainEntry[] = [
  { id: "segment1", name: "Segment [−1, 1]", make: () => segmentDomain(1) },
  { id: "segment2", name: "Segment [−2, 2]", make: () => segmentDomain(2) },
  { id: "disk", name: "Disk", make: () => diskDomain(1.2) },
  { id: "ellipse", name: "Ellipse (2:1)", make: () => ellipseDomain(2, 1) },
  { id: "deltoid", name: "Deltoid", make: () => deltoidDomain() },
  ...POLYGON_PRESETS.map((p): DomainEntry => ({ id: p.id, name: p.label, make: () => polygonDomain(p.id, p.label, p.corners) })),
];
const DEFAULT_DOMAIN = "segment1";

// Green equipotential levels g_K = t (t = 0 is ∂K, drawn separately as the conductor).
const GREEN_LEVELS = [0.12, 0.28, 0.48, 0.72, 1.02, 1.4];
const FIELD_LINES = 48;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Density → a cool→hot colour (blue low, red high), on a fraction f = d / dmax ∈ [0, 1]. */
function densityColor(f: number): string {
  const hue = 210 - 210 * Math.max(0, Math.min(1, f)); // 210 (blue) → 0 (red)
  return `hsl(${hue.toFixed(0)}, 90%, ${(58 + 8 * f).toFixed(0)}%)`;
}

function main(): void {
  const app = document.getElementById("app");
  if (!app) return;
  app.textContent = "";

  let domainId = DEFAULT_DOMAIN;
  let showFaber = false;
  let faberN = 12;
  let showFekete = false;
  let feketeN = 20;

  // ---- toolbar --------------------------------------------------------------
  const bar = el("header", "toolbar");
  const brand = el("div", "brand");
  brand.innerHTML = "<strong>2D Electrostatics · Potential theory</strong><span>a compact set K as a grounded conductor</span>";
  const back = el("a", "pal-btn", "← Field sandbox");
  (back as HTMLAnchorElement).href = "./";
  const polyLink = el("a", "pal-btn", "Polygon →");
  (polyLink as HTMLAnchorElement).href = "./polygon.html";

  const controls = el("div", "foil-controls");
  const domRow = el("label", "row");
  const domHead = el("span", "row-h");
  domHead.append(el("span", "row-l", "Conductor K"));
  const domSel = el("select", "tp-select");
  for (const d of DOMAINS) {
    const opt = el("option", undefined, d.name);
    opt.value = d.id;
    if (d.id === domainId) opt.selected = true;
    domSel.append(opt);
  }
  domRow.append(domHead, domSel);

  // Faber-zero overlay: a toggle + an order-n slider (the zeros of Fₙ converge to μ_K on corner domains).
  const faberCheck = el("label", "check");
  const faberBox = el("input");
  faberBox.type = "checkbox";
  faberBox.checked = showFaber;
  faberCheck.append(faberBox, el("span", undefined, "Faber zeros Fₙ"));

  const nRow = el("label", "row");
  const nHead = el("span", "row-h");
  const nVal = el("span", "row-v", String(faberN));
  nHead.append(el("span", "row-l", "order n"), nVal);
  const nInput = el("input");
  nInput.type = "range";
  nInput.min = "1";
  nInput.max = "40";
  nInput.step = "1";
  nInput.value = String(faberN);
  nRow.append(nHead, nInput);
  nRow.style.display = "none"; // shown only when the overlay is on

  // Fekete/Leja points: a toggle + an n slider (the extremal points → μ_K; dₙ → cap).
  const feketeCheck = el("label", "check");
  const feketeBox = el("input");
  feketeBox.type = "checkbox";
  feketeBox.checked = showFekete;
  feketeCheck.append(feketeBox, el("span", undefined, "Fekete/Leja points"));

  const fRow = el("label", "row");
  const fHead = el("span", "row-h");
  const fVal = el("span", "row-v", String(feketeN));
  fHead.append(el("span", "row-l", "points n"), fVal);
  const fInput = el("input");
  fInput.type = "range";
  fInput.min = "2";
  fInput.max = "60";
  fInput.step = "1";
  fInput.value = String(feketeN);
  fRow.append(fHead, fInput);
  fRow.style.display = "none";

  controls.append(domRow, faberCheck, nRow, feketeCheck, fRow);

  const readout = el("div", "readout tp-readout");
  bar.append(brand, back, polyLink, controls, readout);

  // ---- single conductor pane ------------------------------------------------
  const stage = el("div", "pot-stage");
  const fig = el("figure", "foil-pane");
  const canvas = el("canvas", "foil-canvas");
  attachCanvasA11y(canvas, {
    role: "img",
    label: "A compact set K as a grounded conductor: its equilibrium charge, Green equipotentials, and field lines",
  });
  const cap = el("figcaption");
  cap.innerHTML =
    "<b>The conductor K</b> — equilibrium charge (dots, crowding = density), Green equipotentials g<sub>K</sub> = t, field lines";
  fig.append(canvas, cap);
  stage.append(fig);
  app.append(bar, stage);

  const net = new Net2D(canvas);

  let frame = 0;
  const paint = (): void => {
    frame = 0;
    const entry = DOMAINS.find((d) => d.id === domainId) ?? DOMAINS[0];
    let domain: ExteriorDomain | null = null;
    try {
      domain = entry.make();
    } catch {
      domain = null;
    }

    // The Faber zeros of the current order (computed once; drawn below and summarised in the readout).
    let faber: { zeros: Pt[]; converged: boolean; residual: number; reachedBoundary: boolean } | null = null;
    if (domain && showFaber) {
      try {
        const fz = faberZeros(domain, faberN);
        const bdryReach = Math.max(1e-9, ...greenCurve(domain, 0, 120).map((p) => Math.hypot(p[0], p[1])));
        const zeroReach = Math.max(0, ...fz.zeros.map((p) => Math.hypot(p[0], p[1])));
        faber = { zeros: fz.zeros, converged: fz.converged, residual: fz.residual, reachedBoundary: zeroReach > 0.7 * bdryReach };
      } catch {
        faber = null;
      }
    }

    // The Fekete/Leja points of the current count + their transfinite diameter dₙ (→ cap).
    let fekete: { points: Pt[]; diameter: number } | null = null;
    if (domain && showFekete) {
      const { points } = lejaPoints(domain, feketeN);
      fekete = { points, diameter: transfiniteDiameter(points) };
    }
    const overlay = faber || fekete;

    if (net.resize()) {
      net.clear();
      if (domain) {
        const d = domain;
        const green = GREEN_LEVELS.map((t): NetCurve => ({ color: "rgba(120,150,210,0.30)", pts: greenCurve(d, t) }));
        const outer = green[green.length - 1].pts;
        const bb = boundsOf([{ color: "", pts: outer }]);
        if (bb) {
          const pad = 0.06 * Math.max(bb.maxx - bb.minx, bb.maxy - bb.miny);
          net.fitBounds({ minx: bb.minx - pad, maxx: bb.maxx + pad, miny: bb.miny - pad, maxy: bb.maxy + pad }, 1.04);
        }
        // Field lines (faint), then equipotentials, then the conductor ∂K, then the charge.
        const lines: NetCurve[] = [];
        for (let j = 0; j < FIELD_LINES; j++) lines.push({ color: "rgba(150,140,110,0.18)", pts: fieldLine(d, (2 * Math.PI * j) / FIELD_LINES) });
        net.drawLines(lines, 0.8);
        net.drawLines(green, 1.0);
        net.strokeBody(greenCurve(d, 0), "#28e0f5", 2);

        const dots = equilibriumDots(d, 200);
        const dens = chargeDensity(dots);
        const dmax = Math.max(...dens, 1e-30);
        const chargeAlpha = overlay ? 0.5 : 1; // dim the charge under an overlay so it stays legible
        for (let i = 0; i < dots.length; i++) {
          const f = dens[i] / dmax;
          net.drawDot(dots[i], densityColor(f), (2.1 + 2.6 * Math.sqrt(f)) * (overlay ? 0.7 : 1), chargeAlpha);
        }
        // Faber zeros (gold) and Fekete/Leja points (magenta) — two more roads to μ_K, over the charge.
        if (faber) for (const z of faber.zeros) net.drawDot(z, "#ffd24a", 4);
        if (fekete) for (const p of fekete.points) net.drawDot(p, "#e879f9", 4);
      }
    }

    // ---- readout -------------------------------------------------------------
    if (domain) {
      const eq = domain.exact ? "=" : "≈";
      let html =
        `capacity cap(K) ${eq} <b>${domain.capacity.toFixed(6)}</b><br>` +
        `<span class="tp-approx">equilibrium μ = Ψ⁎(dθ/2π) · Green g<sub>K</sub> = log|Ψ⁻¹|</span>` +
        (domain.note ? `<br><span class="tp-approx">${domain.note}</span>` : "");
      if (faber) {
        const conv = faber.converged ? "converged" : "not converged";
        const claim = faber.reachedBoundary
          ? "ν(Fₙ) → μ_K: the zeros equidistribute onto ∂K (the charge)"
          : "smooth ∂K: the zeros stay interior — they do <b>not</b> reach μ_K";
        html +=
          `<br><span class="tp-faber">Faber F<sub>${faberN}</sub> zeros ≈ ${conv} · residual ≈ ${faber.residual.toExponential(1)}</span>` +
          `<br><span class="tp-approx">${claim}</span>`;
      }
      if (fekete) {
        html +=
          `<br><span class="tp-fekete">Fekete/Leja: transfinite diameter d<sub>${feketeN}</sub> ≈ ${fekete.diameter.toFixed(4)}</span>` +
          `<br><span class="tp-approx">d<sub>n</sub> ↓ cap(K) = ${domain.capacity.toFixed(4)} · the points → μ_K</span>`;
      }
      readout.innerHTML = html;
    } else {
      readout.innerHTML = `<span class="tp-warn">⚠ the exterior map for this conductor failed to fit</span>`;
    }
  };
  const requestPaint = (): void => {
    if (!frame) frame = requestAnimationFrame(paint);
  };

  domSel.addEventListener("change", () => {
    domainId = domSel.value;
    requestPaint();
  });
  faberBox.addEventListener("change", () => {
    showFaber = faberBox.checked;
    nRow.style.display = showFaber ? "" : "none";
    requestPaint();
  });
  nInput.addEventListener("input", () => {
    faberN = Number(nInput.value);
    nVal.textContent = String(faberN);
    requestPaint();
  });
  feketeBox.addEventListener("change", () => {
    showFekete = feketeBox.checked;
    fRow.style.display = showFekete ? "" : "none";
    requestPaint();
  });
  fInput.addEventListener("input", () => {
    feketeN = Number(fInput.value);
    fVal.textContent = String(feketeN);
    requestPaint();
  });
  window.addEventListener("resize", requestPaint);
  requestPaint();
}

runWithFatalBoundary(main);
