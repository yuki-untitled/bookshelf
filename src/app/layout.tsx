// 仕様: docs/spec/design.md（ダークテーマのみ・Noto Sans JP・下部ナビゲーション）
import type { Metadata, Viewport } from "next";
import { Noto_Sans_JP } from "next/font/google";
import "./globals.css";
import { BottomNav } from "@/components/BottomNav";

const notoSansJp = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Bookshelf",
  description: "自分専用の本棚",
};

export const viewport: Viewport = {
  themeColor: "#0e0e10",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={notoSansJp.variable}>
      <body>
        <main className="container">{children}</main>
        <BottomNav />
      </body>
    </html>
  );
}
