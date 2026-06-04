/**
 * Builders for the CindyScript event-handler snippets (move / keydown /
 * mousedrag / mousedown).
 *
 * Several of these embed a `javascript("...")` call that CindyScript evaluates
 * in the global (window) scope at runtime — so every symbol referenced inside
 * those strings (the plot instances, `scaleArray`, `complex`, the `set*Input`
 * helpers) must be exposed on `window` by main.ts. This module is the single
 * place where that fragile nested-string escaping lives.
 */

export type FractType = "dyn" | "param";

/** Wrap an array of JS statements into a CindyScript `javascript("...")` call. */
export function genCindyJSCode(lines: string[]): string {
  return 'javascript("' + lines.join("; ") + ';");';
}

/** The per-frame draw script: colour plot, blit, orbit polyline, and label. */
export function buildMoveScript(fractType: FractType): string {
  const iter = fractType === "dyn" ? "dynIter(complex(#), c)" : "paramIter(complex(#))";
  const kIter =
    fractType === "dyn"
      ? "dynKIter(CanvToPltZ(complex(Z0.xy)),c,nplot-1)"
      : "paramKIter(CanvToPltZ(complex(Z0.xy)),nplot-1)";
  const label = fractType === "dyn" ? '"z0="' : '"c="';
  return (
    `colorplot([center_1-1/zoom,center_2-1/zoom],[center_1+1/zoom,center_2-1/zoom],"julia",colorFcn(${iter}));` +
    'drawimage([0,0],[2,0], "julia");' +
    `connect(apply(${kIter},reim(PltToCanvZ(#))),color->[1,1,1],size->1.8);` +
    `drawtext(Z0+(.025,.025), ${label}+CanvToPltZ(complex(Z0.xy)), color->[1,1,1],size->15);`
  );
}

/** Forward keypresses to `<varName>.keypress(<charCode>)` via a JS callback. */
export function buildKeydownScript(varName: string): string {
  // Preserved verbatim from the original: the nested quoting builds, at eval
  // time, e.g. `julia_fract.keypress('a'.charCodeAt(0))`.
  return 'javascript("' + varName + '.keypress(\'"+"\\" + key()+"\'.charCodeAt(0))");';
}

/** Pan the plot while dragging the background (but not the draggable point). */
export function buildMousedragScript(varName: string): string {
  return `javascript("
      if (!(${varName}.z0AtMouse)) {
        ${varName}.shift(scaleArray(${varName}.mouseshift,1/${varName}.zoom));
      }");
      `;
}

/** Reset the drag shift on mouse-down (fixes a click-and-drag timing issue). */
export function buildMousedownScript(varName: string): string {
  return `javascript("${varName}.mouseshift === null");`;
}
