# Biashara POS

A point-of-sale and back office for small cafés, bars, grills and shops in Kenya. It runs in the browser on a phone, tablet or computer.

- **Sales**: tap items, then take payment by M-Pesa prompt (STK push), M-Pesa received to the till, cash, split, or pay later. Receipts print on a 58 mm Bluetooth thermal printer.
- **Stock**: opening, added, removed, sold and closing stock for every day, with buying and selling prices and margins.
- **Customers**: regulars, what they have paid and what they still owe.
- **Expenses**: one-off and monthly costs, paid or pending.
- **Staff**: each person signs in with their phone number and a PIN. Roles are owner, manager, cashier and waiter.
- **Reports**: weekly sales chart, monthly income statement and product margins. Profit uses the buying price of what was actually sold.

Built with Next.js (hosted on Vercel) and Supabase (Postgres database and logins).

## Who can do what

| | Owner | Manager | Cashier / Waiter |
|---|---|---|---|
| Record sales, take payments, print receipts | ✓ | ✓ | ✓ |
| Add and edit customers | ✓ | ✓ | ✓ |
| Record sales for another day | ✓ | ✓ | |
| Products, prices and stock | ✓ | ✓ | view only |
| Expenses, reports, settings | ✓ | ✓ | |
| Add cashiers and waiters | ✓ | ✓ | |
| Add managers, delete sales | ✓ | | |

These rules are enforced by the database (row level security in `supabase/migrations/0001_init.sql`), not only by the screens. Sale prices are always taken from the products table, so a sale cannot be recorded at a made-up price.

## Set it up (about 20 minutes)

### 1. Supabase (database and logins)

1. Create a free project at [supabase.com](https://supabase.com). Pick the region closest to Kenya (for example `eu-central-1` or `af-south-1` if offered).
2. Open **SQL Editor**, paste the whole of `supabase/migrations/0001_init.sql` and click **Run**.
3. Open **Authentication → Sign In / Providers → Email**. If you want owners to sign up without confirming their email, turn off **Confirm email**.
4. Open **Project Settings → API** and copy the **Project URL**, the **anon public** key and the **service_role** key.

### 2. Vercel (hosting)

1. Sign in at [vercel.com](https://vercel.com) with GitHub and import this repository.
2. Under **Environment Variables**, add the values from `.env.example`:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `APP_URL`: the address Vercel gives you, for example `https://biashara-pos.vercel.app`
3. Click **Deploy**. Open the site, choose **Create an account**, then fill in your business details.

### 3. M-Pesa prompts (optional)

Without these settings the app still works. Cashiers just record M-Pesa payments by hand.

1. Create an app at [developer.safaricom.co.ke](https://developer.safaricom.co.ke) with **Lipa Na M-Pesa Online** and note the consumer key and secret.
2. Test first with the sandbox: `MPESA_ENV=sandbox`, `MPESA_SHORTCODE=174379` and the sandbox passkey from the Daraja test credentials page.
3. To go live, apply to Safaricom to move your Till or Paybill to production. Then set:
   - `MPESA_ENV=production`
   - `MPESA_SHORTCODE`: your store number (Buy Goods) or Paybill
   - `MPESA_PASSKEY`: the passkey Safaricom emails you
   - For a Till: `MPESA_TRANSACTION_TYPE=CustomerBuyGoodsOnline` and `MPESA_PARTY_B`=your till number
   - For a Paybill: `MPESA_TRANSACTION_TYPE=CustomerPayBillOnline` and leave `MPESA_PARTY_B` empty
4. Redeploy on Vercel. Settings in the app will show "Automatic M-Pesa prompts are on".

Safaricom calls `/api/mpesa/callback` when the customer accepts or cancels. Each callback address carries a secret token, and a payment is only added once per prompt.

### 4. Receipt printer

Use a 58 mm Bluetooth (BLE) ESC/POS thermal printer. Open the app in **Chrome on Android** (or Chrome/Edge on a computer), go to **Settings → Connect printer**, and pick the printer. iPhones and iPads cannot print this way because Safari has no Web Bluetooth. On those, use Copy and the printer maker's app.

On Android you can also add the app to the home screen from Chrome's menu so it opens like an app.

## Develop

```bash
cp .env.example .env.local   # fill in your Supabase values
npm install
npm run dev                  # http://localhost:3000
npm run typecheck
npm run test:db              # checks the database rules against an in-memory Postgres
```

## Project layout

```
supabase/migrations/0001_init.sql   tables, access rules, record_sale / add_payment / stock_on_day
supabase/tests/rules.test.mjs       database rule tests
src/app/(app)/*                     the screens: sales, stock, customers, expenses, staff, reports, settings
src/app/api/staff                   adds a staff login (server only, uses the service role key)
src/app/api/mpesa/*                 STK push and Safaricom callback
src/lib/printer.ts                  Bluetooth ESC/POS printing
src/lib/receipt.ts                  receipt layout for 32-character paper
```
