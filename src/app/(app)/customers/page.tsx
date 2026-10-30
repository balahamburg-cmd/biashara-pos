"use client";

import { useEffect, useState } from "react";
import { useBiz } from "@/components/biz";
import { ConfirmButton, Modal, Table, Tile, useForm } from "@/components/ui";
import { kes, num } from "@/lib/format";
import type { Customer } from "@/lib/types";

type Stat = { visits: number; spent: number; owed: number };

export default function CustomersPage() {
  const { supabase, business, customers, manager } = useBiz();
  const [stats, setStats] = useState<Record<string, Stat>>({});
  const [editing, setEditing] = useState<Customer | "new" | null>(null);

  useEffect(() => {
    supabase.from("customer_stats").select("*").eq("business_id", business.id).then(({ data }) =>
      setStats(Object.fromEntries((data ?? []).map((r) => [r.customer_id, { visits: r.visits, spent: Number(r.spent), owed: Number(r.owed) }]))));
  }, [supabase, business.id, customers]);

  const st = (id: string) => stats[id] ?? { visits: 0, spent: 0, owed: 0 };
  const by = (k: keyof Stat) => [...customers].sort((a, b) => st(b.id)[k] - st(a.id)[k])[0];
  const mv = by("spent"), bb = by("visits"), hp = by("owed");

  return (
    <>
      <div className="top"><h1>Customers</h1><button className="btn primary" onClick={() => setEditing("new")}>Add customer</button></div>
      <div className="tiles">
        <Tile k="Customers" v={num(customers.length)} />
        <Tile k="Most valuable" v={mv && st(mv.id).spent ? mv.name : "–"} />
        <Tile k="Most visits" v={bb && st(bb.id).visits ? <>{bb.name} <span className="muted">({st(bb.id).visits})</span></> : "–"} />
        <Tile k="Owes the most" v={hp && st(hp.id).owed ? <>{hp.name} <span className="muted">{kes(st(hp.id).owed)}</span></> : "–"} warn={!!(hp && st(hp.id).owed)} />
      </div>
      <Table head={[["Name"], ["Phone"], ["Area"], ["Visits", "n"], ["Total paid", "n"], ["Owes", "n"], [""]]} empty="No customers yet. Add regulars so you can sell to them on credit.">
        {customers.map((c) => (
          <tr key={c.id}>
            <td>{c.name}</td><td className="num">{c.phone}</td><td>{c.address}</td>
            <td className="n">{st(c.id).visits}</td><td className="n">{kes(st(c.id).spent)}</td>
            <td className="n">{st(c.id).owed ? <strong style={{ color: "var(--warn)" }}>{kes(st(c.id).owed)}</strong> : "–"}</td>
            <td><button className="btn small" onClick={() => setEditing(c)}>Edit</button></td>
          </tr>
        ))}
      </Table>
      {editing && <CustomerForm c={editing === "new" ? null : editing} canDelete={manager} onClose={() => setEditing(null)} />}
    </>
  );
}

function CustomerForm({ c, canDelete, onClose }: { c: Customer | null; canDelete: boolean; onClose: () => void }) {
  const { supabase, business, reload, toast } = useBiz();
  const { v, bind } = useForm({ name: c?.name ?? "", phone: c?.phone ?? "", address: c?.address ?? "" });
  const [error, setError] = useState("");
  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    if (!v.name.trim()) return setError("Enter a name.");
    const body = { name: v.name.trim(), phone: v.phone.trim(), address: v.address.trim() };
    const { error } = c ? await supabase.from("customers").update(body).eq("id", c.id) : await supabase.from("customers").insert({ ...body, business_id: business.id });
    if (error) return setError(error.message);
    await reload(["customers"]); toast("Saved"); onClose();
  }
  async function remove() {
    await supabase.from("customers").delete().eq("id", c!.id);
    await reload(["customers"]); toast("Deleted"); onClose();
  }
  return (
    <Modal title={c ? "Edit customer" : "Add customer"} onClose={onClose} actions={<>
      {c && canDelete && <><ConfirmButton onConfirm={remove}>Delete</ConfirmButton><span className="spacer" /></>}
      <button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => save()}>Save</button>
    </>}>
      <form className="form" onSubmit={save}>
        <label className="f full">Full name<input id="c-name" {...bind("name")} required /></label>
        <label className="f">Phone<input id="c-phone" type="tel" {...bind("phone")} placeholder="0712 345 678" /></label>
        <label className="f">Area / address<input id="c-addr" {...bind("address")} /></label>
        <button hidden />
      </form>
      {error && <div className="err">{error}</div>}
    </Modal>
  );
}
