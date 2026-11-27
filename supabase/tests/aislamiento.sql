-- Pruebas de aislamiento. Correr en Postgres local, después de
-- preparar_local.sql, schema.sql, grants.sql y seed.sql.
-- No correr en producción: inserta usuarios de prueba y al final hace rollback.

begin;

create table test_fixture (
  user_a uuid not null,
  user_b uuid not null,
  user_staff uuid not null,
  user_platform uuid not null,
  biz_a uuid not null,
  biz_b uuid not null,
  biz_c uuid not null,
  cat_a int not null,
  cat_b int not null,
  product_a uuid not null,
  product_b uuid not null,
  service_a uuid not null
);
grant select on test_fixture to anon, authenticated;

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'a@test.local'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'b@test.local'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'staff@test.local'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'platform@test.local');

insert into businesses (id, slug, name, status) values
  ('11111111-1111-1111-1111-111111111111', 'estanco-a', 'Estanco A', 'active'),
  ('22222222-2222-2222-2222-222222222222', 'estanco-b', 'Estanco B', 'active'),
  ('33333333-3333-3333-3333-333333333333', 'estanco-c', 'Estanco C', 'suspended');

insert into business_settings (business_id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333333');

insert into business_members (business_id, user_id, role) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'owner'),
  ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'owner'),
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'staff');

insert into platform_admins (user_id) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4');

insert into categories (business_id, name, slug) values
  ('11111111-1111-1111-1111-111111111111', 'General A', 'general-a'),
  ('22222222-2222-2222-2222-222222222222', 'General B', 'general-b'),
  ('33333333-3333-3333-3333-333333333333', 'General C', 'general-c');

insert into products (id, business_id, category_id, name, price, stock, kind)
select 'aaaaaaaa-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', c.id, 'Producto A', 1000, 5, 'product'
from categories c where c.business_id = '11111111-1111-1111-1111-111111111111';

insert into products (id, business_id, category_id, name, price, stock, kind)
select 'bbbbbbbb-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', c.id, 'Producto B', 2000, 5, 'product'
from categories c where c.business_id = '22222222-2222-2222-2222-222222222222';

insert into products (id, business_id, category_id, name, price, stock, kind)
select 'cccccccc-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', c.id, 'Producto C', 3000, 5, 'product'
from categories c where c.business_id = '33333333-3333-3333-3333-333333333333';

insert into products (id, business_id, category_id, name, price, stock, kind, duration_minutes)
select 'aaaaaaaa-1111-1111-1111-111111111112', '11111111-1111-1111-1111-111111111111', c.id, 'Servicio A', 4000, 0, 'service', 30
from categories c where c.business_id = '11111111-1111-1111-1111-111111111111';

insert into customers (id, business_id, name, phone) values
  ('bbbbbbbb-2222-2222-2222-222222222223', '22222222-2222-2222-2222-222222222222', 'Cliente B', '3000000002');

insert into orders (
  id, business_id, number, customer_id, address, subtotal, total, payment_method, age_confirmed, status
) values (
  'bbbbbbbb-2222-2222-2222-222222222224',
  '22222222-2222-2222-2222-222222222222',
  7,
  'bbbbbbbb-2222-2222-2222-222222222223',
  'Calle B',
  2000,
  2000,
  'efectivo',
  true,
  'nuevo'
);

insert into test_fixture values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4',
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
  (select id from categories where business_id = '11111111-1111-1111-1111-111111111111' and slug = 'general-a'),
  (select id from categories where business_id = '22222222-2222-2222-2222-222222222222' and slug = 'general-b'),
  'aaaaaaaa-1111-1111-1111-111111111111',
  'bbbbbbbb-2222-2222-2222-222222222222',
  'aaaaaaaa-1111-1111-1111-111111111112'
);

-- Miembro de A no lee datos de B.
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', true);
set local role authenticated;

do $$
declare
  n int;
  f test_fixture%rowtype;
begin
  select * into f from test_fixture;
  select count(*) into n from products where business_id = f.biz_b;
  if n <> 0 then raise exception 'FALLO: A leyó productos de B'; end if;
  select count(*) into n from categories where business_id = f.biz_b;
  if n <> 0 then raise exception 'FALLO: A leyó categorías de B'; end if;
  select count(*) into n from customers where business_id = f.biz_b;
  if n <> 0 then raise exception 'FALLO: A leyó clientes de B'; end if;
  select count(*) into n from orders where business_id = f.biz_b;
  if n <> 0 then raise exception 'FALLO: A leyó pedidos de B'; end if;
  select count(*) into n from business_settings where business_id = f.biz_b;
  if n <> 0 then raise exception 'FALLO: A leyó ajustes de B'; end if;
  select count(*) into n from businesses where id = f.biz_b;
  if n <> 0 then raise exception 'FALLO: A leyó el negocio B'; end if;

  update products set name = 'Hack' where id = f.product_b;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO: A modificó un producto de B'; end if;
  delete from products where id = f.product_b;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO: A borró un producto de B'; end if;
  delete from orders where business_id = f.biz_b;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO: A borró un pedido de B'; end if;
  update business_settings set delivery = false where business_id = f.biz_b;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO: A cambió ajustes de B'; end if;
end $$;

do $$
declare
  f test_fixture%rowtype;
begin
  select * into f from test_fixture;
  insert into products (business_id, category_id, name, price)
  values (f.biz_b, f.cat_b, 'Intruso', 1000);
  raise exception 'FALLO: A creó un producto en B';
exception
  when others then
    if sqlerrm like 'FALLO:%' then raise; end if;
end $$;

do $$
declare
  f test_fixture%rowtype;
begin
  select * into f from test_fixture;
  insert into storage.objects (bucket_id, name) values ('products', f.biz_b::text || '/hack.jpg');
  raise exception 'FALLO: A subió una foto en B';
exception
  when others then
    if sqlerrm like 'FALLO:%' then raise; end if;
end $$;

do $$
declare
  f test_fixture%rowtype;
begin
  select * into f from test_fixture;
  perform admin_set_product_private(f.biz_b, f.product_b, 1, 1);
  raise exception 'FALLO: A cambió el costo de B';
exception
  when others then
    if sqlerrm like 'FALLO:%' then raise; end if;
    if sqlerrm not like '%dueño%' and sqlerrm not like '%No autorizado%' then
      raise exception 'FALLO inesperado al cambiar costo de B: %', sqlerrm;
    end if;
