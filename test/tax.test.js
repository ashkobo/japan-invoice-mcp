// (c) 2026 Ash
// SPDX-License-Identifier: MIT
// tax.test.js
// ---------------------------------------------------------------------------

import assert from "node:assert/strict";
import { test } from "node:test";
import { invoiceTax, taxOf } from "../src/index.js";

test("国税庁 インボイスQ&A 問57: tax-inclusive monthly invoice", () => {
  // 10%対象 60,000円（消費税 5,454円）, 8%対象 40,000円（消費税 2,962円）, 消費税 8,416円
  const r = invoiceTax(
    [
      { description: "小麦粉", amount: 5000, rate: 8 },
      { description: "牛肉", amount: 8000, rate: 8 },
      { description: "キッチンペーパー", amount: 2000, rate: 10 },
      { description: "other 8%", amount: 27000, rate: 8 },
      { description: "other 10%", amount: 58000, rate: 10 },
    ],
    { prices: "inclusive" },
  );
  assert.deepEqual(
    r.byRate.map((b) => [b.rate, b.taxIncluded, b.tax]),
    [
      [10, 60000, 5454],
      [8, 40000, 2962],
    ],
  );
  assert.deepEqual(r.total, { taxExcluded: 91584, tax: 8416, taxIncluded: 100000 });
});

test("国税庁 インボイスQ&A 問57: tax-exclusive figures in the reference tables", () => {
  const cases = [
    [11345, 10, 1134],
    [9987, 8, 798],
    [12549, 10, 1254],
    [12345, 8, 987],
    [23894, 10, 2389],
    [22332, 8, 1786],
  ];
  for (const [amount, rate, tax] of cases) {
    assert.equal(invoiceTax([{ amount, rate }]).total.tax, tax, `${amount} at ${rate}%`);
  }
});

test("rounds once per rate, and says when per-line rounding differs", () => {
  const r = invoiceTax([
    { amount: 105, rate: 10 },
    { amount: 105, rate: 10 },
    { amount: 105, rate: 10 },
  ]);
  assert.equal(r.total.tax, 31); // 315 × 10% = 31.5 → 31, not 10 + 10 + 10
  assert.match(r.notes[0], /30 yen instead of 31 yen/);
  assert.equal(invoiceTax([{ amount: 1000, rate: 10 }]).notes, undefined);
});

test("rounding modes", () => {
  const items = [{ amount: 1005, rate: 10 }]; // 100.5
  assert.equal(invoiceTax(items, { rounding: "floor" }).total.tax, 100);
  assert.equal(invoiceTax(items, { rounding: "round" }).total.tax, 101);
  assert.equal(invoiceTax(items, { rounding: "ceil" }).total.tax, 101);
  const exact = [{ amount: 1000, rate: 10 }];
  assert.equal(invoiceTax(exact, { rounding: "ceil" }).total.tax, 100);
  assert.throws(() => invoiceTax(items, { rounding: "bankers" }), RangeError);
});

test("discounts, 0% items and unit prices", () => {
  const r = invoiceTax([
    { description: "作業", unitPrice: 8000, quantity: 1.5, rate: 10 },
    { description: "値引", amount: -1000, rate: 10 },
    { description: "印紙代", amount: 200, rate: 0 },
    { description: "部品", unitPrice: 19.99, quantity: 3, rate: 8 },
  ]);
  assert.deepEqual(
    r.byRate.map((b) => [b.rate, b.taxExcluded, b.tax]),
    [
      [10, 11000, 1100],
      [8, 59, 4],
      [0, 200, 0],
    ],
  );
  assert.equal(r.items[3].amount, 59); // 59.97 → 59
  assert.equal(r.items[3].rounded, true);
  assert.equal(r.items[3].reduced, true);
  assert.match(r.notes.at(-1), /not whole yen/);
});

test("bad input", () => {
  assert.throws(() => invoiceTax([]), RangeError);
  assert.throws(() => invoiceTax([{ amount: 100, rate: 5 }]), /rate/);
  assert.throws(() => invoiceTax([{ amount: 100.5, rate: 10 }]), /whole number/);
  assert.throws(() => invoiceTax([{ rate: 10 }]), /needs amount/);
  assert.throws(() => invoiceTax([{ unitPrice: 1.23456, rate: 10 }]), /decimal places/);
});

test("property: per-rate tax is the exact tax rounded once (checked with BigInt)", () => {
  const exact = (sum, rate, den) => (BigInt(sum) * BigInt(rate)) / BigInt(den);
  for (let n = 0; n < 500; n += 1) {
    const items = Array.from({ length: 1 + Math.floor(Math.random() * 20) }, () => ({
      amount: Math.floor(Math.random() * 10_000_000),
      rate: [10, 8, 0][Math.floor(Math.random() * 3)],
    }));
    for (const prices of ["exclusive", "inclusive"]) {
      const r = invoiceTax(items, { prices });
      for (const b of r.byRate) {
        const sum = items.filter((i) => i.rate === b.rate).reduce((a, i) => a + i.amount, 0);
        const den = prices === "inclusive" ? 100 + b.rate : 100;
        assert.equal(BigInt(b.tax), exact(sum, b.rate, den));
        assert.equal(b.taxExcluded + b.tax, b.taxIncluded);
        assert.equal(b.taxableAmount, sum);
      }
      assert.equal(r.total.taxExcluded + r.total.tax, r.total.taxIncluded);
      assert.equal(
        r.total.tax,
        r.byRate.reduce((a, b) => a + b.tax, 0),
      );
    }
  }
});

test("taxOf on large amounts stays exact", () => {
  assert.equal(taxOf(999_999_999_999, 10), 99_999_999_999);
  assert.equal(taxOf(999_999_999_999, 8, { prices: "inclusive" }), 74_074_074_074);
});
