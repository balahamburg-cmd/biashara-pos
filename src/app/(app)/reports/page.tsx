"use client";

import { useEffect, useState } from "react";
import { useBiz } from "@/components/biz";
import { DateInput, MonthInput, Table, Tabs, Tile } from "@/components/ui";
import { useSales } from "@/components/useSales";
import { addDays, kes, monthEnd, monthName, niceDate, num, parseYmd, today } from "@/lib/format";
import { balanceOf, itemsAgg } from "@/lib/sales";
import type { Expense, Sale } from "@/lib/types";

export default function ReportsPage() {
  const [tab, setTab] = useState<"week" | "income" | "margins">("week");
  const [day, setDay] = useState(today());
  const [month, setMonth] = useState(today().slice(0, 7));
  return (
    <>
      <div className="top"><h1>Reports</h1><div className="row">{tab === "week" ? <DateInput value={day} onChange={setDay} /> : <MonthInput value={month} onChange={setMonth} />}</div></div>
      <Tabs value={tab} onChange={setTab} items={[["week", "Weekly sales"], ["income", "Income statement"], ["margins", "Product margins"]]} />
      {tab === "week" && <Week day={day} />}
      {tab === "income" && <Income month={month} />}
      {tab === "margins" && <Margins month={month} />}
    </>
  );
}

function Week({ day }: { day: string }) {
  const mon = addDays(day, -((parseYmd(day).getDay() + 6) % 7));
  const { sales } = useSales(addDays(mon, -7), addDays(mon, 6));
  const sum = (d: string) => sales.filter((s) => s.day === d).reduce((a, s) => a + s.total, 0);
  const days = [...Array(7)].map((_, i) => ({ ds: addDays(mon, i), v: sum(addDays(mon, i)) }));
  const tot = days.reduce((a, x) => a + x.v, 0);
  const prev = [...Array(7)].reduce((a, _, i) => a + sum(addDays(mon, i - 7)), 0);
  const best = days.reduce((a, b) => (b.v > a.v ? b : a));
  return (
    <>
      <div className="tiles">
        <Tile k="Week total" v={kes(tot)} /><Tile k="Daily average" v={kes(tot / 7)} />
        <Tile k="Best day" v={tot ? parseYmd(best.ds).toLocaleDateString("en-KE", { weekday: "long" }) : "–"} />
        <Tile k="Change vs last week" v={prev ? `${tot >= prev ? "+" : ""}${Math.round(((tot - prev) / prev) * 100)}%` : "–"} />
      </div>
      <div className="panel"><h2>{niceDate(mon)} to {niceDate(addDays(mon, 6))}</h2><BarChart days={days} /></div>
    </>
  );
}

function BarChart({ days }: { days: { ds: string; v: number }[] }) {
  const W = 700, H = 280, L = 64, B = 30, T = 14, R = 10;
  const max = Math.max(1, ...days.map((d) => d.v));
  const raw = max / 4, p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((x) => x >= raw) ?? 10 * p;
  const top = Math.ceil(max / step) * step;
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  const bw = (W - L - R) / 7;
  const best = days.reduce((a, b) => (b.v > a.v ? b : a));
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Sales by day">
      {ticks.map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeDasharray={v ? "3 4" : undefined} /><text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize="12" fill="var(--muted)">{v >= 1000 ? Math.round(v / 1000) + "k" : v}</text></g>)}
      {days.map((d, i) => {
        const x = L + i * bw + bw * 0.18, w = bw * 0.64, yy = y(d.v);
        return (
          <g key={d.ds}>
            <rect x={x} y={yy} width={w} height={Math.max(0, H - B - yy)} rx="4" fill="var(--accent)" opacity={d === best && d.v ? 1 : 0.55}><title>{`${niceDate(d.ds)}: ${kes(d.v)}`}</title></rect>
            {d.v > 0 && <text x={x + w / 2} y={yy - 5} textAnchor="middle" fontSize="11" fill="var(--fg)">{Math.round(d.v / 100) / 10}k</text>}
            <text x={x + w / 2} y={H - 10} textAnchor="middle" fontSize="12" fill="var(--muted)">{parseYmd(d.ds).toLocaleDateString("en-KE", { weekday: "short" })}</text>
          </g>
        );
      })}
    </svg>
  );
}

