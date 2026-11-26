"use server";

import { refresh, updateTag } from "next/cache";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth";
import { DOMAIN, isPlatformConsoleHost, isSlug, ownerWelcomeUrl } from "@/lib/platform";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import type { OpeningHours } from "@/lib/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIME = /^\d{2}:\d{2}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

type AdminClient = ReturnType<typeof createAdminSupabase>;

function checked(formData: FormData, name: string) {
  return formData.get(name) === "on";
}

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function openingHours(formData: FormData): OpeningHours | null {
  if (!checked(formData, "hours")) return {};
  const open = clean(formData.get("open"));
  const close = clean(formData.get("close"));
  if (!TIME.test(open) || !TIME.test(close) || open === close) return null;
  const day = { open, close };
  return Object.fromEntries(DAYS.map((key) => [key, day]));
}

const SLOT_MINUTES = new Set([5, 10, 15, 20, 30, 60]);

function agendaInput(formData: FormData) {
  const address = clean(formData.get("address"));
  const buffer = Number(clean(formData.get("buffer")));
  const notice = Number(clean(formData.get("notice")));
  const horizon = Number(clean(formData.get("horizon")));
  const slot = Number(clean(formData.get("slot")));
  const cancelHours = Number(clean(formData.get("cancelHours")));
  const online = clean(formData.get("onlineStatus")) || "confirmada";
  if (address.length > 200) return { error: "La dirección no puede pasar de 200 caracteres." as const };
  if (!Number.isInteger(buffer) || buffer < 0 || buffer > 180) {
    return { error: "El tiempo entre citas debe estar entre 0 y 180 minutos." as const };
  }
  if (!Number.isInteger(notice) || notice < 0 || notice > 10080) {
    return { error: "La anticipación debe estar entre 0 y 10080 minutos." as const };
  }
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 180) {
    return { error: "El horizonte debe estar entre 1 y 180 días." as const };
  }
  if (!SLOT_MINUTES.has(slot)) return { error: "El intervalo de horarios no es válido." as const };
  if (!Number.isInteger(cancelHours) || cancelHours < 0 || cancelHours > 168) {
    return { error: "La política de cancelación debe estar entre 0 y 168 horas." as const };
  }
  if (online !== "pendiente" && online !== "confirmada") {
    return { error: "Elige si la cita en línea queda pendiente o confirmada." as const };
  }
  return {
    address: address || null,
    buffer_minutes: buffer,
    min_notice_minutes: notice,
    max_horizon_days: horizon,
    slot_minutes: slot,
    cancel_notice_hours: cancelHours,
    online_status: online,
  };
}

function endOfBogotaDay(date: string) {
  return new Date(`${date}T23:59:59-05:00`).toISOString();
}

function alreadyRegistered(error: { message?: string; code?: string } | null) {
  const text = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
  return text.includes("already") || text.includes("email_exists") || text.includes("registered");
}

function inviteError(error: { message?: string } | null) {
  const text = error?.message ?? "";
  console.error("invite", text);
  if (text.toLowerCase().includes("redirect")) {
    return "Supabase rechazó la dirección de la invitación. Agrégala en Authentication → URL Configuration.";
  }
  return "No se pudo enviar la invitación.";
}

function dbMessage(error: { message?: string } | null, fallback: string) {
  const text = error?.message ?? "";
  console.error(text);
  if (text.includes("sin dueño")) return "Este negocio no puede quedar sin dueño.";
  if (text.includes("superadmin")) return "Solo el superadmin puede cambiar el plan o el estado.";
  if (text.includes("businesses_slug") || (text.includes("duplicate") && text.includes("slug"))) {
    return "Ese slug ya está en uso.";
  }
  if (text.includes("domain")) return "Ese dominio no es válido o ya está registrado.";
  if (text.includes("row-level security")) return "No tienes permiso para ese cambio.";
  return fallback;
}

