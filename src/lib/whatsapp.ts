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

export function buildOrderMessage(items: CartItem[], order: OrderSummary, storeName: string) {
  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  return [
    `Hola ${storeName}, este es mi pedido #${order.number}:`,
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

export function whatsappLink(message: string, phone = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "") {
  const digits = phone.replace(/\D/g, "");
  const full = digits.startsWith("57") && digits.length >= 12 ? digits : `57${digits}`;
  return `https://wa.me/${full}?text=${encodeURIComponent(message)}`;
}

export function buildAppointmentMessage(input: {
  storeName: string;
  number: number;
  service: string;
  professional: string;
  when: string;
  price: number;
  name: string;
  notes: string;
}) {
  return [
    `Hola ${input.storeName}, reservé la cita #${input.number}:`,
    "",
    `${input.service} con ${input.professional}`,
    input.when,
    `Valor: ${formatCOP(input.price)}`,
    "",
    `Nombre: ${input.name}`,
    ...(input.notes ? [`Notas: ${input.notes}`] : []),
  ].join("\n");
}

export function appointmentReminder(name: string, storeName: string, when: string, service: string) {
  return `Hola ${name}, te recuerda ${storeName} tu cita de ${service} el ${when}. Si no puedes venir, avísanos por aquí.`;
}

export function reminderMessage(name: string, storeName: string, promotion?: string) {
  const offer = promotion
    ? `Tenemos esta promoción: ${promotion}. ¿Te armamos el pedido?`
    : "¿Te armamos el pedido para este fin de semana?";
  return `Hola ${name}, te escribe ${storeName}. ${offer}`;
}
