"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";

const inputClass = "mt-1 w-full rounded-xl border border-brand-100 px-4 py-3 outline-brand-700";

export function WelcomePassword() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState<"wait" | "yes" | "no">("wait");

  useEffect(() => {
    const supabase = createBrowserSupabase();
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) setReady("yes");
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setReady("yes");
    });
    const timer = window.setTimeout(() => {
      if (active) setReady((current) => (current === "wait" ? "no" : current));
    }, 2000);
    return () => {
      active = false;
      window.clearTimeout(timer);
      data.subscription.unsubscribe();
    };
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setPending(true);
    setError(null);
    const supabase = createBrowserSupabase();
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setPending(false);
      setReady("no");
      setError("El enlace no es válido o ya se usó. Pide otro a quien administra la plataforma.");
      return;
    }
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setPending(false);
      setError("No se pudo guardar la contraseña. Pide un enlace nuevo.");
      return;
    }
    router.push("/admin");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {ready === "no" && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">
          Abre esta página desde el enlace del correo. Si ya lo usaste, pide otro.
        </p>
      )}
      <label className="block text-sm font-semibold text-slate-700">
        Contraseña
        <input
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={inputClass}
        />
      </label>
      <label className="block text-sm font-semibold text-slate-700">
        Repite la contraseña
        <input
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          className={inputClass}
        />
      </label>
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
      <button disabled={pending} className="w-full rounded-xl bg-brand-700 py-3 font-bold text-white disabled:opacity-60">
        {pending ? "Guardando..." : "Crear contraseña y entrar"}
      </button>
    </form>
  );
}
