"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { localInputToIso } from "@/lib/zoned-time";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const SAFE = new Set([
  "Este negocio no recibe citas",
  "El horario ya no está disponible",
  "El nombre debe tener entre 1 y 80 caracteres",
  "El celular debe tener 10 dígitos",
  "Las notas no pueden pasar de 300 caracteres",
  "El servicio no está disponible",
  "El profesional no realiza ese servicio",
  "La cita queda muy pronto",
  "Esa fecha está fuera del calendario",
  "Esa cita ya no se puede mover",
  "Solo el dueño puede cambiar el precio",
  "No autorizado",
]);

function text(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function readable(error: { message?: string } | null, fallback: string) {
  const message = (error?.message ?? "").replace(/^ERROR:\s*/i, "").trim();
  if (SAFE.has(message)) return message;
  console.error(fallback, error?.message);
  return fallback;
}

function fail(path: string, message: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
}

function finish(path: string): never {
  refresh();
  redirect(path);
}

async function agenda() {
  const session = await requireAdmin();
  if (session.business.template !== "agenda") redirect("/admin");
  return session;
}

function boardPath(formData: FormData) {
  const day = text(formData.get("dia"));
  const view = text(formData.get("vista")) === "semana" ? "semana" : "dia";
  const params = new URLSearchParams({ vista: view });
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) params.set("dia", day);
  return `/admin?${params.toString()}`;
}

export async function setAppointmentStatus(formData: FormData) {
  const { supabase, business } = await agenda();
  const path = boardPath(formData);
  const id = text(formData.get("id"));
  const status = text(formData.get("status"));
  if (!UUID.test(id) || !["confirmada", "completada", "cancelada", "no_asistio"].includes(status)) {
    fail(path, "Esa cita ya no se puede mover");
  }
  const { data, error } = await supabase
    .from("appointments")
    .update({ status })
    .eq("id", id)
    .eq("business_id", business.id)
    .in("status", ["pendiente", "confirmada"])
    .select("id");
  if (error || !data?.length) fail(path, readable(error, "Esa cita ya no se puede cambiar."));
  finish(path);
}

export async function moveAppointment(formData: FormData) {
  const { supabase, business } = await agenda();
  const path = boardPath(formData);
  const id = text(formData.get("id"));
  const starts = localInputToIso(text(formData.get("starts")), business.timezone);
  if (!UUID.test(id) || !starts) fail(path, "Revisa la nueva hora.");
  const { error } = await supabase.rpc("move_appointment", { p_id: id, p_starts: starts });
  if (error) fail(path, readable(error, "No se pudo mover la cita."));
  finish(path);
}

export async function createManualAppointment(formData: FormData) {
  const { supabase, business } = await agenda();
  const path = boardPath(formData);
  const starts = localInputToIso(text(formData.get("starts")), business.timezone);
  if (!starts) fail(path, "Revisa la hora de la cita.");
  const { error } = await supabase.rpc("book_appointment", {
    p_business_id: business.id,
    p_service_id: text(formData.get("serviceId")),
    p_professional_id: text(formData.get("professionalId")),
    p_starts: starts,
    p_name: text(formData.get("name")),
    p_phone: text(formData.get("phone")),
    p_notes: text(formData.get("notes")),
    p_channel: "manual",
  });
  if (error) fail(path, readable(error, "No se pudo crear la cita."));
  finish(path);
}

async function serviceCategory(supabase: Awaited<ReturnType<typeof agenda>>["supabase"], businessId: string) {
  const { data: existing } = await supabase
    .from("categories")
    .select("id")
    .eq("business_id", businessId)
    .order("id")
    .limit(1)
    .maybeSingle();
  if (existing) return existing.id;
  const { data, error } = await supabase
    .from("categories")
    .insert({ business_id: businessId, name: "Servicios", slug: "servicios" })
    .select("id")
    .single();
  if (error || !data) return null;
  return data.id;
}

export async function saveService(formData: FormData) {
  const { supabase, business, owner } = await agenda();
  const name = text(formData.get("name"));
  const duration = Math.trunc(Number(formData.get("duration")));
  const price = Math.round(Number(formData.get("price")));
  const id = text(formData.get("id"));
  const active = formData.get("active") === "on";
  if (name.length < 1 || name.length > 80 || !Number.isInteger(duration) || duration < 5 || duration > 480) {
    fail("/admin/servicios", "Revisa el nombre y la duración. La duración va de 5 a 480 minutos.");
  }
  if (owner && (!Number.isInteger(price) || price < 0)) fail("/admin/servicios", "El precio no es válido.");

  if (!id) {
    if (!owner) fail("/admin/servicios", "Solo el dueño puede crear un servicio con precio.");
    const categoryId = await serviceCategory(supabase, business.id);
    if (!categoryId) fail("/admin/servicios", "No se pudo crear la categoría de servicios.");
    const { error } = await supabase.from("products").insert({
      business_id: business.id,
      category_id: categoryId,
      name,
      price,
      kind: "service",
      duration_minutes: duration,
      stock: 0,
      active,
    });
    if (error) fail("/admin/servicios", readable(error, "No se pudo guardar el servicio."));
    finish("/admin/servicios");
  }

  if (!UUID.test(id)) fail("/admin/servicios", "No encontramos ese servicio.");
  const { error } = await supabase
    .from("products")
    .update({
      name,
      duration_minutes: duration,
      active,
      ...(owner ? { price } : {}),
    })
    .eq("id", id)
    .eq("business_id", business.id)
    .eq("kind", "service");
  if (error) fail("/admin/servicios", readable(error, "No se pudo guardar el servicio."));
  finish("/admin/servicios");
}

