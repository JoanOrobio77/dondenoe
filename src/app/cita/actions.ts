"use server";

import { redirect } from "next/navigation";
import { resolveRequest } from "@/lib/store";
import { createPublicClient } from "@/lib/supabase/public";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TOKEN = /^[0-9a-f]{32}$/i;

const SAFE = new Set([
  "Este negocio no recibe citas",
  "El horario ya no está disponible",
  "Ya tienes varias citas pendientes. Escríbenos por WhatsApp para seguir",
  "El nombre debe tener entre 1 y 80 caracteres",
  "El celular debe tener 10 dígitos",
  "Las notas no pueden pasar de 300 caracteres",
  "El servicio no está disponible",
  "El profesional no realiza ese servicio",
  "La cita queda muy pronto",
  "Esa fecha está fuera del calendario",
  "No encontramos esa cita",
  "Ya no se puede cancelar en línea",
]);

export type Slot = {
  professional_id: string;
  professional_name: string;
  starts_at: string;
  ends_at: string;
  price: number;
};

export type BookedAppointment = {
  number: number;
  token: string;
  startsAt: string;
  endsAt: string;
  price: number;
};

function readable(error: { message?: string } | null, fallback: string) {
  const text = (error?.message ?? "").replace(/^ERROR:\s*/i, "").trim();
  if (SAFE.has(text)) return text;
  console.error(fallback, error?.message);
  return fallback;
}

async function openAgenda() {
  const { store } = await resolveRequest();
  if (!store || store.template !== "agenda" || !store.ordersOpen) return null;
  return store;
}

export async function getSlots(serviceId: string, professionalId: string | null, date: string) {
  const store = await openAgenda();
  if (!store) return { ok: false as const, message: "Este negocio no recibe citas" };
  if (!UUID.test(serviceId) || !DATE.test(date)) {
    return { ok: false as const, message: "Esa fecha está fuera del calendario" };
  }
  if (professionalId && !UUID.test(professionalId)) {
    return { ok: false as const, message: "El profesional no realiza ese servicio" };
  }

  const { data, error } = await createPublicClient().rpc("get_availability", {
    p_business_id: store.id,
    p_service_id: serviceId,
    p_professional_id: professionalId,
    p_date: date,
  });
  if (error) return { ok: false as const, message: readable(error, "No se pudo consultar el horario.") };
  const slots = ((data ?? []) as Slot[]).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  return { ok: true as const, slots };
}

export async function bookAppointment(input: {
  serviceId: string;
  professionalId: string;
  startsAt: string;
  name: string;
  phone: string;
  notes: string;
}) {
  const store = await openAgenda();
  if (!store) return { ok: false as const, message: "Este negocio no recibe citas" };
  if (!UUID.test(input.serviceId) || !UUID.test(input.professionalId)) {
    return { ok: false as const, message: "El profesional no realiza ese servicio" };
  }

  const { data, error } = await createPublicClient().rpc("book_appointment", {
    p_business_id: store.id,
    p_service_id: input.serviceId,
    p_professional_id: input.professionalId,
    p_starts: input.startsAt,
    p_name: input.name,
    p_phone: input.phone,
    p_notes: input.notes,
    p_channel: "web",
  });
  if (error) return { ok: false as const, message: readable(error, "No se pudo guardar la cita.") };
  const row = (Array.isArray(data) ? data[0] : data) as
    | { appointment_number: number; cancel_token: string; starts_at: string; ends_at: string; price: number }
    | undefined;
  if (!row) return { ok: false as const, message: "No se pudo guardar la cita." };
  const booked: BookedAppointment = {
    number: row.appointment_number,
    token: row.cancel_token,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    price: row.price,
  };
  return { ok: true as const, booked };
}

export async function cancelAppointment(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  if (!TOKEN.test(token)) redirect("/cita/no-encontrada");
  const { error } = await createPublicClient().rpc("cancel_appointment_by_token", { p_token: token });
  if (error) {
    const text = readable(error, "No se pudo cancelar la cita.");
    redirect(`/cita/${token}?error=${encodeURIComponent(text)}`);
  }
  redirect(`/cita/${token}?ok=1`);
}
