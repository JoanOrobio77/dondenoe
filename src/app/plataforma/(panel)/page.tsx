import { Suspense } from "react";
import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth";
import { updateGraceDays } from "../actions";

export const metadata = { title: "Negocios · Plataforma" };

const STATUS: Record<string, string> = {
  trial: "Prueba",
  active: "Activo",
  past_due: "Pago pendiente",
  suspended: "Suspendido",
};

const PLAN: Record<string, string> = { basico: "Básico", completo: "Completo" };

type Overview = {
  id: string;
  slug: string;
  name: string;
  plan: string;
  status: string;
  trial_ends_at: string | null;
  paid_until: string | null;
  products: number;
  orders_month: number;
};

function when(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: "America/Bogota" }).format(new Date(value));
}

export default function PlatformHome({ searchParams }: PageProps<"/plataforma">) {
  return (
    <Suspense fallback={<p className="text-slate-500">Cargando negocios...</p>}>
      <Home searchParams={searchParams} />
    </Suspense>
  );
}

async function Home({ searchParams }: { searchParams: Promise<{ q?: string; ok?: string; error?: string }> }) {
  const { supabase } = await requirePlatformAdmin();
  const query = await searchParams;
  const needle = (query.q ?? "").trim().toLowerCase();
  const [{ data, error }, settings] = await Promise.all([
    supabase.rpc("platform_business_overview"),
    supabase.from("platform_settings").select("value").eq("key", "past_due_grace_days").maybeSingle(),
  ]);
  const days = typeof settings.data?.value === "number" ? settings.data.value : 5;
  const rows = ((data ?? []) as Overview[]).filter((row) => {
    if (!needle) return true;
    return row.name.toLowerCase().includes(needle) || row.slug.includes(needle);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl font-bold text-brand-900">Negocios</h1>
        <form className="flex gap-2">
          <input
            name="q"
            defaultValue={query.q ?? ""}
            placeholder="Buscar nombre o slug"
            className="rounded-xl border border-brand-100 px-3 py-2 outline-brand-700"
          />
          <button className="rounded-xl bg-white px-4 py-2 text-sm font-semibold ring-1 ring-black/10">Buscar</button>
        </form>
      </div>

      {query.ok && <p className="rounded-2xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">{query.ok}</p>}
      {query.error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{query.error}</p>}
      {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">No pude cargar los negocios.</p>}

      <form action={updateGraceDays} className="flex flex-wrap items-end gap-3 rounded-2xl bg-white p-4 ring-1 ring-black/5">
        <label className="text-sm font-semibold text-slate-700">
          Días de mora antes de cerrar la tienda
          <input
            name="days"
            type="number"
            min={0}
            max={60}
            defaultValue={days}
            className="mt-1 block w-28 rounded-xl border border-brand-100 px-3 py-2 outline-brand-700"
          />
        </label>
        <button className="rounded-xl bg-brand-700 px-4 py-2 text-sm font-bold text-white">Guardar</button>
        <p className="text-sm text-slate-500">Un negocio suspendido se cierra de inmediato. Uno con pago pendiente sigue abierto estos días.</p>
      </form>

      <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-black/5">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Negocio</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Fin de prueba</th>
              <th className="px-4 py-3">Pagado hasta</th>
              <th className="px-4 py-3">Productos</th>
              <th className="px-4 py-3">Pedidos del mes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-black/5">
                <td className="px-4 py-3">
                  <Link href={`/plataforma/${row.id}`} className="font-bold text-brand-800">
                    {row.name}
                  </Link>
                  <p className="text-slate-500">{row.slug}</p>
                </td>
                <td className="px-4 py-3">{PLAN[row.plan] ?? row.plan}</td>
                <td className="px-4 py-3">{STATUS[row.status] ?? row.status}</td>
                <td className="px-4 py-3">{when(row.trial_ends_at)}</td>
                <td className="px-4 py-3">{when(row.paid_until)}</td>
                <td className="px-4 py-3">{row.products}</td>
                <td className="px-4 py-3">{row.orders_month}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-slate-500">
                  No hay negocios con esa búsqueda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