end $$;

do $$
declare
  f test_fixture%rowtype;
  v_cost int;
begin
  select * into f from test_fixture;
  perform admin_set_product_private(f.biz_a, f.product_a, 15, 2);
  select cost into v_cost from admin_list_products(f.biz_a) where id = f.product_a;
  if v_cost is distinct from 15 then raise exception 'FALLO: el dueño no pudo guardar su costo'; end if;
end $$;

reset role;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', true);
set local role authenticated;

do $$
declare
  f test_fixture%rowtype;
begin
  select * into f from test_fixture;
  perform admin_set_product_private(f.biz_a, f.product_a, 99, 9);
  raise exception 'FALLO: un empleado cambió el costo';
exception
  when others then
    if sqlerrm like 'FALLO:%' then raise; end if;
    if sqlerrm not like '%dueño%' then
      raise exception 'FALLO inesperado con el empleado: %', sqlerrm;
    end if;
end $$;

reset role;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', true);
set local role authenticated;

do $$
declare
  n int;
  f test_fixture%rowtype;
begin
  select * into f from test_fixture;
  select count(*) into n from products where id = f.product_b;
  if n <> 1 then raise exception 'FALLO: el superadmin no pudo leer B'; end if;
  update products set name = 'Hack plataforma' where id = f.product_b;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO: el superadmin escribió en B'; end if;
end $$;

reset role;
set local role anon;

do $$
begin
  perform cost from products limit 1;
  raise exception 'FALLO: anon leyó el costo';
exception
  when insufficient_privilege then null;
  when others then
    if sqlerrm like 'FALLO:%' then raise; end if;
    raise exception 'FALLO inesperado al leer costo: %', sqlerrm;
end $$;

do $$
declare
  n int;
  f test_fixture%rowtype;
begin
  select * into f from test_fixture;
  select count(*) into n from products where id = f.product_b;
  if n <> 1 then raise exception 'FALLO: anon no ve el producto público de B'; end if;
  select count(*) into n from products where id = 'cccccccc-3333-3333-3333-333333333333';
  if n <> 0 then raise exception 'FALLO: anon ve productos de un negocio suspendido'; end if;
  perform id from orders limit 1;
  raise exception 'FALLO: anon leyó pedidos';
exception
  when insufficient_privilege then null;
  when others then
    if sqlerrm like 'FALLO:%' then raise; end if;
    raise exception 'FALLO inesperado en lectura anon: %', sqlerrm;
end $$;

do $$
declare
  f test_fixture%rowtype;
  v_number int;
begin
  select * into f from test_fixture;
  select order_number into v_number from create_order(
    f.biz_a, 'Ana', '3001112233', 'Calle 1', null, 'efectivo', true,
    jsonb_build_array(jsonb_build_object('type', 'product', 'id', f.product_b, 'quantity', 1)),
    null, false
  );
  raise exception 'FALLO: create_order aceptó un producto de otro negocio (%).', v_number;
exception
  when others then
    if sqlerrm like 'FALLO:%' then raise; end if;
    if sqlerrm not like '%ya no está disponible%' then
      raise exception 'FALLO inesperado en pedido cruzado: %', sqlerrm;
    end if;
end $$;

do $$
declare
  f test_fixture%rowtype;
begin
  select * into f from test_fixture;
  perform order_number from create_order(
    f.biz_c, 'Ana', '3001112233', 'Calle 1', null, 'efectivo', true,
    jsonb_build_array(jsonb_build_object('type', 'product', 'id', 'cccccccc-3333-3333-3333-333333333333', 'quantity', 1)),
    null, false
  );
  raise exception 'FALLO: un negocio suspendido recibió un pedido';
exception
  when others then
    if sqlerrm like 'FALLO:%' then raise; end if;
    if sqlerrm not like '%Tienda temporalmente no disponible%' then
      raise exception 'FALLO inesperado en negocio suspendido: %', sqlerrm;
    end if;
end $$;

do $$
declare
  f test_fixture%rowtype;
  v_product int;
  v_service int;
begin
  select * into f from test_fixture;
  select order_number into v_product from create_order(
    f.biz_a, 'Ana', '3001112233', 'Calle 1', null, 'efectivo', true,
    jsonb_build_array(jsonb_build_object('type', 'product', 'id', f.product_a, 'quantity', 1)),
    null, false
  );
  select order_number into v_service from create_order(
    f.biz_b, 'Beto', '3001112244', 'Calle 2', null, 'efectivo', true,
    jsonb_build_array(jsonb_build_object('type', 'product', 'id', f.product_b, 'quantity', 1)),
    null, false
  );
  if v_product <> 1 or v_service <> 1 then
    raise exception 'FALLO: la numeración por negocio no cuadra (% y %)', v_product, v_service;
  end if;
  perform order_number from create_order(
    f.biz_a, 'Ana', '3001112255', 'Calle 3', null, 'efectivo', true,
    jsonb_build_array(jsonb_build_object('type', 'product', 'id', f.service_a, 'quantity', 1)),
    null, false
  );
end $$;

reset role;

do $$
declare
  n int;
begin
  select count(*) into n from storage.objects where name like '%/hack.jpg';
  if n <> 0 then raise exception 'FALLO: quedó una foto cruzada'; end if;
  select count(*) into n from products where name = 'Intruso';
  if n <> 0 then raise exception 'FALLO: quedó un producto cruzado'; end if;
  select count(*) into n from orders
  where business_id = '11111111-1111-1111-1111-111111111111'
    and id in (
      select oi.order_id from order_items oi
      join products p on p.id = oi.product_id
      where p.business_id <> oi.business_id
    );
  if n <> 0 then raise exception 'FALLO: un pedido mezcló negocios'; end if;
  insert into order_items (business_id, order_id, product_id, name, unit_price, quantity)
  values (
    '11111111-1111-1111-1111-111111111111',
    (select id from orders where business_id = '11111111-1111-1111-1111-111111111111' limit 1),
    'bbbbbbbb-2222-2222-2222-222222222222',
    'Mezcla',
    1,
    1
  );
  raise exception 'FALLO: el trigger dejó mezclar un producto de otro negocio';
exception
  when others then
    if sqlerrm like 'FALLO:%' then raise; end if;
    if sqlerrm not like '%no pertenece%' then
      raise exception 'FALLO inesperado en el trigger: %', sqlerrm;
    end if;
