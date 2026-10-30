"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useBiz } from "@/components/biz";
import { DateInput, Table, Tabs, Tile } from "@/components/ui";
import { fetchSale, usePending, useSales } from "@/components/useSales";
import { ReceiptModal } from "@/components/receipt";
import { PayModal } from "@/components/pay";
import { useScanner } from "@/components/useScanner";
import { kes, niceDate, num, time, today } from "@/lib/format";
import { balanceOf, itemsAgg, paidOf, payLabel, statusOf, statusText } from "@/lib/sales";
import type { Sale } from "@/lib/types";

type Tab = "record" | "list" | "pending" | "items";
type PayKind = "prompt" | "mpesa" | "cash" | "split" | "later";
type Line = { pid: string; name: string; price: number; qty: number };

export default function SalesPage() {
  const { manager, supabase } = useBiz();
  const [day, setDay] = useState(today());
  const [tab, setTab] = useState<Tab>("record");
  const { sales, reload } = useSales(day, day);
  const pending = usePending();
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const [paying, setPaying] = useState<{ sale: Sale; phone?: string } | null>(null);

  const total = sales.reduce((a, s) => a + s.total, 0);
  const top = itemsAgg(sales)[0];
  const refresh = () => { reload(); pending.reload(); };

  return (
    <>
      <div className="top"><h1>Sales</h1><div className="row">{manager && <DateInput value={day} onChange={setDay} />}</div></div>
      <div className="tiles">
        <Tile k="Total sales" v={kes(total)} />
        <Tile k="Number of sales" v={num(sales.length)} />
        <Tile k="Top product" v={top ? <>{top.name} <span className="muted">({top.qty})</span></> : "–"} />
        <Tile k="Average sale" v={kes(sales.length ? total / sales.length : 0)} />
      </div>
      <Tabs value={tab} onChange={setTab} items={[["record", "Record sale"], ["list", "Sales list"], ["pending", "Pending pay"], ["items", "Items sold"]]} />

      {tab === "record" && <Pos day={day} onSold={async (id, prompt) => {
        refresh();
        const s = await fetchSale(supabase, id);
        if (prompt) setPaying({ sale: s, phone: prompt });
        else setReceipt(s);
      }} />}

      {tab === "list" && (
        <Table head={[["#"], ["Time"], ["Items"], ["Total", "n"], ["Payment"], ["Status"], ["Customer"], ["Served by"], [""]]}>
          {sales.map((s) => (
            <tr key={s.id}>
              <td className="num">{s.receipt_no}</td><td className="num">{time(s.created_at)}</td>
              <td>{s.sale_items.map((i) => `${i.qty}× ${i.name}`).join(", ")}</td>
              <td className="n">{kes(s.total)}</td><td>{payLabel(s)}</td>
              <td><span className={"pill " + statusOf(s)}>{statusText[statusOf(s)]}</span></td>
              <td>{s.customer_name || "Walk-in"}</td><td>{s.staff_name || "–"}</td>
              <td><button className="btn small" onClick={() => setReceipt(s)}>Receipt</button></td>
            </tr>
          ))}
        </Table>
      )}

      {tab === "pending" && (
        <>
          <p className="muted">All unpaid bills, any day. Total owed: <strong className="num" style={{ color: "var(--warn)" }}>{kes(pending.sales.reduce((a, s) => a + balanceOf(s), 0))}</strong></p>
          <Table head={[["Date"], ["Customer"], ["Items"], ["Total", "n"], ["Paid", "n"], ["Balance", "n"], ["Status"], [""]]} empty="Nobody owes you anything.">
            {pending.sales.map((s) => (
              <tr key={s.id}>
                <td className="num">{s.day} {time(s.created_at)}</td><td>{s.customer_name || "Walk-in"}</td>
                <td>{s.sale_items.reduce((a, i) => a + i.qty, 0)} items</td>
                <td className="n">{kes(s.total)}</td><td className="n">{kes(paidOf(s))}</td><td className="n"><strong>{kes(balanceOf(s))}</strong></td>
                <td><span className={"pill " + statusOf(s)}>{statusText[statusOf(s)]}</span></td>
                <td><button className="btn small primary" onClick={() => setPaying({ sale: s })}>Record payment</button></td>
              </tr>
            ))}
          </Table>
        </>
      )}

      {tab === "items" && <ItemsSold sales={sales} />}

      {receipt && <ReceiptModal sale={receipt} onClose={() => setReceipt(null)} />}
      {paying && <PayModal saleId={paying.sale.id} balance={balanceOf(paying.sale)} who={paying.sale.customer_name || "This customer"} defaultPhone={paying.phone}
        onClose={() => { setPaying(null); refresh(); }}
        onDone={async () => { const s = await fetchSale(supabase, paying.sale.id); setPaying(null); refresh(); setReceipt(s); }} />}
    </>
  );
}

