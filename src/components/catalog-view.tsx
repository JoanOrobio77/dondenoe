"use client";

import { useState } from "react";
import { addToCart } from "@/lib/cart-store";
import { formatCOP } from "@/lib/format";
import { imageForProduct } from "@/lib/product-images";
import type { Catalog, CartItem } from "@/lib/types";

const ALL = "todo";

export function CatalogView({ catalog }: { catalog: Catalog }) {
  const [selected, setSelected] = useState(ALL);
  const visibleCategories = catalog.categories.filter((c) => selected === ALL || c.slug === selected);

  return (
    <div className="space-y-8">
      {catalog.combos.length > 0 && (
        <section>
          <h2 className="text-2xl text-black">
            <span className="font-display italic font-semibold text-[#e10600]">Combos</span> Plan completo
          </h2>
          <p className="text-sm text-slate-600">Todo lo del parche, en un solo pedido y más barato.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {catalog.combos.map((combo) => {
              const savings = combo.regularPrice - combo.price;
              return (
                <article key={combo.id} className="flex flex-col rounded-2xl bg-black p-4 text-white shadow-lg">
                  {savings > 0 && (
                    <p className="mb-2 self-start rounded-full bg-[#e10600] px-2.5 py-0.5 text-xs font-bold">
                      Ahorras {formatCOP(savings)}
                    </p>
                  )}
                  <h3 className="text-lg font-bold">{combo.name}</h3>
                  <p className="mt-1 flex-1 text-sm text-white/70">{combo.description}</p>
                  <div className="mt-3 flex items-end justify-between gap-2">
                    <div>
                      {savings > 0 && <p className="text-xs text-white/50 line-through">{formatCOP(combo.regularPrice)}</p>}
                      <p className="text-xl font-bold text-accent">{formatCOP(combo.price)}</p>
                    </div>
                    <AddButton item={{ type: "combo", id: combo.id, name: combo.name, price: combo.price }} />
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {[{ slug: ALL, name: "Todo" }, ...catalog.categories].map((c) => (
          <button
            key={c.slug}
            onClick={() => setSelected(c.slug)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${
              selected === c.slug ? "bg-black text-white" : "bg-white text-black ring-1 ring-black/10"
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
            <h2 className="text-lg font-extrabold tracking-tight text-black">{category.name}</h2>
            <ul className="mt-2 divide-y divide-black/5 rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
              {products.map((product) => (
                <li key={product.id} className="flex items-center justify-between gap-3 p-3">
                  <ProductPhoto name={product.name} imageUrl={product.imageUrl} />
                  <div className="min-w-0 flex-1">
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

function ProductPhoto({ name, imageUrl }: { name: string; imageUrl: string | null }) {
  const src = imageForProduct(name, imageUrl);
  if (!src) return null;
  return (
    <img src={src} alt="" className="size-16 shrink-0 rounded-xl bg-[#e7ecee] object-contain" />
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
