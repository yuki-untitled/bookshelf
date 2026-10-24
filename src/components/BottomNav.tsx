"use client";
// 仕様: docs/spec/design.md#実現内容（What）（主要操作は画面下部のナビゲーション）
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ScanCheck } from "./ScanCheck";

const LEFT = { href: "/", label: "本棚", icon: "▦" };
const RIGHT = { href: "/books/new", label: "登録", icon: "＋" };

export function BottomNav() {
  const pathname = usePathname();
  const item = (it: typeof LEFT) => (
    <Link href={it.href} aria-current={pathname === it.href ? "page" : undefined}>
      <span className="nav-icon" aria-hidden="true">
        {it.icon}
      </span>
      {it.label}
    </Link>
  );
  // 仕様: docs/spec/design.md#受入基準 11（所有確認ボタンは下部ナビゲーションの中央）
  return (
    <nav className="bottom-nav" aria-label="メイン">
      {item(LEFT)}
      <ScanCheck />
      {item(RIGHT)}
    </nav>
  );
}
