import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mpesaEnabled, stkPush } from "@/lib/mpesa";
import { toMsisdn } from "@/lib/phone";

// Sends an M-Pesa prompt to the customer's phone for (part of) a sale's balance.
export async function POST(req: Request) {
  if (!mpesaEnabled()) return NextResponse.json({ error: "Automatic M-Pesa is not set up yet." }, { status: 400 });
  const { saleId, phone, amount } = await req.json();
  const msisdn = toMsisdn(String(phone ?? ""));
  if (!msisdn) return NextResponse.json({ error: "Enter a Safaricom number like 0712 345 678." }, { status: 400 });

  // Reading through the user's own client proves they belong to the sale's business.
  const supabase = await createClient();
  const { data: bal } = await supabase.from("sale_balances").select("sale_id, business_id, balance").eq("sale_id", saleId).maybeSingle();
  if (!bal) return NextResponse.json({ error: "Sale not found." }, { status: 404 });
  const amt = Number(amount);
  if (!(amt >= 1 && amt <= Number(bal.balance))) return NextResponse.json({ error: `Amount must be between 1 and ${bal.balance}.` }, { status: 400 });

  const admin = createAdminClient();
  const { data: reqRow, error } = await admin
    .from("mpesa_requests")
    .insert({ business_id: bal.business_id, sale_id: saleId, phone: msisdn, amount: Math.ceil(amt) })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    const checkoutId = await stkPush({ requestId: reqRow.id, phone: msisdn, amount: amt, reference: "Sale" });
    await admin.from("mpesa_requests").update({ checkout_request_id: checkoutId }).eq("id", reqRow.id);
    return NextResponse.json({ requestId: reqRow.id });
  } catch (e) {
    await admin.from("mpesa_requests").update({ status: "failed", result_desc: (e as Error).message }).eq("id", reqRow.id);
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