end $$;

-- Costos, borrados y dominios.
update orders o
set status = 'entregado'
from order_items oi
where oi.order_id = o.id
  and oi.product_id = 'aaaaaaaa-1111-1111-1111-111111111111';

insert into products (id, business_id, category_id, name, price, cost, min_stock)
select 'aaaaaaaa-1111-1111-1111-111111111199', f.biz_a, f.cat_a, 'Desechable', 500, 100, 1
from test_fixture f;

insert into customers (id, business_id, name, phone)
select 'aaaaaaaa-1111-1111-1111-111111111198', f.biz_a, 'Cliente desechable', '3000000099'
from test_fixture f;

insert into orders (
  id, business_id, number, customer_id, address, subtotal, total, payment_method, age_confirmed, status
)
select
  'aaaaaaaa-1111-1111-1111-111111111197', f.biz_a, 99,
  'aaaaaaaa-1111-1111-1111-111111111198', 'Calle desechable', 500, 500, 'efectivo', true, 'nuevo'
from test_fixture f;

insert into delivery_zones (id, business_id, name, fee)
select 99001, f.biz_a, 'Zona desechable', 1000
from test_fixture f;

insert into business_domains (business_id, domain, verified)
select f.biz_a, 'pendiente.ejemplo.co', false from test_fixture f;

insert into business_domains (business_id, domain, verified)
select f.biz_c, 'cerrado.ejemplo.co', true from test_fixture f;

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', true);
set local role authenticated;

do $$
declare
  f test_fixture%rowtype;
  v_cost int;
  v_min int;
  n int;
begin
  select * into f from test_fixture;
  select cost, min_stock into v_cost, v_min
  from admin_list_products(f.biz_a)
  where id = f.product_a;
  if v_cost is not null then raise exception 'FALLO: el empleado vio el costo'; end if;
  if v_min is distinct from 2 then raise exception 'FALLO: el empleado no vio el stock mínimo'; end if;

  delete from products where id = 'aaaaaaaa-1111-1111-1111-111111111199';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO: el empleado borró un producto'; end if;
  delete from customers where id = 'aaaaaaaa-1111-1111-1111-111111111198';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO: el empleado borró un cliente'; end if;
  delete from orders where id = 'aaaaaaaa-1111-1111-1111-111111111197';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO: el empleado borró un pedido'; end if;
  delete from delivery_zones where id = 99001;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO: el empleado borró una zona'; end if;

  select count(*) into n from business_domains where business_id = f.biz_a;
  if n <> 0 then raise exception 'FALLO: el empleado leyó dominios'; end if;
end $$;

do $$
declare
  f test_fixture%rowtype;
begin
  select * into f from test_fixture;
  perform unit_cost from order_items where business_id = f.biz_a;
  raise exception 'FALLO: el empleado leyó el costo del pedido';
exception
  when insufficient_privilege then null;
  when others then
    if sqlerrm like 'FALLO:%' then raise; end if;
    raise exception 'FALLO inesperado al leer unit_cost: %', sqlerrm;
end $$;

do $$
declare
  f test_fixture%rowtype;
begin
  select * into f from test_fixture;
  perform * from admin_sales_report(f.biz_a, now() - interval '1 day', now() + interval '1 day');
  raise exception 'FALLO: el empleado vio las ganancias';
exception
  when others then
    if sqlerrm like 'FALLO:%' then raise; end if;
    if sqlerrm not like '%dueño%' then
      raise exception 'FALLO inesperado en el reporte del empleado: %', sqlerrm;
    end if;
end $$;

do $$
declare
  f test_fixture%rowtype;
begin
  select * into f from test_fixture;
  insert into business_domains (business_id, domain, verified)
  values (f.biz_a, 'empleado.ejemplo.co', true);
  raise exception 'FALLO: el empleado creó un dominio';
exception
  when others then
    if sqlerrm like 'FALLO:%' then raise; end if;
end $$;

reset role;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', true);
set local role authenticated;

do $$
declare
  f test_fixture%rowtype;
  n int;
  v_profit bigint;
begin
  select * into f from test_fixture;
  select profit into v_profit
  from admin_sales_report(f.biz_a, now() - interval '1 day', now() + interval '1 day')
  where product_name = 'Producto A';
  if v_profit is distinct from 985 then
    raise exception 'FALLO: la ganancia del dueño no cuadra (%)', v_profit;
  end if;

  delete from orders where id = 'aaaaaaaa-1111-1111-1111-111111111197';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALLO: el dueño no borró el pedido'; end if;
  delete from customers where id = 'aaaaaaaa-1111-1111-1111-111111111198';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALLO: el dueño no borró el cliente'; end if;
  delete from products where id = 'aaaaaaaa-1111-1111-1111-111111111199';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALLO: el dueño no borró el producto'; end if;
  delete from delivery_zones where id = 99001;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALLO: el dueño no borró la zona'; end if;

  select count(*) into n from business_domains where domain = 'pendiente.ejemplo.co';
  if n <> 1 then raise exception 'FALLO: el dueño no leyó su dominio'; end if;
end $$;

do $$
begin
  perform unit_cost from order_items limit 1;
  raise exception 'FALLO: el panel leyó unit_cost por la tabla';
exception
  when insufficient_privilege then null;
  when others then
    if sqlerrm like 'FALLO:%' then raise; end if;
    raise exception 'FALLO inesperado al leer unit_cost como dueño: %', sqlerrm;
end $$;

do $$
declare
  f test_fixture%rowtype;
begin
  select * into f from test_fixture;
  delete from business_members where business_id = f.biz_a and user_id = f.user_a;
  raise exception 'FALLO: se borró al último dueño';
exception
  when others then
    if sqlerrm like 'FALLO:%' then raise; end if;
    if sqlerrm not like '%sin dueño%' then
      raise exception 'FALLO inesperado al borrar al dueño: %', sqlerrm;
    end if;
end $$;

do $$
declare
  f test_fixture%rowtype;
begin
  select * into f from test_fixture;
  update business_members set role = 'staff' where business_id = f.biz_a and user_id = f.user_a;
  raise exception 'FALLO: se degradó al último dueño';
exception
  when others then
    if sqlerrm like 'FALLO:%' then raise; end if;
    if sqlerrm not like '%sin dueño%' then
      raise exception 'FALLO inesperado al degradar al dueño: %', sqlerrm;
    end if;
