import Link from "next/link";
import { Suspense } from "react";
import { startImport } from "../../import-actions";
import { requireAdmin } from "@/lib/auth";
import { aiConfigured } from "@/lib/ai/client";

export const metadata = { title: "Importar lista" };

export default function ImportPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  return (
    <Suspense fallback={<p className="text-slate-500">Cargando importación...</p>}>
      <Import searchParams={searchParams} />
    </Suspense>
  );
}

async function Import({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const query = await searchParams;
  const { business } = await requireAdmin();
  if (business.template !== "tienda") return <p className="text-slate-600">La importación es para la tienda.</p>;
  const vision = aiConfigured();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-brand-900">Importar lista o factura</h1>
      <p className="text-sm text-slate-600">
        Sube un Excel, un CSV, una foto o un PDF. Nada se guarda en la tienda hasta la revisión. No envíes datos de clientes.
      </p>
      {!vision && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">
          La lectura de fotos y PDF no está configurada. Excel y CSV siguen disponibles.
        </p>
      )}
      {query.error && <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{query.error}</p>}
      {query.ok && (
        <p className="rounded-xl bg-green-50 p-3 text-sm font-semibold text-green-800">
          La importación quedó guardada. Revísala en <Link href="/admin/inventario" className="underline">Inventario</Link>.
        </p>
      )}
      <form action={startImport} className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-black/10">
        <input name="file" type="file" required accept=".csv,.xlsx,image/jpeg,image/png,image/webp,application/pdf" className="block text-sm" />
        <p className="text-xs text-slate-500">Máximo 10 MB. Un PDF puede tener hasta 5 páginas.</p>
        <button className="rounded-xl bg-brand-700 px-4 py-3 font-bold text-white">Continuar a la revisión</button>
      </form>
    </div>
  );
}
