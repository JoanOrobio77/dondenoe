import { Suspense } from "react";
import { updateSaleMargin } from "../../catalog-actions";
import { CatalogPicker, type CatalogHit } from "@/components/catalog-picker";
import { requireAdmin } from "@/lib/auth";
import { MASTER_KINDS } from "@/lib/import/kinds";

export const metadata = { title: "Agregar desde catálogo" };

export default function StoreCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tipo?: string; ok?: string; error?: string }>;
}) {
  return (
    <Suspense fallback={<p className="text-slate-500">Cargando catálogo...</p>}>
      <StoreCatalog searchParams={searchParams} />
    </Suspense>
  );
}

async function StoreCatalog({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tipo?: string; ok?: string; error?: string }>;
}) {
  const query = await searchParams;
  const { supabase, business, owner } = await requireAdmin();
  if (business.template !== "tienda") {
    return <p className="text-slate-600">El catálogo maestro es para la tienda.</p>;
  }
  const [{ data: products }, { data: categories }, { data: settings }] = await Promise.all([
    supabase.rpc("search_master_products", { p_query: query.q ?? "", p_kind: query.tipo || null, p_include_drafts: false }),
    supabase.from("categories").select("id, name").eq("business_id", business.id).order("sort_order"),
    supabase.from("business_settings").select("sale_margin_percent").eq("business_id", business.id).maybeSingle(),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-brand-900">Agregar desde catálogo</h1>
        <p className="mt-1 text-sm text-slate-600">Nada entra a la tienda hasta que confirmes precio, stock y categoría.</p>
      </div>
      {query.error && <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{query.error}</p>}
      {query.ok && <p className="rounded-xl bg-green-50 p-3 text-sm font-semibold text-green-800">{query.ok}</p>}
      {owner && (
        <form action={updateSaleMargin} className="flex flex-wrap items-end gap-3 rounded-2xl bg-white p-4 ring-1 ring-black/10">
          <label className="text-sm font-semibold">
            Margen para sugerir precio de venta (%)
            <input
              name="margin"
              type="number"
              min={0}
              max={500}
              defaultValue={settings?.sale_margin_percent ?? 30}
              className="mt-1 block w-28 rounded-xl border border-black/10 px-3 py-2"
            />
          </label>
          <button className="rounded-xl bg-black px-4 py-2 text-sm font-bold text-white">Guardar margen</button>
        </form>
      )}
      <form method="get" className="flex flex-wrap gap-2">
        <input name="q" defaultValue={query.q ?? ""} placeholder="Nombre, marca o alias" className="rounded-xl border border-black/10 px-3 py-2" />
        <select name="tipo" defaultValue={query.tipo ?? ""} className="rounded-xl border border-black/10 px-3 py-2">
          <option value="">Todos</option>
          {MASTER_KINDS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button className="rounded-xl bg-black px-4 py-2 text-sm font-bold text-white">Buscar</button>
      </form>
      <CatalogPicker products={(products ?? []) as CatalogHit[]} categories={categories ?? []} owner={owner} />
    </div>
  );
}
