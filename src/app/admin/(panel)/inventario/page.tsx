import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { formatCOP } from "@/lib/format";
import { registerMovement } from "../../actions";

export const metadata = { title: "Inventario · DondeNoe" };

export default function InventoryPage() {
  return (
    <Suspense fallback={<p className="text-slate-500">Cargando inventario...</p>}>
      <Inventory />
    </Suspense>
  );
}

async function Inventory() {
  const supabase = await requireAdmin();
  const { data: products } = await supabase
    .from("products")
    .select("id, name, price, cost, stock, min_stock, categories(name, sort_order)")
    .eq("active", true)
    .order("name")
    .throwOnError();

  const low = products.filter((p) => p.stock <= p.min_stock);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-brand-900">Inventario</h1>

      {low.length > 0 && (
        <section className="rounded-2xl bg-accent/20 p-4 ring-1 ring-accent">
          <h2 className="font-bold text-brand-900">⚠ Stock bajo: hay que pedir ({low.length})</h2>
          <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            {low.map((p) => (
              <li key={p.id}>
                <strong>{p.name}</strong>: quedan {p.stock} (mínimo {p.min_stock})
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-brand-100">
        <table className="w-full text-sm">
          <thead className="bg-brand-50 text-left text-brand-900">
            <tr>
              <th className="p-3">Producto</th>
              <th className="p-3 text-right">Precio</th>
              <th className="p-3 text-right">Margen</th>
              <th className="p-3 text-right">Stock</th>
              <th className="p-3">Registrar movimiento</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-50">
            {products.map((p) => (
              <tr key={p.id} className={p.stock <= p.min_stock ? "bg-accent/10" : undefined}>
                <td className="p-3">
                  <p className="font-semibold">{p.name}</p>
                  <p className="text-xs text-slate-500">{(p.categories as unknown as { name: string })?.name}</p>
                </td>
                <td className="p-3 text-right">{formatCOP(p.price)}</td>
                <td className="p-3 text-right">{p.price ? Math.round(((p.price - p.cost) / p.price) * 100) : 0}%</td>
                <td className="p-3 text-right">
                  <span className="text-lg font-bold">{p.stock}</span>
                  <span className="block text-xs text-slate-500">mín. {p.min_stock}</span>
                </td>
                <td className="p-3">
                  <form action={registerMovement} className="flex gap-2">
                    <input type="hidden" name="productId" value={p.id} />
                    <select name="reason" className="rounded-lg border border-brand-100 px-2 py-1">
                      <option value="entrada">Entrada</option>
                      <option value="ajuste">Ajuste (±)</option>
                    </select>
                    <input
                      name="quantity"
                      type="number"
                      required
                      placeholder="Cant."
                      className="w-20 rounded-lg border border-brand-100 px-2 py-1"
                    />
                    <button className="rounded-lg bg-brand-700 px-3 py-1 font-semibold text-white">OK</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        Las ventas se descuentan solas cuando un pedido se marca como entregado. Usa “Entrada” al recibir mercancía y
        “Ajuste” con número negativo para pérdidas o roturas.
      </p>
    </div>
  );
}