end $$;

do $$
declare
  f test_fixture%rowtype;
begin
  select * into f from test_fixture;
  insert into business_domains (business_id, domain, verified)
  values (f.biz_a, 'dueno.ejemplo.co', true);
  raise exception 'FALLO: un dueño verificó un dominio';
exception
  when others then
    if sqlerrm like 'FALLO:%' then raise; end if;
end $$;

do $$
declare
  n int;
begin
  update business_domains set verified = true where domain = 'pendiente.ejemplo.co';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO: un dueño verificó un dominio existente'; end if;
end $$;

reset role;

insert into auth.users (id, email)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', 'owner2@test.local');

insert into business_members (business_id, user_id, role)
select biz_a, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', 'owner' from test_fixture;

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', true);
set local role authenticated;

do $$
declare
  f test_fixture%rowtype;
  n int;
begin
  select * into f from test_fixture;
  update business_members
  set role = 'staff'
  where business_id = f.biz_a
    and user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALLO: no se pudo degradar a un dueño cuando queda otro'; end if;

  update business_members set role = 'staff' where business_id = f.biz_a and user_id = f.user_a;
  raise exception 'FALLO: se degradó al único dueño que quedaba';
exception
  when others then
    if sqlerrm like 'FALLO:%' then raise; end if;
    if sqlerrm not like '%sin dueño%' then
      raise exception 'FALLO inesperado al dejar el negocio sin dueño: %', sqlerrm;
    end if;
end $$;

reset role;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', true);
set local role authenticated;

do $$
declare
  f test_fixture%rowtype;
  n int;
begin
  select * into f from test_fixture;
  insert into business_domains (business_id, domain, verified)
  values (f.biz_a, 'verificado.ejemplo.co', false);
  update business_domains set verified = true where domain = 'verificado.ejemplo.co';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALLO: el superadmin no verificó el dominio'; end if;
end $$;

reset role;
set local role anon;

do $$
declare
  n int;
  v_slug text;
  v_open boolean;
begin
  select slug into v_slug from public_store_by_domain('dondenoe.vercel.app');
  if v_slug is distinct from 'dondenoe' then
    raise exception 'FALLO: dondenoe.vercel.app no resolvió el negocio (%)', v_slug;
  end if;
  select count(*) into n from public_store_by_domain('pendiente.ejemplo.co');
  if n <> 0 then raise exception 'FALLO: un dominio sin verificar abrió la tienda'; end if;
  select slug, orders_open into v_slug, v_open from public_store_by_domain('cerrado.ejemplo.co');
  if v_slug is distinct from 'estanco-c' or v_open is distinct from false then
    raise exception 'FALLO: un negocio suspendido debe resolverse cerrado (% / %)', v_slug, v_open;
  end if;
  select count(*) into n from public_store_by_domain('no es un dominio');
  if n <> 0 then raise exception 'FALLO: un dominio inválido resolvió un negocio'; end if;
  select slug into v_slug from public_store_by_domain('verificado.ejemplo.co');
  if v_slug is distinct from 'estanco-a' then
    raise exception 'FALLO: el dominio verificado no resolvió Estanco A (%)', v_slug;
  end if;
  perform * from business_domains;
  raise exception 'FALLO: anon leyó la tabla de dominios';
exception
  when insufficient_privilege then null;
  when others then
    if sqlerrm like 'FALLO:%' then raise; end if;
    raise exception 'FALLO inesperado en dominios públicos: %', sqlerrm;
end $$;

reset role;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', true);
set local role authenticated;

do $$
declare
  f test_fixture%rowtype;
  v_status business_status;
  v_plan business_plan;
  v_paid timestamptz;
  n int;
begin
  select * into f from test_fixture;
  select status, plan, paid_until into v_status, v_plan, v_paid from businesses where id = f.biz_a;

  begin
    update businesses set status = 'suspended' where id = f.biz_a;
    raise exception 'FALLO: un dueño cambió el estado';
  exception
    when others then
      if sqlerrm like 'FALLO:%' then raise; end if;
      if sqlerrm not like '%superadmin%' and sqlerrm not like '%insufficient_privilege%' then
        raise exception 'FALLO inesperado al cambiar estado: %', sqlerrm;
      end if;
  end;

  begin
    update businesses set plan = 'completo' where id = f.biz_a;
    raise exception 'FALLO: un dueño cambió el plan';
  exception
    when others then
      if sqlerrm like 'FALLO:%' then raise; end if;
      if sqlerrm not like '%superadmin%' and sqlerrm not like '%insufficient_privilege%' then
        raise exception 'FALLO inesperado al cambiar plan: %', sqlerrm;
      end if;
  end;

  begin
    update businesses set paid_until = now() where id = f.biz_a;
    raise exception 'FALLO: un dueño cambió la vigencia';
  exception
    when others then
      if sqlerrm like 'FALLO:%' then raise; end if;
      if sqlerrm not like '%superadmin%' and sqlerrm not like '%insufficient_privilege%' then
        raise exception 'FALLO inesperado al cambiar la vigencia: %', sqlerrm;
      end if;
  end;

  if (select status from businesses where id = f.biz_a) is distinct from v_status
     or (select plan from businesses where id = f.biz_a) is distinct from v_plan
     or (select paid_until from businesses where id = f.biz_a) is distinct from v_paid then
    raise exception 'FALLO: el negocio cambió sin ser superadmin';
  end if;

  select count(*) into n from payments;
  if n <> 0 then raise exception 'FALLO: un dueño leyó pagos'; end if;
  begin
    insert into payments (business_id, amount, method, paid_at, period_start, period_end)
    values (f.biz_a, 1000, 'efectivo', now(), current_date, current_date);
    raise exception 'FALLO: un dueño registró un pago';
  exception
    when others then
      if sqlerrm like 'FALLO:%' then raise; end if;
  end;

  select count(*) into n from platform_audit_log;
  if n <> 0 then raise exception 'FALLO: un dueño leyó la auditoría'; end if;
  begin
    insert into platform_audit_log (action, detail) values ('hack', '{}'::jsonb);
    raise exception 'FALLO: un dueño escribió la auditoría';
  exception
    when others then
      if sqlerrm like 'FALLO:%' then raise; end if;
  end;

  select count(*) into n from platform_business_overview();
  if n <> 0 then raise exception 'FALLO: un dueño vio la lista de la plataforma'; end if;