async function audit(
  supabase: Awaited<ReturnType<typeof requirePlatformAdmin>>["supabase"],
  actor: string,
  action: string,
  businessId: string | null,
  detail: Record<string, unknown>,
) {
  const { error } = await supabase.from("platform_audit_log").insert({
    actor,
    action,
    business_id: businessId,
    detail,
  });
  return error ? "El cambio quedó hecho, pero no se pudo guardar la auditoría." : null;
}

function refreshStore(slug: string) {
  updateTag(`catalog:${slug}`);
  updateTag(`promotions:${slug}`);
  refresh();
}

function notice(path: string, kind: "ok" | "error", message: string): never {
  redirect(`${path}?${kind}=${encodeURIComponent(message)}`);
}

async function inviteOrFind(admin: AdminClient, email: string, name: string, redirectTo: string) {
  const invited = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { full_name: name },
  });
  if (!invited.error && invited.data.user) {
    return { userId: invited.data.user.id, created: true as const };
  }
  if (alreadyRegistered(invited.error)) {
    const existing = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (existing.error || !existing.data.user) {
      return { error: "Ese correo ya tiene cuenta, pero no pude vincularla." };
    }
    return { userId: existing.data.user.id, created: false as const };
  }
  return { error: inviteError(invited.error) };
}

async function discardBusiness(
  supabase: Awaited<ReturnType<typeof requirePlatformAdmin>>["supabase"],
  admin: AdminClient,
  businessId: string,
  createdUserId: string | null,
) {
  if (createdUserId) await admin.auth.admin.deleteUser(createdUserId);
  await supabase.from("businesses").delete().eq("id", businessId);
}

export async function platformSignIn(_prev: string | null, formData: FormData) {
  const headerStore = await headers();
  const host = headerStore.get("x-business-host") || headerStore.get("x-forwarded-host") || headerStore.get("host");
  if (!isPlatformConsoleHost(host)) notFound();
  const supabase = await createServerSupabase();

  const { error } = await supabase.auth.signInWithPassword({
    email: clean(formData.get("email")),
    password: String(formData.get("password") ?? ""),
  });
  if (error) return "Correo o contraseña incorrectos.";

  const { data: allowed } = await supabase.rpc("is_platform_admin");
  if (allowed !== true) {
    await supabase.auth.signOut();
    return "Esta cuenta no administra la plataforma.";
  }
  redirect("/plataforma");
}

export async function platformSignOut() {
  const { supabase } = await requirePlatformAdmin();
  await supabase.auth.signOut();
  redirect("/plataforma/login");
}

export async function updateGraceDays(formData: FormData) {
  const { supabase, user } = await requirePlatformAdmin();
  const days = Number(clean(formData.get("days")));
  if (!Number.isInteger(days) || days < 0 || days > 60) {
    notice("/plataforma", "error", "Los días de mora deben estar entre 0 y 60.");
  }
  const { error } = await supabase.from("platform_settings").update({ value: days }).eq("key", "past_due_grace_days");
  if (error) notice("/plataforma", "error", dbMessage(error, "No se pudo guardar el plazo."));
  const auditError = await audit(supabase, user.id, "cambiar plazo de mora", null, { days });
  notice("/plataforma", "ok", auditError ?? `Una tienda con pago pendiente sigue abierta ${days} días.`);
}

