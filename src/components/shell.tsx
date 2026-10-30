"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useBiz } from "./biz";

const ICON: Record<string, React.ReactNode> = {
  sales: <path d="M3 4h2l2 11h11l2-8H6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />,
  stock: <path d="M4 8l8-4 8 4v8l-8 4-8-4z M4 8l8 4 8-4 M12 12v8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />,
  expenses: <><rect x="3" y="6" width="18" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M3 10h18" stroke="currentColor" strokeWidth="1.8" /></>,
  customers: <><circle cx="9" cy="9" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M3 19c.8-3 3.2-4.5 6-4.5s5.2 1.5 6 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" /></>,
  staff: <><rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="12" cy="10" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" /></>,
  reports: <path d="M5 20V10M12 20V4M19 20v-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />,
  settings: <><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></>,
};

const MANAGER_ONLY = ["/expenses", "/staff", "/reports", "/settings"];

export function Shell({ children }: { children: React.ReactNode }) {
  const { business, me, manager, supabase } = useBiz();
  const path = usePathname();
  const router = useRouter();
  const nav: [string, string][] = [["sales", "Sales"], ["stock", "Stock"], ["customers", "Customers"]];
  if (manager) nav.push(["expenses", "Expenses"], ["staff", "Staff"], ["reports", "Reports"], ["settings", "Settings"]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <div className="app">
      <aside className="rail">
        <div className="brand">Biashara POS<small>{business.name}{business.location ? " · " + business.location : ""}</small></div>
        <nav className="nav">
          {nav.map(([k, l]) => (
            <Link key={k} href={"/" + k} aria-current={path.startsWith("/" + k) ? "page" : undefined}>
              <svg viewBox="0 0 24 24" aria-hidden="true">{ICON[k]}</svg>{l}
            </Link>
          ))}
        </nav>
        <div className="who">
          <span>Signed in as <strong>{me.name}</strong> ({me.role})</span>
          <button className="btn small" onClick={signOut}>Sign out</button>
        </div>
      </aside>
      <main className="main">
        {!manager && MANAGER_ONLY.some((p) => path.startsWith(p))
          ? <div className="panel empty"><h2>Managers only</h2><p>Ask the owner or a manager if you need this page.</p></div>
          : children}
      </main>
    </div>
  );
}
