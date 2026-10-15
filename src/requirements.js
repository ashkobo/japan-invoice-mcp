// (c) 2026 Ash
// SPDX-License-Identifier: MIT
// requirements.js
// ---------------------------------------------------------------------------
// 記載事項 of an 適格請求書 (消費税法57条の4第1項) and an 適格簡易請求書 (同第2項, for
// retail, restaurants, taxis and other sales to the general public). Checks an invoice object
// for what is missing and whether the stated tax could come from rounding once per rate.

import { parseNumber } from "./number.js";
import { RATES, taxOf } from "./tax.js";

export const REQUIREMENTS = {
  invoice: [
    "適格請求書発行事業者の氏名又は名称及び登録番号",
    "取引年月日",
    "取引内容（軽減税率の対象品目である旨）",
    "税率ごとに区分して合計した対価の額（税抜又は税込）及び適用税率",
    "税率ごとに区分した消費税額等",
    "書類の交付を受ける事業者の氏名又は名称",
  ],
  simplified: [
    "適格請求書発行事業者の氏名又は名称及び登録番号",
    "取引年月日",
    "取引内容（軽減税率の対象品目である旨）",
    "税率ごとに区分して合計した対価の額（税抜又は税込）",
    "税率ごとに区分した消費税額等又は適用税率",
  ],
};

// PUBLIC
// ---------------------------------------------------------------------------

/**
 * invoice: { issuerName, registrationNumber, date, recipientName, prices,
 *   items: [{ description, rate, amount? }], totals: [{ rate, amount, tax?, rateShown? }] }.
 * simplified: check as an 適格簡易請求書. Returns { ok, missing, problems, reminder? }.
 */
export function checkInvoice(invoice, { simplified = false } = {}) {
  if (invoice === null || typeof invoice !== "object") {
    throw new RangeError("invoice must be an object.");
  }
  const kind = simplified ? "simplified" : "invoice";
  const missing = [];
  const problems = [];
  const need = (ok, field, n) => {
    if (!ok) missing.push({ field, requirement: REQUIREMENTS[kind][n] });
  };
  const filled = (v) => typeof v === "string" && v.trim() !== "";
  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const totals = Array.isArray(invoice.totals) ? invoice.totals : [];

  // 1. Issuer and registration number
  need(filled(invoice.issuerName), "issuerName", 0);
  need(filled(invoice.registrationNumber), "registrationNumber", 0);
  if (filled(invoice.registrationNumber)) {
    const number = parseNumber(invoice.registrationNumber);
    if (!number.valid) problems.push(`registrationNumber: ${number.reason}`);
    else if (number.kind !== "registration-number") {
      problems.push('registrationNumber: write it with the leading "T".');
    }
  }

  // 2–3. Date and what was sold
  need(filled(invoice.date), "date", 1);
  if (filled(invoice.date) && !isCalendarDate(invoice.date)) {
    problems.push("date must be a real calendar date in YYYY-MM-DD format.");
  }
  need(items.length > 0, "items", 2);
  items.forEach((item, i) => {
    need(filled(item?.description), `items[${i}].description`, 2);
    if (!RATES.includes(item?.rate)) problems.push(`items[${i}].rate must be 10, 8 or 0.`);
  });

  // 4–5. Per-rate totals and tax
  const rates = [...new Set(items.map((item) => item?.rate).filter((r) => r > 0))];
  for (const rate of rates) {
    const total = totals.find((t) => t?.rate === rate);
    need(Number.isInteger(total?.amount), `totals[${rate}%].amount`, 3);
    if (!total) continue;
    const rateShown = total.rateShown !== false;
    const hasTax = Number.isInteger(total.tax);
    if (simplified) need(hasTax || rateShown, `totals[${rate}%].tax or rate`, 4);
    else {
      need(rateShown, `totals[${rate}%].rate`, 3);
      need(hasTax, `totals[${rate}%].tax`, 4);
    }
    problems.push(...consistency(rate, items, total, invoice.prices));
  }

  // 6. Recipient (not needed on an 適格簡易請求書)
  if (!simplified) need(filled(invoice.recipientName), "recipientName", 5);

  const result = { kind, ok: missing.length === 0 && problems.length === 0, missing, problems };
  if (items.some((item) => item?.rate === 8)) {
    result.reminder = "Mark the 8% items as 軽減税率対象 on the invoice (e.g. ※ with a legend).";
  }
  return result;
}

// PRIVATE
// ---------------------------------------------------------------------------

function isCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// The stated total must match the items, and the stated tax must be the exact tax rounded down
// or up: any rounding is allowed, but only once per rate.
function consistency(rate, items, total, prices = "exclusive") {
  const out = [];
  const amounts = items.filter((i) => i?.rate === rate).map((i) => i.amount);
  if (amounts.length > 0 && amounts.every(Number.isInteger) && Number.isInteger(total.amount)) {
    const sum = amounts.reduce((a, b) => a + b, 0);
    if (sum !== total.amount) {
      out.push(
        `totals[${rate}%].amount is ${total.amount} but the ${rate}% items add up to ${sum}.`,
      );
    }
  }
  if (Number.isInteger(total.amount) && Number.isInteger(total.tax)) {
    const low = taxOf(total.amount, rate, { prices, rounding: "floor" });
    const high = taxOf(total.amount, rate, { prices, rounding: "ceil" });
    if (total.tax !== low && total.tax !== high) {
      const allowed = low === high ? `${low}` : `${low} or ${high}`;
      out.push(
        `totals[${rate}%].tax is ${total.tax}; rounding once per rate gives ${allowed} ` +
          `(prices ${prices}).`,
      );
    }
  }
  return out;
}
