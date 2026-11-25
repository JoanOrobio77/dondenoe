import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { createZone, updateZone } from "../../actions";

export const metadata = { title: "Zonas · DondeNoe" };

const inputClass = "rounded-lg border border-brand-100 px-3 py-2";

export default function ZonesPage() {
  return (
    <Suspense fallback={<p className="text-slate-500">Cargando zonas...</p>}>
      <Zones />
    </Suspense>
  );
}

async function Zones() {
  const supabase = await requireAdmin();
  const { data: zones } = await supabase.from("delivery_zones").select("id, name, fee, active").order("fee").throwOnError();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-brand-900">Zonas de domicilio</h1>
      <form action={createZone} className="flex flex-wrap gap-2 rounded-2xl bg-white p-4 ring-1 ring-brand-100">
        <input name="name" required placeholder="Nombre de la zona" className={inputClass} />
        <input name="fee" type="number" min={0} required placeholder="Tarifa" className={`${inputClass} w-32`} />
        <button className="rounded-xl bg-brand-700 px-4 py-2 font-bold text-white">Agregar</button>
      </form>
      <ul className="space-y-3">
        {zones.map((zone) => (
          <li key={zone.id}>
            <form action={updateZone} className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 ring-1 ring-brand-100">
              <input type="hidden" name="zoneId" value={zone.id} />
              <input name="name" defaultValue={zone.name} className={inputClass} />
              <input name="fee" type="number" min={0} defaultValue={zone.fee} className={`${inputClass} w-32`} aria-label="Tarifa" />
              <label className="flex items-center gap-1 text-sm">
                <input type="checkbox" name="active" defaultChecked={zone.active} />
                Activa
              </label>
              <button className="rounded-lg bg-brand-700 px-3 py-2 text-sm font-bold text-white">Guardar</button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
