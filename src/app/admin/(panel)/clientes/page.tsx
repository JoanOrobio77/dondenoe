import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { formatCOP } from "@/lib/format";
import { formatWhen } from "@/lib/zoned-time";
import { appointmentReminder, reminderMessage, whatsappLink } from "@/lib/whatsapp";

export const metadata = { title: "Clientes · DondeNoe" };

export default function CustomersPage() {
  return (
    <Suspense fallback={<p className="text-slate-500">Cargando clientes...</p>}>
      <Customers />
    </Suspense>
  );
}

async function Customers() {
  const { supabase, business } = await requireAdmin();
  if (business.template === "agenda") return <AgendaCustomers />;
  const [{ data: customers }, { data: promotions }] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, phone, address, accepts_marketing, orders(total, status, created_at)")
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .throwOnError(),
    supabase.from("promotions").select("title").eq("business_id", business.id).eq("active", true).order("starts_at", { ascending: false }).limit(1).throwOnError(),
  ]);

  const promo = promotions[0];

  const rows = customers
    .map((customer) => {
      const orders = customer.orders as { total: number; status: string; created_at: string }[];
      const delivered = orders.filter((o) => o.status === "entregado");
      const last = orders.map((o) => o.created_at).sort().at(-1);
      return {
        ...customer,
        orders: orders.length,
        spent: delivered.reduce((sum, o) => sum + o.total, 0),
        last,
      };
    })
    .sort((a, b) => b.spent - a.spent);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-brand-900">Clientes ({rows.length})</h1>
      <p className="text-sm text-slate-600">
        “Recordar” solo aparece para quien pidió que le avisen. El mensaje abre WhatsApp; no se envía solo.
      </p>
      {rows.length === 0 && <p className="text-slate-500">Todavía no hay clientes. Aparecen cuando entra el primer pedido.</p>}
      <ul className="grid gap-3 md:grid-cols-2">
        {rows.map((customer) => (
          <li key={customer.id} className="rounded-2xl bg-white p-4 ring-1 ring-brand-100">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold text-brand-900">{customer.name}</p>
                <p className="text-sm text-slate-600">{customer.phone}</p>
                {customer.address && <p className="text-sm text-slate-500">{customer.address}</p>}
              </div>
              {customer.accepts_marketing && (
                <span className="rounded-full bg-accent/30 px-2 py-1 text-xs font-bold text-brand-900">Quiere avisos</span>
              )}
            </div>
            <p className="mt-3 text-sm">
              {customer.orders} pedidos · {formatCOP(customer.spent)} entregados
              {customer.last && (
                <>
                  {" "}
                  · último {new Date(customer.last).toLocaleDateString("es-CO", { timeZone: business.timezone })}
                </>
              )}
            </p>
            <a
              href={whatsappLink(
                reminderMessage(customer.name, business.name, customer.accepts_marketing ? promo?.title : undefined),
                customer.phone,
              )}
              target="_blank"
              rel="noopener"
              className="mt-3 inline-block rounded-xl bg-[#25D366] px-4 py-2 text-sm font-bold text-white"
            >
              {customer.accepts_marketing ? "Recordar por WhatsApp" : "Escribir por WhatsApp"}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

async function AgendaCustomers() {
  const { supabase, business } = await requireAdmin();
  const { data: customers } = await supabase
    .from("customers")
    .select("id, name, phone, appointments(number, status, starts_at, products(name))")
    .eq("business_id", business.id)
    .order("created_at", { ascending: false })
    .throwOnError();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-brand-900">Clientes ({customers.length})</h1>
      <p className="text-sm text-slate-600">El recordatorio abre WhatsApp. No se envía solo.</p>
      {customers.length === 0 && <p className="text-slate-500">Todavía no hay clientes. Aparecen con la primera cita.</p>}
      <ul className="grid gap-3">
        {customers.map((customer) => {
          const visits = (customer.appointments as { number: number; status: string; starts_at: string; products: { name: string } | { name: string }[] | null }[]) ?? [];
          const next = [...visits].sort((a, b) => b.starts_at.localeCompare(a.starts_at))[0];
          const service = next ? (Array.isArray(next.products) ? next.products[0]?.name : next.products?.name) : null;
          const when = next ? formatWhen(next.starts_at, business.timezone) : "";
          return (
            <li key={customer.id} className="rounded-2xl bg-white p-4 ring-1 ring-brand-100">
              <p className="font-bold text-brand-900">{customer.name}</p>
              <p className="text-sm text-slate-600">{customer.phone}</p>
              <p className="mt-2 text-sm">{visits.length} citas{next ? ` · última ${when}` : ""}</p>
              {next && (
                <a
                  href={whatsappLink(appointmentReminder(customer.name, business.name, when, service ?? "tu cita"), customer.phone)}
                  target="_blank"
                  rel="noopener"
                  className="mt-3 inline-block rounded-xl bg-[#25D366] px-4 py-2 text-sm font-bold text-white"
                >
                  Recordar por WhatsApp
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
