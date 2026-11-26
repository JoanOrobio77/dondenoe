import "server-only";
import { createClient } from "@supabase/supabase-js";

// Solo para invitar, buscar o borrar usuarios de Auth.
// La clave de servicio no se usa para leer ni escribir las tablas del negocio.
export function createAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
