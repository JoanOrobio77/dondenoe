-- Permisos de tabla. Supabase ya no los concede automáticamente a tablas nuevas;
-- las políticas RLS de schema.sql siguen decidiendo qué filas ve cada quien.

grant usage on schema public to anon, authenticated;

grant select on categories, combos, combo_items, delivery_zones, promotions to anon;
-- Sin "cost" ni "min_stock": el costo de compra es privado de Noe.
grant select (id, category_id, name, description, price, stock, image_url, active) on products to anon;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