end $$;

reset role;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', true);
set local role authenticated;

do $$
declare
  f test_fixture%rowtype;
  n int;
  v_status business_status;
begin
  select * into f from test_fixture;
  select status into v_status from businesses where id = f.biz_a;
  update businesses set status = 'suspended', plan = 'basico', paid_until = now() where id = f.biz_a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO: un empleado cambió el estado'; end if;
  if (select status from businesses where id = f.biz_a) is distinct from v_status then
    raise exception 'FALLO: el estado cambió con la cuenta de un empleado';
  end if;
  select count(*) into n from payments;
  if n <> 0 then raise exception 'FALLO: un empleado leyó pagos'; end if;
end $$;

reset role;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', true);
set local role authenticated;

do $$
declare
  f test_fixture%rowtype;
  n int;
begin
  select * into f from test_fixture;
  update businesses set status = 'past_due', paid_until = now() - interval '1 day' where id = f.biz_a;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALLO: el superadmin no cambió el estado'; end if;
  insert into payments (business_id, amount, method, paid_at, period_start, period_end, created_by)
  values (f.biz_a, 50000, 'transferencia', now(), current_date, current_date + 30, f.user_platform);
  select count(*) into n from payments where business_id = f.biz_a;
  if n <> 1 then raise exception 'FALLO: el superadmin no registró el pago'; end if;
  insert into platform_audit_log (actor, action, business_id, detail)
  values (f.user_platform, 'registrar pago', f.biz_a, '{"amount":50000}'::jsonb);
  select count(*) into n from platform_audit_log where business_id = f.biz_a;
  if n <> 1 then raise exception 'FALLO: el superadmin no escribió la auditoría'; end if;
  update businesses set status = 'active', paid_until = null where id = f.biz_a;
end $$;

reset role;

do $$
declare
  f test_fixture%rowtype;
begin
  select * into f from test_fixture;
  update businesses set status = 'past_due', paid_until = now() - interval '1 day' where id = f.biz_a;
  if not business_accepts_orders(f.biz_a) then
    raise exception 'FALLO: un pago pendiente reciente no recibió pedidos';
  end if;
  update businesses set paid_until = now() - interval '6 days' where id = f.biz_a;
  if business_accepts_orders(f.biz_a) then
    raise exception 'FALLO: un pago con más de 5 días de atraso siguió abierto';
  end if;
  update businesses set status = 'suspended', paid_until = now() where id = f.biz_a;
  if business_accepts_orders(f.biz_a) then
    raise exception 'FALLO: un negocio suspendido siguió recibiendo pedidos';
  end if;
  update businesses set status = 'active', paid_until = null where id = f.biz_a;
end $$;

reset role;
set local role anon;

do $$
begin
  perform * from payments;
  raise exception 'FALLO: anon leyó pagos';
exception
  when insufficient_privilege then null;
  when others then
    if sqlerrm like 'FALLO:%' then raise; end if;
    raise exception 'FALLO inesperado al leer pagos públicos: %', sqlerrm;
end $$;

reset role;

insert into businesses (id, slug, name, status, template, timezone)
values ('44444444-4444-4444-4444-444444444444', 'salon-d', 'Salón D', 'active', 'agenda', 'America/Bogota');
insert into business_settings (business_id, age_verification) values ('44444444-4444-4444-4444-444444444444', false);
insert into agenda_settings (business_id, buffer_minutes, min_notice_minutes, max_horizon_days, slot_minutes, cancel_notice_hours)
values ('44444444-4444-4444-4444-444444444444', 15, 0, 60, 15, 4);
insert into business_members (business_id, user_id, role)
values ('44444444-4444-4444-4444-444444444444', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'owner');
insert into categories (business_id, name, slug) values ('44444444-4444-4444-4444-444444444444', 'Servicios', 'servicios');
insert into products (id, business_id, category_id, name, price, kind, duration_minutes)
select 'dddddddd-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444', c.id, 'Corte', 20000, 'service', 30
from categories c where c.business_id = '44444444-4444-4444-4444-444444444444';
insert into professionals (id, business_id, name) values ('dddddddd-4444-4444-4444-444444444441', '44444444-4444-4444-4444-444444444444', 'Ana');
insert into professional_services (business_id, professional_id, product_id)
values ('44444444-4444-4444-4444-444444444444', 'dddddddd-4444-4444-4444-444444444441', 'dddddddd-4444-4444-4444-444444444444');

do $$
declare
  v_day date := (timezone('America/Bogota', now()))::date + 2;
  v_dow int := extract(dow from v_day);
  n int;
  v_at timestamptz;
  v_number int;
