"use client";

import { useCallback, useEffect, useState } from "react";
import { useBiz } from "@/components/biz";
import { ConfirmButton, Modal, MonthInput, Table, Tabs, Tile, useForm } from "@/components/ui";
import { kes, monthEnd, monthName, num, today } from "@/lib/format";
import type { Expense } from "@/lib/types";

const CATS = ["Inventory", "Rent", "Salaries", "Transport", "Utilities", "Repairs", "Licences", "Other"];
const METHOD = { mpesa: "M-Pesa", cash: "Cash", bank: "Bank" };

export default function ExpensesPage() {
  const { supabase, business } = useBiz();
  const [month, setMonth] = useState(today().slice(0, 7));
  const [tab, setTab] = useState<"list" | "cats" | "recurring">("list");
  const [list, setList] = useState<Expense[]>([]);
  const [recurring, setRecurring] = useState<Expense[]>([]);
  const [editing, setEditing] = useState<{ e: Expense | null; copy?: Expense } | null>(null);

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      supabase.from("expenses").select("*").eq("business_id", business.id).gte("day", month + "-01").lte("day", monthEnd(month)).order("day", { ascending: false }),
      supabase.from("expenses").select("*").eq("business_id", business.id).eq("recurring", true).order("day", { ascending: false }),
    ]);
    const n = (r: Expense[] | null) => (r ?? []).map((e) => ({ ...e, amount: Number(e.amount) }));
    setList(n(a.data as Expense[]));
    setRecurring(n(b.data as Expense[]));
  }, [supabase, business.id, month]);
  useEffect(() => { load(); }, [load]);

  const total = list.reduce((a, e) => a + e.amount, 0);
  const pending = list.filter((e) => e.status !== "paid").reduce((a, e) => a + e.amount, 0);

  async function markPaid(id: string) {
    await supabase.from("expenses").update({ status: "paid" }).eq("id", id);
    load();
  }

  const latest = Object.values(recurring.reduce<Record<string, Expense>>((m, e) => { if (!m[e.name]) m[e.name] = e; return m; }, {}));
  const cats = Object.entries(list.reduce<Record<string, number>>((m, e) => { m[e.category] = (m[e.category] ?? 0) + e.amount; return m; }, {})).sort((a, b) => b[1] - a[1]);
  const max = cats[0]?.[1] || 1;

  return (
    <>
      <div className="top"><h1>Expenses</h1><div className="row"><MonthInput value={month} onChange={setMonth} /><button className="btn primary" onClick={() => setEditing({ e: null })}>Add expense</button></div></div>
      <div className="tiles">
        <Tile k="Expenses" v={num(list.length)} /><Tile k="Total amount" v={kes(total)} />
        <Tile k="Pending" v={kes(pending)} warn={pending > 0} /><Tile k="Paid" v={kes(total - pending)} />
      </div>
      <Tabs value={tab} onChange={setTab} items={[["list", "All expenses"], ["cats", "By category"], ["recurring", "Recurring"]]} />
      {tab === "list" && (
        <Table head={[["Date"], ["Name"], ["Category"], ["Amount", "n"], ["Status"], ["Method"], [""]]} empty={`No expenses in ${monthName(month)} yet.`}>
          {list.map((e) => (
            <tr key={e.id}>
              <td className="num">{e.day}</td><td>{e.name}{e.recurring && <> <span className="pill role">Monthly</span></>}</td><td>{e.category}</td>
              <td className="n">{kes(e.amount)}</td>
              <td><span className={"pill " + (e.status === "paid" ? "paid" : "pending")}>{e.status === "paid" ? "Paid" : "Pending"}</span></td>
              <td>{METHOD[e.method]}</td>
              <td><div className="row" style={{ flexWrap: "nowrap" }}>{e.status !== "paid" && <button className="btn small primary" onClick={() => markPaid(e.id)}>Mark paid</button>}<button className="btn small" onClick={() => setEditing({ e })}>Edit</button></div></td>
            </tr>
          ))}
        </Table>
      )}
      {tab === "cats" && (
        <Table head={[["Category"], ["Share"], ["Amount", "n"]]}>
          {cats.map(([k, v]) => <tr key={k}><td>{k}</td><td style={{ width: "45%" }}><div className="bar"><i style={{ width: (v / max) * 100 + "%" }} /></div></td><td className="n">{kes(v)}</td></tr>)}
        </Table>
      )}
      {tab === "recurring" && (
        <>
          <p className="muted">Monthly costs like rent and salaries. Add any that are missing for {monthName(month)}.</p>
          <Table head={[["Name"], ["Category"], ["Amount", "n"], ["Last added"], [""]]} empty="Tick “Repeats every month” on an expense to list it here.">
            {latest.map((e) => {
              const has = list.some((x) => x.name === e.name && x.recurring);
              return (
                <tr key={e.id}>
                  <td>{e.name}</td><td>{e.category}</td><td className="n">{kes(e.amount)}</td><td className="num">{e.day}</td>
                  <td>{has ? <span className="pill paid">Added this month</span> : <button className="btn small primary" onClick={() => setEditing({ e: null, copy: e })}>Add for {monthName(month)}</button>}</td>
                </tr>
              );
            })}
          </Table>
        </>
      )}
      {editing && <ExpenseForm e={editing.e} copy={editing.copy} month={month} onClose={() => setEditing(null)} onSaved={load} />}
    </>
  );
}

