"use client";
// 仕様: docs/spec/isbn-lookup.md（バーコード読み取り）, docs/spec/design.md（カメラ映像は全画面・読み取り枠・閉じるボタン）
import { useEffect, useRef, useState } from "react";
import { normalizeIsbn } from "@/lib/isbn";

type Props = {
  onDetect: (isbn: string) => void;
  onClose: () => void;
};

const NO_CAMERA = "カメラを利用できません。閉じて、ISBN を手入力してください。";

export function BarcodeScanner({ onDetect, onClose }: Props) {
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

    (async () => {
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
            if (!result || detected) return;
            const text = result.getText();
            // 書籍の ISBN は 978/979 始まり。2段目の分類・価格バーコード（191/192 始まり）は無視する
            if (!/^97[89]\d{10}$/.test(text)) return;
            const isbn = normalizeIsbn(text);
            if (!isbn) return;
            detected = true;
            onDetectRef.current(isbn);
          },
        );
        if (cancelled) c.stop();
        else controls = c;
      } catch {
        // 許可の拒否・カメラ無し・使用中など
        if (!cancelled) setError(NO_CAMERA);
      }
    })();

    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, []);

  return (
    <div className="scanner" role="dialog" aria-modal="true" aria-label="バーコードの読み取り">
      <video ref={videoRef} className="scanner-video" playsInline muted />
      {!error && <div className="scanner-frame" aria-hidden="true" />}
      <button type="button" className="btn scanner-close" onClick={onClose} aria-label="閉じる">
        ✕
      </button>
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
    </div>
  );
}