export async function createBusiness(_prev: string | null, formData: FormData) {
  const { supabase, user } = await requirePlatformAdmin();
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return "Falta SUPABASE_SERVICE_ROLE_KEY en el servidor. No creé el negocio.";
  }

  const name = clean(formData.get("name"));
  const slug = clean(formData.get("slug")).toLowerCase();
  const template = clean(formData.get("template"));
  const plan = clean(formData.get("plan"));
  const status = clean(formData.get("status"));
  const trialEnds = clean(formData.get("trialEnds"));
  const whatsapp = clean(formData.get("whatsapp")).replace(/\D/g, "");
  const timezone = clean(formData.get("timezone")) || "America/Bogota";
  const ownerEmail = clean(formData.get("ownerEmail")).toLowerCase();
  const ownerName = clean(formData.get("ownerName"));
  const hours = openingHours(formData);

  if (name.length < 1 || name.length > 80) return "El nombre debe tener entre 1 y 80 caracteres.";
  if (!isSlug(slug)) return "El slug solo puede tener minúsculas, números y guiones.";
  if (template !== "tienda" && template !== "agenda") return "Elige una plantilla.";
  if (plan !== "basico" && plan !== "completo") return "Elige un plan.";
  if (status !== "trial" && status !== "active") return "El estado inicial solo puede ser prueba o activo.";
  if (status === "trial" && !DATE.test(trialEnds)) return "Indica hasta cuándo dura la prueba.";
  if (whatsapp && (whatsapp.length < 10 || whatsapp.length > 15)) return "El WhatsApp debe tener entre 10 y 15 dígitos.";
  if (timezone.length < 1 || timezone.length > 64) return "La zona horaria no es válida.";
  if (!EMAIL.test(ownerEmail)) return "El correo del dueño no es válido.";
  if (ownerName.length < 1 || ownerName.length > 80) return "El nombre del dueño debe tener entre 1 y 80 caracteres.";
  if (!hours) return "Revisa la hora de apertura y la de cierre.";

  const { data: taken } = await supabase.from("businesses").select("id").eq("slug", slug).maybeSingle();
  if (taken) return "Ese slug ya está en uso.";

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .insert({
      slug,
      name,
      template,
      plan,
      status,
      trial_ends_at: status === "trial" ? endOfBogotaDay(trialEnds) : null,
      whatsapp_number: whatsapp || null,
      timezone,
    })
    .select("id")
    .single();
  if (businessError || !business) return dbMessage(businessError, "No se pudo crear el negocio.");

  const admin = createAdminSupabase();
  const { error: settingsError } = await supabase.from("business_settings").insert({
    business_id: business.id,
    age_verification: checked(formData, "age"),
    tobacco_rules: checked(formData, "tobacco"),
    delivery: checked(formData, "delivery"),
    opening_hours: hours,
    appointments: template === "agenda",
  });
  if (settingsError) {
    await discardBusiness(supabase, admin, business.id, null);
    return dbMessage(settingsError, "No se pudieron guardar los ajustes. Deshice el negocio.");
  }

  if (template === "agenda") {
    const agenda = agendaInput(formData);
    if ("error" in agenda) {
      await discardBusiness(supabase, admin, business.id, null);
      return `${agenda.error} Deshice el negocio.`;
    }
    const { error: agendaError } = await supabase.from("agenda_settings").insert({ business_id: business.id, ...agenda });
    if (agendaError) {
      await discardBusiness(supabase, admin, business.id, null);
      return `${dbMessage(agendaError, "No se pudieron guardar los ajustes de la agenda.")} Deshice el negocio.`;
    }
  }

  const welcome = ownerWelcomeUrl(slug);
  const person = await inviteOrFind(admin, ownerEmail, ownerName, welcome);
  if ("error" in person) {
    await discardBusiness(supabase, admin, business.id, null);
    return `${person.error} Deshice el negocio.`;
  }

  const { error: memberError } = await supabase.from("business_members").insert({
    business_id: business.id,
    user_id: person.userId,
    role: "owner",
  });
  if (memberError) {
    await discardBusiness(supabase, admin, business.id, person.created ? person.userId : null);
    return `${dbMessage(memberError, "No pude dejar al dueño en el equipo.")} Deshice el negocio.`;
  }

  const linked = person.created
    ? "Invité al dueño por correo para que cree su contraseña."
    : "Este correo ya tenía cuenta. Lo vinculé como dueño, sin enviar otra invitación.";
  const auditError = await audit(supabase, user.id, "crear negocio", business.id, {
    slug,
    owner_email: ownerEmail,
    linked_existing: !person.created,
  });
  notice(`/plataforma/${business.id}`, "ok", auditError ?? linked);
}

async function businessOf(id: string) {
  const session = await requirePlatformAdmin();
  if (!UUID.test(id)) notice("/plataforma", "error", "No encontramos ese negocio.");
  const { data } = await session.supabase
    .from("businesses")
    .select("id, slug, status, plan")
    .eq("id", id)
    .maybeSingle();
  if (!data) notice("/plataforma", "error", "No encontramos ese negocio.");
  return { ...session, business: data };
}

