import Link from "next/link";
import { createManualAppointment, moveAppointment, setAppointmentStatus } from "@/app/admin/agenda-actions";
import { formatCOP } from "@/lib/format";
import type { Store } from "@/lib/types";
import { addIsoDays, formatClock, formatDayLabel, formatWhen, toLocalInput, zonedDateKey, zonedDayStart } from "@/lib/zoned-time";
import { appointmentReminder, whatsappLink } from "@/lib/whatsapp";
import type { createServerSupabase } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createServerSupabase>>;

const STATUS: Record<string, string> = {
  pendiente: "Pendiente",
  confirmada: "Confirmada",
  completada: "Completada",
  cancelada: "Cancelada",
  no_asistio: "No asistió",
};

const COLOR: Record<string, string> = {
  pendiente: "bg-amber-100 text-amber-950",
  confirmada: "bg-sky-100 text-sky-950",
  completada: "bg-green-100 text-green-900",
  cancelada: "bg-slate-200 text-slate-600",
  no_asistio: "bg-red-100 text-red-900",
};

type Appointment = {
  id: string;
  number: number;
  status: string;
  starts_at: string;
  ends_at: string;
  price: number;
  notes: string | null;
  customers: { name: string; phone: string } | { name: string; phone: string }[] | null;
  professionals: { id: string; name: string } | { id: string; name: string }[] | null;
  products: { name: string } | { name: string }[] | null;
};

function one<T>(value: T | T[] | null) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

