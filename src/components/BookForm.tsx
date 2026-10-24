"use client";
// 仕様: docs/spec/book-management.md#実現内容（What）（入力項目）, docs/spec/reading-record.md（ステータス・評価・レビュー）
import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import type { Book } from "@/lib/books";
import { STATUSES, STATUS_LABEL } from "@/lib/status";
import { lookupIsbnAction, type FormState, type LookupState } from "@/lib/actions";
import { BarcodeScanner } from "./BarcodeScanner";

type Props = {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  book?: Book;
  submitLabel: string;
  cancelHref: string;
  // 登録画面だけ、ISBN の取得とバーコード読み取りを最上部に出す
  lookup?: boolean;
};

type LookupUi = LookupState | { status: "loading" } | null;

function initialValues(book?: Book): Record<string, string> {
  if (!book) return { status: "want" };
  return {
    title: book.title,
    altTitle: book.altTitle ?? "",
    authors: book.authors.join(", "),
    publisher: book.publisher ?? "",
    publishedOn: book.publishedOn ?? "",
    isbn: book.isbn ?? "",
    pages: book.pages?.toString() ?? "",
    coverUrl: book.coverUrl ?? "",
    description: book.description ?? "",
    owned: book.owned ? "on" : "",
    status: book.status,
    rating: book.rating?.toString() ?? "",
    review: book.review ?? "",
    finishedOn: book.finishedOn ?? "",
  };
}

