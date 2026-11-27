import { createHash, timingSafeEqual } from "node:crypto";

const BATCH = 100;

export type ExpiredImport = { id: string; file_path: string };

export type ImportCleaner = {
  listExpired: (cutoffIso: string) => Promise<ExpiredImport[]>;
  remove: (paths: string[]) => Promise<{ removed: string[]; error: string | null }>;
  clearPaths: (ids: string[]) => Promise<void>;
};

export type PurgeResult = {
  deleted: number;
  errors: { path: string; message: string }[];
};

export function cronAuthorized(header: string | null, secret: string | undefined) {
  if (!secret) return false;
  const received = createHash("sha256").update(header ?? "").digest();
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(received, expected);
}

export async function handlePurgeRequest(
  request: Request,
  secret: string | undefined,
  purge: () => Promise<PurgeResult>,
) {
  if (!cronAuthorized(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const result = await purge();
    console.info(`Purga de importaciones: ${result.deleted} archivos. Errores: ${result.errors.length}.`);
    for (const failure of result.errors) console.error("No se pudo borrar una importación", failure.message);
    return Response.json(result);
  } catch (error) {
    console.error("Purga de importaciones", error instanceof Error ? error.message : "error");
    return Response.json({ error: "No se pudo completar la purga" }, { status: 500 });
  }
}

async function removeBatch(cleaner: ImportCleaner, jobs: ExpiredImport[], errors: PurgeResult["errors"]) {
  if (jobs.length === 0) return [] as string[];
  const result = await cleaner.remove(jobs.map((job) => job.file_path));
  if (result.error && jobs.length > 1) {
    const middle = Math.ceil(jobs.length / 2);
    const left = await removeBatch(cleaner, jobs.slice(0, middle), errors);
    const right = await removeBatch(cleaner, jobs.slice(middle), errors);
    return [...left, ...right];
  }
  if (result.error) {
    errors.push({ path: jobs[0]?.file_path ?? "", message: result.error });
    return [];
  }
  const removed = new Set(result.removed);
  const ids: string[] = [];
  for (const job of jobs) {
    if (removed.has(job.file_path)) ids.push(job.id);
    else errors.push({ path: job.file_path, message: "Storage no confirmó el borrado" });
  }
  return ids;
}

export async function purgeExpiredImportFiles(cleaner: ImportCleaner, now = new Date()): Promise<PurgeResult> {
  const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const jobs = await cleaner.listExpired(cutoff);
  const errors: PurgeResult["errors"] = [];
  const cleared: string[] = [];
  for (let index = 0; index < jobs.length; index += BATCH) {
    const ids = await removeBatch(cleaner, jobs.slice(index, index + BATCH), errors);
    if (ids.length > 0) {
      await cleaner.clearPaths(ids);
      cleared.push(...ids);
    }
  }
  return { deleted: cleared.length, errors };
}
