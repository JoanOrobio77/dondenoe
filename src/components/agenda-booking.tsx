"use client";

import { useState } from "react";
import { bookAppointment, getSlots, type Slot } from "@/app/cita/actions";
import { formatCOP } from "@/lib/format";
import type { Store } from "@/lib/types";
import { addIsoDays, formatClock, formatDayLabel, formatWhen, zonedDateKey } from "@/lib/zoned-time";
import { buildAppointmentMessage, whatsappLink } from "@/lib/whatsapp";

export type AgendaService = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  duration_minutes: number | null;
};

export type AgendaProfessional = {
  id: string;
  name: string;
  photo_url: string | null;
  services: string[];
};

export type AgendaInfo = {
  address: string | null;
  max_horizon_days: number;
  cancel_notice_hours: number;
  services: AgendaService[];
  professionals: AgendaProfessional[];
};

const button = "w-full rounded-2xl bg-white px-4 py-4 text-left ring-1 ring-black/10";

export function AgendaBooking({ store, agenda }: { store: Store; agenda: AgendaInfo }) {
  const today = zonedDateKey(new Date(), store.timezone);
  const days = Array.from({ length: agenda.max_horizon_days + 1 }, (_, index) => addIsoDays(today, index));
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [professionalId, setProfessionalId] = useState<string | "cualquiera" | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [booked, setBooked] = useState<{ number: number; token: string; startsAt: string; price: number } | null>(null);

  const service = agenda.services.find((item) => item.id === serviceId) ?? null;
  const people = service
    ? agenda.professionals.filter((person) => person.services.includes(service.id))
    : [];
  const professional = people.find((person) => person.id === (slot?.professional_id ?? professionalId)) ?? null;

  async function chooseDay(nextDay: string) {
    if (!service) return;
    setDay(nextDay);
    setSlot(null);
    setError(null);
    setLoading(true);
    const result = await getSlots(service.id, professionalId === "cualquiera" ? null : professionalId, nextDay);
    setLoading(false);
    if (!result.ok) {
      setSlots([]);
      setError(result.message);
      return;
    }
    setSlots(result.slots);
  }

  async function confirm() {
    if (!service || !slot) return;
    setSaving(true);
    setError(null);
    const result = await bookAppointment({
      serviceId: service.id,
      professionalId: slot.professional_id,
      startsAt: slot.starts_at,
      name,
      phone,
      notes,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setBooked({
      number: result.booked.number,
      token: result.booked.token,
      startsAt: result.booked.startsAt,
      price: result.booked.price,
    });
  }

  if (booked && service) {
    const when = formatWhen(booked.startsAt, store.timezone);
    const who = professional?.name ?? "el equipo";
    const message = buildAppointmentMessage({
      storeName: store.name,
      number: booked.number,
      service: service.name,
      professional: who,
      when,
      price: booked.price,
      name,
      notes,
    });
    return (
      <section className="rounded-3xl bg-white p-5 ring-1 ring-black/10">
        <p className="text-sm font-bold uppercase tracking-wide text-brand-700">Cita #{booked.number}</p>
        <h2 className="mt-1 text-2xl font-bold text-brand-900">Quedó reservada</h2>
        <p className="mt-3 text-slate-700">
          {service.name} con {who}. {when}. {formatCOP(booked.price)}.
        </p>
        {store.whatsapp && (
          <a
            href={whatsappLink(message, store.whatsapp)}
            className="mt-5 block rounded-2xl bg-[#25D366] px-4 py-3 text-center font-bold text-white"
          >
            Enviar la reserva por WhatsApp
          </a>
        )}
        <a href={`/cita/${booked.token}`} className="mt-3 block text-center text-sm font-semibold text-brand-700 underline">
          Guardar el enlace para cancelar
        </a>
        <p className="mt-3 text-sm text-slate-500">
          Puedes cancelar en línea hasta {agenda.cancel_notice_hours} horas antes.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-lg font-bold text-brand-900">1. Servicio</h2>
        {agenda.services.length === 0 && <p className="mt-2 text-slate-500">Todavía no hay servicios publicados.</p>}
        <div className="mt-3 grid gap-2">
          {agenda.services.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`${button} ${serviceId === item.id ? "ring-2 ring-brand-700" : ""}`}
              onClick={() => {
                setServiceId(item.id);
                setProfessionalId(null);
                setDay(null);
                setSlot(null);
                setSlots([]);
                setError(null);
              }}
            >
              <span className="block font-bold">{item.name}</span>
              <span className="mt-1 block text-sm text-slate-600">
                {item.duration_minutes ? `${item.duration_minutes} min · ` : ""}
                {formatCOP(item.price)}
              </span>
              {item.description && <span className="mt-1 block text-sm text-slate-500">{item.description}</span>}
            </button>
          ))}
        </div>
      </section>

      {service && (
        <section>
          <h2 className="text-lg font-bold text-brand-900">2. Profesional</h2>
          {people.length === 0 && <p className="mt-2 text-slate-500">Nadie ofrece este servicio todavía.</p>}
          <div className="mt-3 grid gap-2">
            {people.length > 0 && (
              <button
                type="button"
                className={`${button} font-bold ${professionalId === "cualquiera" ? "ring-2 ring-brand-700" : ""}`}
                onClick={() => {
                  setProfessionalId("cualquiera");
                  setDay(null);
                  setSlot(null);
                  setSlots([]);
                }}
              >
                Cualquiera disponible
              </button>
            )}
            {people.map((person) => (
              <button
                key={person.id}
                type="button"
                className={`${button} font-bold ${professionalId === person.id ? "ring-2 ring-brand-700" : ""}`}
                onClick={() => {
                  setProfessionalId(person.id);
                  setDay(null);
                  setSlot(null);
                  setSlots([]);
                }}
              >
                {person.name}
              </button>
            ))}
          </div>
        </section>
      )}

      {service && professionalId && (
        <section>
          <h2 className="text-lg font-bold text-brand-900">3. Día</h2>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {days.map((value) => (
              <button
                key={value}
                type="button"
                className={`shrink-0 rounded-2xl px-3 py-3 text-sm font-bold ${
                  day === value ? "bg-black text-white" : "bg-white ring-1 ring-black/10"
                }`}
                onClick={() => chooseDay(value)}
              >
                {formatDayLabel(value, store.timezone)}
              </button>
            ))}
          </div>
        </section>
      )}

      {day && (
        <section>
          <h2 className="text-lg font-bold text-brand-900">4. Hora</h2>
          {loading && <p className="mt-2 text-slate-500">Buscando horarios...</p>}
          {!loading && slots.length === 0 && <p className="mt-2 text-slate-500">No hay horas libres ese día.</p>}
          <div className="mt-3 grid grid-cols-2 gap-2">
            {slots.map((item) => (
              <button
                key={`${item.professional_id}-${item.starts_at}`}
                type="button"
                className={`rounded-2xl px-3 py-3 text-sm font-bold ${
                  slot?.starts_at === item.starts_at && slot.professional_id === item.professional_id
                    ? "bg-black text-white"
                    : "bg-white ring-1 ring-black/10"
                }`}
                onClick={() => setSlot(item)}
              >
                {formatClock(item.starts_at, store.timezone)}
                {professionalId === "cualquiera" && <span className="mt-1 block font-semibold">{item.professional_name}</span>}
              </button>
            ))}
          </div>
        </section>
      )}

      {slot && (
        <section className="rounded-3xl bg-white p-5 ring-1 ring-black/10">
          <h2 className="text-lg font-bold text-brand-900">5. Tus datos</h2>
          <label className="mt-4 block text-sm font-semibold">
            Nombre
            <input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-xl border border-black/10 px-3 py-3" />
          </label>
          <label className="mt-3 block text-sm font-semibold">
            Celular
            <input
              value={phone}
              inputMode="numeric"
              onChange={(event) => setPhone(event.target.value)}
              className="mt-1 w-full rounded-xl border border-black/10 px-3 py-3"
            />
          </label>
          <label className="mt-3 block text-sm font-semibold">
            Notas
            <textarea
              value={notes}
              maxLength={300}
              onChange={(event) => setNotes(event.target.value)}
              className="mt-1 w-full rounded-xl border border-black/10 px-3 py-3"
            />
          </label>
          <p className="mt-2 text-sm text-slate-500">No escribas diagnósticos ni información médica.</p>
          {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
          <button
            type="button"
            disabled={saving}
            onClick={confirm}
            className="mt-4 w-full rounded-2xl px-4 py-3 font-bold text-white disabled:opacity-60"
            style={{ background: store.brandColor }}
          >
            {saving ? "Guardando..." : "Confirmar cita"}
          </button>
        </section>
      )}
      {error && !slot && <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
    </div>
  );
}
