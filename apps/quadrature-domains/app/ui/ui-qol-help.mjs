// =============================================================================
// ui-qol-help.mjs -- QD_UI.installQolHelp() factory (refactor Phase 4 · D2 lift).
//
// Lifted VERBATIM from ui.mjs's `mountQolHelp()`: attaches the "?" help buttons
// (QD.QoL.attachHelp) to the STATIC inverse-tab card headers (HANDOFF #33). The
// lazy-mounted tabs (Direct / Schwarz / Param-slice) wire their own help inside
// their respective ui modules. All help-popover prose lives in QD.Strings.help.*
// (ui-strings) so it edits in one place.
//
// Uses only runtime globals (window.QD / QD.Strings / document), so it takes no
// uiCtx — ui.mjs calls `QD_UI.installQolHelp()` during boot after those are loaded.
// =============================================================================
import { QD_UI } from './ui-registry.mjs';

function installQolHelp() {
  if (!window.QD || !QD.QoL || !QD.QoL.attachHelp) return;
  const H = QD.QoL.attachHelp;
  // All help-popover prose lives in app/ui-strings.js (QD.Strings.help.*) so it
  // can be edited in one place. Bail quietly if the strings module isn't loaded.
  const help = QD.Strings && QD.Strings.help;
  if (!help) return;
  const headerOf = (cardSelector) => {
    const card = document.querySelector(cardSelector);
    return card ? card.querySelector('h2') : null;
  };
  // Item 6: an app-level "What is a quadrature domain?" intro, as a "?" next to
  // the title — the missing on-ramp for a newcomer.
  const title = document.querySelector('.app-header-row h1');
  if (title) H(title, help.intro);
  H(headerOf('#domain-mode-card'), help.domainType);
  H(headerOf('#h-card'), help.hCard);
  H(headerOf('#map-params-card'), help.mapParams);
  H(headerOf('#c-card'), help.cCard);
  H(headerOf('#solver-settings-card'), help.solverSettings);
  H(headerOf('#search-options-card'), help.searchOptions);
  H(headerOf('#status-card'), help.status);
  H(document.querySelector('#sp-geom summary'), help.geom);
  H(document.querySelector('#sp-cusps summary'), help.cusps);
  // (The Riemann-map symbolic identity is shown via the "?" toggle next to the
  // numerical φ(z) in the Domain-type tile — no separate help popover.)
  H(headerOf('#alternates-card'), help.alternates);
}

QD_UI.installQolHelp = installQolHelp;
