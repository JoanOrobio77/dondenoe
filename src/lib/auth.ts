import { redirect } from "next/navigation";
import { createServerSupabase } from "./supabase/server";

// El proxy solo hace una revisión optimista; cada página y acción del panel debe pasar por aquí.
export async function requireAdmin() {
  const supabase = await createServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/admin/login");

  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) redirect("/admin/login?error=no-admin");

  return supabase;
}
