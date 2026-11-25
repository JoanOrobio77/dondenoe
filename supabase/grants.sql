-- Permisos de tabla. Supabase ya no los concede automáticamente a tablas nuevas;
-- las políticas RLS de schema.sql siguen decidiendo qué filas ve cada quien.
-- products.cost y products.min_stock no se conceden: el panel usa
-- admin_list_products() y admin_set_product_private(), que exigen is_admin().

grant usage on schema public to anon, authenticated;

revoke all on all tables in schema public from anon, authenticated;

grant select on categories, combos, combo_items, delivery_zones, promotions to anon, authenticated;
grant select (id, category_id, name, description, price, stock, image_url, active) on products to anon;
grant select (id, category_id, name, description, price, stock, image_url, active, created_at) on products to authenticated;

grant insert, update, delete on categories to authenticated;
grant insert (category_id, name, description, price, stock, image_url, active),
      update (category_id, name, description, price, stock, image_url, active),
      delete on products to authenticated;
grant insert, update, delete on combos, combo_items, delivery_zones, promotions to authenticated;
grant select, insert, update, delete on customers, orders, order_items, inventory_movements to authenticated;

revoke insert, update, delete, truncate on admins from anon, authenticated;
grant select on admins to authenticated;

grant usage, select on all sequences in schema public to authenticated;

revoke all on function create_order(text, text, text, int, payment_method, boolean, jsonb, text, boolean) from public;
grant execute on function create_order(text, text, text, int, payment_method, boolean, jsonb, text, boolean) to anon, authenticated;

revoke all on function admin_list_products() from public, anon, authenticated;
revoke all on function admin_set_product_private(uuid, int, int) from public, anon, authenticated;
grant execute on function admin_list_products() to authenticated;
grant execute on function admin_set_product_private(uuid, int, int) to authenticated;
