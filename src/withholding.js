// (c) 2026 Ash
// SPDX-License-Identifier: MIT
// withholding.js
// ---------------------------------------------------------------------------
// 源泉徴収税額 on 報酬・料金 paid to an individual (所得税法204条1項1号: 原稿料, デザイン料,
// 講演料 and the like). The rates include the 2.1% surtax (復興特別所得税):
//   up to 1,000,000 yen  10.21%
//   above that           20.42% on the excess, plus 102,100 yen
// Fractions of a yen are cut off (国税庁 タックスアンサー No.2795).

import { checkYen, divide, MAX_YEN } from "./yen.js";

const THRESHOLD = 1_000_000;
const TAX_AT_THRESHOLD = 102_100; // 1,000,000 × 10.21%

// PUBLIC
// ---------------------------------------------------------------------------

/** Withholding on a base amount (the yen the rates apply to). */
export function withholdingOn(base) {
  checkYen(base, "base");
  if (base <= THRESHOLD) return divide(base * 1021, 10_000);
  return divide((base - THRESHOLD) * 2042, 10_000) + TAX_AT_THRESHOLD;
}

/**
 * fee: the 報酬 without consumption tax. The consumption tax is fee × taxRate% (cut off) unless
 * given. separated: the invoice shows the consumption tax on its own line, so the tax is
 * left out of the base (平成元年 直法6-1). Returns the withholding and the net payment.
 */
export function withholdingTax(fee, { taxRate = 10, consumptionTax, separated = true } = {}) {
  checkYen(fee, "fee");
  checkTaxRate(taxRate);
  const tax = consumptionTax ?? divide(fee * taxRate, 100);
  checkYen(tax, "consumptionTax");

  const base = separated ? fee : fee + tax;
  const withholding = withholdingOn(base);
  return {
    fee,
    consumptionTax: tax,
    separated,
    base,
    withholding,
    formula:
      base <= THRESHOLD
        ? `${base} × 10.21% = ${withholding}`
        : `(${base} − 1,000,000) × 20.42% + 102,100 = ${withholding}`,
    payment: fee + tax - withholding,
  };
}

/**
 * Gross-up: the smallest fee whose net payment (fee + consumption tax − withholding) is at
 * least `net`. Some nets cannot be hit exactly because of the yen rounding; then exact is false
 * and payment shows what that fee actually pays.
 */
export function grossUp(net, { taxRate = 10, separated = true } = {}) {
  checkYen(net, "net");
  checkTaxRate(taxRate);
  const pay = (fee) => withholdingTax(fee, { taxRate, separated }).payment;

  // payment never goes down as the fee goes up, and it is above 0.77 × fee, so search 0..2×net.
  let low = 0;
  let high = Math.min(2 * net + 10, MAX_YEN);
  if (pay(high) < net) throw new RangeError("net is too large.");
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (pay(mid) >= net) high = mid;
    else low = mid + 1;
  }
  const result = withholdingTax(low, { taxRate, separated });
  return { net, exact: result.payment === net, ...result };
}

// PRIVATE
// ---------------------------------------------------------------------------

function checkTaxRate(rate) {
  if (![10, 8, 0].includes(rate)) throw new RangeError("taxRate must be 10, 8 or 0.");
}
