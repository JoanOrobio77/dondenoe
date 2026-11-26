import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { formatCOP } from "@/lib/format";

export const metadata = { title: "Reportes · DondeNoe" };

const WEEKDAYS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

export default function ReportsPage() {
  return (
    <Suspense fallback={<p className="text-slate-500">Cargando reportes...</p>}>
      <Reports />
    </Suspense>
  );
}

async function Reports() {
  const { supabase, business } = await requireAdmin();
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const { data: orders } = await supabase
    .from("orders")
    .select("total, created_at, order_items(name, quantity, unit_price, unit_cost)")
    .eq("business_id", business.id)
    .eq("status", "entregado")
    .gte("created_at", since.toISOString())
    .throwOnError();

  const byProduct = new Map<string, { quantity: number; profit: number; sales: number }>();
  const byHour = new Array<number>(24).fill(0);
  const byDay = new Map<string, number>(WEEKDAYS.map((day) => [day, 0]));
  let profit = 0;

  for (const order of orders) {
    const when = new Date(order.created_at);
    const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: business.timezone }).format(when));
    const day = new Intl.DateTimeFormat("es-CO", { weekday: "long", timeZone: business.timezone }).format(when).toLowerCase();
    byHour[hour] += 1;
    byDay.set(day, (byDay.get(day) ?? 0) + 1);

    for (const item of order.order_items) {
      const row = byProduct.get(item.name) ?? { quantity: 0, profit: 0, sales: 0 };
      row.quantity += item.quantity;
      row.sales += item.unit_price * item.quantity;
      row.profit += (item.unit_price - item.unit_cost) * item.quantity;
      profit += (item.unit_price - item.unit_cost) * item.quantity;
      byProduct.set(item.name, row);
    }
  }

  const products = [...byProduct.entries()].map(([name, row]) => ({ name, ...row }));
  const byQuantity = [...products].sort((a, b) => b.quantity - a.quantity).slice(0, 5);
  const byProfit = [...products].sort((a, b) => b.profit - a.profit).slice(0, 5);
  const peak = byHour.reduce((best, count, hour) => (count > best.count ? { hour, count } : best), { hour: 0, count: 0 });
  const revenue = orders.reduce((sum, order) => sum + order.total, 0);
  const hourLabel = new Intl.DateTimeFormat("es-CO", { hour: "numeric", timeZone: "UTC" });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-900">Reportes</h1>
        <p className="text-sm text-slate-600">Pedidos entregados en los últimos 30 días. Un pedido cancelado no entra.</p>
      </div>

      {orders.length === 0 ? (
        <p className="rounded-2xl bg-white p-4 text-slate-600 ring-1 ring-brand-100">
          Cuando marques pedidos como entregados, aquí vas a ver qué se vende, qué deja ganancia y a qué hora piden.
        </p>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            <Card label="Pedidos entregados" value={String(orders.length)} />
            <Card label="Ventas" value={formatCOP(revenue)} />
            <Card label="Ganancia de productos" value={formatCOP(profit)} />
          </section>

          <section className="grid gap-3 md:grid-cols-2">
            <Ranking title="Qué se vende más" rows={byQuantity.map((p) => ({ name: p.name, value: `${p.quantity} und.` }))} />
            <Ranking title="Qué deja más ganancia" rows={byProfit.map((p) => ({ name: p.name, value: formatCOP(p.profit) }))} />
          </section>

          <section className="rounded-2xl bg-white p-4 ring-1 ring-brand-100">
            <h2 className="font-bold text-brand-900">Horas pico</h2>
            {peak.count > 0 && (
              <p className="mt-1 text-sm text-slate-600">
                La hora con más entregas es las {hourLabel.format(new Date(Date.UTC(2026, 0, 1, peak.hour)))}.
              </p>
            )}
            <ul className="mt-3 space-y-2">
              {byHour.map((count, hour) =>
                count === 0 ? null : (
                  <li key={hour} className="flex items-center gap-3 text-sm">
                    <span className="w-16 shrink-0">{hourLabel.format(new Date(Date.UTC(2026, 0, 1, hour)))}</span>
                    <span className="h-3 rounded-full bg-brand-700" style={{ width: `${(count / peak.count) * 100}%` }} />
                    <span className="font-semibold">{count}</span>
                  </li>
                ),
              )}
            </ul>
          </section>

          <section className="rounded-2xl bg-white p-4 ring-1 ring-brand-100">
            <h2 className="font-bold text-brand-900">Por día</h2>
            <ul className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              {WEEKDAYS.map((day) => (
                <li key={day} className="rounded-xl bg-brand-50 px-3 py-2">
                  <span className="capitalize">{day}</span>
                  <span className="mt-1 block text-lg font-bold text-brand-900">{byDay.get(day) ?? 0}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-2xl bg-white p-4 ring-1 ring-brand-100">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-brand-900">{value}</p>
    </article>
  );
}

function Ranking({ title, rows }: { title: string; rows: { name: string; value: string }[] }) {
  return (
    <article className="rounded-2xl bg-white p-4 ring-1 ring-brand-100">
      <h2 className="font-bold text-brand-900">{title}</h2>
      <ol className="mt-3 space-y-2 text-sm">
        {rows.map((row, index) => (
          <li key={row.name} className="flex justify-between gap-3">
            <span>
              {index + 1}. {row.name}
            </span>
            <span className="shrink-0 font-semibold">{row.value}</span>
          </li>
        ))}
      </ol>
    </article>
  );
}
