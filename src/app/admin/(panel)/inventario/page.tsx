import { Suspense } from "react";
import { NewProductForm, ProductPhotoField } from "@/components/admin-product-form";
import { requireAdmin } from "@/lib/auth";
import { formatCOP } from "@/lib/format";
import type { AdminProductRow } from "@/lib/types";
import { imageForProduct } from "@/lib/product-images";
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
  const { supabase, business, owner } = await requireAdmin();
  const [{ data }, { data: categories }] = await Promise.all([
    supabase.rpc("admin_list_products", { business_id: business.id }).throwOnError(),
    supabase.from("categories").select("id, name, allows_promotion").eq("business_id", business.id).order("sort_order").throwOnError(),
  ]);
  const products = (data ?? []) as AdminProductRow[];
  const categoryName = new Map(categories.map((category) => [category.id, category.name]));
  const ordered = [...products].sort(
    (a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "es"),
  );

  const low = ordered.filter((product) => product.active && product.stock <= product.min_stock);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-900">Inventario</h1>
        <p className="mt-1 text-sm text-slate-600">
          {owner
            ? "Da de alta un producto con su foto, costo y precio. El stock inicial queda registrado como una entrada."
            : "Da de alta un producto con su foto y precio. El stock inicial queda registrado como una entrada."}
        </p>
      </div>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-brand-100">
        <h2 className="text-lg font-bold text-brand-900">Nuevo producto</h2>
        <div className="mt-3">
          <NewProductForm
            canSetCost={owner}
            categories={categories.map((category) => ({
              id: category.id,
              name: category.name,
              allowsPromotion: category.allows_promotion,
            }))}
          />
        </div>
      </section>

      {low.length > 0 && (
        <section className="rounded-2xl bg-accent/20 p-4 ring-1 ring-accent">
          <h2 className="font-bold text-brand-900">Stock bajo: hay que pedir ({low.length})</h2>
          <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            {low.map((product) => (
              <li key={product.id}>
                <strong>{product.name}</strong>: quedan {product.stock} (mínimo {product.min_stock})
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
              {owner && <th className="p-3 text-right">Costo</th>}
              {owner && <th className="p-3 text-right">Margen</th>}
              <th className="p-3 text-right">Stock</th>
              <th className="p-3">Registrar movimiento</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-50">
            {ordered.map((product) => {
              const photo = imageForProduct(product.name, product.image_url);
              return (
                <tr key={product.id} className={product.active && product.stock <= product.min_stock ? "bg-accent/10" : undefined}>
                  <td className="p-3">
                    <div className="flex items-start gap-3">
                      {photo ? (
                        <img src={photo} alt={product.name} className="size-14 shrink-0 rounded-xl bg-[#e7ecee] object-contain" />
                      ) : (
                        <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-[#e7ecee] text-xs text-slate-500">
                          Sin foto
                        </span>
                      )}
                      <div>
                        <p className="font-semibold">
                          {product.name}{" "}
                          {!product.active && (
                            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-600">Inactivo</span>
                          )}
                        </p>
                        <p className="text-xs text-slate-500">{categoryName.get(product.category_id)}</p>
                        <details className="mt-1">
                          <summary className="cursor-pointer text-xs font-semibold text-brand-700">Cambiar foto</summary>
                          <ProductPhotoField productId={product.id} />
                        </details>
                      </div>
                    </div>
                  </td>
                  <td className="p-3 text-right">{formatCOP(product.price)}</td>
                  {owner && <td className="p-3 text-right">{formatCOP(product.cost ?? 0)}</td>}
                  {owner && (
                    <td className="p-3 text-right">
                      {product.price ? Math.round(((product.price - (product.cost ?? 0)) / product.price) * 100) : 0}%
                    </td>
                  )}
                  <td className="p-3 text-right">
                    <span className="text-lg font-bold">{product.stock}</span>
                    <span className="block text-xs text-slate-500">mín. {product.min_stock}</span>
                  </td>
                  <td className="p-3">
                    <form action={registerMovement} className="flex flex-wrap gap-2">
                      <input type="hidden" name="productId" value={product.id} />
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
                      <input
                        name="note"
                        maxLength={200}
                        placeholder="Nota"
                        className="w-36 rounded-lg border border-brand-100 px-2 py-1"
                      />
                      <button className="rounded-lg bg-brand-700 px-3 py-1 font-semibold text-white">OK</button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        Las ventas se descuentan solas cuando un pedido se marca como entregado. Usa “Entrada” al recibir mercancía y
        “Ajuste” con número negativo para pérdidas o roturas. Un producto inactivo no se vende, pero sigue en esta lista.
      </p>
    </div>
  );
}
