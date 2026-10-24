// 仕様: docs/spec/book-management.md#実現内容（What）（一覧・絞り込み・検索・並べ替え）, docs/spec/design.md（本棚）
import Link from "next/link";
import { Cover } from "@/components/Cover";
import {
  STATUSES,
  STATUS_LABEL,
  countByStatus,
  listBooks,
  type OwnedFilter,
  type Sort,
  type Status,
} from "@/lib/books";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

function href(params: Record<string, string>): string {
  const sp = new URLSearchParams(Object.entries(params).filter(([, v]) => v));
  const s = sp.toString();
  return s ? `/?${s}` : "/";
}

export default async function ShelfPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = one(sp.q).trim();
  const status = (STATUSES as readonly string[]).includes(one(sp.status)) ? (one(sp.status) as Status) : undefined;
  const owned = (["owned", "not-owned"] as const).includes(one(sp.owned) as OwnedFilter)
    ? (one(sp.owned) as OwnedFilter)
    : undefined;
  const sort = (["newest", "title", "rating"] as const).includes(one(sp.sort) as Sort)
    ? (one(sp.sort) as Sort)
    : "newest";

  const books = listBooks({ q, status, owned, sort });
  const counts = countByStatus();
  const total = STATUSES.reduce((n, s) => n + counts[s], 0);
  const keep = { q, owned: owned ?? "", sort: sort === "newest" ? "" : sort };

  return (
    <div>
      <div className="shelf-head">
        <h1>Bookshelf</h1>

        <nav className="chips" aria-label="読書ステータスで絞り込み">
          <Link href={href(keep)} className="chip" aria-current={!status}>
            すべて {total}
          </Link>
          {STATUSES.map((s) => (
            <Link key={s} href={href({ ...keep, status: s })} className="chip" aria-current={status === s}>
              {STATUS_LABEL[s]} {counts[s]}
            </Link>
          ))}
        </nav>

        <form action="/" method="get" className="search" role="search">
          {status && <input type="hidden" name="status" value={status} />}
          <input type="search" name="q" defaultValue={q} placeholder="タイトル・著者で検索" aria-label="タイトル・著者で検索" />
          <select name="owned" defaultValue={owned ?? ""} aria-label="所有で絞り込み">
            <option value="">所有: すべて</option>
            <option value="owned">所有している</option>
            <option value="not-owned">所有していない</option>
          </select>
          <select name="sort" defaultValue={sort} aria-label="並べ替え">
            <option value="newest">登録が新しい順</option>
            <option value="title">タイトル順</option>
            <option value="rating">評価が高い順</option>
          </select>
          <button type="submit" className="btn btn-primary">
            検索
          </button>
        </form>
      </div>

      {books.length === 0 ? (
        <div className="empty muted">
          {total === 0 ? (
            <p>
              まだ本がありません。<Link href="/books/new">本を登録</Link>してください。
            </p>
          ) : (
            <p>条件に一致する本がありません。</p>
          )}
        </div>
      ) : (
        <ul className="grid">
          {books.map((b) => (
            <li key={b.id}>
              <Link href={`/books/${b.id}`} className="book-link">
                <Cover book={b} badge />
                <div className="book-meta">
                  <div className="book-title">{b.title}</div>
                  {b.authors.length > 0 && <div className="book-author">{b.authors.join("、")}</div>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
