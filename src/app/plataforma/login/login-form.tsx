"use client";

import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { platformSignIn } from "../actions";

const inputClass = "mt-1 w-full rounded-xl border border-brand-100 px-4 py-3 outline-brand-700";

export function PlatformLoginForm() {
  const [error, action, pending] = useActionState(platformSignIn, null);
  const denied = useSearchParams().get("error") === "no-admin";

  return (
    <form action={action} className="space-y-4">
      <label className="block text-sm font-semibold text-slate-700">
        Correo
        <input name="email" type="email" required autoComplete="username" className={inputClass} />
      </label>
      <label className="block text-sm font-semibold text-slate-700">
        Contraseña
        <input name="password" type="password" required autoComplete="current-password" className={inputClass} />
      </label>
      {(error || denied) && (
        <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">
          {error ?? "Esta cuenta no administra la plataforma."}
        </p>
      )}
      <button disabled={pending} className="w-full rounded-xl bg-brand-700 py-3 font-bold text-white disabled:opacity-60">
        {pending ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
