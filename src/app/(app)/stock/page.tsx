"use client";

import { useEffect, useState } from "react";
import { useBiz } from "@/components/biz";
import { ConfirmButton, DateInput, Modal, Table, Tabs, Tile, useForm } from "@/components/ui";
import { kes, num, today } from "@/lib/format";
import type { Product } from "@/lib/types";

type Row = { product_id: string; opening: number; added: number; removed: number; sold: number; closing: number };

export default function StockPage() {
  const { supabase, business, products, moves, manager, reload } = useBiz();
  const [day, setDay] = useState(today());
  const [tab, setTab] = useState<"track" | "list">("track");
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [nowRows, setNowRows] = useState<Record<string, Row>>({});
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [moving, setMoving] = useState<{ p: Product; kind: "add" | "remove" } | null>(null);

  useEffect(() => {
    const byId = (data: Row[] | null) => Object.fromEntries((data ?? []).map((r) => [r.product_id, r]));
    supabase.rpc("stock_on_day", { p_business: business.id, p_day: day }).then(({ data }) => setRows(byId(data as Row[])));
    supabase.rpc("stock_on_day", { p_business: business.id, p_day: "9999-12-31" }).then(({ data }) => setNowRows(byId(data as Row[])));
  }, [supabase, business.id, day, moves, products]);

  const blank: Row = { product_id: "", opening: 0, added: 0, removed: 0, sold: 0, closing: 0 };
  const calc = { now: (pid: string) => (nowRows[pid] ?? blank).closing, onDay: (pid: string) => rows[pid] ?? blank };

  const low = products.filter((p) => calc.now(p.id) <= 5);
  const value = products.reduce((a, p) => a + Math.max(0, calc.now(p.id)) * p.buy_price, 0);
  const noBuy = products.filter((p) => !(p.buy_price > 0)).length;

  async function toggle(p: Product) {
    await supabase.from("products").update({ listed: !p.listed }).eq("id", p.id);
    reload(["products"]);
  }

  return (
    <>
      <div className="top"><h1>Stock</h1><div className="row">{tab === "track" && <DateInput value={day} onChange={setDay} />}{manager && <button className="btn primary" onClick={() => setEditing("new")}>Add product</button>}</div></div>
      <div className="tiles">
        <Tile k="Products" v={num(products.length)} />
        <Tile k="Stock value (cost)" v={kes(value)} />
        <Tile k="Low stock (5 or less)" v={num(low.length)} warn={low.length > 0} />
        <Tile k="Missing buying price" v={num(noBuy)} warn={noBuy > 0} />
      </div>
      <Tabs value={tab} onChange={setTab} items={[["track", "Daily stock"], ["list", "Products & prices"]]} />
      {tab === "track" && (
        <Table head={[["Item"], ["Opening", "n"], ["Added", "n"], ["Removed", "n"], ["Sold", "n"], ["Closing", "n"], [""]]} empty="No products yet. Add your first product to start tracking stock.">
          {products.map((p) => {
            const r = calc.onDay(p.id);
            return (
              <tr key={p.id}>
                <td>{p.name}</td><td className="n">{r.opening}</td><td className="n">{r.added || "–"}</td><td className="n">{r.removed || "–"}</td><td className="n">{r.sold || "–"}</td>
                <td className="n"><strong style={r.closing <= 5 ? { color: "var(--bad)" } : undefined}>{r.closing}</strong></td>
                <td>{manager && <div className="row" style={{ flexWrap: "nowrap" }}><button className="btn small" onClick={() => setMoving({ p, kind: "add" })}>Add</button><button className="btn small" onClick={() => setMoving({ p, kind: "remove" })}>Remove</button></div>}</td>
              </tr>
            );
          })}
        </Table>
      )}
      {tab === "list" && (
        <Table head={[["Name"], ["Category"], ["Buy", "n"], ["Sell", "n"], ["Margin", "n"], ["On menu"], [""]]} empty="No products yet.">
          {products.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td><td>{p.category}</td>
              <td className="n">{p.buy_price ? num(p.buy_price) : <span style={{ color: "var(--warn)" }}>Not set</span>}</td>
              <td className="n">{num(p.sell_price)}</td>
              <td className="n">{p.buy_price && p.sell_price ? <>{num(p.sell_price - p.buy_price)} <span className="muted">({Math.round(((p.sell_price - p.buy_price) / p.sell_price) * 100)}%)</span></> : "–"}</td>
              <td><label className="row"><input type="checkbox" checked={p.listed} disabled={!manager} onChange={() => toggle(p)} /> {p.listed ? "Shown" : "Hidden"}</label></td>
              <td>{manager && <button className="btn small" onClick={() => setEditing(p)}>Edit</button>}</td>
            </tr>
          ))}
        </Table>
      )}
      {editing && <ProductForm p={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {moving && <MoveForm p={moving.p} kind={moving.kind} day={day} onClose={() => setMoving(null)} />}
    </>
  );
}

