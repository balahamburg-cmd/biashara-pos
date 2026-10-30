import "server-only";
import { createHmac } from "crypto";

const base = () => (process.env.MPESA_ENV === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke");

export const mpesaEnabled = () =>
  !!(process.env.MPESA_CONSUMER_KEY && process.env.MPESA_CONSUMER_SECRET && process.env.MPESA_SHORTCODE && process.env.MPESA_PASSKEY && process.env.APP_URL);

// Safaricom does not sign callbacks, so each callback URL carries a token only this server can make.
export const callbackToken = (requestId: string) =>
  createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY! + process.env.MPESA_PASSKEY!).update(requestId).digest("hex").slice(0, 32);

async function accessToken(): Promise<string> {
  const auth = Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString("base64");
  const res = await fetch(`${base()}/oauth/v1/generate?grant_type=client_credentials`, { headers: { Authorization: `Basic ${auth}` }, cache: "no-store" });
  if (!res.ok) throw new Error(`M-Pesa sign-in failed (${res.status}). Check the consumer key and secret.`);
  return (await res.json()).access_token;
}

// Daraja wants the time in Nairobi as YYYYMMDDHHmmss.
function timestamp() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const g = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${g("year")}${g("month")}${g("day")}${g("hour") === "24" ? "00" : g("hour")}${g("minute")}${g("second")}`;
}

export async function stkPush(opts: { requestId: string; phone: string; amount: number; reference: string }) {
  const shortcode = process.env.MPESA_SHORTCODE!;
  const ts = timestamp();
  const password = Buffer.from(shortcode + process.env.MPESA_PASSKEY + ts).toString("base64");
  const callback = `${process.env.APP_URL!.replace(/\/$/, "")}/api/mpesa/callback?r=${opts.requestId}&t=${callbackToken(opts.requestId)}`;
  const res = await fetch(`${base()}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: ts,
      TransactionType: process.env.MPESA_TRANSACTION_TYPE || "CustomerBuyGoodsOnline",
      Amount: Math.ceil(opts.amount),
      PartyA: opts.phone,
      PartyB: process.env.MPESA_PARTY_B || shortcode,
      PhoneNumber: opts.phone,
      CallBackURL: callback,
      AccountReference: opts.reference.slice(0, 12),
      TransactionDesc: "Payment",
    }),
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.ResponseCode !== "0") {
    throw new Error(body.errorMessage || body.ResponseDescription || `M-Pesa request failed (${res.status})`);
  }
  return body.CheckoutRequestID as string;
}
