-- Permisos de tabla para una instalación nueva (después de schema.sql).
-- products.cost no se concede. min_stock se puede actualizar, no leer por columna:
-- el panel lo recibe en admin_list_products(business_id).
-- order_items.unit_cost no se concede. La ganancia sale de admin_sales_report.
-- business_domains no se concede a anon. El público usa public_store_by_domain.
-- status, plan, paid_until, trial_ends_at y template se pueden actualizar,
-- pero un trigger rechaza el cambio si quien escribe no es superadmin.
-- payments y platform_audit_log solo los usa el superadmin.

grant usage on schema public to anon, authenticated;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function gen_random_uuid() to anon, authenticated;

grant select (id, slug, name, logo_url, brand_color, whatsapp_number, timezone, status)
  on businesses to anon;
grant select (id, slug, name, logo_url, brand_color, whatsapp_number, timezone, status, plan, trial_ends_at, paid_until, template, created_at)
  on businesses to authenticated;
grant insert (slug, name, logo_url, brand_color, whatsapp_number, timezone, status, plan, trial_ends_at, paid_until, template)
  on businesses to authenticated;
grant update (name, logo_url, brand_color, whatsapp_number, timezone, status, plan, trial_ends_at, paid_until, template)
  on businesses to authenticated;
grant delete on businesses to authenticated;

grant select on business_settings to anon, authenticated;
grant insert (business_id, age_verification, tobacco_rules, delivery, opening_hours, appointments)
  on business_settings to authenticated;
grant update (age_verification, tobacco_rules, delivery, opening_hours, appointments, sale_margin_percent)
  on business_settings to authenticated;

grant select, insert, update, delete on business_members to authenticated;
grant select on platform_admins to authenticated;

grant select on categories, combos, combo_items, delivery_zones, promotions to anon, authenticated;
grant select (id, business_id, category_id, name, description, price, stock, image_url, active, kind, duration_minutes)
  on products to anon;
grant select (id, business_id, category_id, name, description, price, stock, image_url, active, kind, duration_minutes, created_at)
  on products to authenticated;

grant insert, update, delete on categories to authenticated;
grant insert (business_id, category_id, name, description, price, stock, image_url, active, kind, duration_minutes, master_product_id, barcode),
      update (category_id, name, description, price, stock, image_url, active, kind, duration_minutes, min_stock, master_product_id, barcode),
      delete on products to authenticated;
grant insert, update, delete on combos, combo_items, delivery_zones, promotions to authenticated;
grant select, insert, update, delete on customers, orders, inventory_movements to authenticated;
grant select (id, business_id, order_id, product_id, combo_id, name, unit_price, quantity),
      insert (business_id, order_id, product_id, combo_id, name, unit_price, quantity),
      update (order_id, product_id, combo_id, name, unit_price, quantity),
      delete on order_items to authenticated;
grant select, insert, update, delete on business_domains to authenticated;

revoke all on platform_settings, payments, platform_audit_log from anon, authenticated;
grant select, update on platform_settings to authenticated;
grant select, insert on payments to authenticated;
grant select, insert on platform_audit_log to authenticated;

grant usage, select on all sequences in schema public to authenticated;

grant execute on function is_member(uuid), is_owner(uuid), is_platform_admin(), business_is_open(uuid), business_accepts_orders(uuid), storage_object_business(text), domain_is_valid(text), public_store(text), public_store_by_domain(text)
  to anon, authenticated;
grant execute on function past_due_grace_days() to authenticated;

revoke all on function platform_business_overview() from public, anon, authenticated;
grant execute on function platform_business_overview() to authenticated;

revoke all on function next_order_number(uuid) from public, anon, authenticated;
revoke all on function create_order(uuid, text, text, text, int, payment_method, boolean, jsonb, text, boolean) from public;
grant execute on function create_order(uuid, text, text, text, int, payment_method, boolean, jsonb, text, boolean)
  to anon, authenticated;

