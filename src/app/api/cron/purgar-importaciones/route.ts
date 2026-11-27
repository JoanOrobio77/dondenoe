import { handlePurgeRequest } from "@/lib/import/purge";
import { purgeWithAdmin } from "@/lib/import/purge-admin";
import { createAdminSupabase } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  return handlePurgeRequest(request, process.env.CRON_SECRET, () => purgeWithAdmin(createAdminSupabase()));
}
