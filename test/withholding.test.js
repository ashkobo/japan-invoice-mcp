// (c) 2026 Ash
// SPDX-License-Identifier: MIT
// withholding.test.js
// ---------------------------------------------------------------------------

import assert from "node:assert/strict";
import { test } from "node:test";
import { grossUp, withholdingOn, withholdingTax } from "../src/index.js";

test("国税庁 タックスアンサー No.2795: 原稿料 1,500,000円 → 204,200円", () => {
  // (150万円 − 100万円) × 20.42% + 102,100円 = 204,200円
  assert.equal(withholdingOn(1_500_000), 204_200);
  assert.equal(withholdingOn(1_000_000), 102_100);
});

test("10.21% up to 1,000,000 yen, fractions cut off", () => {
  assert.equal(withholdingOn(10_000), 1_021);
  assert.equal(withholdingOn(100_000), 10_210);
  assert.equal(withholdingOn(12_345), 1_260); // 1,260.4245
  assert.equal(withholdingOn(99), 10); // 10.1079
  assert.equal(withholdingOn(1_000_001), 102_100); // + 0.2042
  assert.equal(withholdingOn(1_000_005), 102_101); // + 1.021
  assert.equal(withholdingOn(0), 0);
});

test("consumption tax separated or not", () => {
  const separated = withholdingTax(100_000);
  assert.equal(separated.consumptionTax, 10_000);
  assert.equal(separated.withholding, 10_210);
  assert.equal(separated.payment, 99_790);

  const together = withholdingTax(100_000, { separated: false });
  assert.equal(together.base, 110_000);
  assert.equal(together.withholding, 11_231);
  assert.equal(together.payment, 98_769);

  const noTax = withholdingTax(50_000, { taxRate: 0 });
  assert.equal(noTax.payment, 50_000 - 5_105);
  assert.equal(withholdingTax(50_000, { consumptionTax: 4_999 }).payment, 54_999 - 5_105);
});

test("gross-up: the fee that pays a given net", () => {
  const r = grossUp(99_790);
  assert.equal(r.fee, 100_000);
  assert.equal(r.exact, true);
  assert.equal(grossUp(0).fee, 0);
});

test("property: gross-up finds the smallest fee and round-trips", () => {
  for (let n = 0; n < 300; n += 1) {
    const fee = Math.floor(Math.random() * 3_000_000);
    for (const separated of [true, false]) {
      const options = { taxRate: [10, 8, 0][n % 3], separated };
      const { payment } = withholdingTax(fee, options);
      const up = grossUp(payment, options);
      assert.equal(up.exact, true);
      assert.equal(up.payment, payment);
      assert.ok(up.fee <= fee);

      const net = Math.floor(Math.random() * 3_000_000);
      const r = grossUp(net, options);
      assert.ok(r.payment >= net);
      if (r.fee > 0) assert.ok(withholdingTax(r.fee - 1, options).payment < net);
    }
  }
});

test("bad input", () => {
  assert.throws(() => withholdingTax(-1), /negative/);
  assert.throws(() => withholdingTax(100.5), /whole number/);
  assert.throws(() => withholdingTax(100, { taxRate: 5 }), /taxRate/);
});
