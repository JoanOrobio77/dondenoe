import type { Metadata } from "next";
import { WelcomePassword } from "@/components/welcome-password";

export const metadata: Metadata = {
  title: "Crea tu contraseña",
  robots: { index: false, follow: false },
};

export default function WelcomePage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16">
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand-700">Tu negocio</p>
      <h1 className="mt-2 text-3xl font-bold text-brand-900">Crea tu contraseña</h1>
      <p className="mt-2 text-sm text-slate-600">
        Con ella entras al panel de este negocio. El enlace llega al correo de la invitación.
      </p>
      <div className="mt-6">
        <WelcomePassword />
      </div>
    </main>
  );
}