export function BookForm({ action, book, submitLabel, cancelHref, lookup }: Props) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  const v = state.values ?? initialValues(book);
  const err = state.errors ?? {};

  const formRef = useRef<HTMLFormElement>(null);
  const [lookupUi, setLookupUi] = useState<LookupUi>(null);
  const [scanning, setScanning] = useState(false);

  function setField(name: string, value: string) {
    const el = formRef.current?.elements.namedItem(name);
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.value = value;
  }

  // 仕様: docs/spec/isbn-lookup.md#実現内容（What）（取得結果は登録前にフォームで確認・修正できる）
  async function runLookup(raw: string) {
    setLookupUi({ status: "loading" });
    const r = await lookupIsbnAction(raw);
    setLookupUi(r);
    if (r.status === "found") {
      setField("isbn", r.isbn);
      // 取得できなかった項目は空欄にする（補完しない）
      const { title, altTitle, authors, publisher, publishedOn, pages, coverUrl, description } = r.info;
      setField("title", title);
      setField("altTitle", altTitle ?? "");
      setField("authors", authors.join(", "));
      setField("publisher", publisher ?? "");
      setField("publishedOn", publishedOn ?? "");
      setField("pages", pages?.toString() ?? "");
      setField("coverUrl", coverUrl ?? "");
      setField("description", description ?? "");
    } else if (r.status === "notfound" || r.status === "error") {
      // ISBN だけ入力済みの状態で手入力に切り替える
      setField("isbn", r.isbn);
    }
  }

  function onDetect(isbn: string) {
    setScanning(false);
    setField("isbn", isbn);
    void runLookup(isbn);
  }

  const isbnField = (
    <div className="field">
      <label htmlFor="isbn">ISBN（10桁または13桁）</label>
      <div className="row nowrap">
        <input
          id="isbn"
          name="isbn"
          type="text"
          inputMode="numeric"
          defaultValue={v.isbn ?? ""}
          aria-invalid={!!err.isbn}
          onKeyDown={
            lookup
              ? (e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void runLookup(e.currentTarget.value);
                  }
                }
              : undefined
          }
        />
        {lookup && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={lookupUi?.status === "loading"}
            onClick={() => runLookup(formRef.current?.isbn.value ?? "")}
          >
            取得
          </button>
        )}
      </div>
      {err.isbn && <span className="field-error">⚠ {err.isbn}</span>}
    </div>
  );

  return (
    <form ref={formRef} action={formAction} className="stack" noValidate>
      {lookup && (
        <section className="stack lookup" aria-label="ISBN から入力">
          {isbnField}
          <button type="button" className="btn" onClick={() => setScanning(true)}>
            バーコードを読み取る
          </button>
          <div role="status" aria-live="polite">
            <LookupMessage ui={lookupUi} />
          </div>
        </section>
      )}
      {scanning && <BarcodeScanner onDetect={onDetect} onClose={() => setScanning(false)} />}
      {state.duplicate && (
        <div className="notice" role="alert">
          ⚠ この ISBN の本は登録済みです：
          <Link href={`/books/${state.duplicate.id}`}>{state.duplicate.title}</Link>
        </div>
      )}
      {Object.keys(err).length > 0 && (
        <div className="notice" role="alert">
          ⚠ 入力内容を確認してください。
        </div>
      )}

      <div className="form-grid">
        <div className="field wide">
          <label htmlFor="title">タイトル（必須）</label>
          <input id="title" name="title" type="text" defaultValue={v.title ?? ""} aria-invalid={!!err.title} />
          {err.title && <span className="field-error">⚠ {err.title}</span>}
        </div>

        <div className="field wide">
          <label htmlFor="altTitle">別タイトル（外国語表記など。任意）</label>
          <input id="altTitle" name="altTitle" type="text" defaultValue={v.altTitle ?? ""} />
        </div>

        <div className="field wide">
          <label htmlFor="authors">著者（複数のときはカンマ「,」または読点「、」で区切る）</label>
          <input id="authors" name="authors" type="text" defaultValue={v.authors ?? ""} />
        </div>

        {!lookup && isbnField}

        <div className="field">
          <label htmlFor="publisher">出版社</label>
          <input id="publisher" name="publisher" type="text" defaultValue={v.publisher ?? ""} />
        </div>

        <div className="field">
          <label htmlFor="publishedOn">出版日（例: 2024-05-17、2024-05、2024）</label>
          <input id="publishedOn" name="publishedOn" type="text" defaultValue={v.publishedOn ?? ""} aria-invalid={!!err.publishedOn} />
          {err.publishedOn && <span className="field-error">⚠ {err.publishedOn}</span>}
        </div>

        <div className="field">
          <label htmlFor="pages">ページ数</label>
          <input id="pages" name="pages" type="number" inputMode="numeric" min={1} step={1} defaultValue={v.pages ?? ""} aria-invalid={!!err.pages} />
          {err.pages && <span className="field-error">⚠ {err.pages}</span>}
        </div>

        <div className="field wide">
          <label htmlFor="coverUrl">表紙画像の URL</label>
          <input id="coverUrl" name="coverUrl" type="url" defaultValue={v.coverUrl ?? ""} aria-invalid={!!err.coverUrl} />
          {err.coverUrl && <span className="field-error">⚠ {err.coverUrl}</span>}
        </div>

        <div className="field wide">
          <label htmlFor="description">あらすじ</label>
          <textarea id="description" name="description" defaultValue={v.description ?? ""} />
        </div>

        <div className="field">
          <label htmlFor="status">読書ステータス</label>
          <select id="status" name="status" defaultValue={v.status ?? "want"}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="finishedOn">読了日（読了のときだけ保存。空欄なら当日）</label>
          <input id="finishedOn" name="finishedOn" type="date" defaultValue={v.finishedOn ?? ""} aria-invalid={!!err.finishedOn} />
          {err.finishedOn && <span className="field-error">⚠ {err.finishedOn}</span>}
        </div>

        <div className="field">
          <label htmlFor="rating">評価</label>
          <select id="rating" name="rating" defaultValue={v.rating ?? ""}>
            <option value="">未設定</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {"★".repeat(n)}（{n}）
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <span className="label">所有</span>
          <label className="check">
            <input type="checkbox" name="owned" defaultChecked={v.owned === "on"} />
            所有している
          </label>
        </div>

        <div className="field wide">
          <label htmlFor="review">レビュー</label>
          <textarea id="review" name="review" defaultValue={v.review ?? ""} />
        </div>
      </div>

      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "保存中…" : submitLabel}
        </button>
        <Link href={cancelHref} className="btn">
          キャンセル
        </Link>
      </div>
    </form>
  );
}

function LookupMessage({ ui }: { ui: LookupUi }) {
  if (!ui) return null;
  switch (ui.status) {
    case "loading":
      return <p className="muted">取得中…</p>;
    case "invalid":
      return <p className="notice">⚠ ISBN が正しくありません（10桁または13桁で、チェックディジットも確認してください）。取得はしていません。</p>;
    case "duplicate":
      return (
        <p className="notice">
          ⚠ この ISBN の本は登録済みです：<Link href={`/books/${ui.book.id}`}>{ui.book.title}</Link>
        </p>
      );
    case "found":
      return (
        <p className="notice">
          ✓ 書誌情報を取得しました（取得元: {ui.source}）。内容を確認・修正して「登録」を押してください。まだ登録はされていません。
        </p>
      );
    case "notfound":
      return <p className="notice">⚠ 見つかりませんでした。ISBN だけ入力済みなので、続けて手入力してください。</p>;
    case "error":
      return <p className="notice">⚠ 取得に失敗しました。時間をおいて再度試すか、手入力で登録してください。</p>;
  }
}
