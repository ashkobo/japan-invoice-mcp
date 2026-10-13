// (c) 2026 Ash
// SPDX-License-Identifier: MIT
// tax.js
// ---------------------------------------------------------------------------
// Consumption tax (消費税) on one invoice the way the invoice system requires: add up the
// lines of each rate first, then round the tax once per rate (消費税法施行令70条の10).
// Rounding each line and adding up the results is not allowed, and often gives a different sum.

import { checkRounding, checkYen, divide, MAX_YEN, multiply } from "./yen.js";

export const RATES = [10, 8, 0];
export const MAX_ITEMS = 1000;

const LABELS = { 10: "10%対象", 8: "8%対象（軽減税率）", 0: "非課税・不課税・免税" };

// PUBLIC
// ---------------------------------------------------------------------------

/**
 * Each item is { amount, rate } or { unitPrice, quantity, rate }, rate 10, 8 or 0 (no tax).
 * prices: "exclusive" (税抜) or "inclusive" (税込). rounding: "floor" | "round" | "ceil".
 * Returns the per-rate 対象額 and 消費税額, the totals and the items.
 */
export function invoiceTax(items, { prices = "exclusive", rounding = "floor" } = {}) {
  if (prices !== "exclusive" && prices !== "inclusive") {
    throw new RangeError('prices must be "exclusive" (税抜) or "inclusive" (税込).');
  }
  checkRounding(rounding);
  if (!Array.isArray(items) || items.length === 0) throw new RangeError("Give at least one item.");
  if (items.length > MAX_ITEMS) throw new RangeError(`Too many items (max ${MAX_ITEMS}).`);

  const lines = items.map((item, i) => lineOf(item, i, rounding));
  const byRate = [];
  for (const rate of RATES) {
    const group = lines.filter((l) => l.rate === rate);
    if (group.length > 0) byRate.push(rateTotal(rate, group, prices, rounding));
  }

  const total = {
    taxExcluded: sum(byRate.map((r) => r.taxExcluded)),
    tax: sum(byRate.map((r) => r.tax)),
    taxIncluded: sum(byRate.map((r) => r.taxIncluded)),
  };
  const perLineTax = sum(byRate.map((r) => r.perLineTax));
  const notes = [];
  if (perLineTax !== total.tax) {
    notes.push(
      `Rounding the tax on each line would give ${perLineTax} yen instead of ${total.tax} yen. ` +
        "An invoice must round once per rate, so the per-line figure is wrong.",
    );
  }
  if (lines.some((l) => l.rounded)) {
    notes.push(`Some unitPrice × quantity were not whole yen and were rounded (${rounding}).`);
  }

  return {
    prices,
    rounding,
    byRate: byRate.map(({ perLineTax: _, ...rest }) => rest),
    total,
    items: lines.map(({ rounded, ...line }) => (rounded ? { ...line, rounded } : line)),
    ...(notes.length > 0 && { notes }),
  };
}

/** The tax for one per-rate sum, rounded once. inclusive: amount already contains the tax. */
export function taxOf(amount, rate, { prices = "exclusive", rounding = "floor" } = {}) {
  return divide(amount * rate, prices === "inclusive" ? 100 + rate : 100, rounding);
}

// PRIVATE
// ---------------------------------------------------------------------------

function lineOf(item, i, rounding) {
  const where = `items[${i}]`;
  if (item === null || typeof item !== "object")
    throw new RangeError(`${where} must be an object.`);
  const { description, amount, unitPrice, quantity, rate } = item;
  if (!RATES.includes(rate)) throw new RangeError(`${where}.rate must be 10, 8 or 0.`);

  const line = { ...(description !== undefined && { description }) };
  if (amount !== undefined) {
    checkYen(amount, `${where}.amount`, { allowNegative: true });
    line.amount = amount;
  } else if (unitPrice !== undefined) {
    const q = quantity ?? 1;
    const product = multiply(unitPrice, q, rounding);
    Object.assign(line, { unitPrice, quantity: q, amount: product.amount });
    line.rounded = product.rounded;
  } else {
    throw new RangeError(`${where} needs amount, or unitPrice and quantity.`);
  }
  return { ...line, rate, ...(rate === 8 && { reduced: true }) };
}

function rateTotal(rate, lines, prices, rounding) {
  const amount = sum(lines.map((l) => l.amount));
  if (Math.abs(amount) > MAX_YEN) throw new RangeError(`The ${rate}% total is too large.`);
  const tax = taxOf(amount, rate, { prices, rounding });
  const perLineTax = sum(lines.map((l) => taxOf(l.amount, rate, { prices, rounding })));
  return {
    rate,
    label: LABELS[rate],
    taxableAmount: amount,
    taxExcluded: prices === "inclusive" ? amount - tax : amount,
    tax,
    taxIncluded: prices === "inclusive" ? amount : amount + tax,
    perLineTax,
  };
}

function sum(values) {
  return values.reduce((a, b) => a + b, 0);
}
