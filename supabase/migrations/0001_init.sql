-- Biashara POS schema. Every row belongs to one business; access is decided by
-- the signed-in user's role in that business (owner, manager, cashier, waiter).


-- ---------------------------------------------------------------- tables

create table businesses (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  location    text not null default '',
  phone       text not null default '',
  till        text not null default '',
  footer      text not null default 'Asante! Karibu tena.',
  created_at  timestamptz not null default now()
);

create table members (
  business_id uuid not null references businesses(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('owner','manager','cashier','waiter')),
  name        text not null,
  phone       text not null default '',
  id_number   text not null default '',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  primary key (business_id, user_id)
);
create index members_user_idx on members(user_id);

create table products (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name        text not null,
  category    text not null default 'Other',
  buy_price   numeric(12,2) not null default 0 check (buy_price >= 0),
  sell_price  numeric(12,2) not null check (sell_price >= 0),
  listed      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index products_business_idx on products(business_id);

create table stock_moves (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  product_id  uuid not null references products(id) on delete cascade,
  kind        text not null check (kind in ('add','remove')),
  qty         integer not null check (qty > 0),
  day         date not null default current_date,
  note        text not null default '',
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);
create index stock_moves_business_day_idx on stock_moves(business_id, day);

create table customers (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name        text not null,
  phone       text not null default '',
  address     text not null default '',
  created_at  timestamptz not null default now()
);
create index customers_business_idx on customers(business_id);

create table sales (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references businesses(id) on delete cascade,
  receipt_no    bigint generated always as identity,
  day           date not null default current_date,
  total         numeric(12,2) not null check (total >= 0),
  customer_id   uuid references customers(id) on delete set null,
  customer_name text not null default '',
  staff_id      uuid references auth.users(id),
  staff_name    text not null default '',
  created_at    timestamptz not null default now()
);
create index sales_business_day_idx on sales(business_id, day);

create table sale_items (
  id          uuid primary key default gen_random_uuid(),
  sale_id     uuid not null references sales(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  product_id  uuid references products(id) on delete set null,
  name        text not null,
  qty         integer not null check (qty > 0),
  price       numeric(12,2) not null,
  buy_price   numeric(12,2) not null default 0
);
create index sale_items_sale_idx on sale_items(sale_id);
create index sale_items_business_idx on sale_items(business_id);

create table payments (
  id            uuid primary key default gen_random_uuid(),
  sale_id       uuid not null references sales(id) on delete cascade,
  business_id   uuid not null references businesses(id) on delete cascade,
  method        text not null check (method in ('mpesa','cash')),
  amount        numeric(12,2) not null check (amount > 0),
  mpesa_receipt text not null default '',
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now()
);
create index payments_sale_idx on payments(sale_id);

create table expenses (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  day         date not null default current_date,
  name        text not null,
  category    text not null default 'Other',
  amount      numeric(12,2) not null check (amount >= 0),
  method      text not null default 'mpesa' check (method in ('mpesa','cash','bank')),
  status      text not null default 'paid' check (status in ('paid','pending')),
  recurring   boolean not null default false,
  created_at  timestamptz not null default now()
);
create index expenses_business_day_idx on expenses(business_id, day);

-- STK push requests sent to Safaricom; written only by the server.
create table mpesa_requests (
  id                  uuid primary key default gen_random_uuid(),
  business_id         uuid not null references businesses(id) on delete cascade,
  sale_id             uuid not null references sales(id) on delete cascade,
  phone               text not null,
  amount              numeric(12,2) not null,
  checkout_request_id text unique,
  status              text not null default 'pending' check (status in ('pending','success','failed')),
  result_desc         text not null default '',
  mpesa_receipt       text not null default '',
  created_at          timestamptz not null default now()
);

-- Paid amount and balance per sale.
create view sale_balances with (security_invoker = true) as
  select s.id as sale_id, s.business_id,
         coalesce(sum(p.amount), 0)::numeric(12,2) as paid,
         (s.total - coalesce(sum(p.amount), 0))::numeric(12,2) as balance
  from sales s left join payments p on p.sale_id = s.id
  group by s.id;

-- ---------------------------------------------------------------- helpers

create or replace function my_role(b uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from members where business_id = b and user_id = auth.uid() and active
$$;

create or replace function is_member(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select my_role(b) is not null
$$;

create or replace function is_manager(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(my_role(b) in ('owner','manager'), false)
$$;

-- ---------------------------------------------------------------- row level security

alter table businesses     enable row level security;
alter table members        enable row level security;
alter table products       enable row level security;
alter table stock_moves    enable row level security;
alter table customers      enable row level security;
alter table sales          enable row level security;
alter table sale_items     enable row level security;
alter table payments       enable row level security;
alter table expenses       enable row level security;
alter table mpesa_requests enable row level security;

create policy "members read business"    on businesses for select using (is_member(id));
create policy "managers edit business"   on businesses for update using (is_manager(id)) with check (is_manager(id));

create policy "members read team"        on members for select using (is_member(business_id));
create policy "managers edit team"       on members for update using (is_manager(business_id)) with check (is_manager(business_id) and role <> 'owner' or my_role(business_id) = 'owner');
create policy "owner removes team"       on members for delete using (my_role(business_id) = 'owner' and role <> 'owner');

create policy "members read products"    on products for select using (is_member(business_id));
create policy "managers write products"  on products for all using (is_manager(business_id)) with check (is_manager(business_id));

create policy "members read stock"       on stock_moves for select using (is_member(business_id));
create policy "managers write stock"     on stock_moves for insert with check (is_manager(business_id) and created_by = auth.uid());
create policy "managers delete stock"    on stock_moves for delete using (is_manager(business_id));

create policy "members read customers"   on customers for select using (is_member(business_id));
create policy "members add customers"    on customers for insert with check (is_member(business_id));
create policy "members edit customers"   on customers for update using (is_member(business_id)) with check (is_member(business_id));
create policy "managers delete customers" on customers for delete using (is_manager(business_id));

create policy "members read sales"       on sales for select using (is_member(business_id));
create policy "owner deletes sales"      on sales for delete using (my_role(business_id) = 'owner');
create policy "members read sale items"  on sale_items for select using (is_member(business_id));
create policy "members read payments"    on payments for select using (is_member(business_id));

create policy "managers read expenses"   on expenses for select using (is_manager(business_id));
create policy "managers write expenses"  on expenses for all using (is_manager(business_id)) with check (is_manager(business_id));

create policy "members read mpesa"       on mpesa_requests for select using (is_member(business_id));

-- ---------------------------------------------------------------- functions the app calls

-- First sign-in: create the business and make the caller its owner.
create or replace function create_business(p_name text, p_owner_name text, p_location text default '', p_phone text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare b uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if exists (select 1 from members where user_id = auth.uid()) then
    raise exception 'You already belong to a business';
  end if;
  insert into businesses(name, location, phone) values (p_name, p_location, p_phone) returning id into b;
  insert into members(business_id, user_id, role, name, phone) values (b, auth.uid(), 'owner', p_owner_name, p_phone);
  return b;
end $$;

-- Record a sale in one transaction. Prices come from the products table, not the browser.
-- p_items: [{"product_id": uuid, "qty": int}], p_payments: [{"method": "mpesa"|"cash", "amount": number, "ref": text}]
-- p_await_mpesa: the balance will be paid by an M-Pesa prompt sent right after, so no customer is needed.
create or replace function record_sale(p_business uuid, p_items jsonb, p_payments jsonb default '[]',
                                       p_customer uuid default null, p_day date default current_date,
                                       p_await_mpesa boolean default false)
returns sales language plpgsql security definer set search_path = public as $$
declare
  s sales;
  it jsonb;
  pr products;
  v_total numeric(12,2) := 0;
  v_paid numeric(12,2) := 0;
  v_staff text;
  v_cust text := '';
begin
  if not is_member(p_business) then raise exception 'Not allowed'; end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'The order is empty'; end if;
  if p_day <> current_date and not is_manager(p_business) then
    raise exception 'Only a manager can record sales for another day';
  end if;

  select name into v_staff from members where business_id = p_business and user_id = auth.uid();
  if p_customer is not null then
    select name into v_cust from customers where id = p_customer and business_id = p_business;
    if not found then raise exception 'Unknown customer'; end if;
  end if;

  insert into sales(business_id, day, total, customer_id, customer_name, staff_id, staff_name)
  values (p_business, p_day, 0, p_customer, v_cust, auth.uid(), coalesce(v_staff, '')) returning * into s;

  for it in select * from jsonb_array_elements(p_items) loop
    select * into pr from products where id = (it->>'product_id')::uuid and business_id = p_business;
    if not found then raise exception 'Unknown product'; end if;
    if (it->>'qty')::int <= 0 then raise exception 'Quantity must be at least 1'; end if;
    insert into sale_items(sale_id, business_id, product_id, name, qty, price, buy_price)
    values (s.id, p_business, pr.id, pr.name, (it->>'qty')::int, pr.sell_price, pr.buy_price);
    v_total := v_total + pr.sell_price * (it->>'qty')::int;
  end loop;

  for it in select * from jsonb_array_elements(p_payments) loop
    if (it->>'amount')::numeric > 0 then
      insert into payments(sale_id, business_id, method, amount, mpesa_receipt, created_by)
      values (s.id, p_business, it->>'method', (it->>'amount')::numeric, upper(coalesce(it->>'ref', '')), auth.uid());
      v_paid := v_paid + (it->>'amount')::numeric;
    end if;
  end loop;

  if v_paid > v_total then raise exception 'Payments add up to more than the total'; end if;
  if v_paid < v_total and p_customer is null and not p_await_mpesa then
    raise exception 'Choose a customer for an unpaid balance';
  end if;

  update sales set total = v_total where id = s.id returning * into s;
  return s;
end $$;

-- Pay off part or all of a bill.
create or replace function add_payment(p_sale uuid, p_method text, p_amount numeric, p_ref text default '')
returns payments language plpgsql security definer set search_path = public as $$
declare s sales; bal numeric; p payments;
begin
  select * into s from sales where id = p_sale;
  if not found or not is_member(s.business_id) then raise exception 'Not allowed'; end if;
  select balance into bal from sale_balances where sale_id = p_sale;
  if p_amount <= 0 or p_amount > bal then raise exception 'Amount must be between 1 and the balance (%)', bal; end if;
  insert into payments(sale_id, business_id, method, amount, mpesa_receipt, created_by)
  values (p_sale, s.business_id, p_method, p_amount, upper(coalesce(p_ref, '')), auth.uid()) returning * into p;
  return p;
end $$;

grant execute on function create_business(text, text, text, text) to authenticated;
grant execute on function record_sale(uuid, jsonb, jsonb, uuid, date, boolean) to authenticated;
grant execute on function add_payment(uuid, text, numeric, text) to authenticated;

-- Stock for each product on one day: opening, added, removed, sold, closing.
-- Pass '9999-12-31' to get what is on hand right now (closing).
create or replace function stock_on_day(p_business uuid, p_day date)
returns table(product_id uuid, opening integer, added integer, removed integer, sold integer, closing integer)
language sql stable security invoker set search_path = public as $$
  with mv as (
    select m.product_id,
           sum(case when m.kind = 'add' then m.qty else -m.qty end) filter (where m.day <= p_day) as net_to,
           sum(m.qty) filter (where m.day = p_day and m.kind = 'add') as add_d,
           sum(m.qty) filter (where m.day = p_day and m.kind = 'remove') as rem_d
    from stock_moves m where m.business_id = p_business group by m.product_id
  ), sd as (
    select i.product_id,
           sum(i.qty) filter (where s.day <= p_day) as sold_to,
           sum(i.qty) filter (where s.day = p_day) as sold_d
    from sale_items i join sales s on s.id = i.sale_id
    where i.business_id = p_business group by i.product_id
  )
  select p.id,
         (coalesce(mv.net_to,0) - coalesce(sd.sold_to,0) - coalesce(mv.add_d,0) + coalesce(mv.rem_d,0) + coalesce(sd.sold_d,0))::int,
         coalesce(mv.add_d,0)::int, coalesce(mv.rem_d,0)::int, coalesce(sd.sold_d,0)::int,
         (coalesce(mv.net_to,0) - coalesce(sd.sold_to,0))::int
  from products p
  left join mv on mv.product_id = p.id
  left join sd on sd.product_id = p.id
  where p.business_id = p_business
$$;
grant execute on function stock_on_day(uuid, date) to authenticated;

-- Visits, money paid and money owed per customer.
create view customer_stats with (security_invoker = true) as
  select c.id as customer_id, c.business_id,
         count(s.id)::int as visits,
         coalesce(sum(b.paid), 0)::numeric(12,2) as spent,
         coalesce(sum(greatest(b.balance, 0)), 0)::numeric(12,2) as owed
  from customers c
  left join sales s on s.customer_id = c.id
  left join sale_balances b on b.sale_id = s.id
  group by c.id;
