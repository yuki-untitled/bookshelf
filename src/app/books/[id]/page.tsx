// 仕様: docs/spec/book-management.md#実現内容（What）（詳細画面で全項目を表示）, docs/spec/design.md（詳細画面）
import Link from "next/link";
import { notFound } from "next/navigation";
import { Cover, StatusBadge } from "@/components/Cover";
import { getBook } from "@/lib/books";

export default async function BookPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const book = Number.isInteger(id) ? getBook(id) : null;
  if (!book) notFound();

  return (
    <div className="stack">
      <div className="detail">
        <Cover book={book} />
        <div className="stack">
          <div className="stack" style={{ gap: "var(--sp-2)" }}>
            <h1>{book.title}</h1>
            {book.authors.length > 0 && <p className="muted">{book.authors.join("、")}</p>}
            <div className="row">
              <StatusBadge status={book.status} inline />
              <span className="badge badge-inline">{book.owned ? "所有している" : "所有していない"}</span>
              {book.rating && (
                <span className="stars" role="img" aria-label={`評価 ${book.rating}`}>
                  {"★".repeat(book.rating)}
                </span>
              )}
            </div>
          </div>

          <dl className="info">
            {book.finishedOn && (
              <>
                <dt>読了日</dt>
                <dd>{book.finishedOn}</dd>
              </>
            )}
            {book.publisher && (
              <>
                <dt>出版社</dt>
                <dd>{book.publisher}</dd>
              </>
            )}
            {book.publishedOn && (
              <>
                <dt>出版日</dt>
                <dd>{book.publishedOn}</dd>
              </>
            )}
            {book.isbn && (
              <>
                <dt>ISBN</dt>
                <dd>{book.isbn}</dd>
              </>
            )}
            {book.pages && (
              <>
                <dt>ページ数</dt>
                <dd>{book.pages}</dd>
              </>
            )}
          </dl>

          {book.description && (
            <section className="stack" style={{ gap: "var(--sp-2)" }}>
              <h2>あらすじ</h2>
              <p className="pre">{book.description}</p>
            </section>
          )}
          {book.review && (
            <section className="stack" style={{ gap: "var(--sp-2)" }}>
              <h2>レビュー</h2>
              <p className="pre">{book.review}</p>
            </section>
          )}

          <div className="row">
            <Link href={`/books/${book.id}/edit`} className="btn btn-primary">
              編集
            </Link>
            <Link href={`/books/${book.id}/delete`} className="btn">
              削除
            </Link>
            <Link href="/" className="btn">
              本棚へ戻る
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
