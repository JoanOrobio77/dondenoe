-- Dos sesiones reales. No corre dentro de aislamiento.sql: esa prueba vive en una
-- transacción sin commit y la otra conexión no vería el negocio.
-- Uso: aplicar schema, grants y este archivo, luego lanzar las dos sesiones del comentario final.

insert into auth.users (id, email)
values ('cccccccc-cccc-cccc-cccc-ccccccccccc1', 'reserva@example.com')
on conflict (id) do nothing;

insert into businesses (id, slug, name, plan, timezone)
values ('cccccccc-cccc-cccc-cccc-ccccccccccc2', 'reserva-concurrente', 'Reserva', 'basico', 'America/Bogota')
on conflict (id) do nothing;

insert into business_members (business_id, user_id, role)
values ('cccccccc-cccc-cccc-cccc-ccccccccccc2', 'cccccccc-cccc-cccc-cccc-ccccccccccc1', 'owner')
on conflict do nothing;

insert into platform_settings (key, value)
values ('ai_daily_reads', '{"basico":1,"completo":1}'::jsonb)
on conflict (key) do update set value = excluded.value;

delete from ai_usage where business_id = 'cccccccc-cccc-cccc-cccc-ccccccccccc2';
