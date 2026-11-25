"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { placeOrder, type PlaceOrderState } from "@/app/pedido/actions";
import { clearCart, useCart } from "@/lib/cart-store";
import { formatCOP } from "@/lib/format";
import type { DeliveryZone } from "@/lib/types";
import { buildOrderMessage, PAYMENT_METHODS, whatsappLink, type PaymentMethod } from "@/lib/whatsapp";

const inputClass = "mt-1 w-full rounded-xl border border-brand-100 bg-white px-4 py-3 outline-brand-700";

export function CheckoutForm({ zones }: { zones: DeliveryZone[] }) {
  const items = useCart();
  const [zoneId, setZoneId] = useState(zones[0]?.id ?? 0);
  const [sentMessage, setSentMessage] = useState("");
  const zone = zones.find((z) => z.id === zoneId);
  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  const [state, action, pending] = useActionState(async (prev: PlaceOrderState, formData: FormData) => {
    const result = await placeOrder(prev, formData);
    if (result.status === "ok") {
      setSentMessage(
        buildOrderMessage(items, {
          number: result.number,
          total: result.total,
          name: String(formData.get("name")).trim(),
          address: String(formData.get("address")).trim(),
          zoneName: zone?.name ?? "",
          deliveryFee: zone?.fee ?? 0,
          payment: String(formData.get("payment")) as PaymentMethod,
          notes: String(formData.get("notes") ?? "").trim(),
        }),
      );
      clearCart();
    }
    return result;
  }, { status: "idle" });

  if (state.status === "ok") {
    return <OrderSent number={state.number} message={sentMessage} />;
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-6 text-center ring-1 ring-brand-100">
        <p className="text-slate-600">Tu pedido está vacío.</p>
        <Link href="/" className="mt-4 inline-block font-bold text-brand-700 underline">
          Ver el catálogo
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="items" value={JSON.stringify(items)} />

      <section className="rounded-2xl bg-white p-4 ring-1 ring-brand-100">
        <h2 className="font-bold text-brand-900">Tu pedido</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {items.map((i) => (
            <li key={`${i.type}-${i.id}`} className="flex justify-between gap-3">
              <span>
                {i.quantity} x {i.name}
              </span>
              <span className="shrink-0">{formatCOP(i.price * i.quantity)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 space-y-1 border-t border-brand-50 pt-3 text-sm">
          <p className="flex justify-between">
            <span>Subtotal</span>
            <span>{formatCOP(subtotal)}</span>
          </p>
          <p className="flex justify-between">
            <span>Domicilio</span>
            <span>{formatCOP(zone?.fee ?? 0)}</span>
          </p>
          <p className="flex justify-between text-lg font-bold text-brand-900">
            <span>Total</span>
            <span>{formatCOP(subtotal + (zone?.fee ?? 0))}</span>
          </p>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl bg-white p-4 ring-1 ring-brand-100">
        <h2 className="font-bold text-brand-900">¿A dónde lo llevamos?</h2>
        <label className="block text-sm font-semibold text-slate-700">
          Nombre
          <input name="name" required autoComplete="name" className={inputClass} />
        </label>
        <label className="block text-sm font-semibold text-slate-700">
          Celular
          <input name="phone" required type="tel" inputMode="numeric" autoComplete="tel" placeholder="3001234567" className={inputClass} />
        </label>
        <label className="block text-sm font-semibold text-slate-700">
          Zona
          <select name="zoneId" value={zoneId} onChange={(e) => setZoneId(Number(e.target.value))} className={inputClass}>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name} · {formatCOP(z.fee)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-semibold text-slate-700">
          Dirección
          <input name="address" required autoComplete="street-address" placeholder="Calle, número, barrio, apto" className={inputClass} />
        </label>
        <fieldset>
          <legend className="text-sm font-semibold text-slate-700">Forma de pago</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {Object.entries(PAYMENT_METHODS).map(([value, label], index) => (
              <label key={value} className="flex items-center gap-2 rounded-xl border border-brand-100 px-3 py-3 has-checked:border-brand-700 has-checked:bg-brand-50">
                <input type="radio" name="payment" value={value} defaultChecked={index === 0} />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block text-sm font-semibold text-slate-700">
          Notas (opcional)
          <input name="notes" placeholder="Ej: con cambio de $100.000" className={inputClass} />
        </label>
      </section>

      <label className="flex items-start gap-3 rounded-2xl bg-accent/20 p-4 text-sm text-brand-900">
        <input type="checkbox" name="ageConfirmed" required className="mt-0.5 size-5" />
        <span>
          Confirmo que soy <strong>mayor de 18 años</strong> y presentaré mi documento al recibir el pedido.
        </span>
      </label>

      {state.status === "error" && (
        <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{state.message}</p>
      )}

      <button disabled={pending} className="w-full rounded-xl bg-brand-700 py-4 text-lg font-bold text-white disabled:opacity-60">
        {pending ? "Registrando pedido..." : "Confirmar pedido"}
      </button>
    </form>
  );
}

function OrderSent({ number, message }: { number: number; message: string }) {
  return (
    <div className="rounded-2xl bg-white p-6 text-center ring-1 ring-brand-100">
      <p className="text-4xl">✅</p>
      <h2 className="mt-2 text-xl font-bold text-brand-900">Pedido #{number} registrado</h2>
      <p className="mt-2 text-slate-600">Último paso: envíanos el pedido por WhatsApp para confirmarlo.</p>
      <a
        href={whatsappLink(message)}
        target="_blank"
        rel="noopener"
        className="mt-5 block rounded-xl bg-[#25D366] py-4 text-lg font-bold text-white"
      >
        Enviar por WhatsApp
      </a>
      <Link href="/" className="mt-4 inline-block text-sm text-brand-700 underline">
        Volver al catálogo
      </Link>
    </div>
  );
}