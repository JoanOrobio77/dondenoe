import { formatCOP } from "./format";
import type { CartItem } from "./types";

export function buildOrderMessage(items: CartItem[], orderNumber?: number) {
  const lines = items.map((i) => `• ${i.quantity} x ${i.name} — ${formatCOP(i.price * i.quantity)}`);
  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const header = orderNumber ? `Hola DondeNoe, este es mi pedido #${orderNumber}:` : "Hola DondeNoe, quiero pedir:";
  return [header, "", ...lines, "", `Subtotal: ${formatCOP(subtotal)}`].join("\n");
}

export function whatsappLink(message: string) {
  const phone = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "";
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