function ProductForm({ p, onClose }: { p: Product | null; onClose: () => void }) {
  const { supabase, business, products, reload, toast } = useBiz();
  const { v, bind } = useForm({ name: p?.name ?? "", category: p?.category ?? "", sell: p ? String(p.sell_price) : "", buy: p?.buy_price ? String(p.buy_price) : "", qty: "0" });
  const [error, setError] = useState("");
  const cats = Array.from(new Set(products.map((x) => x.category)));

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    if (!v.name.trim() || !v.category.trim() || v.sell === "") return setError("Fill in the name, category and selling price.");
    const body = { name: v.name.trim(), category: v.category.trim(), sell_price: Number(v.sell), buy_price: Number(v.buy) || 0 };
    const res = p ? await supabase.from("products").update(body).eq("id", p.id).select().single() : await supabase.from("products").insert({ ...body, business_id: business.id }).select().single();
    if (res.error) return setError(res.error.message);
    const q = parseInt(v.qty) || 0;
    if (!p && q > 0) {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("stock_moves").insert({ business_id: business.id, product_id: res.data.id, kind: "add", qty: q, day: today(), note: "Opening stock", created_by: user!.id });
    }
    await reload(["products", "moves"]);
    toast("Saved");
    onClose();
  }
  async function remove() {
    const { error } = await supabase.from("products").delete().eq("id", p!.id);
    if (error) return setError(error.message);
    await reload(["products", "moves"]);
    toast("Deleted");
    onClose();
  }

  return (
    <Modal title={p ? "Edit product" : "Add product"} onClose={onClose} actions={<>
      {p && <><ConfirmButton onConfirm={remove}>Delete</ConfirmButton><span className="spacer" /></>}
      <button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => save()}>Save</button>
    </>}>
      <form className="form" onSubmit={save}>
        <label className="f full">Name<input id="p-name" {...bind("name")} required /></label>
        <label className="f">Category<input id="p-cat" list="catlist" {...bind("category")} required /><datalist id="catlist">{cats.map((c) => <option key={c} value={c} />)}</datalist></label>
        <label className="f">Selling price (KES)<input id="p-sell" type="number" min={0} step="any" {...bind("sell")} required /></label>
        <label className="f">Buying price (KES)<input id="p-buy" type="number" min={0} step="any" {...bind("buy")} /></label>
        {!p && <label className="f">Opening stock<input id="p-qty" type="number" min={0} step={1} {...bind("qty")} /></label>}
        <button hidden />
      </form>
      {error && <div className="err">{error}</div>}
    </Modal>
  );
}

function MoveForm({ p, kind, day, onClose }: { p: Product; kind: "add" | "remove"; day: string; onClose: () => void }) {
  const { supabase, business, reload, toast } = useBiz();
  const { v, bind, check } = useForm({ qty: "", day, note: "", expense: true as boolean });
  const [error, setError] = useState("");

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    const q = parseInt(v.qty);
    if (!(q > 0)) return setError("Enter how many.");
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("stock_moves").insert({ business_id: business.id, product_id: p.id, kind, qty: q, day: v.day, note: v.note, created_by: user!.id });
    if (error) return setError(error.message);
    if (kind === "add" && v.expense && p.buy_price > 0)
      await supabase.from("expenses").insert({ business_id: business.id, day: v.day, name: `${p.name} ×${q}`, category: "Inventory", amount: q * p.buy_price, method: "mpesa", status: "paid" });
    await reload(["moves"]);
    toast("Stock updated");
    onClose();
  }

  return (
    <Modal title={`${kind === "add" ? "Add stock" : "Remove stock"}: ${p.name}`} onClose={onClose} actions={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => save()}>Save</button></>}>
      <form className="form" onSubmit={save}>
        <label className="f">Quantity<input id="m-qty" type="number" min={1} step={1} {...bind("qty")} required /></label>
        <label className="f">Date<input id="m-day" type="date" {...bind("day")} required /></label>
        <label className="f full">Note<input id="m-note" {...bind("note")} placeholder={kind === "add" ? "Delivery from supplier" : "Spoilt, breakage, staff meal…"} /></label>
        {kind === "add" && p.buy_price > 0 && <label className="f full"><span><input type="checkbox" {...check("expense")} /> Also record {kes((parseInt(v.qty) || 0) * p.buy_price)} as an inventory expense</span></label>}
        <button hidden />
      </form>
      {error && <div className="err">{error}</div>}
    </Modal>
  );
}
