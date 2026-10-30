"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { loginEmail } from "@/lib/phone";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const supabase = createClient();
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email: loginEmail(id), password });
      if (error) setError("That phone number or email and password don't match.");
      else router.replace("/sales");
    } else {
      const { data, error } = await supabase.auth.signUp({ email: id.trim(), password });
      if (error) setError(error.message);
      else if (!data.session) setNotice("Check your email and click the link to confirm, then sign in here.");
      else router.replace("/setup");
    }
    setBusy(false);
  }

  return (
    <div className="auth">
      <form className="panel" onSubmit={submit}>
        <div className="brand" style={{ padding: 0 }}>
          Biashara POS<small>{mode === "signin" ? "Sign in to your shop" : "Create an account for your business"}</small>
        </div>
        <label className="f">
          {mode === "signin" ? "Phone number or email" : "Owner's email"}
          <input id="login-id" type={mode === "signin" ? "text" : "email"} required value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" />
        </label>
        <label className="f">
          {mode === "signin" ? "PIN or password" : "Password (at least 6 characters)"}
          <input id="login-pw" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "signin" ? "current-password" : "new-password"} />
        </label>
        {error && <div className="err">{error}</div>}
        {notice && <div className="banner">{notice}</div>}
        <button className="btn primary" disabled={busy} style={{ padding: 12 }}>
          {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          {mode === "signin" ? (
            <>Staff: use the phone number and PIN your manager gave you. New business? <a href="#" onClick={(e) => { e.preventDefault(); setMode("signup"); }}>Create an account</a></>
          ) : (
            <>Already have an account? <a href="#" onClick={(e) => { e.preventDefault(); setMode("signin"); }}>Sign in</a></>
          )}
        </p>
      </form>
    </div>
  );
}
