-- Catálogo maestro e importación de listas. Correr una vez, después de 008.
-- Una instalación nueva no lo necesita: schema.sql, grants.sql y seed.sql ya incluyen este estado.
-- pg_trgm permite buscar aunque el nombre esté mal escrito.
-- En Supabase, si CREATE EXTENSION falla, actívala en Database → Extensions → pg_trgm y vuelve a correr.

create extension if not exists pg_trgm;

create table master_products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  brand text not null check (char_length(btrim(brand)) between 1 and 80),
  kind text not null check (kind in (
    'aguardiente', 'ron', 'cerveza', 'whisky', 'vino', 'mezclador', 'hielo', 'snack', 'cigarrillo', 'otro'
  )),
  presentation text not null check (char_length(btrim(presentation)) between 1 and 80),
  volume_ml int check (volume_ml is null or volume_ml > 0),
  units_per_pack int not null default 1 check (units_per_pack > 0),
  barcode text,
  image_url text,
  niche text not null default 'estanco' check (char_length(niche) between 1 and 40),
  active boolean not null default true,
  aliases text[] not null default '{}',
  draft boolean not null default true,
  search_text text not null default '',
  created_at timestamptz not null default now(),
  identity_key text generated always as (
    niche || '|' || lower(btrim(name)) || '|' || lower(btrim(brand)) || '|' || lower(btrim(presentation))
  ) stored,
  unique (identity_key),
  unique (barcode)
);

create function master_products_search_text() returns trigger
language plpgsql as $$
begin
  new.search_text := lower(
    btrim(new.name) || ' ' || btrim(new.brand) || ' ' || btrim(new.presentation) || ' ' || array_to_string(new.aliases, ' ')
  );
  return new;
end $$;

create trigger master_products_search
before insert or update of name, brand, presentation, aliases on master_products
for each row execute function master_products_search_text();

create index master_products_search_idx on master_products using gin (search_text gin_trgm_ops);

alter table business_settings
  add column sale_margin_percent int not null default 30 check (sale_margin_percent between 0 and 500);

alter table products
  add column master_product_id uuid references master_products(id) on delete set null,
  add column barcode text;

create unique index products_business_barcode_idx on products (business_id, barcode) where barcode is not null;

create table import_jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  kind text not null check (kind in ('csv', 'xlsx', 'image', 'pdf')),
  status text not null check (status in ('revisando', 'confirmado', 'fallido')),
  file_path text,
  result jsonb,
  created_at timestamptz not null default now(),
  check (file_path is null or char_length(file_path) <= 300)
);

create index import_jobs_business_idx on import_jobs (business_id, created_at desc);

create table ai_usage (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  used_on date not null,
  units int not null check (units > 0 and units <= 20),
  estimated_cost numeric(12, 4) check (estimated_cost is null or estimated_cost >= 0),
  created_at timestamptz not null default now()
);

create index ai_usage_business_day_idx on ai_usage (business_id, used_on);

insert into platform_settings (key, value)
values ('ai_daily_reads', '{"basico":10,"completo":10}'::jsonb)
on conflict (key) do nothing;

create function search_master_products(p_query text, p_kind text default null, p_include_drafts boolean default false)
returns table (
  id uuid,
  name text,
  brand text,
  kind text,
  presentation text,
  volume_ml int,
  units_per_pack int,
  barcode text,
  image_url text,
  aliases text[],
  active boolean,
  draft boolean,
  score real
)
language sql stable security definer set search_path = public as $$
  with q as (select lower(btrim(coalesce(p_query, ''))) as t),
  scored as (
    select m.*,
      greatest(
        similarity(lower(m.name), q.t),
        similarity(lower(m.brand), q.t),
        similarity(lower(m.presentation), q.t),
        coalesce((select max(similarity(lower(alias), q.t)) from unnest(m.aliases) alias), 0)
      ) as rank
    from master_products m
    cross join q
    where (p_kind is null or p_kind = '' or m.kind = p_kind)
      and (
        public.is_platform_admin()
        or (
          m.active and not m.draft
          and exists (select 1 from business_members bm where bm.user_id = auth.uid())
        )
      )
      and (
        not public.is_platform_admin()
        or p_include_drafts
        or (m.active and not m.draft)
      )
      and (
        q.t = ''
        or m.search_text % q.t
        or m.search_text like '%' || q.t || '%'
        or similarity(m.search_text, q.t) > 0.24
      )
  )
  select s.id, s.name, s.brand, s.kind, s.presentation, s.volume_ml, s.units_per_pack,
         s.barcode, s.image_url, s.aliases, s.active, s.draft, s.rank
  from scored s
  where (select t from q) = '' or s.rank > 0 or lower(s.name) like '%' || (select t from q) || '%'
  order by s.draft, s.rank desc, s.name
  limit 40;
