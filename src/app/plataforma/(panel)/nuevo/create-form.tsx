"use client";

import { useActionState, useState } from "react";
import { createBusiness } from "../../actions";

const field = "mt-1 w-full rounded-xl border border-brand-100 px-3 py-2 outline-brand-700";

function suggestSlug(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function CreateBusinessForm() {
  const [error, action, pending] = useActionState(createBusiness, null);
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [template, setTemplate] = useState("tienda");
  const agenda = template === "agenda";
  const today = new Date();
  today.setDate(today.getDate() + 14);
  const defaultTrial = today.toISOString().slice(0, 10);

  return (
    <form action={action} className="space-y-8">
      <section className="space-y-4 rounded-2xl bg-white p-5 ring-1 ring-black/5">
        <h2 className="text-lg font-bold text-brand-900">Negocio</h2>
        <label className="block text-sm font-semibold text-slate-700">
          Nombre
          <input
            name="name"
            required
            className={field}
            onChange={(event) => {
              if (!slugEdited) setSlug(suggestSlug(event.target.value));
            }}
          />
        </label>
        <label className="block text-sm font-semibold text-slate-700">
          Slug
          <input
            name="slug"
            required
            value={slug}
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            className={field}
            onChange={(event) => {
              setSlugEdited(true);
              setSlug(event.target.value.toLowerCase());
            }}
          />
        </label>
        <p className="text-sm text-slate-500">La dirección de prueba queda en {slug || "slug"}.localhost.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-slate-700">
            Plantilla
            <select
              name="template"
              value={template}
              className={field}
              onChange={(event) => setTemplate(event.target.value)}
            >
              <option value="tienda">Tienda</option>
              <option value="agenda">Agenda</option>
            </select>
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Plan
            <select name="plan" defaultValue="completo" className={field}>
              <option value="basico">Básico</option>
              <option value="completo">Completo</option>
            </select>
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Estado inicial
            <select name="status" defaultValue="trial" className={field}>
              <option value="trial">Prueba</option>
              <option value="active">Activo</option>
            </select>
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Fin de la prueba
            <input name="trialEnds" type="date" defaultValue={defaultTrial} className={field} />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            WhatsApp
            <input name="whatsapp" inputMode="numeric" placeholder="573001112233" className={field} />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Zona horaria
            <input name="timezone" defaultValue="America/Bogota" className={field} />
          </label>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl bg-white p-5 ring-1 ring-black/5">
        <h2 className="text-lg font-bold text-brand-900">Dueño</h2>
        <label className="block text-sm font-semibold text-slate-700">
          Nombre
          <input name="ownerName" required className={field} />
        </label>
        <label className="block text-sm font-semibold text-slate-700">
          Correo
          <input name="ownerEmail" type="email" required className={field} />
        </label>
        <p className="text-sm text-slate-500">
          Si el correo es nuevo, le llega una invitación para crear su contraseña. Si ya existe, solo queda como dueño.
        </p>
      </section>

      <section key={template} className="space-y-4 rounded-2xl bg-white p-5 ring-1 ring-black/5">
        <h2 className="text-lg font-bold text-brand-900">Ajustes iniciales</h2>
        {agenda && (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-slate-700 sm:col-span-2">
              Dirección
              <input name="address" className={field} />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Minutos entre citas
              <input name="buffer" type="number" min={0} max={180} defaultValue={0} className={field} />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Anticipación mínima (minutos)
              <input name="notice" type="number" min={0} max={10080} defaultValue={60} className={field} />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Días hacia adelante
              <input name="horizon" type="number" min={1} max={180} defaultValue={30} className={field} />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Intervalo de horarios
              <select name="slot" defaultValue="15" className={field}>
                {[5, 10, 15, 20, 30, 60].map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes} min
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Horas mínimas para cancelar
              <input name="cancelHours" type="number" min={0} max={168} defaultValue={4} className={field} />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Cita en línea
              <select name="onlineStatus" defaultValue="confirmada" className={field}>
                <option value="confirmada">Queda confirmada</option>
                <option value="pendiente">Queda pendiente</option>
              </select>
            </label>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <input name="age" type="checkbox" defaultChecked={!agenda} /> Verificar que es mayor de edad
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <input name="tobacco" type="checkbox" defaultChecked={!agenda} /> Reglas de tabaco
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <input name="delivery" type="checkbox" defaultChecked={!agenda} /> Domicilios
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <input name="hours" type="checkbox" defaultChecked /> Tiene horario
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-slate-700">
            Abre
            <input name="open" type="time" defaultValue="11:00" className={field} />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Cierra
            <input name="close" type="time" defaultValue="22:00" className={field} />
          </label>
        </div>
        <p className="text-sm text-slate-500">El mismo horario se aplica los siete días. Si quitas la casilla, no se muestra un horario.</p>
      </section>

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
      <button disabled={pending} className="rounded-xl bg-brand-700 px-5 py-3 font-bold text-white disabled:opacity-60">
        {pending ? "Creando..." : "Crear negocio e invitar al dueño"}
      </button>
    </form>
  );
}
