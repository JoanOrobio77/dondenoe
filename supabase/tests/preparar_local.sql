-- Solo para Postgres local. Supabase ya trae auth, storage y los roles anon y authenticated.
-- No correr esto en el proyecto de producción.

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

do $$ begin
  create role anon nologin;
exception when duplicate_object then null;
end $$;

do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null;
end $$;

create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key,
  name text,
  public boolean,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text,
  name text,
  owner uuid,
  created_at timestamptz default now()
);

alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated;
