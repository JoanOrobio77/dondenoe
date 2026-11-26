-- Permisos de tabla para una instalación nueva (después de schema.sql).
-- products.cost y products.min_stock no se conceden.
-- El panel usa admin_list_products(business_id) y admin_set_product_private(...).

grant usage on schema public to anon, authenticated;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function gen_random_uuid() to anon, authenticated;

grant select (id, slug, name, logo_url, brand_color, whatsapp_number, timezone, status)
  on businesses to anon;
grant select (id, slug, name, logo_url, brand_color, whatsapp_number, timezone, status, plan, trial_ends_at, paid_until, created_at)
  on businesses to authenticated;
grant update (name, logo_url, brand_color, whatsapp_number) on businesses to authenticated;

grant select on business_settings to anon, authenticated;
grant update (age_verification, tobacco_rules, delivery, opening_hours, appointments)
  on business_settings to authenticated;

grant select, insert, update, delete on business_members to authenticated;
grant select on platform_admins to authenticated;

grant select on categories, combos, combo_items, delivery_zones, promotions to anon, authenticated;
grant select (id, business_id, category_id, name, description, price, stock, image_url, active, kind, duration_minutes)
  on products to anon;
grant select (id, business_id, category_id, name, description, price, stock, image_url, active, kind, duration_minutes, created_at)
  on products to authenticated;

grant insert, update, delete on categories to authenticated;
grant insert (business_id, category_id, name, description, price, stock, image_url, active, kind, duration_minutes),
      update (category_id, name, description, price, stock, image_url, active, kind, duration_minutes),
      delete on products to authenticated;
grant insert, update, delete on combos, combo_items, delivery_zones, promotions to authenticated;
grant select, insert, update, delete on customers, orders, order_items, inventory_movements to authenticated;

grant usage, select on all sequences in schema public to authenticated;

grant execute on function is_member(uuid), is_owner(uuid), is_platform_admin(), business_is_open(uuid), storage_object_business(text), public_store(text)
  to anon, authenticated;

revoke all on function next_order_number(uuid) from public, anon, authenticated;
revoke all on function create_order(uuid, text, text, text, int, payment_method, boolean, jsonb, text, boolean) from public;
grant execute on function create_order(uuid, text, text, text, int, payment_method, boolean, jsonb, text, boolean)
  to anon, authenticated;

revoke all on function admin_list_products(uuid) from public, anon, authenticated;
revoke all on function admin_set_product_private(uuid, uuid, int, int) from public, anon, authenticated;
grant execute on function admin_list_products(uuid) to authenticated;
grant execute on function admin_set_product_private(uuid, uuid, int, int) to authenticated;

grant execute on function reject_cross_business(), apply_inventory_movement(), discount_stock_on_delivery()
  to anon, authenticated;
grant execute on function next_order_number(uuid) to postgres;

grant select on storage.objects to anon, authenticated;
grant insert, update, delete on storage.objects to authenticated;
