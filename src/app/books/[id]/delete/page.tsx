// 仕様: docs/spec/book-management.md#受入基準 4（削除は確認画面を経て実行し、復元できない）
import Link from "next/link";
import { notFound } from "next/navigation";
import { Cover } from "@/components/Cover";
import { deleteBookAction } from "@/lib/actions";
import { getBook } from "@/lib/books";

export const metadata = { title: "本を削除 | Bookshelf" };

export default async function DeleteBookPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const book = Number.isInteger(id) ? getBook(id) : null;
  if (!book) notFound();
  return (
    <div className="stack">
      <h1>本を削除</h1>
      <div className="detail">
        <Cover book={book} />
        <div className="stack">
          <p>
            「{book.title}」を削除します。削除した本は復元できません。
          </p>
          <form action={deleteBookAction.bind(null, id)} className="row">
            <button type="submit" className="btn btn-primary">
              削除する
            </button>
            <Link href={`/books/${id}`} className="btn">
              キャンセル
            </Link>
          </form>
        </div>
      </div>
    </div>
  );
}
