import { redirect } from "next/navigation";
import { createServerSupabase } from "./supabase/server";
import { resolveRequest } from "./store";

// El proxy solo revisa la sesión. Cada página y acción confirma que la cuenta
// pertenece al negocio de esta dirección.
export async function requireAdmin() {
  const supabase = await createServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/admin/login");

  const { store } = await resolveRequest();
  if (!store || store.id === "00000000-0000-0000-0000-000000000000") redirect("/admin/login?error=negocio");

  const { data: member } = await supabase.rpc("is_member", { business_id: store.id });
  if (!member) redirect("/admin/login?error=no-admin");

  return { supabase, business: store };
}
