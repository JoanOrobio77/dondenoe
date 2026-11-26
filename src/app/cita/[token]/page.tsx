import { Suspense } from "react";
import { cancelAppointment } from "../actions";
import { createPublicClient } from "@/lib/supabase/public";
import { formatWhen } from "@/lib/zoned-time";

const STATUS: Record<string, string> = {
  pendiente: "Pendiente",
  confirmada: "Confirmada",
  completada: "Completada",
  cancelada: "Cancelada",
  no_asistio: "No asistió",
};

export default function CancelPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  return (
    <Suspense fallback={<p className="px-4 py-8 text-slate-500">Cargando cita...</p>}>
      <Cancel params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Cancel({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  if (token === "no-encontrada") {
    return (
      <main className="mx-auto max-w-lg px-4 py-10">
        <h1 className="text-2xl font-bold">No encontramos esa cita</h1>
      </main>
    );
  }

  const { data } = await createPublicClient()
    .rpc("public_appointment_by_token", { p_token: token })
    .maybeSingle<{
      business_name: string;
      service_name: string;
      professional_name: string;
      starts_at: string;
      status: string;
      can_cancel: boolean;
      timezone: string;
    }>();

  if (!data) {
    return (
      <main className="mx-auto max-w-lg px-4 py-10">
        <h1 className="text-2xl font-bold">No encontramos esa cita</h1>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <p className="text-sm font-bold uppercase tracking-wide text-brand-700">{data.business_name}</p>
      <h1 className="mt-1 text-3xl font-bold">{data.service_name}</h1>
      <p className="mt-3 text-slate-700">
        Con {data.professional_name}. {formatWhen(data.starts_at, data.timezone)}.
      </p>
      <p className="mt-2 font-semibold">{STATUS[data.status] ?? data.status}</p>
      {query.ok === "1" && data.status === "cancelada" && (
        <p className="mt-4 rounded-xl bg-green-50 p-3 text-sm font-semibold text-green-800">La cita quedó cancelada.</p>
      )}
      {query.error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{query.error}</p>}
      {data.can_cancel && (
        <form className="mt-6" action={cancelAppointment}>
          <input type="hidden" name="token" value={token} />
          <button className="rounded-2xl bg-black px-4 py-3 font-bold text-white">Cancelar esta cita</button>
        </form>
      )}
      {!data.can_cancel && data.status !== "cancelada" && (
        <p className="mt-6 text-sm text-slate-500">Ya no se puede cancelar en línea.</p>
      )}
    </main>
  );
}
