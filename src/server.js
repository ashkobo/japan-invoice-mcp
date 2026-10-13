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
  .describe(
    "Tax rate in percent: 10 (standard), 8 (reduced, 軽減税率) or 0 (非課税・不課税・免税).",
  );
const PRICES = z
  .enum(["exclusive", "inclusive"])
  .optional()
  .describe('"exclusive" = amounts are 税抜 (default), "inclusive" = amounts are 税込.');

// HELPERS
// ---------------------------------------------------------------------------

// A bad input comes back as a tool error instead of crashing the server.
function reply(fn) {
  return async (args) => {
    try {
      return { content: [{ type: "text", text: JSON.stringify(fn(args), null, 2) }] };
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
      "Validate and normalize a 適格請求書発行事業者の登録番号 (T + 13 digits) or a 法人番号 " +
      "(13 digits) with the official check digit. Accepts full-width, hyphens, spaces. " +
      "A correct check digit does not prove registration: the result gives the 国税庁 公表サイト " +
      "URL to confirm it. A 12-digit 会社法人等番号 gets its 法人番号 in the hint.",
    inputSchema: { number: z.string().describe('e.g. "T7000012050002" or "7000-01-205-0002".') },
    annotations: READ_ONLY,
  },
  reply(({ number }) => parseNumber(number)),
);

server.registerTool(
  "japan_invoice_tax",
  {
    title: "Consumption tax on a Japanese invoice",
    description:
      "Consumption tax (消費税) for a qualified invoice (適格請求書): items are grouped by rate " +
      "(10% / 8% 軽減税率 / 0%) and the tax is rounded ONCE per rate, as the invoice system " +
      "requires — not per line. Returns per-rate 対象額 (税抜 and 税込) and 消費税額, and the " +
      "totals. Use this instead of computing invoice tax yourself.",
    inputSchema: {
      items: z
        .array(
          z.object({
            description: z.string().optional(),
            amount: z
              .number()
              .int()
              .optional()
              .describe("Line amount in yen. Negative = discount."),
            unitPrice: z.number().optional().describe("Instead of amount: unit price."),
            quantity: z.number().optional().describe("With unitPrice. Default 1."),
            rate: RATE,
          }),
        )
        .min(1),
      prices: PRICES,
      rounding: z
        .enum(["floor", "round", "ceil"])
        .optional()
        .describe("切り捨て (default), 四捨五入 or 切り上げ. Any one is allowed; once per rate."),
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
      "源泉徴収税額 on 報酬・料金 paid to an individual (原稿料, デザイン料, 講演料 etc., " +
      "所得税法204条1項1号): 10.21% up to 1,000,000 yen, 20.42% on the excess, yen fractions " +
      "cut off. Returns the withholding and the payment (報酬 + 消費税 − 源泉). Give fee, or " +
      "net to find the fee that pays that net (gross-up, 手取り逆算).",
    inputSchema: {
      fee: z.number().int().optional().describe("報酬 in yen, without consumption tax."),
      net: z.number().int().optional().describe("Instead of fee: the payment wanted."),
      taxRate: RATE.optional().describe("Consumption tax rate on the fee. Default 10."),
      consumptionTax: z
        .number()
        .int()
        .optional()
        .describe("Consumption tax in yen, if not fee × taxRate (cut off). Only with fee."),
      separated: z
        .boolean()
        .optional()
        .describe(
          "The invoice shows the consumption tax separately, so it is left out of the base. " +
            "Default true. false = withhold on fee + tax.",
        ),
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
      "Check an invoice against the 記載事項 of an 適格請求書 (or 適格簡易請求書 with " +
      "simplified: true): issuer and registration number, date, items, per-rate totals and " +
      "rate, per-rate tax, recipient. Also checks the totals add up and that each tax is the " +
      "exact tax rounded once (down or up).",
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
              amount: z.number().int().optional().describe("Per-rate total as written."),
              tax: z.number().int().optional().describe("Per-rate 消費税額 as written."),
              rateShown: z
                .boolean()
                .optional()
                .describe("The rate (10% / 8%) is written. Default true."),
            }),
          )
          .optional(),
      }),
      simplified: z.boolean().optional().describe("Check as an 適格簡易請求書 (receipt)."),
    },
    annotations: READ_ONLY,
  },
  reply(({ invoice, simplified }) => checkInvoice(invoice, { simplified })),
);

await server.connect(new StdioServerTransport());
