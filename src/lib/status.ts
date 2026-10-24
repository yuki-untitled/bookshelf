// 仕様: docs/spec/reading-record.md#実現内容（What）（ステータスは4種類）
// DB に依存しない定数だけを置く（クライアントコンポーネントからも読み込めるようにするため）。
export const STATUSES = ["want", "reading", "read", "tsundoku"] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<Status, string> = {
  want: "読みたい",
  reading: "読書中",
  read: "読了",
  tsundoku: "積読",
};

// 仕様: docs/spec/design.md#実現内容（What）（バッジは文字またはアイコンで区別する）
export const STATUS_ICON: Record<Status, string> = {
  want: "☆",
  reading: "▶",
  read: "✓",
  tsundoku: "▤",
};
