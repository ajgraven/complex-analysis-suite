/**
 * Builds the CindyScript `init` program for a plot from a preset and a
 * resolution. Defines the parameters, the iteration function `f`, the escape
 * predicate, the canvas<->plot coordinate transforms, the escape-time and orbit
 * iterators, the colouring function, and finally allocates the render image.
 *
 * The coordinate transforms here MUST match the JavaScript ones in
 * {@link ../transforms.ts}.
 */

import type { Preset } from "../presets";
import { MATHLIB_CS } from "./mathlib";

export function buildInitScript(preset: Preset, res: number): string {
  return `
  use("CindyGL");
${MATHLIB_CS}

  // initial values of parameters
  n = ${preset.n}; // number of iterates to use when generating image
  c = ${preset.c}; // initial value of c
  nplot = ${preset.nplot}; // number of iterates to plot
  zoom = ${preset.zoom};
  center = [${preset.center}];

  f(z, c) := (
      ${preset.f};
  );

  escape(z, c) := (
      ${preset.escape};
  );

  // Coordinate transformations
  PltToCanvX(x) := (x-center_1)*zoom+1; // plot coordinate to canvas coordinate
  PltToCanvY(y) := (y-center_2)*zoom+1; // plot coordinate to canvas coordinate
  PltToCanvXY(XY) := [PltToCanvX(XY_1),PltToCanvY(XY_2)];
  PltToCanvZ(z) := PltToCanvX(re(z))+i*PltToCanvY(im(z)); // plot coordinate to canvas coordinate

  CanvToPltX(x) := (x-1)/zoom+center_1; // canvas coordinate to plot coordinate
  CanvToPltY(y) := (y-1)/zoom+center_2; // canvas coordinate to plot coordinate
  CanvToPltXY(XY) := [CanvToPltX(XY_1),CanvToPltY(XY_2)];
  CanvToPltZ(z) := CanvToPltX(re(z))+i*CanvToPltY(im(z)); // canvas coordinate to plot coordinate

  // Iteration functions
  preIter(z, c) := ( //returns the number of iterates to escape for dynamical plane, or n (max) if escape fails
      kmax=0;
      repeat(n,k,
          if(not(escape(z,c)),
              z = f(z,c);
              kmax=k;
          );
      );
  );

  preKIter(z,c,k) := ( // returns first k iterates of dynamical plane starting at z
      zs = [z];
      repeat(k,l,
          if(not(escape(z,c)),
              z = f(z,c);
              zs=append(zs,z);
          );
      );
      append(zs,f(z,c));
  );

  paramIter(z)  := (preIter(z,z)); // iterator for parameter space
  dynIter(z,c)  := (preIter(z,c)); // iterator for dynamical plane

  paramKIter(z,k) := (preKIter(z,z,k)); // generates first k iterates for parameter space
  dynKIter(z,c,k) := (preKIter(z,c,k)); // generates first k iterates for dynamical plane

  //Colors
  Z0.color  = (1,1,1);
  colorFcn(u) := (
      if(u==n,(0,0,0),
          u = u/n;
          u = (3*u/(2*u+1));
          (4*u,1.3*u,(1-u)^2*.7);
      );
  );

  //Generate image
  createimage("julia", ${res}, ${res});
  `;
}
