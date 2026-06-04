/**
 * Shared CindyScript definitions injected into every plot's init script:
 * Euler's number, a custom complex Lambert W implementation (with near-origin
 * and near-infinity seed approximations refined by Newton/Halley steps), and a
 * couple of small helpers. Kept verbatim from the original implementation.
 */
export const MATHLIB_CS = `
  // Fixed constants
  e = 2.71828182845904523536028747; // Euler's number

  reim(z) := [re(z),im(z)];

  lwZeroApprox(z) := ( // Approximation of the principal branch of the Lambert W function near the origin
  ezsqrt = sqrt(1 + e*z);
      (12*ezsqrt*(45*sqrt(2) + 32*ezsqrt))/(sqrt(e)*(623 + 83*e*z + 372*sqrt(2)*ezsqrt))-1;
  );

  lwInftyApprox(z) := log(z)-log(log(z))+log(log(z))/log(z); // Approximation of the principal branch of the Lambert W function near infinity

  lambertw(z) :=( // Custom implementation of the Lambert W function
      if(abs(z)<1.7,
          w=lwZeroApprox(z),
          w=lwInftyApprox(z)
      );
      repeat(5,
          w=(w^2+z/exp(w))/(w+1);
      );
      w
  );

  arg(z) := arctan2(reim(z));
`;
