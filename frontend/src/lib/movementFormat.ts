// Shared, pure formatting helpers for stock movements. Kept in one place so
// ProductDetails and StockHistoryModal render movement type/quantity/date
// consistently (semantic status tokens, not raw Tailwind palette colors).

export type MovementType = "entry" | "exit" | "adjustment" | "transfer";

export type MovementBadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "success"
  | "warning"
  | "danger";

/** Map a stock movement type to a semantic Badge variant. */
export function getMovementBadgeVariant(type: string): MovementBadgeVariant {
  switch (type) {
    case "exit":
      return "destructive";
    case "adjustment":
      return "warning";
    case "transfer":
      return "secondary";
    case "entry":
    default:
      return "success";
  }
}

/** Format a movement timestamp using the visitor's locale. */
export function formatMovementDate(date: string | Date): string {
  return new Date(date).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Signed quantity display: entry is positive, everything else is negative. */
export function getQuantityChange(type: string): {
  prefix: string;
  colorClass: string;
} {
  return type === "entry"
    ? { prefix: "+", colorClass: "text-chart-positive" }
    : { prefix: "-", colorClass: "text-chart-negative" };
}
