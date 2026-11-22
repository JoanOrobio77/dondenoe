"use client";

import { useSyncExternalStore, useState } from "react";

const STORAGE_KEY = "dondenoe-adult";

function subscribe() {
  return () => {};
}

export function AgeGate() {
  const confirmedBefore = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(STORAGE_KEY) === "1",
    () => true,
  );
  const [answer, setAnswer] = useState<"adult" | "minor" | null>(null);

  if (confirmedBefore || answer === "adult") return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-900/90 p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
        <p className="text-2xl font-bold text-brand-900">DondeNoe</p>
        {answer === "minor" ? (
          <p className="mt-4 text-slate-600">
            Lo sentimos. La venta de licor y cigarrillo a menores de edad está prohibida en Colombia.
          </p>
        ) : (
          <>
            <p className="mt-4 text-lg font-semibold text-slate-800">¿Eres mayor de 18 años?</p>
            <p className="mt-1 text-sm text-slate-500">Al entregar el pedido pediremos tu documento.</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                onClick={() => setAnswer("minor")}
                className="rounded-xl border border-slate-300 py-3 font-semibold text-slate-700"
              >
                No
              </button>
              <button
                onClick={() => {
                  localStorage.setItem(STORAGE_KEY, "1");
                  setAnswer("adult");
                }}
                className="rounded-xl bg-brand-700 py-3 font-semibold text-white"
              >
                Sí, soy mayor
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
