-- Barcodes so a Bluetooth or USB scanner can add products to an order.
alter table products add column barcode text not null default '';
create unique index products_business_barcode_idx on products(business_id, barcode) where barcode <> '';
