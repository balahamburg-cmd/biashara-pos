// Kenyan phone numbers in the 2547XXXXXXXX form M-Pesa expects.
export function toMsisdn(input: string): string | null {
  const d = input.replace(/\D/g, "");
  if (/^0[17]\d{8}$/.test(d)) return "254" + d.slice(1);
  if (/^[17]\d{8}$/.test(d)) return "254" + d;
  if (/^254[17]\d{8}$/.test(d)) return d;
  return null;
}

// Staff sign in with their phone number; behind the scenes it maps to an email address.
export const STAFF_EMAIL_DOMAIN = "staff.biashara.local";
export function loginEmail(input: string): string {
  const v = input.trim();
  if (v.includes("@")) return v.toLowerCase();
  const m = toMsisdn(v);
  return (m ?? v.replace(/\D/g, "")) + "@" + STAFF_EMAIL_DOMAIN;
}
