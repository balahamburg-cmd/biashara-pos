"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SetupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", owner: "", location: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await createClient().rpc("create_business", { p_name: form.name, p_owner_name: form.owner, p_location: form.location, p_phone: form.phone });
    if (error) {
      setError(error.message);
      setBusy(false);
    } else router.replace("/stock");
  }

  return (
    <div className="auth">
      <form className="panel" onSubmit={submit}>
        <h1 style={{ fontSize: 24 }}>Set up your business</h1>
        <p className="muted" style={{ margin: 0 }}>This shows on receipts. You can change it later in Settings.</p>
        <label className="f">Business name<input id="s-name" required value={form.name} onChange={set("name")} placeholder="Mama Pima Café" /></label>
        <label className="f">Your name<input id="s-owner" required value={form.owner} onChange={set("owner")} /></label>
        <label className="f">Location<input id="s-loc" value={form.location} onChange={set("location")} placeholder="Westlands, Nairobi" /></label>
        <label className="f">Business phone<input id="s-phone" type="tel" value={form.phone} onChange={set("phone")} /></label>
        {error && <div className="err">{error}</div>}
        <button className="btn primary" disabled={busy} style={{ padding: 12 }}>{busy ? "Saving…" : "Continue"}</button>
      </form>
    </div>
  );
}