begin
  insert into professional_hours (business_id, professional_id, weekday, start_time, end_time)
  values
    ('44444444-4444-4444-4444-444444444444', 'dddddddd-4444-4444-4444-444444444441', v_dow, '09:00', '12:00'),
    ('44444444-4444-4444-4444-444444444444', 'dddddddd-4444-4444-4444-444444444441', v_dow, '23:00', '23:45');

  v_at := (v_day + time '23:00') at time zone 'America/Bogota';
  select count(*) into n from get_availability(
    '44444444-4444-4444-4444-444444444444', 'dddddddd-4444-4444-4444-444444444444', null, v_day
  ) where starts_at = v_at;
  if n <> 1 then raise exception 'FALLO: la hora de las 23:00 hora de Bogotá no apareció'; end if;
  if (timezone('America/Bogota', v_at))::time <> time '23:00' then
    raise exception 'FALLO: la cita de medianoche no quedó en America/Bogota';
  end if;
  select count(*) into n from get_availability(
    '44444444-4444-4444-4444-444444444444', 'dddddddd-4444-4444-4444-444444444444', null, v_day + 1
  ) where starts_at = v_at;
  if n <> 0 then raise exception 'FALLO: la cita de las 23:00 se ofreció en el día siguiente'; end if;

  select count(*) into n from get_availability(
    '44444444-4444-4444-4444-444444444444', 'dddddddd-4444-4444-4444-444444444444', null, v_day
  ) where starts_at = (v_day + time '23:30') at time zone 'America/Bogota';
  if n <> 0 then raise exception 'FALLO: un turno que cruza el cierre se ofreció'; end if;

  insert into professional_blocks (business_id, professional_id, starts_at, ends_at, reason)
  values (
    '44444444-4444-4444-4444-444444444444',
    'dddddddd-4444-4444-4444-444444444441',
    (v_day + time '11:00') at time zone 'America/Bogota',
    (v_day + time '12:00') at time zone 'America/Bogota',
    'Almuerzo'
  );
  select count(*) into n from get_availability(
    '44444444-4444-4444-4444-444444444444', 'dddddddd-4444-4444-4444-444444444444',
    'dddddddd-4444-4444-4444-444444444441', v_day
  ) where starts_at = (v_day + time '11:00') at time zone 'America/Bogota';
  if n <> 0 then raise exception 'FALLO: un bloqueo dejó libre la hora'; end if;

  select appointment_number into v_number from book_appointment(
    '44444444-4444-4444-4444-444444444444',
    'dddddddd-4444-4444-4444-444444444444',
    'dddddddd-4444-4444-4444-444444444441',
    (v_day + time '10:00') at time zone 'America/Bogota',
    'Luisa', '3001112233', null, 'web'
  );
  if v_number is null then raise exception 'FALLO: no se guardó la cita'; end if;

  select count(*) into n from get_availability(
    '44444444-4444-4444-4444-444444444444', 'dddddddd-4444-4444-4444-444444444444', null, v_day
  ) where starts_at = (v_day + time '10:30') at time zone 'America/Bogota';
  if n <> 0 then raise exception 'FALLO: el tiempo entre citas no se respetó'; end if;
  select count(*) into n from get_availability(
    '44444444-4444-4444-4444-444444444444', 'dddddddd-4444-4444-4444-444444444444', null, v_day
  ) where starts_at = (v_day + time '09:00') at time zone 'America/Bogota';
  if n <> 1 then raise exception 'FALLO: una hora libre después del espacio no apareció'; end if;

  begin
    perform appointment_number from book_appointment(
      '44444444-4444-4444-4444-444444444444',
      'dddddddd-4444-4444-4444-444444444444',
      'dddddddd-4444-4444-4444-444444444441',
      (v_day + time '10:00') at time zone 'America/Bogota',
      'Otra', '3001112244', null, 'web'
    );
    raise exception 'FALLO: dos citas ocuparon la misma hora';
  exception
    when others then
      if sqlerrm like 'FALLO:%' then raise; end if;
      if sqlerrm not like '%horario ya no está disponible%' then
        raise exception 'FALLO inesperado en la doble reserva: %', sqlerrm;
      end if;
  end;

  update agenda_settings set min_notice_minutes = 10080
  where business_id = '44444444-4444-4444-4444-444444444444';
  select count(*) into n from get_availability(
    '44444444-4444-4444-4444-444444444444', 'dddddddd-4444-4444-4444-444444444444', null, v_day
  );
  if n <> 0 then raise exception 'FALLO: se ofreció una cita dentro de la anticipación mínima'; end if;

  begin
    perform order_number from create_order(
      '44444444-4444-4444-4444-444444444444', 'Ana', '3001112233', 'Calle 1', null, 'efectivo', true,
      jsonb_build_array(jsonb_build_object('type', 'product', 'id', 'dddddddd-4444-4444-4444-444444444444', 'quantity', 1)),
      null, false
    );
    raise exception 'FALLO: un negocio de agenda recibió un pedido de tienda';
  exception
    when others then
      if sqlerrm like 'FALLO:%' then raise; end if;
      if sqlerrm not like '%no está recibiendo pedidos%' and sqlerrm not like '%no está disponible%' then
        raise exception 'FALLO inesperado al pedir en una agenda: %', sqlerrm;
      end if;
  end;

  begin
    perform appointment_number from book_appointment(
      '11111111-1111-1111-1111-111111111111',
      'aaaaaaaa-1111-1111-1111-111111111111',
      'dddddddd-4444-4444-4444-444444444441',
      (v_day + time '09:00') at time zone 'America/Bogota',
      'Ana', '3001112233', null, 'web'
    );
    raise exception 'FALLO: una tienda recibió una cita';
  exception
    when others then
      if sqlerrm like 'FALLO:%' then raise; end if;
      if sqlerrm not like '%no recibe citas%' then
        raise exception 'FALLO inesperado al citar en una tienda: %', sqlerrm;
      end if;
  end;
end $$;

alter table appointments disable trigger appointments_c_guard;
do $$
begin
  insert into appointments (
    business_id, number, customer_id, professional_id, service_id, starts_at, ends_at, status, price, channel
  )
  select '44444444-4444-4444-4444-444444444444', 90, c.id, 'dddddddd-4444-4444-4444-444444444441',
         'dddddddd-4444-4444-4444-444444444444',
         (timezone('America/Bogota', now()))::date + time '15:00',
         (timezone('America/Bogota', now()))::date + time '15:30',
         'confirmada', 20000, 'manual'
  from customers c where c.phone = '3001112233' and c.business_id = '44444444-4444-4444-4444-444444444444';
  insert into appointments (
    business_id, number, customer_id, professional_id, service_id, starts_at, ends_at, status, price, channel
  )
  select '44444444-4444-4444-4444-444444444444', 91, c.id, 'dddddddd-4444-4444-4444-444444444441',
         'dddddddd-4444-4444-4444-444444444444',
         (timezone('America/Bogota', now()))::date + time '15:15',
         (timezone('America/Bogota', now()))::date + time '15:45',
         'confirmada', 20000, 'manual'
  from customers c where c.phone = '3001112233' and c.business_id = '44444444-4444-4444-4444-444444444444';
  raise exception 'FALLO: la base aceptó dos citas cruzadas';
exception
  when exclusion_violation then null;
  when others then
    if sqlerrm like 'FALLO:%' then raise; end if;
    raise exception 'FALLO inesperado en la restricción de cruce: %', sqlerrm;
end $$;
alter table appointments enable trigger appointments_c_guard;

reset role;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', true);
set local role authenticated;

do $$
declare
  n int;
