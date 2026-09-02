// apps/potential-theory — a compact set K as a grounded CONDUCTOR (M3; carved out of 2d-electrostatics, ADR-0036). One
// pane shows K with its equilibrium charge (μ_K), Green equipotentials (g_K), and — as overlays — the
// Faber-polynomial zeros and the Fekete/Leja points, three roads to the equilibrium measure.
//
// Two domain classes: EXTERIOR-MAP (SC polygons + closed forms), where every quantity is an exact `=`
// pushforward Ψ(circles); and GENERAL K (smooth blobs), where there is no closed-form map, so capacity /
// Green / charge come from a log-lightning fit (`≈`) and the Green equipotentials are marching-squares
// level curves of the g_K field. Fourth page of the app.
import "./styles/main.css";
import "@cas/ui/nav.css";
import { runWithFatalBoundary, attachCanvasA11y, mountNavHeader } from "@cas/ui";
import { POLYGON_PRESETS, Net2D, boundsOf, type Box, type NetCurve, type Pt } from "@cas/flow";
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
import {
  DEFAULT_CUSTOM_CORNERS,
  nearestVertex,
  addVertex,
  removeVertex,
  ensureCCW,
  encodeViewState,
  decodeViewState,
} from "./customK.js";
import { probeExterior, probeGeneral, type Probe } from "./probeField.js";

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
const CUSTOM_ID = "custom"; // the user-drawn polygon (routed through the exact exterior-SC path)

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

  // Custom-polygon (draw-your-own-K) state.
  let customCorners: Pt[] = DEFAULT_CUSTOM_CORNERS.map((p): Pt => [p[0], p[1]]);
  let selectedVertex = -1;
  let dragging = -1;

  // Hover-probe / test-charge state (PT-6b).
  let hoverZ: Pt | null = null; // the cursor point (world) while hovering the pane, else null
  let chargeOn = false; // whether the pinned draggable test charge is shown
  let chargePos: Pt | null = null; // its world position
  let chargeDrag = false; // whether the test charge is being dragged

  // Restore a shared view (PT-6a) BEFORE the toolbar is built, so the <select> reflects the restored domain
  // and a hand-drawn K is ready to draw. A malformed / unknown hash is ignored (falls back to the default).
  const restored = decodeViewState(window.location.hash);
  if (restored) {
    if (restored.domain === CUSTOM_ID || DOMAINS.some((d) => d.id === restored.domain)) domainId = restored.domain;
    if (restored.corners && restored.corners.length >= 3) customCorners = restored.corners.map((p): Pt => [p[0], p[1]]);
  }

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
  // "Draw your own" — a user-editable polygon, routed through the exact exterior-SC path (so `=`).
  const customGroup = el("optgroup");
  customGroup.label = "Draw your own (exact =)";
  const customOpt = el("option", undefined, "Custom polygon");
  customOpt.value = CUSTOM_ID;
  if (domainId === CUSTOM_ID) customOpt.selected = true;
  customGroup.append(customOpt);
  domSel.append(customGroup);
  domRow.append(domHead, domSel);

  // Custom-polygon editor controls (shown only for "Custom polygon").
  const editRow = el("div");
  editRow.style.cssText = "display:flex; align-items:center; gap:6px; flex-wrap:wrap;";
  const addBtn = el("button", "pal-btn", "＋ vertex");
  addBtn.type = "button";
  const delBtn = el("button", "pal-btn", "－ vertex");
  delBtn.type = "button";
  const resetBtn = el("button", "pal-btn", "Reset");
  resetBtn.type = "button";
  editRow.append(el("span", "row-l", "Edit K"), addBtn, delBtn, resetBtn, el("span", undefined, "· drag a corner"));
  editRow.style.display = domainId === CUSTOM_ID ? "flex" : "none";

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

  // Test charge (PT-6b): a pinned, draggable probe. (The hover probe is always on — no toggle.)
  const chargeCheck = el("label", "check");
  const chargeBox = el("input");
  chargeBox.type = "checkbox";
  chargeBox.checked = chargeOn;
  chargeCheck.append(chargeBox, el("span", undefined, "Test charge"));

  controls.append(domRow, editRow, faberCheck, nRow, feketeCheck, fRow, chargeCheck);

  const readout = el("div", "readout tp-readout");
  bar.append(brand, back, controls, readout);

  // ---- single conductor pane ------------------------------------------------
  const stage = el("main", "pot-stage"); // a landmark so the conductor pane's content is contained (a11y)
  const fig = el("figure", "foil-pane");
  const canvas = el("canvas", "foil-canvas");
  attachCanvasA11y(canvas, {
    role: "img",
    label: "A compact set K as a grounded conductor: its equilibrium charge, Green equipotentials, and field lines",
  });
  const cap = el("figcaption");
  cap.innerHTML =
    "<b>The conductor K</b> — equilibrium charge (dots, crowding = density), Green equipotentials g<sub>K</sub> = t · <i>hover to read g<sub>K</sub> / U<sup>μ</sup> / |E|</i>";
  // The floating hover readout + the pinned test-charge label (PT-6b), positioned over the pane.
  const hud = el("div", "tp-probe");
  hud.hidden = true;
  const chargeLabel = el("div", "tp-charge");
  chargeLabel.hidden = true;
  fig.append(canvas, cap, hud, chargeLabel);
  stage.append(fig);
  mountNavHeader(app, { current: "potential-theory" });
  app.append(bar, stage);

  const net = new Net2D(canvas);

  // ---- custom-polygon (draw-your-own-K) view + editing helpers (PT-6a) -----
  // While "Custom polygon" is selected the view is LOCKED to a fixed box around the shape, so a dragged
  // vertex stays put under the cursor. (The exterior-map path otherwise re-fits the view to the outermost
  // Green curve every paint, which would make the shape swim as it is edited.) The lock box is recomputed
  // only when the polygon is (re)selected or its vertex count changes — never per drag frame.
  let customView: Box | null = null;
  const computeCustomView = (corners: readonly Pt[]): Box => {
    const bb = boundsOf([{ color: "", pts: corners as Pt[] }]) ?? { minx: -1, maxx: 1, miny: -1, maxy: 1 };
    const cx = (bb.minx + bb.maxx) / 2;
    const cy = (bb.miny + bb.maxy) / 2;
    const ext = Math.max(bb.maxx - bb.minx, bb.maxy - bb.miny) / 2;
    const half = Math.max(ext, 0.5) * 1.2;
    return { minx: cx - half, maxx: cx + half, miny: cy - half, maxy: cy + half };
  };
  if (domainId === CUSTOM_ID) customView = computeCustomView(customCorners);
  canvas.style.cursor = domainId === CUSTOM_ID ? "crosshair" : "";

  // Debounced permalink write — the selected domain, plus (for the custom polygon) its corners.
  let permaTimer = 0;
  const writePermalink = (): void => {
    if (permaTimer) window.clearTimeout(permaTimer);
    permaTimer = window.setTimeout(() => {
      permaTimer = 0;
      const hash = encodeViewState({ domain: domainId, corners: domainId === CUSTOM_ID ? customCorners : undefined });
      window.history.replaceState(null, "", hash);
    }, 250);
  };

  // The editable polygon outline + drag handles, drawn on top of whatever the paint drew (the selected
  // vertex gets a bigger white handle).
  const drawEditorOverlay = (): void => {
    net.drawLines([{ color: "rgba(40,224,245,0.55)", pts: [...customCorners, customCorners[0]] }], 1.5);
    for (let i = 0; i < customCorners.length; i++) {
      const sel = i === selectedVertex;
      net.drawDot(customCorners[i], sel ? "#ffffff" : "#28e0f5", sel ? 6 : 4.5);
    }
  };

  // A finished custom-polygon edit (drag release / add / remove / reset): drop the stale cached SC, write
  // the permalink, repaint (which refits the exterior SC at the new geometry).
  const onCustomEdit = (): void => {
    built = null;
    writePermalink();
    requestPaint();
  };

  // ---- hover probe / test charge (PT-6b) -----------------------------------
  // Evaluate g_K / U^μ / |E| at an arbitrary point z, honestly labelled: exact (=) for an exterior-map K
  // (a Newton inverse of Ψ), approximate (≈) for a general (log-lightning) K.
  const probeAt = (dom: AnyDomain, z: Pt): Probe => (isGeneral(dom) ? probeGeneral(dom, z) : probeExterior(dom, z));
  const eqOf = (dom: AnyDomain): string => (isGeneral(dom) ? "≈" : dom.exact ? "=" : "≈");
  const num = (x: number): string => (Number.isFinite(x) ? x.toFixed(3) : "—");
  const probeBody = (dom: AnyDomain, p: Probe): string => {
    const eq = eqOf(dom);
    if (p.inside) return `<span class="tp-eq">on / inside K (${eq})</span><br>g<sub>K</sub> = <b>0</b><br>U<sup>μ</sup> = γ = ${num(p.potential)}`;
    let s = `g<sub>K</sub> = <b>${num(p.gK)}</b> <span class="tp-eq">(${eq})</span><br>U<sup>μ</sup> = ${num(p.potential)}<br>|E| = ${num(p.field)}`;
    if (!isGeneral(dom)) s += `<br><span class="tp-eq">level |w| = ${num(p.wAbs)}</span>`;
    return s;
  };

  // World units per CSS pixel at the current view (so a glyph is a fixed screen size regardless of zoom).
  const worldPerPx = (): number => {
    const a = net.toWorld(0, 0);
    const b = net.toWorld(0, 1);
    return Math.hypot(a[0] - b[0], a[1] - b[1]) || 0.01;
  };
  // A marker dot + a short outward field arrow (∇g_K) at z. Suppressed on/inside K (no field).
  const drawProbeGlyph = (z: Pt, p: Probe, charge: boolean): void => {
    const color = charge ? "#ffd24a" : "#ffffff";
    net.drawDot(z, color, charge ? 6 : 4.5);
    if (p.inside || p.field <= 0) return;
    const wpp = worldPerPx();
    const L = 30 * wpp;
    const hb = 8 * wpp;
    const dir = p.fieldDir;
    const perp: Pt = [-dir[1], dir[0]];
    const end: Pt = [z[0] + dir[0] * L, z[1] + dir[1] * L];
    const h1: Pt = [end[0] - dir[0] * hb + perp[0] * hb * 0.55, end[1] - dir[1] * hb + perp[1] * hb * 0.55];
    const h2: Pt = [end[0] - dir[0] * hb - perp[0] * hb * 0.55, end[1] - dir[1] * hb - perp[1] * hb * 0.55];
    net.drawLines([{ color, pts: [z, end] }, { color, pts: [h1, end, h2] }], 1.6);
  };

  // Position the floating hover HUD near the cursor (canvas-relative offset), flipping at the pane edges.
  const placeHud = (ox: number, oy: number): void => {
    const fw = fig.clientWidth;
    const fh = fig.clientHeight;
    let x = ox + 16;
    let y = oy + 16;
    if (x + hud.offsetWidth > fw - 6) x = ox - hud.offsetWidth - 16;
    if (y + hud.offsetHeight > fh - 6) y = oy - hud.offsetHeight - 16;
    hud.style.left = `${Math.max(6, x)}px`;
    hud.style.top = `${Math.max(6, y)}px`;
  };
  const updateHud = (ox: number, oy: number): void => {
    const dom = currentBuilt().domain;
    if (!dom || !hoverZ) {
      hud.hidden = true;
      return;
    }
    hud.innerHTML = probeBody(dom, probeAt(dom, hoverZ));
    hud.hidden = false;
    placeHud(ox, oy);
  };
  // The pinned test-charge label tracks the charge's on-screen position (world → CSS px).
  const updateChargeLabel = (z: Pt, p: Probe, dom: AnyDomain): void => {
    const [px, py] = net.toCanvasPx(z);
    chargeLabel.style.left = `${px + 12}px`;
    chargeLabel.style.top = `${py + 12}px`;
    chargeLabel.innerHTML = `<b>test charge</b><br>${probeBody(dom, p)}`;
    chargeLabel.hidden = false;
  };
  // A default charge location just outside K (a point on the g_K = log 1.83 curve / boundary offset).
  const defaultChargePos = (): Pt => {
    const dom = currentBuilt().domain;
    if (dom && !isGeneral(dom)) return dom.evalPsi([1.8, 0.35]);
    if (dom && isGeneral(dom)) {
      const bb = boundsOf([{ color: "", pts: dom.boundary }]);
      if (bb) return [bb.maxx + 0.35 * (bb.maxx - bb.minx) + 0.3, (bb.miny + bb.maxy) / 2];
    }
    return [2, 0];
  };

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
    let domain: AnyDomain | null;
    try {
      // The custom polygon rides the exact exterior-SC path (polygonDomain → @cas/flow's fitPolygonFlow),
      // so a hand-drawn K earns the same `=` capacity / μ_K / Green as the presets. A degenerate shape
      // (self-intersecting, bad corner) throws → caught below → null → the ⚠ "drag a corner to fix it".
      domain =
        domainId === CUSTOM_ID
          ? polygonDomain(CUSTOM_ID, "Custom polygon", ensureCCW(customCorners))
          : (DOMAINS.find((d) => d.id === domainId) ?? DOMAINS[0]).make();
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
    const custom = domainId === CUSTOM_ID;
    const editing = custom && dragging >= 0;

    // While a vertex is being dragged, skip the (slow) exterior-SC rebuild and the overlays: just redraw
    // the polygon outline + handles on the LOCKED view, so the drag stays smooth. The SC refit happens on
    // release (onCustomEdit → built = null → a normal paint below).
    if (editing) {
      faberBox.disabled = true;
      faberCheck.style.opacity = "0.4";
      nRow.style.display = "none";
      if (net.resize() && customView) {
        net.clear();
        net.fitBounds(customView, 1.0);
        drawEditorOverlay();
      }
      readout.innerHTML = `<span class="tp-approx">✎ editing K — release to refit the conformal map…</span>`;
      return;
    }

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
      // For the custom polygon the view is locked to `customView` (so editing doesn't make it swim); a
      // degenerate custom shape draws nothing but still shows its editable outline so the user can fix it.
      if (domain && !isGeneral(domain)) drawExterior(domain, overlay !== null, fekete, faber, custom && customView ? customView : undefined);
      else if (domain && isGeneral(domain)) drawGeneral(domain, b, overlay !== null, fekete);
      else if (custom && customView) net.fitBounds(customView, 1.0);
      if (custom) drawEditorOverlay();

      // ---- probe glyphs (PT-6b): the hover marker + the pinned test charge, each with a field arrow ---
      if (domain) {
        if (hoverZ && !chargeDrag) drawProbeGlyph(hoverZ, probeAt(domain, hoverZ), false);
        if (chargeOn && chargePos) {
          const cp = probeAt(domain, chargePos);
          drawProbeGlyph(chargePos, cp, true);
          updateChargeLabel(chargePos, cp, domain);
        }
      }
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
    } else if (custom) {
      readout.innerHTML = `<span class="tp-warn">⚠ this polygon is degenerate (self-intersecting or a collapsed corner) — drag a corner to fix it</span>`;
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

  /** Exterior-map K: exact pushforward of the ζ-plane circles/rays. `viewBox` (the custom-polygon lock)
   *  overrides the default auto-fit to the outermost Green curve. */
  const drawExterior = (d: ExteriorDomain, dim: boolean, fekete: { points: Pt[] } | null, faber: { zeros: Pt[] } | null, viewBox?: Box): void => {
    const green = GREEN_LEVELS.map((t): NetCurve => ({ color: "rgba(120,150,210,0.30)", pts: greenCurve(d, t) }));
    if (viewBox) {
      net.fitBounds(viewBox, 1.0);
    } else {
      const bb = boundsOf([{ color: "", pts: green[green.length - 1].pts }]);
      if (bb) {
        const pad = 0.06 * Math.max(bb.maxx - bb.minx, bb.maxy - bb.miny);
        net.fitBounds({ minx: bb.minx - pad, maxx: bb.maxx + pad, miny: bb.miny - pad, maxy: bb.maxy + pad }, 1.04);
      }
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
    const custom = domainId === CUSTOM_ID;
    editRow.style.display = custom ? "flex" : "none";
    canvas.style.cursor = custom ? "crosshair" : "";
    selectedVertex = -1;
    dragging = -1;
    if (custom) customView = computeCustomView(customCorners);
    if (chargeOn) chargePos = defaultChargePos(); // re-home the test charge outside the new K
    writePermalink();
    requestPaint();
  });

  // ---- custom-polygon editor: buttons + direct-manipulation drag (PT-6a) ----
  addBtn.addEventListener("click", () => {
    customCorners = addVertex(customCorners);
    customView = computeCustomView(customCorners);
    selectedVertex = -1;
    onCustomEdit();
  });
  delBtn.addEventListener("click", () => {
    const i = selectedVertex >= 0 ? selectedVertex : customCorners.length - 1;
    customCorners = removeVertex(customCorners, i);
    customView = computeCustomView(customCorners);
    selectedVertex = -1;
    onCustomEdit();
  });
  resetBtn.addEventListener("click", () => {
    customCorners = DEFAULT_CUSTOM_CORNERS.map((p): Pt => [p[0], p[1]]);
    customView = computeCustomView(customCorners);
    selectedVertex = -1;
    onCustomEdit();
  });

  // Pointer → world, via the inverse of the transform the pane last drew with (locked to `customView`).
  const worldAt = (e: PointerEvent): Pt => {
    const r = canvas.getBoundingClientRect();
    return net.toWorld(e.clientX - r.left, e.clientY - r.top);
  };
  // A finger-sized hit target (~14 CSS px) expressed in world units at the current zoom.
  const hitTolWorld = (): number => {
    const a = net.toWorld(0, 0);
    const b = net.toWorld(0, 14);
    return Math.hypot(a[0] - b[0], a[1] - b[1]) || 0.1;
  };
  canvas.addEventListener("pointerdown", (e) => {
    const w = worldAt(e);
    // 1) grab the pinned test charge (takes priority — it may sit over a vertex).
    if (chargeOn && chargePos && Math.hypot(w[0] - chargePos[0], w[1] - chargePos[1]) <= hitTolWorld()) {
      chargeDrag = true;
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
      requestPaint();
      return;
    }
    // 2) custom-polygon vertex drag.
    if (domainId !== CUSTOM_ID) return;
    const i = nearestVertex(customCorners, w, hitTolWorld());
    selectedVertex = i;
    if (i >= 0) {
      dragging = i;
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
    requestPaint();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (chargeDrag) {
      chargePos = worldAt(e);
      hud.hidden = true; // the charge label carries the readout while dragging it
      requestPaint();
      return;
    }
    if (dragging >= 0 && domainId === CUSTOM_ID) {
      const w = worldAt(e);
      customCorners = customCorners.map((p, k): Pt => (k === dragging ? w : p));
      hud.hidden = true;
      built = null; // the cached SC is stale mid-drag; a fresh one is built on release
      requestPaint();
      return;
    }
    // hover probe (no button down): read g_K / U^μ / |E| under the cursor.
    hoverZ = worldAt(e);
    updateHud(e.offsetX, e.offsetY);
    requestPaint();
  });
  canvas.addEventListener("pointerleave", () => {
    hoverZ = null;
    hud.hidden = true;
    requestPaint();
  });
  const endDrag = (): void => {
    if (chargeDrag) {
      chargeDrag = false;
      requestPaint();
      return;
    }
    if (dragging < 0) return;
    dragging = -1;
    onCustomEdit(); // refit the exterior SC + write the permalink at the final vertex position
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
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
  chargeBox.addEventListener("change", () => {
    chargeOn = chargeBox.checked;
    if (chargeOn && !chargePos) chargePos = defaultChargePos();
    if (!chargeOn) chargeLabel.hidden = true;
    requestPaint();
  });
  window.addEventListener("resize", requestPaint);
  requestPaint();
}

runWithFatalBoundary(main);
