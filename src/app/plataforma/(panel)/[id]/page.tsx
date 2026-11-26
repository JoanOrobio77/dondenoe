import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth";
import { formatCOP } from "@/lib/format";
import { ownerWelcomeUrl } from "@/lib/platform";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { OpeningHours } from "@/lib/types";
import {
  addDomain,
  addMember,
  recordPayment,
  removeDomain,
  removeMember,
  resendInvite,
  updateBusiness,
  updateBusinessSettings,
  updateBusinessStatus,
  verifyDomain,
} from "../../actions";

const field = "mt-1 w-full rounded-xl border border-brand-100 px-3 py-2 outline-brand-700";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS: Record<string, string> = {
  trial: "Prueba",
  active: "Activo",
  past_due: "Pago pendiente",
  suspended: "Suspendido",
};

function when(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeZone: "America/Bogota",
  }).format(new Date(value));
}

function dateInput(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date(value));
}

export default function BusinessPage({ params, searchParams }: PageProps<"/plataforma/[id]">) {
  return (
    <Suspense fallback={<p className="text-slate-500">Cargando negocio...</p>}>
      <Business params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Business({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  if (!UUID.test(id)) notFound();
  const { supabase } = await requirePlatformAdmin();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, slug, name, plan, status, trial_ends_at, paid_until, template, whatsapp_number, timezone")
    .eq("id", id)
    .maybeSingle();
  if (!business) notFound();

  const [{ data: settings }, { data: members }, { data: domains }, { data: payments }, { data: audit }] =
    await Promise.all([
      supabase
        .from("business_settings")
        .select("age_verification, tobacco_rules, delivery, opening_hours")
        .eq("business_id", id)
        .maybeSingle(),
      supabase.from("business_members").select("user_id, role").eq("business_id", id),
      supabase.from("business_domains").select("domain, verified").eq("business_id", id).order("domain"),
      supabase
        .from("payments")
        .select("id, amount, method, paid_at, period_start, period_end, notes")
        .eq("business_id", id)
        .order("paid_at", { ascending: false })
        .limit(12),
      supabase
        .from("platform_audit_log")
        .select("id, action, detail, created_at")
        .eq("business_id", id)
        .order("created_at", { ascending: false })
        .limit(12),
    ]);

  const emails = new Map<string, string>();
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const admin = createAdminSupabase();
    await Promise.all(
      (members ?? []).map(async (member) => {
        const { data } = await admin.auth.admin.getUserById(member.user_id);
        if (data.user?.email) emails.set(member.user_id, data.user.email);
      }),
    );
  }

  const hours = (settings?.opening_hours ?? {}) as OpeningHours;
  const sample = hours.mon;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/plataforma" className="text-sm font-semibold text-brand-700">
          ← Negocios
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-brand-900">{business.name}</h1>
        <p className="text-slate-500">
          {business.slug} · {business.template === "agenda" ? "Agenda" : "Tienda"} · invitación en{" "}
          {ownerWelcomeUrl(business.slug)}
        </p>
      </div>

      {query.ok && <p className="rounded-2xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">{query.ok}</p>}
      {query.error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{query.error}</p>}

      <section className="space-y-4 rounded-2xl bg-white p-5 ring-1 ring-black/5">
        <h2 className="text-lg font-bold text-brand-900">Datos</h2>
        <form action={updateBusiness} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="businessId" value={business.id} />
          <label className="block text-sm font-semibold text-slate-700">
            Nombre
            <input name="name" required defaultValue={business.name} className={field} />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Plan
            <select name="plan" defaultValue={business.plan} className={field}>
              <option value="basico">Básico</option>
              <option value="completo">Completo</option>
            </select>
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            WhatsApp
            <input name="whatsapp" defaultValue={business.whatsapp_number ?? ""} className={field} />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Zona horaria
            <input name="timezone" defaultValue={business.timezone} className={field} />
          </label>
          <button className="rounded-xl bg-brand-700 px-4 py-2 text-sm font-bold text-white sm:col-span-2 sm:w-fit">
            Guardar datos
          </button>
        </form>
      </section>

      <section className="space-y-4 rounded-2xl bg-white p-5 ring-1 ring-black/5">
        <h2 className="text-lg font-bold text-brand-900">Estado</h2>
        <p className="text-sm text-slate-500">
          Ahora: {STATUS[business.status] ?? business.status}. Prueba hasta {when(business.trial_ends_at)}. Pagado hasta{" "}
          {when(business.paid_until)}.
        </p>
        <form action={updateBusinessStatus} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="businessId" value={business.id} />
          <label className="block text-sm font-semibold text-slate-700">
            Estado
            <select name="status" defaultValue={business.status} className={field}>
              <option value="trial">Prueba</option>
              <option value="active">Activo</option>
              <option value="past_due">Pago pendiente</option>
              <option value="suspended">Suspendido</option>
            </select>
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Fin de la prueba
            <input name="trialEnds" type="date" defaultValue={dateInput(business.trial_ends_at)} className={field} />
          </label>
          <button className="rounded-xl bg-brand-700 px-4 py-2 text-sm font-bold text-white sm:col-span-2 sm:w-fit">
            Cambiar estado
          </button>
        </form>
      </section>

      <section className="space-y-4 rounded-2xl bg-white p-5 ring-1 ring-black/5">
        <h2 className="text-lg font-bold text-brand-900">Ajustes</h2>
        <form action={updateBusinessSettings} className="space-y-3">
          <input type="hidden" name="businessId" value={business.id} />
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input name="age" type="checkbox" defaultChecked={settings?.age_verification ?? true} /> Verificar edad
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input name="tobacco" type="checkbox" defaultChecked={settings?.tobacco_rules ?? true} /> Reglas de tabaco
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input name="delivery" type="checkbox" defaultChecked={settings?.delivery ?? true} /> Domicilios
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input name="hours" type="checkbox" defaultChecked={Boolean(sample)} /> Tiene horario, todos los días
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-slate-700">
              Abre
              <input name="open" type="time" defaultValue={sample?.open ?? "11:00"} className={field} />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Cierra
              <input name="close" type="time" defaultValue={sample?.close ?? "22:00"} className={field} />
            </label>
          </div>
          <button className="rounded-xl bg-brand-700 px-4 py-2 text-sm font-bold text-white">Guardar ajustes</button>
        </form>
      </section>

      <section className="space-y-4 rounded-2xl bg-white p-5 ring-1 ring-black/5">
        <h2 className="text-lg font-bold text-brand-900">Pago manual</h2>
        <form action={recordPayment} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="businessId" value={business.id} />
          <label className="block text-sm font-semibold text-slate-700">
            Monto en pesos
            <input name="amount" type="number" min={1} required className={field} />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Medio
            <select name="method" defaultValue="transferencia" className={field}>
              <option value="transferencia">Transferencia</option>
              <option value="efectivo">Efectivo</option>
              <option value="nequi">Nequi</option>
              <option value="daviplata">Daviplata</option>
            </select>
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Fecha del pago
            <input name="paidAt" type="date" required defaultValue={today} className={field} />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Periodo desde
            <input name="periodStart" type="date" required defaultValue={today} className={field} />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Periodo hasta
            <input name="periodEnd" type="date" required className={field} />
          </label>
          <label className="block text-sm font-semibold text-slate-700 sm:col-span-2">
            Nota
            <input name="notes" maxLength={300} className={field} />
          </label>
          <button className="rounded-xl bg-brand-700 px-4 py-2 text-sm font-bold text-white sm:col-span-2 sm:w-fit">
            Registrar pago
          </button>
        </form>
        <p className="text-sm text-slate-500">El periodo cierra a las 23:59, hora de Bogotá, y el negocio queda activo.</p>
        <ul className="space-y-2 text-sm">
          {(payments ?? []).map((payment) => (
            <li key={payment.id} className="rounded-xl bg-[#fffaf6] px-3 py-2">
              {formatCOP(payment.amount)} · {payment.method} · {when(payment.paid_at)} · cubre hasta {payment.period_end}
              {payment.notes ? ` · ${payment.notes}` : ""}
            </li>
          ))}
          {(payments ?? []).length === 0 && <li className="text-slate-500">Todavía no hay pagos.</li>}
        </ul>
      </section>

      <section className="space-y-4 rounded-2xl bg-white p-5 ring-1 ring-black/5">
        <h2 className="text-lg font-bold text-brand-900">Equipo</h2>
        <ul className="space-y-3">
          {(members ?? []).map((member) => (
            <li key={member.user_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#fffaf6] px-3 py-2">
              <div>
                <p className="font-semibold">{emails.get(member.user_id) ?? "Correo no disponible"}</p>
                <p className="text-sm text-slate-500">{member.role === "owner" ? "Dueño" : "Empleado"}</p>
              </div>
              <div className="flex gap-2">
                <form action={resendInvite}>
                  <input type="hidden" name="businessId" value={business.id} />
                  <input type="hidden" name="userId" value={member.user_id} />
                  <button className="rounded-xl bg-white px-3 py-2 text-sm font-semibold ring-1 ring-black/10">
                    Reenviar invitación
                  </button>
                </form>
                <form action={removeMember}>
                  <input type="hidden" name="businessId" value={business.id} />
                  <input type="hidden" name="userId" value={member.user_id} />
                  <button className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-red-700 ring-1 ring-black/10">
                    Quitar
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
        <form action={addMember} className="grid gap-4 sm:grid-cols-3">
          <input type="hidden" name="businessId" value={business.id} />
          <label className="block text-sm font-semibold text-slate-700">
            Nombre
            <input name="name" required className={field} />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Correo
            <input name="email" type="email" required className={field} />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Rol
            <select name="role" defaultValue="staff" className={field}>
              <option value="staff">Empleado</option>
              <option value="owner">Dueño</option>
            </select>
          </label>
          <button className="rounded-xl bg-brand-700 px-4 py-2 text-sm font-bold text-white sm:col-span-3 sm:w-fit">
            Agregar
          </button>
        </form>
      </section>

      <section className="space-y-4 rounded-2xl bg-white p-5 ring-1 ring-black/5">
        <h2 className="text-lg font-bold text-brand-900">Dominios</h2>
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">También hay que agregar el dominio en el proyecto de Vercel.</p>
          <p className="mt-1">
            Esta pantalla no lo hace. En el DNS del cliente crea un CNAME hacia cname.vercel-dns.com. Cuando Vercel lo
            acepte, márcalo verificado aquí. Hasta entonces la tienda no abre por ese dominio.
          </p>
        </div>
        <ul className="space-y-3">
          {(domains ?? []).map((item) => (
            <li key={item.domain} className="rounded-xl bg-[#fffaf6] px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-semibold">
                  {item.domain}{" "}
                  <span className="text-sm font-medium text-slate-500">{item.verified ? "verificado" : "sin verificar"}</span>
                </p>
                <div className="flex gap-2">
                  {!item.verified && (
                    <form action={verifyDomain}>
                      <input type="hidden" name="businessId" value={business.id} />
                      <input type="hidden" name="domain" value={item.domain} />
                      <button className="rounded-xl bg-white px-3 py-2 text-sm font-semibold ring-1 ring-black/10">
                        Marcar verificado
                      </button>
                    </form>
                  )}
                  <form action={removeDomain}>
                    <input type="hidden" name="businessId" value={business.id} />
                    <input type="hidden" name="domain" value={item.domain} />
                    <button className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-red-700 ring-1 ring-black/10">
                      Quitar
                    </button>
                  </form>
                </div>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                Registro CNAME. Nombre: {item.domain}. Valor: cname.vercel-dns.com. Luego agrégalo en Vercel → Settings →
                Domains.
              </p>
            </li>
          ))}
        </ul>
        <form action={addDomain} className="flex flex-wrap gap-2">
          <input type="hidden" name="businessId" value={business.id} />
          <input name="domain" required placeholder="tienda.com" className={`${field} mt-0 max-w-sm`} />
          <button className="rounded-xl bg-brand-700 px-4 py-2 text-sm font-bold text-white">Agregar dominio</button>
        </form>
      </section>

      <section className="space-y-2 rounded-2xl bg-white p-5 ring-1 ring-black/5">
        <h2 className="text-lg font-bold text-brand-900">Actividad</h2>
        <ul className="space-y-2 text-sm">
          {(audit ?? []).map((entry) => (
            <li key={entry.id}>
              {when(entry.created_at)} · {entry.action}
            </li>
          ))}
          {(audit ?? []).length === 0 && <li className="text-slate-500">Todavía no hay movimientos.</li>}
        </ul>
      </section>
    </div>
  );
}