revoke all on function admin_list_products(uuid) from public, anon, authenticated;
revoke all on function admin_set_product_private(uuid, uuid, int, int) from public, anon, authenticated;
revoke all on function admin_sales_report(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function admin_list_products(uuid) to authenticated;
grant execute on function admin_set_product_private(uuid, uuid, int, int) to authenticated;
grant execute on function admin_sales_report(uuid, timestamptz, timestamptz) to authenticated;

grant execute on function reject_cross_business(), apply_inventory_movement(), discount_stock_on_delivery(), protect_last_owner(), reject_billing_change()
  to anon, authenticated;
grant execute on function next_order_number(uuid) to postgres;

grant select, update on agenda_settings to authenticated;
grant insert (business_id, address, buffer_minutes, min_notice_minutes, max_horizon_days, slot_minutes, cancel_notice_hours, online_status, max_future_per_phone)
  on agenda_settings to authenticated;
grant select, insert, update, delete on professionals, professional_services, professional_hours, professional_blocks, appointments to authenticated;

revoke all on function next_appointment_number(uuid) from public, anon, authenticated;
revoke all on function agenda_slot_is_free(uuid, timestamptz, timestamptz, int, uuid) from public, anon, authenticated;
revoke all on function agenda_within_hours(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function get_availability(uuid, uuid, uuid, date) from public, anon, authenticated;
revoke all on function book_appointment(uuid, uuid, uuid, timestamptz, text, text, text, text) from public, anon, authenticated;
revoke all on function move_appointment(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public_appointment_by_token(text) from public, anon, authenticated;
revoke all on function cancel_appointment_by_token(text) from public, anon, authenticated;
revoke all on function public_agenda(text) from public, anon, authenticated;
revoke all on function admin_appointment_report(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function get_availability(uuid, uuid, uuid, date) to anon, authenticated;
grant execute on function book_appointment(uuid, uuid, uuid, timestamptz, text, text, text, text) to anon, authenticated;
grant execute on function public_appointment_by_token(text), cancel_appointment_by_token(text), public_agenda(text)
  to anon, authenticated;
grant execute on function move_appointment(uuid, timestamptz), admin_appointment_report(uuid, timestamptz, timestamptz)
  to authenticated;
grant execute on function reject_agenda_mix(), reject_order_on_agenda(), protect_appointment_price(), protect_service_price(), guard_appointment()
  to anon, authenticated;
grant execute on function next_appointment_number(uuid) to postgres;

grant select on master_products to authenticated;
grant insert, update on master_products to authenticated;
grant select, insert, update on import_jobs to authenticated;
grant select on ai_usage to authenticated;

revoke all on function master_products_search_text() from public, anon, authenticated;
revoke all on function search_master_products(text, text, boolean) from public, anon, authenticated;
revoke all on function match_catalog_lines(uuid, jsonb) from public, anon, authenticated;
revoke all on function add_products_from_master(uuid, jsonb) from public, anon, authenticated;
revoke all on function confirm_catalog_import(uuid, jsonb) from public, anon, authenticated;
revoke all on function ai_daily_limit(uuid) from public, anon, authenticated;
revoke all on function ai_reads_today(uuid) from public, anon, authenticated;
revoke all on function record_ai_usage(uuid, int) from public, anon, authenticated;
revoke all on function reserve_ai_read(uuid, int) from public, anon, authenticated;
revoke all on function settle_ai_read(uuid, int) from public, anon, authenticated;
revoke all on function release_ai_read(uuid) from public, anon, authenticated;
revoke all on function platform_ai_usage() from public, anon, authenticated;
revoke all on function purge_expired_imports() from public, anon, authenticated;
revoke all on function strip_import_costs() from public, anon, authenticated;
grant execute on function search_master_products(text, text, boolean) to authenticated;
grant execute on function match_catalog_lines(uuid, jsonb) to authenticated;
grant execute on function add_products_from_master(uuid, jsonb) to authenticated;
grant execute on function confirm_catalog_import(uuid, jsonb) to authenticated;
grant execute on function ai_daily_limit(uuid), ai_reads_today(uuid) to authenticated;
grant execute on function reserve_ai_read(uuid, int) to authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function settle_ai_read(uuid, int), release_ai_read(uuid) to service_role;
  end if;
end $$;
grant execute on function platform_ai_usage() to authenticated;
grant execute on function strip_import_costs() to authenticated;

grant select on storage.objects to anon, authenticated;
grant insert, update, delete on storage.objects to authenticated;
