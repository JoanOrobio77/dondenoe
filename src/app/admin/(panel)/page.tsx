import { Suspense } from "react";
import { AgendaBoard } from "@/components/agenda-board";
import { requireAdmin } from "@/lib/auth";
import { formatCOP } from "@/lib/format";
import { zonedDateKey } from "@/lib/zoned-time";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/whatsapp";
import { updateOrderStatus } from "../actions";

export const metadata = { title: "Pedidos · DondeNoe" };

const STATUS_LABEL: Record<string, string> = {
  nuevo: "Nuevo",
  confirmado: "Confirmado",
  en_camino: "En camino",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

const STATUS_STYLE: Record<string, string> = {
  nuevo: "bg-accent text-brand-900",
  confirmado: "bg-brand-100 text-brand-900",
  en_camino: "bg-brand-700 text-white",
  entregado: "bg-green-100 text-green-800",
  cancelado: "bg-slate-200 text-slate-600",
};

const NEXT_ACTION: Record<string, { status: string; label: string } | undefined> = {
  nuevo: { status: "confirmado", label: "Confirmar" },
  confirmado: { status: "en_camino", label: "Salió el domicilio" },
  en_camino: { status: "entregado", label: "Entregado (cédula verificada)" },
};

export default function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string; vista?: string; error?: string }>;
}) {
  return (
    <Suspense fallback={<p className="text-slate-500">Cargando pedidos...</p>}>
      <Orders searchParams={searchParams} />
    </Suspense>
  );
}

async function Orders({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string; vista?: string; error?: string }>;
}) {
  const { supabase, business } = await requireAdmin();
  if (business.template === "agenda") {
    const query = await searchParams;
    const today = zonedDateKey(new Date(), business.timezone);
    const day = query.dia && /^\d{4}-\d{2}-\d{2}$/.test(query.dia) ? query.dia : today;
    const view = query.vista === "semana" ? "semana" : "dia";
    return <AgendaBoard supabase={supabase} business={business} day={day} view={view} error={query.error} />;
  }
  const { data: orders } = await supabase
    .from("orders")
    .select(
      "id, number, status, customer_name, address, subtotal, delivery_fee, total, payment_method, notes, created_at, customers(name, phone), delivery_zones(name), order_items(name, quantity, unit_price)",
    )
    .eq("business_id", business.id)
    .order("created_at", { ascending: false })
    .limit(50)
    .throwOnError();

  const active = orders.filter((o) => !["entregado", "cancelado"].includes(o.status));
  const closed = orders.filter((o) => ["entregado", "cancelado"].includes(o.status));

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-bold text-brand-900">Pedidos activos ({active.length})</h1>
        {active.length === 0 && <p className="mt-2 text-slate-500">No hay pedidos pendientes.</p>}
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {active.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      </section>
      {closed.length > 0 && (
        <section>
          <h2 className="text-lg font-bold text-brand-900">Recientes cerrados</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {closed.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

type OrderRow = {
  id: string;
  number: number;
  status: string;
  customer_name: string | null;
  address: string | null;
  delivery_fee: number;
  total: number;
  payment_method: string;
  notes: string | null;
  created_at: string;
  customers: unknown;
  delivery_zones: unknown;
  order_items: { name: string; quantity: number; unit_price: number }[];
};

function OrderCard({ order }: { order: OrderRow }) {
  const customer = order.customers as { name: string; phone: string } | null;
  const zone = order.delivery_zones as { name: string } | null;
  const next = NEXT_ACTION[order.status];
  const time = new Date(order.created_at).toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <article className="rounded-2xl bg-white p-4 ring-1 ring-brand-100">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-bold text-brand-900">#{order.number}</p>
          <p className="text-xs text-slate-500">{time}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_STYLE[order.status]}`}>
          {STATUS_LABEL[order.status]}
        </span>
      </div>

      <div className="mt-3 text-sm">
        <p className="font-semibold">{order.customer_name || customer?.name}</p>
        <a href={`https://wa.me/57${customer?.phone}`} target="_blank" rel="noopener" className="text-brand-700 underline">
          {customer?.phone}
        </a>
        <p className="text-slate-600">
          {order.address} · {zone?.name}
        </p>
      </div>

      <ul className="mt-3 space-y-0.5 border-t border-brand-50 pt-3 text-sm">
        {order.order_items.map((item, i) => (
          <li key={i} className="flex justify-between gap-2">
            <span>
              {item.quantity} x {item.name}
            </span>
            <span>{formatCOP(item.quantity * item.unit_price)}</span>
          </li>
        ))}
        <li className="flex justify-between text-slate-500">
          <span>Domicilio</span>
          <span>{formatCOP(order.delivery_fee)}</span>
        </li>
      </ul>
      <p className="mt-2 flex justify-between font-bold text-brand-900">
        <span>Total · {PAYMENT_METHODS[order.payment_method as PaymentMethod]}</span>
        <span>{formatCOP(order.total)}</span>
      </p>
      {order.notes && <p className="mt-1 text-sm text-slate-600">Nota: {order.notes}</p>}

      {next && (
        <form action={updateOrderStatus} className="mt-4 flex gap-2">
          <input type="hidden" name="orderId" value={order.id} />
          <button
            name="status"
            value={next.status}
            className="flex-1 rounded-xl bg-brand-700 py-2 text-sm font-bold text-white"
          >
            {next.label}
          </button>
          <button name="status" value="cancelado" className="rounded-xl px-3 py-2 text-sm text-slate-500 ring-1 ring-slate-200">
            Cancelar
          </button>
        </form>
      )}
    </article>
  );
}
