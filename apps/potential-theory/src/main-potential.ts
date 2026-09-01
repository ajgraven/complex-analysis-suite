// apps/potential-theory — a compact set K as a grounded CONDUCTOR (M3; carved out of 2d-electrostatics, ADR-0036). One
// pane shows K with its equilibrium charge (μ_K), Green equipotentials (g_K), and — as overlays — the
// Faber-polynomial zeros and the Fekete/Leja points, three roads to the equilibrium measure.
//
// Two domain classes: EXTERIOR-MAP (SC polygons + closed forms), where every quantity is an exact `=`
// pushforward Ψ(circles); and GENERAL K (smooth blobs), where there is no closed-form map, so capacity /
// Green / charge come from a log-lightning fit (`≈`) and the Green equipotentials are marching-squares
// level curves of the g_K field. Fourth page of the app.
import "./styles/main.css";
import { runWithFatalBoundary, attachCanvasA11y } from "@cas/ui";
import { POLYGON_PRESETS, Net2D, boundsOf, type NetCurve, type Pt } from "@cas/flow";
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
import { blobDomain, ovalDomain, offDiskDomain, type GeneralDomain } from "./generalDomains.js";
import { sampleField, contourSegments, type ScalarField, type FieldBounds } from "./render/marchingSquares.js";
import { faberZeros } from "./faberZeros.js";
import { lejaPoints, lejaFromCurve, transfiniteDiameter } from "./feketePoints.js";

type AnyDomain = ExteriorDomain | GeneralDomain;
const isGeneral = (d: AnyDomain): d is GeneralDomain => "kind" in d && d.kind === "general";

interface DomainEntry {
  readonly id: string;
  readonly name: string;
  readonly general: boolean;
  make(): AnyDomain;
}

const EXTERIOR_DOMAINS: readonly DomainEntry[] = [
  { id: "segment1", name: "Segment [−1, 1]", general: false, make: () => segmentDomain(1) },
  { id: "segment2", name: "Segment [−2, 2]", general: false, make: () => segmentDomain(2) },
  { id: "disk", name: "Disk", general: false, make: () => diskDomain(1.2) },
  { id: "ellipse", name: "Ellipse (2:1)", general: false, make: () => ellipseDomain(2, 1) },
  { id: "deltoid", name: "Deltoid", general: false, make: () => deltoidDomain() },
  ...POLYGON_PRESETS.map((p): DomainEntry => ({ id: p.id, name: p.label, general: false, make: () => polygonDomain(p.id, p.label, p.corners) })),
];
const GENERAL_DOMAINS: readonly DomainEntry[] = [
  { id: "blob", name: "Smooth blob", general: true, make: blobDomain },
  { id: "oval", name: "Rounded oval", general: true, make: ovalDomain },
  { id: "offdisk", name: "Off-centre disk", general: true, make: offDiskDomain },
];
const DOMAINS: readonly DomainEntry[] = [...EXTERIOR_DOMAINS, ...GENERAL_DOMAINS];
const DEFAULT_DOMAIN = "segment1";

