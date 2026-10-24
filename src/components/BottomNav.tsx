"use client";
// 仕様: docs/spec/design.md#実現内容（What）（主要操作は画面下部のナビゲーション）
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "本棚", icon: "▦" },
  { href: "/books/new", label: "登録", icon: "＋" },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="bottom-nav" aria-label="メイン">
      {ITEMS.map((it) => (
        <Link key={it.href} href={it.href} aria-current={pathname === it.href ? "page" : undefined}>
          <span className="nav-icon" aria-hidden="true">
            {it.icon}
          </span>
          {it.label}
        </Link>
      ))}
    </nav>
  );
}
