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
    if sqlerrm not like '%no está recibiendo pedidos%' then
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

do $$ begin raise notice 'AISLAMIENTO_OK'; end $$;
rollback;
