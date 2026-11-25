import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import type { AdminProductRow } from "@/lib/types";
import { updateProduct } from "../../actions";

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
  const supabase = await requireAdmin();
  const [{ data }, { data: categories }] = await Promise.all([
    supabase.rpc("admin_list_products").throwOnError(),
    supabase.from("categories").select("id, name").order("sort_order").throwOnError(),
  ]);
  const products = (data ?? []) as AdminProductRow[];

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
                <input name="cost" type="number" min={0} defaultValue={product.cost} className={inputClass} aria-label="Costo" />
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
          </li>
        ))}
      </ul>
    </div>
  );
}
