-- Permisos de tabla. Supabase ya no los concede automáticamente a tablas nuevas;
-- las políticas RLS de schema.sql siguen decidiendo qué filas ve cada quien.

grant usage on schema public to anon, authenticated;

grant select on categories, products, combos, combo_items, delivery_zones, promotions to anon;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
