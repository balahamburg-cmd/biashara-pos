const pad = (n: number) => String(n).padStart(2, "0");

export const kes = (n: number) => "KES " + Math.round(Number(n) || 0).toLocaleString("en-KE");
export const num = (n: number) => (Number(n) || 0).toLocaleString("en-KE");
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => ymd(new Date());
export const parseYmd = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (s: string, n: number) => {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
};
export const niceDate = (s: string) =>
  parseYmd(s).toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
export const monthName = (m: string) => parseYmd(m + "-01").toLocaleDateString("en-KE", { month: "long", year: "numeric" });
export const time = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const monthEnd = (m: string) => {
  const d = parseYmd(m + "-01");
  return ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0));
};
