import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanName, lookupIsbn, normalizeDate, parseGoogle, parseNdl, parseOpenBd, splitParallelTitle } from "./lookup";

const ISBN = "9784101092058";

// 実際の応答の形に合わせた固定データ
const NDL_XML = `<?xml version="1.0"?>
<rss xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcndl="http://ndl.go.jp/dcndl/terms/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" version="2.0"><channel>
<item>
  <dc:title>新編銀河鉄道の夜</dc:title><dc:creator>宮沢, 賢治</dc:creator><dc:publisher>新潮社</dc:publisher>
  <dcterms:issued>1992</dcterms:issued><dc:identifier xsi:type="dcndl:ISBN13">9784101092058</dc:identifier>
</item>
<item>
  <dc:title>新編銀河鉄道の夜</dc:title><dc:creator>宮沢, 賢治, 1896-1933</dc:creator><dc:publisher>新潮社</dc:publisher>
  <dcterms:issued>1992.11</dcterms:issued><dc:extent>357p</dc:extent>
  <dc:identifier xsi:type="dcndl:ISBN">4101092052</dc:identifier>
</item>
<item>
  <dc:title>別の本</dc:title><dc:identifier xsi:type="dcndl:ISBN">0306406152</dc:identifier>
</item>
</channel></rss>`;

const GOOGLE_JSON = JSON.stringify({
  items: [
    { volumeInfo: { title: "無関係な本", industryIdentifiers: [{ type: "ISBN_13", identifier: "9789177394723" }] } },
    {
      volumeInfo: {
        industryIdentifiers: [
          { type: "ISBN_13", identifier: "9784101092058" },
          { type: "ISBN_10", identifier: "4101092052" },
        ],
        title: "Error-correction coding",
        authors: ["George C. Clark", "J. Bibb Cain"],
        publisher: "Plenum Press",
        publishedDate: "1981-05",
        pageCount: 432,
        description: "A classic.",
        imageLinks: { thumbnail: "http://books.google.com/books/content?id=x&zoom=1&edge=curl" },
      },
    },
  ],
});

const OPENBD_JSON = JSON.stringify([
  {
    summary: { title: "ONE PIECE 100", volume: "4476", series: "ジャンプコミックス", publisher: "集英社", pubdate: "20210104", cover: "https://cover.openbd.jp/x.jpg", author: "尾田, 栄一郎" },
    onix: {
      DescriptiveDetail: {
        Contributor: [{ PersonName: { content: "尾田, 栄一郎, 1975-" } }],
        Extent: [{ ExtentType: "11", ExtentValue: "192" }],
      },
      CollateralDetail: {
        TextContent: [
          { TextType: "04", Text: "目次です" },
          { TextType: "03", Text: "海賊王に、おれはなる!" },
        ],
      },
    },
  },
]);

describe("normalizeDate", () => {
  it.each([
    ["1992", "1992"],
    ["199211", "1992-11"],
    ["1992.11", "1992-11"],
    ["1992-11-5", "1992-11-05"],
    ["20210104", "2021-01-04"],
    ["c1981", "1981"],
    ["1992-13", "1992"],
  ])("%s → %s", (raw, expected) => expect(normalizeDate(raw)).toBe(expected));
  it("読み取れなければ null", () => {
    expect(normalizeDate(null)).toBeNull();
    expect(normalizeDate("不明")).toBeNull();
  });
});

describe("cleanName", () => {
  it("生没年とカンマを取り除く", () => {
    expect(cleanName("宮沢, 賢治, 1896-1933")).toBe("宮沢 賢治");
    expect(cleanName("尾田, 栄一郎, 1975-")).toBe("尾田 栄一郎");
    expect(cleanName("宮沢,賢治")).toBe("宮沢 賢治");
  });
});

// 仕様: docs/spec/isbn-lookup.md#受入基準 28,29
describe("splitParallelTitle", () => {
  it("並列タイトルを別タイトルに分け、末尾の巻数を本タイトルに移す", () => {
    expect(splitParallelTitle("楽園ノイズ = Paradise NoiSe. 8")).toEqual({ title: "楽園ノイズ 8", altTitle: "Paradise NoiSe." });
  });
  it("巻数が無ければ、別タイトルをそのまま分ける", () => {
    expect(splitParallelTitle("ハリー・ポッターと賢者の石 = Harry Potter and the Philosopher's Stone")).toEqual({
      title: "ハリー・ポッターと賢者の石",
      altTitle: "Harry Potter and the Philosopher's Stone",
    });
  });
  it("副題（ : ）はタイトルに残す", () => {
    expect(splitParallelTitle("魔人の箱庭 : 囚われの淫花")).toEqual({ title: "魔人の箱庭 : 囚われの淫花", altTitle: null });
  });
  it("副題と並列タイトルが両方あっても、最初の ' = ' で分ける", () => {
    expect(splitParallelTitle("本タイトル : 副題 = Main title : Subtitle 3")).toEqual({
      title: "本タイトル : 副題 3",
      altTitle: "Main title : Subtitle",
    });
  });
  it("' = ' を含まないタイトルは変更しない", () => {
    expect(splitParallelTitle("鬼滅の刃 1")).toEqual({ title: "鬼滅の刃 1", altTitle: null });
    expect(splitParallelTitle("A=B")).toEqual({ title: "A=B", altTitle: null });
  });
});