function useExpenses(month: string) {
  const { supabase, business } = useBiz();
  const [list, setList] = useState<Expense[]>([]);
  useEffect(() => {
    supabase.from("expenses").select("*").eq("business_id", business.id).gte("day", month + "-01").lte("day", monthEnd(month))
      .then(({ data }) => setList(((data ?? []) as Expense[]).map((e) => ({ ...e, amount: Number(e.amount) }))));
  }, [supabase, business.id, month]);
  return list;
}

function Income({ month }: { month: string }) {
  const { business } = useBiz();
  const { sales } = useSales(month + "-01", monthEnd(month));
  const ex = useExpenses(month).filter((e) => e.category !== "Inventory");
  const agg = itemsAgg(sales);
  const rev = agg.reduce((a, r) => a + r.rev, 0), cogs = agg.reduce((a, r) => a + r.cost, 0);
  const missing = agg.filter((r) => !r.hasCost);
  const cats = Object.entries(ex.reduce<Record<string, number>>((m, e) => { m[e.category] = (m[e.category] ?? 0) + e.amount; return m; }, {})).sort((a, b) => b[1] - a[1]);
  const opex = ex.reduce((a, e) => a + e.amount, 0);
  const net = rev - cogs - opex;
  const owed = sales.reduce((a: number, s: Sale) => a + balanceOf(s), 0);
  return (
    <div className="stmt">
      <p className="muted">{business.name} · {monthName(month)}</p>
      <div className="sec"><h3>Revenue</h3><div className="ln"><span>Sales</span><span>{kes(rev)}</span></div><div className="ln muted"><span>of which still unpaid by customers</span><span>{kes(owed)}</span></div></div>
      <div className="sec"><h3>Cost of goods sold</h3><div className="ln"><span>Buying cost of items sold</span><span>{kes(cogs)}</span></div></div>
      <div className="sec"><div className="ln b"><span>Gross profit</span><span>{kes(rev - cogs)}</span></div></div>
      <div className="sec"><h3>Operating expenses</h3>
        {cats.length ? cats.map(([k, v]) => <div className="ln" key={k}><span>{k}</span><span>{kes(v)}</span></div>) : <div className="ln muted"><span>None recorded</span><span>–</span></div>}
        <div className="ln b"><span>Total operating expenses</span><span>{kes(opex)}</span></div>
      </div>
      <div className={"sec " + (net < 0 ? "loss" : "net")}><div className="ln b"><span>{net < 0 ? "Net loss" : "Net profit"}</span><span>{kes(net)}</span></div></div>
      {missing.length > 0 && <div className="banner">{missing.length} item{missing.length > 1 ? "s have" : " has"} no buying price, so profit is overstated: {missing.map((r) => r.name).join(", ")}. Set it under Stock → Products & prices.</div>}
      <p className="muted" style={{ fontSize: 13 }}>Cost of goods is worked out from the buying price of each item sold, so stock you bought but have not sold yet does not count against this month.</p>
    </div>
  );
}

function Margins({ month }: { month: string }) {
  const { sales } = useSales(month + "-01", monthEnd(month));
  const agg = itemsAgg(sales);
  const rev = agg.reduce((a, r) => a + r.rev, 0), cost = agg.reduce((a, r) => a + r.cost, 0);
  return (
    <>
      <div className="tiles"><Tile k="Revenue" v={kes(rev)} /><Tile k="Cost" v={kes(cost)} /><Tile k="Profit" v={kes(rev - cost)} /><Tile k="Margin" v={rev ? Math.round(((rev - cost) / rev) * 100) + "%" : "–"} /></div>
      <Table head={[["Item"], ["Sold", "n"], ["Revenue", "n"], ["Cost", "n"], ["Profit", "n"], ["Margin", "n"]]}>
        {agg.map((r) => (
          <tr key={r.key}>
            <td>{r.name}</td><td className="n">{r.qty}</td><td className="n">{num(r.rev)}</td>
            <td className="n">{r.hasCost ? num(r.cost) : <span style={{ color: "var(--warn)" }}>No buy price</span>}</td>
            <td className="n">{r.hasCost ? num(r.rev - r.cost) : "–"}</td>
            <td className="n">{r.hasCost && r.rev ? Math.round(((r.rev - r.cost) / r.rev) * 100) + "%" : "–"}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
