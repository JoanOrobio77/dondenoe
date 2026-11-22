"use client";

import { useState } from "react";
import { addToCart } from "@/lib/cart-store";
import { formatCOP } from "@/lib/format";
import type { Catalog, CartItem } from "@/lib/types";

const ALL = "todo";

export function CatalogView({ catalog }: { catalog: Catalog }) {
  const [selected, setSelected] = useState(ALL);
  const visibleCategories = catalog.categories.filter((c) => selected === ALL || c.slug === selected);

  return (
    <div className="space-y-8">
      {catalog.combos.length > 0 && (
        <section>
          <h2 className="text-xl font-bold text-brand-900">Combos “Plan completo”</h2>
          <p className="text-sm text-slate-500">Todo lo que necesitas para el parche, en un solo pedido.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {catalog.combos.map((combo) => (
              <article key={combo.id} className="flex flex-col rounded-2xl bg-brand-900 p-4 text-white">
                <h3 className="text-lg font-bold">{combo.name}</h3>
                <p className="mt-1 flex-1 text-sm text-brand-100">{combo.description}</p>
                <div className="mt-3 flex items-end justify-between gap-2">
                  <div>
                    {combo.regularPrice > combo.price && (
                      <p className="text-xs text-brand-100 line-through">{formatCOP(combo.regularPrice)}</p>
                    )}
                    <p className="text-xl font-bold text-accent">{formatCOP(combo.price)}</p>
                  </div>
                  <AddButton item={{ type: "combo", id: combo.id, name: combo.name, price: combo.price }} />
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {[{ slug: ALL, name: "Todo" }, ...catalog.categories].map((c) => (
          <button
            key={c.slug}
            onClick={() => setSelected(c.slug)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${
              selected === c.slug ? "bg-brand-700 text-white" : "bg-white text-brand-900 ring-1 ring-brand-100"
            }`}
          >
            {c.name}
          </button>
        ))}
      </nav>

      {visibleCategories.map((category) => {
        const products = catalog.products.filter((p) => p.categoryId === category.id);
        if (products.length === 0) return null;
        return (
          <section key={category.id}>
            <h2 className="text-lg font-bold text-brand-900">{category.name}</h2>
            <ul className="mt-2 divide-y divide-brand-50 rounded-2xl bg-white ring-1 ring-brand-100">
              {products.map((product) => (
                <li key={product.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800">{product.name}</p>
                    {product.description && <p className="text-sm text-slate-500">{product.description}</p>}
                    <p className="mt-1 font-bold text-brand-700">{formatCOP(product.price)}</p>
                  </div>
                  {product.stock > 0 ? (
                    <AddButton
                      item={{ type: "product", id: product.id, name: product.name, price: product.price }}
                    />
                  ) : (
                    <span className="shrink-0 text-sm font-semibold text-slate-400">Agotado</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function AddButton({ item }: { item: Omit<CartItem, "quantity"> }) {
  return (
    <button
      onClick={() => addToCart(item)}
      className="shrink-0 rounded-xl bg-accent px-4 py-2 font-bold text-brand-900 active:scale-95"
    >
      Agregar
    </button>
  );
}