const GREEN_LEVELS = [0.12, 0.28, 0.48, 0.72, 1.02, 1.4]; // exterior (pushforward)
const GREEN_LEVELS_GENERAL = [0.12, 0.26, 0.42, 0.6, 0.82]; // general (marching squares — stay near K)
const FIELD_LINES = 48;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Density → a cool→hot colour (blue low, red high), fraction f ∈ [0,1]. */
function densityColor(f: number): string {
  const hue = 210 - 210 * Math.max(0, Math.min(1, f));
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
  brand.innerHTML = "<strong>Potential Theory</strong><span>a compact set K as a grounded conductor</span>";
  const back = el("a", "pal-btn", "← Complex Analysis Suite");
  (back as HTMLAnchorElement).href = "../";

  const controls = el("div", "foil-controls");
  const domRow = el("label", "row");
  const domHead = el("span", "row-h");
  domHead.append(el("span", "row-l", "Conductor K"));
  const domSel = el("select", "tp-select");
  const addGroup = (label: string, entries: readonly DomainEntry[]): void => {
    const g = el("optgroup");
    g.label = label;
    for (const d of entries) {
      const opt = el("option", undefined, d.name);
      opt.value = d.id;
      if (d.id === domainId) opt.selected = true;
      g.append(opt);
    }
    domSel.append(g);
  };
  addGroup("Exterior map (exact =)", EXTERIOR_DOMAINS);
  addGroup("General K (log-lightning ≈)", GENERAL_DOMAINS);
  domRow.append(domHead, domSel);

  // Faber-zero overlay (exterior-map domains only — a general K has no exterior map).
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
  nRow.style.display = "none";

  // Fekete/Leja overlay (works on any K — it needs only ∂K samples).
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
  bar.append(brand, back, controls, readout);

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
    "<b>The conductor K</b> — equilibrium charge (dots, crowding = density), Green equipotentials g<sub>K</sub> = t";
  fig.append(canvas, cap);
  stage.append(fig);
  app.append(bar, stage);

  const net = new Net2D(canvas);

  // Cache the built domain (and, for a general K, the sampled g_K field) so the log-lightning solve and
  // grid evaluation are not repeated on every pan/toggle — only when the domain changes.
  interface Built {
    id: string;
    domain: AnyDomain | null;
    field?: ScalarField;
    bounds?: FieldBounds;
  }
  let built: Built | null = null;
  const currentBuilt = (): Built => {
    if (built && built.id === domainId) return built;
    const entry = DOMAINS.find((d) => d.id === domainId) ?? DOMAINS[0];
    let domain: AnyDomain | null;
    try {
      domain = entry.make();
    } catch {
      domain = null;
    }
    let field: ScalarField | undefined;
    let bounds: FieldBounds | undefined;
    if (domain && isGeneral(domain)) {
      const bb = boundsOf([{ color: "", pts: domain.boundary }]);
      if (bb) {
        const cx = (bb.minx + bb.maxx) / 2;
        const cy = (bb.miny + bb.maxy) / 2;
        const half = 2.2 * Math.max(bb.maxx - bb.minx, bb.maxy - bb.miny) * 0.5;
        bounds = { minx: cx - half, maxx: cx + half, miny: cy - half, maxy: cy + half };
        const g = domain.greenFn;
        field = sampleField((z) => g(z), bounds, 220, 220);
      }
    }
    built = { id: domainId, domain, field, bounds };
    return built;
  };

  let frame = 0;
  const paint = (): void => {
    frame = 0;
    const b = currentBuilt();
    const domain = b.domain;
    faberBox.disabled = !domain || isGeneral(domain); // Faber needs an exterior map
    faberCheck.style.opacity = faberBox.disabled ? "0.4" : "";
    nRow.style.display = showFaber && !faberBox.disabled ? "" : "none"; // keep the order slider in sync



    // ---- overlays (computed once) --------------------------------------------
    let faber: { zeros: Pt[]; converged: boolean; residual: number; equidistributes: boolean } | null = null;
    if (domain && !isGeneral(domain) && showFaber) {
      try {
        const fz = faberZeros(domain, faberN);
        // Whether ν(Fₙ) → μ_K is a LIMIT fact set by ∂K's regularity (corners/cusps → yes; analytic-smooth
        // → no), NOT the finite-n zero positions — which are only partway to ∂K even when the limit holds.
        faber = { zeros: fz.zeros, converged: fz.converged, residual: fz.residual, equidistributes: !domain.smoothBoundary };
      } catch {
        faber = null;
      }
    }
    let fekete: { points: Pt[]; diameter: number } | null = null;
    if (domain && showFekete) {
      const points = isGeneral(domain) ? lejaFromCurve(domain.boundary, feketeN) : lejaPoints(domain, feketeN).points;
      fekete = { points, diameter: transfiniteDiameter(points) };
    }
    const overlay = faber || fekete;

    if (net.resize()) {
      net.clear();
      if (domain && !isGeneral(domain)) drawExterior(domain, overlay !== null, fekete, faber);
      else if (domain && isGeneral(domain)) drawGeneral(domain, b, overlay !== null, fekete);
    }

    // ---- readout -------------------------------------------------------------
    if (domain) {
      const eq = isGeneral(domain) ? "≈" : domain.exact ? "=" : "≈";
      const greenLabel = isGeneral(domain) ? "Green g<sub>K</sub> = U − γ (log-lightning)" : "Green g<sub>K</sub> = log|Ψ⁻¹|";
      let html =
        `capacity cap(K) ${eq} <b>${domain.capacity.toFixed(6)}</b><br>` +
        `<span class="tp-approx">equilibrium μ = charge density · ${greenLabel}</span>`;
      if (isGeneral(domain)) html += `<br><span class="tp-approx">${domain.note ?? ""} · residual ≈ ${domain.residual.toExponential(1)}</span>`;
      else if (domain.note) html += `<br><span class="tp-approx">${domain.note}</span>`;
      if (faber) {
        const conv = faber.converged ? "converged" : "not converged";
        const claim = faber.equidistributes
          ? "ν(Fₙ) → μ_K as n grows: the zeros equidistribute onto ∂K (the charge)"
          : "smooth ∂K: the zeros converge to an interior set — <b>not</b> μ_K";
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
      readout.innerHTML = `<span class="tp-warn">⚠ the conductor's potential failed to compute</span>`;
    }
  };

  /** Draw an equilibrium charge set: dots coloured + sized by local density (normalised). */
  const drawCharge = (dots: readonly Pt[], dens: readonly number[], dim: boolean): void => {
    const dmax = Math.max(...dens, 1e-30);
    for (let i = 0; i < dots.length; i++) {
      const f = dens[i] / dmax;
      net.drawDot(dots[i], densityColor(f), (2.1 + 2.6 * Math.sqrt(f)) * (dim ? 0.7 : 1), dim ? 0.5 : 1);
    }
  };
  const drawOverlays = (fekete: { points: Pt[] } | null, faber: { zeros: Pt[] } | null): void => {
    if (faber) for (const z of faber.zeros) net.drawDot(z, "#ffd24a", 4);
    if (fekete) for (const p of fekete.points) net.drawDot(p, "#e879f9", 4);
  };

  /** Exterior-map K: exact pushforward of the ζ-plane circles/rays. */
  const drawExterior = (d: ExteriorDomain, dim: boolean, fekete: { points: Pt[] } | null, faber: { zeros: Pt[] } | null): void => {
    const green = GREEN_LEVELS.map((t): NetCurve => ({ color: "rgba(120,150,210,0.30)", pts: greenCurve(d, t) }));
    const bb = boundsOf([{ color: "", pts: green[green.length - 1].pts }]);
    if (bb) {
      const pad = 0.06 * Math.max(bb.maxx - bb.minx, bb.maxy - bb.miny);
      net.fitBounds({ minx: bb.minx - pad, maxx: bb.maxx + pad, miny: bb.miny - pad, maxy: bb.maxy + pad }, 1.04);
    }
    const lines: NetCurve[] = [];
    for (let j = 0; j < FIELD_LINES; j++) lines.push({ color: "rgba(150,140,110,0.18)", pts: fieldLine(d, (2 * Math.PI * j) / FIELD_LINES) });
    net.drawLines(lines, 0.8);
    net.drawLines(green, 1.0);
    net.strokeBody(greenCurve(d, 0), "#28e0f5", 2);
    const dots = equilibriumDots(d, 200);
    drawCharge(dots, chargeDensity(dots), dim);
    drawOverlays(fekete, faber);
  };

  /** General K: the g_K field's marching-squares equipotentials + the log-lightning charge density. */
  const drawGeneral = (d: GeneralDomain, b: Built, dim: boolean, fekete: { points: Pt[] } | null): void => {
    if (b.bounds) net.fitBounds(b.bounds, 1.02);
    if (b.field) {
      const green: NetCurve[] = [];
      for (const t of GREEN_LEVELS_GENERAL) for (const [p, q] of contourSegments(b.field, t)) green.push({ color: "rgba(120,150,210,0.34)", pts: [p, q] });
      net.drawLines(green, 1.0);
    }
    const closed = [...d.boundary, d.boundary[0]];
    net.strokeBody(closed, "#28e0f5", 2);
    const dots = d.boundary.filter((_, i) => i % 2 === 0); // ~130 charge dots
    drawCharge(dots, dots.map((w) => d.chargeDensity(w)), dim);
    drawOverlays(fekete, null);
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
    nRow.style.display = showFaber && !faberBox.disabled ? "" : "none";
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
