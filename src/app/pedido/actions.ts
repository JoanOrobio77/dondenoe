"use server";

import { createPublicClient, isSupabaseConfigured } from "@/lib/supabase/public";
import type { CartItem } from "@/lib/types";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/whatsapp";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PlaceOrderState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "ok"; number: number; total: number };

export async function placeOrder(_prev: PlaceOrderState, formData: FormData): Promise<PlaceOrderState> {
  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").replace(/\D/g, "");
  const address = String(formData.get("address") ?? "").trim();
  const zoneId = Number(formData.get("zoneId"));
  const payment = String(formData.get("payment")) as PaymentMethod;
  const notes = String(formData.get("notes") ?? "").trim();
  const ageConfirmed = formData.get("ageConfirmed") === "on";

  let items: CartItem[];
  try {
    items = (JSON.parse(String(formData.get("items"))) as CartItem[]).filter((i) => UUID.test(i.id));
  } catch {
    return { status: "error", message: "No pudimos leer tu pedido. Recarga la página." };
  }

  if (!ageConfirmed) return { status: "error", message: "Debes confirmar que eres mayor de 18 años." };
  if (!name || phone.length < 10 || !address || !zoneId) {
    return { status: "error", message: "Completa nombre, celular (10 dígitos), dirección y zona." };
  }
  if (!(payment in PAYMENT_METHODS)) return { status: "error", message: "Elige una forma de pago." };
  if (items.length === 0) return { status: "error", message: "Tu pedido está vacío." };

  if (!isSupabaseConfigured()) {
    return { status: "error", message: "La tienda está en modo demo: conecta Supabase para recibir pedidos." };
  }

  const { data, error } = await createPublicClient()
    .rpc("create_order", {
      p_name: name,
      p_phone: phone,
      p_address: address,
      p_zone_id: zoneId,
      p_payment: payment,
      p_age_confirmed: true,
      p_items: items.map((i) => ({ type: i.type, id: i.id, quantity: i.quantity })),
      p_notes: notes || null,
    })
    .single<{ order_number: number; order_total: number }>();

  if (error) return { status: "error", message: error.message };
  return { status: "ok", number: data.order_number, total: data.order_total };
}