function ExpenseForm({ e, copy, month, onClose, onSaved }: { e: Expense | null; copy?: Expense; month: string; onClose: () => void; onSaved: () => void }) {
  const { supabase, business, toast } = useBiz();
  const src = e ?? copy;
  const day = e?.day ?? (copy ? month + "-" + copy.day.slice(8) : month === today().slice(0, 7) ? today() : month + "-01");
  const { v, bind, check } = useForm({ name: src?.name ?? "", category: src?.category ?? "", amount: src ? String(src.amount) : "", day, method: src?.method ?? "mpesa", status: src?.status ?? "paid", recurring: !!src?.recurring as boolean });
  const [error, setError] = useState("");

  async function save(ev?: React.FormEvent) {
    ev?.preventDefault();
    if (!v.name.trim() || !v.category.trim() || v.amount === "") return setError("Fill in what it was for, the category and the amount.");
    const body = { name: v.name.trim(), category: v.category.trim(), amount: Number(v.amount), day: v.day, method: v.method, status: v.status, recurring: v.recurring };
    const { error } = e ? await supabase.from("expenses").update(body).eq("id", e.id) : await supabase.from("expenses").insert({ ...body, business_id: business.id });
    if (error) return setError(error.message);
    toast("Saved"); onSaved(); onClose();
  }
  async function remove() {
    await supabase.from("expenses").delete().eq("id", e!.id);
    toast("Deleted"); onSaved(); onClose();
  }

  return (
    <Modal title={e ? "Edit expense" : "Add expense"} onClose={onClose} actions={<>
      {e && <><ConfirmButton onConfirm={remove}>Delete</ConfirmButton><span className="spacer" /></>}
      <button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => save()}>Save</button>
    </>}>
      <form className="form" onSubmit={save}>
        <label className="f full">What was it for?<input id="e-name" {...bind("name")} placeholder="Electricity tokens" required /></label>
        <label className="f">Category<input id="e-cat" list="excats" {...bind("category")} required /><datalist id="excats">{CATS.map((c) => <option key={c} value={c} />)}</datalist></label>
        <label className="f">Amount (KES)<input id="e-amount" type="number" min={0} step="any" {...bind("amount")} required /></label>
        <label className="f">Date<input id="e-day" type="date" {...bind("day")} required /></label>
        <label className="f">Paid with<select id="e-method" {...bind("method")}><option value="mpesa">M-Pesa</option><option value="cash">Cash</option><option value="bank">Bank</option></select></label>
        <label className="f">Status<select id="e-status" {...bind("status")}><option value="paid">Paid</option><option value="pending">Not paid yet</option></select></label>
        <label className="f" style={{ justifyContent: "end" }}><span><input type="checkbox" {...check("recurring")} /> Repeats every month</span></label>
        <button hidden />
      </form>
      {error && <div className="err">{error}</div>}
    </Modal>
  );
}
