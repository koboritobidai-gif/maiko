import assert from "node:assert/strict";
import { test } from "node:test";
import { isMinutesSubject, parseMinutesSubject, subjectMarker } from "../lib/sources/types.ts";

const MEETINGS = ["経営戦略会議", "経営協議会", "役員会", "全体定例MTG", "商品開発会議"];

test("件名の目印が付いたメールだけを対象にする", () => {
  assert.equal(subjectMarker(), "【議事録送付】");
  assert.ok(isMinutesSubject("【議事録送付】経営戦略会議 2026/09/01"));
  assert.ok(isMinutesSubject("Re: 【議事録送付】役員会"));
  // 「議事録」を含むだけのメールは取り込まない（確認前の下書きなどを拾わないため）。
  assert.ok(!isMinutesSubject("本日の議事録です"));
  assert.ok(!isMinutesSubject("議事録の件について"));
  assert.ok(!isMinutesSubject(""));
});

test("件名から会議名と開催日を読み取る", () => {
  const info = parseMinutesSubject("【議事録送付】経営戦略会議 2026/09/01", MEETINGS);
  assert.equal(info.meeting, "経営戦略会議");
  assert.equal(info.date, "2026-09-01");
  assert.equal(info.title, "経営戦略会議 2026/09/01");
});

test("Re: や Fwd: が付いていても読み取れる", () => {
  const info = parseMinutesSubject("Re: 【議事録送付】役員会 2026年9月1日", MEETINGS);
  assert.equal(info.meeting, "役員会");
  assert.equal(info.date, "2026-09-01");
});

test("会議名は長いものを優先して照合する", () => {
  const info = parseMinutesSubject("【議事録送付】経営協議会", ["協議会", "経営協議会"]);
  assert.equal(info.meeting, "経営協議会");
});

test("登録されていない会議名は null にする", () => {
  const info = parseMinutesSubject("【議事録送付】臨時打ち合わせ", MEETINGS);
  assert.equal(info.meeting, null);
  assert.equal(info.title, "臨時打ち合わせ");
});
