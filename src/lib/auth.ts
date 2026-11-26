import { cache } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { isPlatformConsoleHost } from "./platform";
import { createServerSupabase } from "./supabase/server";
import { resolveRequest } from "./store";

// El proxy solo revisa la sesión. Cada página y acción confirma que la cuenta
// pertenece al negocio de esta dirección.
export const requireAdmin = cache(async () => {
  const supabase = await createServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/admin/login");

  const { store } = await resolveRequest();
  if (!store || store.id === "00000000-0000-0000-0000-000000000000") redirect("/admin/login?error=negocio");

  const { data: member } = await supabase.rpc("is_member", { business_id: store.id });
  if (!member) redirect("/admin/login?error=no-admin");

  const { data: owner } = await supabase.rpc("is_owner", { business_id: store.id });
  return { supabase, business: store, owner: owner === true };
});

export async function requireOwner() {
  const session = await requireAdmin();
  if (!session.owner) redirect("/admin");
  return session;
}

// El proxy solo mira el dominio y la sesión. Cada página y acción vuelve a comprobarlo.
export const requirePlatformAdmin = cache(async () => {
  const headerStore = await headers();
  const host = headerStore.get("x-business-host") || headerStore.get("x-forwarded-host") || headerStore.get("host");
  if (!isPlatformConsoleHost(host)) notFound();

  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/plataforma/login");

  const { data: allowed, error } = await supabase.rpc("is_platform_admin");
  if (error || allowed !== true) redirect("/plataforma/login?error=no-admin");

  return { supabase, user: data.user };
});