export async function updateBusiness(formData: FormData) {
  const id = clean(formData.get("businessId"));
  const { supabase, user, business } = await businessOf(id);
  const name = clean(formData.get("name"));
  const whatsapp = clean(formData.get("whatsapp")).replace(/\D/g, "");
  const timezone = clean(formData.get("timezone")) || "America/Bogota";
  const plan = clean(formData.get("plan"));
  if (name.length < 1 || name.length > 80) notice(`/plataforma/${id}`, "error", "El nombre debe tener entre 1 y 80 caracteres.");
  if (whatsapp && (whatsapp.length < 10 || whatsapp.length > 15)) {
    notice(`/plataforma/${id}`, "error", "El WhatsApp debe tener entre 10 y 15 dígitos.");
  }
  if (plan !== "basico" && plan !== "completo") notice(`/plataforma/${id}`, "error", "Elige un plan.");

  const { error } = await supabase
    .from("businesses")
    .update({ name, whatsapp_number: whatsapp || null, timezone, plan })
    .eq("id", id);
  if (error) notice(`/plataforma/${id}`, "error", dbMessage(error, "No se pudo guardar el negocio."));
  const auditError = await audit(supabase, user.id, "editar negocio", id, {
    name,
    plan,
    previous_plan: business.plan,
  });
  notice(`/plataforma/${id}`, "ok", auditError ?? "Guardé los datos del negocio.");
}

export async function updateBusinessSettings(formData: FormData) {
  const id = clean(formData.get("businessId"));
  const { supabase, user, business } = await businessOf(id);
  const hours = openingHours(formData);
  if (!hours) notice(`/plataforma/${id}`, "error", "Revisa la hora de apertura y la de cierre.");
  const { error } = await supabase
    .from("business_settings")
    .update({
      age_verification: checked(formData, "age"),
      tobacco_rules: checked(formData, "tobacco"),
      delivery: checked(formData, "delivery"),
      opening_hours: hours,
    })
    .eq("business_id", id);
  if (error) notice(`/plataforma/${id}`, "error", dbMessage(error, "No se pudieron guardar los ajustes."));
  refreshStore(business.slug);
  const auditError = await audit(supabase, user.id, "editar ajustes", id, {});
  notice(`/plataforma/${id}`, "ok", auditError ?? "Guardé los ajustes.");
}

export async function updateBusinessStatus(formData: FormData) {
  const id = clean(formData.get("businessId"));
  const { supabase, user, business } = await businessOf(id);
  const status = clean(formData.get("status"));
  const trialEnds = clean(formData.get("trialEnds"));
  if (!["trial", "active", "past_due", "suspended"].includes(status)) {
    notice(`/plataforma/${id}`, "error", "Ese estado no existe.");
  }
  if (status === "trial" && !DATE.test(trialEnds)) {
    notice(`/plataforma/${id}`, "error", "Indica hasta cuándo dura la prueba.");
  }
  const { error } = await supabase
    .from("businesses")
    .update({
      status,
      trial_ends_at: status === "trial" ? endOfBogotaDay(trialEnds) : null,
    })
    .eq("id", id);
  if (error) notice(`/plataforma/${id}`, "error", dbMessage(error, "No se pudo cambiar el estado."));
  refreshStore(business.slug);
  const auditError = await audit(supabase, user.id, "cambiar estado", id, { from: business.status, to: status });
  notice(`/plataforma/${id}`, "ok", auditError ?? "Cambié el estado.");
}

