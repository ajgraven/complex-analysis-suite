/**
 * The sandbox's integrand presets — one list, read by the shell and by the shader-compile suite.
 *
 * Its own module because the browser suite compiles every one of them in a real WebGL2 context, and a
 * second copy of the list in the test would be a test that passes while the app ships an expression
 * nobody compiled. Small enough to look like it belongs in `app.ts`; that is exactly how the copy
 * would have happened.
 */
export const PRESETS: readonly { readonly label: string; readonly src: string }[] = [
  { label: "1/z", src: "1/z" },
  { label: "1/(1+z^2)", src: "1/(1+z^2)" },
  { label: "1/(1+z^4)", src: "1/(1+z^4)" },
  { label: "1/(z-1)^2", src: "1/(z-1)^2" },
  { label: "(3+4i)/(z^3-1)", src: "(3+4i)/(z^3-1)" },
  { label: "z/(z^2+2*z+2)", src: "z/(z^2+2*z+2)" },
  { label: "exp(i*z)/(1+z^2)", src: "exp(i*z)/(1+z^2)" },
];
