// 仕様: docs/spec/book-management.md#受入基準 1,2（手入力での登録）, docs/spec/isbn-lookup.md（ISBN 取得・バーコード読み取り）
import { BookForm } from "@/components/BookForm";
import { createBook } from "@/lib/actions";

export const metadata = { title: "本を登録 | Bookshelf" };

export default function NewBookPage() {
  return (
    <div className="stack">
      <h1>本を登録</h1>
      <BookForm action={createBook} submitLabel="登録" cancelHref="/" lookup />
    </div>
  );
}
