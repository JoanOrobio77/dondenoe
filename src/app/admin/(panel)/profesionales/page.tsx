import { Suspense } from "react";
import {
  addBlock,
  addHour,
  deleteBlock,
  deleteHour,
  deleteProfessional,
  saveProfessional,
  saveProfessionalServices,
} from "../../agenda-actions";
import { requireAdmin } from "@/lib/auth";
import { formatWhen } from "@/lib/zoned-time";

export const metadata = { title: "Profesionales" };

const WEEKDAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const field = "rounded-xl border border-black/10 px-3 py-2";

export default function ProfessionalsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return (
    <Suspense fallback={<p className="text-slate-500">Cargando profesionales...</p>}>
      <Professionals searchParams={searchParams} />
    </Suspense>
  );
}

async function Professionals({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { supabase, business, owner } = await requireAdmin();
  if (business.template !== "agenda") {
    return <p className="text-slate-600">Los profesionales están en un negocio con plantilla de agenda.</p>;
  }
  const query = await searchParams;
  const [{ data: people }, { data: services }, { data: hours }, { data: blocks }, { data: links }, { data: members }] =
    await Promise.all([
      supabase.from("professionals").select("id, name, photo_url, active, user_id").eq("business_id", business.id).order("sort_order").throwOnError(),
      supabase.from("products").select("id, name").eq("business_id", business.id).eq("kind", "service").eq("active", true).order("name").throwOnError(),
      supabase.from("professional_hours").select("id, professional_id, weekday, start_time, end_time").eq("business_id", business.id).order("weekday").throwOnError(),
      supabase.from("professional_blocks").select("id, professional_id, starts_at, ends_at, reason").eq("business_id", business.id).order("starts_at").throwOnError(),
      supabase.from("professional_services").select("professional_id, product_id").eq("business_id", business.id).throwOnError(),
      supabase.from("business_members").select("user_id, role").eq("business_id", business.id).throwOnError(),
    ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-brand-900">Profesionales</h1>
      {query.error && <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{query.error}</p>}
      <form action={saveProfessional} className="grid gap-3 rounded-2xl bg-white p-4 ring-1 ring-black/10 sm:grid-cols-3">
        <h2 className="font-bold sm:col-span-3">Nueva persona</h2>
        <input name="name" required placeholder="Nombre" className={field} />
        <input name="photo" placeholder="Enlace de la foto (opcional)" className={field} />
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input name="active" type="checkbox" defaultChecked /> Activo
        </label>
        <button className="rounded-xl bg-brand-700 px-4 py-2 font-bold text-white">Agregar</button>
      </form>

      {(people ?? []).map((person) => {
        const ownHours = (hours ?? []).filter((hour) => hour.professional_id === person.id);
        const ownBlocks = (blocks ?? []).filter((block) => block.professional_id === person.id);
        const ownServices = new Set((links ?? []).filter((link) => link.professional_id === person.id).map((link) => link.product_id));
        return (
          <section key={person.id} className="space-y-4 rounded-3xl bg-white p-4 ring-1 ring-black/10">
            <form action={saveProfessional} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="id" value={person.id} />
              <input name="name" defaultValue={person.name} className={field} />
              <input name="photo" defaultValue={person.photo_url ?? ""} placeholder="Enlace de la foto" className={field} />
              <select name="member" defaultValue={person.user_id ?? ""} className={field}>
                <option value="">Sin cuenta del equipo</option>
                {(members ?? []).map((member) => (
                  <option key={member.user_id} value={member.user_id}>
                    {member.role === "owner" ? "Dueño" : "Equipo"} {member.user_id.slice(0, 8)}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input name="active" type="checkbox" defaultChecked={person.active} /> Activo
              </label>
              <button className="rounded-xl bg-black px-4 py-2 text-sm font-bold text-white">Guardar datos</button>
            </form>
            {owner && (
              <form action={deleteProfessional}>
                <input type="hidden" name="id" value={person.id} />
                <button className="text-sm font-semibold text-red-700">Borrar</button>
              </form>
            )}

            <form action={saveProfessionalServices}>
              <input type="hidden" name="professionalId" value={person.id} />
              <p className="text-sm font-bold">Servicios que realiza</p>
              <div className="mt-2 flex flex-wrap gap-3">
                {(services ?? []).map((service) => (
                  <label key={service.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="serviceId" value={service.id} defaultChecked={ownServices.has(service.id)} />
                    {service.name}
                  </label>
                ))}
              </div>
              <button className="mt-2 rounded-xl bg-black px-3 py-2 text-sm font-bold text-white">Guardar servicios</button>
            </form>

            <div>
              <p className="text-sm font-bold">Horario semanal</p>
              <ul className="mt-2 space-y-1 text-sm">
                {ownHours.map((hour) => (
                  <li key={hour.id} className="flex items-center justify-between gap-3">
                    <span>
                      {WEEKDAYS[hour.weekday]} {String(hour.start_time).slice(0, 5)}–{String(hour.end_time).slice(0, 5)}
                    </span>
                    <form action={deleteHour}>
                      <input type="hidden" name="id" value={hour.id} />
                      <button className="font-semibold text-red-700">Quitar</button>
                    </form>
                  </li>
                ))}
              </ul>
              <form action={addHour} className="mt-2 flex flex-wrap gap-2">
                <input type="hidden" name="professionalId" value={person.id} />
                <select name="weekday" className={field}>
                  {WEEKDAYS.map((label, index) => (
                    <option key={label} value={index}>
                      {label}
                    </option>
                  ))}
                </select>
                <input name="start" type="time" required className={field} />
                <input name="end" type="time" required className={field} />
                <button className="rounded-xl bg-black px-3 py-2 text-sm font-bold text-white">Agregar bloque</button>
              </form>
            </div>

            <div>
              <p className="text-sm font-bold">Bloqueos</p>
              <ul className="mt-2 space-y-1 text-sm">
                {ownBlocks.map((block) => (
                  <li key={block.id} className="flex items-center justify-between gap-3">
                    <span>
                      {formatWhen(block.starts_at, business.timezone)} — {formatWhen(block.ends_at, business.timezone)}
                      {block.reason ? ` · ${block.reason}` : ""}
                    </span>
                    <form action={deleteBlock}>
                      <input type="hidden" name="id" value={block.id} />
                      <button className="font-semibold text-red-700">Quitar</button>
                    </form>
                  </li>
                ))}
              </ul>
              <form action={addBlock} className="mt-2 grid gap-2 sm:grid-cols-2">
                <input type="hidden" name="professionalId" value={person.id} />
                <input name="starts" type="datetime-local" required className={field} />
                <input name="ends" type="datetime-local" required className={field} />
                <input name="reason" placeholder="Vacaciones, almuerzo, festivo" className={field} />
                <button className="rounded-xl bg-black px-3 py-2 text-sm font-bold text-white">Agregar bloqueo</button>
              </form>
            </div>
          </section>
        );
      })}
    </div>
  );
}
