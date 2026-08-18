/**
 * Money is handled in kobo (integer minor units) everywhere on the server.
 * Floating point never touches a balance.
 */
export const toKobo = (naira) => Math.round(Number(naira) * 100);
export const toNaira = (kobo) => Number(kobo) / 100;

export const formatNaira = (kobo) =>
  `₦${toNaira(kobo).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Basis points of an amount, rounded to the nearest kobo. */
export const bps = (amountKobo, basisPoints) => Math.round((amountKobo * basisPoints) / 10000);
