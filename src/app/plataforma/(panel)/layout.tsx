import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth";
import { platformSignOut } from "../actions";

export default function PlatformPanelLayout({ children }: LayoutProps<"/plataforma">) {
  return (
    <Suspense fallback={<p className="px-4 py-6 text-slate-500">Cargando plataforma...</p>}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

async function Shell({ children }: { children: ReactNode }) {
  await requirePlatformAdmin();
  return (
    <>
      <header className="border-b border-black/10 bg-[#fffaf6] px-4 py-5">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand-700">Plataforma</p>
            <p className="text-sm font-semibold text-slate-500">Negocios</p>
          </div>
          <nav className="flex items-center gap-2">
            <Link href="/plataforma" className="rounded-full bg-white px-4 py-2 text-sm font-semibold ring-1 ring-black/10">
              Lista
            </Link>
            <Link href="/plataforma/nuevo" className="rounded-full bg-brand-700 px-4 py-2 text-sm font-bold text-white">
              Nuevo negocio
            </Link>
            <Link href="/plataforma/catalogo" className="rounded-full bg-white px-4 py-2 text-sm font-semibold ring-1 ring-black/10">
              Catálogo
            </Link>
            <form action={platformSignOut}>
              <button className="rounded-full bg-white px-4 py-2 text-sm font-semibold ring-1 ring-black/10">Salir</button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </>
  );
}
