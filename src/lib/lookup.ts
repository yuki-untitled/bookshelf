// 仕様: docs/spec/isbn-lookup.md#制約・関連機能（取得元は openBD → Google Books → 国立国会図書館 の順）
import { XMLParser } from "fast-xml-parser";
import { normalizeIsbn } from "./isbn";

export type BookInfo = {
  title: string;
  altTitle: string | null;
  authors: string[];
  publisher: string | null;
  publishedOn: string | null;
  pages: number | null;
  coverUrl: string | null;
  description: string | null;
};

export type SourceId = "ndl" | "google" | "openbd";

export const SOURCE_LABEL: Record<SourceId, string> = {
  ndl: "国立国会図書館",
  google: "Google Books",
  openbd: "openBD",
};

export type LookupResult =
  // sources は、主の取得元を先頭に、項目を補った取得元を続けたもの
  | { kind: "found"; sources: SourceId[]; info: BookInfo }
  | { kind: "notfound" }
  | { kind: "error" };

const TIMEOUT_MS = 12000; // 国会図書館は最初の1回だけ5秒前後かかることがある

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

type Json = Record<string, unknown>;

function arr<T>(v: T | T[] | undefined | null): T[] {
  return v === undefined || v === null ? [] : Array.isArray(v) ? v : [v];
}

function str(v: unknown): string | null {
  const s = (typeof v === "object" && v !== null ? (v as Json)["#text"] : v) as unknown;
  if (typeof s !== "string" && typeof s !== "number") return null;
  const t = String(s).trim();
  return t || null;
}

// 出版日を 2024 / 2024-05 / 2024-05-17 のいずれかに揃える。読み取れなければ null。
export function normalizeDate(raw: string | null): string | null {
  const m = raw?.match(/(\d{4})(?:[-./]?(\d{1,2}))?(?:[-./]?(\d{1,2}))?/);
  if (!m) return null;
  const [, y, mo, d] = m;
  if (!mo) return y;
  if (Number(mo) < 1 || Number(mo) > 12) return y;
  const month = mo.padStart(2, "0");
  if (!d) return `${y}-${month}`;
  if (Number(d) < 1 || Number(d) > 31) return `${y}-${month}`;
  return `${y}-${month}-${d.padStart(2, "0")}`;
}

// 「宮沢, 賢治, 1896-1933」→「宮沢 賢治」。登録フォームの著者欄はカンマ区切りのため、名前内のカンマを除く。
export function cleanName(raw: string): string {
  return raw
    .replace(/[,，、]\s*\d{3,4}\??\s*-\s*(\d{3,4})?\s*$/, "")
    .replace(/\s*[,，、]\s*/g, " ")
    .trim();
}

function toPositiveInt(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.match(/\d+/)?.[0]) : NaN;
  return Number.isInteger(n) && n >= 1 ? n : null;
}

function nonEmpty(info: BookInfo): number {
  return [info.publisher, info.publishedOn, info.pages, info.coverUrl, info.description, info.authors.length || null].filter(
    Boolean,
  ).length;
}

// 仕様: docs/spec/isbn-lookup.md#制約・関連機能（タイトルの整形）
// 「本タイトル = 並列タイトル」を、タイトルと別タイトルに分ける。並列タイトルの末尾の巻数は、本タイトルの末尾に移す。
// 例: 「楽園ノイズ = Paradise NoiSe. 8」→ タイトル「楽園ノイズ 8」、別タイトル「Paradise NoiSe.」
// 「 : 」以降の副題は、タイトルに残す。
export function splitParallelTitle(raw: string): { title: string; altTitle: string | null } {
  const i = raw.indexOf(" = ");
  if (i < 0) return { title: raw.trim(), altTitle: null };
  let title = raw.slice(0, i).trim();
  let alt = raw.slice(i + 3).trim();
  const volume = alt.match(/\s(\d+)$/);
  if (volume) {
    title = `${title} ${volume[1]}`;
    alt = alt.slice(0, volume.index).trim();
  }
  return { title, altTitle: alt || null };
}