$$;

create function match_catalog_lines(p_business_id uuid, p_lines jsonb)
returns table (
  idx int,
  master_product_id uuid,
  master_name text,
  score real,
  product_id uuid,
  product_name text
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_line jsonb;
  v_index int := 0;
  v_name text;
  v_barcode text;
  v_master uuid;
  v_label text;
  v_score real;
  v_product uuid;
  v_product_name text;
begin
  if not public.is_member(p_business_id) then
    return;
  end if;
  if jsonb_typeof(p_lines) <> 'array' then
    return;
  end if;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_name := lower(btrim(coalesce(v_line->>'nombre', '')));
    v_barcode := nullif(btrim(coalesce(v_line->>'codigo_barras', '')), '');
    v_master := null;
    v_label := null;
    v_score := 0;
    v_product := null;
    v_product_name := null;
    if v_barcode is not null then
      select m.id, m.name || ' ' || m.presentation, 1
        into v_master, v_label, v_score
      from master_products m
      where m.barcode = v_barcode and m.active and not m.draft
      limit 1;
    end if;
    if v_master is null and v_name <> '' then
      select m.id, m.name || ' ' || m.presentation,
             greatest(
               similarity(lower(m.name), v_name),
               similarity(lower(m.brand), v_name),
               coalesce((select max(similarity(lower(alias), v_name)) from unnest(m.aliases) alias), 0)
             )
        into v_master, v_label, v_score
      from master_products m
      where m.active and not m.draft
      order by 3 desc
      limit 1;
    end if;
    if v_score is null or v_score < 0.3 then
      v_master := null;
      v_label := null;
      v_score := coalesce(v_score, 0);
    end if;
    select p.id, p.name into v_product, v_product_name
    from products p
    where p.business_id = p_business_id
      and (
        (v_barcode is not null and p.barcode = v_barcode)
        or (v_master is not null and p.master_product_id = v_master)
        or (v_name <> '' and similarity(lower(p.name), v_name) > 0.55)
      )
    order by case when v_barcode is not null and p.barcode = v_barcode then 0 else 1 end
    limit 1;
    idx := v_index;
    master_product_id := v_master;
    master_name := v_label;
    score := v_score;
    product_id := v_product;
    product_name := v_product_name;
    return next;
    v_index := v_index + 1;
  end loop;
end $$;

create function add_products_from_master(p_business_id uuid, p_items jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_item jsonb;
  v_master uuid;
  v_category int;
  v_price int;
  v_cost int;
  v_stock int;
  v_name text;
  v_presentation text;
  v_image text;
  v_barcode text;
  v_existing uuid;
  v_id uuid;
  v_created int := 0;
  v_skipped jsonb := '[]'::jsonb;
  v_owner boolean := public.is_owner(p_business_id);
begin
  if not public.is_member(p_business_id) then
    raise exception 'No autorizado';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 100 then
    raise exception 'Elige entre 1 y 100 productos';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_master := nullif(v_item->>'master_product_id', '')::uuid;
    v_category := nullif(v_item->>'category_id', '')::int;
    v_price := nullif(v_item->>'price', '')::int;
    v_stock := coalesce(nullif(v_item->>'stock', '')::int, 0);
    if v_price is null or v_price <= 0 or v_stock < 0 or v_stock > 100000 then
      raise exception 'Revisa el precio y el stock';
    end if;
    if not exists (
      select 1 from categories c where c.id = v_category and c.business_id = p_business_id
    ) then
      raise exception 'La categoría no es de esta tienda';
    end if;
    select m.name, m.presentation, m.image_url, m.barcode
      into v_name, v_presentation, v_image, v_barcode
    from master_products m
    where m.id = v_master and m.active and not m.draft;
    if not found then
      raise exception 'Ese producto del catálogo no está disponible';
    end if;
    select p.id into v_existing
    from products p
    where p.business_id = p_business_id and p.master_product_id = v_master
    limit 1;
    if v_existing is not null then
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('name', v_name, 'reason', 'ya existe'));
      continue;
    end if;
    insert into products (
      business_id, category_id, name, description, price, image_url, master_product_id, barcode, kind
    ) values (
      p_business_id, v_category, v_name, nullif(v_presentation, ''), v_price, v_image, v_master, v_barcode, 'product'
    ) returning id into v_id;
    if v_owner and nullif(v_item->>'cost', '') is not null then
      v_cost := (v_item->>'cost')::int;
      if v_cost is null or v_cost < 0 then
        raise exception 'Costo o stock mínimo inválido';
      end if;
      update products set cost = v_cost where id = v_id;
    end if;
    if v_stock > 0 then
      insert into inventory_movements (business_id, product_id, quantity, reason, note)
      values (p_business_id, v_id, v_stock, 'entrada', 'Catálogo maestro');
    end if;
    v_created := v_created + 1;
  end loop;
  return jsonb_build_object('creados', v_created, 'omitidos', v_skipped);
end $$;

create function confirm_catalog_import(p_business_id uuid, p_lines jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_item jsonb;
  v_action text;
  v_name text;
  v_price int;
  v_qty int;
  v_cost int;
  v_master uuid;
  v_product uuid;
  v_category int;
  v_barcode text;
  v_saved int := 0;
  v_owner boolean := public.is_owner(p_business_id);
begin
  if not public.is_member(p_business_id) then
    raise exception 'No autorizado';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 1 or jsonb_array_length(p_lines) > 200 then
    raise exception 'La importación debe tener entre 1 y 200 líneas';
  end if;

  for v_item in select value from jsonb_array_elements(p_lines) loop
    v_action := coalesce(v_item->>'action', '');
    if v_action = 'omitir' then
      continue;
    end if;
    if v_action not in ('crear', 'vincular', 'actualizar') then
      raise exception 'Acción no válida';
    end if;
    v_name := btrim(coalesce(v_item->>'name', ''));
    v_price := nullif(v_item->>'price', '')::int;
    v_qty := coalesce(nullif(v_item->>'quantity', '')::int, 0);
    v_barcode := nullif(btrim(coalesce(v_item->>'barcode', '')), '');
    v_master := nullif(v_item->>'master_product_id', '')::uuid;
    if v_price is null or v_price <= 0 or v_qty < 0 or v_qty > 100000 then
      raise exception 'Revisa el precio y el stock';
    end if;
    if char_length(v_name) < 1 or char_length(v_name) > 120 then
      raise exception 'Revisa el nombre';
    end if;
    if v_master is not null and not exists (
      select 1 from master_products m where m.id = v_master and m.active and not m.draft
    ) then
      raise exception 'Ese producto del catálogo no está disponible';
    end if;
    if v_action = 'vincular' and v_master is null then
      raise exception 'Elige el producto del catálogo';
    end if;

    if v_action = 'actualizar' then
      v_product := nullif(v_item->>'product_id', '')::uuid;
      update products
      set price = v_price,
          name = v_name,
          master_product_id = coalesce(v_master, master_product_id),
          barcode = coalesce(v_barcode, barcode)
      where id = v_product and business_id = p_business_id;
      if not found then
        raise exception 'No encontramos ese producto en la tienda';
      end if;
    else
      v_category := nullif(v_item->>'category_id', '')::int;
      if not exists (
        select 1 from categories c where c.id = v_category and c.business_id = p_business_id
      ) then
        raise exception 'La categoría no es de esta tienda';
      end if;
      insert into products (
        business_id, category_id, name, description, price, master_product_id, barcode, kind
      ) values (
        p_business_id, v_category, v_name, nullif(btrim(coalesce(v_item->>'presentation', '')), ''),
        v_price, v_master, v_barcode, 'product'
      ) returning id into v_product;
    end if;

    if v_owner and nullif(v_item->>'cost', '') is not null then
      v_cost := (v_item->>'cost')::int;
      if v_cost is null or v_cost < 0 then
        raise exception 'Costo o stock mínimo inválido';
      end if;
      update products set cost = v_cost where id = v_product and business_id = p_business_id;
    end if;
    if v_qty > 0 then
      insert into inventory_movements (business_id, product_id, quantity, reason, note)
      values (p_business_id, v_product, v_qty, 'entrada', 'Importación');
    end if;
    v_saved := v_saved + 1;
  end loop;
  return v_saved;
end $$;

create function ai_daily_limit(p_business_id uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(
    (
      select (s.value ->> b.plan::text)::int
      from platform_settings s
      join businesses b on b.id = p_business_id
      where s.key = 'ai_daily_reads'
    ),
    10
  );
$$;

create function ai_reads_today(p_business_id uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(u.units), 0)::int
  from ai_usage u
  join businesses b on b.id = u.business_id
  where u.business_id = p_business_id
    and u.used_on = (timezone(coalesce(nullif(b.timezone, ''), 'America/Bogota'), now()))::date
    and (public.is_member(p_business_id) or public.is_platform_admin());
$$;

create function record_ai_usage(p_business_id uuid, p_units int) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_today date;
  v_used int;
begin
  if not public.is_member(p_business_id) then
    raise exception 'No autorizado';
  end if;
  if p_units is null or p_units < 1 or p_units > 5 then
    raise exception 'No se pudo registrar la lectura';
  end if;
  select (timezone(coalesce(nullif(b.timezone, ''), 'America/Bogota'), now()))::date
    into v_today
  from businesses b where b.id = p_business_id;
  select coalesce(sum(units), 0) into v_used
  from ai_usage where business_id = p_business_id and used_on = v_today;
  if v_used + p_units > public.ai_daily_limit(p_business_id) then
    raise exception 'Llegaste al límite de lecturas con IA de hoy';
  end if;
  insert into ai_usage (business_id, used_on, units) values (p_business_id, v_today, p_units);
end $$;

create function platform_ai_usage()
returns table (business_id uuid, business_name text, units bigint)
language sql stable security definer set search_path = public as $$
  select b.id, b.name, coalesce(sum(u.units), 0)::bigint
  from businesses b
  left join ai_usage u
    on u.business_id = b.id
   and u.used_on >= (timezone('America/Bogota', now()))::date - 30
  where public.is_platform_admin()
  group by b.id, b.name
  order by 3 desc, b.name;
$$;

create function purge_expired_imports() returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from storage.objects
  where bucket_id = 'imports'
    and created_at < now() - interval '7 days';
  update import_jobs
  set file_path = null
  where created_at < now() - interval '7 days'
    and file_path is not null;
end $$;

create function strip_import_costs() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.business_id is distinct from old.business_id then
    raise exception 'No autorizado';
  end if;
  if new.result is not null and not public.is_owner(new.business_id) then
    new.result := jsonb_set(
      new.result,
      '{lineas}',
      coalesce((
        select jsonb_agg(item - 'costo' - 'precio_compra')
        from jsonb_array_elements(coalesce(new.result->'lineas', '[]'::jsonb)) item
      ), '[]'::jsonb),
      true
    );
  end if;
  return new;
end $$;

create trigger import_jobs_strip_costs
before insert or update on import_jobs
for each row execute function strip_import_costs();

alter table master_products enable row level security;
alter table import_jobs enable row level security;
alter table ai_usage enable row level security;

create policy "miembros leen catálogo maestro" on master_products for select to authenticated
  using (
    (active and not draft and exists (select 1 from business_members bm where bm.user_id = auth.uid()))
    or is_platform_admin()
  );
create policy "superadmin crea catálogo maestro" on master_products for insert to authenticated
  with check (is_platform_admin());
create policy "superadmin edita catálogo maestro" on master_products for update to authenticated
  using (is_platform_admin()) with check (is_platform_admin());

create policy "miembros leen importaciones" on import_jobs for select to authenticated
  using (is_member(business_id));
create policy "miembros crean importaciones" on import_jobs for insert to authenticated
  with check (is_member(business_id) and user_id = auth.uid());
create policy "miembros editan importaciones" on import_jobs for update to authenticated
  using (is_member(business_id)) with check (is_member(business_id));

create policy "miembros leen uso de IA" on ai_usage for select to authenticated
  using (is_member(business_id) or is_platform_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'imports', 'imports', false, 10485760,
  array['text/csv', 'text/plain', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('master', 'master', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "miembros leen sus importaciones" on storage.objects for select to authenticated
  using (bucket_id = 'imports' and is_member(storage_object_business(name)));
create policy "miembros suben importaciones" on storage.objects for insert to authenticated
  with check (bucket_id = 'imports' and is_member(storage_object_business(name)));
create policy "miembros borran importaciones" on storage.objects for delete to authenticated
  using (bucket_id = 'imports' and is_member(storage_object_business(name)));

create policy "fotos maestras públicas" on storage.objects for select to public
  using (bucket_id = 'master');
create policy "superadmin sube fotos maestras" on storage.objects for insert to authenticated
  with check (bucket_id = 'master' and is_platform_admin());
create policy "superadmin reemplaza fotos maestras" on storage.objects for update to authenticated
  using (bucket_id = 'master' and is_platform_admin())
  with check (bucket_id = 'master' and is_platform_admin());
create policy "superadmin borra fotos maestras" on storage.objects for delete to authenticated
  using (bucket_id = 'master' and is_platform_admin());

-- Borrador para revisar en el superpanel. Sin códigos, precios ni fotos.
insert into master_products (name, brand, kind, presentation, volume_ml, units_per_pack, aliases, draft, active) values
  ('Aguardiente Antioqueño', 'Antioqueño', 'aguardiente', '750 ml', 750, 1, array['guaro','tapa azul'], true, true),
  ('Aguardiente Antioqueño', 'Antioqueño', 'aguardiente', '375 ml', 375, 1, array['media','media de aguardiente'], true, true),
  ('Aguardiente Antioqueño sin azúcar', 'Antioqueño', 'aguardiente', '750 ml', 750, 1, array['tapa azul sin azúcar'], true, true),
  ('Aguardiente Néctar verde', 'Néctar', 'aguardiente', '750 ml', 750, 1, array['nectar'], true, true),
  ('Ron Medellín 3 años', 'Ron Medellín', 'ron', '750 ml', 750, 1, array['ron medellin'], true, true),
  ('Ron Viejo de Caldas', 'Viejo de Caldas', 'ron', '750 ml', 750, 1, array['viejito'], true, true),
  ('Old Parr 12 años', 'Old Parr', 'whisky', '750 ml', 750, 1, array['old par'], true, true),
  ('Buchanan''s 12 años', 'Buchanan''s', 'whisky', '750 ml', 750, 1, array['buchanans'], true, true),
  ('Gato Negro', 'Gato Negro', 'vino', '750 ml', 750, 1, array['gato'], true, true),
  ('Poker', 'Poker', 'cerveza', 'lata 330 ml', 330, 1, array['pola'], true, true),
  ('Poker', 'Poker', 'cerveza', 'six-pack', null, 6, array['six de poker'], true, true),
  ('Águila', 'Águila', 'cerveza', 'lata 330 ml', 330, 1, array['aguila'], true, true),
  ('Club Colombia Dorada', 'Club Colombia', 'cerveza', 'lata 330 ml', 330, 1, array['club colombia'], true, true),
  ('Corona', 'Corona', 'cerveza', 'botella 355 ml', 355, 1, array['corona'], true, true),
  ('Coca-Cola', 'Coca-Cola', 'mezclador', '1,5 L', 1500, 1, array['coca cola','gaseosa'], true, true),
  ('Coca-Cola', 'Coca-Cola', 'mezclador', '400 ml', 400, 1, array['coca personal'], true, true),
  ('Agua Cristal', 'Cristal', 'mezclador', '600 ml', 600, 1, array['agua'], true, true),
  ('Ginger Ale Canada Dry', 'Canada Dry', 'mezclador', '400 ml', 400, 1, array['ginger'], true, true),
  ('Hielo', 'Genérico', 'hielo', 'bolsa 2 kg', null, 1, array['hielo en cubos'], true, true),
  ('Papas Margarita', 'Margarita', 'snack', '105 g', null, 1, array['papas'], true, true),
  ('Maní La Especial', 'La Especial', 'snack', '180 g', null, 1, array['mani'], true, true),
  ('Lucky Strike', 'Lucky Strike', 'cigarrillo', 'cajetilla x20', null, 20, array['lucky'], true, true),
  ('Marlboro Rojo', 'Marlboro', 'cigarrillo', 'cajetilla x20', null, 20, array['marlboro'], true, true)
on conflict (identity_key) do nothing;

revoke all on function master_products_search_text() from public, anon, authenticated;
revoke all on function search_master_products(text, text, boolean) from public, anon, authenticated;
revoke all on function match_catalog_lines(uuid, jsonb) from public, anon, authenticated;
revoke all on function add_products_from_master(uuid, jsonb) from public, anon, authenticated;
revoke all on function confirm_catalog_import(uuid, jsonb) from public, anon, authenticated;
revoke all on function ai_daily_limit(uuid) from public, anon, authenticated;
revoke all on function ai_reads_today(uuid) from public, anon, authenticated;
revoke all on function record_ai_usage(uuid, int) from public, anon, authenticated;
revoke all on function platform_ai_usage() from public, anon, authenticated;
revoke all on function purge_expired_imports() from public, anon, authenticated;
revoke all on function strip_import_costs() from public, anon, authenticated;
grant execute on function search_master_products(text, text, boolean) to authenticated;
grant execute on function match_catalog_lines(uuid, jsonb) to authenticated;
grant execute on function add_products_from_master(uuid, jsonb) to authenticated;
grant execute on function confirm_catalog_import(uuid, jsonb) to authenticated;
grant execute on function ai_daily_limit(uuid), ai_reads_today(uuid), record_ai_usage(uuid, int) to authenticated;
grant execute on function platform_ai_usage() to authenticated;
grant execute on function purge_expired_imports() to authenticated;
grant execute on function strip_import_costs() to authenticated;

grant select on master_products to authenticated;
grant insert, update on master_products to authenticated;
grant select, insert, update on import_jobs to authenticated;
grant select on ai_usage to authenticated;
