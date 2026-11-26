-- Datos de ejemplo de DondeNoe. Ejecutar después de schema.sql y grants.sql.
-- Reemplazar por los productos y precios reales de Noe antes de cobrar en serio.

insert into businesses (slug, name, brand_color, whatsapp_number, timezone, status, plan)
values ('dondenoe', 'DondeNoe', '#0b4a56', '573128540710', 'America/Bogota', 'active', 'completo');

insert into business_settings (business_id, age_verification, tobacco_rules, delivery, opening_hours, appointments)
select id, true, true, true,
  '{
    "mon": {"open": "11:00", "close": "22:00"},
    "tue": {"open": "11:00", "close": "22:00"},
    "wed": {"open": "11:00", "close": "22:00"},
    "thu": {"open": "11:00", "close": "22:00"},
    "fri": {"open": "11:00", "close": "22:00"},
    "sat": {"open": "11:00", "close": "22:00"},
    "sun": {"open": "11:00", "close": "22:00"}
  }'::jsonb,
  false
from businesses
where slug = 'dondenoe';

insert into categories (business_id, name, slug, sort_order, allows_promotion)
select b.id, c.name, c.slug, c.sort_order, c.allows_promotion
from businesses b
cross join (values
  ('Licores', 'licores', 1, true),
  ('Cervezas', 'cervezas', 2, true),
  ('Mezcladores y hielo', 'mezcladores', 3, true),
  ('Snacks', 'snacks', 4, true),
  ('Cigarrillos', 'cigarrillos', 5, false)
) as c(name, slug, sort_order, allows_promotion)
where b.slug = 'dondenoe';

insert into products (business_id, category_id, name, description, price, cost, stock, min_stock, kind)
select c.business_id, c.id, p.name, p.description, p.price, p.cost, p.stock, p.min_stock, 'product'
from (values
  ('licores', 'Aguardiente Antioqueño 750 ml', 'Tapa azul, sin azúcar', 65000, 48000, 24, 6),
  ('licores', 'Aguardiente Antioqueño 375 ml', 'Media', 35000, 26000, 30, 8),
  ('licores', 'Ron Medellín 3 años 750 ml', 'Añejo', 70000, 52000, 18, 5),
  ('licores', 'Old Parr 12 años 750 ml', 'Whisky escocés', 160000, 125000, 6, 2),
  ('licores', 'Tequila José Cuervo 750 ml', 'Reposado', 110000, 85000, 8, 2),
  ('cervezas', 'Águila lata 330 ml', 'Unidad', 3500, 2400, 120, 36),
  ('cervezas', 'Club Colombia Dorada lata 330 ml', 'Unidad', 4000, 2800, 96, 24),
  ('cervezas', 'Poker six-pack', '6 latas de 330 ml', 18000, 13500, 20, 6),
  ('mezcladores', 'Hielo bolsa 2 kg', 'Hielo en cubos', 4000, 1800, 40, 10),
  ('mezcladores', 'Coca-Cola 1,5 L', 'Botella', 6500, 4500, 36, 10),
  ('mezcladores', 'Ginger Canada Dry 400 ml', 'Botella', 4000, 2600, 24, 6),
  ('mezcladores', 'Agua Cristal 600 ml', 'Botella', 2500, 1300, 48, 12),
  ('snacks', 'Papas Margarita 105 g', 'Pollo o natural', 6000, 4200, 30, 8),
  ('snacks', 'Maní La Especial 180 g', 'Mezcla de maní', 5500, 3800, 25, 6),
  ('snacks', 'Chicles Trident', 'Paquete', 2000, 1200, 40, 10),
  ('cigarrillos', 'Marlboro Rojo cajetilla x20', null, 11000, 9300, 30, 10),
  ('cigarrillos', 'Lucky Strike cajetilla x20', null, 10000, 8400, 30, 10)
) as p(category_slug, name, description, price, cost, stock, min_stock)
join categories c on c.slug = p.category_slug
join businesses b on b.id = c.business_id and b.slug = 'dondenoe';

insert into combos (business_id, name, description, price)
select b.id, c.name, c.description, c.price
from businesses b
cross join (values
  ('Plan Parche', 'Aguardiente 750 ml + hielo + 2 Coca-Cola 1,5 L', 78000),
  ('Plan Rumba', 'Ron Medellín 750 ml + hielo + 2 Coca-Cola 1,5 L + 2 papas', 85000),
  ('Plan Cervecero', '2 six-pack Poker + hielo + 2 maní', 49000)
) as c(name, description, price)
where b.slug = 'dondenoe';

insert into combo_items (business_id, combo_id, product_id, quantity)
select c.business_id, c.id, p.id, i.quantity
from (values
  ('Plan Parche', 'Aguardiente Antioqueño 750 ml', 1),
  ('Plan Parche', 'Hielo bolsa 2 kg', 1),
  ('Plan Parche', 'Coca-Cola 1,5 L', 2),
  ('Plan Rumba', 'Ron Medellín 3 años 750 ml', 1),
  ('Plan Rumba', 'Hielo bolsa 2 kg', 1),
  ('Plan Rumba', 'Coca-Cola 1,5 L', 2),
  ('Plan Rumba', 'Papas Margarita 105 g', 2),
  ('Plan Cervecero', 'Poker six-pack', 2),
  ('Plan Cervecero', 'Hielo bolsa 2 kg', 1),
  ('Plan Cervecero', 'Maní La Especial 180 g', 2)
) as i(combo_name, product_name, quantity)
join combos c on c.name = i.combo_name
join products p on p.name = i.product_name and p.business_id = c.business_id
join businesses b on b.id = c.business_id and b.slug = 'dondenoe';

insert into delivery_zones (business_id, name, fee)
select id, zone.name, zone.fee
from businesses
cross join (values
  ('Mismo barrio', 3000),
  ('Barrios cercanos', 5000),
  ('Zona lejana', 8000)
) as zone(name, fee)
where slug = 'dondenoe';