export async function deleteService(formData: FormData) {
  const { supabase, business, owner } = await agenda();
  if (!owner) fail("/admin/servicios", "Solo el dueño puede borrar un servicio.");
  const id = text(formData.get("id"));
  if (!UUID.test(id)) fail("/admin/servicios", "No encontramos ese servicio.");
  const { error } = await supabase.from("products").delete().eq("id", id).eq("business_id", business.id).eq("kind", "service");
  if (error) fail("/admin/servicios", "No se pudo borrar. Si ya tiene citas, desactívalo.");
  finish("/admin/servicios");
}

export async function saveProfessional(formData: FormData) {
  const { supabase, business } = await agenda();
  const name = text(formData.get("name"));
  const id = text(formData.get("id"));
  const photo = text(formData.get("photo"));
  const member = text(formData.get("member"));
  if (name.length < 1 || name.length > 80) fail("/admin/profesionales", "El nombre debe tener entre 1 y 80 caracteres.");
  if (photo.length > 300) fail("/admin/profesionales", "La foto debe ser un enlace corto.");
  if (member && !UUID.test(member)) fail("/admin/profesionales", "Esa cuenta del equipo no existe.");
  const row = {
    name,
    photo_url: photo || null,
    active: formData.get("active") === "on",
    user_id: member || null,
  };
  const query = id
    ? supabase.from("professionals").update(row).eq("id", id).eq("business_id", business.id)
    : supabase.from("professionals").insert({ ...row, business_id: business.id });
  const { error } = await query;
  if (error) fail("/admin/profesionales", readable(error, "No se pudo guardar el profesional."));
  finish("/admin/profesionales");
}

export async function deleteProfessional(formData: FormData) {
  const { supabase, business, owner } = await agenda();
  if (!owner) fail("/admin/profesionales", "Solo el dueño puede borrar un profesional.");
  const id = text(formData.get("id"));
  if (!UUID.test(id)) fail("/admin/profesionales", "No encontramos a esa persona.");
  const { error } = await supabase.from("professionals").delete().eq("id", id).eq("business_id", business.id);
  if (error) fail("/admin/profesionales", "No se pudo borrar. Si ya tiene citas, desactívalo.");
  finish("/admin/profesionales");
}

export async function addHour(formData: FormData) {
  const { supabase, business } = await agenda();
  const professionalId = text(formData.get("professionalId"));
  const weekday = Number(formData.get("weekday"));
  const start = text(formData.get("start"));
  const end = text(formData.get("end"));
  if (!UUID.test(professionalId) || !Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    fail("/admin/profesionales", "Revisa el día del horario.");
  }
  if (!TIME.test(start) || !TIME.test(end) || end <= start) {
    fail("/admin/profesionales", "La hora de salida tiene que ser después de la de entrada.");
  }
  const { error } = await supabase.from("professional_hours").insert({
    business_id: business.id,
    professional_id: professionalId,
    weekday,
    start_time: start,
    end_time: end,
  });
  if (error) fail("/admin/profesionales", readable(error, "No se pudo guardar el horario."));
  finish("/admin/profesionales");
}

export async function deleteHour(formData: FormData) {
  const { supabase, business } = await agenda();
  const id = text(formData.get("id"));
  if (!UUID.test(id)) fail("/admin/profesionales", "No encontramos ese horario.");
  const { error } = await supabase.from("professional_hours").delete().eq("id", id).eq("business_id", business.id);
  if (error) fail("/admin/profesionales", "No se pudo quitar el horario.");
  finish("/admin/profesionales");
}

export async function addBlock(formData: FormData) {
  const { supabase, business } = await agenda();
  const professionalId = text(formData.get("professionalId"));
  const starts = localInputToIso(text(formData.get("starts")), business.timezone);
  const ends = localInputToIso(text(formData.get("ends")), business.timezone);
  const reason = text(formData.get("reason"));
  if (!UUID.test(professionalId) || !starts || !ends || ends <= starts) {
    fail("/admin/profesionales", "Revisa el rango del bloqueo.");
  }
  if (reason.length > 120) fail("/admin/profesionales", "El motivo no puede pasar de 120 caracteres.");
  const { error } = await supabase.from("professional_blocks").insert({
    business_id: business.id,
    professional_id: professionalId,
    starts_at: starts,
    ends_at: ends,
    reason: reason || null,
  });
  if (error) fail("/admin/profesionales", readable(error, "No se pudo guardar el bloqueo."));
  finish("/admin/profesionales");
}

export async function deleteBlock(formData: FormData) {
  const { supabase, business } = await agenda();
  const id = text(formData.get("id"));
  if (!UUID.test(id)) fail("/admin/profesionales", "No encontramos ese bloqueo.");
  const { error } = await supabase.from("professional_blocks").delete().eq("id", id).eq("business_id", business.id);
  if (error) fail("/admin/profesionales", "No se pudo quitar el bloqueo.");
  finish("/admin/profesionales");
}

export async function saveProfessionalServices(formData: FormData) {
  const { supabase, business } = await agenda();
  const professionalId = text(formData.get("professionalId"));
  if (!UUID.test(professionalId)) fail("/admin/profesionales", "No encontramos a esa persona.");
  const ids = formData.getAll("serviceId").map((value) => String(value)).filter((value) => UUID.test(value));
  const { error: removed } = await supabase
    .from("professional_services")
    .delete()
    .eq("professional_id", professionalId)
    .eq("business_id", business.id);
  if (removed) fail("/admin/profesionales", "No se pudieron actualizar los servicios.");
  if (ids.length > 0) {
    const { error } = await supabase.from("professional_services").insert(
      ids.map((productId) => ({
        business_id: business.id,
        professional_id: professionalId,
        product_id: productId,
      })),
    );
    if (error) fail("/admin/profesionales", readable(error, "No se pudieron asignar los servicios."));
  }
  finish("/admin/profesionales");
}
