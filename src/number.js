// (c) 2026 Ash
// SPDX-License-Identifier: MIT
// number.js
// ---------------------------------------------------------------------------
// 登録番号 (invoice registration number, "T" + 13 digits) and 法人番号 (corporate number).
// A 法人番号 is a check digit followed by a 12-digit base number. A corporation's registration
// number is "T" + its 法人番号; individuals and others without one get a separate 13-digit
// number from the 国税庁, built the same way.

export const INVOICE_LOOKUP_URL = "https://www.invoice-kohyo.nta.go.jp/";

// Hyphens, dashes and the long vowel mark people type between digit groups.
const SEPARATORS = /[\s\-‐‑‒–—―−ー－_.・]/g;

// PUBLIC
// ---------------------------------------------------------------------------

/**
 * Check digit for a 12-digit base number (法人番号の検査用数字).
 * 9 − ((2 × the digits in even places + the digits in odd places) mod 9), counting places
 * from the last digit. The result is always 1–9.
 */
export function checkDigit(base) {
  if (!/^\d{12}$/.test(base)) throw new RangeError("The base number must be 12 digits.");
  let sum = 0;
  for (let place = 1; place <= 12; place += 1) {
    const digit = Number(base[12 - place]);
    sum += place % 2 === 0 ? digit * 2 : digit;
  }
  return 9 - (sum % 9);
}

/**
 * Validates and normalizes a registration number or a 法人番号. Accepts full-width characters,
 * a lowercase t, spaces and hyphens. Never throws: an invalid input gives valid: false and why.
 *
 * [Example]
 * parseNumber("T7000-0120-50002") // { valid: true, registrationNumber: "T7000012050002", ... }
 */
export function parseNumber(input) {
  const raw = String(input ?? "");
  const text = raw.normalize("NFKC").replace(SEPARATORS, "").toUpperCase();
  const hasT = text.startsWith("T");
  const digits = hasT ? text.slice(1) : text;

  if (!/^\d+$/.test(digits)) {
    return invalid(raw, 'Use "T" followed by 13 digits, or a 13-digit 法人番号.');
  }
  if (digits.length === 12) {
    const full = `${checkDigit(digits)}${digits}`;
    return {
      ...invalid(raw, "12 digits: the check digit is missing. A 法人番号 has 13 digits."),
      ...(!hasT && {
        hint:
          `If this is a 会社法人等番号 (the 12-digit number in the commercial register), ` +
          `its 法人番号 is ${full}.`,
        corporateNumber: full,
      }),
    };
  }
  if (digits.length !== 13) {
    return invalid(raw, `${digits.length} digits: a registration number has "T" + 13 digits.`);
  }

  const expected = checkDigit(digits.slice(1));
  if (Number(digits[0]) !== expected) {
    return {
      ...invalid(raw, `Check digit mismatch: the first digit should be ${expected}.`),
      expectedCheckDigit: expected,
    };
  }

  return {
    input: raw,
    valid: true,
    registrationNumber: `T${digits}`,
    number: digits,
    checkDigit: expected,
    kind: hasT ? "registration-number" : "corporate-number",
    note: hasT
      ? "A correct check digit does not prove the number is registered. For a corporation the " +
        "13 digits are its 法人番号; for an individual they are a separate number (not the " +
        "マイナンバー). Check registration on the 国税庁 公表サイト."
      : "A correct check digit does not prove the number exists. As a registration number it " +
        "would be T + these 13 digits, but only if the corporation is registered as an " +
        "invoice issuer (適格請求書発行事業者). Check on the 国税庁 公表サイト.",
    lookupUrl: `${INVOICE_LOOKUP_URL}regno-search/detail?selRegNo=${digits}`,
  };
}

// PRIVATE
// ---------------------------------------------------------------------------

function invalid(input, reason) {
  return { input, valid: false, reason };
}