function ItemsSold({ sales }: { sales: Sale[] }) {
  const agg = itemsAgg(sales);
  return (
    <Table head={[["#"], ["Item"], ["Qty", "n"], ["Total", "n"]]}
      foot={agg.length ? <tfoot><tr><td></td><td>Total</td><td className="n">{agg.reduce((a, r) => a + r.qty, 0)}</td><td className="n">{kes(agg.reduce((a, r) => a + r.rev, 0))}</td></tr></tfoot> : null}>
      {agg.map((r, i) => <tr key={r.key}><td>{i + 1}</td><td>{r.name}</td><td className="n">{r.qty}</td><td className="n">{kes(r.rev)}</td></tr>)}
    </Table>
  );
}

function Pos({ day, onSold }: { day: string; onSold: (saleId: string, promptPhone?: string) => void }) {
  const { supabase, business, products, customers, moves, mpesa, toast } = useBiz();
  const [cart, setCart] = useState<Line[]>([]);
  const [cat, setCat] = useState("All");
  const [q, setQ] = useState("");
  const [pay, setPay] = useState<PayKind>(mpesa ? "prompt" : "mpesa");
  const [cust, setCust] = useState("");
  const [phone, setPhone] = useState("");
  const [ref, setRef] = useState("");
  const [split, setSplit] = useState({ mpesa: "", cash: "" });
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  // Stock on hand right now, refreshed after every sale.
  const [onHandMap, setOnHandMap] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    supabase.rpc("stock_on_day", { p_business: business.id, p_day: "9999-12-31" }).then(({ data }) =>
      setOnHandMap(Object.fromEntries(((data ?? []) as { product_id: string; closing: number }[]).map((r) => [r.product_id, r.closing]))));
  }, [supabase, business.id, moves, tick]);
  const onHand = (pid: string) => onHandMap?.[pid] ?? 0;

  const cats = ["All", ...Array.from(new Set(products.map((p) => p.category))).sort()];
  const list = products.filter((p) => p.listed && (cat === "All" || p.category === cat) && (!q || p.name.toLowerCase().includes(q.toLowerCase())));
  const total = cart.reduce((a, l) => a + l.qty * l.price, 0);
  const count = cart.reduce((a, l) => a + l.qty, 0);

  const add = (pid: string) => {
    const p = products.find((x) => x.id === pid)!;
    setCart((c) => c.some((l) => l.pid === pid) ? c.map((l) => l.pid === pid ? { ...l, qty: l.qty + 1 } : l) : [...c, { pid, name: p.name, price: p.sell_price, qty: 1 }]);
  };
  const byBarcode = (code: string) => products.find((p) => p.barcode && p.barcode === code.trim());
  useScanner((code) => {
    const p = byBarcode(code);
    if (!p) return toast(`No product has barcode ${code}. Add it to a product under Stock.`);
    if (!p.listed) return toast(`${p.name} is hidden from the menu. Show it under Stock first.`);
    add(p.id);
    setQ("");
  });
  const bump = (i: number, d: number) => setCart((c) => c.map((l, j) => j === i ? { ...l, qty: l.qty + d } : l).filter((l) => l.qty > 0));

  const blocked = !cart.length || busy || (pay === "later" && !cust) || (pay === "prompt" && !phone.trim());

  async function checkout() {
    let payments: { method: string; amount: number; ref?: string }[] = [];
    if (pay === "mpesa") payments = [{ method: "mpesa", amount: total, ref }];
    if (pay === "cash") payments = [{ method: "cash", amount: total }];
    if (pay === "split") {
      const m = Number(split.mpesa) || 0, c = Number(split.cash) || 0;
      if (m + c > total) return toast("Split amounts add up to more than the total.");
      if (m + c < total && !cust) return toast("Choose a customer for the unpaid balance.");
      payments = [{ method: "mpesa", amount: m, ref }, { method: "cash", amount: c }].filter((p) => p.amount > 0);
    }
    setBusy(true);
    const { data, error } = await supabase.rpc("record_sale", {
      p_business: business.id,
      p_items: cart.map((l) => ({ product_id: l.pid, qty: l.qty })),
      p_payments: payments,
      p_customer: cust || null,
      p_day: day,
      p_await_mpesa: pay === "prompt",
    });
    setBusy(false);
    if (error) return toast(error.message);
    setTick((t) => t + 1);
    const promptPhone = pay === "prompt" ? phone : undefined;
    setCart([]); setRef(""); setSplit({ mpesa: "", cash: "" }); setCust(""); setPhone("");
    onSold((data as { id: string }).id, promptPhone);
  }

  const payOptions: [PayKind, string][] = [...(mpesa ? [["prompt", "M-Pesa prompt"] as [PayKind, string]] : []), ["mpesa", mpesa ? "M-Pesa paid" : "M-Pesa"], ["cash", "Cash"], ["split", "Split"], ["later", "Pay later"]];

  return (
    <div className="pos">
      <div className="panel">
        <div className="row"><input type="search" id="f-q" placeholder="Search or scan a barcode…" value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            const p = byBarcode(q) ?? (list.length === 1 ? list[0] : undefined);
            if (p) { add(p.id); setQ(""); }
          }} style={{ flex: "1 1 200px" }} aria-label="Search items" /></div>
        <div className="row" style={{ marginTop: 10 }}>
          {cats.map((c) => <button key={c} className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>)}
        </div>
        {day !== today() && <div className="banner" style={{ marginTop: 12 }}>You are recording sales for {niceDate(day)}, not today.</div>}
        {list.length ? (
          <div className="grid">
            {list.map((p) => {
              const st = onHand(p.id);
              return (
                <button key={p.id} className="item" onClick={() => add(p.id)}>
                  <span className="cat">{p.category}</span><span className="nm">{p.name}</span>
                  {onHandMap && <span className={"st" + (st <= 5 ? " low" : "")}>{st} in stock</span>}
                  <span className="pr">{num(p.sell_price)}</span>
                </button>
              );
            })}
          </div>
        ) : <div className="empty">No items to sell yet. Add products under <Link href="/stock">Stock</Link>.</div>}
      </div>

      <div className="panel cart">
        <h2>Order <span className="muted num" style={{ fontSize: 14, fontFamily: "var(--body)" }}>{count} items</span></h2>
        <div>
          {cart.length ? cart.map((l, i) => (
            <div className="line" key={l.pid}>
              <div><div style={{ fontWeight: 600 }}>{l.name}</div><div className="muted num" style={{ fontSize: 13 }}>{num(l.price)} each</div></div>
              <div className="qty"><button onClick={() => bump(i, -1)} aria-label="One less">−</button><span className="num" style={{ minWidth: 20, textAlign: "center" }}>{l.qty}</span><button onClick={() => bump(i, 1)} aria-label="One more">+</button></div>
              <div className="num" style={{ minWidth: 64, textAlign: "right" }}>{num(l.qty * l.price)}</div>
            </div>
          )) : <div className="muted" style={{ padding: "8px 0" }}>Tap items to add them to this order.</div>}
        </div>
        <div className="total"><span>Total</span><span className="num">{kes(total)}</span></div>
        <label className="f">Customer
          <select id="f-cust" value={cust} onChange={(e) => { setCust(e.target.value); const c = customers.find((x) => x.id === e.target.value); if (c?.phone && !phone) setPhone(c.phone); }}>
            <option value="">Walk-in customer</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <div className="pay" role="group" aria-label="Payment" style={{ gridTemplateColumns: `repeat(${payOptions.length > 4 ? 3 : 4},1fr)` }}>
          {payOptions.map(([k, l]) => <button key={k} aria-pressed={pay === k} onClick={() => { setPay(k); if (k === "split") setSplit({ mpesa: String(total), cash: "" }); }}>{l}</button>)}
        </div>
        {pay === "prompt" && <label className="f">Customer&apos;s M-Pesa number<input id="f-phone" type="tel" placeholder="0712 345 678" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>}
        {(pay === "mpesa" || pay === "split") && <label className="f">M-Pesa code (optional)<input id="f-ref" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="SJK2X4Y7AB" /></label>}
        {pay === "split" && <>
          <div className="form">
            <label className="f">M-Pesa amount<input id="f-sm" type="number" min={0} value={split.mpesa} onChange={(e) => setSplit({ ...split, mpesa: e.target.value })} /></label>
            <label className="f">Cash amount<input id="f-sc" type="number" min={0} value={split.cash} onChange={(e) => setSplit({ ...split, cash: e.target.value })} /></label>
          </div>
          <div className="muted" style={{ fontSize: 13 }}>Anything not covered stays on the customer&apos;s bill.</div>
        </>}
        {pay === "later" && !cust && <div style={{ fontSize: 13, color: "var(--warn)" }}>Choose a customer so you know who owes this.</div>}
        <button className="btn primary" disabled={blocked} onClick={checkout} style={{ padding: 12 }}>
          {busy ? "Saving…" : pay === "prompt" ? `Send M-Pesa prompt · ${kes(total)}` : `Complete sale · ${kes(total)}`}
        </button>
        {cart.length > 0 && <button className="btn small" onClick={() => setCart([])}>Clear order</button>}
      </div>
    </div>
  );
}
