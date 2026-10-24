"use client";
// 仕様: docs/spec/isbn-lookup.md#実現内容（What）（所有確認）, docs/spec/design.md（所有確認の結果表示・下部ナビゲーション中央のボタン）
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  checkIsbnAction,
  registerScannedAction,
  type CheckState,
} from "@/lib/actions";
import type { BookInfo } from "@/lib/lookup";
import { STATUS_ICON, STATUS_LABEL, type Status } from "@/lib/status";
import { BarcodeScanner } from "./BarcodeScanner";
import { Cover } from "./Cover";

type Ui =
  | null
  | { kind: "loading"; isbn: string }
  | { kind: "check"; state: Exclude<CheckState, { status: "invalid" }> }
  | { kind: "busy" }
  | { kind: "done"; id: number; title: string; owned: boolean; already: boolean };

export function ScanCheck() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="nav-scan" onClick={() => setOpen(true)} aria-label="所有確認（バーコードを読み取る）">
        <span className="nav-scan-icon" aria-hidden="true">
          ▥
        </span>
        所有確認
      </button>
      {/* ナビゲーションの外（body 直下）に描き、ナビ用の CSS や重なり順の影響を受けないようにする */}
      {open && createPortal(<ScanOverlay onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function ScanOverlay({ onClose }: { onClose: () => void }) {
  const [ui, setUi] = useState<Ui>(null);
  // 新しい読み取りが始まったら、前の結果の応答は捨てる
  const seq = useRef(0);

  async function onDetect(isbn: string) {
    const mine = ++seq.current;
    setUi({ kind: "loading", isbn });
    const state = await checkIsbnAction(isbn);
    if (mine !== seq.current || state.status === "invalid") return;
    setUi({ kind: "check", state });
  }

  async function register(isbn: string, owned: boolean, info: BookInfo | null) {
    const mine = ++seq.current;
    setUi({ kind: "busy" });
    const r = await registerScannedAction(isbn, owned, info);
    if (mine !== seq.current || r.status === "invalid") return;
    setUi({ kind: "done", id: r.id, title: r.title, owned, already: r.status === "duplicate" });
  }

  return (
    <BarcodeScanner continuous onDetect={onDetect} onClose={onClose}>
      <div role="status" aria-live="polite">
        <ResultPanel ui={ui} register={register} onNavigate={onClose} />
      </div>
    </BarcodeScanner>
  );
}

type PanelProps = {
  ui: Ui;
  register: (isbn: string, owned: boolean, info: BookInfo | null) => void;
  onNavigate: () => void;
};

function ResultPanel({ ui, register, onNavigate }: PanelProps) {
  if (!ui) return <div className="scan-result result-wait">本の裏表紙のバーコード（978 または 979 で始まる段）を枠に合わせてください</div>;
  if (ui.kind === "loading") return <div className="scan-result result-wait">確認中…（{ui.isbn}）</div>;
  if (ui.kind === "busy") return <div className="scan-result result-wait">登録中…</div>;

  if (ui.kind === "done") {
    return (
      <div className="scan-result result-registered">
        <p className="result-head">
          <span aria-hidden="true">✓ </span>
          {ui.already ? "すでに登録されています" : "登録しました"}
        </p>
        <p>
          <Link href={`/books/${ui.id}`} onClick={onNavigate}>
            {ui.title}
          </Link>
        </p>
        {!ui.already && <p className="small">{ui.owned ? "読みたい・所有あり" : "読みたい・未所有"}</p>}
      </div>
    );
  }

  const s = ui.state;
  if (s.status === "registered") {
    const b = s.book;
    return (
      <div className={`scan-result ${b.owned ? "result-owned" : "result-registered"}`}>
        <p className="result-head">
          <span aria-hidden="true">{b.owned ? "✓ " : "◐ "}</span>
          {b.owned ? "所有しています" : "登録済み・未所有"}
        </p>
        <div className="result-body">
          <div className="result-cover">
            <Cover book={{ title: b.title, coverUrl: b.coverUrl, status: b.readingStatus }} />
          </div>
          <div>
            <p className="result-title">
              <Link href={`/books/${b.id}`} onClick={onNavigate}>
                {b.title}
              </Link>
            </p>
            <p className="small">
              読書ステータス: <StatusText status={b.readingStatus} />
            </p>
          </div>
        </div>
      </div>
    );
  }

  const isbn = s.isbn;
  const info = s.status === "unregistered" ? s.info : null;
  const head = s.status === "unregistered" ? "未登録" : s.status === "no-info" ? "未登録（書誌情報なし）" : "書誌情報を取得できませんでした";
  return (
    <div className="scan-result result-new">
      <p className="result-head">
        <span aria-hidden="true">＋ </span>
        {head}
      </p>
      <div className="result-body">
        {info && (
          <div className="result-cover">
            <Cover book={{ title: info.title, coverUrl: info.coverUrl, status: "want" }} />
          </div>
        )}
        <div>
          {info ? (
            <>
              <p className="result-title">{info.title}</p>
              {info.authors.length > 0 && <p className="small">{info.authors.join("、")}</p>}
              <p className="small">取得元: {s.status === "unregistered" ? s.source : ""}</p>
            </>
          ) : (
            <p className="small">ISBN: {isbn}</p>
          )}
        </div>
      </div>
      <div className="row result-actions">
        <button type="button" className="btn btn-primary" onClick={() => register(isbn, false, info)}>
          読みたい・未所有で登録
        </button>
        <button type="button" className="btn" onClick={() => register(isbn, true, info)}>
          所有ありで登録
        </button>
      </div>
    </div>
  );
}

function StatusText({ status }: { status: Status }) {
  return (
    <>
      <span aria-hidden="true">{STATUS_ICON[status]} </span>
      {STATUS_LABEL[status]}
    </>
  );
}
