import { Suspense, type ReactNode } from "react";
import { AdminNav } from "@/components/admin-nav";
import { StoreBrand } from "@/components/store-brand";
import { requireAdmin } from "@/lib/auth";
import { signOut } from "../actions";

export default function PanelLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Suspense fallback={<p className="px-4 py-6 text-slate-500">Cargando panel...</p>}>
      <PanelShell>{children}</PanelShell>
    </Suspense>
  );
}

async function PanelShell({ children }: { children: ReactNode }) {
  const { business } = await requireAdmin();
  return (
    <>
      <header className="border-b border-black/10 bg-[#fffaf6] px-4 py-5">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <StoreBrand
                name={business.name}
                slug={business.slug}
                logoUrl={business.logoUrl}
                brandColor={business.brandColor}
                className="text-4xl"
              />
              <p className="mt-1 text-sm font-semibold text-slate-500">Panel de {business.name}</p>
            </div>
            <form action={signOut}>
              <button className="rounded-full bg-white px-4 py-2 text-sm font-semibold ring-1 ring-black/10">Salir</button>
            </form>
          </div>
          <AdminNav />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </>
  );
}
