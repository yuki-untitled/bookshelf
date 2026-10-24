// 仕様: docs/spec/book-management.md#受入基準 3（編集）
import { notFound } from "next/navigation";
import { BookForm } from "@/components/BookForm";
import { updateBookAction } from "@/lib/actions";
import { getBook } from "@/lib/books";

export const metadata = { title: "本を編集 | Bookshelf" };

export default async function EditBookPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const book = Number.isInteger(id) ? getBook(id) : null;
  if (!book) notFound();
  return (
    <div className="stack">
      <h1>本を編集</h1>
      <BookForm action={updateBookAction.bind(null, id)} book={book} submitLabel="保存" cancelHref={`/books/${id}`} />
    </div>
  );
}
