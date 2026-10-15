<img src=".github/assets/ash.png" alt="" width="110" align="right">

# japan-invoice-mcp

**Let your AI agent do Japanese invoices right.** An MCP server for the invoice system (インボイス制度 / 適格請求書): registration numbers, consumption tax by rate, and withholding tax (源泉徴収).

- Offline — pure computation. No network, no API keys.
- Checks a 登録番号 or 法人番号 with the official check digit. Tested on the 国税庁 worked example, real published numbers, and over 800,000 registration numbers from the 国税庁 bulk download.
- Consumption tax rounded once per rate per invoice, as the law requires, in whole-yen integer arithmetic. Tested against the figures in the 国税庁 invoice Q&A.
- Withholding on fees, with the net payment and a gross-up (手取りから逆算).
- Works with Claude Code, Codex, Claude Desktop, Cursor and any MCP client.

LLMs often get these wrong: they round the tax on each line and add it up, multiply by 0.1021 in floating point, or forget the 20.42% band above 1,000,000 yen.

## Install

Claude Code:

```sh
claude mcp add japan-invoice -- npx -y japan-invoice-mcp
```

Codex:

```sh
codex mcp add japan-invoice -- npx -y japan-invoice-mcp
```

Claude Desktop / Cursor (`mcpServers` in the config file):

```json
{
  "mcpServers": {
    "japan-invoice": { "command": "npx", "args": ["-y", "japan-invoice-mcp"] }
  }
}
```

Requires Node.js 18 or later.

## Tools

| Tool | What it does | Example |
|---|---|---|
| `japan_invoice_number` | Validate and normalize a registration number (T + 13 digits) or 法人番号. Gives the 公表サイト URL to confirm registration. | `ｔ７０００−０１２０−５０００２` → `T7000012050002`, valid |
| `japan_invoice_tax` | Consumption tax for an invoice: per-rate 対象額 and 消費税額 (10% / 8% 軽減税率 / 0%), 税抜 or 税込, 切り捨て / 四捨五入 / 切り上げ | 10%: 60,000 + 8%: 40,000 (税込) → 5,454 + 2,962 = 8,416 |
| `japan_withholding_tax` | 源泉徴収 on 報酬・料金 paid to an individual, and the payment. Or, given the net, the fee. | 1,500,000 → 204,200 |
| `japan_invoice_check` | Check an invoice for the 記載事項 of an 適格請求書 / 適格簡易請求書, and that totals and tax add up | missing `recipientName` → 書類の交付を受ける事業者の氏名又は名称 |

Rounding the tax per line is the classic mistake. Three lines of 105 yen at 10%:

| | Tax |
|---|---|
| Per line: 10 + 10 + 10 | 30 (not allowed on an invoice) |
| Once for the rate: 315 × 10% = 31.5 | **31** |

`japan_invoice_tax` returns 31 and a note that per-line rounding would give 30.

Withholding, with the consumption tax shown separately on the invoice:

| 報酬 | 消費税 | 源泉徴収 | 支払額 |
|---|---|---|---|
| 100,000 | 10,000 | 10,210 | 99,790 |
| 1,500,000 | 150,000 | 204,200 | 1,445,800 |

## As a library

<!-- readme-trial: library -->
```js
import assert from "node:assert/strict";
import { parseNumber, invoiceTax, withholdingTax, grossUp } from "japan-invoice-mcp";

assert.equal(parseNumber("T7000-0120-50002").valid, true);
assert.equal(invoiceTax([{ amount: 60000, rate: 10 }, { amount: 40000, rate: 8 }],
  { prices: "inclusive" }).total.tax, 8416);
assert.equal(withholdingTax(1_500_000).withholding, 204200);
assert.equal(grossUp(99_790).fee, 100000);
```

## Try a rounding check

Ask the connected agent to "Calculate invoice tax on three 105-yen items, all at 10%, tax exclusive."
It should call `japan_invoice_tax` and return 31 yen, with the per-line rounding warning.
From a source checkout, `npm run demo` asserts this result, withholding and invalid-date rejection.

Use this for deterministic calculations inside an agent or your own invoice workflow.
It does not issue an invoice, maintain your books, file tax returns, or verify registration
against the government master. If those are your tasks, use accounting software or the
[official registration service](https://www.invoice-kohyo.nta.go.jp/).
Number validation alone also has alternatives, such as
[mcp-jp-corporate-id](https://github.com/skypier-jp-works/mcp-jp-corporate-id).
This tool adds per-rate tax, withholding and structured field checks; compare that scope
against what you actually need.

The structured `checkInvoice` / `japan_invoice_check` input uses a real `YYYY-MM-DD` transaction
date. Impossible dates, timestamps and ambiguous date strings are rejected. `ok: true` covers
the supplied fields and checked arithmetic; it does not prove the transaction occurred,
the issuer is registered, or the supplied reduced-tax classification is legally correct.
It does not parse a PDF, perform OCR, or determine every legal exception.

## Notes

- Not tax advice. Rates as of 2026: consumption tax 10% / 8%; withholding 10.21% / 20.42% (including the 2.1% surtax; from 2027 it is split into 復興 1.1% + 防衛 1%, the same total).
- A correct check digit only means the number is well-formed. It does not prove the business is registered — check on the [国税庁 適格請求書発行事業者公表サイト](https://www.invoice-kohyo.nta.go.jp/) (each result has the direct URL). The check digit also cannot see a 0 ⇄ 9 swap of a single digit.
- A corporation's registration number is T + its 法人番号. Individuals get a separate 13-digit number (not the マイナンバー) with the same check digit; the number alone does not tell which one it is.
- Rounding: the law allows 切り捨て, 四捨五入 or 切り上げ, but only once per rate per invoice (消費税法施行令70条の10). For negative amounts (discounts, refunds), the mode applies to the size of the amount.
- Withholding covers 報酬・料金 under 所得税法204条1項1号 (原稿料, デザイン料, 講演料 and the like) paid to individuals. Some fees use other rules (e.g. 司法書士, 外交員, ホステス). When the invoice shows the consumption tax separately, it can be left out of the base (`separated`, default true).

## 日本語

AI エージェントにインボイスの計算をさせるための MCP サーバーです。ネットにつながず、API キーも要りません。

- 登録番号・法人番号のチェックデジット検証と表記の正規化（全角・ハイフン・小文字の t）。公表サイトで確かめる URL も返します。
- 消費税額を税率ごと（10%・8%）に 1 回だけ端数処理して計算（税抜・税込、切り捨て・四捨五入・切り上げ）。行ごとに端数処理すると額が変わる場合は注意を出します。
- 報酬・料金の源泉徴収税額（10.21%・100 万円超の部分は 20.42%）と支払額。手取り額からの逆算もできます。
- 適格請求書・適格簡易請求書の記載事項のチェック。

税務の助言ではありません。税率は 2026 年時点のものです。

## License

MIT

## Verify and maintain

`npm run verify:package` installs a real tarball in a fresh consumer and checks the API demo
and MCP connection. `npm test` checks official calculation examples and regression cases.
See [MAINTENANCE.md](MAINTENANCE.md) for annual rule review, official references and release checks.

If tools do not appear, confirm Node.js 18+, check the client configuration and restart it.
An unsupported rate or fractional yen amount is an input error: choose a supported rate and
the documented unit-price/quantity interface where needed. A valid number with no registration
record must be confirmed on the official service; the offline check cannot resolve that.
