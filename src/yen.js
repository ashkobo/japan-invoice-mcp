// (c) 2026 Ash
// SPDX-License-Identifier: MIT
// yen.js
// ---------------------------------------------------------------------------
// Whole-yen arithmetic. Amounts are integers and every division goes through divide(), so no
// floating-point error can creep into a tax amount (0.1 + 0.2 style bugs, 1.005 rounding).

export const ROUNDING = ["floor", "round", "ceil"];

// Keeps every intermediate product (amount × rate) far below Number.MAX_SAFE_INTEGER.
export const MAX_YEN = 1_000_000_000_000;

// PUBLIC
// ---------------------------------------------------------------------------

/**
 * n / d rounded to whole yen. Modes work on the size of the amount, so a negative amount
 * (a discount or a refund) rounds the same way as its positive counterpart:
 * floor = 切り捨て (toward zero), ceil = 切り上げ (away from zero), round = 四捨五入 (half up).
 */
export function divide(n, d, mode = "floor") {
  if (n < 0) return -divide(-n, d, mode);
  const rest = n % d;
  const quotient = (n - rest) / d;
  if (rest === 0) return quotient;
  if (mode === "ceil") return quotient + 1;
  if (mode === "round") return rest * 2 >= d ? quotient + 1 : quotient;
  return quotient;
}

export function checkRounding(mode) {
  if (!ROUNDING.includes(mode)) {
    throw new RangeError(`rounding must be one of ${ROUNDING.join(", ")}.`);
  }
}

export function checkYen(value, name, { allowNegative = false } = {}) {
  if (!Number.isInteger(value)) throw new RangeError(`${name} must be a whole number of yen.`);
  if (!allowNegative && value < 0) throw new RangeError(`${name} must not be negative.`);
  if (Math.abs(value) > MAX_YEN) throw new RangeError(`${name} is too large (max 1 trillion).`);
}

/**
 * price × quantity in exact decimal arithmetic, rounded to whole yen. Both may have up to
 * 4 decimal places (e.g. 1.5 hours at 12.5 yen). Returns { amount, rounded }.
 */
export function multiply(price, quantity, mode = "floor") {
  const a = toScaled(price, "unitPrice");
  const b = toScaled(quantity, "quantity");
  const scale = 10n ** BigInt(a.places + b.places);
  const product = a.value * b.value;
  const negative = product < 0n;
  const size = negative ? -product : product;
  const rest = size % scale;
  let whole = size / scale;
  if (rest !== 0n && (mode === "ceil" || (mode === "round" && rest * 2n >= scale))) whole += 1n;
  const amount = Number(negative ? -whole : whole);
  checkYen(amount, "unitPrice × quantity", { allowNegative: true });
  return { amount, rounded: rest !== 0n };
}

// PRIVATE
// ---------------------------------------------------------------------------

function toScaled(x, name) {
  if (!Number.isFinite(x)) throw new RangeError(`${name} must be a number.`);
  // String(x) gives the shortest decimal that reads back as x, e.g. 0.1 → "0.1".
  const match = /^(-?)(\d+)(?:\.(\d{1,4}))?$/.exec(String(x));
  if (!match) throw new RangeError(`${name} may have at most 4 decimal places.`);
  const [, sign, int, frac = ""] = match;
  return { value: BigInt(`${sign}${int}${frac}`), places: frac.length };
}
