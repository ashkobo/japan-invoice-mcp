// (c) 2026 Ash
// SPDX-License-Identifier: MIT
// number.test.js
// ---------------------------------------------------------------------------

import assert from "node:assert/strict";
import { test } from "node:test";
import { checkDigit, parseNumber } from "../src/index.js";

// Published 法人番号 (国税庁 法人番号公表サイト).
const REAL = {
  国税庁: "7000012050002",
  トヨタ自動車: "1180301018771",
  ソニーグループ: "5010401067252",
  任天堂: "1130001011420",
};

test("the 国税庁 worked example: 700110005901 → check digit 8", () => {
  // houjin-bangou.nta.go.jp/documents/checkdigit.pdf
  assert.equal(checkDigit("700110005901"), 8);
});

test("real published numbers are valid", () => {
  for (const [name, number] of Object.entries(REAL)) {
    const r = parseNumber(number);
    assert.equal(r.valid, true, name);
    assert.equal(r.kind, "corporate-number");
    assert.equal(r.registrationNumber, `T${number}`);
    assert.equal(parseNumber(`T${number}`).kind, "registration-number");
  }
});

test("normalizes the ways people write it", () => {
  for (const input of [
    "T7000012050002",
    "t7000012050002",
    "Ｔ７００００１２０５０００２",
    "ｔ７０００−０１２０−５０００２",
    " T 7000 0120 50002 ",
    "T-7000-01-205-0002",
  ]) {
    const r = parseNumber(input);
    assert.equal(r.valid, true, input);
    assert.equal(r.registrationNumber, "T7000012050002", input);
  }
});

test("lookup URL points at the 公表サイト", () => {
  assert.equal(
    parseNumber("T1180301018771").lookupUrl,
    "https://www.invoice-kohyo.nta.go.jp/regno-search/detail?selRegNo=1180301018771",
  );
});

test("invalid numbers say why", () => {
  const wrong = parseNumber("T7000012050003");
  assert.equal(wrong.valid, false);
  assert.match(wrong.reason, /Check digit/);
  assert.equal(parseNumber("8000012050002").expectedCheckDigit, 7);

  assert.equal(parseNumber("T700001205000").valid, false);
  assert.equal(parseNumber("T70000120500021").valid, false);
  assert.equal(parseNumber("TX000012050002").valid, false);
  assert.equal(parseNumber("").valid, false);
  // A check digit is never 0, so a number starting with 0 is always wrong.
  assert.equal(parseNumber("0000012050002").valid, false);
});

test("12 digits: the 会社法人等番号 gets its 法人番号", () => {
  const r = parseNumber("7001-10-005901");
  assert.equal(r.valid, false);
  assert.equal(r.corporateNumber, "8700110005901");
});

test("property: generated numbers round-trip, single-digit typos are caught", () => {
  for (let n = 0; n < 2000; n += 1) {
    const base = String(Math.floor(Math.random() * 1e12)).padStart(12, "0");
    const full = `${checkDigit(base)}${base}`;
    assert.equal(parseNumber(full).valid, true, full);
    assert.ok(checkDigit(base) >= 1 && checkDigit(base) <= 9);

    // Change one digit. Mod 9 cannot see a 0 ⇄ 9 swap; every other change is caught.
    const place = Math.floor(Math.random() * 13);
    const old = Number(full[place]);
    const digit = (old + 1 + Math.floor(Math.random() * 9)) % 10;
    const typo = full.slice(0, place) + digit + full.slice(place + 1);
    const nineSwap = place > 0 && Math.abs(digit - old) === 9;
    assert.equal(parseNumber(typo).valid, nineSwap, typo);
  }
});
