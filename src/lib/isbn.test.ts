import { describe, expect, it } from "vitest";
import { normalizeIsbn } from "./isbn";

// 仕様: docs/spec/isbn-lookup.md#受入基準 2,3,4
describe("normalizeIsbn", () => {
  it("13桁はそのまま返す", () => {
    expect(normalizeIsbn("9784101092058")).toBe("9784101092058");
  });
  it("10桁は13桁に変換する", () => {
    expect(normalizeIsbn("4101092052")).toBe("9784101092058");
    expect(normalizeIsbn("0306406152")).toBe("9780306406157");
  });
  it("末尾が X の10桁も変換できる", () => {
    expect(normalizeIsbn("080442957X")).toBe("9780804429573");
  });
  it("ハイフン・空白を無視する", () => {
    expect(normalizeIsbn("978-4-10-109205-8")).toBe("9784101092058");
    expect(normalizeIsbn(" 4-10-109205-2 ")).toBe("9784101092058");
  });
  it("チェックディジットが誤っていれば null", () => {
    expect(normalizeIsbn("9784101092059")).toBeNull();
    expect(normalizeIsbn("4101092053")).toBeNull();
  });
  it("桁数・文字が不正なら null", () => {
    expect(normalizeIsbn("")).toBeNull();
    expect(normalizeIsbn("12345")).toBeNull();
    expect(normalizeIsbn("97841010920580")).toBeNull();
    expect(normalizeIsbn("abcdefghijklm")).toBeNull();
  });
});