export async function recordPayment(formData: FormData) {
  const id = clean(formData.get("businessId"));
  const { supabase, user, business } = await businessOf(id);
  const amount = Number(clean(formData.get("amount")));
  const method = clean(formData.get("method"));
  const paidAt = clean(formData.get("paidAt"));
  const periodStart = clean(formData.get("periodStart"));
  const periodEnd = clean(formData.get("periodEnd"));
  const notes = clean(formData.get("notes"));
  if (!Number.isInteger(amount) || amount <= 0 || amount > 100_000_000) {
    notice(`/plataforma/${id}`, "error", "El monto debe ser un número entero de pesos.");
  }
  if (!["efectivo", "transferencia", "nequi", "daviplata"].includes(method)) {
    notice(`/plataforma/${id}`, "error", "Elige el medio de pago.");
  }
  if (!DATE.test(paidAt) || !DATE.test(periodStart) || !DATE.test(periodEnd) || periodEnd < periodStart) {
    notice(`/plataforma/${id}`, "error", "Revisa la fecha del pago y el periodo que cubre.");
  }
  if (notes.length > 300) notice(`/plataforma/${id}`, "error", "La nota no puede pasar de 300 caracteres.");

  const paidUntil = endOfBogotaDay(periodEnd);
  const { error } = await supabase.from("payments").insert({
    business_id: id,
    amount,
    method,
    paid_at: endOfBogotaDay(paidAt),
    period_start: periodStart,
    period_end: periodEnd,
    notes: notes || null,
    created_by: user.id,
  });
  if (error) notice(`/plataforma/${id}`, "error", dbMessage(error, "No se pudo registrar el pago."));

  const { error: statusError } = await supabase
    .from("businesses")
    .update({ paid_until: paidUntil, status: "active" })
    .eq("id", id);
  if (statusError) {
    notice(`/plataforma/${id}`, "error", "El pago quedó registrado, pero no pude actualizar la vigencia.");
  }
  refreshStore(business.slug);
  const auditError = await audit(supabase, user.id, "registrar pago", id, {
    amount,
    method,
    period_start: periodStart,
    period_end: periodEnd,
  });
  notice(`/plataforma/${id}`, "ok", auditError ?? "Registré el pago y dejé el negocio activo.");
}

async function memberEmail(userId: string) {
  const admin = createAdminSupabase();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user?.email) return null;
  return data.user.email;
}

export async function resendInvite(formData: FormData) {
  const id = clean(formData.get("businessId"));
  const userId = clean(formData.get("userId"));
  const { supabase, user, business } = await businessOf(id);
  if (!UUID.test(userId)) notice(`/plataforma/${id}`, "error", "No encontramos a esa persona.");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    notice(`/plataforma/${id}`, "error", "Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.");
  }
  const email = await memberEmail(userId);
  if (!email) notice(`/plataforma/${id}`, "error", "No encontré el correo de esa persona.");

  const admin = createAdminSupabase();
  const welcome = ownerWelcomeUrl(business.slug);
  const invited = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: welcome });
  let message = "Reenvié la invitación.";
  if (alreadyRegistered(invited.error)) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: welcome });
    if (error) notice(`/plataforma/${id}`, "error", inviteError(error));
    message = "Esa persona ya tenía cuenta. Le envié un enlace para definir la contraseña.";
  } else if (invited.error) {
    notice(`/plataforma/${id}`, "error", inviteError(invited.error));
  }
  const auditError = await audit(supabase, user.id, "reenviar invitación", id, { user_id: userId });
  notice(`/plataforma/${id}`, "ok", auditError ?? message);
}

