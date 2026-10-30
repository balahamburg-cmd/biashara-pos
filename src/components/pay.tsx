"use client";

import { useEffect, useState } from "react";
import { Modal } from "./ui";
import { useBiz } from "./biz";
import { kes } from "@/lib/format";

type Status = "idle" | "sending" | "waiting" | "success" | "failed";

// Sends an M-Pesa prompt to the customer's phone and waits for Safaricom's answer.
export function useStkPush() {
  const { supabase } = useBiz();
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "waiting" || !requestId) return;
    let tries = 0;
    const t = setInterval(async () => {
      tries++;
      const { data } = await supabase.from("mpesa_requests").select("status, result_desc, mpesa_receipt").eq("id", requestId).single();
      if (data?.status === "success") { setStatus("success"); setMessage(`Paid. M-Pesa code ${data.mpesa_receipt}.`); clearInterval(t); }
      else if (data?.status === "failed") { setStatus("failed"); setMessage(data.result_desc || "The customer cancelled or the payment failed."); clearInterval(t); }
      else if (tries > 40) { setStatus("failed"); setMessage("No answer from M-Pesa after 2 minutes. Check your M-Pesa messages, then record the payment by hand if it came in."); clearInterval(t); }
    }, 3000);
    return () => clearInterval(t);
  }, [status, requestId, supabase]);

  async function send(saleId: string, phone: string, amount: number) {
    setStatus("sending");
    setMessage("");
    const res = await fetch("/api/mpesa/stk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ saleId, phone, amount }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setStatus("failed"); setMessage(body.error ?? "Could not send the M-Pesa prompt."); return; }
    setRequestId(body.requestId);
    setStatus("waiting");
    setMessage("Prompt sent. Ask the customer to enter their M-Pesa PIN.");
  }
  return { status, message, send, reset: () => { setStatus("idle"); setMessage(""); setRequestId(null); } };
}

// Record a payment against a bill: cash, M-Pesa received to the till, or an M-Pesa prompt.
export function PayModal({ saleId, balance, who, defaultPhone, onClose, onDone }: { saleId: string; balance: number; who: string; defaultPhone?: string; onClose: () => void; onDone: () => void }) {
  const { supabase, mpesa, toast } = useBiz();
  const [method, setMethod] = useState<"prompt" | "mpesa" | "cash">(mpesa ? "prompt" : "mpesa");
  const [amount, setAmount] = useState(String(balance));
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const stk = useStkPush();

  useEffect(() => { if (stk.status === "success") { toast("M-Pesa payment received"); onDone(); } }, [stk.status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    const a = Number(amount);
    if (!(a > 0 && a <= balance)) return setError(`Enter an amount between 1 and ${balance}.`);
    setError("");
    if (method === "prompt") return stk.send(saleId, phone, a);
    setBusy(true);
    const { error } = await supabase.rpc("add_payment", { p_sale: saleId, p_method: method, p_amount: a, p_ref: ref });
    setBusy(false);
    if (error) return setError(error.message);
    toast("Payment saved");
    onDone();
  }

  const waiting = stk.status === "sending" || stk.status === "waiting";
  return (
    <Modal title="Record payment" onClose={onClose} actions={<>
      <button className="btn" onClick={onClose}>{waiting ? "Close" : "Cancel"}</button>
      <button className="btn primary" disabled={busy || waiting} onClick={save}>{method === "prompt" ? (stk.status === "failed" ? "Send again" : "Send M-Pesa prompt") : "Save payment"}</button>
    </>}>
      <p>{who} owes <strong>{kes(balance)}</strong>.</p>
      <div className="pay" style={{ gridTemplateColumns: mpesa ? "repeat(3,1fr)" : "repeat(2,1fr)", marginBottom: 12 }}>
        {mpesa && <button aria-pressed={method === "prompt"} onClick={() => setMethod("prompt")}>M-Pesa prompt</button>}
        <button aria-pressed={method === "mpesa"} onClick={() => setMethod("mpesa")}>M-Pesa received</button>
        <button aria-pressed={method === "cash"} onClick={() => setMethod("cash")}>Cash</button>
      </div>
      <div className="form">
        <label className="f">Amount (KES)<input id="pay-amount" type="number" min={1} max={balance} value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        {method === "prompt" && <label className="f">Customer&apos;s phone<input id="pay-phone" type="tel" placeholder="0712 345 678" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>}
        {method === "mpesa" && <label className="f">M-Pesa code (optional)<input id="pay-ref" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="SJK2X4Y7AB" /></label>}
      </div>
      {stk.message && <div className={stk.status === "failed" ? "err" : "banner"} style={{ marginTop: 12 }}>{stk.message}</div>}
      {error && <div className="err" style={{ marginTop: 12 }}>{error}</div>}
    </Modal>
  );
}
