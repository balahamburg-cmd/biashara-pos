"use client";

import { useState } from "react";
import { Modal } from "./ui";
import { useBiz } from "./biz";
import { receiptLines } from "@/lib/receipt";
import { bluetoothSupported, connectedPrinter, printLines } from "@/lib/printer";
import type { Sale } from "@/lib/types";

export function ReceiptModal({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const { business, toast } = useBiz();
  const lines = receiptLines(sale, business);
  const [busy, setBusy] = useState(false);

  async function print() {
    setBusy(true);
    try {
      await printLines(lines);
      toast("Sent to " + (connectedPrinter() ?? "printer"));
    } catch (e) {
      const m = (e as Error).message;
      if (!/cancel/i.test(m)) toast(m);
    }
    setBusy(false);
  }

  return (
    <Modal title={`Receipt #${sale.receipt_no}`} onClose={onClose} actions={<>
      <button className="btn" onClick={() => navigator.clipboard?.writeText(lines.join("\n")).then(() => toast("Receipt copied"), () => {})}>Copy</button>
      {bluetoothSupported() && <button className="btn" disabled={busy} onClick={print}>{busy ? "Printing…" : connectedPrinter() ? "Print" : "Connect printer & print"}</button>}
      <button className="btn primary" onClick={onClose}>Done</button>
    </>}>
      <pre className="receipt">{lines.join("\n")}</pre>
      {!bluetoothSupported() && <p className="muted" style={{ fontSize: 13 }}>To print to a Bluetooth receipt printer, open the app in Chrome on an Android phone or tablet, or on a computer.</p>}
    </Modal>
  );
}
