// (c) 2026 Ash
// SPDX-License-Identifier: MIT
// demo.js
// ---------------------------------------------------------------------------

import assert from "node:assert/strict";
import { checkInvoice, invoiceTax, withholdingTax } from "japan-invoice-mcp";

const tax = invoiceTax([
  { amount: 105, rate: 10 },
  { amount: 105, rate: 10 },
  { amount: 105, rate: 10 },
]);
assert.equal(tax.total.tax, 31);
assert.equal(withholdingTax(1500000).withholding, 204200);
const invoice = {
  issuerName: "Example",
  registrationNumber: "T7000012050002",
  recipientName: "Sample",
  date: "2026-02-30",
  items: [{ description: "Service", amount: 1000, rate: 10 }],
  totals: [{ rate: 10, amount: 1000, tax: 100 }],
};
assert.equal(checkInvoice(invoice).ok, false);
assert.equal(checkInvoice({ ...invoice, date: "2026-02-28" }).ok, true);
console.log("Three lines of 105 yen at 10%: tax 31 yen (per-line rounding would give 30)");
console.log("Withholding on 1,500,000 yen: 204,200 yen");
console.log("2026-02-30: rejected; 2026-02-28: accepted");
