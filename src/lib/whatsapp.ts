import { formatCOP } from "./format";
import type { CartItem } from "./types";

export const PAYMENT_METHODS = {
  efectivo: "Efectivo",
  nequi: "Nequi",
  daviplata: "Daviplata",
  transferencia: "Transferencia",
} as const;

export type PaymentMethod = keyof typeof PAYMENT_METHODS;

export type OrderSummary = {
  number: number;
  total: number;
  name: string;
  address: string;
  zoneName: string;
  deliveryFee: number;
  payment: PaymentMethod;
  notes: string;
};

export function buildOrderMessage(items: CartItem[], order: OrderSummary) {
  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  return [
    `Hola DondeNoe, este es mi pedido #${order.number}:`,
    "",
    ...items.map((i) => `• ${i.quantity} x ${i.name} — ${formatCOP(i.price * i.quantity)}`),
    "",
    `Subtotal: ${formatCOP(subtotal)}`,
    `Domicilio (${order.zoneName}): ${formatCOP(order.deliveryFee)}`,
    `*Total: ${formatCOP(order.total)}*`,
    "",
    `Nombre: ${order.name}`,
    `Dirección: ${order.address}`,
    `Pago: ${PAYMENT_METHODS[order.payment]}`,
    ...(order.notes ? [`Notas: ${order.notes}`] : []),
  ].join("\n");
}

export function whatsappLink(message: string) {
  const phone = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "";
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
