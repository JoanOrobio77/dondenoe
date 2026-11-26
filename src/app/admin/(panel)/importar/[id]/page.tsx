import { Suspense } from "react";
import { mapImportColumns } from "../../../import-actions";
import { ImportReview, type ReviewLine } from "@/components/import-review";
import { requireAdmin } from "@/lib/auth";

const field = "rounded-xl border border-black/10 px-3 py-2";

export default function ImportJobPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <Suspense fallback={<p className="text-slate-500">Cargando revisión...</p>}>
      <Job params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Job({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const { supabase, business, owner } = await requireAdmin();
  if (business.template !== "tienda") return <p>La importación es para la tienda.</p>;
  const { data: job } = await supabase
    .from("import_jobs")
    .select("id, result, status")
    .eq("id", id)
    .eq("business_id", business.id)
    .maybeSingle();
  if (!job) return <p>No encontramos esa importación.</p>;
  const result = (job.result ?? {}) as { headers?: string[]; rows?: string[][]; lineas?: ReviewLine[] };
  const [{ data: categories }, { data: masters }] = await Promise.all([
    supabase.from("categories").select("id, name").eq("business_id", business.id).order("sort_order"),
    supabase.rpc("search_master_products", { p_query: "", p_kind: null, p_include_drafts: false }),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-brand-900">Revisar importación</h1>
      {query.error && <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{query.error}</p>}
      {!result.lineas && result.headers && (
        <form action={mapImportColumns} className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-black/10">
          <input type="hidden" name="id" value={job.id} />
          <p className="text-sm text-slate-600">Indica qué columna es cada dato. En una factura, el valor suele ser el costo.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Column name="name" label="Nombre" headers={result.headers} />
            <Column name="presentation" label="Presentación" headers={result.headers} optional />
            {owner && <Column name="cost" label="Costo" headers={result.headers} optional />}
            <Column name="price" label="Precio de venta" headers={result.headers} optional />
            <Column name="stock" label="Cantidad" headers={result.headers} optional />
            <Column name="barcode" label="Código de barras" headers={result.headers} optional />
          </div>
          <div className="overflow-x-auto text-sm">
            <table>
              <tbody>
                {(result.rows ?? []).map((row, index) => (
                  <tr key={index}>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className="border border-black/5 px-2 py-1">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="rounded-xl bg-black px-4 py-2 font-bold text-white">Ver la revisión</button>
        </form>
      )}
      {result.lineas && (
        <ImportReview
          jobId={job.id}
          lines={result.lineas}
          categories={categories ?? []}
          masters={(masters ?? []) as { id: string; name: string; presentation: string }[]}
          owner={owner}
        />
      )}
    </div>
  );
}

function Column({ name, label, headers, optional }: { name: string; label: string; headers: string[]; optional?: boolean }) {
  return (
    <label className="text-sm font-semibold">
      {label}
      <select name={name} className={`mt-1 w-full ${field}`} defaultValue={optional ? "-1" : "0"}>
        {optional && <option value="-1">No está</option>}
        {headers.map((header, index) => (
          <option key={`${header}-${index}`} value={index}>
            {header || `Columna ${index + 1}`}
          </option>
        ))}
      </select>
    </label>
  );
}
