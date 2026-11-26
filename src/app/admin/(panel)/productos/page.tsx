import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import type { AdminProductRow } from "@/lib/types";
import { deleteCombo, deleteProduct, setComboActive, setProductActive, updateProduct } from "../../actions";

export const metadata = { title: "Productos · DondeNoe" };

const inputClass = "w-full rounded-lg border border-brand-100 px-2 py-1";

export default function ProductsPage() {
  return (
    <Suspense fallback={<p className="text-slate-500">Cargando productos...</p>}>
      <Products />
    </Suspense>
  );
}

async function Products() {
  const { supabase, business, owner } = await requireAdmin();
  const [{ data }, { data: categories }, { data: combos }] = await Promise.all([
    supabase.rpc("admin_list_products", { business_id: business.id }).throwOnError(),
    supabase.from("categories").select("id, name").eq("business_id", business.id).order("sort_order").throwOnError(),
    supabase.from("combos").select("id, name, active").eq("business_id", business.id).order("name").throwOnError(),
  ]);
  const products = (data ?? []) as AdminProductRow[];
  const comboRows = combos ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-900">Productos</h1>
        <p className="mt-1 text-sm text-slate-600">
          Aquí corriges nombre, categoría, descripción y precios. Para crear un producto con foto y stock inicial, usa{" "}
          <Link href="/admin/inventario" className="font-semibold text-brand-700 underline">
            Inventario
          </Link>
          .
        </p>
      </div>

      <ul className="space-y-3">
        {products.map((product) => (
          <li key={product.id}>
            <form action={updateProduct} className="space-y-2 rounded-2xl bg-white p-3 ring-1 ring-brand-100">
              <input type="hidden" name="productId" value={product.id} />
              <div className="grid items-center gap-2 md:grid-cols-6">
                <input name="name" defaultValue={product.name} aria-label="Nombre" className={`${inputClass} md:col-span-2`} />
                <select name="categoryId" defaultValue={product.category_id} aria-label="Categoría" className={inputClass}>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <input name="price" type="number" min={0} defaultValue={product.price} className={inputClass} aria-label="Precio de venta" />
                {owner && (
                  <input name="cost" type="number" min={0} defaultValue={product.cost ?? 0} className={inputClass} aria-label="Costo" />
                )}
                <input name="minStock" type="number" min={0} defaultValue={product.min_stock} className={inputClass} aria-label="Stock mínimo" />
              </div>
              <div className="flex items-center gap-2">
                <input
                  name="description"
                  defaultValue={product.description ?? ""}
                  placeholder="Descripción en la tienda"
                  aria-label="Descripción"
                  className={inputClass}
                />
                <label className="flex shrink-0 items-center gap-1 text-sm">
                  <input type="checkbox" name="active" defaultChecked={product.active} />
                  Activo
                </label>
                <button className="shrink-0 rounded-lg bg-brand-700 px-3 py-1 text-sm font-bold text-white">OK</button>
              </div>
            </form>
            <div className="mt-2 flex gap-2">
              <form action={setProductActive}>
                <input type="hidden" name="productId" value={product.id} />
                <input type="hidden" name="active" value={product.active ? "false" : "true"} />
                <button className="rounded-lg px-3 py-1 text-sm font-semibold text-slate-600 ring-1 ring-slate-200">
                  {product.active ? "Desactivar" : "Activar"}
                </button>
              </form>
              {owner && (
                <form action={deleteProduct}>
                  <input type="hidden" name="productId" value={product.id} />
                  <button className="rounded-lg px-3 py-1 text-sm text-slate-500 ring-1 ring-slate-200">Borrar</button>
                </form>
              )}
            </div>
          </li>
        ))}
      </ul>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-brand-900">Combos</h2>
        {comboRows.length === 0 && <p className="text-sm text-slate-500">No hay combos.</p>}
        <ul className="space-y-3">
          {comboRows.map((combo) => (
            <li key={combo.id} className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 ring-1 ring-brand-100">
              <p className="min-w-0 flex-1 font-semibold">{combo.name}</p>
              {!combo.active && (
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-600">Inactivo</span>
              )}
              <form action={setComboActive}>
                <input type="hidden" name="comboId" value={combo.id} />
                <input type="hidden" name="active" value={combo.active ? "false" : "true"} />
                <button className="rounded-lg px-3 py-1 text-sm font-semibold text-slate-600 ring-1 ring-slate-200">
                  {combo.active ? "Desactivar" : "Activar"}
                </button>
              </form>
              {owner && (
                <form action={deleteCombo}>
                  <input type="hidden" name="comboId" value={combo.id} />
                  <button className="rounded-lg px-3 py-1 text-sm text-slate-500 ring-1 ring-slate-200">Borrar</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
