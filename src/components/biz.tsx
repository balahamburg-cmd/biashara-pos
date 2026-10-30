"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Business, Customer, Member, Product, StockMove } from "@/lib/types";
import { isManager } from "@/lib/types";

type Ctx = {
  supabase: ReturnType<typeof createClient>;
  business: Business;
  me: Member;
  manager: boolean;
  mpesa: boolean;
  products: Product[];
  customers: Customer[];
  team: Member[];
  moves: StockMove[];
  reload: (what?: ("products" | "customers" | "team" | "moves" | "business")[]) => Promise<void>;
  toast: (msg: string) => void;
};

const BizContext = createContext<Ctx | null>(null);
export const useBiz = () => useContext(BizContext)!;

const num = <T extends object>(rows: T[] | null, keys: (keyof T)[]) =>
  (rows ?? []).map((r) => {
    const o = { ...r };
    for (const k of keys) (o as Record<keyof T, unknown>)[k] = Number(o[k]);
    return o;
  });

export function BizProvider(props: { business: Business; me: Member; mpesa: boolean; children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [business, setBusiness] = useState(props.business);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [team, setTeam] = useState<Member[]>([]);
  const [moves, setMoves] = useState<StockMove[]>([]);
  const [msg, setMsg] = useState("");
  const bid = props.business.id;

  const reload: Ctx["reload"] = useCallback(
    async (what = ["products", "customers", "team", "moves", "business"]) => {
      const jobs: PromiseLike<unknown>[] = [];
      if (what.includes("products")) jobs.push(supabase.from("products").select("*").eq("business_id", bid).order("name").then(({ data }) => setProducts(num(data as Product[], ["buy_price", "sell_price"]))));
      if (what.includes("customers")) jobs.push(supabase.from("customers").select("*").eq("business_id", bid).order("name").then(({ data }) => setCustomers((data ?? []) as Customer[])));
      if (what.includes("team")) jobs.push(supabase.from("members").select("*").eq("business_id", bid).order("name").then(({ data }) => setTeam((data ?? []) as Member[])));
      if (what.includes("moves")) jobs.push(supabase.from("stock_moves").select("*").eq("business_id", bid).then(({ data }) => setMoves((data ?? []) as StockMove[])));
      if (what.includes("business")) jobs.push(supabase.from("businesses").select("*").eq("id", bid).single().then(({ data }) => data && setBusiness(data as Business)));
      await Promise.all(jobs);
    },
    [supabase, bid],
  );

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(""), 2600);
    return () => clearTimeout(t);
  }, [msg]);

  const value: Ctx = { supabase, business, me: props.me, manager: isManager(props.me.role), mpesa: props.mpesa, products, customers, team, moves, reload, toast: setMsg };
  return (
    <BizContext.Provider value={value}>
      {props.children}
      {msg && <div className="toast" role="status">{msg}</div>}
    </BizContext.Provider>
  );
}