// --- 国立国会図書館サーチ（OpenSearch・XML）---

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", parseTagValue: false });

export function parseNdl(body: string, isbn: string): BookInfo | null {
  const doc = xml.parse(body) as { rss?: { channel?: { item?: Json | Json[] } } };
  const candidates: BookInfo[] = [];
  for (const item of arr(doc.rss?.channel?.item)) {
    // 検索結果にはほかの ISBN の本が混ざらないよう、ISBN が一致するものだけを使う
    const ids = arr(item["dc:identifier"] as Json | Json[]).filter((i) =>
      String((i as Json)["@_xsi:type"] ?? "").includes("ISBN"),
    );
    if (!ids.some((i) => normalizeIsbn(str(i) ?? "") === isbn)) continue;
    const baseTitle = str(item["dc:title"]);
    if (!baseTitle) continue;
    // 巻次は別の項目で返るため、タイトルの末尾に付ける
    const volume = str(item["dcndl:volume"]);
    candidates.push({
      title: volume ? `${baseTitle} ${volume}` : baseTitle,
      altTitle: null,
      authors: arr(item["dc:creator"] as unknown)
        .map((c) => cleanName(str(c) ?? ""))
        .filter(Boolean),
      publisher: str(item["dc:publisher"]),
      publishedOn: normalizeDate(str(item["dcterms:issued"]) ?? str(item["dc:date"])),
      pages: toPositiveInt(str(item["dc:extent"])),
      coverUrl: null,
      description: null,
    });
  }
  // 同じ ISBN で複数の版が返るため、項目がいちばん多く埋まっているものを選ぶ
  return candidates.sort((a, b) => nonEmpty(b) - nonEmpty(a))[0] ?? null;
}

async function fetchNdl(isbn: string): Promise<BookInfo | null> {
  return parseNdl(await fetchText(`https://ndlsearch.ndl.go.jp/api/opensearch?isbn=${isbn}`), isbn);
}

// --- Google Books ---

export function parseGoogle(body: string, isbn: string): BookInfo | null {
  const data = JSON.parse(body) as { error?: unknown; items?: { volumeInfo?: Json }[] };
  if (data.error) throw new Error("Google Books error"); // 利用回数の上限など。接続できなかったものとして扱う
  // ISBN を通常のキーワードとして検索するため、無関係な本が混ざる。ISBN が一致するものだけを使う
  const v = data.items
    ?.map((i) => i.volumeInfo)
    .find((vi) =>
      arr(vi?.industryIdentifiers as Json[] | undefined).some((id) => normalizeIsbn(str(id.identifier) ?? "") === isbn),
    );
  const title = str(v?.title);
  if (!v || !title) return null;
  const thumb = str((v.imageLinks as Json | undefined)?.thumbnail);
  return {
    title,
    altTitle: null,
    authors: arr(v.authors as string[] | undefined).map((a) => a.trim()).filter(Boolean),
    publisher: str(v.publisher),
    publishedOn: normalizeDate(str(v.publishedDate)),
    pages: toPositiveInt(v.pageCount),
    coverUrl: thumb ? thumb.replace(/^http:/, "https:").replace("&edge=curl", "") : null,
    description: str(v.description),
  };
}

async function fetchGoogle(isbn: string): Promise<BookInfo | null> {
  // 「isbn:」などの絞り込み付き検索は結果が0件になることがあるため、ISBN だけをキーワードにして検索する
  const key = process.env.GOOGLE_BOOKS_API_KEY;
  const url = `https://www.googleapis.com/books/v1/volumes?q=${isbn}${key ? `&key=${encodeURIComponent(key)}` : ""}`;
  return parseGoogle(await fetchText(url), isbn);
}

// --- openBD ---

