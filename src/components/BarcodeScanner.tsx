"use client";
// 仕様: docs/spec/isbn-lookup.md（バーコード読み取り）, docs/spec/design.md（カメラ映像は全画面・読み取り枠・閉じるボタン）
import { useEffect, useRef, useState, type ReactNode } from "react";
import { normalizeIsbn } from "@/lib/isbn";

type Props = {
  onDetect: (isbn: string) => void;
  onClose: () => void;
  // true の間は、読み取った後もカメラを止めず、次のバーコードを読み取り続ける（所有確認）
  continuous?: boolean;
  // 読み取り結果。指定すると、案内文の代わりに画面下部へ重ねて表示する
  children?: ReactNode;
};

// 仕様: docs/spec/isbn-lookup.md#実現内容（What）（同じバーコードは、カメラから外して2.5秒以上たった後で再び読み取る）
const SAME_BARCODE_MS = 2500;

const NO_CAMERA = "カメラを利用できません。閉じて、ISBN を手入力してください。";

export function BarcodeScanner({ onDetect, onClose, continuous = false, children }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  // コールバックは最新のものを使うが、カメラの起動し直しは起こさない
  const onDetectRef = useRef(onDetect);
  useEffect(() => {
    onDetectRef.current = onDetect;
  }, [onDetect]);

  useEffect(() => {
    let cancelled = false;
    let controls: { stop: () => void } | undefined;
    let detected = false;
    const last = { isbn: "", at: 0 };

    const start = async () => {
      // HTTPS ではない接続（localhost 以外）ではカメラ API が存在しない
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(NO_CAMERA);
        return;
      }
      try {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
          import("@zxing/browser"),
          import("@zxing/library"),
        ]);
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13]);
        hints.set(DecodeHintType.TRY_HARDER, true);
        const reader = new BrowserMultiFormatReader(hints);
        const c = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } },
          videoRef.current!,
          (result) => {
            if (!result || (!continuous && detected)) return;
            const text = result.getText();
            // 書籍の ISBN は 978/979 始まり。2段目の分類・価格バーコード（191/192 始まり）は無視する
            if (!/^97[89]\d{10}$/.test(text)) return;
            const isbn = normalizeIsbn(text);
            if (!isbn) return;
            detected = true;
            if (continuous) {
              // 同じバーコードが映り続けている間は、読み取りを繰り返さない
              const now = Date.now();
              const same = last.isbn === isbn && now - last.at < SAME_BARCODE_MS;
              last.isbn = isbn;
              last.at = now;
              if (same) return;
            }
            onDetectRef.current(isbn);
          },
        );
        if (cancelled) c.stop();
        else controls = c;
      } catch {
        // 許可の拒否・カメラ無し・使用中など
        if (!cancelled) setError(NO_CAMERA);
      }
    };
    // 開発時の React の Strict Mode は、この処理を「開始→後片付け→開始」と続けて実行する。
    // すぐには起動せず1フレーム待ち、1回目は後片付けで取り消すことで、同じ video へのカメラ起動の競合を避ける
    const timer = setTimeout(start, 0);

    return () => {
      clearTimeout(timer);
      cancelled = true;
      controls?.stop();
    };
    // continuous は開いている間は変わらない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="scanner" role="dialog" aria-modal="true" aria-label="バーコードの読み取り">
      <video ref={videoRef} className="scanner-video" playsInline muted />
      {!error && <div className="scanner-frame" aria-hidden="true" />}
      <button type="button" className="btn scanner-close" onClick={onClose} aria-label="閉じる">
        ✕
      </button>
      {children && !error ? (
        <div className="scan-result-wrap">{children}</div>
      ) : (
        <div className="scanner-hint" role="status">
          {error ?? "本の裏表紙のバーコード（978 または 979 で始まる段）を枠に合わせてください"}
          {error && (
            <div>
              <button type="button" className="btn btn-primary" onClick={onClose}>
                閉じる
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
