import { Suspense } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isPlatformConsoleHost } from "@/lib/platform";
import { PlatformLoginForm } from "./login-form";

export default function PlatformLoginPage() {
  return (
    <Suspense fallback={<p className="px-4 py-8 text-slate-500">Cargando...</p>}>
      <Login />
    </Suspense>
  );
}

async function Login() {
  const headerStore = await headers();
  const host = headerStore.get("x-business-host") || headerStore.get("x-forwarded-host") || headerStore.get("host");
  if (!isPlatformConsoleHost(host)) notFound();

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16">
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand-700">Plataforma</p>
      <h1 className="mt-2 text-3xl font-bold text-brand-900">Entrar como superadmin</h1>
      <p className="mt-2 text-sm text-slate-600">Esta pantalla no es la tienda ni el panel de un negocio.</p>
      <div className="mt-6">
        <PlatformLoginForm />
      </div>
    </main>
  );
}