export function parseOpenBd(body: string): BookInfo | null {
  const entry = (JSON.parse(body) as (Json | null)[])[0];
  if (!entry) return null;
  const summary = (entry.summary ?? {}) as Json;
  const onix = (entry.onix ?? {}) as Json;
  const descriptive = (onix.DescriptiveDetail ?? {}) as Json;
  const collateral = (onix.CollateralDetail ?? {}) as Json;

  // 巻数は summary.title にすでに含まれる（例: 「鬼滅の刃 1」）。summary.volume は文庫レーベル内の
  // 通し番号（例: 「4476」「R182-3」）で巻数ではないため、タイトルには足さない。
  const title = str(summary.title);
  if (!title) return null;

  let authors = arr(descriptive.Contributor as Json | Json[] | undefined)
    .map((c) => cleanName(str(((c.PersonName ?? {}) as Json).content) ?? ""))
    .filter(Boolean);
  if (authors.length === 0 && str(summary.author)) authors = [cleanName(str(summary.author)!)];

  // TextType 03: 内容紹介、02: 短い内容紹介。04（目次）はあらすじではないため使わない。
  const texts = arr(collateral.TextContent as Json | Json[] | undefined);
  const description = str(texts.find((t) => t.TextType === "03")?.Text) ?? str(texts.find((t) => t.TextType === "02")?.Text);

  // ExtentType 11: ページ数
  const pages = toPositiveInt(
    arr(descriptive.Extent as Json | Json[] | undefined).find((e) => e.ExtentType === "11")?.ExtentValue,
  );

  const { title: mainTitle, altTitle } = splitParallelTitle(title);
  return {
    title: mainTitle,
    altTitle,
    authors,
    publisher: str(summary.publisher),
    publishedOn: normalizeDate(str(summary.pubdate)),
    pages,
    coverUrl: str(summary.cover),
    description,
  };
}

async function fetchOpenBd(isbn: string): Promise<BookInfo | null> {
  return parseOpenBd(await fetchText(`https://api.openbd.jp/v1/get?isbn=${isbn}`));
}

// --- 問い合わせ ---

const SOURCES: { id: SourceId; fetch: (isbn: string) => Promise<BookInfo | null>; canFill: boolean }[] = [
  { id: "openbd", fetch: fetchOpenBd, canFill: true },
  { id: "google", fetch: fetchGoogle, canFill: true },
  // 表紙もあらすじも無く、応答も遅いため、補うための問い合わせには使わない
  { id: "ndl", fetch: fetchNdl, canFill: false },
];

// 仕様: docs/spec/isbn-lookup.md#制約・関連機能
// 1. 書誌情報が最初に見つかった取得元を「主」とする。接続できなければ次へ進む。
//    3つとも接続できなければ error、それ以外で見つからなければ notfound。
// 2. 主で表紙画像かあらすじが空なら、主より後ろの取得元で補う（空の項目だけ。主の値は上書きしない）。
//    補う問い合わせの失敗は無視する。
export async function lookupIsbn(isbn: string): Promise<LookupResult> {
  let answered = false;
  let primaryIndex = -1;
  let info: BookInfo | null = null;
  for (const [i, source] of SOURCES.entries()) {
    try {
      const found = await source.fetch(isbn);
      answered = true;
      if (found) {
        primaryIndex = i;
        info = { ...found };
        break;
      }
    } catch (e) {
      // 次の取得元へ進む。障害の調査のためサーバーログに残す
      console.warn(`[lookup] ${source.id} に接続できませんでした:`, e);
    }
  }
  if (!info) return answered ? { kind: "notfound" } : { kind: "error" };

  const sources: SourceId[] = [SOURCES[primaryIndex].id];
  for (const source of SOURCES.slice(primaryIndex + 1).filter((s) => s.canFill)) {
    if (info.coverUrl && info.description) break;
    try {
      const extra = await source.fetch(isbn);
      if (!extra) continue;
      let filled = false;
      if (!info.coverUrl && extra.coverUrl) {
        info.coverUrl = extra.coverUrl;
        filled = true;
      }
      if (!info.description && extra.description) {
        info.description = extra.description;
        filled = true;
      }
      if (filled) sources.push(source.id);
    } catch (e) {
      console.warn(`[lookup] ${source.id} に接続できませんでした（補完のため無視）:`, e);
    }
  }
  return { kind: "found", sources, info };
}
