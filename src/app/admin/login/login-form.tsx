"use client";

import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { signIn } from "../actions";

const inputClass = "mt-1 w-full rounded-xl border border-brand-100 px-4 py-3 outline-brand-700";

export function LoginForm() {
  const [error, action, pending] = useActionState(signIn, null);
  const errorCode = useSearchParams().get("error");
  const notAdmin = errorCode === "no-admin";
  const missingStore = errorCode === "negocio";

  return (
    <form action={action} className="space-y-4">
      <label className="block text-sm font-semibold text-slate-700">
        Correo
        <input name="email" type="email" required autoComplete="email" className={inputClass} />
      </label>
      <label className="block text-sm font-semibold text-slate-700">
        Contraseña
        <input name="password" type="password" required autoComplete="current-password" className={inputClass} />
      </label>
      {(error || notAdmin || missingStore) && (
        <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">
          {error ?? (missingStore ? "No encontramos la tienda de esta dirección." : "Esta cuenta no administra este negocio.")}
        </p>
      )}
      <button disabled={pending} className="w-full rounded-xl bg-brand-700 py-3 font-bold text-white disabled:opacity-60">
        {pending ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
