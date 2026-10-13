// (c) 2026 Ash
// SPDX-License-Identifier: MIT
// index.js
// ---------------------------------------------------------------------------
// The library API. The MCP server (server.js) is a thin layer over these.

export { checkDigit, INVOICE_LOOKUP_URL, parseNumber } from "./number.js";
export { checkInvoice, REQUIREMENTS } from "./requirements.js";
export { invoiceTax, RATES, taxOf } from "./tax.js";
export { grossUp, withholdingOn, withholdingTax } from "./withholding.js";
export { divide, ROUNDING } from "./yen.js";
