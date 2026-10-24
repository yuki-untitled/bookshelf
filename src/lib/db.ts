// 仕様: docs/spec/book-management.md#制約・関連機能（データは自宅サーバー上に保存する）
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const DB_PATH = resolve(/*turbopackIgnore: true*/ process.env.BOOKSHELF_DB ?? "data/bookshelf.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS books (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  authors      TEXT NOT NULL DEFAULT '[]',
  publisher    TEXT,
  published_on TEXT,
  isbn         TEXT,
  pages        INTEGER,
  cover_url    TEXT,
  description  TEXT,
  owned        INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'want',
  rating       INTEGER,
  review       TEXT,
  finished_on  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_books_isbn ON books (isbn);
CREATE INDEX IF NOT EXISTS idx_books_status ON books (status);
`;

const globalForDb = globalThis as unknown as { bookshelfDb?: DatabaseSync };

export function db(): DatabaseSync {
  if (!globalForDb.bookshelfDb) {
    mkdirSync(dirname(DB_PATH), { recursive: true });
    const d = new DatabaseSync(DB_PATH);
    d.exec("PRAGMA journal_mode = WAL");
    d.exec(SCHEMA);
    globalForDb.bookshelfDb = d;
  }
  return globalForDb.bookshelfDb;
}
