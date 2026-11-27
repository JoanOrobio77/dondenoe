import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { purgeExpiredImportFiles, type ImportCleaner } from "./purge";

export function cleanerFromAdmin(admin: SupabaseClient): ImportCleaner {
  return {
    async listExpired(cutoffIso) {
      const { data, error } = await admin
        .from("import_jobs")
        .select("id, file_path")
        .not("file_path", "is", null)
        .lt("created_at", cutoffIso);
      if (error) throw new Error(error.message);
      return (data ?? []).flatMap((row) => (row.file_path ? [{ id: row.id, file_path: row.file_path }] : []));
    },
    async remove(paths) {
      const { data, error } = await admin.storage.from("imports").remove(paths);
      if (error) return { removed: [], error: error.message };
      const names = new Set((data ?? []).map((file) => file.name));
      const removed = paths.filter((path) => [...names].some((name) => path === name || path.endsWith(`/${name}`)));
      return { removed, error: null };
    },
    async clearPaths(ids) {
      const { error } = await admin.from("import_jobs").update({ file_path: null }).in("id", ids);
      if (error) throw new Error(error.message);
    },
  };
}

export function purgeWithAdmin(admin: SupabaseClient) {
  return purgeExpiredImportFiles(cleanerFromAdmin(admin));
}