export async function addMember(formData: FormData) {
  const id = clean(formData.get("businessId"));
  const { supabase, user, business } = await businessOf(id);
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    notice(`/plataforma/${id}`, "error", "Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.");
  }
  const email = clean(formData.get("email")).toLowerCase();
  const name = clean(formData.get("name"));
  const role = clean(formData.get("role"));
  if (!EMAIL.test(email)) notice(`/plataforma/${id}`, "error", "El correo no es válido.");
  if (name.length < 1 || name.length > 80) notice(`/plataforma/${id}`, "error", "El nombre debe tener entre 1 y 80 caracteres.");
  if (role !== "owner" && role !== "staff") notice(`/plataforma/${id}`, "error", "Elige dueño o empleado.");

  const admin = createAdminSupabase();
  const person = await inviteOrFind(admin, email, name, ownerWelcomeUrl(business.slug));
  if ("error" in person) notice(`/plataforma/${id}`, "error", person.error ?? "No se pudo agregar a esa persona.");

  const { error } = await supabase.from("business_members").insert({
    business_id: id,
    user_id: person.userId,
    role,
  });
  if (error) {
    if (person.created) await admin.auth.admin.deleteUser(person.userId);
    const text = error.message ?? "";
    if (text.includes("duplicate") || text.includes("business_members_pkey")) {
      notice(`/plataforma/${id}`, "error", "Esa persona ya está en el equipo.");
    }
    notice(`/plataforma/${id}`, "error", dbMessage(error, "No pude agregar a esa persona."));
  }
  const linked = person.created
    ? "Envié la invitación y la agregué al equipo."
    : "Ese correo ya tenía cuenta. Lo vinculé al equipo, sin enviar otra invitación.";
  const auditError = await audit(supabase, user.id, "agregar miembro", id, {
    user_id: person.userId,
    role,
    linked_existing: !person.created,
  });
  notice(`/plataforma/${id}`, "ok", auditError ?? linked);
}

export async function removeMember(formData: FormData) {
  const id = clean(formData.get("businessId"));
  const userId = clean(formData.get("userId"));
  const { supabase, user } = await businessOf(id);
  if (!UUID.test(userId)) notice(`/plataforma/${id}`, "error", "No encontramos a esa persona.");
  const { data, error } = await supabase
    .from("business_members")
    .delete()
    .eq("business_id", id)
    .eq("user_id", userId)
    .select("user_id");
  if (error) notice(`/plataforma/${id}`, "error", dbMessage(error, "No pude quitar a esa persona."));
  if (!data?.length) notice(`/plataforma/${id}`, "error", "Esa persona ya no estaba en el equipo.");
  const auditError = await audit(supabase, user.id, "quitar miembro", id, { user_id: userId });
  notice(`/plataforma/${id}`, "ok", auditError ?? "Quité a la persona del equipo.");
}

export async function addDomain(formData: FormData) {
  const id = clean(formData.get("businessId"));
  const { supabase, user } = await businessOf(id);
  const domain = clean(formData.get("domain")).toLowerCase();
  if (!DOMAIN.test(domain) || domain.length > 253) {
    notice(`/plataforma/${id}`, "error", "Ese dominio no tiene un formato válido.");
  }
  const { error } = await supabase.from("business_domains").insert({ business_id: id, domain, verified: false });
  if (error) notice(`/plataforma/${id}`, "error", dbMessage(error, "No se pudo agregar el dominio."));
  const auditError = await audit(supabase, user.id, "agregar dominio", id, { domain });
  notice(`/plataforma/${id}`, "ok", auditError ?? "Agregué el dominio. Falta verificarlo y darlo de alta en Vercel.");
}

export async function verifyDomain(formData: FormData) {
  const id = clean(formData.get("businessId"));
  const { supabase, user } = await businessOf(id);
  const domain = clean(formData.get("domain")).toLowerCase();
  const { data, error } = await supabase
    .from("business_domains")
    .update({ verified: true })
    .eq("business_id", id)
    .eq("domain", domain)
    .select("domain");
  if (error || !data?.length) notice(`/plataforma/${id}`, "error", dbMessage(error, "No se pudo verificar el dominio."));
  const auditError = await audit(supabase, user.id, "verificar dominio", id, { domain });
  notice(`/plataforma/${id}`, "ok", auditError ?? "Marqué el dominio como verificado.");
}

export async function removeDomain(formData: FormData) {
  const id = clean(formData.get("businessId"));
  const { supabase, user } = await businessOf(id);
  const domain = clean(formData.get("domain")).toLowerCase();
  const { data, error } = await supabase
    .from("business_domains")
    .delete()
    .eq("business_id", id)
    .eq("domain", domain)
    .select("domain");
  if (error || !data?.length) notice(`/plataforma/${id}`, "error", dbMessage(error, "No se pudo quitar el dominio."));
  const auditError = await audit(supabase, user.id, "quitar dominio", id, { domain });
  notice(`/plataforma/${id}`, "ok", auditError ?? "Quité el dominio.");
}
