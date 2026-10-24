// 仕様: docs/spec/design.md#実現内容（What）（表紙は縦横比 2:3。表紙なしはタイトル入りのプレースホルダ）
import type { Book } from "@/lib/books";
import { STATUS_ICON, STATUS_LABEL } from "@/lib/status";

export function StatusBadge({ status, inline }: { status: Book["status"]; inline?: boolean }) {
  return (
    <span className={inline ? "badge badge-inline" : "badge"}>
      <span aria-hidden="true">{STATUS_ICON[status]}</span>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Cover({ book, badge }: { book: Pick<Book, "title" | "coverUrl" | "status">; badge?: boolean }) {
  return (
    <div className="cover">
      {book.coverUrl ? (
        // 外部の任意ドメインの画像を扱うため、next/image ではなく通常の img を使う
        // eslint-disable-next-line @next/next/no-img-element
        <img src={book.coverUrl} alt={`${book.title} の表紙`} loading="lazy" referrerPolicy="no-referrer" />
      ) : (
        <div className="cover-placeholder">{book.title}</div>
      )}
      {badge && <StatusBadge status={book.status} />}
    </div>
  );
}
