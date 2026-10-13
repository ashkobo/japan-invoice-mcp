#!/usr/bin/env node
// (c) 2026 Ash
// SPDX-License-Identifier: MIT
// server.js
// ---------------------------------------------------------------------------
// MCP server over stdio. Everything is computed locally: no network, no API keys.
// Each tool is a thin wrapper over the library in index.js.

import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { checkInvoice, grossUp, invoiceTax, parseNumber, withholdingTax } from "./index.js";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const READ_ONLY = { readOnlyHint: true, openWorldHint: false };
const RATE = z
  .union([z.literal(10), z.literal(8), z.literal(0)])
  .describe("Percent: 10, 8 (軽減税率) or 0 (非課税・不課税・免税).");
const PRICES = z
  .enum(["exclusive", "inclusive"])
  .optional()
  .describe('"exclusive" (税抜, default) or "inclusive" (税込).');

// HELPERS
// ---------------------------------------------------------------------------

// A bad input comes back as a tool error instead of crashing the server.
function reply(fn) {
  return async (args) => {
    try {
      return { content: [{ type: "text", text: JSON.stringify(fn(args)) }] };
    } catch (err) {
      return { isError: true, content: [{ type: "text", text: err.message }] };
    }
  };
}

// TOOLS
// ---------------------------------------------------------------------------

const server = new McpServer({ name: "japan-invoice-mcp", version });

server.registerTool(
  "japan_invoice_number",
  {
    title: "Check a Japanese invoice registration number",
    description:
      "Check a 登録番号 (T + 13 digits) or 法人番号 by its check digit and normalize it. " +
      "A valid check digit does not prove registration; the result links to the 公表サイト.",
    inputSchema: { number: z.string().describe('e.g. "T7000012050002".') },
    annotations: READ_ONLY,
  },
  reply(({ number }) => parseNumber(number)),
);

server.registerTool(
  "japan_invoice_tax",
  {
    title: "Consumption tax on a Japanese invoice",
    description:
      "消費税 on an 適格請求書: grouped by rate and rounded ONCE per rate, not per line. " +
      "Returns per-rate 対象額, 消費税額 and totals.",
    inputSchema: {
      items: z
        .array(
          z.object({
            description: z.string().optional(),
            amount: z.number().int().optional().describe("Yen. Negative = discount."),
            unitPrice: z.number().optional().describe("Instead of amount."),
            quantity: z.number().optional().describe("Default 1."),
            rate: RATE,
          }),
        )
        .min(1),
      prices: PRICES,
      rounding: z.enum(["floor", "round", "ceil"]).optional().describe("Default floor (切り捨て)."),
    },
    annotations: READ_ONLY,
  },
  reply(({ items, prices, rounding }) => invoiceTax(items, { prices, rounding })),
);

server.registerTool(
  "japan_withholding_tax",
  {
    title: "Japanese withholding tax on fees (源泉徴収)",
    description:
      "源泉徴収 on 報酬・料金 to an individual (所得税法204条1項1号): 10.21% up to 1,000,000 yen, " +
      "20.42% above. Returns the withholding and the payment. Give fee, or net (手取り逆算).",
    inputSchema: {
      fee: z.number().int().optional().describe("報酬 in yen, excluding consumption tax."),
      net: z.number().int().optional().describe("Instead of fee: the payment wanted."),
      taxRate: RATE.optional().describe("Default 10."),
      consumptionTax: z.number().int().optional().describe("If not fee × taxRate. Only with fee."),
      separated: z
        .boolean()
        .optional()
        .describe("Tax shown separately, so left out of the base. Default true."),
    },
    annotations: READ_ONLY,
  },
  reply(({ fee, net, taxRate, consumptionTax, separated }) => {
    if ((fee === undefined) === (net === undefined)) throw new RangeError("Give fee or net.");
    if (net !== undefined) {
      if (consumptionTax !== undefined) throw new RangeError("consumptionTax works only with fee.");
      return grossUp(net, { taxRate, separated });
    }
    return withholdingTax(fee, { taxRate, consumptionTax, separated });
  }),
);

server.registerTool(
  "japan_invoice_check",
  {
    title: "Check a Japanese invoice for required fields",
    description:
      "Check an 適格請求書 for missing 記載事項, totals that do not add up and tax not " +
      "rounded once per rate.",
    inputSchema: {
      invoice: z.object({
        issuerName: z.string().optional(),
        registrationNumber: z.string().optional(),
        date: z.string().optional().describe("取引年月日."),
        recipientName: z.string().optional(),
        prices: PRICES,
        items: z
          .array(
            z.object({
              description: z.string().optional(),
              rate: RATE,
              amount: z.number().int().optional(),
            }),
          )
          .optional(),
        totals: z
          .array(
            z.object({
              rate: RATE,
              amount: z.number().int().optional().describe("As written."),
              tax: z.number().int().optional().describe("As written."),
              rateShown: z.boolean().optional().describe("Default true."),
            }),
          )
          .optional(),
      }),
      simplified: z.boolean().optional().describe("As an 適格簡易請求書 (receipt)."),
    },
    annotations: READ_ONLY,
  },
  reply(({ invoice, simplified }) => checkInvoice(invoice, { simplified })),
);

await server.connect(new StdioServerTransport());