begin
  select count(*) into n from appointments where business_id = '44444444-4444-4444-4444-444444444444';
  if n <> 0 then raise exception 'FALLO: el negocio B leyó citas de la agenda'; end if;
  select count(*) into n from professionals where business_id = '44444444-4444-4444-4444-444444444444';
  if n <> 0 then raise exception 'FALLO: el negocio B leyó profesionales de la agenda'; end if;
  select count(*) into n from professional_hours where business_id = '44444444-4444-4444-4444-444444444444';
  if n <> 0 then raise exception 'FALLO: el negocio B leyó horarios de la agenda'; end if;
  select count(*) into n from customers where business_id = '44444444-4444-4444-4444-444444444444';
  if n <> 0 then raise exception 'FALLO: el negocio B leyó clientes de la agenda'; end if;
  update appointments set notes = 'hack' where business_id = '44444444-4444-4444-4444-444444444444';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO: el negocio B modificó una cita'; end if;
end $$;

reset role;
set local role anon;

do $$
begin
  perform * from appointments;
  raise exception 'FALLO: anon leyó citas';
exception
  when insufficient_privilege then null;
  when others then
    if sqlerrm like 'FALLO:%' then raise; end if;
    raise exception 'FALLO inesperado al leer citas públicas: %', sqlerrm;
end $$;

reset role;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', true);

insert into master_products (id, name, brand, kind, presentation, aliases, draft, active)
values
  ('eeeeeeee-1111-1111-1111-111111111111', 'Aguardiente de prueba', 'Prueba', 'aguardiente', '750 ml', array['guaro de prueba'], false, true),
  ('eeeeeeee-1111-1111-1111-111111111112', 'Ron de prueba', 'Prueba', 'ron', '750 ml', array['roncito'], false, true);

do $$
declare
  n int;
  v_cost int;
  v_moves int;
begin
  select count(*) into n from search_master_products('guaro de prueba', null, false)
  where id = 'eeeeeeee-1111-1111-1111-111111111111';
  if n <> 1 then raise exception 'FALLO: la búsqueda no encontró el alias'; end if;
  select count(*) into n from search_master_products('aguardinte de prueba', null, false)
  where id = 'eeeeeeee-1111-1111-1111-111111111111';
  if n <> 1 then raise exception 'FALLO: la búsqueda no toleró el error de escritura'; end if;
  select count(*) into n from search_master_products('guaro', null, false)
  where draft;
  if n <> 0 then raise exception 'FALLO: un borrador salió en la búsqueda de la tienda'; end if;
end $$;

reset role;
set local role anon;
do $$
begin
  perform * from master_products;
  raise exception 'FALLO: anon leyó el catálogo maestro';
exception
  when insufficient_privilege then null;
  when others then
    if sqlerrm like 'FALLO:%' then raise; end if;
    raise exception 'FALLO inesperado al leer el catálogo público: %', sqlerrm;
end $$;

reset role;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', true);
set local role authenticated;
do $$
begin
  insert into master_products (name, brand, kind, presentation)
  values ('Hack', 'Hack', 'otro', '1');
  raise exception 'FALLO: el empleado escribió en el catálogo maestro';
exception
  when insufficient_privilege or check_violation then null;
  when others then
    if sqlerrm like 'FALLO:%' then raise; end if;
    if sqlerrm not like '%row-level security%' and sqlerrm not like '%permission denied%' then
      raise exception 'FALLO inesperado al crear un maestro: %', sqlerrm;
    end if;
end $$;

reset role;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', true);
set local role authenticated;
do $$
begin
  insert into master_products (name, brand, kind, presentation, draft, active)
  values ('Alta de superadmin', 'Marca', 'otro', 'unidad', false, true);
  if not found then
    raise exception 'FALLO: el superadmin no pudo crear un producto maestro';
  end if;
end $$;

reset role;
insert into import_jobs (business_id, user_id, kind, status, file_path, result)
values (
  '11111111-1111-1111-1111-111111111111',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
  'csv', 'revisando', '11111111-1111-1111-1111-111111111111/imports/lista.csv',
  '{"lineas":[{"nombre":"A","costo":9000}]}'::jsonb
);
insert into ai_usage (business_id, used_on, units) values ('11111111-1111-1111-1111-111111111111', current_date, 1);
insert into storage.objects (bucket_id, name)
values ('imports', '11111111-1111-1111-1111-111111111111/imports/lista.csv');

reset role;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', true);
set local role authenticated;
do $$
declare
  n int;
begin
  select count(*) into n from import_jobs where business_id = '11111111-1111-1111-1111-111111111111';
  if n <> 0 then raise exception 'FALLO: el negocio B leyó una importación de A'; end if;
  select count(*) into n from ai_usage where business_id = '11111111-1111-1111-1111-111111111111';
  if n <> 0 then raise exception 'FALLO: el negocio B leyó el uso de IA de A'; end if;
  select count(*) into n from storage.objects
  where name = '11111111-1111-1111-1111-111111111111/imports/lista.csv';
  if n <> 0 then raise exception 'FALLO: el negocio B leyó el archivo de A'; end if;
end $$;

reset role;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', true);
set local role authenticated;
do $$
declare
  v_before int;
begin
  select count(*) into v_before from products where business_id = '11111111-1111-1111-1111-111111111111';
  begin
    perform add_products_from_master(
      '11111111-1111-1111-1111-111111111111',
      jsonb_build_array(
        jsonb_build_object(
          'master_product_id', 'eeeeeeee-1111-1111-1111-111111111111',
          'category_id', (select cat_a from test_fixture),
          'price', 2000, 'stock', 4, 'cost', 9000
        ),
        jsonb_build_object(
          'master_product_id', 'eeeeeeee-1111-1111-1111-111111111112',
          'category_id', -1,
          'price', 3000, 'stock', 1
        )
      )
    );
    raise exception 'FALLO: una línea mala dejó guardada la importación';
  exception
    when others then
      if sqlerrm like 'FALLO:%' then raise; end if;
      if sqlerrm not like '%categoría no es de esta tienda%' then
        raise exception 'FALLO inesperado al revertir la importación: %', sqlerrm;
      end if;
  end;
  if (select count(*) from products where business_id = '11111111-1111-1111-1111-111111111111') <> v_before then
    raise exception 'FALLO: se guardó una línea aunque otra falló';
  end if;

  begin
    perform confirm_catalog_import(
      '11111111-1111-1111-1111-111111111111',
      jsonb_build_array(
        jsonb_build_object(
          'action', 'crear', 'name', 'Línea buena', 'price', 2000, 'quantity', 1,
          'category_id', (select cat_a from test_fixture)
        ),
        jsonb_build_object(
          'action', 'crear', 'name', 'Línea mala', 'price', 2000, 'quantity', 1,
          'category_id', -1
        )
      )
    );
    raise exception 'FALLO: una línea mala dejó guardada la confirmación';
  exception
    when others then
      if sqlerrm like 'FALLO:%' then raise; end if;
      if sqlerrm not like '%categoría no es de esta tienda%' then
        raise exception 'FALLO inesperado al revertir la confirmación: %', sqlerrm;
      end if;
  end;
  if (select count(*) from products where business_id = '11111111-1111-1111-1111-111111111111') <> v_before then
    raise exception 'FALLO: se guardó una línea de la confirmación aunque otra falló';
  end if;

  perform confirm_catalog_import(
    '11111111-1111-1111-1111-111111111111',
    jsonb_build_array(jsonb_build_object(
      'action', 'vincular',
      'name', 'Aguardiente de prueba',
      'presentation', '750 ml',
      'master_product_id', 'eeeeeeee-1111-1111-1111-111111111111',
      'category_id', (select cat_a from test_fixture),
      'price', 2500,
      'cost', 9000,
      'quantity', 3,
      'barcode', ''
    ))
  );
