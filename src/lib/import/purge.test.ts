import assert from "node:assert/strict";
import test from "node:test";
import { handlePurgeRequest, purgeExpiredImportFiles, type ExpiredImport, type ImportCleaner } from "./purge";

function cleaner(jobs: ExpiredImport[], fail = new Set<string>()): ImportCleaner & { removed: string[]; cleared: string[][] } {
  const state = { removed: [] as string[], cleared: [] as string[][] };
  return {
    ...state,
    async listExpired() {
      return jobs;
    },
    async remove(paths) {
      const removed: string[] = [];
      for (const path of paths) {
        if (fail.has(path) && paths.length === 1) return { removed: [], error: "falló el archivo" };
        if (!fail.has(path)) removed.push(path);
      }
      if (paths.some((path) => fail.has(path)) && paths.length > 1) return { removed: [], error: "falló el lote" };
      state.removed.push(...removed);
      return { removed, error: null };
    },
    async clearPaths(ids) {
      state.cleared.push(ids);
    },
  };
}

test("la purga sin secreto responde 401 y con secreto borra en Storage", async () => {
  const jobs = [
    { id: "job-1", file_path: "11111111-1111-1111-1111-111111111111/imports/a.csv" },
    { id: "job-2", file_path: "11111111-1111-1111-1111-111111111111/imports/b.csv" },
  ];
  const store = cleaner(jobs, new Set([jobs[1].file_path]));
  const denied = await handlePurgeRequest(new Request("http://local/api/cron/purgar-importaciones"), "secreto-de-prueba", async () => {
    throw new Error("no debía borrar");
  });
  assert.equal(denied.status, 401);
  const wrong = await handlePurgeRequest(
    new Request("http://local/api/cron/purgar-importaciones", { headers: { authorization: "Bearer otro" } }),
    "secreto-de-prueba",
    async () => {
      throw new Error("no debía borrar");
    },
  );
  assert.equal(wrong.status, 401);

  const accepted = await handlePurgeRequest(
    new Request("http://local/api/cron/purgar-importaciones", { headers: { authorization: "Bearer secreto-de-prueba" } }),
    "secreto-de-prueba",
    () => purgeExpiredImportFiles(store, new Date("2026-11-27T12:00:00.000Z")),
  );
  assert.equal(accepted.status, 200);
  const body = await accepted.json();
  assert.equal(body.deleted, 1);
  assert.equal(store.removed.length, 1);
  assert.deepEqual(store.cleared, [["job-1"]]);
  assert.equal(body.errors.length, 1);
});
