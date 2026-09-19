const formatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(amount: string | number, currency = "NPR"): string {
  let fmt = formatters.get(currency);
  if (!fmt) {
    fmt = new Intl.NumberFormat("en-NP", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    });
    formatters.set(currency, fmt);
  }
  return fmt.format(Number(amount));
}

export function discountPercent(
  price: string | number,
  compareAt: string | number | null | undefined,
): number | null {
  if (!compareAt) return null;
  const p = Number(price);
  const c = Number(compareAt);
  if (!(c > p)) return null;
  return Math.round(((c - p) / c) * 100);
}

export function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
