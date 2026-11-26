import Link from "next/link";
import { Suspense } from "react";
import { importMasterCsv, saveMasterProduct, updateAiLimits, uploadMasterPhoto } from "../../catalog-actions";
import { requirePlatformAdmin } from "@/lib/auth";
import { kindLabel, MASTER_KINDS } from "@/lib/import/kinds";

const field = "mt-1 w-full rounded-xl border border-black/10 px-3 py-2";

export default function MasterCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tipo?: string; ok?: string; error?: string }>;
}) {
  return (
    <Suspense fallback={<p className="text-slate-500">Cargando catálogo...</p>}>
      <Catalog searchParams={searchParams} />
    </Suspense>
  );
}

async function Catalog({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tipo?: string; ok?: string; error?: string }>;
}) {
  const query = await searchParams;
  const { supabase } = await requirePlatformAdmin();
  const [{ data: products }, { data: usage }, { data: limits }] = await Promise.all([
    supabase.rpc("search_master_products", {
      p_query: query.q ?? "",
      p_kind: query.tipo || null,
      p_include_drafts: true,
    }),
    supabase.rpc("platform_ai_usage"),
    supabase.from("platform_settings").select("value").eq("key", "ai_daily_reads").maybeSingle(),
  ]);
  const rows = (products ?? []) as {
    id: string;
    name: string;
    brand: string;
    kind: string;
    presentation: string;
    volume_ml: number | null;
    units_per_pack: number;
    barcode: string | null;
    aliases: string[];
    active: boolean;
    draft: boolean;
  }[];
  const reads = (limits?.value ?? { basico: 10, completo: 10 }) as { basico?: number; completo?: number };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Catálogo maestro</h1>
          <p className="text-sm text-slate-600">Los borradores no aparecen en las tiendas hasta que los publiques.</p>
        </div>
        <Link href="/plataforma/catalogo/export" className="rounded-full bg-white px-4 py-2 text-sm font-bold ring-1 ring-black/10">
          Exportar CSV
        </Link>
      </div>
      {query.error && <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{query.error}</p>}
      {query.ok && <p className="rounded-xl bg-green-50 p-3 text-sm font-semibold text-green-800">Listo.</p>}

      <section className="rounded-2xl bg-white p-4 ring-1 ring-black/10">
        <h2 className="font-bold">Lecturas con IA, últimos 30 días</h2>
        <p className="mt-1 text-sm text-slate-500">La unidad es una llamada al modelo. El precio lo publica cada proveedor.</p>
        <form action={updateAiLimits} className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm font-semibold">
            Plan básico
            <input name="basico" type="number" min={0} max={100} defaultValue={reads.basico ?? 10} className={field} />
          </label>
          <label className="text-sm font-semibold">
            Plan completo
            <input name="completo" type="number" min={0} max={100} defaultValue={reads.completo ?? 10} className={field} />
          </label>
          <button className="rounded-xl bg-black px-4 py-2 text-sm font-bold text-white">Guardar límite diario</button>
        </form>
        <ul className="mt-3 space-y-1 text-sm">
          {((usage ?? []) as { business_id: string; business_name: string; units: number }[])
            .filter((row) => Number(row.units) > 0)
            .map((row) => (
              <li key={row.business_id} className="flex justify-between gap-3">
                <span>{row.business_name}</span>
                <span className="font-semibold">{row.units} lecturas</span>
              </li>
            ))}
        </ul>
      </section>

      <form method="get" className="flex flex-wrap gap-2">
        <input name="q" defaultValue={query.q ?? ""} placeholder="Buscar nombre, marca o alias" className="rounded-xl border border-black/10 px-3 py-2" />
        <select name="tipo" defaultValue={query.tipo ?? ""} className="rounded-xl border border-black/10 px-3 py-2">
          <option value="">Todos los tipos</option>
          {MASTER_KINDS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button className="rounded-xl bg-black px-4 py-2 text-sm font-bold text-white">Buscar</button>
      </form>

      <form action={saveMasterProduct} className="grid gap-3 rounded-2xl bg-white p-4 ring-1 ring-black/10 sm:grid-cols-3">
        <h2 className="font-bold sm:col-span-3">Nuevo producto</h2>
        <input name="name" required placeholder="Nombre" className={field} />
        <input name="brand" required placeholder="Marca" className={field} />
        <select name="kind" className={field}>
          {MASTER_KINDS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input name="presentation" required placeholder="Presentación, ej. 750 ml" className={field} />
        <input name="volume" type="number" min={1} placeholder="Volumen ml" className={field} />
        <input name="units" type="number" min={1} defaultValue={1} className={field} />
        <input name="barcode" placeholder="Código de barras" className={field} />
        <input name="aliases" placeholder="Alias separados por coma" className="rounded-xl border border-black/10 px-3 py-2 sm:col-span-2" />
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input name="active" type="checkbox" defaultChecked /> Activo
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input name="draft" type="checkbox" defaultChecked /> Borrador
        </label>
        <button className="rounded-xl bg-brand-700 px-4 py-2 font-bold text-white">Crear</button>
      </form>

      <form action={importMasterCsv} className="flex flex-wrap items-end gap-3 rounded-2xl bg-white p-4 ring-1 ring-black/10">
        <label className="text-sm font-semibold">
          Importar CSV como borrador
          <input name="file" type="file" accept=".csv,text/csv" required className="mt-1 block text-sm" />
        </label>
        <button className="rounded-xl bg-black px-4 py-2 text-sm font-bold text-white">Importar</button>
        <p className="text-xs text-slate-500">Columnas: nombre, marca, tipo, presentación, volumen_ml, unidades, alias separados por |. Sin precios ni códigos.</p>
      </form>

      <ul className="space-y-3">
        {rows.map((product) => (
          <li key={product.id} className="rounded-2xl bg-white p-4 ring-1 ring-black/10">
            <form action={saveMasterProduct} className="grid gap-2 sm:grid-cols-4">
              <input type="hidden" name="id" value={product.id} />
              <input name="name" defaultValue={product.name} className={field} />
              <input name="brand" defaultValue={product.brand} className={field} />
              <select name="kind" defaultValue={product.kind} className={field}>
                {MASTER_KINDS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <input name="presentation" defaultValue={product.presentation} className={field} />
              <input name="volume" type="number" defaultValue={product.volume_ml ?? ""} className={field} />
              <input name="units" type="number" defaultValue={product.units_per_pack} className={field} />
              <input name="barcode" defaultValue={product.barcode ?? ""} placeholder="Código" className={field} />
              <input name="aliases" defaultValue={(product.aliases ?? []).join(", ")} className={field} />
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input name="active" type="checkbox" defaultChecked={product.active} /> Activo
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input name="draft" type="checkbox" defaultChecked={product.draft} /> Borrador
              </label>
              <button className="rounded-xl bg-black px-3 py-2 text-sm font-bold text-white">Guardar</button>
              <p className="text-xs text-slate-500 sm:col-span-4">{kindLabel(product.kind)}{product.draft ? " · Borrador" : " · Publicado"}</p>
            </form>
            <form action={uploadMasterPhoto} className="mt-2 flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={product.id} />
              <input name="photo" type="file" accept="image/jpeg,image/png,image/webp" className="text-sm" />
              <button className="rounded-xl bg-white px-3 py-2 text-sm font-bold ring-1 ring-black/10">Subir foto</button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
