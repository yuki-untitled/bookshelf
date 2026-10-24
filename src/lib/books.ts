// 仕様: docs/spec/book-management.md, docs/spec/reading-record.md
import { db } from "./db";
import { STATUSES, STATUS_ICON, STATUS_LABEL, type Status } from "./status";

export { STATUSES, STATUS_LABEL, STATUS_ICON, type Status };

export type Book = {
  id: number;
  title: string;
  altTitle: string | null;
  authors: string[];
  publisher: string | null;
  publishedOn: string | null;
  isbn: string | null;
  pages: number | null;
  coverUrl: string | null;
  description: string | null;
  owned: boolean;
  status: Status;
  rating: number | null;
  review: string | null;
  finishedOn: string | null;
  createdAt: string;
};

export type BookInput = Omit<Book, "id" | "createdAt">;

type Row = Record<string, string | number | null>;

function toBook(r: Row): Book {
  return {
    id: r.id as number,
    title: r.title as string,
    altTitle: r.alt_title as string | null,
    authors: JSON.parse(r.authors as string) as string[],
    publisher: r.publisher as string | null,
    publishedOn: r.published_on as string | null,
    isbn: r.isbn as string | null,
    pages: r.pages as number | null,
    coverUrl: r.cover_url as string | null,
    description: r.description as string | null,
    owned: r.owned === 1,
    status: r.status as Status,
    rating: r.rating as number | null,
    review: r.review as string | null,
    finishedOn: r.finished_on as string | null,
    createdAt: r.created_at as string,
  };
}

export type Sort = "newest" | "title" | "rating";
export type OwnedFilter = "owned" | "not-owned";

export type ListQuery = {
  q?: string;
  status?: Status;
  owned?: OwnedFilter;
  sort?: Sort;
};

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => "\\" + c);
}

export function listBooks({ q, status, owned, sort = "newest" }: ListQuery): Book[] {
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (q) {
    const like = `%${escapeLike(q)}%`;
    where.push("(title LIKE ? ESCAPE '\\' OR alt_title LIKE ? ESCAPE '\\' OR authors LIKE ? ESCAPE '\\')");
    args.push(like, like, like);
  }
  if (status) {
    where.push("status = ?");
    args.push(status);
  }
  if (owned) {
    where.push("owned = ?");
    args.push(owned === "owned" ? 1 : 0);
  }
  // 仕様: docs/spec/book-management.md#受入基準 9（評価が未設定の本は末尾）
  const order =
    sort === "title"
      ? "title COLLATE NOCASE ASC, id ASC"
      : sort === "rating"
        ? "rating IS NULL, rating DESC, id DESC"
        : "id DESC";
  const sql = `SELECT * FROM books ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY ${order}`;
  return (db().prepare(sql).all(...args) as Row[]).map(toBook);
}

// 仕様: docs/spec/reading-record.md#受入基準 12（ステータスごとの冊数）
export function countByStatus(): Record<Status, number> {
  const counts: Record<Status, number> = { want: 0, reading: 0, read: 0, tsundoku: 0 };
  const rows = db().prepare("SELECT status, COUNT(*) AS n FROM books GROUP BY status").all() as Row[];
  for (const r of rows) counts[r.status as Status] = r.n as number;
  return counts;
}

export function getBook(id: number): Book | null {
  const r = db().prepare("SELECT * FROM books WHERE id = ?").get(id) as Row | undefined;
  return r ? toBook(r) : null;
}

// 仕様: docs/spec/book-management.md#受入基準 5（重複ISBN警告）
export function findByIsbn(isbn: string, excludeId?: number): Book | null {
  const r = db()
    .prepare("SELECT * FROM books WHERE isbn = ? AND id != ? LIMIT 1")
    .get(isbn, excludeId ?? -1) as Row | undefined;
  return r ? toBook(r) : null;
}

function values(b: BookInput) {
  return [
    b.title,
    b.altTitle,
    JSON.stringify(b.authors),
    b.publisher,
    b.publishedOn,
    b.isbn,
    b.pages,
    b.coverUrl,
    b.description,
    b.owned ? 1 : 0,
    b.status,
    b.rating,
    b.review,
    b.finishedOn,
  ];
}

export function insertBook(b: BookInput): number {
  const res = db()
    .prepare(
      `INSERT INTO books (title, alt_title, authors, publisher, published_on, isbn, pages, cover_url,
         description, owned, status, rating, review, finished_on)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(...values(b));
  return Number(res.lastInsertRowid);
}

export function updateBook(id: number, b: BookInput): void {
  db()
    .prepare(
      `UPDATE books SET title = ?, alt_title = ?, authors = ?, publisher = ?, published_on = ?, isbn = ?,
         pages = ?, cover_url = ?, description = ?, owned = ?, status = ?, rating = ?,
         review = ?, finished_on = ? WHERE id = ?`,
    )
    .run(...values(b), id);
}

export function deleteBook(id: number): void {
  db().prepare("DELETE FROM books WHERE id = ?").run(id);
}
