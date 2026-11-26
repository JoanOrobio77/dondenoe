import type { Metadata } from "next";
import { Suspense } from "react";
import { AgeGate } from "@/components/age-gate";
import { AgendaBooking, type AgendaInfo } from "@/components/agenda-booking";
import { CartBar } from "@/components/cart-bar";
import { CatalogView } from "@/components/catalog-view";
import { StoreBrand } from "@/components/store-brand";
import { StoreUnavailable } from "@/components/store-unavailable";
import { getCatalog, getPromotions } from "@/lib/catalog";
import { formatCOP } from "@/lib/format";
import { formatOpeningHours } from "@/lib/hours";
import { resolveRequest } from "@/lib/store";
import { createPublicClient } from "@/lib/supabase/public";
import type { Store } from "@/lib/types";
import { whatsappLink } from "@/lib/whatsapp";

export async function generateMetadata(): Promise<Metadata> {
  const { store } = await resolveRequest();
  if (!store) return { title: "Tienda no disponible" };
  if (store.template === "agenda") {
    return {
      title: store.ordersOpen ? store.name : "Agenda temporalmente no disponible",
      description: `Reserva una cita en ${store.name}.`,
    };
  }
  if (!store.ordersOpen) return { title: "Tienda temporalmente no disponible" };
  return {
    title: `${store.name} · Licores y domicilios`,
    description: `Pide en ${store.name}. Solo mayores de 18 años cuando la tienda lo exige.`,
  };
}

export default function Home() {
  return (
    <Suspense fallback={<p className="px-4 py-8 text-slate-500">Cargando tienda...</p>}>
      <StoreHome />
    </Suspense>
  );
}

