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
  const { business, owner } = await requireAdmin();
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
          {(business.status === "past_due" || business.status === "suspended") && (
            <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
              {business.template === "agenda"
                ? "Hay un pago pendiente. La agenda puede dejar de recibir citas. Los datos no se borran."
                : "Hay un pago pendiente. La tienda puede dejar de recibir pedidos. Los datos no se borran."}
            </p>
          )}
          <AdminNav owner={owner} template={business.template} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </>
  );
}
