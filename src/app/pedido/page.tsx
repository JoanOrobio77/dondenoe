import { Suspense } from "react";
import Link from "next/link";
import { CheckoutForm } from "@/components/checkout-form";
import { StoreBrand } from "@/components/store-brand";
import { StoreUnavailable } from "@/components/store-unavailable";
import { getCatalog } from "@/lib/catalog";
import { resolveRequest } from "@/lib/store";

export async function generateMetadata() {
  const { store } = await resolveRequest();
  return { title: store ? `Tu pedido · ${store.name}` : "Tu pedido" };
}

export default function OrderPage() {
  return (
    <Suspense fallback={<p className="px-4 py-8 text-slate-500">Cargando pedido...</p>}>
      <Order />
    </Suspense>
  );
}

async function Order() {
  const { slug, store } = await resolveRequest();
  if (!slug || !store) {
    return (
      <StoreUnavailable
        title="No se puede armar el pedido"
        detail="Esta tienda no está recibiendo pedidos en esta dirección."
      />
    );
  }
  if (store.template === "agenda") {
    return (
      <StoreUnavailable
        title="Este negocio trabaja con citas"
        detail="Vuelve al inicio para elegir el servicio y la hora."
      />
    );
  }
  if (!store.ordersOpen) {
    return <StoreUnavailable title="Tienda temporalmente no disponible" detail="Vuelve a intentar más tarde." />;
  }
  const { zones } = await getCatalog(store.slug);

  return (
    <>
      <header className="border-b border-black/10 bg-[#fffaf6] px-4 py-4">
        <div className="mx-auto flex max-w-xl items-center gap-4">
          <Link href="/" className="text-2xl text-black" aria-label="Volver al catálogo">
            ←
          </Link>
          <div>
            <StoreBrand
              name={store.name}
              slug={store.slug}
              logoUrl={store.logoUrl}
              brandColor={store.brandColor}
              className="text-2xl"
            />
            <h1 className="text-sm font-semibold text-slate-500">Confirmar pedido</h1>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
        <CheckoutForm
          zones={store.delivery ? zones : []}
          slug={store.slug}
          storeName={store.name}
          whatsapp={store.whatsapp}
          ageVerification={store.ageVerification}
          delivery={store.delivery}
        />
      </main>
    </>
  );
}