async function StoreHome() {
  const { slug, store } = await resolveRequest();
  if (!slug) {
    return (
      <StoreUnavailable
        title="Esta dirección no abre una tienda"
        detail="Entra por la dirección del negocio, por ejemplo dondenoe.tudominio.com. En este computador de pruebas usa ?negocio=dondenoe."
      />
    );
  }
  if (!store) {
    return (
      <StoreUnavailable
        title="No encontramos esta tienda"
        detail="Revisa que la dirección esté bien escrita. Si el negocio existe, pide el enlace correcto."
      />
    );
  }
  if (store.template === "agenda") {
    if (!store.ordersOpen) {
      return <StoreUnavailable title="Agenda temporalmente no disponible" detail="Vuelve a intentar más tarde." />;
    }
    return <AgendaHome store={store} />;
  }

  if (!store.ordersOpen) {
    return (
      <StoreUnavailable title="Tienda temporalmente no disponible" detail="Vuelve a intentar más tarde." />
    );
  }

  const [catalog, promotions] = await Promise.all([getCatalog(store.slug), getPromotions(store.slug)]);
  const minFee = catalog.zones.length > 0 ? Math.min(...catalog.zones.map((z) => z.fee)) : null;
  const hours = formatOpeningHours(store.openingHours);

  return (
    <>
      {store.ageVerification && (
        <AgeGate slug={store.slug} name={store.name} logoUrl={store.logoUrl} brandColor={store.brandColor} />
      )}
      <header className="relative overflow-hidden px-4 pb-7 pt-8">
        <div className="mx-auto max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand-700">Estanco a domicilio</p>
          <h1 className="mt-2">
            <StoreBrand
              name={store.name}
              slug={store.slug}
              logoUrl={store.logoUrl}
              brandColor={store.brandColor}
              className="text-6xl sm:text-7xl"
            />
          </h1>
          <p className="mt-3 max-w-sm text-lg text-slate-700">
            Licores, cervezas, hielo y combos. Armas el pedido y te lo llevamos.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-sm font-semibold">
            {store.delivery && minFee !== null && (
              <span className="rounded-full bg-black px-3 py-1.5 text-white">Domicilios desde {formatCOP(minFee)}</span>
            )}
            {store.ageVerification && (
              <span className="rounded-full px-3 py-1.5 text-white" style={{ background: store.brandColor }}>
                Solo mayores de 18
              </span>
            )}
            <span className="rounded-full bg-white px-3 py-1.5 text-brand-900 ring-1 ring-black/10">Pagas al recibir</span>
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-1.5" style={{ background: store.brandColor }} />
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-32 pt-6">
        {promotions.length > 0 && (
          <section className="mb-8 space-y-3">
            {promotions.map((promo) => (
              <article key={promo.id} className="rounded-2xl p-4 text-white" style={{ background: store.brandColor }}>
                <p className="text-xs font-bold uppercase tracking-wider text-white/80">Promoción</p>
                <h2 className="text-xl font-bold">{promo.title}</h2>
                {promo.description && <p className="mt-1 text-sm text-white/90">{promo.description}</p>}
                {promo.discountPercent ? <p className="mt-2 text-sm font-semibold">{promo.discountPercent}% de descuento</p> : null}
              </article>
            ))}
          </section>
        )}
        <CatalogView catalog={catalog} slug={store.slug} />
      </main>

      <footer className="px-4 py-6 pb-24 text-center text-xs text-slate-500">
        {store.ageVerification && (
          <>
            <p>Prohíbase el expendio de bebidas embriagantes a menores de edad. Ley 124 de 1994.</p>
            <p className="mt-1">El exceso de alcohol es perjudicial para la salud. Ley 30 de 1986.</p>
          </>
        )}
        {store.tobaccoRules && (
          <p className="mt-1">Fumar es perjudicial para la salud. Venta prohibida a menores de 18 años.</p>
        )}
        {hours && <p className="mt-3">Horario: {hours}</p>}
        {store.delivery && catalog.zones.length > 0 && (
          <p className="mt-1">
            Zonas: {catalog.zones.map((zone) => `${zone.name} ${formatCOP(zone.fee)}`).join(" · ")}
          </p>
        )}
        {store.whatsapp && (
          <p className="mt-2">
            <a
              href={whatsappLink(`Hola ${store.name}, quiero hacer un pedido.`, store.whatsapp)}
              className="font-semibold text-brand-700 underline"
            >
              Escribir por WhatsApp
            </a>
          </p>
        )}
      </footer>

      <CartBar slug={store.slug} />
    </>
  );
}

async function AgendaHome({ store }: { store: Store }) {
  const { data } = await createPublicClient().rpc("public_agenda", { p_slug: store.slug });
  const agenda = data as AgendaInfo | null;
  const hours = formatOpeningHours(store.openingHours);
  if (!agenda) {
    return <StoreUnavailable title="Agenda temporalmente no disponible" detail="Vuelve a intentar más tarde." />;
  }

  return (
    <>
      <header className="relative overflow-hidden px-4 pb-7 pt-8">
        <div className="mx-auto max-w-3xl">
          <h1>
            <StoreBrand
              name={store.name}
              slug={store.slug}
              logoUrl={store.logoUrl}
              brandColor={store.brandColor}
              className="text-6xl sm:text-7xl"
            />
          </h1>
          <p className="mt-3 max-w-sm text-lg text-slate-700">Elige el servicio, la persona y la hora.</p>
          {agenda.address && <p className="mt-3 text-sm font-semibold text-slate-600">{agenda.address}</p>}
          {hours && <p className="mt-1 text-sm text-slate-600">Horario: {hours}</p>}
          {store.whatsapp && (
            <a
              href={whatsappLink(`Hola ${store.name}, quiero una cita.`, store.whatsapp)}
              className="mt-4 inline-block rounded-full px-3 py-1.5 text-sm font-bold text-white"
              style={{ background: store.brandColor }}
            >
              Escribir por WhatsApp
            </a>
          )}
        </div>
        <div className="absolute inset-x-0 bottom-0 h-1.5" style={{ background: store.brandColor }} />
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <AgendaBooking store={store} agenda={agenda} />
      </main>
    </>
  );
}
