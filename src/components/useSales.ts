"use client";

import { useCallback, useEffect, useState } from "react";
import { useBiz } from "./biz";
import { SALE_SELECT } from "@/lib/sales";
import type { Sale } from "@/lib/types";

const clean = (rows: unknown[] | null): Sale[] =>
  ((rows ?? []) as Sale[]).map((s) => ({
    ...s,
    total: Number(s.total),
    sale_items: (s.sale_items ?? []).map((i) => ({ ...i, price: Number(i.price), buy_price: Number(i.buy_price) })),
    payments: (s.payments ?? []).map((p) => ({ ...p, amount: Number(p.amount) })),
  }));

// Sales with their items and payments between two days (inclusive).
export function useSales(from: string, to: string) {
  const { supabase, business } = useBiz();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    // Fetch in pages of 1000, the most the API returns at once.
    const all: unknown[] = [];
    for (let page = 0; ; page++) {
      const { data } = await supabase.from("sales").select(SALE_SELECT).eq("business_id", business.id).gte("day", from).lte("day", to)
        .order("created_at", { ascending: false }).range(page * 1000, page * 1000 + 999);
      all.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    setSales(clean(all));
    setLoading(false);
  }, [supabase, business.id, from, to]);
  useEffect(() => { setLoading(true); load(); }, [load]);
  return { sales, loading, reload: load };
}

// Every bill with money still owed, any day.
export function usePending() {
  const { supabase, business } = useBiz();
  const [sales, setSales] = useState<Sale[]>([]);
  const load = useCallback(async () => {
    const { data: owing } = await supabase.from("sale_balances").select("sale_id").eq("business_id", business.id).gt("balance", 0);
    const ids = (owing ?? []).map((r) => r.sale_id as string);
    if (!ids.length) return setSales([]);
    const { data } = await supabase.from("sales").select(SALE_SELECT).in("id", ids.slice(0, 500)).order("created_at", { ascending: false });
    setSales(clean(data));
  }, [supabase, business.id]);
  useEffect(() => { load(); }, [load]);
  return { sales, reload: load };
}

export async function fetchSale(supabase: ReturnType<typeof useBiz>["supabase"], id: string) {
  const { data } = await supabase.from("sales").select(SALE_SELECT).eq("id", id).single();
  return clean(data ? [data] : [])[0];
}
