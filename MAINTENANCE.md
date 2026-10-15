# Maintaining japan-invoice-mcp

This is an offline calculator and structured-input checker. It does not confirm registration,
determine the tax classification of a transaction, interpret a contract or replace accounting
software. A passing `checkInvoice` result concerns only the supplied fields and tested arithmetic.

## Before a release

Run `npm ci`, `npm run lint`, `npm test`, `npm run demo` and `npm run verify:package`.
Confirm the candidate's CI, version and packed file list. Run the demo from the installed
tarball, including the rejection of February 30, leap-year cases and rate-group rounding.

For calculation changes, record an independent source/example and add boundary tests before
changing implementation. Cover each rounding mode, the 1,000,000-yen withholding boundary,
separate versus combined consumption tax and gross-up values that cannot be hit exactly.
Do not infer registration from a valid check digit, or a correct transaction from field presence.

## Annual rule review

Review the official rules before each year's first release and after a relevant announcement.
Check supported consumption tax rates, covered fee categories, withholding thresholds and
surtax periods. Keep the supported year and exclusions explicit in README and tool descriptions.
An annual review is still required when the numerical total remains unchanged after a rule change.

- [Consumption tax rounding](https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6371.htm)
- [Withholding on manuscript and lecture fees](https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2795.htm)
- [Invoice system guide](https://www.nta.go.jp/taxes/shiraberu/zeimokubetsu/shohi/keigenzeiritsu/invoice_tebiki.htm)
- [Registration master](https://www.invoice-kohyo.nta.go.jp/)

## Reports and date format

Use synthetic invoice data. Ask for package version, normalized input, expected result and the
official worked example or rule being applied. Never ask for a customer's actual invoice,
personal tax identifier or bank details in a public Issue.

Transaction dates must be real Gregorian dates in `YYYY-MM-DD` format. Missing dates are
reported as missing fields; malformed and impossible dates are reported as problems.
Timestamps, relative prose, era dates and ambiguous numeric dates must be normalized by the
caller first. Registration existence, legal eligibility of tax rates and omitted real-world
transactions remain outside the checker.
