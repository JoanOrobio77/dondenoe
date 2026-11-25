"use server";

import { createPublicClient, isSupabaseConfigured } from "@/lib/supabase/public";
import type { CartItem } from "@/lib/types";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/whatsapp";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GENERIC_ORDER_ERROR = "No se pudo registrar el pedido. Intenta de nuevo.";
const SAFE_ORDER_ERRORS = new Set([
  "Solo se vende a mayores de 18 años",
  "El nombre debe tener entre 1 y 80 caracteres",
  "El celular debe tener 10 dígitos",
  "La dirección debe tener entre 1 y 200 caracteres",
  "Las notas no pueden pasar de 300 caracteres",
  "El pedido está vacío",
  "El pedido no puede tener más de 30 líneas",
  "Cada producto debe pedirse entre 1 y 50 unidades",
  "Ya tienes 3 pedidos sin confirmar. Escríbenos por WhatsApp para seguir",
  "Zona de domicilio no válida",
  "Un producto del pedido ya no está disponible",
  "Un combo del pedido ya no está disponible",
  "Ningún producto del pedido está disponible",
]);

function orderErrorMessage(error: { message?: string } | null) {
  const raw = error?.message ?? "";
  console.error("create_order", raw);
  const text = raw.replace(/^ERROR:\s*/i, "").trim();
  if (SAFE_ORDER_ERRORS.has(text) || text.startsWith("No hay suficiente stock de ")) return text;
  return GENERIC_ORDER_ERROR;
}

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
  const acceptsMarketing = formData.get("marketing") === "on";

  let rawItems: CartItem[];
  try {
    const parsed = JSON.parse(String(formData.get("items"))) as CartItem[];
    if (!Array.isArray(parsed)) throw new Error("items");
    rawItems = parsed;
  } catch {
    return { status: "error", message: "No pudimos leer tu pedido. Recarga la página." };
  }

  if (!ageConfirmed) return { status: "error", message: "Debes confirmar que eres mayor de 18 años." };
  if (name.length < 1 || name.length > 80) {
    return { status: "error", message: "El nombre debe tener entre 1 y 80 caracteres" };
  }
  if (!/^\d{10}$/.test(phone)) return { status: "error", message: "El celular debe tener 10 dígitos" };
  if (address.length < 1 || address.length > 200) {
    return { status: "error", message: "La dirección debe tener entre 1 y 200 caracteres" };
  }
  if (notes.length > 300) return { status: "error", message: "Las notas no pueden pasar de 300 caracteres" };
  if (!zoneId) return { status: "error", message: "Zona de domicilio no válida" };
  if (!(payment in PAYMENT_METHODS)) return { status: "error", message: "Elige una forma de pago." };
  if (rawItems.length === 0) return { status: "error", message: "El pedido está vacío" };
  if (rawItems.length > 30) return { status: "error", message: "El pedido no puede tener más de 30 líneas" };

  const items: CartItem[] = [];
  for (const item of rawItems) {
    const quantity = Number(item.quantity);
    if ((item.type !== "product" && item.type !== "combo") || !UUID.test(String(item.id ?? ""))) {
      return { status: "error", message: "Un producto del pedido ya no está disponible" };
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
      return { status: "error", message: "Cada producto debe pedirse entre 1 y 50 unidades" };
    }
    items.push({ ...item, quantity });
  }

  if (!isSupabaseConfigured()) {
    return { status: "error", message: "La tienda está en modo demo: conecta Supabase para recibir pedidos." };
  }

  const payload = {
    p_name: name,
    p_phone: phone,
    p_address: address,
    p_zone_id: zoneId,
    p_payment: payment,
    p_age_confirmed: true,
    p_items: items.map((i) => ({ type: i.type, id: i.id, quantity: i.quantity })),
    p_notes: notes || null,
    p_accepts_marketing: acceptsMarketing,
  };
  const supabase = createPublicClient();
  let { data, error } = await supabase.rpc("create_order", payload).single<{ order_number: number; order_total: number }>();
  if (error && /schema cache|PGRST202/i.test(error.message)) {
    ({ data, error } = await supabase
      .rpc("create_order", {
        p_name: payload.p_name,
        p_phone: payload.p_phone,
        p_address: payload.p_address,
        p_zone_id: payload.p_zone_id,
        p_payment: payload.p_payment,
        p_age_confirmed: payload.p_age_confirmed,
        p_items: payload.p_items,
        p_notes: payload.p_notes,
      })
      .single<{ order_number: number; order_total: number }>());
  }

  if (error || !data) return { status: "error", message: orderErrorMessage(error) };
  return { status: "ok", number: data.order_number, total: data.order_total };
}
