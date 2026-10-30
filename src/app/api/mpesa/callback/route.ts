import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { callbackToken } from "@/lib/mpesa";

type Item = { Name: string; Value?: string | number };

// Safaricom calls this once the customer accepts or cancels the prompt.
export async function POST(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("r") ?? "";
  const token = url.searchParams.get("t") ?? "";
  const expected = callbackToken(id);
  if (token.length !== expected.length || !timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
    return NextResponse.json({ ResultCode: 1, ResultDesc: "Rejected" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const cb = body?.Body?.stkCallback;
  const admin = createAdminClient();
  const { data: row } = await admin.from("mpesa_requests").select("*").eq("id", id).maybeSingle();
  if (!cb || !row || row.status !== "pending" || cb.CheckoutRequestID !== row.checkout_request_id) {
    return NextResponse.json({ ResultCode: 0, ResultDesc: "Ignored" });
  }

  if (cb.ResultCode !== 0) {
    await admin.from("mpesa_requests").update({ status: "failed", result_desc: String(cb.ResultDesc ?? "") }).eq("id", id);
    return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }

  const items: Item[] = cb.CallbackMetadata?.Item ?? [];
  const receipt = String(items.find((i) => i.Name === "MpesaReceiptNumber")?.Value ?? "");
  const paid = Number(items.find((i) => i.Name === "Amount")?.Value ?? row.amount);

  // Mark the request first so a repeated callback cannot add the payment twice.
  const { data: claimed } = await admin
    .from("mpesa_requests")
    .update({ status: "success", mpesa_receipt: receipt, result_desc: String(cb.ResultDesc ?? "") })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");
  if (claimed?.length) {
    await admin.from("payments").insert({ sale_id: row.sale_id, business_id: row.business_id, method: "mpesa", amount: Math.min(paid, Number(row.amount)), mpesa_receipt: receipt });
  }
  return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
}
