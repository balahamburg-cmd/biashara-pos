import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loginEmail, toMsisdn } from "@/lib/phone";

// Adds a staff member with their own login (phone number + PIN or password).
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { data: me } = await supabase.from("members").select("business_id, role").eq("user_id", user.id).eq("active", true).maybeSingle();
  if (!me || !["owner", "manager"].includes(me.role)) return NextResponse.json({ error: "Only an owner or manager can add staff." }, { status: 403 });

  const { name, phone, idNumber, role, password } = await req.json();
  if (!["manager", "cashier", "waiter"].includes(role)) return NextResponse.json({ error: "Choose a role." }, { status: 400 });
  if (role === "manager" && me.role !== "owner") return NextResponse.json({ error: "Only the owner can add a manager." }, { status: 403 });
  if (!String(name ?? "").trim()) return NextResponse.json({ error: "Enter a name." }, { status: 400 });
  if (!toMsisdn(String(phone ?? ""))) return NextResponse.json({ error: "Enter a phone number like 0712 345 678. Staff use it to sign in." }, { status: 400 });
  if (String(password ?? "").length < 6) return NextResponse.json({ error: "The PIN or password needs at least 6 characters." }, { status: 400 });

  const admin = createAdminClient();
  const { data: created, error } = await admin.auth.admin.createUser({ email: loginEmail(phone), password, email_confirm: true, user_metadata: { name } });
  if (error) {
    const taken = /already/i.test(error.message);
    return NextResponse.json({ error: taken ? "Someone already uses this phone number to sign in." : error.message }, { status: 400 });
  }
  const { error: e2 } = await admin.from("members").insert({ business_id: me.business_id, user_id: created.user.id, role, name: String(name).trim(), phone, id_number: idNumber ?? "" });
  if (e2) {
    await admin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: e2.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
