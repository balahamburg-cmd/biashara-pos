"use client";

import { useState } from "react";
import { useBiz } from "@/components/biz";
import { Modal, MonthInput, Table, Tile, useForm } from "@/components/ui";
import { useSales } from "@/components/useSales";
import { kes, monthEnd, monthName, num, today } from "@/lib/format";
import type { Member } from "@/lib/types";

const ROLE = { owner: "Owner", manager: "Manager", cashier: "Cashier", waiter: "Waiter" };

export default function StaffPage() {
  const { team, me, supabase, reload, toast } = useBiz();
  const [month, setMonth] = useState(today().slice(0, 7));
  const { sales } = useSales(month + "-01", monthEnd(month));
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);

  const by: Record<string, { count: number; rev: number }> = {};
  for (const s of sales) if (s.staff_id) { const r = (by[s.staff_id] ??= { count: 0, rev: 0 }); r.count++; r.rev += s.total; }
  const top = [...team].sort((a, b) => (by[b.user_id]?.rev ?? 0) - (by[a.user_id]?.rev ?? 0))[0];
  const all = Object.values(by).reduce((a, r) => a + r.rev, 0);

  async function setActive(m: Member, active: boolean) {
    const { error } = await supabase.from("members").update({ active }).eq("business_id", m.business_id).eq("user_id", m.user_id);
    if (error) return toast(error.message);
    reload(["team"]);
    toast(active ? `${m.name} can sign in again` : `${m.name} can no longer sign in`);
  }

  return (
    <>
      <div className="top"><h1>Staff</h1><div className="row"><MonthInput value={month} onChange={setMonth} /><button className="btn primary" onClick={() => setAdding(true)}>Add staff</button></div></div>
      <div className="tiles">
        <Tile k="Staff" v={num(team.filter((m) => m.active).length)} />
        <Tile k="Top seller" v={top && by[top.user_id]?.rev ? top.name : "–"} />
        <Tile k="Top seller's sales" v={kes(top ? by[top.user_id]?.rev ?? 0 : 0)} />
        <Tile k="All staff sales" v={kes(all)} />
      </div>
      <Table head={[["Name"], ["Phone"], ["ID number"], ["Role"], [`Sales in ${monthName(month)}`, "n"], ["Amount", "n"], [""]]}>
        {team.map((m) => (
          <tr key={m.user_id} style={m.active ? undefined : { opacity: 0.55 }}>
            <td>{m.name}{!m.active && " (no access)"}</td><td className="num">{m.phone}</td><td className="num">{m.id_number}</td>
            <td><span className="pill role">{ROLE[m.role]}</span></td>
            <td className="n">{by[m.user_id]?.count ?? 0}</td><td className="n">{kes(by[m.user_id]?.rev ?? 0)}</td>
            <td>{m.role !== "owner" && m.user_id !== me.user_id && (
              <div className="row" style={{ flexWrap: "nowrap" }}>
                <button className="btn small" onClick={() => setEditing(m)}>Edit</button>
                <button className="btn small" onClick={() => setActive(m, !m.active)}>{m.active ? "Remove access" : "Restore access"}</button>
              </div>
            )}</td>
          </tr>
        ))}
      </Table>
      <p className="muted" style={{ fontSize: 13 }}>Staff sign in with their phone number and the PIN you set. Cashiers and waiters can only sell, view stock and manage customers.</p>
      {adding && <AddStaff onClose={() => setAdding(false)} />}
      {editing && <EditStaff m={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function AddStaff({ onClose }: { onClose: () => void }) {
  const { me, reload, toast } = useBiz();
  const { v, bind } = useForm({ name: "", phone: "", idNumber: "", role: "cashier", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    const res = await fetch("/api/staff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.error ?? "Could not add this person.");
    await reload(["team"]); toast(`${v.name} added. They can sign in with ${v.phone}.`); onClose();
  }
  return (
    <Modal title="Add staff member" onClose={onClose} actions={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={() => save()}>{busy ? "Adding…" : "Add"}</button></>}>
      <form className="form" onSubmit={save}>
        <label className="f full">Full name<input id="st-name" {...bind("name")} required /></label>
        <label className="f">Phone (used to sign in)<input id="st-phone" type="tel" {...bind("phone")} placeholder="0712 345 678" required /></label>
        <label className="f">ID number<input id="st-id" {...bind("idNumber")} /></label>
        <label className="f">Role<select id="st-role" {...bind("role")}><option value="cashier">Cashier</option><option value="waiter">Waiter</option>{me.role === "owner" && <option value="manager">Manager</option>}</select></label>
        <label className="f">PIN or password (6+ characters)<input id="st-pw" type="text" {...bind("password")} minLength={6} required autoComplete="off" /></label>
        <button hidden />
      </form>
      {error && <div className="err">{error}</div>}
    </Modal>
  );
}

function EditStaff({ m, onClose }: { m: Member; onClose: () => void }) {
  const { supabase, me, reload, toast } = useBiz();
  const { v, bind } = useForm({ name: m.name, phone: m.phone, id_number: m.id_number, role: m.role as string });
  const [error, setError] = useState("");
  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    const { error } = await supabase.from("members").update(v).eq("business_id", m.business_id).eq("user_id", m.user_id);
    if (error) return setError(error.message);
    await reload(["team"]); toast("Saved"); onClose();
  }
  return (
    <Modal title={`Edit ${m.name}`} onClose={onClose} actions={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => save()}>Save</button></>}>
      <form className="form" onSubmit={save}>
        <label className="f full">Full name<input id="se-name" {...bind("name")} required /></label>
        <label className="f">Phone<input id="se-phone" type="tel" {...bind("phone")} /></label>
        <label className="f">ID number<input id="se-id" {...bind("id_number")} /></label>
        <label className="f">Role<select id="se-role" {...bind("role")}><option value="cashier">Cashier</option><option value="waiter">Waiter</option>{me.role === "owner" && <option value="manager">Manager</option>}</select></label>
        <button hidden />
      </form>
      <p className="muted" style={{ fontSize: 13 }}>Changing the phone here does not change how they sign in.</p>
      {error && <div className="err">{error}</div>}
    </Modal>
  );
}