export async function AgendaBoard({
  supabase,
  business,
  day,
  view,
  error,
}: {
  supabase: Client;
  business: Store;
  day: string;
  view: "dia" | "semana";
  error?: string;
}) {
  const span = view === "semana" ? 7 : 1;
  const from = zonedDayStart(day, business.timezone).toISOString();
  const to = zonedDayStart(addIsoDays(day, span), business.timezone).toISOString();
  const days = Array.from({ length: span }, (_, index) => addIsoDays(day, index));
  const [{ data: appointments }, { data: professionals }, { data: services }] = await Promise.all([
    supabase
      .from("appointments")
      .select("id, number, status, starts_at, ends_at, price, notes, customers(name, phone), professionals(id, name), products(name)")
      .eq("business_id", business.id)
      .gte("starts_at", from)
      .lt("starts_at", to)
      .order("starts_at")
      .throwOnError(),
    supabase.from("professionals").select("id, name, active").eq("business_id", business.id).order("sort_order").throwOnError(),
    supabase
      .from("products")
      .select("id, name")
      .eq("business_id", business.id)
      .eq("kind", "service")
      .eq("active", true)
      .order("name")
      .throwOnError(),
  ]);

  const rows = (appointments ?? []) as Appointment[];
  const people = professionals ?? [];
  const previous = addIsoDays(day, view === "semana" ? -7 : -1);
  const next = addIsoDays(day, view === "semana" ? 7 : 1);
  const today = zonedDateKey(new Date(), business.timezone);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">{view === "semana" ? "Semana" : "Día"}</h1>
          <p className="text-sm text-slate-600">{formatDayLabel(day, business.timezone)}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm font-bold">
          <Link className="rounded-full bg-white px-3 py-2 ring-1 ring-black/10" href={`/admin?dia=${previous}&vista=${view}`}>
            Anterior
          </Link>
          <Link className="rounded-full bg-white px-3 py-2 ring-1 ring-black/10" href={`/admin?dia=${today}&vista=${view}`}>
            Hoy
          </Link>
          <Link className="rounded-full bg-white px-3 py-2 ring-1 ring-black/10" href={`/admin?dia=${next}&vista=${view}`}>
            Siguiente
          </Link>
          <Link className={`rounded-full px-3 py-2 ${view === "dia" ? "bg-black text-white" : "bg-white ring-1 ring-black/10"}`} href={`/admin?dia=${day}&vista=dia`}>
            Día
          </Link>
          <Link className={`rounded-full px-3 py-2 ${view === "semana" ? "bg-black text-white" : "bg-white ring-1 ring-black/10"}`} href={`/admin?dia=${day}&vista=semana`}>
            Semana
          </Link>
        </div>
      </div>
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}

      {people.length === 0 && <p className="text-slate-500">Agrega un profesional para ver la agenda.</p>}
      {people.map((person) => (
        <section key={person.id} className="rounded-3xl bg-white p-4 ring-1 ring-black/10">
          <h2 className="font-bold text-brand-900">
            {person.name}
            {!person.active && <span className="ml-2 text-sm font-semibold text-slate-400">Inactivo</span>}
          </h2>
          <div className={view === "semana" ? "mt-3 grid gap-3 lg:grid-cols-7" : "mt-3 space-y-3"}>
            {days.map((date) => {
              const items = rows.filter((row) => {
                const who = one(row.professionals);
                return who?.id === person.id && zonedDateKey(new Date(row.starts_at), business.timezone) === date;
              });
              return (
                <div key={date}>
                  {view === "semana" && <p className="mb-2 text-xs font-bold uppercase text-slate-500">{formatDayLabel(date, business.timezone)}</p>}
                  {items.length === 0 && <p className="text-sm text-slate-400">Sin citas</p>}
                  <div className="space-y-2">
                    {items.map((row) => {
                      const customer = one(row.customers);
                      const service = one(row.products);
                      const open = row.status === "pendiente" || row.status === "confirmada";
                      return (
                        <article key={row.id} className={`rounded-2xl p-3 ${COLOR[row.status] ?? "bg-slate-100"}`}>
                          <p className="text-sm font-bold">
                            {formatClock(row.starts_at, business.timezone)}–{formatClock(row.ends_at, business.timezone)} · #{row.number}
                          </p>
                          <p className="text-sm">
                            {customer?.name ?? "Cliente"} · {service?.name ?? "Servicio"}
                          </p>
                          <p className="text-xs font-semibold">{STATUS[row.status] ?? row.status} · {formatCOP(row.price)}</p>
                          {row.notes && <p className="mt-1 text-xs">{row.notes}</p>}
                          {customer && (
                            <a
                              className="mt-2 inline-block text-xs font-bold underline"
                              href={whatsappLink(
                                appointmentReminder(
                                  customer.name,
                                  business.name,
                                  formatWhen(row.starts_at, business.timezone),
                                  service?.name ?? "tu cita",
                                ),
                                customer.phone,
                              )}
                              target="_blank"
                              rel="noopener"
                            >
                              Recordar por WhatsApp
                            </a>
                          )}
                          {open && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {row.status === "pendiente" && (
                                <StatusButton id={row.id} status="confirmada" label="Confirmar" day={day} view={view} />
                              )}
                              <StatusButton id={row.id} status="completada" label="Completada" day={day} view={view} />
                              <StatusButton id={row.id} status="no_asistio" label="No asistió" day={day} view={view} />
                              <StatusButton id={row.id} status="cancelada" label="Cancelar" day={day} view={view} />
                            </div>
                          )}
                          {open && (
                            <form action={moveAppointment} className="mt-2 flex flex-wrap items-center gap-2">
                              <input type="hidden" name="id" value={row.id} />
                              <input type="hidden" name="dia" value={day} />
                              <input type="hidden" name="vista" value={view} />
                              <input
                                name="starts"
                                type="datetime-local"
                                defaultValue={toLocalInput(row.starts_at, business.timezone)}
                                className="rounded-lg border border-black/10 bg-white px-2 py-1 text-xs text-black"
                              />
                              <button className="rounded-lg bg-black px-2 py-1 text-xs font-bold text-white">Mover</button>
                            </form>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <section className="rounded-3xl bg-white p-4 ring-1 ring-black/10">
        <h2 className="font-bold text-brand-900">Cita por teléfono</h2>
        <p className="mt-1 text-sm text-slate-500">No escribas diagnósticos ni información médica.</p>
        <form action={createManualAppointment} className="mt-3 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="dia" value={day} />
          <input type="hidden" name="vista" value={view} />
          <input name="name" required placeholder="Nombre" className="rounded-xl border border-black/10 px-3 py-2" />
          <input name="phone" required inputMode="numeric" placeholder="Celular" className="rounded-xl border border-black/10 px-3 py-2" />
          <select name="serviceId" required className="rounded-xl border border-black/10 px-3 py-2">
            <option value="">Servicio</option>
            {(services ?? []).map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </select>
          <select name="professionalId" required className="rounded-xl border border-black/10 px-3 py-2">
            <option value="">Profesional</option>
            {people.filter((person) => person.active).map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
          <input name="starts" type="datetime-local" required className="rounded-xl border border-black/10 px-3 py-2" />
          <input name="notes" placeholder="Notas" className="rounded-xl border border-black/10 px-3 py-2" />
          <button className="rounded-xl bg-brand-700 px-4 py-2 font-bold text-white sm:col-span-2">Guardar cita</button>
        </form>
      </section>
    </div>
  );
}

function StatusButton({
  id,
  status,
  label,
  day,
  view,
}: {
  id: string;
  status: string;
  label: string;
  day: string;
  view: string;
}) {
  return (
    <form action={setAppointmentStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="dia" value={day} />
      <input type="hidden" name="vista" value={view} />
      <button className="rounded-lg bg-white px-2 py-1 text-xs font-bold text-black ring-1 ring-black/10">{label}</button>
    </form>
  );
}
