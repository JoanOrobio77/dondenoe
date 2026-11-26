"use client";

import { useState } from "react";
import { addFromMaster } from "@/app/admin/catalog-actions";
import { kindLabel } from "@/lib/import/kinds";

export type CatalogHit = {
  id: string;
  name: string;
  brand: string;
  kind: string;
  presentation: string;
};

export function CatalogPicker({
  products,
  categories,
  owner,
}: {
  products: CatalogHit[];
  categories: { id: number; name: string }[];
  owner: boolean;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setPicked((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  return (
    <form
      action={addFromMaster}
      onSubmit={(event) => {
        const data = new FormData(event.currentTarget);
        const items = picked.map((id) => ({
          master_product_id: id,
          category_id: Number(data.get(`category-${id}`)),
          price: Number(data.get(`price-${id}`)),
          stock: Number(data.get(`stock-${id}`) || 0),
          ...(owner ? { cost: Number(data.get(`cost-${id}`) || 0) } : {}),
        }));
        if (items.length === 0) {
          event.preventDefault();
          setError("Elige al menos un producto.");
          return;
        }
        if (items.some((item) => !item.category_id || !Number.isFinite(item.price) || item.price <= 0)) {
          event.preventDefault();
          setError("Cada producto necesita categoría y precio de venta.");
          return;
        }
        const hidden = event.currentTarget.elements.namedItem("items");
        if (hidden instanceof HTMLInputElement) hidden.value = JSON.stringify(items);
      }}
    >
      <input type="hidden" name="items" />
      {products.length === 0 && <p className="text-slate-500">No hay productos publicados con esa búsqueda.</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="text-slate-500">
              <th className="p-2" />
              <th className="p-2">Producto</th>
              <th className="p-2">Categoría</th>
              <th className="p-2">Precio</th>
              {owner && <th className="p-2">Costo</th>}
              <th className="p-2">Stock</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => {
              const on = picked.includes(product.id);
              return (
                <tr key={product.id} className={on ? "bg-amber-50" : undefined}>
                  <td className="p-2">
                    <input type="checkbox" checked={on} onChange={() => toggle(product.id)} aria-label={`Elegir ${product.name}`} />
                  </td>
                  <td className="p-2">
                    <p className="font-semibold">{product.name}</p>
                    <p className="text-slate-500">
                      {product.brand} · {product.presentation} · {kindLabel(product.kind)}
                    </p>
                    {product.kind === "cigarrillo" && (
                      <p className="text-xs text-slate-500">El tabaco no se puede promocionar.</p>
                    )}
                  </td>
                  <td className="p-2">
                    <select name={`category-${product.id}`} className="rounded-lg border border-black/10 px-2 py-1" disabled={!on}>
                      <option value="">Categoría</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2">
                    <input name={`price-${product.id}`} type="number" min={1} disabled={!on} className="w-28 rounded-lg border border-black/10 px-2 py-1" />
                  </td>
                  {owner && (
                    <td className="p-2">
                      <input name={`cost-${product.id}`} type="number" min={0} defaultValue={0} disabled={!on} className="w-28 rounded-lg border border-black/10 px-2 py-1" />
                    </td>
                  )}
                  <td className="p-2">
                    <input name={`stock-${product.id}`} type="number" min={0} defaultValue={0} disabled={!on} className="w-20 rounded-lg border border-black/10 px-2 py-1" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {error && <p className="mt-3 text-sm font-semibold text-red-700">{error}</p>}
      <button className="mt-4 rounded-xl bg-brand-700 px-4 py-3 font-bold text-white">Agregar los elegidos</button>
    </form>
  );
}
