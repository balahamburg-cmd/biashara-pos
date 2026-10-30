// Checks the database rules and functions against an in-process Postgres (PGlite).
// Run with: npm run test:db
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
const db = new PGlite();
const sql = fs.readFileSync(new URL("../migrations/0001_init.sql", import.meta.url), "utf8");
await db.exec(`
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create role authenticated;
create role anon;
`);
await db.exec(sql);
await db.exec(`grant usage on schema public to authenticated; grant all on all tables in schema public to authenticated; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
const O="00000000-0000-0000-0000-00000000000a", C="00000000-0000-0000-0000-00000000000c", X="00000000-0000-0000-0000-00000000000f";
await db.exec(`insert into auth.users values ('${O}'),('${C}'),('${X}')`);
const as = async (uid, q, params=[]) => { await db.exec(`reset role; select set_config('test.uid','${uid}',false); set role authenticated;`); try { return await db.query(q, params); } finally { await db.exec("reset role"); } };
let ok=0, bad=0; const t=async(name, fn)=>{try{await fn();console.log("PASS",name);ok++}catch(e){console.log("FAIL",name,e.message);bad++}};
const expectErr=async(p,re)=>{try{await p}catch(e){if(re&&!re.test(e.message))throw new Error("wrong error: "+e.message);return}throw new Error("expected an error")};

let B;
await t("owner creates business", async()=>{ B=(await as(O,"select create_business('Cafe','Owner') as id")).rows[0].id; });
await t("cannot create a second business", ()=>expectErr(as(O,"select create_business('X','Y')"),/already/));
// cashier membership is created by the server route with the service role
await db.query("insert into members(business_id,user_id,role,name) values($1,$2,'cashier','Cash')",[B,C]);
let P1,P2;
await t("owner adds products", async()=>{ P1=(await as(O,"insert into products(business_id,name,sell_price,buy_price) values($1,'Chai',40,15) returning id",[B])).rows[0].id; P2=(await as(O,"insert into products(business_id,name,sell_price) values($1,'Juice',150) returning id",[B])).rows[0].id; });
await t("cashier cannot add products", ()=>expectErr(as(C,"insert into products(business_id,name,sell_price) values($1,'Hack',1)",[B]),/row-level security/));
await t("owner adds stock", ()=>as(O,"insert into stock_moves(business_id,product_id,kind,qty,created_by) values($1,$2,'add',50,$3)",[B,P1,O]));
await t("cashier cannot add stock", ()=>expectErr(as(C,"insert into stock_moves(business_id,product_id,kind,qty,created_by) values($1,$2,'add',5,$3)",[B,P1,C]),/row-level security/));
let S;
await t("cashier records a paid sale, price from DB", async()=>{ const r=(await as(C,`select * from record_sale($1, $2::jsonb, $3::jsonb)`,[B,JSON.stringify([{product_id:P1,qty:3},{product_id:P2,qty:1}]),JSON.stringify([{method:"mpesa",amount:270,ref:"abc123"}])])).rows[0]; if(Number(r.total)!==270) throw new Error("total "+r.total); if(r.staff_name!=="Cash") throw new Error("staff "+r.staff_name); S=r.id; });
await t("sale balance is zero", async()=>{ const r=(await as(C,"select balance from sale_balances where sale_id=$1",[S])).rows[0]; if(Number(r.balance)!==0) throw new Error(r.balance); });
await t("unpaid walk-in sale rejected", ()=>expectErr(as(C,`select * from record_sale($1,$2::jsonb,'[]'::jsonb)`,[B,JSON.stringify([{product_id:P1,qty:1}])]),/customer/));
await t("overpayment rejected", ()=>expectErr(as(C,`select * from record_sale($1,$2::jsonb,$3::jsonb)`,[B,JSON.stringify([{product_id:P1,qty:1}]),JSON.stringify([{method:"cash",amount:100}])]),/more than/));
await t("cashier cannot backdate a sale", ()=>expectErr(as(C,`select * from record_sale($1,$2::jsonb,'[]'::jsonb,null,'2020-01-01')`,[B,JSON.stringify([{product_id:P1,qty:1}])]),/manager/));
let S2;
await t("await-mpesa sale allowed without customer", async()=>{ S2=(await as(C,`select * from record_sale($1,$2::jsonb,'[]'::jsonb,null,current_date,true)`,[B,JSON.stringify([{product_id:P1,qty:2}])])).rows[0].id; });
await t("partial payment then full", async()=>{ await as(C,"select add_payment($1,'cash',30)",[S2]); await expectErr(as(C,"select add_payment($1,'cash',100)",[S2]),/balance/); await as(C,"select add_payment($1,'mpesa',50,'qwe')",[S2]); const r=(await as(C,"select balance from sale_balances where sale_id=$1",[S2])).rows[0]; if(Number(r.balance)!==0) throw new Error(r.balance); });
await t("stock_on_day: 50 - 3 - 2 = 45", async()=>{ const r=(await as(C,"select * from stock_on_day($1,'9999-12-31') where product_id=$2",[B,P1])).rows[0]; if(r.closing!==45) throw new Error(JSON.stringify(r)); });
await t("stock_on_day today shows opening/added/sold", async()=>{ const r=(await as(C,"select * from stock_on_day($1,current_date) where product_id=$2",[B,P1])).rows[0]; if(r.opening!==0||r.added!==50||r.sold!==5||r.closing!==45) throw new Error(JSON.stringify(r)); });
await t("cashier cannot read expenses", async()=>{ await as(O,"insert into expenses(business_id,name,amount) values($1,'Rent',1000)",[B]); const r=await as(C,"select * from expenses"); if(r.rows.length) throw new Error("saw "+r.rows.length); });
await t("cashier cannot insert sales directly", ()=>expectErr(as(C,"insert into sales(business_id,total) values($1,0)",[B]),/row-level security/));
await t("cashier cannot insert payments directly", ()=>expectErr(as(C,"insert into payments(sale_id,business_id,method,amount) values($1,$2,'cash',5)",[S,B]),/row-level security/));
await t("cashier cannot promote self", async()=>{ await as(C,"update members set role='owner' where user_id=$1",[C]); const r=(await db.query("select role from members where user_id=$1",[C])).rows[0]; if(r.role!=="cashier") throw new Error(r.role); });
await t("outsider sees nothing", async()=>{ for(const tb of ["businesses","products","sales","payments","customers","members"]){ const r=await as(X,`select * from ${tb}`); if(r.rows.length) throw new Error(tb+" "+r.rows.length);} });
await t("outsider cannot record sale", ()=>expectErr(as(X,`select * from record_sale($1,$2::jsonb)`,[B,JSON.stringify([{product_id:P1,qty:1}])]),/Not allowed/));
await t("outsider cannot pay", ()=>expectErr(as(X,"select add_payment($1,'cash',1)",[S2]),/Not allowed/));
await t("customer_stats", async()=>{ const c=(await as(C,"insert into customers(business_id,name) values($1,'Joe') returning id",[B])).rows[0].id; await as(C,`select * from record_sale($1,$2::jsonb,'[]'::jsonb,$3)`,[B,JSON.stringify([{product_id:P2,qty:1}]),c]); const r=(await as(C,"select * from customer_stats where customer_id=$1",[c])).rows[0]; if(r.visits!==1||Number(r.owed)!==150) throw new Error(JSON.stringify(r)); });
await t("manager-level: owner cannot be deactivated by cashier", async()=>{ await as(C,"update members set active=false where user_id=$1",[O]); const r=(await db.query("select active from members where user_id=$1",[O])).rows[0]; if(!r.active) throw new Error("deactivated"); });
console.log(`${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
