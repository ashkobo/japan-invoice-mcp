// (c) 2026 Ash
// SPDX-License-Identifier: MIT
// requirements.test.js
// ---------------------------------------------------------------------------

import assert from "node:assert/strict";
import { test } from "node:test";
import { checkInvoice } from "../src/index.js";

// Shaped like the 記載例 in 国税庁 インボイスQ&A 問57 (tax-inclusive, 10% and 8%).
const GOOD = {
  issuerName: "△△商事株式会社",
  registrationNumber: "T1180301018771",
  date: "2026-10-31",
  recipientName: "株式会社○○",
  prices: "inclusive",
  items: [
    { description: "小麦粉", rate: 8, amount: 5000 },
    { description: "牛肉", rate: 8, amount: 35000 },
    { description: "キッチンペーパー", rate: 10, amount: 60000 },
  ],
  totals: [
    { rate: 10, amount: 60000, tax: 5454 },
    { rate: 8, amount: 40000, tax: 2962 },
  ],
};

test("a complete 適格請求書 passes", () => {
  const r = checkInvoice(GOOD);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.match(r.reminder, /軽減税率/);
});

test("rounding up once per rate is allowed too", () => {
  const totals = [
    { rate: 10, amount: 60000, tax: 5455 },
    { rate: 8, amount: 40000, tax: 2963 },
  ];
  assert.equal(checkInvoice({ ...GOOD, totals }).ok, true);
});

test("missing fields are listed with the requirement", () => {
  const { recipientName: _, registrationNumber: __, ...rest } = GOOD;
  const r = checkInvoice(rest);
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing.map((m) => m.field).sort(), ["recipientName", "registrationNumber"]);
  assert.match(r.missing[0].requirement, /登録番号/);
});

test("適格簡易請求書: no recipient needed, tax or rate is enough", () => {
  const { recipientName: _, ...receipt } = GOOD;
  assert.equal(checkInvoice(receipt, { simplified: true }).ok, true);

  const rateOnly = { ...receipt, totals: GOOD.totals.map(({ tax: __, ...t }) => t) };
  assert.equal(checkInvoice(rateOnly, { simplified: true }).ok, true);
  assert.equal(checkInvoice({ ...rateOnly, recipientName: "x" }).ok, false);

  const neither = {
    ...receipt,
    totals: GOOD.totals.map(({ tax: __, ...t }) => ({ ...t, rateShown: false })),
  };
  const r = checkInvoice(neither, { simplified: true });
  assert.equal(r.ok, false);
  assert.equal(r.missing.length, 2);
});

test("wrong numbers are problems", () => {
  const perLine = {
    ...GOOD,
    prices: "exclusive",
    items: [1, 2, 3].map(() => ({ description: "x", rate: 10, amount: 105 })),
    totals: [{ rate: 10, amount: 315, tax: 30 }],
  };
  const r = checkInvoice(perLine);
  assert.equal(r.ok, false);
  assert.match(r.problems[0], /gives 31 or 32/);

  const badSum = checkInvoice({ ...GOOD, totals: [{ ...GOOD.totals[0], amount: 61000 }] });
  assert.ok(badSum.problems.some((p) => /add up to 60000/.test(p)));
  assert.ok(badSum.missing.some((m) => m.field === "totals[8%].amount"));

  const badNumber = checkInvoice({ ...GOOD, registrationNumber: "T1180301018772" });
  assert.match(badNumber.problems[0], /Check digit/);
  const noT = checkInvoice({ ...GOOD, registrationNumber: "1180301018771" });
  assert.match(noT.problems[0], /leading "T"/);
});
