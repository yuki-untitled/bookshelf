// 仕様: docs/spec/isbn-lookup.md#実現内容（What）
// ISBN は 10桁・13桁のどちらも受け付け、13桁に統一する。チェックディジットが誤っていれば null。

function isbn10CheckDigit(first9: string): string {
  const sum = [...first9].reduce((acc, ch, i) => acc + Number(ch) * (10 - i), 0);
  const r = (11 - (sum % 11)) % 11;
  return r === 10 ? "X" : String(r);
}

function isbn13CheckDigit(first12: string): string {
  const sum = [...first12].reduce((acc, ch, i) => acc + Number(ch) * (i % 2 === 0 ? 1 : 3), 0);
  return String((10 - (sum % 10)) % 10);
}

export function normalizeIsbn(input: string): string | null {
  const s = input.replace(/[-\s]/g, "").toUpperCase();
  if (/^\d{9}[\dX]$/.test(s)) {
    if (isbn10CheckDigit(s.slice(0, 9)) !== s[9]) return null;
    const body = "978" + s.slice(0, 9);
    return body + isbn13CheckDigit(body);
  }
  if (/^\d{13}$/.test(s)) {
    if (isbn13CheckDigit(s.slice(0, 12)) !== s[12]) return null;
    return s;
  }
  return null;
}
