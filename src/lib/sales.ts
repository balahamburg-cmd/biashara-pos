import type { Sale } from "./types";

export const paidOf = (s: Sale) => s.payments.reduce((a, p) => a + Number(p.amount), 0);
export const balanceOf = (s: Sale) => Math.max(0, Number(s.total) - paidOf(s));
export type PayStatus = "paid" | "partial" | "pending";
export const statusOf = (s: Sale): PayStatus => {
  const p = paidOf(s);
  return p >= Number(s.total) - 0.001 ? "paid" : p > 0 ? "partial" : "pending";
};
export const statusText: Record<PayStatus, string> = { paid: "Paid", partial: "Partly paid", pending: "Pending" };
export const payLabel = (s: Sale) => {
  if (!s.payments.length) return "Pay later";
  const ms = new Set(s.payments.map((p) => p.method));
  return ms.size > 1 ? "Split" : ms.has("mpesa") ? "M-Pesa" : "Cash";
};

export type ItemRow = { key: string; name: string; qty: number; rev: number; cost: number; hasCost: boolean };
export function itemsAgg(sales: Sale[]): ItemRow[] {
  const m: Record<string, ItemRow> = {};
  for (const s of sales)
    for (const it of s.sale_items) {
      const k = it.product_id ?? it.name;
      const r = (m[k] ??= { key: k, name: it.name, qty: 0, rev: 0, cost: 0, hasCost: true });
      r.qty += it.qty;
      r.rev += it.qty * Number(it.price);
      if (Number(it.buy_price) > 0) r.cost += it.qty * Number(it.buy_price);
      else r.hasCost = false;
    }
  return Object.values(m).sort((a, b) => b.rev - a.rev);
}

export const SALE_SELECT = "*, sale_items(*), payments(*)";