describe("parseNdl", () => {
  it("ISBN が一致する中で、項目がいちばん多く埋まっている版を使う", () => {
    expect(parseNdl(NDL_XML, ISBN)).toEqual({
      title: "新編銀河鉄道の夜",
      altTitle: null,
      authors: ["宮沢 賢治"],
      publisher: "新潮社",
      publishedOn: "1992-11",
      pages: 357,
      coverUrl: null,
      description: null,
    });
  });
  it("ISBN が一致する本が無ければ null", () => {
    expect(parseNdl(NDL_XML, "9784000000000")).toBeNull();
  });
  it("巻次があれば、タイトルの末尾に付ける", () => {
    const xml = `<rss xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcndl="http://ndl.go.jp/dcndl/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" version="2.0"><channel><item>
      <dc:title>楽園ノイズ</dc:title><dcndl:volume>8</dcndl:volume><dc:creator>杉井, 光</dc:creator>
      <dc:publisher>KADOKAWA</dc:publisher><dc:identifier xsi:type="dcndl:ISBN">9784049521351</dc:identifier>
    </item></channel></rss>`;
    expect(parseNdl(xml, "9784049521351")).toMatchObject({ title: "楽園ノイズ 8", altTitle: null, authors: ["杉井 光"] });
  });
  it("結果が0件なら null", () => {
    expect(parseNdl('<rss version="2.0"><channel></channel></rss>', ISBN)).toBeNull();
  });
});

describe("parseGoogle", () => {
  it("書誌情報を取り出し、表紙は https にする", () => {
    expect(parseGoogle(GOOGLE_JSON, ISBN)).toEqual({
      title: "Error-correction coding",
      altTitle: null,
      authors: ["George C. Clark", "J. Bibb Cain"],
      publisher: "Plenum Press",
      publishedOn: "1981-05",
      pages: 432,
      coverUrl: "https://books.google.com/books/content?id=x&zoom=1",
      description: "A classic.",
    });
  });
  it("該当なしは null", () => {
    expect(parseGoogle(JSON.stringify({ totalItems: 0 }), ISBN)).toBeNull();
  });
  it("ISBN が一致する本が無ければ null（無関係な本は採用しない）", () => {
    expect(parseGoogle(GOOGLE_JSON, "9780306406157")).toBeNull();
  });
  it("利用回数の上限などのエラー応答は例外にする（接続できなかった扱い）", () => {
    expect(() => parseGoogle(JSON.stringify({ error: { code: 429 } }), ISBN)).toThrow();
  });
});

describe("parseOpenBd", () => {
  it("タイトルに volume（レーベル内の通し番号）を足さず、内容紹介・ページ数・表紙を取り出す", () => {
    expect(parseOpenBd(OPENBD_JSON)).toEqual({
      title: "ONE PIECE 100",
      altTitle: null,
      authors: ["尾田 栄一郎"],
      publisher: "集英社",
      publishedOn: "2021-01-04",
      pages: 192,
      coverUrl: "https://cover.openbd.jp/x.jpg",
      description: "海賊王に、おれはなる!",
    });
  });
  it("並列タイトルを別タイトルに分ける。volume（レーベル内の通し番号）は足さない", () => {
    const json = JSON.stringify([
      { summary: { title: "楽園ノイズ = Paradise NoiSe. 8", volume: "4476", series: "電撃文庫", publisher: "KADOKAWA", pubdate: "202607", cover: "" } },
    ]);
    expect(parseOpenBd(json)).toMatchObject({ title: "楽園ノイズ 8", altTitle: "Paradise NoiSe." });
  });
  it("該当なし（[null]）は null", () => {
    expect(parseOpenBd("[null]")).toBeNull();
  });
  it("目次しか無い場合、あらすじは空にする", () => {
    const json = JSON.stringify([
      { summary: { title: "本" }, onix: { CollateralDetail: { TextContent: [{ TextType: "04", Text: "目次" }] } } },
    ]);
    expect(parseOpenBd(json)?.description).toBeNull();
  });
});