end $$;

reset role;
do $$
declare
  v_cost int;
  v_stock int;
  v_note text;
begin
  select cost, stock into v_cost, v_stock
  from products
  where business_id = '11111111-1111-1111-1111-111111111111'
    and master_product_id = 'eeeeeeee-1111-1111-1111-111111111111';
  if v_cost <> 0 then raise exception 'FALLO: el empleado guardó un costo'; end if;
  if v_stock <> 3 then raise exception 'FALLO: la entrada de inventario no sumó el stock'; end if;
  select note into v_note from inventory_movements
  where product_id = (
    select id from products
    where master_product_id = 'eeeeeeee-1111-1111-1111-111111111111'
      and business_id = '11111111-1111-1111-1111-111111111111'
  );
  if v_note is distinct from 'Importación' then
    raise exception 'FALLO: el movimiento no quedó como importación';
  end if;
end $$;

reset role;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', true);
set local role authenticated;
do $$
declare
  v_cost text;
begin
  select result->'lineas'->0->>'costo' into v_cost
  from import_jobs
  where business_id = '11111111-1111-1111-1111-111111111111';
  if v_cost is not null then raise exception 'FALLO: el empleado pudo ver el costo de la importación'; end if;
end $$;

-- Límite de lecturas con IA. El cupo del día empieza en cero; una reserva vieja no cuenta.
reset role;
delete from ai_usage where business_id = '11111111-1111-1111-1111-111111111111';
insert into ai_usage (business_id, used_on, units, status, created_at)
values (
  '11111111-1111-1111-1111-111111111111',
  (timezone('America/Bogota', now()))::date,
  5,
  'reservada',
  now() - interval '1 hour'
);
update platform_settings
set value = '{"basico":2,"completo":2}'::jsonb
where key = 'ai_daily_reads';

reset role;
create temp table ai_probe (id uuid);
grant all on ai_probe to authenticated;

select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', true);
set local role authenticated;

do $$
declare
  v_first uuid;
  v_second uuid;
begin
  v_first := reserve_ai_read('11111111-1111-1111-1111-111111111111', 1);
  v_second := reserve_ai_read('11111111-1111-1111-1111-111111111111', 1);
  if v_first is null or v_second is null then
    raise exception 'FALLO: una reserva dentro del límite no se creó';
  end if;
  insert into ai_probe values (v_first);
  begin
    perform reserve_ai_read('11111111-1111-1111-1111-111111111111', 1);
    raise exception 'FALLO: la tercera reserva pasó el límite';
  exception
    when others then
      if sqlerrm like 'FALLO:%' then raise; end if;
      if sqlerrm not like '%límite de lecturas con IA de hoy%' then
        raise exception 'FALLO inesperado al reservar: %', sqlerrm;
      end if;
  end;
  begin
    perform record_ai_usage('11111111-1111-1111-1111-111111111111', 1);
    raise exception 'FALLO: record_ai_usage sigue abierto';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlerrm like 'FALLO:%' then raise; end if;
      if sqlerrm not like '%permission denied%' and sqlerrm not like '%reservada antes%' then
        raise exception 'FALLO inesperado al registrar uso directo: %', sqlerrm;
      end if;
  end;
end $$;

reset role;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', true);
set local role authenticated;

do $$
declare
  v_id uuid;
begin
  select id into v_id from ai_probe;
  begin
    perform settle_ai_read(v_id, 1);
    raise exception 'FALLO: el negocio B liquidó una reserva de A';
  exception
    when others then
      if sqlerrm like 'FALLO:%' then raise; end if;
      if sqlerrm not like '%No autorizado%' then
        raise exception 'FALLO inesperado al liquidar otra reserva: %', sqlerrm;
      end if;
  end;
  begin
    perform release_ai_read(v_id);
    raise exception 'FALLO: el negocio B liberó una reserva de A';
  exception
    when others then
      if sqlerrm like 'FALLO:%' then raise; end if;
      if sqlerrm not like '%No autorizado%' then
        raise exception 'FALLO inesperado al liberar otra reserva: %', sqlerrm;
      end if;
  end;
end $$;

reset role;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', true);
set local role authenticated;

do $$
declare
  v_id uuid;
  v_units int;
begin
  select id into v_id from ai_probe;
  perform settle_ai_read(v_id, 1);
  select units into v_units from ai_usage where id = v_id;
  if v_units <> 1 then raise exception 'FALLO: la liquidación no guardó las unidades reales'; end if;
  begin
    perform release_ai_read(v_id);
    raise exception 'FALLO: se liberó una lectura ya registrada';
  exception
    when others then
      if sqlerrm like 'FALLO:%' then raise; end if;
      if sqlerrm not like '%No autorizado%' then
        raise exception 'FALLO inesperado al bajar el uso: %', sqlerrm;
      end if;
  end;
  begin
    perform settle_ai_read(v_id, 1);
    raise exception 'FALLO: se volvió a liquidar una lectura ya registrada';
  exception
    when others then
      if sqlerrm like 'FALLO:%' then raise; end if;
      if sqlerrm not like '%ya no está vigente%' then
        raise exception 'FALLO inesperado al repetir la liquidación: %', sqlerrm;
      end if;
  end;
end $$;

do $$ begin raise notice 'AISLAMIENTO_OK'; end $$;
rollback;
