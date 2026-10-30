export type Role = "owner" | "manager" | "cashier" | "waiter";

export type Business = { id: string; name: string; location: string; phone: string; till: string; footer: string };
export type Member = { business_id: string; user_id: string; role: Role; name: string; phone: string; id_number: string; active: boolean };
export type Product = { id: string; name: string; category: string; buy_price: number; sell_price: number; listed: boolean };
export type StockMove = { id: string; product_id: string; kind: "add" | "remove"; qty: number; day: string; note: string };
export type Customer = { id: string; name: string; phone: string; address: string };
export type SaleItem = { id: string; sale_id: string; product_id: string | null; name: string; qty: number; price: number; buy_price: number };
export type Payment = { id: string; sale_id: string; method: "mpesa" | "cash"; amount: number; mpesa_receipt: string; created_at: string };
export type Sale = {
  id: string; receipt_no: number; day: string; total: number; created_at: string;
  customer_id: string | null; customer_name: string; staff_id: string | null; staff_name: string;
  sale_items: SaleItem[]; payments: Payment[];
};
export type Expense = { id: string; day: string; name: string; category: string; amount: number; method: "mpesa" | "cash" | "bank"; status: "paid" | "pending"; recurring: boolean };

export const isManager = (r: Role | undefined) => r === "owner" || r === "manager";
