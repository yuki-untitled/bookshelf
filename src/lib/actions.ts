"use server";
// 仕様: docs/spec/book-management.md（登録・編集・削除）, docs/spec/reading-record.md（ステータス・評価・読了日）
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  STATUSES,
  deleteBook,
  findByIsbn,
  getBook,
  insertBook,
  updateBook,
  type BookInput,
  type Status,
} from "./books";
import { normalizeIsbn } from "./isbn";
import { SOURCE_LABEL, lookupIsbn, type BookInfo } from "./lookup";

export type FormState = {
  errors?: Partial<Record<string, string>>;
  duplicate?: { id: number; title: string };
  values?: Record<string, string>;
};

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  // ブラウザは textarea の改行を CRLF で送るため、LF に統一して保存する
  return typeof v === "string" ? v.replace(/\r\n/g, "\n").trim() : "";
}

function today(): string {
  return new Date().toLocaleDateString("sv-SE");
}

function parse(fd: FormData, excludeId?: number): { input?: BookInput; state?: FormState } {
  const values: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") values[k] = v;
  const errors: Record<string, string> = {};

  const title = str(fd, "title");
  // 仕様: docs/spec/book-management.md#受入基準 1（タイトルが空の場合は登録できない）
  if (!title) errors.title = "タイトルを入力してください";

  const authors = str(fd, "authors")
    .split(/[,、，\n]/)
    .map((a) => a.trim())
    .filter(Boolean);

  const isbnRaw = str(fd, "isbn");
  let isbn: string | null = null;
  if (isbnRaw) {
    // 仕様: docs/spec/isbn-lookup.md#実現内容（What）（13桁に統一、チェックディジット検証）
    isbn = normalizeIsbn(isbnRaw);
    if (!isbn) errors.isbn = "ISBN が正しくありません（10桁または13桁、チェックディジットも確認してください）";
  }

  const publishedOn = str(fd, "publishedOn") || null;
  if (publishedOn && !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(publishedOn)) {
    errors.publishedOn = "出版日は 2024、2024-05、2024-05-17 のいずれかの形式で入力してください";
  }

  const pagesRaw = str(fd, "pages");
  let pages: number | null = null;
  if (pagesRaw) {
    if (!/^\d+$/.test(pagesRaw) || Number(pagesRaw) < 1) errors.pages = "ページ数は1以上の整数で入力してください";
    else pages = Number(pagesRaw);
  }

  const coverUrl = str(fd, "coverUrl") || null;
  if (coverUrl && !/^https?:\/\/\S+$/.test(coverUrl)) errors.coverUrl = "表紙画像は http:// または https:// で始まる URL を入力してください";

  const statusRaw = str(fd, "status");
  const status = (STATUSES as readonly string[]).includes(statusRaw) ? (statusRaw as Status) : "want";

  // 仕様: docs/spec/reading-record.md#受入基準 6（評価は1〜5の整数のみ）
  const ratingRaw = str(fd, "rating");
  let rating: number | null = null;
  if (ratingRaw) {
    if (!/^[1-5]$/.test(ratingRaw)) errors.rating = "評価は1〜5の整数で入力してください";
    else rating = Number(ratingRaw);
  }

  // 仕様: docs/spec/reading-record.md#受入基準 3,5（読了日は読了のときだけ持ち、初期値は当日）
  let finishedOn: string | null = null;
  if (status === "read") {
    finishedOn = str(fd, "finishedOn") || today();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(finishedOn)) errors.finishedOn = "読了日は日付で入力してください";
  }

  if (Object.keys(errors).length) return { state: { errors, values } };

  if (isbn) {
    const dup = findByIsbn(isbn, excludeId);
    if (dup) return { state: { duplicate: { id: dup.id, title: dup.title }, values } };
  }

  return {
    input: {
      title,
      altTitle: str(fd, "altTitle") || null,
      authors,
      publisher: str(fd, "publisher") || null,
      publishedOn,
      isbn,
      pages,
      coverUrl,
      description: str(fd, "description") || null,
      owned: fd.get("owned") === "on",
      status,
      rating,
      review: str(fd, "review") || null,
      finishedOn,
    },
  };
}

