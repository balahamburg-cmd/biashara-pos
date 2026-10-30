import type { Business, Sale } from "./types";
import { num } from "./format";
import { paidOf } from "./sales";

export const RECEIPT_WIDTH = 32; // characters per line on 58 mm paper

export function receiptLines(s: Sale, biz: Business, width = RECEIPT_WIDTH): string[] {
  const center = (t: string) => " ".repeat(Math.max(0, Math.floor((width - t.length) / 2))) + t;
  const lr = (l: string, r: string) => {
    const room = width - r.length;
    return (l.length > room - 1 ? l.slice(0, room - 2) + "~" : l).padEnd(room) + r;
  };
  const dash = "-".repeat(width);
  const d = new Date(s.created_at);
  const two = (n: number) => String(n).padStart(2, "0");
  const out = [center(biz.name)];
  if (biz.location) out.push(center(biz.location));
  if (biz.phone) out.push(center("Tel: " + biz.phone));
  if (biz.till) out.push(center("M-Pesa Till: " + biz.till));
  out.push(dash, lr(s.day.split("-").reverse().join("/"), `${two(d.getHours())}:${two(d.getMinutes())}`), lr("Receipt #" + s.receipt_no, ""), dash, lr("Item x Qty", "Amount"));
  for (const it of s.sale_items) out.push(lr(`${it.name} x${it.qty}`, num(it.qty * Number(it.price))));
  out.push(dash, lr("TOTAL", "KES " + num(Number(s.total))));
  for (const p of s.payments) out.push(lr(p.method === "mpesa" ? "M-Pesa " + (p.mpesa_receipt || "") : "Cash", num(Number(p.amount))));
  const bal = Number(s.total) - paidOf(s);
  if (bal > 0) out.push(lr("BALANCE DUE", num(bal)));
  out.push(dash);
  if (s.customer_name) out.push("Customer: " + s.customer_name);
  out.push("Served by: " + (s.staff_name || "-"), "", center(biz.footer));
  return out;
}