describe("lookupIsbn", () => {
  afterEach(() => vi.unstubAllGlobals());

  // URL ごとに応答を切り替える。値が Error なら接続失敗、文字列なら本文。
  function stubFetch(responses: { ndl: string | Error; google: string | Error; openbd: string | Error }) {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const name = url.includes("ndlsearch") ? "ndl" : url.includes("googleapis") ? "google" : "openbd";
        calls.push(name);
        const r = responses[name];
        if (r instanceof Error) throw r;
        return new Response(r, { status: 200 });
      }),
    );
    return calls;
  }

  const NDL_EMPTY = '<rss version="2.0"><channel></channel></rss>';
  const GOOGLE_EMPTY = JSON.stringify({ totalItems: 0 });
  const down = new Error("down");

  // openBD の応答。表紙・あらすじの有無を切り替える
  function openBd({ cover, description }: { cover: boolean; description: boolean }) {
    const data = JSON.parse(OPENBD_JSON);
    if (!cover) data[0].summary.cover = "";
    if (!description) data[0].onix.CollateralDetail.TextContent = [];
    return JSON.stringify(data);
  }
  const GOOGLE_FOR_ISBN = GOOGLE_JSON; // ISBN は 9784101092058 に一致する

  it("openBD で表紙・あらすじまで揃えば、そこで打ち切る", async () => {
    const calls = stubFetch({ ndl: NDL_XML, google: GOOGLE_FOR_ISBN, openbd: OPENBD_JSON });
    const r = await lookupIsbn(ISBN);
    expect(r).toMatchObject({ kind: "found", sources: ["openbd"] });
    expect(calls).toEqual(["openbd"]);
  });

  it("主で表紙・あらすじが空なら、後ろの取得元で補う（主の値は上書きしない）", async () => {
    const calls = stubFetch({ ndl: NDL_XML, google: GOOGLE_FOR_ISBN, openbd: openBd({ cover: false, description: false }) });
    const r = await lookupIsbn(ISBN);
    expect(r).toMatchObject({ kind: "found", sources: ["openbd", "google"] });
    if (r.kind !== "found") return;
    expect(r.info.title).toBe("ONE PIECE 100"); // Google のタイトル「Error-correction coding」では上書きしない
    expect(r.info.authors).toEqual(["尾田 栄一郎"]);
    expect(r.info.coverUrl).toBe("https://books.google.com/books/content?id=x&zoom=1");
    expect(r.info.description).toBe("A classic.");
    expect(calls).toEqual(["openbd", "google"]); // 埋まったので国会図書館には問い合わせない
  });

  it("主にある表紙は、後ろの取得元の表紙で上書きしない", async () => {
    stubFetch({ ndl: NDL_XML, google: GOOGLE_FOR_ISBN, openbd: openBd({ cover: true, description: false }) });
    const r = await lookupIsbn(ISBN);
    if (r.kind !== "found") throw new Error("not found");
    expect(r.info.coverUrl).toBe("https://cover.openbd.jp/x.jpg");
    expect(r.info.description).toBe("A classic.");
  });

  it("補う側に表紙もあらすじも無ければ、主だけを返す。国立国会図書館は補うために問い合わせない", async () => {
    const calls = stubFetch({ ndl: NDL_XML, google: GOOGLE_EMPTY, openbd: openBd({ cover: false, description: false }) });
    const r = await lookupIsbn(ISBN);
    expect(r).toMatchObject({ kind: "found", sources: ["openbd"] });
    expect(calls).toEqual(["openbd", "google"]);
  });

  it("補うための問い合わせだけが失敗しても、取得は成功する", async () => {
    stubFetch({ ndl: down, google: down, openbd: openBd({ cover: false, description: false }) });
    const r = await lookupIsbn(ISBN);
    expect(r).toMatchObject({ kind: "found", sources: ["openbd"] });
  });

  it("openBD に無ければ Google Books を主にする", async () => {
    const calls = stubFetch({ ndl: NDL_XML, google: GOOGLE_FOR_ISBN, openbd: "[null]" });
    const r = await lookupIsbn(ISBN);
    expect(r).toMatchObject({ kind: "found", sources: ["google"] });
    expect(calls).toEqual(["openbd", "google"]);
  });

  it("接続できなければ次の取得元を主にする", async () => {
    stubFetch({ ndl: NDL_XML, google: down, openbd: down });
    expect(await lookupIsbn(ISBN)).toMatchObject({ kind: "found", sources: ["ndl"] });
  });

  it("3つとも見つからなければ notfound", async () => {
    stubFetch({ ndl: NDL_EMPTY, google: GOOGLE_EMPTY, openbd: "[null]" });
    expect(await lookupIsbn(ISBN)).toEqual({ kind: "notfound" });
  });

  it("3つとも接続できなければ error", async () => {
    stubFetch({ ndl: down, google: down, openbd: down });
    expect(await lookupIsbn(ISBN)).toEqual({ kind: "error" });
  });

  it("Google Books の上限エラーは接続失敗として扱う", async () => {
    stubFetch({ ndl: down, google: JSON.stringify({ error: { code: 429 } }), openbd: down });
    expect(await lookupIsbn(ISBN)).toEqual({ kind: "error" });
  });

  it("一部が接続できず、残りで見つからなければ notfound", async () => {
    stubFetch({ ndl: NDL_EMPTY, google: down, openbd: "[null]" });
    expect(await lookupIsbn(ISBN)).toEqual({ kind: "notfound" });
  });
});
