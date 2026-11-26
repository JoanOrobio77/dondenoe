import { Suspense } from "react";
import { deleteService, saveService } from "../../agenda-actions";
import { requireAdmin } from "@/lib/auth";
import { formatCOP } from "@/lib/format";

export const metadata = { title: "Servicios" };

const field = "mt-1 w-full rounded-xl border border-black/10 px-3 py-2";

export default function ServicesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return (
    <Suspense fallback={<p className="text-slate-500">Cargando servicios...</p>}>
      <Services searchParams={searchParams} />
    </Suspense>
  );
}

async function Services({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { supabase, business, owner } = await requireAdmin();
  if (business.template !== "agenda") {
    return <p className="text-slate-600">Los servicios de la agenda están en un negocio con esa plantilla.</p>;
  }
  const query = await searchParams;
  const { data: services } = await supabase
    .from("products")
    .select("id, name, price, duration_minutes, active")
    .eq("business_id", business.id)
    .eq("kind", "service")
    .order("name")
    .throwOnError();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-brand-900">Servicios</h1>
      {query.error && <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{query.error}</p>}
      <ul className="grid gap-3">
        {(services ?? []).map((service) => (
          <li key={service.id} className="rounded-2xl bg-white p-4 ring-1 ring-black/10">
            <form action={saveService} className="grid gap-3 sm:grid-cols-4">
              <input type="hidden" name="id" value={service.id} />
              <label className="text-sm font-semibold sm:col-span-2">
                Nombre
                <input name="name" defaultValue={service.name} className={field} />
              </label>
              <label className="text-sm font-semibold">
                Minutos
                <input name="duration" type="number" min={5} max={480} defaultValue={service.duration_minutes ?? 30} className={field} />
              </label>
              <label className="text-sm font-semibold">
                Precio
                {owner ? (
                  <input name="price" type="number" min={0} defaultValue={service.price} className={field} />
                ) : (
                  <span className="mt-1 block py-2">{formatCOP(service.price)}</span>
                )}
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input name="active" type="checkbox" defaultChecked={service.active} /> Activo
              </label>
              <button className="rounded-xl bg-black px-4 py-2 text-sm font-bold text-white">Guardar</button>
            </form>
            {owner && (
              <form action={deleteService} className="mt-2">
                <input type="hidden" name="id" value={service.id} />
                <button className="text-sm font-semibold text-red-700">Borrar</button>
              </form>
            )}
          </li>
        ))}
      </ul>
      {owner ? (
        <form action={saveService} className="grid gap-3 rounded-2xl bg-white p-4 ring-1 ring-black/10 sm:grid-cols-4">
          <h2 className="font-bold text-brand-900 sm:col-span-4">Nuevo servicio</h2>
          <input name="name" required placeholder="Nombre" className="rounded-xl border border-black/10 px-3 py-2 sm:col-span-2" />
          <input name="duration" type="number" min={5} max={480} defaultValue={30} required className="rounded-xl border border-black/10 px-3 py-2" />
          <input name="price" type="number" min={0} required placeholder="Precio" className="rounded-xl border border-black/10 px-3 py-2" />
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input name="active" type="checkbox" defaultChecked /> Activo
          </label>
          <button className="rounded-xl bg-brand-700 px-4 py-2 font-bold text-white">Crear</button>
        </form>
      ) : (
        <p className="text-sm text-slate-500">El precio y los servicios nuevos los define el dueño. Tú puedes cambiar la duración y apagar un servicio.</p>
      )}
    </div>
  );
}
