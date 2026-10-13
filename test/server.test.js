// (c) 2026 Ash
// SPDX-License-Identifier: MIT
// server.test.js
// ---------------------------------------------------------------------------

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const client = new Client({ name: "test", version: "0" });

before(async () => {
  const server = fileURLToPath(new URL("../src/server.js", import.meta.url));
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [server] }));
});
after(() => client.close());

async function call(name, args) {
  const res = await client.callTool({ name, arguments: args });
  return { ...res, json: res.isError ? null : JSON.parse(res.content[0].text) };
}

test("lists the tools", async () => {
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), [
    "japan_invoice_check",
    "japan_invoice_number",
    "japan_invoice_tax",
    "japan_withholding_tax",
  ]);
});

test("registration number", async () => {
  const { json } = await call("japan_invoice_number", { number: "ｔ７０００−０１２０−５０００２" });
  assert.equal(json.valid, true);
  assert.equal(json.registrationNumber, "T7000012050002");
});

test("invoice tax", async () => {
  const { json } = await call("japan_invoice_tax", {
    items: [
      { description: "牛肉", amount: 40000, rate: 8 },
      { description: "キッチンペーパー", amount: 60000, rate: 10 },
    ],
    prices: "inclusive",
  });
  assert.equal(json.total.tax, 8416);
});

test("withholding tax and gross-up", async () => {
  assert.equal((await call("japan_withholding_tax", { fee: 1_500_000 })).json.withholding, 204_200);
  assert.equal((await call("japan_withholding_tax", { net: 99_790 })).json.fee, 100_000);
});

test("invoice check", async () => {
  const { json } = await call("japan_invoice_check", {
    invoice: { issuerName: "x", items: [{ description: "y", rate: 10 }] },
  });
  assert.equal(json.ok, false);
  assert.ok(json.missing.some((m) => m.field === "registrationNumber"));
});

test("bad input is a tool error, not a crash", async () => {
  const res = await call("japan_withholding_tax", { fee: 1, net: 1 });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /Give fee or net/);
});
