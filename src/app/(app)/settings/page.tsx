"use client";

import { useState } from "react";
import { useBiz } from "@/components/biz";
import { useForm } from "@/components/ui";
import { bluetoothSupported, connectPrinter, connectedPrinter, printLines } from "@/lib/printer";

export default function SettingsPage() {
  const { supabase, business, mpesa, reload, toast } = useBiz();
  const { v, bind } = useForm({ name: business.name, location: business.location, phone: business.phone, till: business.till, footer: business.footer });
  const [printer, setPrinter] = useState(connectedPrinter());

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("businesses").update(v).eq("id", business.id);
    if (error) return toast(error.message);
    await reload(["business"]);
    toast("Details saved");
  }
  async function connect() {
    try { setPrinter(await connectPrinter()); toast("Printer connected"); }
    catch (e) { if (!/cancel/i.test((e as Error).message)) toast((e as Error).message); }
  }

  return (
    <>
      <div className="top"><h1>Settings</h1></div>
      <div className="grid2">
        <div className="panel">
          <h2>Business details</h2>
          <p className="muted" style={{ marginTop: 0 }}>These print at the top of every receipt.</p>
          <form className="form" onSubmit={save}>
            <label className="f full">Business name<input id="s-name" {...bind("name")} required /></label>
            <label className="f">Location<input id="s-loc" {...bind("location")} placeholder="Westlands, Nairobi" /></label>
            <label className="f">Phone<input id="s-phone" type="tel" {...bind("phone")} /></label>
            <label className="f">M-Pesa Till or Paybill<input id="s-till" {...bind("till")} /></label>
            <label className="f">Receipt message<input id="s-footer" {...bind("footer")} /></label>
            <div className="full"><button className="btn primary">Save details</button></div>
          </form>
        </div>
        <div className="panel">
          <h2>Receipt printer</h2>
          {bluetoothSupported() ? (
            <>
              <p className="muted" style={{ marginTop: 0 }}>Turn the printer on, then connect. Works with most 58 mm Bluetooth thermal printers.</p>
              <div className="row">
                <button className="btn" onClick={connect}>{printer ? `Connected: ${printer}` : "Connect printer"}</button>
                {printer && <button className="btn" onClick={() => printLines([business.name, "Test print", "If you can read this, printing works."]).catch((e) => toast(e.message))}>Print test</button>}
              </div>
            </>
          ) : <p className="muted" style={{ marginTop: 0 }}>This browser cannot use Bluetooth. Open the app in Chrome on an Android phone or tablet, or on a computer, to print receipts.</p>}
          <h2 style={{ marginTop: 22 }}>M-Pesa</h2>
          <p className="muted" style={{ marginTop: 0 }}>{mpesa ? "Automatic M-Pesa prompts are on. Customers get a PIN prompt on their phone at checkout." : "Automatic M-Pesa prompts are off. Cashiers record M-Pesa payments by hand. See the setup guide to turn prompts on."}</p>
        </div>
      </div>
    </>
  );
}
