"use client";

import Link from "next/link";
import { useState } from "react";
import { changeQuantity, clearCart, useCart } from "@/lib/cart-store";
import { formatCOP } from "@/lib/format";

export function CartBar() {
  const items = useCart();
  const [open, setOpen] = useState(false);

  const count = items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  if (count === 0) return null;

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/40" onClick={() => setOpen(false)} />}
      <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-3xl">
        {open && (
          <div className="max-h-[60vh] overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-brand-900">Tu pedido</h2>
              <button onClick={clearCart} className="text-sm text-slate-500 underline">
                Vaciar
              </button>
            </div>
            <ul className="mt-3 divide-y divide-brand-50">
              {items.map((item) => (
                <li key={`${item.type}-${item.id}`} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800">{item.name}</p>
                    <p className="text-sm text-slate-500">{formatCOP(item.price * item.quantity)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <QuantityButton label="−" onClick={() => changeQuantity(item.type, item.id, -1)} />
                    <span className="w-5 text-center font-bold">{item.quantity}</span>
                    <QuantityButton label="+" onClick={() => changeQuantity(item.type, item.id, 1)} />
                  </div>
                </li>
              ))}
            </ul>
            <Link href="/pedido" className="mt-4 block rounded-xl bg-accent py-3 text-center font-bold text-brand-900">
              Continuar · {formatCOP(subtotal)}
            </Link>
            <p className="mt-2 text-center text-xs text-slate-500">El domicilio se cobra según tu zona.</p>
          </div>
        )}
        <button
          onClick={() => setOpen(!open)}
          className="flex w-full items-center justify-between bg-black px-5 py-4 font-bold text-white"
        >
          <span>
            {count} {count === 1 ? "producto" : "productos"}
          </span>
          <span>{open ? "Cerrar" : `Ver pedido · ${formatCOP(subtotal)}`}</span>
        </button>
      </div>
    </>
  );
}

function QuantityButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex size-8 items-center justify-center rounded-full bg-brand-50 text-lg font-bold text-brand-900"
    >
      {label}
    </button>
  );
}
