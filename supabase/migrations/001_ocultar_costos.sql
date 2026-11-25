-- Ejecutar una vez si ya corriste la primera versión de grants.sql.
revoke select on products from anon;
grant select (id, category_id, name, description, price, stock, image_url, active) on products to anon;