export async function createBook(_prev: FormState, fd: FormData): Promise<FormState> {
  const { input, state } = parse(fd);
  if (!input) return state!;
  const id = insertBook(input);
  revalidatePath("/");
  redirect(`/books/${id}`);
}

export async function updateBookAction(id: number, _prev: FormState, fd: FormData): Promise<FormState> {
  if (!getBook(id)) redirect("/");
  const { input, state } = parse(fd, id);
  if (!input) return state!;
  updateBook(id, input);
  revalidatePath("/");
  revalidatePath(`/books/${id}`);
  redirect(`/books/${id}`);
}

export async function deleteBookAction(id: number): Promise<void> {
  deleteBook(id);
  revalidatePath("/");
  redirect("/");
}

// 仕様: docs/spec/isbn-lookup.md（ISBN から書誌情報を取得する。取得しただけでは本を登録しない）
export type LookupState =
  | { status: "invalid" }
  | { status: "duplicate"; book: { id: number; title: string } }
  | { status: "found"; isbn: string; source: string; info: BookInfo }
  | { status: "notfound"; isbn: string }
  | { status: "error"; isbn: string };

export async function lookupIsbnAction(raw: string): Promise<LookupState> {
  const isbn = normalizeIsbn(String(raw));
  if (!isbn) return { status: "invalid" };
  const dup = findByIsbn(isbn);
  if (dup) return { status: "duplicate", book: { id: dup.id, title: dup.title } };
  const result = await lookupIsbn(isbn);
  if (result.kind === "found") return { status: "found", isbn, source: result.sources.map((id) => SOURCE_LABEL[id]).join("、"), info: result.info };
  return { status: result.kind, isbn };
}

// 仕様: docs/spec/isbn-lookup.md#実現内容（What）（所有確認。本は登録せず、結果だけを返す）
export type CheckState =
  | {
      status: "registered";
      book: { id: number; title: string; coverUrl: string | null; readingStatus: Status; owned: boolean };
    }
  | { status: "unregistered"; isbn: string; info: BookInfo; source: string }
  | { status: "no-info"; isbn: string }
  | { status: "error"; isbn: string }
  | { status: "invalid" };

export async function checkIsbnAction(raw: string): Promise<CheckState> {
  const isbn = normalizeIsbn(String(raw));
  if (!isbn) return { status: "invalid" };
  const book = findByIsbn(isbn);
  if (book) {
    return {
      status: "registered",
      book: { id: book.id, title: book.title, coverUrl: book.coverUrl, readingStatus: book.status, owned: book.owned },
    };
  }
  const result = await lookupIsbn(isbn);
  if (result.kind === "found") {
    return { status: "unregistered", isbn, info: result.info, source: result.sources.map((id) => SOURCE_LABEL[id]).join("、") };
  }
  return { status: result.kind === "notfound" ? "no-info" : "error", isbn };
}

export type ScanRegisterState =
  | { status: "ok"; id: number; title: string }
  | { status: "duplicate"; id: number; title: string }
  | { status: "invalid" };

function optStr(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

// 仕様: docs/spec/isbn-lookup.md#受入基準 17,25（「読みたい」で登録する。書誌情報なしならタイトルは ISBN）
export async function registerScannedAction(raw: string, owned: boolean, info: BookInfo | null): Promise<ScanRegisterState> {
  const isbn = normalizeIsbn(String(raw));
  if (!isbn) return { status: "invalid" };
  const dup = findByIsbn(isbn);
  if (dup) return { status: "duplicate", id: dup.id, title: dup.title };

  const pages = Number(info?.pages);
  const title = optStr(info?.title) ?? isbn;
  const id = insertBook({
    title,
    altTitle: optStr(info?.altTitle),
    authors: Array.isArray(info?.authors) ? info.authors.map(optStr).filter((a): a is string => !!a) : [],
    publisher: optStr(info?.publisher),
    publishedOn: optStr(info?.publishedOn),
    isbn,
    pages: Number.isInteger(pages) && pages >= 1 ? pages : null,
    coverUrl: /^https?:\/\/\S+$/.test(optStr(info?.coverUrl) ?? "") ? optStr(info?.coverUrl) : null,
    description: optStr(info?.description),
    owned: owned === true,
    status: "want",
    rating: null,
    review: null,
    finishedOn: null,
  });
  revalidatePath("/");
  return { status: "ok", id, title };
}
